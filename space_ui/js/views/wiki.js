/* Wiki tab — versioned operating documentation for Space.

   The pages live beside the code they document, work offline, and describe
   the exact watcher/storage contracts shipped by this server version.
*/

import {esc as wikiEsc} from '../core/esc.js';

const PAGES=[
  {
    id:'storage',
    section:'Start here',
    title:'Storage & data map',
    summary:'The boundary between runtime data, portable .xo metadata, and local .quirq state.'
  },
  {
    id:'installation',
    section:'Start here',
    title:'Install & run locally',
    summary:'Prerequisites, the one-command native install, configuration, verification, and updates.'
  },
  {
    id:'watcher',
    section:'Runtime systems',
    title:'How the watcher works',
    summary:'The tick loop, normalized events, sinks, runtime coverage, and failure model.'
  },
  {
    id:'xo-data',
    section:'Data catalog',
    title:'Everything in .xo',
    summary:'Every project and workspace document, its fields, owner, lifecycle, and API use.'
  },
  {
    id:'quirq-data',
    section:'Data catalog',
    title:'Everything in .quirq',
    summary:'Onboarding, cursors, locks, and live presence that stay on one machine.'
  },
  {
    id:'flows',
    section:'Design guide',
    title:'Building useful flows',
    summary:'Practical read paths for live work, history, analytics, todos, and debugging.'
  },
  {
    id:'tab-dashboard',
    section:'Tab guides',
    title:'Dashboard tab',
    summary:'See every XO project grouped by Engineering, Ops, Documentation, Research, or Marketing.'
  },
  {
    id:'tab-files',
    section:'Tab guides',
    title:'Files tab',
    summary:'One home for the workspace: List for ops and browsing, Graph for relationships, Tree for hierarchy — three lenses, one tab.'
  },
  {
    id:'tab-timeline',
    section:'Tab guides',
    title:'Timeline tab',
    summary:'Scrub dated artifacts by file, or every project’s git history in parallel vertical columns, newest at the top.'
  },
  {
    id:'tab-sessions',
    section:'Tab guides',
    title:'Sessions tab',
    summary:'Compare Claude Code, Codex, and Cursor telemetry with source filters, honest cost states, pagination, and prompt turns.'
  },
  {
    id:'tab-wiki',
    section:'Tab guides',
    title:'Wiki tab',
    summary:'Use the versioned local operating manual and understand how its pages are maintained.'
  },
  {
    id:'tab-quirq',
    section:'Tab guides',
    title:'Quirq state view',
    summary:'Opened from Setup: compare machine-local watcher state with portable project .xo outputs.'
  },
  {
    id:'tab-setup',
    section:'Tab guides',
    title:'Setup tab',
    summary:'Configure roots, agent runtime, watcher coverage, credentials, and managed restarts.'
  }
];

const ARTICLES={
  storage:storageArticle,
  installation:installationArticle,
  watcher:watcherArticle,
  'xo-data':xoDataArticle,
  'quirq-data':quirqDataArticle,
  flows:flowsArticle,
  'tab-dashboard':()=>tabGuideArticle('dashboard'),
  'tab-files':()=>tabGuideArticle('files'),
  'tab-timeline':()=>tabGuideArticle('timeline'),
  'tab-sessions':()=>tabGuideArticle('sessions'),
  'tab-wiki':()=>tabGuideArticle('wiki'),
  'tab-quirq':()=>tabGuideArticle('quirq'),
  'tab-setup':()=>tabGuideArticle('setup')
};

let root=null;
let activePage='storage';
let go=()=>{};

export default {
  /* Top-level tab, and still deep-linkable at #/wiki. Order 7 keeps it
     between Sessions and Setup — the nav slot (and number hotkey) Quirq
     used to hold. */
  id:'wiki',label:'Wiki',order:7,
  async mount(el,ctx){
    root=el;
    go=ctx.switchTo;
    renderShell();
  },
  show(){/* Preserve the selected page and article scroll position. */}
};

function renderShell(){
  root.innerHTML=
    '<div class="wiki-shell">'
      +'<aside class="wiki-nav">'
        +'<div class="wiki-nav-head">Quirq Wiki</div>'
        +'<p>Architecture and flow guides for the local control plane.</p>'
        +'<div class="wiki-nav-pages">'
          +PAGES.map(pageButton).join('')
        +'</div>'
      +'</aside>'
      +'<main class="wiki-main" id="wiki-main"></main>'
    +'</div>';
  root.querySelectorAll('[data-wiki-page]').forEach(button=>{
    button.addEventListener('click',()=>selectPage(button.dataset.wikiPage));
  });
  root.querySelector('#wiki-main').addEventListener('click',event=>{
    const button=event.target.closest('[data-open-tab]');
    if(button)go(button.dataset.openTab);
  });
  selectPage(activePage);
}

function pageButton(page){
  return'<button class="wiki-page-link" data-wiki-page="'+page.id+'">'
    +'<span>'+page.section+'</span>'
    +'<b>'+page.title+'</b>'
    +'<em>'+page.summary+'</em>'
    +'</button>';
}

function selectPage(id){
  if(!ARTICLES[id])return;
  activePage=id;
  root.querySelectorAll('[data-wiki-page]').forEach(button=>{
    const selected=button.dataset.wikiPage===id;
    button.classList.toggle('is-on',selected);
    button.setAttribute('aria-current',selected?'page':'false');
  });
  const main=root.querySelector('#wiki-main');
  main.innerHTML=ARTICLES[id]();
  main.scrollTop=0;
}

addEventListener('space:wiki-page',event=>{
  const id=String(event.detail||'');
  if(!ARTICLES[id])return;
  activePage=id;
  if(root)selectPage(id);
});

const TAB_GUIDES={
  dashboard:{
    tab:'dashboard',
    name:'Dashboard',
    kicker:'Tab guide · Project environments',
    title:'Dashboard: projects inside purpose environments',
    intro:'Dashboard follows main’s Inbox graph model. Each discovered XO project is one visible node. Engineering, Ops, Documentation, Research, and Marketing are not project nodes: each is a softly filled, dashed enclosure around the projects that belong to that environment.',
    facts:['one node per project','five enclosing environments','overlapping membership','read-only'],
    jobs:[
      ['Survey the workspace','Read each colored boundary as a collection of projects with a shared purpose, not as one aggregate node.'],
      ['See overlap','A project with several purposes remains one node and sits between the applicable environments; every applicable enclosure includes it.'],
      ['Read project form','Node glyphs describe project form independently of purpose: app, one-pager, docs, slides, or unknown.'],
      ['Trace an environment','Select its labeled anchor or a project and carry that focused set into Timeline.'],
      ['Read a project’s open work','Select a project node: its todos orbit it as satellites — in-progress items keep a spoke back to the node — and list in the detail panel in status order. Dashboard only: in Graph a leaf is a file, not a project, so the feature stays off.'],
      ['Read a project’s open work','Select a project node: its todos orbit it as satellites — in-progress items keep a spoke back to the node — and list in the detail panel in status order. Dashboard only: in Graph a leaf is a file, not a project, so the feature stays off.']
    ],
    sources:[
      ['GET /xo/dashboard.json','Serves &lt;XO root&gt;/.xo/dashboard.json — the graph collapsed into five environments, materialised by the watcher from the same single scan as space.json.','Workspace .xo file'],
      ['<XO root>/<project>/.xo/project.json','An optional manual category or saved multi-category classification takes precedence over inferred filename signals.','Portable project metadata'],
      ['Project paths and filenames','App manifests, infrastructure files, writing, research formats, decks, contracts, and asset ratios infer environment memberships and node form.','Derived heuristics'],
      ['GET /api/xo-projects/{id}/todos','Fetched when a project node is selected; feeds the todo satellites and the panel list. Held in the browser for 20 seconds per project, so re-selecting is instant.','Live project todos'],
      ['GET /api/xo-projects/{id}/todos','Fetched when a project node is selected; feeds the todo satellites and the panel list. Held in the browser for 20 seconds per project, so re-selecting is instant.','Live project todos']
    ],
    steps:[
      ['Enter Dashboard','It is the first top-level tab and the default Space route.'],
      ['Read the map','The map renders immediately: project nodes, five labeled anchors, and the dashed environment boundaries around their members.'],
      ['Read a boundary','The tinted area is the environment. Its small internal group point is only a layout/focus anchor; it is not the environment’s data representation.'],
      ['Focus','Click a project or environment anchor; double-click an anchor to expand or collapse its primary project set. Selecting a project also loads its todos: up to 28 orbit the node as satellites, and the panel lists them in status order.'],
      ['Search','Press / and search projects by name.'],
      ['Compare Graph','Open Graph for the detailed project, folder, and artifact map. The atlas reloads once because each mode runs a separate simulation dataset.']
    ],
    checks:[
      ['Project missing','Confirm the XO root in Setup and verify GET /xo/dashboard.json. The file is rebuilt by the watcher at most every 30 seconds, and on demand when a request finds it stale.'],
      ['Unexpected environment','The classifier uses saved metadata first and filename signals second; ambiguous projects may need a manual category.'],
      ['Project sits between boundaries','That is intentional multi-environment membership. Strong secondary springs place the one shared node between its collections.'],
      ['Environment has no boundary','An empty environment keeps its label but has no project area to enclose.'],
      ['Graph switches with a reload','That reset is intentional so Dashboard and Graph never share stale physics or selection state.']
    ],
    note:'Dashboard environments are collections of project nodes. The dashed hull is the collection; the anchor only gives the physics, label, and focus a stable target. Dashboard and the Files graph are read-only and write neither project files, .xo, nor .quirq.'
  },
  files:{
    tab:'projects',
    name:'Files',
    kicker:'Tab guide · Workspace map and project state',
    title:'Files: one home, three lenses',
    intro:'Files is one top-level tab with three lenses behind a List | Graph | Tree pill. It lands on List: every project operationally, with a per-project drawer that browses the filesystem folder-by-folder and shows todos, open sessions, and recent events. Graph maps the same workspace as projects, clusters, artifacts, and cross-links. Tree reads the same space.json dataset as a horizontal hierarchy — folders as columns, files stacked beside their parent. All three lenses are read-only.',
    facts:['lands on List','List | Graph | Tree lens switch','map from .xo/space.json','drawer file explorer','file previewer','portable .xo history','live .quirq presence','read-only'],
    jobs:[
      ['Find an artifact','In Graph, search by title, tag, project, or cluster and fly to the matching node. In Tree, expand folders and filter by name; click a file to open it in the previewer, then use the previewer’s Graph button if you want that leaf focused on the map.'],
      ['Understand relationships','Select a Graph node to inspect its neighborhood and follow parent, cluster, and cross-project ties.'],
      ['Read the hierarchy','Use Tree when the question is “what is in there”: workspace root on the left, one column per depth, files stacked beside their folder (not one column per file).'],
      ['Change perspective','Use Graph root to temporarily reorganize the layout around any node without changing the XO filesystem.'],
      ['Browse project files','In List, open a project drawer: the Files panel lists one folder at a time via GET /api/xo-projects/{id}/tree, with breadcrumbs and separate folder/file panes.'],
      ['Review active work','In the same drawer, inspect todos, current sessions, and the latest normalized timeline events.'],
      ['Jump between lenses','Use a List row’s Map action to focus that project on Graph, or the previewer’s Graph button to focus one file; use “Show on timeline” from Graph to carry a run into Timeline.'],
      ['Read a file','Three surfaces open the same side drawer: a file row in Tree, a file row in the List drawer’s Files panel, and “Preview file” in Graph’s detail panel. Markdown renders, HTML renders inside an empty-sandbox iframe, everything else shows as escaped source; a Source toggle shows the raw text of any of them and Escape closes it.']
    ],
    sources:[
      ['GET /xo/space.json','Serves &lt;XO root&gt;/.xo/space.json, built by build_space_data() from the XO projects root and portable project metadata; feeds Graph, Tree and the Files List counts.','Workspace .xo file'],
      ['<XO root>/<project>/.xo/project.json','Gates a project’s appearance in Graph and Tree, and supplies its display name; the List additionally shows folders that have no project.json, marked unscaffolded. A missing description falls back server-side to the first paragraph of the project’s README.md, PROJECT.md, or OBJECTIVES.md. The folder name under the XO root is the project id — a stale name inside this file never overrides it. Dates, git history, and cross-ties come from the project’s git log, not from .xo session data.','Portable project identity'],
      ['GET /api/xo-projects','Names, descriptions, and created dates for every direct child of the XO root. The List pairs it with GET /api/xo-projects/activity and GET /api/xo-projects/timeline?limit=200 for the live and last-active columns: four workspace-wide requests in total, whatever the project count.','List lens catalog'],
      ['GET /api/xo-projects/{id}/tree?relative_path=…','Bounded, path-safe folder listing for the List drawer’s Files panel: one folder at a time, each row carrying is_dir, size_bytes, modified_at, and — for a folder — how many entries it holds.','List drawer explorer'],
      ['GET /api/xo-projects/{id}/todos|activity|timeline','Portable todos, machine-local live presence, and recent normalized events. Each drawer panel fetches independently.','List drawer panels'],
      ['GET /api/xo-projects/{id}/file?relative_path=…','One text file for the previewer drawer: 256 KB cap, suffix allowlist, and a kind of markdown, html, or text. An unsupported suffix returns 415 and the drawer says so.','File previewer']
    ],
    steps:[
      ['Pick a lens','Files opens in List; switch with the List | Graph | Tree pill. #/projects, #/graph, and #/tree deep-link each lens.'],
      ['Search','Press / or use Graph’s top-right search; Tree has its own name filter in the header.'],
      ['Focus','Click a Graph node; double-click clusters to expand or collapse. In Tree, click folders to expand columns; click a file to preview it — the tree keeps its scroll and its expansion state, and the previewer’s Graph button is the explicit way to move.'],
      ['Expand one row','In List each drawer panel loads independently, so one failed data source does not hide the others.'],
      ['Browse files','In the Files panel, use breadcrumbs and folder rows to change cwd; browsing state is remembered per project for the session.'],
      ['Follow time','Choose “Show on timeline” to carry the selected run into Timeline.']
    ],
    checks:[
      ['Empty graph or tree','Confirm the XO root in Setup and verify GET /xo/space.json — the file lives at &lt;XO root&gt;/.xo/space.json.'],
      ['Project missing from the List','Verify the XO root and ensure the folder is a direct child of it.'],
      ['Unscaffolded badge','The folder exists but lacks canonical project metadata.'],
      ['No open sessions','This is a valid live-presence zero, not proof that no historical work exists.'],
      ['Unexpected root label','Graph root is an in-view lens, not the host XO directory configured in Setup.'],
      ['Stale result','Nothing is generated per request. &lt;XO root&gt;/.xo/space.json is rebuilt by the watcher at most every 30 seconds (XO_VIEWS_REFRESH_S) and by a request only once the file is older than 120 seconds (XO_VIEW_MAX_AGE_S), so a reader can be up to two minutes behind. List Refresh re-fetches the project catalog and any open drawer.'],
      ['Tree shows fewer columns than expected','Intentional: files stack beside their folder so horizontal distance means depth only.'],
      ['No List | Graph | Tree pill on Dashboard','Intentional: Dashboard shares the canvas but is its own tab, not a Files lens.']
    ],
    note:'Files reads derived metadata and project structure. It never writes project files, .xo, or .quirq; the watcher owns .xo writes.'
  },
  timeline:{
    tab:'time',
    name:'Timeline',
    kicker:'Tab guide · Time and relationships',
    title:'Timeline: when work happened',
    intro:'Timeline always plots the workspace dataset (space.json); opening it from Dashboard reloads once to switch datasets. It arranges dated work into vertical columns with time flowing upward: newest at the top, oldest at the bottom. Two modes: By file plots every dated artifact, and By project plots each project’s git commit history in parallel columns.',
    facts:['same graph dataset','By file / By project modes','parallel git histories','newest at the top','date scrubber','playback mode'],
    jobs:[
      ['Replay growth','Scrub or play through the workspace to see artifacts appear in chronological order.'],
      ['Compare project momentum','Switch to By project to read every project’s git history in parallel: one column per project, one dot per commit day, sized by commits.'],
      ['Trace one cluster','Open a cluster from Graph and carry its related artifacts into a focused timeline trace (a By-file tool; starting one switches the mode back).']
    ],
    sources:[
      ['GET /xo/space.json','Serves &lt;XO root&gt;/.xo/space.json: dated leaves, categories, milestones, relationship edges, and per-project git history (gitHistory).','Workspace .xo file'],
      ['<project>/.xo/timeline.jsonl','Durable normalized watcher history used by project APIs; it is related data but not the Atlas animation payload itself.','Portable project history']
    ],
    steps:[
      ['Choose Timeline','Use the top navigation tab.'],
      ['Pick a mode','By file shows every dated artifact; By project shows each project’s daily commits in parallel columns. The choice is remembered.'],
      ['Set a date','Drag the scrubber or press Play; the sweep line moves up the page as time advances.'],
      ['Inspect a point','Hover an artifact or commit dot for details; click a commit dot to open its project on Graph.']
    ],
    checks:[
      ['No dots','Dates come from git only: a dot is a file’s first-commit day. Files never committed, and projects without a repo, sit out the By file plot.'],
      ['Fewer projects than Files lists','Expected, and stated in the subtitle: Files lists every folder under the XO root, while both Timeline modes can only plot projects that have their own git repository. A project whose repo sits in a subfolder counts as having none.'],
      ['No By project toggle','The current dataset carries no git history; the toggle appears only when at least one project has git commits of its own (a repo with no commits yet does not count, and the Dashboard projection never has history).'],
      ['Trace missing','Open the cluster from Graph first or clear the existing trace and try again.']
    ],
    note:'Timeline’s visual artifact map and .xo/timeline.jsonl answer different questions: the former maps the workspace; the latter is the watcher’s durable event history.'
  },
  sessions:{
    tab:'sessions',
    name:'Sessions',
    kicker:'Tab guide · Multi-runtime telemetry',
    title:'Sessions: usage and runtime telemetry',
    intro:'Sessions combines the telemetry sources available on this machine. It summarizes tokens, cost availability, durations, models, tools, typed prompt exchanges, and trends without putting prompt text in the aggregate payload.',
    facts:['Claude Code + Codex + Cursor discovery','today / 7d / 30d / all','source filters + pagination','lazy prompt details'],
    jobs:[
      ['Measure usage','Compare total token volume over a consistent date window, then open a session’s detail for its fresh, output, cache-read, and cache-write breakdown.'],
      ['Inspect sessions','Filter and sort individual sessions, page through the newest rows, then open a focused telemetry summary.'],
      ['Follow exchanges','Open Prompts by turn to see each typed prompt with the replies and tool calls it initiated.'],
      ['Compare behavior','Review model mix, tool frequency, duration, available cost estimates, and trend heatmaps across runtimes.']
    ],
    sources:[
      ['GET /xo/sessions.json','Serves &lt;XO root&gt;/.xo/sessions.json: installed telemetry capabilities merged across healthy providers, with unavailable sources reported independently.','Workspace .xo file'],
      ['GET /space/data/session_prompts.json','Reads one selected session transcript on demand; prompt text is never included in the aggregate response.','Lazy detail'],
      ['ARGUS_DB / CODEX_HOME / CURSOR_HOME','Optional runtime roots used by the Claude Code, Codex, and Cursor readers.','Read-only native data'],
      ['<project>/.xo and .quirq','Per-project watcher output and machine-local control state; neither is a source for this tab. The aggregate it does read, &lt;XO root&gt;/.xo/sessions.json, is a workspace file written by the same watcher.','Separate watcher stores']
    ],
    steps:[
      ['Choose sources','Toggle available runtimes. An unavailable badge means the native store could not be read, not that it contains zero sessions.'],
      ['Choose a window','Select Today, 7 days, 30 days, or All.'],
      ['Choose a lens','Use Overview, Sessions, Tools, Models, or Trends.'],
      ['Sort and select','Sort and page through session rows, then open the one that needs diagnosis.'],
      ['Inspect prompts','Prompt text loads only after you open a detail page and stays cached only for this browser tab.'],
      ['Refresh','Use Refresh after new telemetry has reached a native runtime store.']
    ],
    checks:[
      ['503 for all sources','Confirm at least one native runtime store exists and is readable on this machine (ARGUS_DB, CODEX_HOME, CURSOR_HOME, or their defaults under your home directory).'],
      ['One source unavailable','The rest of the dashboard should keep working; verify that source’s configured root exists and is readable.'],
      ['Zero vs unclassified','A runtime may report an authoritative session total without exposing the full fresh/output/cache breakdown.'],
      ['Cost unavailable','Codex and Cursor costs are shown as unavailable instead of a misleading $0; Argus values remain estimates, not invoices.'],
      ['Prompts unavailable','That runtime may not support prompt details, or its native transcript may have been cleaned up.'],
      ['New session missing','Wait for ingestion, then Refresh. &lt;XO root&gt;/.xo/sessions.json is rebuilt by the watcher at most every 30 seconds, and a request rebuilds it only once the file is older than 120 seconds — Refresh re-reads the file, it does not force a rebuild.']
    ],
    note:'Sessions reads native runtime stores without modifying them. Files remains the better tab for todos, live presence, and normalized .xo/.quirq history.'
  },
  wiki:{
    tab:'wiki',
    name:'Wiki',
    kicker:'Tab guide · Local documentation',
    title:'Wiki: the operating manual',
    intro:'Wiki ships with the application and documents the exact storage, watcher, installation, flow, and tab contracts for this version. It works offline and requires no external documentation service. It is a top-level tab, between Sessions and Setup, and stays deep-linkable at #/wiki.',
    facts:['versioned with code','offline','architecture + operations','one page per tab'],
    jobs:[
      ['Learn the boundaries','Start with Storage & data map before designing a new flow.'],
      ['Inspect a contract','Use the .xo and .quirq catalogs to identify writers, readers, and lifecycle.'],
      ['Operate a view','Open the matching Tab guide for its source APIs, controls, and troubleshooting.']
    ],
    sources:[
      ['space_ui/js/views/wiki.js','Contains the page catalog and rendered versioned articles.','Application source'],
      ['space_ui/css/wiki.css','Owns navigation, articles, tables, recipes, and responsive layout.','Application source'],
      ['Runtime APIs','Shown as documentation examples; Wiki itself does not fetch them.','Reference only']
    ],
    steps:[
      ['Choose a page','Use the left navigation grouped by Start here, Runtime systems, Data catalog, Design guide, and Tab guides.'],
      ['Follow locations','Paths explain ownership; API routes are the integration boundary.'],
      ['Cross-check a tab','Use Open tab at the bottom of a Tab guide.'],
      ['Keep docs current','Whenever a tab changes data source or behavior, update its guide in the same code change.']
    ],
    checks:[
      ['Page seems stale','Update from Setup (git self-update), restart the server, then reload; Wiki is versioned static application code, so pages change only with the code.'],
      ['Path differs','Setup reports the actual roots configured for this installation.'],
      ['Need raw secrets','Wiki intentionally documents secret handling without revealing saved values.'],
      ['Need a new guide','Add it to PAGES and ARTICLES so navigation and content remain coupled.']
    ],
    note:'Wiki explains contracts; live truth still comes from the relevant API and its freshness timestamps.'
  },
  quirq:{
    tab:'quirq',
    name:'Quirq',
    kicker:'View guide · Watcher storage',
    title:'Quirq: see both watcher destinations',
    intro:'Quirq is a privacy-aware operational map. It explicitly separates machine-local watcher state under .quirq from portable derived metadata under each XO project’s .xo directory. It is not a top-level tab: open it with the Open Quirq state button in Setup’s header, or deep-link to #/quirq; the Setup tab stays highlighted while it is open.',
    facts:['two storage destinations','live refresh','values masked','filesystem structure only'],
    jobs:[
      ['See local control state','Inspect cursors, locks, and live activity under .quirq/watcher.'],
      ['See portable project output','Review which identity, session, todo, statistics, and timeline documents exist under project .xo directories.'],
      ['Diagnose storage drift','Spot legacy .xo/activity.json files and confirm current presence lives only in .quirq.']
    ],
    sources:[
      ['GET /api/quirq','Returns safe file metadata, watcher status, activity counts, root status, and .xo output contracts.','Privacy-aware catalog'],
      ['<Quirq root>/watcher/','Machine-local offsets, locks, and live activity snapshots.','Ephemeral watcher state'],
      ['<XO root>/<project>/.xo/','Portable identity, session indexes, todos, statistics, and history.','Durable watcher output'],
      ['<XO root>/.xo/','Workspace rollups rebuilt from project-level .xo files, plus the three Space view files — space.json, dashboard.json, sessions.json — which the watcher materialises from its own workspace scan.','Durable workspace rollup']
    ],
    steps:[
      ['Open Quirq','Use the Open Quirq state button in Setup’s header, or go straight to #/quirq.'],
      ['Read the split map','Compare the blue machine-local side with the green portable project side.'],
      ['Check freshness','Use updated times and watcher status before treating a snapshot as current.'],
      ['Open project data','Jump to Files for API-rendered todos, presence, and recent events.'],
      ['Inspect structure','Use State tree for current .quirq files; contents remain protected.']
    ],
    checks:[
      ['Legacy activity warning','The old file is residue; current watcher code does not write it.'],
      ['Missing .xo output','The project may be new, unscaffolded, or not yet mapped to a native session.'],
      ['No offsets.json','Some sources use other cursor types, or no supported records have been tailed yet.'],
      ['Credential count only','Values are deliberately write-only and remain masked.']
    ],
    note:'Use Quirq to understand where data lives. Use Files to consume project state and Setup to change runtime behavior.'
  },
  setup:{
    tab:'secrets',
    name:'Setup',
    kicker:'Tab guide · Local runtime configuration',
    title:'Setup: configure this installation',
    intro:'Setup controls host storage roots, the active chat backend, watcher coverage and cadence, native runtime mounts, write-only credentials, managed process restarts, and git-backed self-update of the xo-space checkout.',
    facts:['typed settings','write-only secrets','root-aware','restart truthful','git self-update'],
    jobs:[
      ['Choose storage','View and configure the host XO projects root and machine-local .quirq root.'],
      ['Choose runtime behavior','Select the active agent, enable the watcher, set source coverage, and tune the tick interval.'],
      ['Connect credentials','Set, replace, or remove environment values without reading saved plaintext back.'],
      ['Stay current','Check the git remote for a newer xo-space and fast-forward the checkout; the new version runs after a restart.']
    ],
    sources:[
      ['GET /space/update/status + POST /space/update/apply','Compares HEAD with the checkout’s own remote via git and fast-forwards on request; refuses dirty or diverged checkouts.','Self-update'],
      ['GET/PUT /api/runtime-config','Reads and validates agent and watcher settings in .quirq/runtime.env.','Non-secret configuration'],
      ['PUT /api/runtime-config/roots','Writes the desired host roots to .quirq/roots.env, which the server reads at startup; an exported shell or container value still outranks it.','Storage root configuration'],
      ['GET/PATCH/DELETE /api/secrets','Returns names/status and writes values to .quirq/secrets.env.','Write-only credentials'],
      ['POST /api/runtime-config/restart','Restarts only an installer-managed local container.','Managed process control']
    ],
    steps:[
      ['Confirm paths','Compare the configured roots with what the running server reports.'],
      ['Inspect stored state','The header’s Open Quirq state button opens the machine-local watcher state beside the portable .xo output.'],
      ['Save roots','Saved roots are applied at startup: restart the server, or run the one-command installer on a managed container, which also remaps its bind mounts.'],
      ['Save runtime','Review the pending-restart banner before applying process-time changes.'],
      ['Add credentials','Choose a manifest-recommended key, save it, then restart when requested.']
    ],
    checks:[
      ['Root not applied','Saving only queues it. Restart the server (or rerun the displayed installer) to boot on the new roots; every tab then reads the same XO root.'],
      ['CLI unavailable','A manifest may support bootstrap, but required credentials must be present first.'],
      ['Sessions missing','Confirm the native runtime directory is mounted and watcher coverage includes it.'],
      ['Secret value hidden','That is intentional; replace the value or remove the variable.']
    ],
    note:'XO root changes select a project collection and never move project files. An empty new .quirq root receives a safe state copy; a non-empty root is never merged.'
  }
};

function tabGuideArticle(id){
  const guide=TAB_GUIDES[id];
  return`
    <article class="wiki-article">
      <header class="wiki-hero">
        <div class="wiki-kicker">${guide.kicker}</div>
        <h1>${guide.title}</h1>
        <p>${guide.intro}</p>
        <div class="wiki-facts">${guide.facts.map(fact=>`<span>${fact}</span>`).join('')}</div>
      </header>

      <section class="wiki-section">
        <h2>What this tab is for</h2>
        <div class="wiki-decision-list">
          ${guide.jobs.map(([title,text])=>`<div><b>${title}</b><p>${text}</p></div>`).join('')}
        </div>
      </section>

      <section class="wiki-section">
        <h2>Data sources and ownership</h2>
        <div class="wiki-table-wrap">
          <table class="wiki-table">
            <thead><tr><th>Source or location</th><th>What it supplies</th><th>Role</th></tr></thead>
            <tbody>${guide.sources.map(([source,what,role])=>`<tr><td><code>${wikiEsc(source)}</code></td><td>${what}</td><td>${role}</td></tr>`).join('')}</tbody>
          </table>
        </div>
      </section>

      <section class="wiki-section">
        <h2>Recommended workflow</h2>
        <ol class="wiki-steps">
          ${guide.steps.map(([title,text])=>`<li><b>${title}</b><p>${text}</p></li>`).join('')}
        </ol>
      </section>

      ${guide.tab==='projects'?`
      <section class="wiki-section">
        <h2>The file previewer</h2>
        <p>Three surfaces open the same side drawer: a file row in Tree, a file
        row in the List drawer’s Files panel, and “Preview file” in Graph’s
        detail panel. Opening a file does not navigate — the view underneath
        keeps its lens, its scroll and its expansion state, and the drawer’s
        Graph button is the one control that moves you.</p>
        <p>How a file renders is a security contract, not a display
        preference. Markdown goes through the escape-first renderer, which
        escapes the source before it transforms it and emits only fixed,
        attribute-free tags. HTML from disk never enters this document: it
        renders in an iframe with an empty <code>sandbox</code> attribute and
        <code>srcdoc</code>, so it has an opaque origin, no scripts, and no
        network. Everything else shows as escaped source, and a Source toggle
        gives the raw text of any of them. Files in a workspace are agent
        output, and this page holds your session.</p>
        <p class="wiki-note">Backed by
        <code>GET /api/xo-projects/{id}/file?relative_path=…</code>, which
        addresses a file by project id and project-relative path — never an
        absolute host path — with a 256 KB cap and a suffix allowlist. Path
        traversal, an absolute path, and a symlink pointing out of the project
        are all rejected; an unsupported suffix returns 415 and the drawer says
        so.</p>
      </section>
      `:''}

      <section class="wiki-section">
        <h2>Troubleshooting and interpretation</h2>
        <div class="wiki-check-grid">
          ${guide.checks.map(([title,text])=>`<div><b>${title}</b><p>${text}</p></div>`).join('')}
        </div>
      </section>

      <aside class="wiki-callout wiki-tab-callout">
        <div><b>Boundary to remember</b><p>${guide.note}</p></div>
        ${guide.tab==='wiki'?'':`<button type="button" data-open-tab="${guide.tab}">Open ${guide.name}</button>`}
      </aside>
    </article>`;
}

function storageArticle(){
  return`
    <article class="wiki-article">
      <header class="wiki-hero">
        <div class="wiki-kicker">Start here · Storage architecture</div>
        <h1>One system, three data layers</h1>
        <p>Quirq does not replace an agent runtime’s conversation store. It
        derives a compact operational model from that store, keeps portable
        project knowledge in <code>.xo</code>, and keeps machine-specific
        control state in <code>~/.quirq</code>.</p>
        <div class="wiki-facts">
          <span>runtime = source of truth</span>
          <span>.xo = portable metadata</span>
          <span>.quirq = local control state</span>
          <span>HTTP = the only read path</span>
        </div>
      </header>

      <section class="wiki-section">
        <h2>The full data path</h2>
        <div class="wiki-flow wiki-flow-five" aria-label="End-to-end data path">
          <div><small>01</small><b>Native runtime</b><span>Full messages, runtime session records, and tool payloads stay in the runtime's own storage — Claude Code, OpenClaw, Hermes, Antigravity, Codex, or Cursor.</span></div>
          <i aria-hidden="true">→</i>
          <div><small>02</small><b>Source adapter</b><span>Reads only new records, assigns a project, and normalizes supported observations.</span></div>
          <i aria-hidden="true">→</i>
          <div><small>03</small><b>Watcher sinks</b><span>Reduce events into indexes, counters, todos, timelines, and live presence, and rebuild the three workspace view files.</span></div>
          <i aria-hidden="true">→</i>
          <div><small>04</small><b>.xo + .quirq</b><span>Portable knowledge and local process state are written to different ownership boundaries.</span></div>
          <i aria-hidden="true">→</i>
          <div><small>05</small><b>Read routes</b><span>The <code>/api/*</code> presenters return stable frontend shapes and strip private paths or accumulator fields; <code>/xo/*.json</code> hands over the watcher's files as written.</span></div>
        </div>
      </section>

      <section class="wiki-section">
        <h2>What belongs where</h2>
        <div class="wiki-layer-grid">
          <div class="wiki-layer-card">
            <small>Layer A · Runtime native</small>
            <h3>Conversation source of truth</h3>
            <code>~/.claude/ · ~/.openclaw/ · ~/.hermes/ · ~/.gemini/antigravity-cli/ · ~/.codex/ · ~/.cursor/</code>
            <p>Full message text, native session identity, provider-specific
            tool payloads, and resume state. Owned by the runtime. Quirq reads
            supported records but does not relocate them. Session telemetry is
            read the same way from Argus's own database
            (<code>~/.argus/argus.db</code>), which Quirq never writes.</p>
          </div>
          <div class="wiki-layer-card is-xo">
            <small>Layer B · Portable</small>
            <h3>Project and workspace metadata</h3>
            <code>&lt;project&gt;/.xo/ · ~/xo-projects/.xo/</code>
            <p>Identity, session indexes, derived counters, todos, timelines,
            peer/sync state, capabilities, workspace rollups, and the three
            files the Space UI reads — <code>space.json</code>,
            <code>dashboard.json</code> and <code>sessions.json</code> in the
            workspace <code>.xo</code>. It describes the work without becoming
            a second transcript store.</p>
          </div>
          <div class="wiki-layer-card is-quirq">
            <small>Layer C · Machine-local</small>
            <h3>Quirq control state</h3>
            <code>~/.quirq/</code>
            <p>Onboarding state, typed runtime configuration, the storage roots
            Setup writes to <code>roots.env</code> and the server re-reads at
            startup, watcher read cursors, advisory lock files, live presence,
            and credentials saved through Setup. It is meaningful only on this
            machine and must not be synced with a project.</p>
          </div>
        </div>
      </section>

      <section class="wiki-section">
        <h2>The decision rule</h2>
        <div class="wiki-decision-list">
          <div><b>Does it explain the project later?</b><p>Put the derived,
          shareable representation in <code>.xo</code>: session index,
          outcome event, todo, or aggregate.</p></div>
          <div><b>Does it only coordinate this installation?</b><p>Put it in
          <code>.quirq</code>: byte cursor, process presence, lock, or
          installation preference. User-provided environment secrets also stay
          here because they belong to this installation, never a project.</p></div>
          <div><b>Is it the actual conversation or provider state?</b><p>Leave
          it in the runtime’s native store and expose it through the runtime
          adapter when needed.</p></div>
          <div><b>Will a browser or external client consume it?</b><p>Read it
          through an API. Do not make the frontend construct filesystem paths
          or depend on private on-disk fields.</p></div>
        </div>
      </section>

      <section class="wiki-section wiki-grid">
        <div>
          <h2>Privacy boundary</h2>
          <p>The watcher’s normalized events intentionally omit raw prompts,
          assistant prose, tool arguments, command text, and file contents.
          File activity is reduced to a project-relative path. Todo content is
          retained because it is itself the shared work contract.</p>
        </div>
        <div>
          <h2>Portability boundary</h2>
          <p><code>.xo</code> can contain project metadata and local absolute
          paths used internally by adapters. The <code>/api/*</code> presenters
          suppress those paths; the <code>/xo/*.json</code> files are served
          exactly as the watcher wrote them and still carry the workspace root
          and the telemetry database path. <code>.quirq</code> is stricter: the directory itself
          never belongs in project backup, peer sync, or source control.</p>
        </div>
      </section>

      <aside class="wiki-callout">
        <b>Short mental model</b>
        <p>The runtime remembers the conversation. <code>.xo</code> remembers
        what the work means. <code>.quirq</code> remembers how this machine is
        keeping up.</p>
      </aside>
    </article>`;
}

function installationArticle(){
  return`
    <article class="wiki-article">
      <header class="wiki-hero">
        <div class="wiki-kicker">Start here · Native installation</div>
        <h1>Run Quirq locally, no Docker</h1>
        <p>Run one command from the directory you want as your workspace,
        then open one URL. The installer clones Quirq beside your projects,
        prepares a Python environment with uv, and runs the server in the
        foreground.</p>
        <div class="wiki-facts">
          <span>no Docker</span>
          <span>no clone or checkout to manage</span>
          <span>default localhost:5002</span>
          <span>self-contained folder</span>
        </div>
      </header>

      <section class="wiki-section">
        <h2>Prerequisites</h2>
        <div class="wiki-check-grid">
          <div><b>git</b><p>Required. Quirq uses it to download itself, and
          at runtime for project sync and history.</p></div>
          <div><b>curl</b><p>Streams the installer into your shell, and the
          installer uses it again to fetch uv if uv is not already
          installed.</p></div>
          <div><b>A coding runtime</b><p>Claude Code, OpenClaw, Hermes, or
          Antigravity is needed only for chat. The API, Wiki, and project
          views start without one.</p></div>
          <div><b>Optional tools</b><p><code>node</code>/<code>npm</code>,
          <code>gh</code>, <code>rclone</code>, and <code>gpg</code> each
          unlock one feature. The startup readiness table names what a
          missing tool costs; nothing is fatal.</p></div>
        </div>
      </section>

      <section class="wiki-section">
        <h2>First installation</h2>
        <ol class="wiki-steps">
          <li><b>Pick a workspace directory.</b>
          <p>Run the installer from the directory you want as your
          workspace: the checkout lands beside your projects, and the
          directory itself becomes your projects root.</p></li>
          <li><b>Run the installer.</b>
          <code>curl -fsSL https://www.quirq.ai/install | sh</code>
          <p>The short URL serves a small POSIX-sh bootstrap: it checks for
          <code>curl</code> and <code>bash</code>, downloads
          <code>install.sh</code> to a temporary file rather than piping it
          into a shell, and runs it under <code>bash</code> — the installer
          proper uses <code>BASH_SOURCE</code> and <code>pipefail</code>. It
          clones the server, prepares the environment, starts the server in the
          foreground, and prints the browser URL.
          <code>QUIRQ_SOURCE_REF=development</code> moves the bootstrap and the
          clone to the same branch. Fetching
          <code>raw.githubusercontent.com/quirq-ai/xo-space/main/install.sh</code>
          and piping that to <code>bash</code> yourself does the same thing.</p></li>
          <li><b>Open the workspace.</b>
          <code>http://localhost:5002/space/</code>
          <p>Press Ctrl-C to stop the server. Re-run the same installer
          command whenever you want to update and restart.</p></li>
        </ol>
      </section>

      <section class="wiki-section">
        <h2>What the one command does</h2>
        <div class="wiki-flow wiki-flow-five" aria-label="Local installation flow">
          <div><small>01</small><b>Install uv</b><span>Install
          <code>uv</code> if it is missing; nothing else is added to the
          machine.</span></div>
          <i aria-hidden="true">→</i>
          <div><small>02</small><b>Clone or update</b><span>Clone Quirq into
          <code>./xo-space</code>; re-running fast-forwards the same
          checkout, so this doubles as the update path.</span></div>
          <i aria-hidden="true">→</i>
          <div><small>03</small><b>Build the venv</b><span>Create
          <code>./xo-space/venv</code> with Python 3.12 and install
          <code>requirements.txt</code>.</span></div>
          <i aria-hidden="true">→</i>
          <div><small>04</small><b>Set the roots</b><span>Resolve the two
          roots in order — a value exported in your shell, then
          <code>roots.env</code> saved by the Setup tab, then the checkout's
          <code>.env</code>, and otherwise the launch directory with
          <code>./.quirq</code> inside it.</span></div>
          <i aria-hidden="true">→</i>
          <div><small>05</small><b>Run foreground</b><span>Print the
          readiness table and the URL, log to the state root, and stop on
          Ctrl-C.</span></div>
        </div>
      </section>

      <section class="wiki-section">
        <h2>Local data map</h2>
        <div class="wiki-table-wrap">
          <table class="wiki-table">
            <thead><tr><th>Path</th><th>Purpose</th></tr></thead>
            <tbody>
              <tr><td>.</td><td>Your projects root; each project is a subdirectory with its own portable .xo metadata</td></tr>
              <tr><td>./.xo</td><td>The workspace tier the watcher materialises: space.json, dashboard.json and sessions.json — the three payloads the UI reads over /xo/*.json — plus workspace.json, stats, activity and the workspace timeline</td></tr>
              <tr><td>./.xo</td><td>The workspace tier the watcher materialises: space.json, dashboard.json and sessions.json — the three payloads the UI reads over /xo/*.json — plus workspace.json, stats, activity and the workspace timeline</td></tr>
              <tr><td>./xo-space</td><td>The Quirq source checkout the installer owns and updates</td></tr>
              <tr><td>./xo-space/venv</td><td>The Python environment</td></tr>
              <tr><td>./.quirq</td><td>Machine-local state: runtime.env and secrets.env from the Setup tab, roots.env, the server log quirq.log, and watcher/ with its offsets, locks and live-presence snapshots</td></tr>
            </tbody>
          </table>
        </div>
        <p class="wiki-note">Everything lives under the directory you launched
        from, so an install is self-contained: move or delete it as one
        folder. The Setup tab can point Quirq at a different projects root or
        state root later; it saves them to <code>roots.env</code> in the state
        root and the server reads that file at startup, so the change lands on
        the next start and shows as a restart reason until then.</p>
      </section>

      <section class="wiki-section">
        <h2>One stable local address</h2>
        <div class="wiki-decision-list">
          <div><b>Browser address</b><p>Open
          <code>http://localhost:5002/space/</code>.</p></div>
          <div><b>Changing the port</b><p>Every value is overridable from the
          environment, but with a piped command the assignment belongs to the
          shell that runs the installer, not to <code>curl</code>:
          <code>curl -fsSL https://www.quirq.ai/install | PORT=8080 sh</code>.
          First-run choices are recorded in the checkout's <code>.env</code>,
          written once and never rewritten.</p></div>
          <div><b>Port 5002 is already busy</b><p>The installer fails clearly
          so it never replaces or stops another local service; set
          <code>PORT</code> to run a second instance. (When the server
          resolves its own port, e.g. contributor mode, it falls back to
          5003 automatically.)</p></div>
          <div><b>Binding</b><p>The server listens on
          <code>127.0.0.1</code> by default; override <code>HOST</code>
          deliberately if you need more.</p></div>
        </div>
      </section>

      <section class="wiki-section">
        <h2>Verify the running server</h2>
        <div class="wiki-recipe">
          <div class="wiki-recipe-step"><small>1</small><b>Health</b>
          <code>curl http://127.0.0.1:5002/health</code>
          <p>Use the selected port and expect
          <code>"status":"healthy"</code>.</p></div>
          <i>→</i>
          <div class="wiki-recipe-step"><small>2</small><b>XO root</b>
          <code>curl http://127.0.0.1:5002/api/config/workspace</code>
          <p>The response is
          <code>{"roots":{…},"default":"&lt;backend&gt;"}</code>: the entry named
          by <code>default</code> is your projects root and should be the
          directory you launched the installer from. The other entries are each
          installed backend's native home.</p></div>
          <i>→</i>
          <div class="wiki-recipe-step"><small>3</small><b>Projects</b>
          <code>curl http://127.0.0.1:5002/api/xo-projects</code>
          <p>Confirm the expected project ids are discovered.</p></div>
        </div>
      </section>

      <section class="wiki-section wiki-grid">
        <div>
          <h2>Stop, update, restart</h2>
          <code>Ctrl-C</code>
          <p>The server runs in the foreground; nothing supervises it, so
          the Setup tab cannot restart it for you. Stop it with Ctrl-C and
          re-run the installer command to update and restart. The Setup tab can
          fast-forward the checkout in place instead of a re-run, but the
          running process keeps the old code — and a root saved there keeps the
          old root — until it is stopped and started again. Projects and
          <code>./.quirq</code> stay put.</p>
        </div>
        <div>
          <h2>Contributor mode</h2>
          <code>./cowork-api.sh dev</code>
          <p>From a checkout you manage yourself, this alternate path
          creates a <code>venv</code>, installs dependencies, enables
          reload, and uses the same port fallback. The installer never runs
          git against a checkout you cloned by hand.</p>
        </div>
      </section>

      <section class="wiki-section">
        <h2>Coding-runtime boundary</h2>
        <p>The installer sets up the API, not any agent CLI: it never runs
        <code>apt-get</code>, pipes another installer to your shell, or
        installs npm packages behind your back. Space, project APIs, the
        Wiki, and watcher metadata all work without a CLI; chat needs one
        you install yourself, e.g.
        <code>npm install -g @anthropic-ai/claude-code</code>.</p>
        <p>To opt back into the automatic bootstrap of apt packages, Node,
        and the CLI, start with <code>QUIRQ_SKIP_BOOT_INSTALL=0</code>.</p>
      </section>

      <aside class="wiki-callout">
        <b>Versioned source document</b>
        <p>The complete installation and troubleshooting guide is maintained
        in <code>INSTALLATION.md</code>, including configuration precedence,
        root-nesting rules, and the Windows (WSL) note. The projects root
        and the <code>.quirq</code> state root stay separate by design.</p>
      </aside>
    </article>`;
}

function watcherArticle(){
  return`
    <article class="wiki-article">
      <header class="wiki-hero">
        <div class="wiki-kicker">Runtime systems · Watcher</div>
        <h1>How the watcher works</h1>
        <p>The watcher is a configurable, non-fatal projection loop. It can
        tail only the selected runtime or combine every mounted supported
        runtime, converts records into a small event vocabulary, and fans those
        events into independently owned documents.</p>
        <div class="wiki-facts">
          <span>0.25–60 second polling loop</span>
          <span>active or all mounted sources</span>
          <span>atomic snapshots</span>
          <span>append-only timelines</span>
        </div>
      </header>

      <section class="wiki-section">
        <h2>One tick, in order</h2>
        <ol class="wiki-steps">
          <li><b>Drain configured sources.</b><p><code>AGENT_NAME</code>
          still chooses the chat backend. The Setup tab separately chooses
          active-only or all-mounted watcher mode; each source tails native
          files or polls a database and emits normalized events only for
          sessions mapped to XO projects.</p></li>
          <li><b>Refresh the model cache.</b><p><code>UsageObserved</code>
          events update an in-memory session-to-model map. Presence uses this
          map because the activity schema requires an agent/model identity.</p></li>
          <li><b>Group by project.</b><p>Events without a resolved
          <code>project_id</code> do not enter project sinks. This prevents
          unrelated runtime conversations from polluting project history.</p></li>
          <li><b>Run project sinks.</b><p>Identity is filled first; session
          augmentation, todos, stats, and timeline follow. Each sink owns its
          document and uses atomic replacement or append-only JSONL.</p></li>
          <li><b>Refresh presence.</b><p>Every configured source is asked for
          a fresh process snapshot. The loop then runs over every discovered
          project, not only the ones with events this tick: each gets a new
          activity file, even when empty, so exited sessions disappear promptly,
          and each gets an idempotent identity fill so a scaffolded project
          cannot sit on <code>_template: true</code> until its first event.</p></li>
          <li><b>Rebuild workspace views.</b><p>The workspace document is
          rewritten first, then the three Space payloads —
          <code>&lt;XO root&gt;/.xo/space.json</code>,
          <code>dashboard.json</code> and <code>sessions.json</code> — then the
          unions of stats, live activity, sessions and augment data. The payload
          rebuild walks every mapped file in every project, so it throttles
          itself to one pass per <code>XO_VIEWS_REFRESH_S</code> (default 30s);
          a request to <code>/xo/*.json</code> rebuilds a file older than
          <code>XO_VIEW_MAX_AGE_S</code> (default 120s) itself, so those routes
          still answer with the watcher switched off. Timeline events are tagged
          with <code>project_id</code> as they are emitted.</p></li>
        </ol>
      </section>

      <section class="wiki-section">
        <h2>Normalized events and their destinations</h2>
        <div class="wiki-table-wrap">
          <table class="wiki-table">
            <thead><tr><th>Observation</th><th>Retained data</th><th>Destinations</th></tr></thead>
            <tbody>
              <tr><td>SessionFirstSeen</td><td>time, runtime, native session id, project</td><td>session augment, todos session bucket, stats timing, timeline</td></tr>
              <tr><td>MessageObserved</td><td>role and time; no message text</td><td>message counters, daily message buckets, activity timing</td></tr>
              <tr><td>UsageObserved</td><td>input/output/cache tokens, model, optional response latency</td><td>stats, per-model rollups, in-memory presence model cache</td></tr>
              <tr><td>ToolUseObserved</td><td>tool name only; no arguments</td><td>tool call counters and per-tool analytics</td></tr>
              <tr><td>TaskCreated / changed</td><td>id, content, description, active form, status</td><td>todos, task counters, added/completed timeline events</td></tr>
              <tr><td>FileTouched</td><td>project-relative path and created/edited flag</td><td>unique-file stats and file timeline events</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="wiki-section">
        <h2>Runtime coverage is intentionally honest</h2>
        <div class="wiki-table-wrap">
          <table class="wiki-table wiki-matrix">
            <thead><tr><th>Runtime</th><th>Messages</th><th>Tokens</th><th>Tools</th><th>Files</th><th>Tasks</th><th>Presence</th></tr></thead>
            <tbody>
              <tr><td>Claude Code</td><td>yes</td><td>yes</td><td>yes</td><td>yes</td><td>native task pairing</td><td>PID session files</td></tr>
              <tr><td>OpenClaw</td><td>yes</td><td>yes</td><td>yes</td><td>not yet</td><td>todo API</td><td>not yet</td></tr>
              <tr><td>Hermes</td><td>yes</td><td>not exposed</td><td>yes</td><td>not yet</td><td>todo API</td><td>not available</td></tr>
              <tr><td>Antigravity</td><td>yes</td><td>separate usage capability</td><td>yes</td><td>supported write tools</td><td>todo API</td><td>short-lived process</td></tr>
            </tbody>
          </table>
        </div>
        <p class="wiki-note">An empty value is preferable to invented telemetry.
        Pages and flows should display “not available” separately from a real
        numeric zero.</p>
      </section>

      <section class="wiki-section wiki-grid">
        <div>
          <h2>Atomicity and coordination</h2>
          <p>JSON snapshots are written to a temporary sibling, flushed, and
          replaced. Timelines append complete JSON lines. Because both the
          watcher and todo API can update <code>todos.json</code>, they share
          advisory locks under <code>&lt;state root&gt;/watcher/locks/</code> —
          <code>~/.quirq/watcher/locks/</code> unless
          <code>QUIRQ_STATE_ROOT</code> moves it, which the native installer
          does.</p>
        </div>
        <div>
          <h2>Turning it off</h2>
          <p><code>QUIRQ_WATCHER_ENABLED</code> (default true) gates the whole
          loop, and the Setup tab exposes it. With the watcher off, per-project
          <code>.xo</code> output and live presence stop being refreshed, and
          the three workspace view files stop being rebuilt on a schedule —
          <code>/xo/*.json</code> then builds each one on demand the first time
          a request finds it missing or older than
          <code>XO_VIEW_MAX_AGE_S</code>. The tick rate is
          <code>QUIRQ_WATCHER_INTERVAL_SECONDS</code> (default 1s, clamped to
          0.25–60) and coverage is <code>QUIRQ_WATCHER_SOURCE_MODE</code>
          (<code>active</code> or <code>all</code>).</p>

          <h2>Failure behavior</h2>
          <p>A source, project sink batch, presence sink, or workspace
          aggregation can fail without stopping FastAPI. The error is logged
          and the next tick retries. Readers therefore need to tolerate a
          temporarily stale snapshot.</p>
        </div>
      </section>

      <aside class="wiki-callout">
        <b>Ownership rule</b>
        <p>Agents do not edit watcher files. Use native task tools or the todo
        API for mutations, and use the visualizer APIs for reads.</p>
      </aside>
    </article>`;
}

function xoDataArticle(){
  return`
    <article class="wiki-article">
      <header class="wiki-hero">
        <div class="wiki-kicker">Data catalog · Portable metadata</div>
        <h1>Everything in <code>.xo</code></h1>
        <p>There are two tiers: one <code>.xo</code> inside each project and
        one at the projects root. The project tier describes one body of work;
        the workspace tier is a materialized cross-project view.</p>
        <div class="wiki-facts">
          <span>service-owned</span>
          <span>project tier</span>
          <span>workspace tier</span>
          <span>not a transcript store</span>
        </div>
      </header>

      <section class="wiki-section">
        <h2>Project tier · <code>&lt;project&gt;/.xo/</code></h2>
        <div class="wiki-file-list">
          <article class="wiki-file">
            <header><code>project.json</code><span>scaffold + watcher</span></header>
            <p>Project metadata. The template starts with
            <code>_template: true</code>; first watcher discovery fills
            <code>schema</code>, UUID <code>pid</code>, <code>name</code>,
            <code>owner_user_id</code>, and <code>created_at</code>. Identity
            itself comes from the folder: <code>list_projects()</code>
            overwrites <code>name</code> with the directory name and drops a
            <code>display_name</code> that only echoes a stale stored name, so
            a renamed folder cannot point readers at the wrong project.</p>
            <dl><div><dt>Used for</dt><dd>project discovery, ownership, description, and an optional <code>category</code>/<code>classification</code> override for the Dashboard</dd></div><div><dt>Lifecycle</dt><dd>one-time identity fill; <code>display_name</code> and <code>description</code> can be updated later, but the directory name is always the id</dd></div></dl>
          </article>

          <article class="wiki-file">
            <header><code>agent.json</code><span>optional · adapter-owned</span></header>
            <p>Backend-specific agent attachment for adapters that model an
            agent as an XO project. Common values include id, display name,
            description, backend, and creation time.</p>
            <dl><div><dt>Used for</dt><dd>agent sidebar and agent detail routes</dd></div><div><dt>Present when</dt><dd>a supporting adapter creates or attaches an agent</dd></div></dl>
          </article>

          <article class="wiki-file">
            <header><code>sessions/sessionslist.json</code><span>adapter-owned</span></header>
            <p>A flat map keyed by a composite cowork session key. Each row
            carries <code>sessionId</code>, <code>nativeSessionId</code>,
            absolute <code>directory</code>, <code>backend</code>,
            <code>updatedAt</code>, and optional cumulative token/cost usage.</p>
            <dl><div><dt>Used for</dt><dd>session discovery, resume lookup, usage summaries, mapping runtime logs to projects</dd></div><div><dt>API safety</dt><dd>the absolute directory is not exposed by visualizer presenters</dd></div></dl>
          </article>

          <article class="wiki-file">
            <header><code>sessions/sessions-augment.json</code><span>watcher-owned</span></header>
            <p>Fields the adapter index does not own: message totals and
            role split, tool calls, task counts by status, first/last
            activity, <code>ended_at</code>, and episodic memory references.
            A private <code>_task_states</code> map preserves correct task
            transitions across restarts.</p>
            <dl><div><dt>Join key</dt><dd>the same composite key as sessionslist whenever available</dd></div><div><dt>Read behavior</dt><dd>BFF merges base and augment rows; unmatched augment rows are dropped</dd></div></dl>
          </article>

          <article class="wiki-file">
            <header><code>todos.json</code><span>watcher + todo API</span></header>
            <p>Session buckets containing runtime, optional native source
            path, session start time, and todos. Todo fields include id,
            content, status, optional description, and optional active form.</p>
            <dl><div><dt>Status values</dt><dd>pending, in_progress, completed, cancelled, blocked</dd></div><div><dt>API safety</dt><dd>source_file is always returned as null</dd></div></dl>
          </article>

          <article class="wiki-file">
            <header><code>stats.json</code><span>watcher-owned</span></header>
            <p>Rolling 7-day and 30-day totals plus
            <code>by_session</code>, <code>by_runtime</code>, and up to about
            35 UTC days in <code>by_day</code>. Tracks tokens, models, tool
            counts, files, durations, messages, cache tokens, and bounded
            response-latency samples when the runtime provides them.</p>
            <dl><div><dt>Private fields</dt><dd>_session_totals and _by_day_totals make incremental updates restart-safe</dd></div><div><dt>API safety</dt><dd>presenters project only named public fields</dd></div></dl>
          </article>

          <article class="wiki-file">
            <header><code>timeline.jsonl</code><span>watcher-owned</span></header>
            <p>Append-only, one JSON object per line. Current watcher events
            include session started, todo added/completed, and file
            created/edited. Each record has time, type, session id, runtime,
            and event-specific safe fields.</p>
            <dl><div><dt>Retention</dt><dd>rotates at 8 MB; keeps five timestamped project rotations</dd></div><div><dt>Read pattern</dt><dd>newest-first API pagination with optional type filters</dd></div></dl>
          </article>

          <article class="wiki-file">
            <header><code>peers.json</code><span>schema-defined · scaffolded</span></header>
            <p>Human collaborator roster: user id, owner/collaborator/viewer
            role, add time, and optional endpoint and label. An empty list
            means the project is currently solo.</p>
            <dl><div><dt>Not derived from</dt><dd>runtime logs</dd></div><div><dt>Do not</dt><dd>invent peers from open sessions</dd></div></dl>
          </article>

          <article class="wiki-file">
            <header><code>sync.json</code><span>schema-defined · reserved</span></header>
            <p>Per-peer synchronization state: vector clock, manifest hash,
            last pull/push timestamps, pending outbox count, and overall last
            sync time. Both peers.json and sync.json are scaffolded empty from
            the project template today; their shapes are fixed by the bundled
            schemas, and no service in this build writes them yet.</p>
            <dl><div><dt>Used for</dt><dd>conflict-aware project synchronization</dd></div><div><dt>Not activity</dt><dd>it describes replication progress, not current presence</dd></div></dl>
          </article>
        </div>
      </section>

      <section class="wiki-section">
        <h2>Workspace tier · <code>&lt;XO root&gt;/.xo/</code></h2>
        <p>Space reads its data from here, not from the application folder.
        <code>space.json</code>, <code>dashboard.json</code> and
        <code>sessions.json</code> are served one for one at
        <code>GET /xo/space.json</code>, <code>/xo/dashboard.json</code> and
        <code>/xo/sessions.json</code> — an explicit allowlist rather than a
        static mount, because this directory also holds the capability
        manifest, the session index and the workspace timeline. The older
        <code>/space/data/</code> routes for these three are gone.</p>
        <p class="wiki-note">Two numbers govern freshness. The watcher rebuilds
        the three files at most every <code>XO_VIEWS_REFRESH_S</code>
        (default 30s), because the build walks every mapped file in the
        workspace. A request rebuilds one only once it is older than
        <code>XO_VIEW_MAX_AGE_S</code> (default 120s), so a reader can be up to
        two minutes behind before anything is regenerated on their behalf —
        and with the watcher disabled, the first request is what builds
        them.</p>
        <div class="wiki-table-wrap">
          <table class="wiki-table">
            <thead><tr><th>File</th><th>What it contains</th><th>How it is produced</th></tr></thead>
            <tbody>
              <tr><td><code>space.json</code></td><td>The workspace graph the Graph, Tree and Files List read: projects, folders, files, derived ties, git history.</td><td>watcher, at most every XO_VIEWS_REFRESH_S (30s), plus on-demand when a request finds it stale</td></tr>
              <tr><td><code>dashboard.json</code></td><td>The same scan collapsed into five purpose environments.</td><td>same tick as space.json — one scan feeds both</td></tr>
              <tr><td><code>sessions.json</code></td><td>Session telemetry merged across every runtime that reports it.</td><td>same tick</td></tr>
              <tr><td><code>workspace.json</code></td><td>Workspace identity only: schema, update time, the projects root, and the discovered project ids. The derived views sit beside it in their own files — <code>space.json</code>, <code>dashboard.json</code>, <code>sessions.json</code> — so a reader that wants session telemetry does not parse the graph to get it.</td><td>rewritten by the watcher on every tick; cheap (small JSON, one iterdir of the workspace root)</td></tr>
              <tr><td><code>sessions/sessionslist.json</code></td><td>union of every project’s adapter session rows</td><td>rebuilt every tick</td></tr>
              <tr><td><code>sessions/sessions-augment.json</code></td><td>union of watcher session enrichments</td><td>rebuilt every tick</td></tr>
              <tr><td><code>stats.json</code></td><td>summed project windows, runtimes, sessions, days, models, tools, and latency</td><td>recomputed from project stats</td></tr>
              <tr><td><code>timeline.jsonl</code></td><td>project events plus <code>project_id</code></td><td>appended during each project sink batch; no workspace rotation yet</td></tr>
              <tr><td><code>xo.json</code></td><td>active agent capability flags and supported live model/channel status</td><td>written at server startup and patched by status probes</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="wiki-section wiki-grid">
        <div>
          <h2>Legacy compatibility</h2>
          <p>Some session readers accept the former
          <code>sessions/sessions.json</code> index when
          <code>sessionslist.json</code> is absent. New writes target
          <code>sessionslist.json</code>. Project and workspace
          <code>.xo/activity.json</code> files are no longer scaffolded or
          written; live presence lives under
          <code>~/.quirq/watcher/activity/</code>. A leftover copy is detected,
          never read: the catalog counts it as
          <code>legacy_activity_files</code> and the Quirq view points at it.</p>
        </div>
        <div>
          <h2>What is not here</h2>
          <p>Full prompt/response transcripts, file contents, tool arguments,
          watcher byte cursors, lock state, and process heartbeats do not
          belong in project <code>.xo</code>.</p>
        </div>
      </section>

      <aside class="wiki-callout">
        <b>Read, do not hand-edit</b>
        <p>The service, adapters, and todo API own these documents;
        peers.json and sync.json are scaffold-only, reserved for future
        collaboration and sync services. Direct edits can be overwritten or
        break writer coordination.</p>
      </aside>
    </article>`;
}

function quirqDataArticle(){
  return`
    <article class="wiki-article">
      <header class="wiki-hero">
        <div class="wiki-kicker">Data catalog · Machine-local state</div>
        <h1>Everything in <code>~/.quirq</code></h1>
        <p>This directory helps one Quirq installation operate safely and
        resume efficiently. It is not project memory and is never a source for
        backup, collaboration, or cross-machine history.</p>
        <div class="wiki-facts">
          <span>local only</span>
          <span>contains secrets</span>
          <span>no transcripts</span>
          <span>never project-synced</span>
        </div>
      </header>

      <section class="wiki-section">
        <h2>Directory map</h2>
        <pre class="wiki-tree">~/.quirq/
├── state.json
├── runtime.env                 # mode 0600; typed restart-time controls
├── roots.env                   # mode 0600; storage roots, read at server startup
├── quirq.log                   # server output appended by the installer's run loop
├── secrets.env                 # mode 0600; write-only credentials from Setup
└── watcher/
    ├── offsets.json
    ├── hermes-offsets.json       # only when the Hermes source is watched
    ├── locks/
    │   └── todos.json.&lt;hash&gt;.lock
    └── activity/
        ├── projects/
        │   └── &lt;project-id&gt;.json
        └── workspace.json</pre>
      </section>

      <section class="wiki-section">
        <h2>File-by-file catalog</h2>
        <div class="wiki-file-list">
          <article class="wiki-file">
            <header><code>state.json</code><span>installation state</span></header>
            <p>Currently stores <code>onboarding_completed</code> and
            <code>onboarding_completed_at</code>. Disk persistence prevents
            first-run onboarding from returning after browser storage is
            cleared or an incognito window is used.</p>
            <dl><div><dt>Writer</dt><dd>onboarding API</dd></div><div><dt>Scope</dt><dd>one machine / one local service user</dd></div></dl>
          </article>

          <article class="wiki-file">
            <header><code>roots.env</code><span>storage root configuration</span></header>
            <p>Stores the absolute host paths selected for the XO projects
            root and machine-local Quirq state root. The server reads this
            file at startup, before runtime.env, so the XO root saved in
            Setup becomes the one root every tab resolves through
            <code>project_layout.xo_projects_root()</code>. A value exported
            by the shell or the container still outranks it. Roots are
            import-time state: the running server cannot change its own, so
            Setup marks a saved change pending until a restart (on a managed
            container, the one-command installer, which also remaps the bind
            mounts).</p>
            <dl><div><dt>Writer</dt><dd>typed root configuration API</dd></div><div><dt>Migration</dt><dd>empty state targets receive a copy; project roots are selected, never moved</dd></div></dl>
          </article>

          <article class="wiki-file">
            <header><code>runtime.env</code><span>validated process configuration</span></header>
            <p>Stores only allowlisted non-secret controls selected in Setup:
            active agent backend, whether the watcher runs, whether it combines
            every mounted source, and the watcher tick interval. The page
            compares saved values with the running process and shows a pending
            restart instead of claiming they applied live.</p>
            <dl><div><dt>Writer</dt><dd>typed runtime configuration API</dd></div><div><dt>Apply</dt><dd>loaded before agent adapters at the next process start</dd></div></dl>
          </article>

          <article class="wiki-file">
            <header><code>secrets.env</code><span>sensitive environment values</span></header>
            <p>Stores the key/value pairs saved through the Setup tab. The
            curated list API returns names and a fixed mask only, and the tab
            never reads saved plaintext back; plaintext is reachable only
            through the single-key reveal endpoint and the legacy
            /api/secrets/env route. The file is written atomically with
            owner-only permissions and loaded when Quirq starts.</p>
            <dl><div><dt>Writer</dt><dd>curated secrets API</dd></div><div><dt>Delete effect</dt><dd>removes the value from disk and from new child-process environments</dd></div></dl>
          </article>

          <article class="wiki-file">
            <header><code>watcher/offsets.json</code><span>JSONL cursor store</span></header>
            <p>A map from absolute native log path to
            <code>{offset, inode}</code>. The byte offset says where the next
            tail starts; inode detects rotation or replacement. It contains
            file locations, not log contents.</p>
            <dl><div><dt>Why it matters</dt><dd>prevents re-reading and double-counting old runtime events after restart</dd></div><div><dt>Recovery</dt><dd>missing/corrupt means replay from byte zero; sinks provide partial idempotency</dd></div></dl>
          </article>

          <article class="wiki-file">
            <header><code>watcher/hermes-offsets.json</code><span>Hermes cursor store</span></header>
            <p>Maps <code>&lt;profile&gt;:&lt;session-id&gt;</code> to the most
            recent SQLite message row id. Hermes uses database row cursors
            because its native history is SQLite rather than JSONL.</p>
            <dl><div><dt>Present when</dt><dd>the Hermes visualizer source observes mapped sessions</dd></div><div><dt>Contains</dt><dd>cursor integers, not messages or token data</dd></div></dl>
          </article>

          <article class="wiki-file">
            <header><code>watcher/locks/*.lock</code><span>coordination sentinels</span></header>
            <p>Empty advisory lock files for data with multiple writers,
            currently project <code>todos.json</code>. The filename combines
            the guarded basename with an eight-character hash of its absolute
            path, keeping different projects separate.</p>
            <dl><div><dt>Lifetime</dt><dd>files may remain; the kernel releases the actual lock when the descriptor closes</dd></div><div><dt>Timeout</dt><dd>bounded wait prevents a stalled writer from wedging an API call</dd></div></dl>
          </article>

          <article class="wiki-file">
            <header><code>watcher/activity/projects/&lt;id&gt;.json</code><span>live project presence</span></header>
            <p>A heartbeat snapshot with schema and update time plus open
            sessions. Each row contains native session id, runtime, model,
            local user id, opened time, last activity time, and optional host.</p>
            <dl><div><dt>Refresh</dt><dd>every watcher tick for every discovered project</dd></div><div><dt>Meaning</dt><dd>“observably open now,” not historical work or a durable audit record</dd></div></dl>
          </article>

          <article class="wiki-file">
            <header><code>watcher/activity/workspace.json</code><span>live workspace presence</span></header>
            <p>The union of all project activity rows. It uses the same
            activity schema and adds <code>project_id</code> to each session
            row so workspace UIs can group live work.</p>
            <dl><div><dt>Read API</dt><dd>GET /api/xo-projects/activity</dd></div><div><dt>Project API</dt><dd>GET /api/xo-projects/{project_id}/activity</dd></div></dl>
          </article>
        </div>
      </section>

      <section class="wiki-section">
        <h2>Rename and migration behavior</h2>
        <div class="wiki-decision-list">
          <div><b>All new writes use <code>~/.quirq</code>.</b><p>Activity,
          locks, onboarding, shared JSONL offsets, and Hermes offsets no
          longer target <code>~/.xo-cowork</code>.</p></div>
          <div><b>Important cursors migrate safely.</b><p>If the new file is
          absent, valid legacy onboarding and offset state is read once and
          rewritten under <code>.quirq</code>. This avoids onboarding resets
          and accidental runtime-log replay.</p></div>
          <div><b>Ephemeral state is regenerated.</b><p>Presence and advisory
          lock files are created fresh in <code>.quirq</code>; old copies are
          not authoritative.</p></div>
          <div><b>The old directory is not auto-deleted.</b><p>Leaving it
          untouched makes rollback safe. Once the new installation has run
          successfully, it is merely legacy residue.</p></div>
        </div>
      </section>

      <section class="wiki-section wiki-grid">
        <div>
          <h2>What it does collect</h2>
          <p>Local onboarding flags, runtime-log file paths, byte/inode or row
          cursors, hashed lock identifiers, session/runtime/model/user
          identity, live timing metadata, and environment values explicitly
          saved by the user through Setup.</p>
        </div>
        <div>
          <h2>What it does not collect</h2>
          <p>Prompt text, assistant responses, file contents, tool arguments,
          project plans, durable todo history, peer rosters, or sync manifests.
          It does not discover or copy credentials from other applications.</p>
        </div>
      </section>

      <aside class="wiki-callout">
        <b>Reset semantics</b>
        <p>Deleting <code>.quirq</code> discards local onboarding and watcher
        progress, so the watcher may replay native records. It also permanently
        deletes runtime configuration and credentials saved through Setup. It does not delete project work
        or the runtime’s original conversations.</p>
      </aside>
    </article>`;
}

function flowsArticle(){
  return`
    <article class="wiki-article">
      <header class="wiki-hero">
        <div class="wiki-kicker">Design guide · Read paths</div>
        <h1>Building useful flows</h1>
        <p>Good flows begin with a question, choose the smallest authoritative
        API, and make freshness and missing telemetry visible. These recipes
        keep UI code independent of disk layout.</p>
        <div class="wiki-facts">
          <span>question first</span>
          <span>API over paths</span>
          <span>index before detail</span>
          <span>zero ≠ unavailable</span>
        </div>
      </header>

      <section class="wiki-section">
        <h2>Flow 0 · “What does Space itself read?”</h2>
        <div class="wiki-recipe">
          <div class="wiki-recipe-step"><small>1</small><b>The map</b><code>GET /xo/space.json</code><p>Projects, folders, files, derived ties and per-project git history. Graph, Tree and the Files List’s file counts all read this one payload.</p></div>
          <i>→</i>
          <div class="wiki-recipe-step"><small>2</small><b>The projection</b><code>GET /xo/dashboard.json</code><p>The same scan collapsed into five purpose environments. Same schema, so one renderer serves both.</p></div>
          <i>→</i>
          <div class="wiki-recipe-step"><small>3</small><b>The telemetry</b><code>GET /xo/sessions.json</code><p>Session totals merged across every runtime that reports them, with unavailable sources named rather than hidden.</p></div>
        </div>
        <p>These three are files, not computations: they live at
        <code>&lt;XO root&gt;/.xo/{space,dashboard,sessions}.json</code> and the
        route hands over what the watcher wrote. Read them for anything
        workspace-wide; reach for the per-project <code>/api/*</code> endpoints
        below when you need one project’s live detail, which these files
        deliberately do not carry.</p>
      </section>

      <section class="wiki-section">
        <h2>Flow 1 · “What is happening right now?”</h2>
        <div class="wiki-recipe">
          <div class="wiki-recipe-step"><small>1</small><b>Workspace presence</b><code>GET /api/xo-projects/activity</code><p>Get all observably open sessions with project ids.</p></div>
          <i>→</i>
          <div class="wiki-recipe-step"><small>2</small><b>Group and label</b><p>Group by project, show runtime/model, and display the response’s update timestamp.</p></div>
          <i>→</i>
          <div class="wiki-recipe-step"><small>3</small><b>Drill into project</b><code>GET /api/xo-projects/{id}/activity</code><p>Use the project endpoint when the selected scope changes.</p></div>
        </div>
        <p class="wiki-note">Do not infer “idle” for a runtime that does not
        support presence. Show “presence unavailable” when runtime coverage is
        absent.</p>
      </section>

      <section class="wiki-section">
        <h2>Flow 2 · “What happened, and in what order?”</h2>
        <div class="wiki-recipe">
          <div class="wiki-recipe-step"><small>1</small><b>Fetch recent events</b><code>GET /api/xo-projects/{id}/timeline?limit=100</code><p>Render newest-first with event-specific labels.</p></div>
          <i>→</i>
          <div class="wiki-recipe-step"><small>2</small><b>Filter intentionally</b><code>?types=session.started,file.edited</code><p>Use server filtering for focused audit views.</p></div>
          <i>→</i>
          <div class="wiki-recipe-step"><small>3</small><b>Page by cursor</b><code>?before=&lt;next_cursor&gt;</code><p>Continue without loading an unbounded JSONL history.</p></div>
        </div>
      </section>

      <section class="wiki-section">
        <h2>Flow 3 · “Which session should I inspect?”</h2>
        <div class="wiki-recipe">
          <div class="wiki-recipe-step"><small>1</small><b>Start from the index</b><code>GET /api/xo-projects/{id}/usage/sessions</code><p>Sort by last activity and show token totals and message counts; derive the runtime from the composite key. Sort by last activity and show token totals and message counts; derive the runtime from the composite key. Task counters are on neither the index nor the session detail — the watcher's <code>taskCount</code> stops at the disk row. Fetch <code>GET /api/xo-projects/{id}/todos</code> for task state.</p></div>
          <i>→</i>
          <div class="wiki-recipe-step"><small>2</small><b>Select one identity</b><p>Keep the composite key as the stable list identity; native session id is also accepted for lookup.</p></div>
          <i>→</i>
          <div class="wiki-recipe-step"><small>3</small><b>Load detail</b><code>GET /api/xo-projects/{id}/usage/sessions/{session_id}</code><p>Fetch the heavier summary only after selection.</p></div>
        </div>
      </section>

      <section class="wiki-section">
        <h2>Flow 4 · “How is work trending?”</h2>
        <div class="wiki-recipe">
          <div class="wiki-recipe-step"><small>1</small><b>Choose scope</b><code>/api/xo-projects/usage/analytics</code><p>Use the workspace route or insert <code>/{id}</code> for one project.</p></div>
          <i>→</i>
          <div class="wiki-recipe-step"><small>2</small><b>Choose a window</b><code>?days=7</code><p>Keep tokens, models, tools, messages, and latency on the same time window.</p></div>
          <i>→</i>
          <div class="wiki-recipe-step"><small>3</small><b>Explain gaps</b><p>Label unavailable token or latency telemetry by runtime rather than silently treating it as zero.</p></div>
        </div>
      </section>

      <section class="wiki-section">
        <h2>Flow 5 · “What work is in flight?”</h2>
        <div class="wiki-recipe">
          <div class="wiki-recipe-step"><small>1</small><b>Read project todos</b><code>GET /api/xo-projects/{id}/todos</code><p>Group todo lists by session and runtime.</p></div>
          <i>→</i>
          <div class="wiki-recipe-step"><small>2</small><b>Mutate through one lane</b><p>Claude Code uses native task tools; other runtimes use POST/PATCH/DELETE todo endpoints.</p></div>
          <i>→</i>
          <div class="wiki-recipe-step"><small>3</small><b>Reflect lifecycle</b><p>Make pending, in-progress, completed, blocked, and cancelled visually distinct.</p></div>
        </div>
      </section>

      <section class="wiki-section">
        <h2>Flow quality checklist</h2>
        <div class="wiki-check-grid">
          <div><b>Authority</b><p>Is this API the source for the question, or
          are you deriving the answer from a weaker proxy?</p></div>
          <div><b>Scope</b><p>Is the user looking at one project or the
          workspace aggregate? Keep the distinction visible.</p></div>
          <div><b>Freshness</b><p>Show <code>updated_at</code> for snapshots;
          do not present a stale heartbeat as live truth.</p></div>
          <div><b>Identity</b><p>Preserve project id, composite session key,
          native session id, runtime, and model as different concepts.</p></div>
          <div><b>Availability</b><p>Separate missing runtime support from a
          valid zero and from a temporarily empty state.</p></div>
          <div><b>Privacy</b><p>Use BFF responses. Never expose internal
          directories, native source paths, or private accumulator keys.</p></div>
          <div><b>Bounded reads</b><p>Use windows, limits, filters, and cursors
          instead of loading whole timelines or every session detail.</p></div>
          <div><b>Mutation lane</b><p>Use the one documented writer for a
          change so watcher and API state do not diverge.</p></div>
        </div>
      </section>

      <aside class="wiki-callout">
        <b>Debugging sequence</b>
        <p>If a flow looks wrong: check API health, inspect the response’s
        update time, confirm runtime coverage, compare project and workspace
        scope, then inspect server watcher logs. Filesystem inspection is a
        diagnostic last step, not an application integration.</p>
      </aside>
    </article>`;
}
