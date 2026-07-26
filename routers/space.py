"""Space: the local workspace knowledge graph.

Serves the Space folder (graph UI + its data/space.json) as static files under
/space, plus a tiny control API the UI uses for its server on/off widget.

The folder location comes from SPACE_DIR (env), defaulting to the xo-atlas
folder in the ClaudeWorkspace. Data never leaves this machine: the UI reads
data/space.json from this mount. See <SPACE_DIR>/README.md for the format.
"""

import asyncio
import os
import signal
import time
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from services.cowork_agent.visualizer.categorized_graph import (
    build_categorized_graph,
)
from services.cowork_agent.visualizer.session_telemetry import (
    build_session_telemetry,
)
from services.cowork_agent.visualizer.space_index import build_space_data

# Bundled UI (space_ui/ at the repo root); SPACE_DIR env var overrides, e.g.
# to point at a live xo-atlas checkout during UI development.
DEFAULT_SPACE_DIR = str(Path(__file__).resolve().parent.parent / "space_ui")
SPACE_DIR = Path(os.getenv("SPACE_DIR", DEFAULT_SPACE_DIR)).expanduser()

router = APIRouter(prefix="/space", tags=["space"])


def _is_local(request: Request) -> bool:
    host = request.client.host if request.client else ""
    return host in ("127.0.0.1", "::1", "localhost")


@router.get("/server/status")
async def space_server_status():
    """Lightweight status for the Space UI widget (also see /health)."""
    return {
        "status": "on",
        "pid": os.getpid(),
        "space_dir": str(SPACE_DIR),
        "space_dir_exists": SPACE_DIR.exists(),
    }


@router.post("/server/stop")
async def space_server_stop(request: Request):
    """Gracefully stop the server. Localhost only; restart via ./cowork-api.sh start."""
    if not _is_local(request):
        raise HTTPException(status_code=403, detail="stop is allowed from localhost only")

    async def _terminate_soon():
        await asyncio.sleep(0.4)
        os.kill(os.getpid(), signal.SIGTERM)

    asyncio.get_running_loop().create_task(_terminate_soon())
    return {"status": "stopping", "restart": "./cowork-api.sh start"}


SPACE_CACHE_TTL = float(os.getenv("SPACE_CACHE_TTL", "30"))

# (built_at_monotonic, payload) — module-level; refreshed when older than TTL.
_data_cache: tuple[float, dict] | None = None


@router.get("/data/space.json")
async def space_data():
    """The Space graph, generated live from ~/xo-projects.

    Registered before the static mount (see server.py include order), so it
    shadows <SPACE_DIR>/data/space.json. Falls back to that file when the
    builder fails; 503 when there is no fallback either."""
    global _data_cache
    now = time.monotonic()
    if _data_cache is not None and now - _data_cache[0] < SPACE_CACHE_TTL:
        return JSONResponse(_data_cache[1], headers={"Cache-Control": "no-store"})

    try:
        data = build_space_data()
    except Exception as exc:
        print(f"⚠️ space_index failed ({exc}); falling back to static space.json")
        static = SPACE_DIR / "data" / "space.json"
        if static.is_file():
            return FileResponse(static, media_type="application/json",
                                headers={"Cache-Control": "no-store"})
        raise HTTPException(
            status_code=503,
            detail={"code": "projects_root_unavailable",
                    "message": "Could not build the graph and no static fallback exists."},
        )

    _data_cache = (now, data)
    return JSONResponse(data, headers={"Cache-Control": "no-store"})


# Categorized Dashboard graph. It has the same schema as space.json, so the
# browser reuses the atlas renderer instead of maintaining a second graph UI.
_dashboard_cache: tuple[float, dict] | None = None


@router.get("/data/dashboard.json")
async def dashboard_data():
    """XO projects collapsed into five purpose categories."""
    global _dashboard_cache
    now = time.monotonic()
    if (
        _dashboard_cache is not None
        and now - _dashboard_cache[0] < SPACE_CACHE_TTL
    ):
        return JSONResponse(
            _dashboard_cache[1], headers={"Cache-Control": "no-store"}
        )

    try:
        data = await asyncio.to_thread(build_categorized_graph)
    except Exception as exc:
        print(f"⚠️ categorized graph failed ({exc})")
        raise HTTPException(
            status_code=503,
            detail={
                "code": "categorized_graph_unavailable",
                "message": "Could not build the categorized project graph.",
            },
        )

    _dashboard_cache = (now, data)
    return JSONResponse(data, headers={"Cache-Control": "no-store"})


# Session telemetry — second Space dataset. Same TTL, separate cache slot.
_argus_cache: tuple[float, dict] | None = None


@router.get("/data/sessions.json")
async def sessions_data():
    """All locally available session telemetry for the Sessions tab.

    Providers fail independently: one readable source still yields a useful
    response with source-status metadata. No static fallback: a truthful 503
    when every provider is unavailable beats stale data."""
    global _argus_cache
    now = time.monotonic()
    if _argus_cache is not None and now - _argus_cache[0] < SPACE_CACHE_TTL:
        return JSONResponse(_argus_cache[1], headers={"Cache-Control": "no-store"})

    try:
        data = await asyncio.to_thread(build_session_telemetry)
    except Exception as exc:
        print(f"⚠️ session telemetry failed ({exc})")
        raise HTTPException(
            status_code=503,
            detail={
                "code": "session_telemetry_unavailable",
                "message": "No session telemetry source is currently available.",
            },
        )
    _argus_cache = (now, data)
    return JSONResponse(data, headers={"Cache-Control": "no-store"})


# Aggregate telemetry never contains prompt text. Session details request one
# transcript lazily through its provider's optional capability.
_session_prompts_cache: dict[tuple[str, str], tuple[float, dict]] = {}
_SESSION_PROMPTS_CACHE_MAX = 32


@router.get("/data/session_prompts.json")
async def session_prompts_data(agent: str, sid: str):
    """Return user prompts for one session, grouped into human turns."""
    from services.cowork_agent.adapters.loader import try_load_capability

    now = time.monotonic()
    hit = _session_prompts_cache.get((agent, sid))
    if hit is not None and now - hit[0] < SPACE_CACHE_TTL:
        return JSONResponse(hit[1], headers={"Cache-Control": "no-store"})

    try:
        module = try_load_capability("session_prompts", agent=agent)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "invalid_agent",
                "message": f"Invalid telemetry source {agent!r}.",
            },
        )
    collector = getattr(module, "collect_session_prompts", None) if module else None
    if not callable(collector):
        return JSONResponse(
            {
                "source": {"id": agent},
                "session_id": sid,
                "supported": False,
                "total_prompts": 0,
                "capped": False,
                "prompts": [],
            },
            headers={"Cache-Control": "no-store"},
        )

    try:
        data = await asyncio.to_thread(collector, sid)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail={"code": "invalid_session", "message": str(exc)},
        )
    except FileNotFoundError:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "session_transcript_not_found",
                "message": "No transcript found for this session.",
            },
        )
    except Exception as exc:
        print(f"⚠️ session prompts failed for {agent}:{sid} ({exc})")
        raise HTTPException(
            status_code=503,
            detail={
                "code": "session_prompts_unavailable",
                "message": "Could not read this session's prompts.",
            },
        )

    if len(_session_prompts_cache) >= _SESSION_PROMPTS_CACHE_MAX:
        oldest = min(
            _session_prompts_cache,
            key=lambda key: _session_prompts_cache[key][0],
        )
        _session_prompts_cache.pop(oldest, None)
    _session_prompts_cache[(agent, sid)] = (now, data)
    return JSONResponse(data, headers={"Cache-Control": "no-store"})


def mount_space(app):
    """Mount the Space folder at /space (index.html served at /space/)."""
    if SPACE_DIR.exists():
        app.mount("/space", StaticFiles(directory=str(SPACE_DIR), html=True), name="space")
    else:
        print(f"⚠️ Space folder not found at {SPACE_DIR}; /space not mounted (set SPACE_DIR to change)")
