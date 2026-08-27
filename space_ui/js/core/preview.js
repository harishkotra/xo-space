/* File previewer — a floating window that renders one file from a project.

   Lives in core/, not in a view, because three surfaces open it (the Tree
   lens, the Files explorer, the graph's detail panel) and views never import
   each other. They dispatch `space:preview-file` with {project, path, name}
   and this module owns everything after that.

   It floats over the stage rather than docking to an edge: the window is
   draggable by its header and resizable from its corner, and it keeps
   whatever place the user drags it to for the rest of the session — the view
   underneath never moves, which is the point of previewing.

   Rendering rules, in order of how much they matter:
     - markdown goes through core/markdown.js, which escapes before it
       transforms and emits only fixed attribute-free tags;
     - HTML from disk is NEVER injected into this document. It renders in an
       iframe with an empty sandbox: no scripts, no same-origin, no forms, no
       top-level navigation. A file in the workspace is not trusted content —
       an agent wrote it — and the app it would otherwise be running inside
       holds the user's session;
     - anything else renders as escaped source text.
   The Source toggle shows raw text for every kind, which is also the escape
   hatch when a render looks wrong.

   The History button swaps the document for the file's git log (the
   /file-history endpoint): who edited it, when, and how much. It is a second
   mode of the same window, not a navigation — closing history returns to the
   document exactly as it was. Each commit row expands in place into that
   commit's patch for this file (the /file-diff endpoint), added lines green,
   removed lines red; diffs load lazily and are cached per commit for as long
   as the file stays open. */
import {API_BASE,apiFetch} from './api.js';
import {mdToHtml} from './markdown.js';

const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const bytes=n=>n==null?'':n<1024?n+' B'
  :n<1048576?(n/1024).toFixed(n<10240?1:0)+' KB':(n/1048576).toFixed(1)+' MB';
function rel(iso){
  if(!iso)return'';
  const s=(Date.now()-new Date(iso).getTime())/1000;
  if(!isFinite(s))return'';
  if(s<60)return'just now';
  if(s<3600)return Math.floor(s/60)+'m ago';
  if(s<86400)return Math.floor(s/3600)+'h ago';
  return Math.floor(s/86400)+'d ago';
}

let el=null,body=null;
let current=null;   /* {project,path,name} */
let data=null;      /* the loaded payload */
let source=false;   /* Source toggle */
let mode='file';    /* 'file' | 'history' */
let hist=null;      /* the loaded /file-history payload, or null */
let diffs=null;     /* Map hash → /file-diff payload (or {error}), per file */
let token=0;        /* race guard: only the newest request may paint */

export function initPreview(){
  el=document.getElementById('preview');
  if(!el)return;
  body=el.querySelector('#preview-body');
  el.addEventListener('click',onClick);
  initDrag();
  addEventListener('space:preview-file',e=>open(e.detail||{}));
  /* The window belongs to the Files context. The three lenses (List, Graph,
     Tree) all report tab 'projects' — see registry.js — so switching between
     them keeps the file open; landing on any other tab leaves it behind, a
     file preview having nothing to say about Sessions or Secrets. */
  addEventListener('space:view',e=>{
    if(e.detail?.tab!=='projects'&&el.classList.contains('is-open'))close();
  });
  addEventListener('keydown',e=>{
    /* Escape closes the preview first; the graph's own Escape handling only
       gets it once nothing is being previewed. */
    if(e.key==='Escape'&&el.classList.contains('is-open')){e.stopPropagation();close();}
  },true);
}

/* Drag by the header. The stylesheet anchors the window to the top-right by
   default; the first drag converts that to explicit left/top once, and from
   then on the coordinates are the source of truth. Clamped so the header can
   never leave the viewport — a window you cannot grab cannot be recovered. */
function initDrag(){
  const header=el.querySelector('header');
  header.addEventListener('pointerdown',e=>{
    if(e.button!==0||e.target.closest('button'))return;
    const r=el.getBoundingClientRect();
    const dx=e.clientX-r.left,dy=e.clientY-r.top;
    el.style.left=r.left+'px';el.style.top=r.top+'px';el.style.right='auto';
    el.classList.add('is-dragging');
    header.setPointerCapture(e.pointerId);
    const move=ev=>{
      el.style.left=Math.min(Math.max(ev.clientX-dx,64-el.offsetWidth),innerWidth-64)+'px';
      el.style.top=Math.min(Math.max(ev.clientY-dy,0),innerHeight-48)+'px';
    };
    const up=()=>{
      header.removeEventListener('pointermove',move);
      header.removeEventListener('pointerup',up);
      el.classList.remove('is-dragging');
    };
    header.addEventListener('pointermove',move);
    header.addEventListener('pointerup',up);
  });
}

async function open({project,path,name}){
  if(!el||!project||!path)return;
  current={project,path,name:name||path.split('/').pop()};
  data=null;hist=null;diffs=new Map();source=false;mode='file';
  const mine=++token;
  el.classList.add('is-open');
  render('<div class="pv-note">loading…</div>');
  const res=await apiFetch(API_BASE+'/api/xo-projects/'+encodeURIComponent(project)
    +'/file?relative_path='+encodeURIComponent(path));
  if(mine!==token)return; /* a newer file is on screen */
  if(!res.ok){
    render('<div class="pv-note">'+esc(
      res.offline?'xo-space is unreachable'
      :res.status===415?'No text preview for this file type.'
      :res.error||'Could not read this file.')+'</div>');
    return;
  }
  data=res.data;
  render();
}
function close(){
  el.classList.remove('is-open');
  current=null;data=null;hist=null;diffs=null;mode='file';token++;
  if(body)body.innerHTML='';
}

function render(placeholder){
  el.querySelector('#preview-name').textContent=current?current.name:'';
  el.querySelector('#preview-path').textContent=current
    ?current.project+'/'+current.path:'';
  const meta=el.querySelector('#preview-meta');
  const toggle=el.querySelector('#preview-source');
  const histBtn=el.querySelector('#preview-history');
  histBtn.textContent=mode==='history'?'Document':'History';
  if(mode==='history'){
    meta.textContent=hist?[hist.is_repo?'git history':'no repository',
      hist.total?hist.total+(hist.total===1?' commit':' commits'):''
      ].filter(Boolean).join(' · '):'';
    toggle.hidden=true;
    body.innerHTML=placeholder||historyHTML();
    return;
  }
  if(placeholder||!data){
    meta.textContent='';
    toggle.hidden=true;
    body.innerHTML=placeholder||'';
    return;
  }
  meta.textContent=[data.kind,bytes(data.size_bytes),rel(data.modified_at),
    data.truncated?'truncated':''].filter(Boolean).join(' · ');
  toggle.hidden=false;
  toggle.textContent=source?'Rendered':'Source';
  body.innerHTML=source?sourceHTML(data)
    :data.kind==='markdown'?'<div class="pv-md">'+mdToHtml(data.content)+'</div>'
    :data.kind==='html'?frameHTML(data)
    :sourceHTML(data);
  if(data.truncated)body.insertAdjacentHTML('beforeend',
    '<div class="pv-note">Showing the first 256 KB of this file.</div>');
}
const sourceHTML=d=>'<pre class="pv-src">'+esc(d.content)+'</pre>';
/* sandbox="" is the whole point: an empty allow-list means no scripts and a
   unique opaque origin, so the document cannot reach this page, its storage,
   or the API it is served from. srcdoc keeps it out of the network entirely. */
const frameHTML=d=>'<iframe class="pv-frame" sandbox="" referrerpolicy="no-referrer" '
  +'title="'+esc(d.name)+' preview" srcdoc="'+esc(d.content)+'"></iframe>';

function historyHTML(){
  if(!hist)return'';
  if(!hist.is_repo)return'<div class="pv-note">This file is not inside a git '
    +'repository, so there is no edit history to show.</div>';
  if(!hist.items.length)return'<div class="pv-note">No commits touch this file '
    +'yet — it is new or untracked.</div>';
  return'<ol class="pv-hist">'+hist.items.map(c=>{
    const stat=(c.additions!=null||c.deletions!=null)
      ?' · <b class="pv-add">+'+(c.additions??0)+'</b> <b class="pv-del">−'+(c.deletions??0)+'</b>':'';
    /* data-path is the file's name AT that commit (renames); /file-diff
       needs it echoed back as commit_path to ask git about the right file. */
    return'<li class="pv-commit" data-hash="'+esc(c.hash)+'"'
      +(c.path?' data-path="'+esc(c.path)+'"':'')+'>'
      +'<div class="pv-hist-head"><span class="pv-caret"></span>'
      +'<code>'+esc(c.short_hash)+'</code>'
      +'<span>'+esc(c.subject)+'</span></div>'
      +'<div class="pv-hist-meta">'+esc(c.author)+' · '+(rel(c.date)||esc(c.date||''))+stat+'</div></li>';
  }).join('')+'</ol>';
}

/* One expanded commit: the unified diff classed line by line. The patch is
   plain text from git; every line is escaped, the classes only color it. */
function diffHTML(d){
  if(d.error)return'<div class="pv-note">'+esc(d.error)+'</div>';
  if(d.diff==null)return'<div class="pv-note">Could not show this commit.</div>';
  if(!d.diff.trim())return'<div class="pv-note">No line changes for this file '
    +'in this commit — a rename, merge or binary change.</div>';
  const cls=l=>
    /^(diff --git|index |--- |\+\+\+ |new file|deleted file|similarity|rename |old mode|new mode|Binary files)/.test(l)?'pv-d-meta'
    :l.startsWith('@@')?'pv-d-hunk'
    :l.startsWith('+')?'pv-d-add'
    :l.startsWith('-')?'pv-d-del':'pv-d-ctx';
  return d.diff.replace(/\n$/,'').split('\n').map(l=>
    '<div class="pv-d-line '+cls(l)+'">'+esc(l||' ')+'</div>').join('')
    +(d.truncated?'<div class="pv-note">Diff truncated — showing the first 192 KB.</div>':'');
}

async function toggleDiff(row){
  if(!row.classList.toggle('is-open')){
    const pane=row.querySelector('.pv-diff');
    if(pane)pane.hidden=true;
    return;
  }
  let pane=row.querySelector('.pv-diff');
  if(pane){pane.hidden=false;return;}
  pane=document.createElement('div');
  pane.className='pv-diff';
  pane.innerHTML='<div class="pv-note">loading diff…</div>';
  row.appendChild(pane);
  const hash=row.dataset.hash,mine=token,mydiffs=diffs;
  let d=mydiffs.get(hash);
  if(!d){
    const res=await apiFetch(API_BASE+'/api/xo-projects/'+encodeURIComponent(current.project)
      +'/file-diff?relative_path='+encodeURIComponent(current.path)
      +'&commit='+encodeURIComponent(hash)
      +(row.dataset.path?'&commit_path='+encodeURIComponent(row.dataset.path):''));
    if(mine!==token)return; /* the file changed or closed while loading */
    d=res.ok?res.data:{error:res.offline?'xo-space is unreachable'
      :res.error||'Could not read this commit.'};
    mydiffs.set(hash,d);
  }
  if(!row.isConnected)return; /* the list re-rendered under the fetch */
  pane.innerHTML=diffHTML(d);
}

async function loadHistory(){
  const mine=token; /* same-file guard: open()/close() bump the token */
  render('<div class="pv-note">reading git history…</div>');
  const res=await apiFetch(API_BASE+'/api/xo-projects/'+encodeURIComponent(current.project)
    +'/file-history?relative_path='+encodeURIComponent(current.path));
  if(mine!==token||mode!=='history')return;
  if(!res.ok){
    render('<div class="pv-note">'+esc(
      res.offline?'xo-space is unreachable':res.error||'Could not read the history.')+'</div>');
    return;
  }
  hist=res.data;
  render();
}

function onClick(e){
  if(e.target.closest('#preview-close')){close();return;}
  if(e.target.closest('#preview-source')){source=!source;render();return;}
  if(e.target.closest('#preview-history')&&current){
    mode=mode==='history'?'file':'history';
    if(mode==='history'&&!hist){loadHistory();return;}
    render();
    return;
  }
  /* A click inside an expanded diff is reading, not toggling. */
  if(e.target.closest('.pv-diff'))return;
  const row=e.target.closest('.pv-commit');
  if(row&&mode==='history'&&current)toggleDiff(row);
}
