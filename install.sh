#!/usr/bin/env bash

set -Eeuo pipefail

IMAGE="${QUIRQ_IMAGE:-ghcr.io/sharmasuraj0123/xo-cowork-api:latest}"
SOURCE_REF="${QUIRQ_SOURCE_REF:-main}"
SOURCE_ARCHIVE="https://github.com/sharmasuraj0123/xo-cowork-api/archive/refs/heads/${SOURCE_REF}.tar.gz"
CONTAINER_NAME="${QUIRQ_CONTAINER_NAME:-quirq}"
APP_URL="http://localhost:5003/space/"
MANAGED_LABEL="io.quirq.managed"
HEALTH_TIMEOUT="${QUIRQ_HEALTH_TIMEOUT:-90}"
TEMP_DIR=""
RUNTIME_VOLUME_ARGS=()

fail() {
    printf '\nQuirq: %s\n' "$*" >&2
    exit 1
}

cleanup() {
    if [ -n "$TEMP_DIR" ] && [ -d "$TEMP_DIR" ]; then
        rm -rf "$TEMP_DIR"
    fi
}
trap cleanup EXIT

require_command() {
    command -v "$1" >/dev/null 2>&1 || fail "$2"
}

existing_container_id() {
    docker ps --all --quiet --filter "name=^/${CONTAINER_NAME}$"
}

legacy_container_id() {
    docker ps \
        --all \
        --quiet \
        --filter "label=com.docker.compose.project=quirq-local" \
        --filter "label=com.docker.compose.service=api"
}

mounted_host_path() {
    local container_id="$1"
    local destination="$2"

    [ -n "$container_id" ] || return 0
    docker inspect \
        --format "{{range .Mounts}}{{if eq .Destination \"${destination}\"}}{{.Source}}{{end}}{{end}}" \
        "$container_id" 2>/dev/null || true
}

assert_container_is_managed() {
    local container_id="$1"
    local managed

    [ -n "$container_id" ] || return 0

    managed="$(
        docker inspect \
            --format "{{ index .Config.Labels \"${MANAGED_LABEL}\" }}" \
            "$container_id" 2>/dev/null || true
    )"
    [ "$managed" = "true" ] || fail \
        "A container named '${CONTAINER_NAME}' already exists and was not created by Quirq."
}

build_fallback_image() {
    local fallback_image="quirq-local:installer"

    require_command curl "curl is required to download the Quirq release."
    require_command tar "tar is required to unpack the Quirq release."

    TEMP_DIR="$(mktemp -d)"
    printf 'The published image is not available yet; building the same release locally.\n'
    curl --fail --silent --show-error --location "$SOURCE_ARCHIVE" |
        tar --extract --gzip --directory "$TEMP_DIR" --strip-components=1
    docker build --tag "$fallback_image" "$TEMP_DIR"
    IMAGE="$fallback_image"
}

prepare_image() {
    if [ "${QUIRQ_USE_LOCAL_IMAGE:-0}" = "1" ]; then
        docker image inspect "$IMAGE" >/dev/null 2>&1 ||
            fail "Local image '$IMAGE' does not exist."
        return
    fi

    printf 'Downloading Quirq...\n'
    if ! docker pull "$IMAGE"; then
        build_fallback_image
    fi
}

prepare_runtime_mounts() {
    local user_home="$1"
    local mount_rows
    local relative_path
    local container_path
    local host_path
    local mount_required

    mount_rows="$(
        docker run \
            --rm \
            --env "HOME=/root" \
            --env "PYTHONWARNINGS=ignore" \
            "$IMAGE" \
            python -m scripts.list_runtime_mounts
    )" || fail "Could not discover the image's runtime data directories."

    while IFS=$'\t' read -r relative_path container_path mount_required; do
        [ -n "$relative_path" ] || continue
        case "$relative_path" in
            /*|*../*|../*|..)
                fail "Image returned an unsafe runtime mount: ${relative_path}"
                ;;
        esac
        case "$container_path" in
            /root/*) ;;
            *) fail "Image returned a runtime mount outside /root: ${container_path}" ;;
        esac
        host_path="${user_home}/${relative_path}"
        if [ "${mount_required:-1}" = "0" ] && [ ! -d "$host_path" ]; then
            continue
        fi
        if [ "${mount_required:-1}" = "0" ]; then
            RUNTIME_VOLUME_ARGS+=(--volume "${host_path}:${container_path}:ro")
            continue
        fi
        mkdir -p "$host_path"
        RUNTIME_VOLUME_ARGS+=(--volume "${host_path}:${container_path}")
    done <<< "$mount_rows"
}

saved_root_from_file() {
    local state_root="$1"
    local key="$2"
    local line
    local found=""
    local config_file="${state_root}/roots.env"

    [ -f "$config_file" ] || return 0
    while IFS= read -r line || [ -n "$line" ]; do
        case "$line" in
            "${key}="*)
                found="${line#*=}"
                ;;
        esac
    done < "$config_file"
    printf '%s' "$found"
}

validate_host_root() {
    local label="$1"
    local path="$2"

    case "$path" in
        /*) ;;
        *) fail "${label} must be an absolute host path: ${path}" ;;
    esac
    [ "$path" != "/" ] || fail "${label} cannot be the filesystem root."
}

validate_separate_roots() {
    local projects_root="$1"
    local state_root="$2"

    case "${state_root}/" in
        "${projects_root}/"*) fail "Quirq root cannot be inside XO root." ;;
    esac
    case "${projects_root}/" in
        "${state_root}/"*) fail "XO root cannot be inside Quirq root." ;;
    esac
}

prepare_state_root() {
    local previous_state_root="$1"
    local state_root="$2"

    mkdir -p "$state_root"
    if [ -z "$previous_state_root" ] || [ "$previous_state_root" = "$state_root" ]; then
        return
    fi
    [ -d "$previous_state_root" ] || return
    if [ -z "$(find "$state_root" -mindepth 1 -maxdepth 1 -print -quit)" ]; then
        printf 'Copying existing Quirq state to %s...\n' "$state_root"
        cp -R -p "$previous_state_root/." "$state_root/"
    else
        printf 'Using existing Quirq state at %s (no files were merged).\n' "$state_root"
    fi
}

start_container() {
    local projects_root="$1"
    local state_root="$2"
    local existing_id="$3"
    local legacy_id="$4"

    if [ -n "$existing_id" ]; then
        printf 'Updating the existing Quirq container...\n'
        docker rm --force "$existing_id" >/dev/null
    fi
    if [ -n "$legacy_id" ]; then
        printf 'Migrating the previous local Quirq container...\n'
        docker rm --force "$legacy_id" >/dev/null
    fi

    docker run \
        --detach \
        --name "$CONTAINER_NAME" \
        --restart unless-stopped \
        --init \
        --publish "127.0.0.1:5003:5002" \
        --env "HOST=0.0.0.0" \
        --env "PORT=5002" \
        --env "STAGE=local" \
        --env "UVICORN_RELOAD=false" \
        --env "STARTUP_WARMUP_URL=http://127.0.0.1:5002" \
        --env "XO_PROJECTS_ROOT=/workspace/xo-projects" \
        --env "AI_WORKSPACE_ROOT=/workspace/xo-projects" \
        --env "QUIRQ_STATE_ROOT=/root/.quirq" \
        --env "QUIRQ_RUNTIME_FILE=/root/.quirq/runtime.env" \
        --env "QUIRQ_SECRETS_FILE=/root/.quirq/secrets.env" \
        --env "QUIRQ_WATCHER_SOURCE_MODE=all" \
        --env "QUIRQ_HOST_HOME=${HOME}" \
        --env "QUIRQ_HOST_PROJECTS_ROOT=${projects_root}" \
        --env "QUIRQ_HOST_STATE_ROOT=${state_root}" \
        --env "QUIRQ_PUBLIC_URL=http://localhost:5003" \
        --env "QUIRQ_MANAGED_CONTAINER=true" \
        --env "QUIRQ_ALLOW_SELF_RESTART=true" \
        --volume "${projects_root}:/workspace/xo-projects" \
        --volume "${state_root}:/root/.quirq" \
        "${RUNTIME_VOLUME_ARGS[@]}" \
        --add-host "host.docker.internal:host-gateway" \
        --label "${MANAGED_LABEL}=true" \
        "$IMAGE" >/dev/null
}

wait_until_healthy() {
    local container_id
    local status
    local attempt

    container_id="$(existing_container_id)"
    [ -n "$container_id" ] || fail "Docker did not create the Quirq container."

    for attempt in $(seq 1 "$HEALTH_TIMEOUT"); do
        status="$(
            docker inspect \
                --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
                "$container_id" 2>/dev/null || true
        )"

        case "$status" in
            healthy)
                printf '\nQuirq is ready: %s\n' "$APP_URL"
                return 0
                ;;
            unhealthy|exited|dead)
                docker logs --tail 50 "$container_id" >&2 || true
                fail "The Quirq container became ${status}."
                ;;
        esac

        sleep 1
    done

    docker logs --tail 50 "$container_id" >&2 || true
    fail "Quirq did not become healthy within ${HEALTH_TIMEOUT} seconds."
}

main() {
    local user_home="${HOME:-}"
    local projects_root
    local state_root
    local existing_id
    local legacy_id
    local previous_projects_root
    local previous_state_root
    local root_preferences_dir
    local saved_projects_root
    local saved_state_root

    [ -n "$user_home" ] || fail "HOME must be set."

    require_command docker "Docker is not installed. Install and start Docker, then run this command again."
    docker info >/dev/null 2>&1 ||
        fail "Docker is not running. Start Docker, then run this command again."

    existing_id="$(existing_container_id)"
    legacy_id="$(legacy_container_id)"
    assert_container_is_managed "$existing_id"
    if [ -n "$existing_id" ] && [ "$legacy_id" = "$existing_id" ]; then
        legacy_id=""
    fi
    previous_projects_root="$(
        mounted_host_path "${existing_id:-$legacy_id}" "/workspace/xo-projects"
    )"
    previous_state_root="$(
        mounted_host_path "${existing_id:-$legacy_id}" "/root/.quirq"
    )"
    root_preferences_dir="${previous_state_root:-${user_home}/.quirq}"
    saved_projects_root="$(saved_root_from_file "$root_preferences_dir" "XO_PROJECTS_ROOT")"
    saved_state_root="$(saved_root_from_file "$root_preferences_dir" "QUIRQ_STATE_ROOT")"
    projects_root="${XO_PROJECTS_ROOT:-${saved_projects_root:-${previous_projects_root:-${user_home}/xo-projects}}}"
    state_root="${QUIRQ_STATE_ROOT:-${saved_state_root:-${previous_state_root:-${user_home}/.quirq}}}"
    validate_host_root "XO root" "$projects_root"
    validate_host_root "Quirq root" "$state_root"
    validate_separate_roots "$projects_root" "$state_root"

    prepare_image
    prepare_runtime_mounts "$user_home"
    mkdir -p "$projects_root"
    prepare_state_root "$previous_state_root" "$state_root"
    start_container "$projects_root" "$state_root" "$existing_id" "$legacy_id"
    wait_until_healthy
}

main "$@"
