/* q4 · Git History — "Ember Field".
   One lane per repo: a 16-week x 7-weekday punchcard of the 112 days
   ending today, drawn as a starfield — every day WITH commits is a
   circular glow ember whose radius, alpha and white-hot core tint climb
   log2 with the day's commit count, so peak days bloom into white cores
   and busy weeks read as luminous clusters. Days without commits are a
   faint dotted baseline (no dead squares). The ten most recent commit
   days breathe on fnv phases, the hottest days carry a slow extra halo,
   and a deliberate pulsing ring marks today's cell on the top lane.
   Baseline dots, cold embers, repo labels (above each block), weekday /
   month ticks and the ramp key are baked into a lib.layer() at init. */
import {TAU,INK2,INK3,MONO,hexA,tint,fnv,glowSprite,drawGlow,withAdditive,
  ember,softRing,text,layer,fmtDate}from'../lib.js';

const WEEKS=16,DAYS=WEEKS*7;
const SHIM_N=10;                      /* most recent commit days that breathe */
const DOW=['SUN','MON','TUE','WED','THU','FRI','SAT'];

const pad2=n=>String(n).padStart(2,'0');
const iso=d=>d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());

export default{
  kind:'heatlanes',

  init(data,env){
    const {W,H,dpr,color,expanded}=env;
    const repos=((data&&data.repos)||[]).slice(0,4);
    const empty=!repos.length;
    const lanes=empty?[{name:'no repos',total:0,days:[]}]:repos;

    /* the field covers the 112 days ending at data.end (defensively: today) */
    const endD=new Date(((data&&data.end)||iso(new Date()))+'T00:00:00');
    const dates=[];
    for(let i=0;i<DAYS;i++){
      const d=new Date(endD);d.setDate(d.getDate()-(DAYS-1-i));
      dates.push(iso(d));
    }

    /* ---- geometry: uniform pitch, blocks centered as one group ---- */
    const n=lanes.length;
    const labelH=expanded?26:14;         /* repo label line above each block */
    const laneGap=expanded?30:12;
    const extraB=expanded?66:0;          /* month ticks + ramp key below */
    const availW=W*.86;
    const availH=H*.9-n*labelH-(n-1)*laneGap-extraB;
    const p=Math.max(3,Math.min(availW/WEEKS,availH/(7*n)));
    const rMax=p*.4;                     /* ember core radius at the peak day */
    const wallX=(W-WEEKS*p)/2;
    const groupH=n*(labelH+7*p)+(n-1)*laneGap+extraB;
    const top=Math.max(H*.04,(H-groupH)/2);
    const laneTop=i=>top+i*(labelH+7*p+laneGap)+labelH;
    const sprite=glowSprite(color);

    /* ---- one ember per real commit day; log2 scale shared across lanes ---- */
    const maxN=Math.max(1,...lanes.flatMap(l=>(l.days||[]).map(d=>d.n||0)));
    const lg=Math.log2(1+maxN);
    const uOf=k=>Math.log2(1+k)/lg;      /* 0..1 heat */
    const cells=[];
    lanes.forEach((repo,li)=>{
      const byDay=new Map((repo.days||[]).map(d=>[d.d,d]));
      const ty=laneTop(li);
      dates.forEach((ds,i)=>{
        const day=byDay.get(ds);
        if(!day||!day.n)return;
        const c=Math.floor(i/7),r=i%7;
        const u=uOf(day.n);
        cells.push({repo:repo.name,d:ds,n:day.n,s:day.s||[],u,
          r:rMax*(.34+.66*u),a:.45+.55*u,core:.42+.55*u,
          phase:fnv(repo.name+ds)*TAU,
          x:wallX+c*p+p/2,y:ty+r*p+p/2});
      });
    });
    const shim=[...cells].sort((a,b)=>a.d<b.d?1:-1).slice(0,SHIM_N);
    shim.forEach(c=>{c.shim=true;});
    const hot=cells.filter(c=>!c.shim&&c.u>.78);  /* peak days: extra halo */

    /* ---- static base: dotted baseline + cold embers + labels + ticks ---- */
    const base=layer(W,H,dpr);
    const g=base.g;
    const occupied=new Set(cells.map(c=>c.repo+'/'+c.d));
    g.fillStyle='rgba(233,228,217,.07)';
    lanes.forEach((repo,li)=>{
      const ty=laneTop(li);
      for(let i=0;i<DAYS;i++){
        if(occupied.has(repo.name+'/'+dates[i]))continue;
        const c=Math.floor(i/7),r=i%7;
        g.beginPath();
        g.arc(wallX+c*p+p/2,ty+r*p+p/2,Math.max(.6,p*.055),0,TAU);
        g.fill();
      }
      const total=repo.total??(repo.days||[]).reduce((s,d)=>s+(d.n||0),0);
      if(expanded){
        text(g,String(repo.name||''),wallX+1,ty-11,
          {font:`400 10px ${MONO}`,col:INK2,align:'left',track:.06});
        text(g,total+' commits',wallX+WEEKS*p-1,ty-11,
          {font:`400 9px ${MONO}`,col:INK3,align:'right'});
      }else{
        text(g,String(repo.name||''),wallX+1,ty-6,
          {font:`400 7.5px ${MONO}`,col:INK3,align:'left',alpha:.9});
      }
    });
    withAdditive(g,()=>{
      for(const c of cells)if(!c.shim)ember(g,sprite,color,c.x,c.y,c.r,c.a,c.core);
    });

    if(expanded&&!empty){
      /* Mon/Wed/Fri ticks left of the top lane (row weekday is constant) */
      const ty0=laneTop(0);
      for(let r=0;r<7;r++){
        const wd=new Date(dates[r]+'T00:00:00').getDay();
        if(wd===1||wd===3||wd===5)
          text(g,DOW[wd],wallX-12,ty0+r*p+p/2+3,
            {font:`400 8px ${MONO}`,col:INK3,align:'right',track:.08});
      }
      /* month ticks under the bottom lane */
      const by=laneTop(n-1)+7*p;
      let prev=-1;
      for(let c=0;c<WEEKS;c++){
        const d=new Date(dates[c*7]+'T00:00:00');
        if(d.getMonth()!==prev){
          prev=d.getMonth();
          text(g,d.toLocaleDateString('en-US',{month:'short'}).toUpperCase(),
            wallX+c*p+p/2,by+17,{font:`400 8px ${MONO}`,col:INK3,track:.14});
        }
      }
      /* ramp key: 0 · four ember steps · maxN/day, plus the today ring —
         fixed small glyph sizes so the key never blooms like data */
      const ky=by+50;
      const kx=W/2-132;
      text(g,'0',kx,ky+3,{font:`400 8px ${MONO}`,col:INK3});
      g.fillStyle='rgba(233,228,217,.14)';
      g.beginPath();g.arc(kx+15,ky,1,0,TAU);g.fill();
      withAdditive(g,()=>{
        [.25,.5,.75,1].forEach((u,i)=>{
          ember(g,sprite,color,kx+36+i*20,ky,
            1.8+3.6*u,.45+.55*u,.42+.55*u);
        });
      });
      text(g,maxN+' / DAY',kx+114,ky+3,
        {font:`400 8px ${MONO}`,col:INK3,align:'left',track:.1});
      softRing(g,kx+196,ky,5.5,color,1,.4);
      text(g,'TODAY',kx+210,ky+3,
        {font:`400 8px ${MONO}`,col:INK3,align:'left',track:.1});
    }
    if(empty)
      text(g,'NO COMMIT HISTORY',wallX+WEEKS*p/2,laneTop(0)+3.5*p+3,
        {font:`400 8px ${MONO}`,col:INK3,track:.16});

    /* deliberate "today" marker: a ring on the top lane's last cell */
    const today=empty?null:{x:wallX+15*p+p/2,y:laneTop(0)+(DAYS-1)%7*p+p/2};

    return {base,sprite,cells,shim,hot,today,todayISO:dates[DAYS-1],p,
      ringR:Math.max(4.5,rMax*1.15+2),
      laneMeta:empty?[]:lanes.map((repo,li)=>({name:repo.name,
        total:repo.total??(repo.days||[]).reduce((s,d)=>s+(d.n||0),0),
        peak:Math.max(0,...(repo.days||[]).map(d=>d.n||0)),
        x:wallX+40,y:laneTop(li)-14}))};
  },

  draw(gc,s,env,t){
    const {color,reduced}=env;
    s.base.blit(gc);
    withAdditive(gc,()=>{
      /* the ten freshest commit days glimmer — a breath above their baked
         tone, never below, so recency reads as light */
      for(const c of s.shim){
        const b=reduced?1:.8+.2*Math.sin(t*TAU/5.2+c.phase);
        ember(gc,s.sprite,color,c.x,c.y,c.r*(.92+.1*b),c.a*b,c.core);
      }
      /* peak days carry a slow extra halo so the cores visibly breathe */
      for(const c of s.hot){
        const b=reduced?.5:.5+.5*Math.sin(t*TAU/7+c.phase);
        drawGlow(gc,s.sprite,c.x,c.y,c.r*4.4,.14+.2*b);
      }
      if(s.today){
        const b=reduced?.5:.5+.5*Math.sin(t*TAU/6);
        softRing(gc,s.today.x,s.today.y,s.ringR,color,1,.26+.24*b);
      }
    });
  },

  hits(s){
    const out=s.cells.map(c=>({x:c.x,y:c.y,r:Math.max(10,s.p*.6),
      tip:{kick:'commit day · '+c.repo,title:fmtDate(c.d),
        rows:[['Commits',String(c.n)],
          ...c.s.slice(0,3).map(sub=>
            ['·',sub.length>64?sub.slice(0,63)+'…':sub])]}}));
    if(s.today&&!s.cells.some(c=>c.x===s.today.x&&c.y===s.today.y))
      out.push({x:s.today.x,y:s.today.y,r:Math.max(10,s.ringR),
        tip:{kick:'timeline',title:'Today',sub:fmtDate(s.todayISO)}});
    for(const L of s.laneMeta)
      out.push({x:L.x,y:L.y,r:16,
        tip:{kick:'repository',title:L.name,
          rows:[['Commits (16 wk)',String(L.total)],
            ['Peak day',L.peak+' commits']]}});
    return out;
  }
};
