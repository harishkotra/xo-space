/* The Snapshot view: one commit, rendered as the whole repository.

   Opened from a project's commit list in the Graph panel (never from the
   tab bar — nav:false, parent:'projects'). Views never import each other,
   so the graph dispatches `space:show-commit` with {project, sha} and then
   ctx.switchTo's here; if the event lands before this module has mounted,
   the request parks until show() consumes it.

   The picture is a squarified treemap of `GET /api/xo-projects/{id}/
   commits/{sha}/snapshot`: every file in the tree at that commit, sized by
   sqrt(bytes) so one big binary cannot flatten the map, folders as labeled
   regions. Files the commit touched are lit — added green, modified amber,
   renamed blue — everything else stays dark, so a commit reads as light on
   the map the same way a session does in Space Walk. Deleted files are by
   definition absent from the tree; they get a count in the header, not a
   ghost on the map.

   Every file rect is clickable: it opens the shared previewer pinned to
   this commit (`ref` rides the space:preview-file event), so what you read
   is what the file WAS. */
import {API_BASE,apiFetch} from '../core/api.js';

const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

let root=null,cv=null,gc=null,hc=null;
let go=()=>{};
let visible=false;
let pending=null;              /* {project,sha} parked until show() */
let cur=null;                  /* the loaded target */
let snap=null;                 /* the fetched payload */
let hits=[];                   /* laid-out file rects, hit-test order */
let hover=null;
let token=0;                   /* race guard across loads */

addEventListener('space:show-commit',e=>{
  pending={project:String(e.detail?.project||''),sha:String(e.detail?.sha||'')};
  if(visible)consumePending();
});

export default{
  id:'snapshot',label:'Snapshot',order:2.6,nav:false,parent:'projects',
  async mount(el,ctx){
    root=el;go=ctx.switchTo;
    root.innerHTML=`
      <div class="snap-head" id="snap-head"></div>
      <canvas id="snap-canvas"></canvas>
      <div class="snap-empty" id="snap-empty">
        <div class="eyebrow">Commit snapshot</div>
        <p>Open the <b>Graph</b>, click a project, and pick a commit from its
        panel to see the repository as it stood at that moment.</p>
      </div>
      <div id="snap-hc"></div>`;
    cv=root.querySelector('#snap-canvas');gc=cv.getContext('2d');
    hc=root.querySelector('#snap-hc');
    cv.addEventListener('mousemove',onMove);
    cv.addEventListener('mouseleave',()=>{setHover(null);});
    cv.addEventListener('click',onClick);
    addEventListener('resize',()=>{if(visible&&snap)layoutAndDraw();});
  },
  show(){visible=true;if(!consumePending()&&snap)layoutAndDraw();},
  hide(){visible=false;setHover(null);}
};

function consumePending(){
  if(!pending)return false;
  const t=pending;pending=null;
  if(cur&&cur.project===t.project&&cur.sha===t.sha){if(snap)layoutAndDraw();return true;}
  load(t);
  return true;
}

async function load(t){
  cur=t;snap=null;hits=[];setHover(null);
  const mine=++token;
  headHTML(`<button class="snap-back" id="snap-back">&larr; Graph</button>
    <span class="snap-loading">reading ${esc(t.project)} @ ${esc(t.sha.slice(0,7))}&hellip;</span>`);
  root.querySelector('#snap-empty').hidden=true;
  clearCanvas();
  const res=await apiFetch(API_BASE+'/api/xo-projects/'+encodeURIComponent(t.project)
    +'/commits/'+encodeURIComponent(t.sha)+'/snapshot');
  if(mine!==token)return; /* a newer commit owns the screen */
  if(!res.ok){
    headHTML(`<button class="snap-back" id="snap-back">&larr; Graph</button>
      <span class="snap-err">${esc(res.offline?'xo-cowork-api is unreachable'
        :res.error||'could not read this commit')}</span>`);
    return;
  }
  snap=res.data;
  renderHead();
  layoutAndDraw();
}

function headHTML(inner){
  const el=root.querySelector('#snap-head');
  el.innerHTML=inner;
  el.querySelector('#snap-back')?.addEventListener('click',()=>go('graph'));
}

function renderHead(){
  const c=snap.commit,t=snap.touched||{},d=snap.deleted||[];
  let a=0,m=0,r=0;
  for(const st of Object.values(t)){if(st==='A')a++;else if(st==='R')r++;else m++;}
  headHTML(`
    <button class="snap-back" id="snap-back">&larr; Graph</button>
    <div class="snap-title">
      <b>${esc(cur.project)}</b>
      <code>${esc(c.short)}</code>
      <span class="snap-subj" title="${esc(c.subject)}">${esc(c.subject)}</span>
    </div>
    <div class="snap-facts">
      <span>${esc((c.date||'').slice(0,10))}</span>
      <span>${snap.total_files.toLocaleString()} files</span>
      ${a?`<span class="tA">+${a} added</span>`:''}
      ${m?`<span class="tM">~${m} modified</span>`:''}
      ${r?`<span class="tR">&rarr;${r} renamed</span>`:''}
      ${d.length?`<span class="tD" title="${esc(d.slice(0,12).join('\n'))}">&minus;${d.length} deleted</span>`:''}
      ${snap.truncated?`<span class="tD">largest ${snap.tree.length} of ${snap.total_files} shown</span>`:''}
    </div>`);
}

/* ---------------- hierarchy + squarified layout ---------------- */

/* sqrt(bytes) sizing: a 1 MB bundle reads ~30x a 1 KB module, not 1000x,
   so small files stay visible — the same reason the screenshot's citymap
   does not become one rectangle called node_modules. */
const weightOf=size=>Math.sqrt(Math.max(size||0,512));

function buildTree(){
  const rootNode={name:cur.project,dirs:new Map(),files:[],w:0};
  for(const e of snap.tree||[]){
    const parts=e.path.split('/');
    let d=rootNode;
    for(let i=0;i<parts.length-1;i++){
      if(!d.dirs.has(parts[i]))d.dirs.set(parts[i],{name:parts[i],dirs:new Map(),files:[],w:0});
      d=d.dirs.get(parts[i]);
    }
    d.files.push({name:parts[parts.length-1],path:e.path,size:e.size,w:weightOf(e.size)});
  }
  (function sum(d){
    d.w=d.files.reduce((s,f)=>s+f.w,0);
    for(const k of d.dirs.values())d.w+=sum(k);
    return d.w;
  })(rootNode);
  return rootNode;
}

/* Classic squarify: rows of children laid along the short side, each row
   accepted while it improves the worst aspect ratio. */
function squarify(items,x,y,w,h,out){
  items=items.filter(i=>i.w>0);
  if(!items.length||w<=0||h<=0)return;
  const total=items.reduce((s,i)=>s+i.w,0);
  const scale=w*h/total;
  let row=[],rowW=0,i=0;
  const worst=(sum,min,max,side)=>{
    const s2=sum*sum,side2=side*side;
    return Math.max(side2*max/s2,s2/(side2*min));
  };
  while(i<items.length){
    const it=items[i],aw=it.w*scale;
    const side=Math.min(w,h);
    if(row.length){
      const min=Math.min(...row.map(r=>r.a)),max=Math.max(...row.map(r=>r.a));
      if(worst(rowW+aw,Math.min(min,aw),Math.max(max,aw),side)
        >worst(rowW,min,max,side)){
        ({x,y,w,h}=flushRow(row,rowW,x,y,w,h,out));
        row=[];rowW=0;
        continue;
      }
    }
    row.push({it,a:aw});rowW+=aw;i++;
  }
  if(row.length)flushRow(row,rowW,x,y,w,h,out);
}
function flushRow(row,rowW,x,y,w,h,out){
  if(w>=h){ /* vertical strip on the left */
    const sw=rowW/h;let cy=y;
    for(const r of row){const rh=r.a/sw;out.push({it:r.it,x,y:cy,w:sw,h:rh});cy+=rh;}
    return{x:x+sw,y,w:w-sw,h};
  }
  const sh=rowW/w;let cx=x;
  for(const r of row){const rw=r.a/sh;out.push({it:r.it,x:cx,y,w:rw,h:sh});cx+=rw;}
  return{x,y:y+sh,w,h:h-sh};
}

/* ---------------- render ---------------- */

const C={
  base:d=>`hsl(215 13% ${14+Math.min(d,4)*1.4}%)`,
  line:'rgba(36,40,50,.9)',
  dirInk:'#888276',bigInk:'#b3ada0',fileInk:'#9a948a',
  A:'#83d63a',M:'#e2ae5b',R:'#82b3e5',hover:'#e9e4d9'
};
const HEAD_H=52; /* keep in sync with .snap-head height in snapshot.css */

function sizeCanvas(){
  const dpr=devicePixelRatio||1;
  const W=root.clientWidth,H=Math.max(root.clientHeight-HEAD_H,0);
  cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);
  cv.style.width=W+'px';cv.style.height=H+'px';
  gc.setTransform(dpr,0,0,dpr,0,0);
  return{W,H};
}
function clearCanvas(){const{W,H}=sizeCanvas();gc.clearRect(0,0,W,H);hits=[];}

function layoutAndDraw(){
  const{W,H}=sizeCanvas();
  gc.clearRect(0,0,W,H);
  hits=[];
  if(!snap)return;
  root.querySelector('#snap-empty').hidden=true;
  const tree=buildTree();
  drawDir(tree,8,6,W-16,H-12,0);
  drawHover();
}

function drawDir(d,x,y,w,h,depth){
  if(w<7||h<7){ /* too small to open: a flat block stands in for the branch */
    gc.fillStyle=C.base(depth);gc.fillRect(x,y,w,h);
    return;
  }
  /* inner content rect: the dir's frame, label strip, and padding come off */
  let ix=x,iy=y,iw=w,ih=h;
  if(depth>0){
    gc.strokeStyle=C.line;gc.lineWidth=1;
    gc.strokeRect(x+.5,y+.5,w-1,h-1);
    let strip=2; /* headless dirs still get breathing room */
    if(w>=56&&h>=30){ /* label only when there is room to read it */
      const big=depth===1&&w>120;
      gc.fillStyle=big?C.bigInk:C.dirInk;
      gc.font=(big?'500 10.5px ':'400 8.5px ')+'ui-monospace,monospace';
      gc.fillText(fitText(d.name,w-10),x+5,y+(big?13:11));
      strip=big?17:14;
    }
    ix=x+2;iw=w-4;
    iy=y+strip;ih=h-strip-2;
  }
  if(iw<=0||ih<=0)return;
  const kids=[...d.dirs.values(),...d.files].sort((a,b)=>b.w-a.w);
  const cells=[];
  squarify(kids,ix,iy,iw,ih,cells);
  for(const c of cells){
    if(c.it.dirs)drawDir(c.it,c.x+1,c.y+1,Math.max(c.w-2,0),Math.max(c.h-2,0),depth+1);
    else drawFile(c.it,c.x+1,c.y+1,Math.max(c.w-2,0),Math.max(c.h-2,0),depth);
  }
}

function drawFile(f,x,y,w,h,depth){
  if(w<=0||h<=0)return;
  const st=(snap.touched||{})[f.path];
  const t={f,x,y,w,h,st,fill:st?C[st]:C.base(depth+1)};
  paintFile(t);
  hits.push(t);
}
/* Paint from the stored hit record so un-hovering restores the exact
   original pixels — fill shade included — without a full-map redraw. */
function paintFile(t){
  gc.fillStyle=t.fill;
  gc.globalAlpha=t.st?0.88:1;
  gc.fillRect(t.x,t.y,t.w,t.h);
  gc.globalAlpha=1;
  if(!t.st){gc.strokeStyle='rgba(11,12,15,.6)';gc.lineWidth=1;gc.strokeRect(t.x+.5,t.y+.5,t.w-1,t.h-1);}
  if(t.w>=64&&t.h>=14){
    gc.fillStyle=t.st?'#14100a':C.fileInk;
    gc.font='400 8.5px ui-monospace,monospace';
    gc.fillText(fitText(t.f.name,t.w-8),t.x+4,t.y+Math.min(11,t.h-3));
  }
}

function fitText(s,w){
  const max=Math.max(2,Math.floor(w/5.4));
  return s.length>max?s.slice(0,max-1)+'…':s;
}

/* ---------------- hover + click ---------------- */

function at(e){
  const r=cv.getBoundingClientRect();
  const px=e.clientX-r.left,py=e.clientY-r.top;
  for(let i=hits.length-1;i>=0;i--){
    const t=hits[i];
    if(px>=t.x&&px<=t.x+t.w&&py>=t.y&&py<=t.y+t.h)return t;
  }
  return null;
}
function onMove(e){
  const t=at(e);
  setHover(t);
  if(!t){return;}
  const stTxt={A:'added in this commit',M:'modified in this commit',R:'renamed in this commit'}[t.st]||'';
  hc.innerHTML=`<code>${esc(t.f.path)}</code>
    <span>${fmtBytes(t.f.size)}${stTxt?' · '+stTxt:''}</span>`;
  hc.classList.add('is-on');
  const hr=hc.getBoundingClientRect();
  let hx=e.clientX+16,hy=e.clientY+16;
  if(hx+hr.width>innerWidth-8)hx=e.clientX-hr.width-16;
  if(hy+hr.height>innerHeight-8)hy=e.clientY-hr.height-16;
  hc.style.left=hx+'px';hc.style.top=hy+'px';
}
function setHover(t){
  if(hover&&(!t||t.f.path!==hover.f.path))paintFile(hover);
  hover=t||null;
  if(!t){hc.classList.remove('is-on');cv.style.cursor='default';return;}
  cv.style.cursor='pointer';
  gc.strokeStyle=C.hover;gc.lineWidth=1.5;
  gc.strokeRect(t.x+.75,t.y+.75,t.w-1.5,t.h-1.5);
}
function onClick(e){
  const t=at(e);
  if(!t)return;
  dispatchEvent(new CustomEvent('space:preview-file',{detail:{
    project:cur.project,path:t.f.path,name:t.f.name,ref:cur.sha
  }}));
}

const fmtBytes=n=>n<1024?n+' B'
  :n<1048576?(n/1024).toFixed(n<10240?1:0)+' KB':(n/1048576).toFixed(1)+' MB';
