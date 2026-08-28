/* q4 · Git History — "River Delta".
   One block per repository, one lit lane per branch: each branch is a
   timeline across the shared 16-week axis, its commit days beading the
   lane as embers (radius and heat climb log2 with the day's commits,
   the scale shared across every repo so busy branches read hot
   everywhere). The lane brightens over its active span and ends in a
   tip ember at its last commit; the checked-out branch (HEAD) carries a
   pulsing ring, the default branch draws a shade brighter, and other
   branches report ahead/behind the default in their hover card. Tags
   sit under their repo's lanes as diamonds pinned to their dates. The
   freshest branch tips breathe, and a slow comet runs the HEAD lane of
   the most recently touched repo. Baselines, lane spans, cold embers,
   diamonds, labels and month ticks are baked into a lib.layer() at
   init. */
import {TAU,INK2,INK3,MONO,hexA,tint,fnv,glowSprite,drawGlow,withAdditive,
  ember,softRing,text,layer,fmtDate}from'../lib.js';

const DAYS=112;                       /* 16 weeks, matching the builder */
const SHIM_N=8;                       /* freshest branch tips that breathe */

const pad2=n=>String(n).padStart(2,'0');
const iso=d=>d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());
const dayIndex=(ds,end)=>{
  const ms=new Date(ds+'T00:00:00')-new Date(end+'T00:00:00');
  return DAYS-1+Math.round(ms/86400000);       /* end date → DAYS-1 */
};

export default{
  kind:'branches',

  init(data,env){
    const {W,H,dpr,color,expanded}=env;
    const repos=((data&&data.repos)||[]).slice(0,expanded?5:3);
    const empty=!repos.length;
    const end=(data&&data.end)||iso(new Date());
    const perRepo=expanded?6:3;

    /* ---- geometry: shared time axis, repo blocks stacked ---- */
    const wallX=W*(expanded?.16:.13),spanW=W*(expanded?.74:.8);
    const xOf=ds=>wallX+spanW*Math.max(0,Math.min(1,dayIndex(ds,end)/(DAYS-1)));
    const headerH=expanded?24:13,gap=expanded?20:9,tagH=expanded?20:9;
    const blocks=empty?[{name:'no repos',branches:[],tags:[]}]
      :repos.map(r=>({...r,branches:(r.branches||[]).slice(0,perRepo)}));
    const rows=blocks.reduce((s,b)=>s+Math.max(1,b.branches.length),0);
    const tagRows=blocks.filter(b=>(b.tags||[]).length).length;
    const availH=H*.92-blocks.length*headerH-(blocks.length-1)*gap
      -tagRows*tagH-(expanded?26:0);
    const laneH=Math.max(8,Math.min(expanded?26:15,availH/rows));
    const groupH=blocks.reduce((s,b)=>s+headerH
      +Math.max(1,b.branches.length)*laneH
      +((b.tags||[]).length?tagH:0),0)+(blocks.length-1)*gap+(expanded?26:0);
    let y=Math.max(H*.04,(H-groupH)/2);
    const sprite=glowSprite(color);

    /* ---- shared log2 heat scale across every repo's commit days ---- */
    const maxN=Math.max(1,...blocks.flatMap(b=>b.branches
      .flatMap(br=>(br.days||[]).map(d=>d.n||0))));
    const lg=Math.log2(1+maxN);
    const rMax=Math.min(laneH*.34,expanded?5.5:3.4);

    const beads=[],tips=[],diamonds=[],headerHits=[];
    const base=layer(W,H,dpr);
    const g=base.g;

    for(const repo of blocks){
      /* repo header: name + the counts a glance needs */
      text(g,String(repo.name||''),wallX,y+headerH-7,
        {font:`400 ${expanded?10:7.5}px ${MONO}`,col:INK2,align:'left',track:.06});
      if(expanded&&!empty)
        text(g,repo.branchTotal+' branches · '+repo.tagTotal+' tags'
          +(repo.head?' · head '+repo.head:''),wallX+spanW,y+headerH-7,
          {font:`400 9px ${MONO}`,col:INK3,align:'right'});
      if(!empty)headerHits.push({x:wallX+30,y:y+headerH-10,r:15,
        tip:{kick:'repository',title:repo.name,
          rows:[['Branches',String(repo.branchTotal??repo.branches.length)],
            ['Tags',String(repo.tagTotal??(repo.tags||[]).length)],
            ['HEAD',repo.head||'detached'],
            ['Default',repo.default||'—']]}});
      y+=headerH;

      for(const br of repo.branches){
        const cy=y+laneH/2;
        /* baseline the whole window; the active span brighter, the
           default branch a shade above its siblings */
        g.strokeStyle='rgba(233,228,217,.06)';g.lineWidth=1;
        g.beginPath();g.moveTo(wallX,cy);g.lineTo(wallX+spanW,cy);g.stroke();
        const tipX=xOf(br.tipDate||end);
        const firstX=(br.days||[]).length?xOf(br.days[0].d):tipX;
        g.strokeStyle=hexA(tint(color,br.isDefault?.62:.45),
          br.isDefault?.5:.32);
        g.lineWidth=br.isDefault?1.6:1.1;
        g.beginPath();g.moveTo(Math.min(firstX,tipX),cy);
        g.lineTo(tipX,cy);g.stroke();
        /* branch label rides its own lane */
        if(expanded){
          text(g,br.name,wallX-10,cy+3,
            {font:`400 9px ${MONO}`,col:br.isHead?INK2:INK3,align:'right'});
          const ab=br.ahead!=null?`+${br.ahead} −${br.behind}`:'';
          text(g,(br.tip||'')+(ab?'  '+ab:''),wallX+spanW+8,cy+3,
            {font:`400 8px ${MONO}`,col:INK3,align:'left',alpha:.9});
        }else{
          text(g,br.name,wallX-6,cy+2.5,
            {font:`400 6.5px ${MONO}`,col:INK3,align:'right',alpha:.9});
        }
        for(const d of br.days||[]){
          const u=Math.log2(1+(d.n||0))/lg;
          beads.push({repo:repo.name,branch:br.name,d:d.d,n:d.n,
            x:xOf(d.d),y:cy,r:rMax*(.35+.65*u),a:.4+.5*u,core:.35+.55*u});
        }
        const tip={repo:repo.name,br,x:tipX,y:cy,
          r:Math.max(rMax*.9,expanded?3.2:2.2),
          phase:fnv(repo.name+'/'+br.name)*TAU};
        tips.push(tip);
        y+=laneH;
      }
      if(!repo.branches.length&&!empty){
        text(g,'no branches',wallX+spanW/2,y+laneH/2+2,
          {font:`400 7px ${MONO}`,col:INK3,track:.12});
        y+=laneH;
      }

      /* tags: diamonds pinned to their dates on a thin strip */
      if((repo.tags||[]).length){
        const ty=y+tagH/2;
        for(const [i,tag] of (repo.tags||[]).entries()){
          const tx=xOf(tag.date||end);
          const s=expanded?3.4:2.2;
          g.save();g.translate(tx,ty);g.rotate(Math.PI/4);
          g.fillStyle=hexA(tint(color,.75),.85);
          g.fillRect(-s/2,-s/2,s,s);g.restore();
          if(expanded)text(g,tag.name,tx,ty+12,
            {font:`400 7.5px ${MONO}`,col:INK3,alpha:i%2?0.9:0.65});
          diamonds.push({repo:repo.name,tag,x:tx,y:ty,r:Math.max(9,s*3)});
        }
        y+=tagH;
      }
      y+=gap;
    }

    /* cold embers + month ticks are part of the baked base */
    withAdditive(g,()=>{
      for(const b of beads)ember(g,sprite,color,b.x,b.y,b.r,b.a,b.core);
      for(const p of tips)ember(g,sprite,color,p.x,p.y,p.r,.85,.7);
    });
    if(expanded&&!empty){
      const by=y-gap+16;
      let prev=-1;
      for(let i=0;i<DAYS;i+=7){
        const d=new Date(end+'T00:00:00');d.setDate(d.getDate()-(DAYS-1-i));
        if(d.getMonth()!==prev){
          prev=d.getMonth();
          text(g,d.toLocaleDateString('en-US',{month:'short'}).toUpperCase(),
            wallX+spanW*i/(DAYS-1),by,{font:`400 8px ${MONO}`,col:INK3,track:.14});
        }
      }
      text(g,'TODAY',wallX+spanW,by,
        {font:`400 8px ${MONO}`,col:INK3,align:'right',track:.14});
    }
    if(empty)
      text(g,'NO REPOSITORIES',W/2,H/2,
        {font:`400 8px ${MONO}`,col:INK3,track:.16});

    const shim=[...tips].sort((a,b)=>
      String(b.br.tipDate||'').localeCompare(String(a.br.tipDate||''))).slice(0,SHIM_N);
    const heads=tips.filter(p=>p.br.isHead);
    /* the comet rides the HEAD lane of the most recently touched repo */
    const comet=heads.length?heads[0]:null;

    return {base,sprite,beads,tips,shim,heads,comet,wallX,
      diamonds,headerHits,defaultOf:new Map(blocks.map(b=>[b.name,b.default]))};
  },

  draw(gc,s,env,t){
    const {color,reduced}=env;
    s.base.blit(gc);
    withAdditive(gc,()=>{
      for(const p of s.shim){
        const b=reduced?1:.8+.2*Math.sin(t*TAU/5.4+p.phase);
        ember(gc,s.sprite,color,p.x,p.y,p.r*(.92+.12*b),.85*b,.7);
      }
      for(const p of s.heads){
        const b=reduced?.5:.5+.5*Math.sin(t*TAU/6+p.phase);
        softRing(gc,p.x,p.y,p.r+3.5,color,1,.22+.26*b);
      }
      if(s.comet&&!reduced){
        const u=(t/8)%1;
        const cx=s.wallX+(s.comet.x-s.wallX)*u;
        drawGlow(gc,s.sprite,cx,s.comet.y,7,.5);
        for(let k=1;k<=3;k++)
          drawGlow(gc,s.sprite,cx-k*5,s.comet.y,5-k,.3/k);
      }
    });
  },

  hits(s){
    const out=[];
    for(const p of s.tips){
      const br=p.br,def=s.defaultOf.get(p.repo);
      const rows=[['Tip',br.tip||'—'],
        ['Last commit',br.tipDate?fmtDate(br.tipDate):'—'],
        ['Commits (16 wk)',String(br.n||0)]];
      if(br.ahead!=null)rows.push(['vs '+(def||'default'),`+${br.ahead} −${br.behind}`]);
      if(br.isHead)rows.push(['·','checked out (HEAD)']);
      else if(br.isDefault)rows.push(['·','default branch']);
      out.push({x:p.x,y:p.y,r:Math.max(10,p.r+5),
        tip:{kick:'branch · '+p.repo,title:br.name,rows}});
    }
    for(const b of s.beads)
      if(b.r>1.6)out.push({x:b.x,y:b.y,r:Math.max(8,b.r+4),
        tip:{kick:'commit day · '+b.branch,title:fmtDate(b.d),
          rows:[['Commits',String(b.n)],['Repo',b.repo]]}});
    for(const d of s.diamonds)
      out.push({x:d.x,y:d.y,r:d.r,
        tip:{kick:'tag · '+d.repo,title:d.tag.name,
          rows:[['At',d.tag.tip||'—'],['Date',d.tag.date?fmtDate(d.tag.date):'—']]}});
    return out.concat(s.headerHits);
  }
};
