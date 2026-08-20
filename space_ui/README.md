# Space — the workspace knowledge graph UI

An explorable map of `~/xo-projects`. Six top-level tabs — **Dashboard**,
**Files** (List | Graph | Tree lenses under one tab), **Timeline**,
**Sessions**, **Wiki**, and **Setup** — plus the **Quirq** state view, which
has no tab of its own and opens from Setup's header.

This folder is a bundled snapshot of the xo-atlas UI (originally a standalone
folder with no remote), trimmed to the single endpoint-driven page and served
by this API — so every workspace that runs xo-cowork-api gets the graph with
zero configuration.

## Files

Build-free ES modules (no bundler, no dependencies); the browser loads them
directly. Descended from the single-file xo-atlas `v3.html`.

| Path | What it is |
|------|------------|
| `index.html` | Thin shell: markup + stylesheet links + `js/app.js` entry. |
| `css/` | The original stylesheet split at its section banners, loaded in original order (cascade unchanged). |
| `js/app.js` | Entry point. Registers views; **adding a view = one new file in `js/views/` + one import line here.** |
| `js/core/registry.js` | View registry: tab nav, `1..n` hotkeys, `#/<id>` hash routing, lazy mount, per-view failure isolation. |
| `js/core/api.js` | The one fetch layer: `API_BASE`, query-string auth forwarding, offline / HTTP-error / 501 classification, single-flight GETs. |
| `js/core/store.js` | Idempotency helpers: single-flight promises, slotted (non-stacking) intervals. |
| `js/core/ui.js` | Shared UI helpers (toast). |
| `js/core/esc.js` | The one HTML-escaping helper. Every view builds markup by concatenation, so this is the single guard between workspace data and the parser — it escapes `"` as well, because escaped output routinely lands inside attributes. |
| `js/core/server-widget.js` | Footer server pill (status poll + stop). |
| `js/core/preview.js` | File previewer drawer. Any view opens it with a `space:preview-file` event; markdown renders through `markdown.js`, HTML renders in an empty-`sandbox` iframe, everything else as escaped source. |
| `js/views/atlas.js` | Dashboard + Graph + Timeline — three lenses over one dataset, one shared closure, three exported views. |
| `js/views/sessions.js` | The Sessions (Argus telemetry) view. |
| `js/views/projects.js` | The Files List lens: project list with per-project drawers (folder browser via `/tree`, todos, open sessions, recent events). Owns the `Files` tab; Graph and Tree are sibling lenses (`nav:false`, `parent:'projects'`). |
| `js/views/tree.js` | The Files Tree lens: horizontal hierarchy over the same `space.json` dataset as Graph — folders as columns, files stacked beside their parent. Deep-link `#/tree`. |
| `js/views/wiki.js` | The Wiki view: bundled, version-matched operating documentation. It includes storage architecture, watcher internals, complete `.xo` / `.quirq` data catalogs, and flow-building recipes. |
| `js/views/quirq.js` | The Quirq view: machine-local `.quirq` watcher state beside portable project `.xo` output. No tab of its own — `nav:false, parent:'secrets'`, opened from Setup's header button (`#/quirq`). |
| `js/views/secrets.js` | The Setup view: storage roots, agent runtime, watcher coverage, write-only credentials, git self-update, managed restart. |
| `js/core/markdown.js` | Escape-first mini-markdown (fences, inline code, bold/italic, links, headings, lists). |

The view contract (`id`/`label`/`order`/`nav`/`parent`/`section`, mount/show/hide)
is documented in the header comment of `js/core/registry.js`; repo-wide working
rules are in the root `AGENTS.md`.

## How it's served

`routers/space.py` mounts this folder read-only at `/space`, so the app is at
`http://localhost:5002/space/`. It serves the page only — the **data** comes
from `routers/xo_data.py`, which hands over the workspace `.xo` directory at
`/xo/*.json`, one URL per file (`GET /xo/space.json` is
`<XO root>/.xo/space.json`). The watcher materialises those files; a file that
is missing, empty or stale is rebuilt in a worker thread and written back, so
the answer the browser gets and the file on disk never diverge. When a payload
cannot be produced the route answers 503 and the app shows its "no data
source" panel.

The one data route still on this mount is `GET /space/data/session_prompts.json`
— a per-session lookup rather than a workspace file.

- Override the folder with the `SPACE_DIR` env var (e.g. to point at a live
  xo-atlas checkout during UI development).
- The footer server pill polls `GET /space/server/status`. There is no stop
  endpoint and no stop control: starting or stopping the server is a shell
  operation.

Local change vs upstream xo-atlas: `simTick()` clamps per-tick node velocity
to 60 units — generated data can put 100+ leaves in one cluster, whose summed
spring stiffness makes the original explicit-Euler sim diverge (positions hit
1e20 and the canvas goes blank).

## Sessions tab

The fourth topbar tab (`Dashboard | Files | Timeline | Sessions | Wiki |
Setup`) is an Argus telemetry dashboard: Claude Code session stats rendered as cards,
tables, and hand-drawn canvas charts (no dependencies), re-skinned to the
Space theme. It lives in its own module (`js/views/sessions.js`), independent
of the atlas's `boot()` — either can fail without taking the other down, and
the registry keeps the tabs switchable regardless.

- Data: `GET /xo/sessions.json`, one pre-aggregated payload built
  live from the Argus DB (`ARGUS_DB` env, default `~/.argus/argus.db`) by
  `services/cowork_agent/visualizer/argus_index.py`. Fetched lazily on
  first open; the Refresh button re-fetches (server rebuilds behind the
  same 30 s TTL).
- Sub-views: Overview · Sessions (list → detail with sub-agents and
  per-session tools) · Tools · Models · Trends. The `Today/7d/30d/All`
  window selector filters client-side over per-day rollups shipped in the
  payload.
- No alerts and no prompts by design — those tables are never read, so raw
  prompt text never enters the payload.

## Data format

```jsonc
{
  "meta":       { "title", "tagline", "mappedOn", "workspace" },
  "categories": { "p_<project>": {"name": "...", "color": "#a2b56b"}, ... },
  "hubAngles":  { "p_<project>": -1.57, ... },      // radians, one region per project
  "timeline":   { "start": "2026-01-27", "end": "2026-07-20" },
  "root":       { "id": "xo", "label", "blurb" },
  "hubs":       [ { "id", "cat", "label", "blurb" } ],          // one per project
  "groups":     [ { "id", "cat", "label", "blurb" } ],          // one per top-level dir
  "leaves":     [ { "id", "group", "shape", "tag", "label",
                    "date", "blurb", "path" } ],                // one per file
  "ties":       [ { "s", "t", "label" } ],      // derived cross-links (see below)
  "milestones": [ { "d": "YYYY-MM-DD", "t": "caption" } ],      // first commits
  "gitHistory": { "p_<project>": [ { "d": "YYYY-MM-DD", "n": 3,
                    "s": ["subject", "…"] } ] }  // commits/day per project (optional)
}
```

`gitHistory` feeds the Timeline's **By project** mode: one lane per project,
one dot per commit day (`n` commits, up to 3 sampled subjects in `s`). The
mode toggle only renders when at least one project carries history; the
Dashboard projection and non-git projects have none.

Shapes are semantic: `disc` = code, `ring` = document, `diamond` = everything
else. Leaf `date` is the git first-added date, or `null` when git does not
know the file (untracked, or a non-git project); undated leaves appear on the
graph but sit out the timeline. Tree edges (leaf → cluster → project → root)
are derived by the UI; only cross-ties are listed.

Ties are derived facts, never editorial: files that repeatedly share commits
("changed together ×N", from the same git log that dates the leaves), docs
whose text names another file's relative path ("references"), and
`test_x` ↔ `x` filename pairs ("tests"). Strongest first, capped at 60.
