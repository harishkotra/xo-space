/* The Snapshot view: one commit, rendered as the repository's citymap.

   Opened from the Timeline's By-project mode — a commit-day dot resolves
   to shas and lands here (never from the tab bar: nav:false,
   parent:'time'). Views never import each other, so the timeline
   dispatches `space:show-commit` with {project, sha} and then
   ctx.switchTo's here; a request that lands before this module mounts
   parks until show() consumes it.

   The picture is a deliberate port of Space Walk's citymap grammar
   (mindwalk web/src/scene/CityScene.tsx + internal/citymap/builder.go)
   to the dependency-free 2D canvas this app is built from:

   - the same 120-unit world, squarified with a 0.08-unit inset per child
     (the streets) and aspect capped at 40;
   - file weight sqrt(max(bytes/4096, 16)) — Space Walk's formula minus
     the line counts a bare git tree cannot cheaply give;
   - district plates depth-shaded #161a20 → #242832, hairline borders,
     file tiles #56534b with FNV-1a lightness jitter;
   - map-style label LOD: a district is named while its subtree spans
     enough pixels, budgeted by file count, collision losers dropped;
   - light is data: the plain stays dark, and only what the commit
     touched glows — added in edit-green, modified in hit-gold, renamed
     in read-blue, Space Walk's exact touch lattice. Deleted files are
     absent from the tree by definition and get a header count, not a
     ghost.

   Every tile is clickable: it opens the shared previewer pinned to this
   commit (`ref` rides the space:preview-file event), so what you read is
   what the file WAS. */
import {API_BASE,apiFetch} from '../core/api.js';

const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

let root=null,cv=null,gc=null,hc=null;
let go=()=>{};
let visible=false;
let pending=null;              /* {project,sha} parked until show() */
let cur=null;                  /* the loaded target */
let snap=null;                 /* the fetched payload */
let world=null;                /* laid-out dirs+files in 120-unit space */
let px=null;                   /* world→canvas projection of the moment */
let hover=null;
let token=0;                   /* race guard across loads */

addEventListener('space:show-commit',e=>{
  pending={project:String(e.detail?.project||''),sha:String(e.detail?.sha||'')};
  if(visible)consumePending();
});

export default{
  id:'snapshot',label:'Snapshot',order:2.7,nav:false,parent:'time',
  async mount(el,ctx){
    root=el;go=ctx.switchTo;
    root.innerHTML=`
      <div class="snap-head" id="snap-head"></div>
      <canvas id="snap-canvas"></canvas>
      <div class="snap-empty" id="snap-empty">
        <div class="eyebrow">Commit snapshot</div>
        <p>Open the <b>Timeline</b>, switch it to <b>By project</b>, and click
        a commit dot to see that repository as it stood at that moment.</p>
      </div>
      <div id="snap-hc"></div>`;
    cv=root.querySelector('#snap-canvas');gc=cv.getContext('2d');
    hc=root.querySelector('#snap-hc');
    cv.addEventListener('mousemove',onMove);
    cv.addEventListener('mouseleave',()=>{setHover(null);});
    cv.addEventListener('click',onClick);
    addEventListener('resize',()=>{if(visible&&world)draw();});
  },
  show(){visible=true;if(!consumePending()&&world)draw();},
  hide(){visible=false;setHover(null);}
};

function consumePending(){
  if(!pending)return false;
  const t=pending;pending=null;
  if(cur&&cur.project===t.project&&cur.sha===t.sha){if(world)draw();return true;}
  load(t);
  return true;
}

async function load(t){
  cur=t;snap=null;world=null;setHover(null);
  const mine=++token;
  headHTML(`<button class="snap-back" id="snap-back">&larr; Timeline</button>
    <span class="snap-loading">reading ${esc(t.project)} @ ${esc(t.sha.slice(0,7))}&hellip;</span>`);
  root.querySelector('#snap-empty').hidden=true;
  clearCanvas();
  const res=await apiFetch(API_BASE+'/api/xo-projects/'+encodeURIComponent(t.project)
    +'/commits/'+encodeURIComponent(t.sha)+'/snapshot');
  if(mine!==token)return; /* a newer commit owns the screen */
  if(!res.ok){
    headHTML(`<button class="snap-back" id="snap-back">&larr; Timeline</button>
      <span class="snap-err">${esc(res.offline?'xo-cowork-api is unreachable'
        :res.error||'could not read this commit')}</span>`);
    return;
  }
  snap=res.data;
  world=layoutWorld();
  renderHead();
  draw();
}

function headHTML(inner){
  const el=root.querySelector('#snap-head');
  el.innerHTML=inner;
  el.querySelector('#snap-back')?.addEventListener('click',()=>go('time'));
}

function renderHead(){
  const c=snap.commit,t=snap.touched||{},d=snap.deleted||[];
  let a=0,m=0,r=0;
  for(const st of Object.values(t)){if(st==='A')a++;else if(st==='R')r++;else m++;}
  headHTML(`
    <button class="snap-back" id="snap-back">&larr; Timeline</button>
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

/* ================= layout — the citymap builder, ported ================= */

const WORLD=120;         /* Space Walk lays every map out in a 120x120 plain */
const INSET=0.08;        /* world-unit street between siblings, every level */
const ASPECT_CAP=40;
const MIN_TILE=0.45;     /* smallest drawn tile, like the scene's tile floor */

/* sqrt(max(bytes/4096, 16)): Space Walk's fileWeight with its byte fallback
   as the only path — a bare git tree has sizes, not line counts. */
const weightOf=bytes=>Math.sqrt(Math.max((bytes||0)/4096,16));

function buildTree(){
  const rootNode={name:'',path:'',depth:0,dirs:new Map(),files:[],w:0};
  for(const e of snap.tree||[]){
    const parts=e.path.split('/');
    let d=rootNode;
    for(let i=0;i<parts.length-1;i++){
      let next=d.dirs.get(parts[i]);
      if(!next){
        next={name:parts[i],path:d.path?d.path+'/'+parts[i]:parts[i],
          depth:d.depth+1,dirs:new Map(),files:[],w:0};
        d.dirs.set(parts[i],next);
      }
      d=next;
    }
    d.files.push({name:parts[parts.length-1],path:e.path,size:e.size,w:weightOf(e.size)});
  }
  (function sum(d){
    d.w=d.files.reduce((s,f)=>s+f.w,0);
    d.fileCount=d.files.length;
    for(const k of d.dirs.values()){d.w+=sum(k);d.fileCount+=k.fileCount;}
    if(d.w<=0)d.w=1;
    return d.w;
  })(rootNode);
  return rootNode;
}

const inset=(r,pad)=>{
  const o={...r};
  if(o.w>pad*2){o.x+=pad;o.w-=pad*2;}
  if(o.h>pad*2){o.y+=pad;o.h-=pad*2;}
  return o;
};
const capAspect=r=>{
  const o={...r};
  if(o.w<=0||o.h<=0)return o;
  if(o.w/o.h>ASPECT_CAP){const nw=o.h*ASPECT_CAP;o.x+=(o.w-nw)/2;o.w=nw;}
  else if(o.h/o.w>ASPECT_CAP){const nh=o.w*ASPECT_CAP;o.y+=(o.h-nh)/2;o.h=nh;}
  return o;
};

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
  if(w>=h){
    const sw=rowW/h;let cy=y;
    for(const r of row){const rh=r.a/sw;out.push({it:r.it,x,y:cy,w:sw,h:rh});cy+=rh;}
    return{x:x+sw,y,w:w-sw,h};
  }
  const sh=rowW/w;let cx=x;
  for(const r of row){const rw=r.a/sh;out.push({it:r.it,x:cx,y,w:rw,h:sh});cx+=rw;}
  return{x,y:y+sh,w,h:h-sh};
}

/* One pass over the whole tree: dirs and files each get a world rect, the
   same recursion as citymap's layoutNode — squarify, then inset+capAspect
   every placed child before descending. */
function layoutWorld(){
  const tree=buildTree();
  const dirs=[],files=[];
  (function layoutNode(n,rect){
    if(n.path)dirs.push({path:n.path,name:n.name,depth:n.depth,
      fileCount:n.fileCount,rect});
    const kids=[
      ...[...n.dirs.values()].map(d=>({kind:'dir',node:d,w:d.w})),
      ...n.files.map(f=>({kind:'file',file:f,w:f.w})),
    ].sort((a,b)=>b.w-a.w||0);
    const cells=[];
    squarify(kids,rect.x,rect.y,rect.w,rect.h,cells);
    for(const c of cells){
      const r=capAspect(inset(c,INSET));
      if(c.it.kind==='dir')layoutNode(c.it.node,r);
      else files.push({...c.it.file,rect:r});
    }
  })(tree,{x:0,y:0,w:WORLD,h:WORLD});
  return{dirs,files};
}

/* ================= render — the city scene's grammar in 2D ================= */

const SKY='#0b0c0f';
const GROUND='#101318';
const GRID_MAJOR='rgba(36,40,50,.5)',GRID_MINOR='rgba(27,31,39,.5)';
const EDGE_BASE='rgba(36,40,50,.9)';       /* hairline district borders */
const UNVISITED={h:45,s:.045,l:.312};      /* #56534b, jittered per file */
const TOUCH={A:'#a8d94f',M:'#a8a24e',R:'#9dc0e8'}; /* edit / hit / read */
const SELECTED='#e9e4d9';
const LABEL_INK='rgba(233,228,217,.95)';
const LABEL_MIN_SUBTREE_PX=60;
const LABEL_BUDGET=120;
const TILT=-0.02;        /* rad — the god-view's slight rotation, kept 2D */
const HEAD_H=52;         /* keep in sync with .snap-head in snapshot.css */

/* plateShade: #161a20 lerped toward #242832 by min(depth,3)/3 */
function plateShade(depth){
  const f=Math.min(depth,3)/3;
  const c0=[0x16,0x1a,0x20],c1=[0x24,0x28,0x32];
  return'rgb('+c0.map((v,i)=>Math.round(v+(c1[i]-v)*f)).join(',')+')';
}
/* FNV-1a lightness jitter, byte for byte the scene's baseColor */
function tileColor(path){
  let h=2166136261;
  for(let i=0;i<path.length;i++)h=Math.imul(h^path.charCodeAt(i),16777619);
  const jitter=((h>>>0)%1000)/1000-0.5;
  const l=Math.max(0,Math.min(1,UNVISITED.l+jitter*0.05));
  return`hsl(${UNVISITED.h} ${UNVISITED.s*100}% ${l*100}%)`;
}

function sizeCanvas(){
  const dpr=Math.min(2,devicePixelRatio||1);
  const W=root.clientWidth,H=Math.max(root.clientHeight-HEAD_H,0);
  cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);
  cv.style.width=W+'px';cv.style.height=H+'px';
  gc.setTransform(dpr,0,0,dpr,0,0);
  return{W,H};
}
function clearCanvas(){const{W,H}=sizeCanvas();gc.fillStyle=SKY;gc.fillRect(0,0,W,H);px=null;}

function draw(){
  const{W,H}=sizeCanvas();
  gc.fillStyle=SKY;gc.fillRect(0,0,W,H);
  if(!world){px=null;return;}
  root.querySelector('#snap-empty').hidden=true;

  /* projection: fit the 120-unit plain, centered, with margins */
  const k=Math.min((W-64)/WORLD,(H-48)/WORLD);
  const ox=(W-WORLD*k)/2,oy=(H-WORLD*k)/2;
  px={k,ox,oy,W,H,cos:Math.cos(TILT),sin:Math.sin(TILT)};

  /* everything from here draws in the tilted frame */
  gc.save();
  gc.translate(W/2,H/2);gc.rotate(TILT);gc.translate(-W/2,-H/2);

  /* ground + grid, the plain the city sits on */
  const g0={x:ox-18,y:oy-18,w:WORLD*k+36,h:WORLD*k+36};
  gc.fillStyle=GROUND;gc.fillRect(g0.x,g0.y,g0.w,g0.h);
  gc.lineWidth=1;
  const step=WORLD*k/24;
  for(let i=0;i<=24;i++){
    gc.strokeStyle=i%6===0?GRID_MAJOR:GRID_MINOR;
    gc.beginPath();gc.moveTo(ox+i*step,g0.y);gc.lineTo(ox+i*step,g0.y+g0.h);gc.stroke();
    gc.beginPath();gc.moveTo(g0.x,oy+i*step);gc.lineTo(g0.x+g0.w,oy+i*step);gc.stroke();
  }

  const X=v=>ox+v*k,Y=v=>oy+v*k;

  /* district plates: depth-shaded fills for depth<=3, then hairline
     borders for every district — plates give regions weight, hairlines
     make districts read as districts before any light */
  for(const d of world.dirs){
    if(d.depth>3)continue;
    gc.fillStyle=plateShade(d.depth);
    gc.fillRect(X(d.rect.x),Y(d.rect.y),d.rect.w*k,d.rect.h*k);
  }
  gc.strokeStyle=EDGE_BASE;gc.lineWidth=1;
  for(const d of world.dirs){
    if(d.depth<1||d.depth>3)continue;
    gc.strokeRect(X(d.rect.x)+.5,Y(d.rect.y)+.5,d.rect.w*k-1,d.rect.h*k-1);
  }

  /* file tiles: dark and jittered; the commit's touches glow on top */
  const touched=snap.touched||{};
  const lit=[];
  for(const f of world.files){
    const t=tileRect(f);
    const st=touched[f.path];
    if(st){lit.push({f,t,st});continue;}
    gc.fillStyle=tileColor(f.path);
    gc.fillRect(t.x,t.y,t.w,t.h);
  }
  /* light is data: touched tiles drawn last, each with a soft halo so the
     commit reads as light on the dark plain */
  for(const{f,t,st}of lit){
    gc.save();
    gc.shadowColor=TOUCH[st];gc.shadowBlur=Math.max(8,Math.min(t.w,t.h)*.9);
    gc.fillStyle=TOUCH[st];
    gc.fillRect(t.x,t.y,t.w,t.h);
    gc.restore();
  }

  drawLabels(k);
  gc.restore();

  /* fog at the frame's edge, the same falloff job the scene's Fog does */
  const fog=gc.createRadialGradient(W/2,H/2,Math.min(W,H)*.42,W/2,H/2,Math.max(W,H)*.72);
  fog.addColorStop(0,'rgba(11,12,15,0)');fog.addColorStop(1,'rgba(11,12,15,.55)');
  gc.fillStyle=fog;gc.fillRect(0,0,W,H);

  if(hover)strokeHover(hover);
}

/* a file's drawn rect: its world rect scaled, floored at the tile minimum
   and kept centered — exactly how the scene sizes its tile instances */
function tileRect(f){
  const{k,ox,oy}=px;
  const w=Math.max(f.rect.w,MIN_TILE)*k,h=Math.max(f.rect.h,MIN_TILE)*k;
  const cx=ox+(f.rect.x+f.rect.w/2)*k,cy=oy+(f.rect.y+f.rect.h/2)*k;
  return{x:cx-w/2,y:cy-h/2,w,h};
}

/* map-style LOD, DirLabelSet's rules without a moving camera: budget by
   file count, name a district only when its subtree spans enough pixels,
   and of two colliding labels keep the one naming more files. */
function drawLabels(k){
  const cand=world.dirs
    .filter(d=>d.depth>=1&&d.fileCount>0&&d.rect.w>0&&d.rect.h>0)
    .sort((a,b)=>b.fileCount-a.fileCount)
    .slice(0,LABEL_BUDGET);
  const placed=[];
  gc.textAlign='center';gc.textBaseline='middle';
  for(const d of cand){
    const spanPx=Math.hypot(d.rect.w,d.rect.h)*k;
    if(spanPx<LABEL_MIN_SUBTREE_PX)continue;
    const big=d.depth===1;
    gc.font=(big?'500 11.5px ':'500 9.5px ')+'system-ui,sans-serif';
    const cx=px.ox+(d.rect.x+d.rect.w/2)*k;
    const cy=px.oy+(d.rect.y+d.rect.h/2)*k;
    const tw=gc.measureText(d.name).width+10,th=big?16:13;
    const box={x:cx-tw/2,y:cy-th/2,w:tw,h:th};
    if(placed.some(p=>box.x<p.x+p.w&&p.x<box.x+box.w&&box.y<p.y+p.h&&p.y<box.y+box.h))
      continue; /* collision loser: candidates arrive biggest first */
    placed.push(box);
    gc.save();
    gc.shadowColor=SKY;gc.shadowBlur=5;
    gc.fillStyle=LABEL_INK;
    gc.fillText(d.name,cx,cy);
    gc.restore();
  }
}

/* ================= hover + click (through the tilt) ================= */

/* pointer → the untilted frame the rects live in */
function localPoint(e){
  const r=cv.getBoundingClientRect();
  const mx=e.clientX-r.left,my=e.clientY-r.top;
  const{W,H,cos,sin}=px;
  const dx=mx-W/2,dy=my-H/2;
  return{x:W/2+dx*cos+dy*sin,y:H/2-dx*sin+dy*cos};
}
function at(e){
  if(!px||!world)return null;
  const p=localPoint(e);
  /* smallest hit wins so a tiny tile inside a district stays clickable */
  let best=null,bestA=Infinity;
  for(const f of world.files){
    const t=tileRect(f);
    if(p.x>=t.x&&p.x<=t.x+t.w&&p.y>=t.y&&p.y<=t.y+t.h){
      const a=t.w*t.h;
      if(a<bestA){best={f,t,st:(snap.touched||{})[f.path]};bestA=a;}
    }
  }
  return best;
}
function strokeHover(t){
  const{W,H}=px;
  gc.save();
  gc.translate(W/2,H/2);gc.rotate(TILT);gc.translate(-W/2,-H/2);
  gc.strokeStyle=SELECTED;gc.lineWidth=1.5;
  gc.strokeRect(t.t.x-1,t.t.y-1,t.t.w+2,t.t.h+2);
  gc.restore();
}
function onMove(e){
  const t=at(e);
  if(hover&&(!t||t.f.path!==hover.f.path)){hover=null;draw();}
  if(!t){hc.classList.remove('is-on');cv.style.cursor='default';return;}
  if(!hover||hover.f.path!==t.f.path){hover=t;strokeHover(t);}
  cv.style.cursor='pointer';
  const word={A:'added in this commit',M:'modified in this commit',R:'renamed in this commit'}[t.st]||'';
  hc.innerHTML=`<code>${esc(t.f.path)}</code>
    <span>${fmtBytes(t.f.size)}${word?' · '+word:''}</span>`;
  hc.classList.add('is-on');
  const hr=hc.getBoundingClientRect();
  let hx=e.clientX+16,hy=e.clientY+16;
  if(hx+hr.width>innerWidth-8)hx=e.clientX-hr.width-16;
  if(hy+hr.height>innerHeight-8)hy=e.clientY-hr.height-16;
  hc.style.left=hx+'px';hc.style.top=hy+'px';
}
function setHover(t){
  if(hover&&!t){hover=null;if(world&&px)draw();}
  if(!t){hc?.classList.remove('is-on');if(cv)cv.style.cursor='default';}
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
