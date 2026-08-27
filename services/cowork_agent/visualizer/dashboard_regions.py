"""Eight-region workspace dashboard: one payload, eight visualizations.

The Dashboard is an infinite zoomable canvas holding eight regions (q1-q8,
two rows of four, left to right) — rough clusters like galaxies, each a
*different* visualization suited to its data:

    q1 Security & Setup   vault wall     tiles per secret/env/setup file
    q2 Agent Sessions     orbit rings    one ring per runtime, session beads
    q3 Tools & Logs       pulsar chart   radial bars per tool + log slabs
    q4 Git History        heat lanes     commit-day cells per repository
    q5 Quirq              watcher core   concentric freshness rings
    q6 Agent Workspaces   branch forks   worktrees off repo trunks + tasks
    q7 Projects           cluster galaxy the classic purpose-environment map
    q8 XO Data            treemap tiles  .xo files sized by bytes

Unlike space.json this is not a node/edge graph: the payload is
``{"schema": 2, "meta": ..., "regions": [...]}`` where each region carries
``kind``-specific data the renderer for that visualization understands.

The builder is read-only and lists *names, paths, sizes and dates only*. It
never reads the contents of anything it classifies as a secret — a leaf for
``.env`` is the fact that the file exists, nothing more.
"""

from __future__ import annotations

import time
from datetime import date, datetime, timedelta
from pathlib import Path

from services.cowork_agent.project_layout import xo_projects_root
from services.cowork_agent.visualizer.categorized_graph import (
    build_categorized_graph,
)
from services.cowork_agent.visualizer.reader import read_json
from services.cowork_agent.visualizer.space_index import build_space_data


REGIONS = ("q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8")

_LABELS = {
    "q1": "Security & Setup",
    "q2": "Agent Sessions",
    "q3": "Tools & Logs",
    "q4": "Git History",
    "q5": "Quirq",
    "q6": "Agent Workspaces",
    "q7": "Projects",
    "q8": "XO Data",
}
_KINDS = {
    "q1": "vault",
    "q2": "orbits",
    "q3": "pulsar",
    "q4": "heatlanes",
    "q5": "watcher",
    "q6": "forks",
    "q7": "galaxy",
    "q8": "treemap",
}
# Validated as a categorical set for the dark surface (dataviz skill,
# OKLCH L 0.48-0.67, chroma >= 0.10, adjacent-pair CVD dE >= 8): renderers
# derive brighter glow tints from these, but identity lives here.
_COLORS = {
    "q1": "#e04a6e",
    "q2": "#a85ce8",
    "q3": "#c9761a",
    "q4": "#3987e5",
    "q5": "#71a00c",
    "q6": "#189aab",
    "q7": "#d95d2a",
    "q8": "#7a7df0",
}
_DESCRIPTIONS = {
    "q1": "Secrets, env files, credentials, and setup surfaces — names only, never contents.",
    "q2": "Session archives from .claude, .cursor, and project .xo/sessions.",
    "q3": "External tool calls and system logs across runtimes.",
    "q4": "Commit history per repository; agent worktrees excluded.",
    "q5": "The machine-local .quirq watcher state.",
    "q6": "Git worktrees and other agentic working state.",
    "q7": "The workspace's projects, gathered into purpose environments.",
    "q8": "Portable .xo output the watcher maintains, workspace and per-project.",
}

_SKIP_DIRS = {
    ".git",
    ".next",
    ".venv",
    "__pycache__",
    "build",
    "dist",
    "node_modules",
    "venv",
}

_SECRET_TOKENS = ("secret", "credential", "apikey", "api-key", "api_key", "token")
_SECRET_SUFFIXES = {".pem", ".p12", ".keystore"}
_SETUP_NAMES = {"dockerfile", "makefile", "install.sh", "setup.sh", "setup.py"}
_CONFIG_SUFFIXES = {".ini", ".json", ".toml", ".yaml", ".yml"}

_HEAT_DAYS = 112  # 16 weeks of history in the q4 lanes


def _mtime_date(path: Path) -> str | None:
    try:
        return date.fromtimestamp(path.stat().st_mtime).isoformat()
    except OSError:
        return None


def _size_of(path: Path) -> int:
    try:
        return path.stat().st_size
    except OSError:
        return 0


def _size_label(size: int) -> str:
    if size >= 1 << 20:
        return f"{size / (1 << 20):.1f} MB"
    if size >= 1 << 10:
        return f"{size / (1 << 10):.0f} KB"
    return f"{size} B"


def _list_project_dirs(projects_root: Path) -> list[Path]:
    try:
        return sorted(
            entry
            for entry in projects_root.iterdir()
            if entry.is_dir() and not entry.name.startswith(".")
        )
    except OSError:
        return []


def _walk(base: Path, max_depth: int):
    """Bounded, prune-aware walk yielding files under ``base``."""
    if not base.is_dir():
        return
    stack = [(base, 0)]
    while stack:
        folder, depth = stack.pop()
        try:
            entries = sorted(folder.iterdir())
        except OSError:
            continue
        for entry in entries:
            if entry.is_dir():
                if entry.name in _SKIP_DIRS:
                    continue
                if depth + 1 <= max_depth:
                    stack.append((entry, depth + 1))
            elif entry.is_file():
                yield entry


# ── q1: vault wall ───────────────────────────────────────────────────────────


def _is_secretish(name: str) -> bool:
    lowered = name.lower()
    if lowered.startswith(".env") or lowered.endswith(".env"):
        return True
    if Path(lowered).suffix in _SECRET_SUFFIXES:
        return True
    if lowered.startswith("id_rsa") or lowered == ".netrc":
        return True
    return any(token in lowered for token in _SECRET_TOKENS)


def _vault_data(projects_root: Path) -> dict:
    projects = []
    total = 0
    secret_total = 0
    for project in _list_project_dirs(projects_root):
        tiles = []
        for file in _walk(project, max_depth=2):
            name = file.name
            lowered = name.lower()
            relative = str(file.relative_to(project))
            if _is_secretish(name):
                kind = "secret"
            elif (
                lowered in _SETUP_NAMES
                or lowered.startswith("docker-compose")
                or lowered.startswith("compose.")
                or (file.parent == project and lowered.endswith(".sh"))
            ):
                kind = "setup"
            elif (
                "config" in (part.lower() for part in file.relative_to(project).parts[:-1])
                and file.suffix.lower() in _CONFIG_SUFFIXES
            ):
                kind = "config"
            else:
                continue
            if len(tiles) >= 24:
                continue
            tiles.append(
                {
                    "name": name,
                    "kind": kind,
                    "path": f"{project.name}/{relative}",
                    "date": _mtime_date(file),
                }
            )
        if tiles:
            tiles.sort(key=lambda tile: ("secret", "setup", "config").index(tile["kind"]))
            secret_total += sum(1 for tile in tiles if tile["kind"] == "secret")
            total += len(tiles)
            projects.append({"name": project.name, "tiles": tiles})
    return {
        "data": {"projects": projects},
        "stat": f"{total} files · {secret_total} secret-like",
        "count": total,
    }


# ── q2: orbit rings ──────────────────────────────────────────────────────────


def _ring_items(base: Path, *, cap: int) -> list[dict]:
    items = []
    if not base.is_dir():
        return items
    try:
        entries = sorted(base.iterdir(), key=lambda p: p.name)
    except OSError:
        return items
    for entry in entries[:cap]:
        count = 0
        if entry.is_dir():
            try:
                count = sum(1 for item in entry.iterdir() if item.is_file())
            except OSError:
                count = 0
        items.append(
            {"name": entry.name, "count": count, "date": _mtime_date(entry)}
        )
    return items


def _orbits_data(projects_root: Path, home: Path) -> dict:
    rings = [
        {
            "id": "claude",
            "label": ".claude",
            "items": _ring_items(home / ".claude" / "projects", cap=18),
        },
        {
            "id": "cursor",
            "label": ".cursor",
            "items": _ring_items(home / ".cursor" / "projects", cap=18),
        },
    ]
    project_items = []
    for project in _list_project_dirs(projects_root):
        sessions = project / ".xo" / "sessions"
        if not sessions.is_dir():
            continue
        try:
            count = sum(1 for item in sessions.iterdir())
        except OSError:
            count = 0
        project_items.append(
            {"name": project.name, "count": count, "date": _mtime_date(sessions)}
        )
    rings.append({"id": "projects", "label": "project .xo", "items": project_items})
    total = sum(len(ring["items"]) for ring in rings)
    return {
        "data": {"rings": rings},
        "stat": f"{total} session archives",
        "count": total,
    }


# ── q3: pulsar chart ─────────────────────────────────────────────────────────


def _pulsar_data(workspace_xo: Path, home: Path) -> dict:
    telemetry = read_json(workspace_xo / "sessions.json") or {}
    totals: dict[tuple[str, str], dict] = {}
    for row in telemetry.get("daily_tools") or []:
        if not isinstance(row, dict):
            continue
        key = (str(row.get("agent") or ""), str(row.get("name") or ""))
        if not key[1]:
            continue
        bucket = totals.setdefault(key, {"calls": 0, "errors": 0, "day": None})
        bucket["calls"] += int(row.get("calls") or 0)
        bucket["errors"] += int(row.get("errors") or 0)
        day = str(row.get("day") or "") or None
        if day and (bucket["day"] is None or day > bucket["day"]):
            bucket["day"] = day

    tools = [
        {
            "name": name,
            "agent": agent,
            "calls": stat["calls"],
            "errors": stat["errors"],
            "day": stat["day"],
        }
        for (agent, name), stat in sorted(
            totals.items(), key=lambda item: -item[1]["calls"]
        )[:22]
    ]

    logs = []
    argus = home / ".argus"
    if argus.is_dir():
        try:
            entries = sorted(argus.iterdir())
        except OSError:
            entries = []
        for entry in entries[:10]:
            if not entry.is_file():
                continue
            size = _size_of(entry)
            logs.append(
                {
                    "name": entry.name,
                    "size": size,
                    "sizeLabel": _size_label(size),
                    "date": _mtime_date(entry),
                }
            )
    total_calls = sum(tool["calls"] for tool in tools)
    return {
        "data": {"tools": tools, "logs": logs},
        "stat": f"{total_calls} tool calls · {len(logs)} log files",
        "count": len(tools) + len(logs),
    }


# ── q4: heat lanes ───────────────────────────────────────────────────────────


def _heatlanes_data(projects_root: Path, git_history: dict) -> dict:
    end = date.today()
    start = end - timedelta(days=_HEAT_DAYS - 1)
    repos = []
    commit_total = 0
    for project in _list_project_dirs(projects_root):
        # A checkout has a .git *directory*; an agent worktree has a .git
        # *file* pointing home — those belong to q6, not the history lanes.
        if not (project / ".git").is_dir():
            continue
        days = [
            {
                "d": str(day.get("d") or ""),
                "n": int(day.get("n") or 0),
                "s": [str(s) for s in (day.get("s") or [])[:3]],
            }
            for day in git_history.get(f"p_{project.name}") or []
            if str(day.get("d") or "") >= start.isoformat()
        ]
        total = sum(day["n"] for day in days)
        commit_total += total
        repos.append({"name": project.name, "total": total, "days": days})
    repos.sort(key=lambda repo: -repo["total"])
    return {
        "data": {
            "repos": repos,
            "start": start.isoformat(),
            "end": end.isoformat(),
        },
        "stat": f"{len(repos)} repos · {commit_total} commits in {_HEAT_DAYS // 7} weeks",
        "count": len(repos),
    }


# ── q5: watcher core ─────────────────────────────────────────────────────────


def _watcher_data(home: Path) -> dict:
    quirq = home / ".quirq"
    files = []
    newest_age = None
    now = time.time()
    for file in _walk(quirq, max_depth=2):
        if len(files) >= 24:
            break
        try:
            age = max(0, int(now - file.stat().st_mtime))
        except OSError:
            age = None
        if age is not None and (newest_age is None or age < newest_age):
            newest_age = age
        size = _size_of(file)
        files.append(
            {
                "name": file.name,
                "path": f".quirq/{file.relative_to(quirq)}",
                "group": "state" if file.parent == quirq else "watcher",
                "sizeLabel": _size_label(size),
                "date": _mtime_date(file),
                "ageSec": age,
            }
        )
    return {
        "data": {"files": files, "newestAgeSec": newest_age},
        "stat": (
            f"{len(files)} files · fresh {newest_age}s ago"
            if newest_age is not None
            else f"{len(files)} files"
        ),
        "count": len(files),
    }


# ── q6: branch forks ─────────────────────────────────────────────────────────


def _forks_data(projects_root: Path, home: Path) -> dict:
    worktrees_by_repo: dict[str, list[dict]] = {}
    loose: list[dict] = []
    stack = [(projects_root, 0)]
    while stack:
        folder, depth = stack.pop()
        try:
            entries = sorted(folder.iterdir())
        except OSError:
            continue
        for entry in entries:
            if not entry.is_dir() or entry.name in _SKIP_DIRS:
                continue
            if (entry / ".git").is_file():  # the worktree marker
                relative = str(entry.relative_to(projects_root))
                record = {
                    "name": entry.name,
                    "path": relative,
                    "date": _mtime_date(entry),
                }
                # `<repo>-wt`, `<repo>/worktrees/x` — attach to the repo
                # whose name prefixes the worktree path, else keep loose.
                owner = next(
                    (
                        repo.name
                        for repo in _list_project_dirs(projects_root)
                        if (repo / ".git").is_dir()
                        and relative.startswith(repo.name)
                    ),
                    None,
                )
                if owner:
                    worktrees_by_repo.setdefault(owner, []).append(record)
                else:
                    loose.append(record)
            elif depth + 1 <= 2:
                stack.append((entry, depth + 1))

    repos = [
        {"name": project.name, "worktrees": worktrees_by_repo.get(project.name, [])}
        for project in _list_project_dirs(projects_root)
        if (project / ".git").is_dir()
    ]
    if loose:
        repos.append({"name": "(unattached)", "worktrees": loose})

    tasks = []
    tasks_dir = home / ".claude" / "tasks"
    if tasks_dir.is_dir():
        try:
            entries = sorted(tasks_dir.iterdir(), key=lambda p: p.name)
        except OSError:
            entries = []
        for entry in entries[:12]:
            tasks.append({"name": entry.name, "date": _mtime_date(entry)})

    worktree_total = sum(len(repo["worktrees"]) for repo in repos)
    return {
        "data": {"repos": repos, "tasks": tasks},
        "stat": f"{worktree_total} worktrees · {len(tasks)} agent tasks",
        "count": worktree_total + len(tasks),
    }


# ── q7: cluster galaxy (the classic dashboard, distilled) ────────────────────


def _galaxy_data(source: dict) -> dict:
    classic = build_categorized_graph(source=source)
    environments = [
        {
            "id": hub["id"],
            "label": hub["label"],
            "color": classic["categories"][hub["cat"]]["color"],
            "count": 0,
        }
        for hub in classic["hubs"]
    ]
    by_id = {environment["id"]: environment for environment in environments}
    projects = []
    for leaf in classic["leaves"]:
        memberships = [m for m in leaf.get("clusters") or [] if m in by_id]
        if not memberships:
            memberships = [leaf["group"][2:]] if leaf["group"][2:] in by_id else []
        for membership in memberships:
            by_id[membership]["count"] += 1
        projects.append(
            {
                "id": leaf["id"],
                "label": leaf["label"],
                "shape": leaf["shape"],
                "tag": leaf["tag"],
                "blurb": leaf["blurb"],
                "date": leaf["date"],
                "memberships": memberships,
            }
        )
    return {
        "data": {"environments": environments, "projects": projects},
        "stat": f"{len(projects)} projects · {len(environments)} environments",
        "count": len(projects),
    }


# ── q8: treemap tiles ────────────────────────────────────────────────────────


def _xo_file_entries(folder: Path, cap: int) -> list[dict]:
    entries = []
    if not folder.is_dir():
        return entries
    try:
        listed = sorted(folder.iterdir())
    except OSError:
        return entries
    for entry in listed[:cap]:
        size = _size_of(entry) if entry.is_file() else 0
        entries.append(
            {
                "name": entry.name,
                "dir": entry.is_dir(),
                "size": size,
                "sizeLabel": _size_label(size) if entry.is_file() else "directory",
                "date": _mtime_date(entry),
            }
        )
    return entries


def _treemap_data(projects_root: Path, workspace_xo: Path) -> dict:
    groups = []
    total = 0
    workspace_files = _xo_file_entries(workspace_xo, cap=16)
    if workspace_files:
        total += len(workspace_files)
        groups.append(
            {"label": "workspace", "project": None, "files": workspace_files}
        )
    for project in _list_project_dirs(projects_root):
        files = _xo_file_entries(project / ".xo", cap=10)
        if not files:
            continue
        total += len(files)
        groups.append(
            {"label": project.name, "project": project.name, "files": files}
        )
    return {
        "data": {"groups": groups},
        "stat": f"{total} files in {len(groups)} .xo trees",
        "count": total,
    }


# ── assembly ─────────────────────────────────────────────────────────────────


def build_dashboard_regions(
    source: dict | None = None,
    *,
    projects_root: Path | None = None,
    home: Path | None = None,
) -> dict:
    """Build the eight-region dashboard payload (schema 2)."""
    if source is None:
        source = build_space_data()
    projects_root = projects_root or xo_projects_root()
    home = home or Path.home()
    workspace_xo = projects_root / ".xo"

    built = {
        "q1": _vault_data(projects_root),
        "q2": _orbits_data(projects_root, home),
        "q3": _pulsar_data(workspace_xo, home),
        "q4": _heatlanes_data(projects_root, source.get("gitHistory") or {}),
        "q5": _watcher_data(home),
        "q6": _forks_data(projects_root, home),
        "q7": _galaxy_data(source),
        "q8": _treemap_data(projects_root, workspace_xo),
    }

    regions = [
        {
            "id": region,
            "kind": _KINDS[region],
            "label": _LABELS[region],
            "color": _COLORS[region],
            "blurb": _DESCRIPTIONS[region],
            "stat": built[region]["stat"],
            "count": built[region]["count"],
            "data": built[region]["data"],
        }
        for region in REGIONS
    ]

    return {
        "schema": 2,
        "meta": {
            "title": "Dashboard",
            "tagline": "the workspace in eight regions",
            "mappedOn": date.today().strftime("%d %B %Y"),
            "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
            "workspace": (source.get("meta") or {}).get("workspace"),
        },
        "regions": regions,
    }
