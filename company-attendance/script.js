/* ---------- parsing ---------- */
function parseCSV(text){
  text = text.replace(/﻿/g,'');
  const rows=[]; let row=[], f='', q=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(q){ if(c==='"'){ if(text[i+1]==='"'){f+='"';i++} else q=false } else f+=c; }
    else if(c==='"') q=true;
    else if(c===','){ row.push(f); f=''; }
    else if(c==='\n'||c==='\r'){ if(c==='\r'&&text[i+1]==='\n') i++; row.push(f); rows.push(row); row=[]; f=''; }
    else f+=c;
  }
  if(f!==''||row.length){ row.push(f); rows.push(row); }
  return rows.filter(r=>r.some(x=>x.trim()!==''));
}
const MON={jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
function parseDate(s){
  s=(s||'').trim(); let m;
  if((m=s.match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4})/))) return new Date(+m[3],MON[m[2].toLowerCase()]??0,+m[1]);
  if((m=s.match(/(\d{4})-(\d{2})-(\d{2})/))) return new Date(+m[1],+m[2]-1,+m[3]);
  if((m=s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/))) return new Date(+m[3],+m[2]-1,+m[1]);
  if((m=s.match(/\b((?:19|20)\d{2})\b/))) return {yearOnly:+m[1]};
  return null;
}
function toRecords(text, fallbackYear){
  const rows=parseCSV(text); if(!rows.length) throw new Error('The file is empty.');
  const head=rows[0].map(h=>h.trim().toLowerCase());
  const ci=head.findIndex(h=>h.includes('company')||h.includes('organisation')||h.includes('organization'));
  if(ci<0) throw new Error('No column with “company” in its name was found in the header row.');
  const di=head.findIndex(h=>h.includes('date'));
  const yi=head.findIndex(h=>h==='year');
  const out=[];
  for(const r of rows.slice(1)){
    const company=(r[ci]||'').trim();
    let date=null, year=null;
    if(di>=0){ const d=parseDate(r[di]); if(d instanceof Date){date=d;year=d.getFullYear()} else if(d) year=d.yearOnly; }
    if(year==null && yi>=0){ const y=parseInt(r[yi],10); if(y) year=y; }
    if(year==null) year=fallbackYear;
    out.push({company, year, t: date? date.getTime(): null});
  }
  return out;
}

/* ---------- name normalising ---------- */
const ALIASES = {
  'gds':'governmentdigitalservice','governmentdigitalservicegds':'governmentdigitalservice',
  'londonwebstandardscodered':'coderedlondonwebstandards',
  'cognitiveapplications':'cogapp','livelinktechnologynet':'livelinktechnology',
  'amex':'americanexpress','ft':'financialtimes','svt':'sverigestelevision',
  'monzobank':'monzo','trainlinecom':'trainline','andigital':'anddigital','akqaleap':'akqa','wearetilt':'tilt'
};
function normKey(s){
  let k=s.normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/&/g,'and');
  k=k.replace(/\b(ltd|limited|llp|plc|gmbh|inc|co|the|group|uk)\b\.?/g,' ').replace(/[^a-z0-9]/g,'');
  return ALIASES[k]||k||s.toLowerCase();
}
const FREE=/^(freelance|freelancer|self[\s-]?employed|independent|contractor|n\/?a|none|-+|student|unemployed|personal)$/i;

/* ---------- state ---------- */
const store={get(k,d){try{const v=localStorage.getItem('coatt:'+k);return v==null?d:JSON.parse(v)}catch{return d}},set(k,v){try{localStorage.setItem('coatt:'+k,JSON.stringify(v))}catch{}}};
const S={
  sources: store.get('sources',null),
  years: new Set(store.get('years',[])),
  tab: ['overview','leaderboard','matrix','movers','timeline'].includes(location.hash.slice(1))?location.hash.slice(1):store.get('tab','overview'),
  q:'', minPeople:1, minYears:1, size:'',
  merge: store.get('merge',true), hideFree: store.get('hideFree',true), showBlank: store.get('showBlank',false),
  manual: store.get('manual',{}),
  sort: store.get('sort',{col:'total',dir:-1}),
  topN: store.get('topN',25),
  cmpA:null, cmpB:null, tlYear:null
};
if(!Array.isArray(S.sources)) S.sources=[];
const saveSources=()=>store.set('sources',S.sources);

/* ---------- aggregation ---------- */
function keyOf(raw){
  if(!raw) return '__blank';
  let k = S.merge? normKey(raw) : raw.trim();
  let guard=0; while(S.manual[k] && guard++<10) k=S.manual[k];
  return k;
}
function build(){
  const all=S.sources.flatMap(s=>s.records);
  const years=[...new Set(all.map(r=>r.year).filter(y=>y!=null))].sort((a,b)=>a-b);
  const cos=new Map();
  for(const r of all){
    if(r.year==null) continue;
    const raw=r.company.trim();
    if(!raw && !S.showBlank) continue;
    if(raw && S.hideFree && (FREE.test(raw)||/freelanc/i.test(raw))) continue;
    const k=keyOf(raw);
    let c=cos.get(k);
    if(!c){ c={key:k, by:{}, total:0, variants:new Map(), dates:[]}; cos.set(k,c); }
    c.by[r.year]=(c.by[r.year]||0)+1; c.total++;
    const v=raw||'(no company)'; c.variants.set(v,(c.variants.get(v)||0)+1);
    if(r.t!=null) c.dates.push({t:r.t, year:r.year});
  }
  for(const c of cos.values()){
    c.name=[...c.variants.entries()].sort((a,b)=>b[1]-a[1]||a[0].length-b[0].length)[0][0];
    c.yearsAttended=Object.keys(c.by).map(Number).sort((a,b)=>a-b);
    c.first=c.yearsAttended[0]; c.last=c.yearsAttended.at(-1);
    c.dates.sort((a,b)=>a.t-b.t);
  }
  return {years, cos:[...cos.values()]};
}
function selYears(D){ const s=[...S.years].filter(y=>D.years.includes(y)); return s.length? s.sort((a,b)=>a-b) : D.years; }
const inSel=(c,ys)=>ys.reduce((n,y)=>n+(c.by[y]||0),0);
function filtered(D){
  const ys=selYears(D), q=S.q.trim().toLowerCase();
  return D.cos.filter(c=>{
    const n=inSel(c,ys); if(!n) return false;
    if(n<S.minPeople) return false;
    if(c.yearsAttended.length<S.minYears) return false;
    if(S.size==='1' && n!==1) return false;
    if(S.size==='2-3' && (n<2||n>3)) return false;
    if(S.size==='4' && n<4) return false;
    if(q && ![...c.variants.keys()].some(v=>v.toLowerCase().includes(q))) return false;
    return true;
  });
}

/* ---------- helpers ---------- */
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number.isInteger(n)?n.toLocaleString('en-GB'):n.toLocaleString('en-GB',{maximumFractionDigits:1});
const YC=['--y1','--y2','--y3','--y4','--y5','--y6','--y7','--y8'];
let YEARS_ALL=[];
const yCol=y=>`var(${YC[Math.max(0,YEARS_ALL.indexOf(y))%YC.length]})`;
const heat=(n,max)=>{const p=max? Math.round(12+70*(n/max)) : 0; return `background:color-mix(in oklab, var(--accent) ${p}%, var(--surface));color:${p>45?'var(--accent-ink)':'var(--ink)'}`};
function toast(msg){const t=$('#toast');t.textContent=msg;t.hidden=false;clearTimeout(toast.h);toast.h=setTimeout(()=>t.hidden=true,2200)}
const fmtDate=t=>new Date(t).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
let LAST_TABLE=null; // {head:[], rows:[[]]}

/* ---------- charts ---------- */
function niceMax(v){ if(v<=5) return 5; const p=10**Math.floor(Math.log10(v)); const m=[1,2,2.5,5,10].find(m=>m*p>=v); return m*p; }
function columnChart(cats, series, opts={}){
  // series: [{name, color, values[]}]  — grouped columns
  const W=560,H=220,L=36,R=8,T=12,B=28, iw=W-L-R, ih=H-T-B;
  const max=niceMax(Math.max(1,...series.flatMap(s=>s.values)));
  const ticks=[0,.25,.5,.75,1].map(f=>f*max).filter(v=>Number.isInteger(v)||max<=5);
  const gw=iw/cats.length, bw=Math.min(36,(gw*0.7)/series.length);
  let g='';
  for(const v of ticks){ const y=T+ih-ih*v/max; g+=`<line class="grid" x1="${L}" x2="${W-R}" y1="${y}" y2="${y}"/><text x="${L-6}" y="${y+4}" text-anchor="end">${fmt(v)}</text>`; }
  cats.forEach((c,i)=>{
    const x0=L+gw*i+gw/2-(bw*series.length)/2;
    series.forEach((s,j)=>{ const v=s.values[i]||0, h=ih*v/max, x=x0+j*bw, y=T+ih-h;
      g+=`<rect x="${x+1}" y="${y}" width="${bw-2}" height="${h}" rx="2" style="fill:${s.color}"><title>${esc(s.name)} ${esc(c)}: ${v}</title></rect>`;
      if(v) g+=`<text x="${x+bw/2}" y="${y-4}" text-anchor="middle" class="ink">${fmt(v)}</text>`; });
    g+=`<text x="${L+gw*i+gw/2}" y="${H-8}" text-anchor="middle">${esc(c)}</text>`;
  });
  g+=`<line class="axis" x1="${L}" x2="${W-R}" y1="${T+ih}" y2="${T+ih}"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label||'chart')}">${g}</svg>`;
}
function lineChart(series, opts){
  // series: [{name,color,pts:[{x(0..1),y}]}], x labels months
  const W=560,H=240,L=36,R=12,T=12,B=28, iw=W-L-R, ih=H-T-B;
  const max=niceMax(Math.max(1,...series.flatMap(s=>s.pts.map(p=>p.y))));
  let g='';
  for(const f of [0,.25,.5,.75,1]){ const v=f*max, y=T+ih-ih*f; g+=`<line class="grid" x1="${L}" x2="${W-R}" y1="${y}" y2="${y}"/><text x="${L-6}" y="${y+4}" text-anchor="end">${fmt(v)}</text>`; }
  const xs=opts.xmin, xe=opts.xmax, sx=x=>L+iw*(x-xs)/(xe-xs||1);
  for(const t of opts.xticks){ g+=`<text x="${sx(t.x)}" y="${H-8}" text-anchor="middle">${esc(t.label)}</text><line class="grid" x1="${sx(t.x)}" x2="${sx(t.x)}" y1="${T}" y2="${T+ih}" stroke-dasharray="2 4"/>`; }
  for(const s of series){
    if(!s.pts.length) continue;
    let d='', prevY=0;
    d=`M${sx(xs)},${T+ih}`;
    for(const p of s.pts){ const x=sx(p.x); d+=` L${x},${T+ih-ih*prevY/max} L${x},${T+ih-ih*p.y/max}`; prevY=p.y; }
    const end=s.pts.at(-1);
    g+=`<path d="${d}" fill="none" style="stroke:${s.color}" stroke-width="2.2" stroke-linejoin="round"/>`;
    g+=`<circle cx="${sx(end.x)}" cy="${T+ih-ih*end.y/max}" r="4" style="fill:${s.color}"/><text x="${sx(end.x)+6}" y="${T+ih-ih*end.y/max-6}" class="ink">${esc(s.name)} · ${end.y}</text>`;
  }
  g+=`<line class="axis" x1="${L}" x2="${W-R}" y1="${T+ih}" y2="${T+ih}"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label)}">${g}</svg>`;
}
function barRows(list, ys, max){
  return `<div class="bars">${list.map(c=>{
    const segs=ys.map(y=>c.by[y]?`<span class="seg" style="width:${100*c.by[y]/max}%;background:${yCol(y)}" title="${y}: ${c.by[y]}"></span>`:'').join('');
    return `<button class="bar" data-co="${esc(c.key)}"><span class="name">${esc(c.name)}</span><span class="track">${segs}</span><span class="n">${inSel(c,ys)}</span></button>`;
  }).join('')}</div>`;
}
const legend=ys=>`<div class="legend">${ys.map(y=>`<span><i style="background:${yCol(y)}"></i>${y}</span>`).join('')}</div>`;

/* ---------- views ---------- */
function vOverview(D){
  const ys=selYears(D), L=filtered(D);
  const people=L.reduce((n,c)=>n+inSel(c,ys),0);
  const big=[...L].sort((a,b)=>inSel(b,ys)-inSel(a,ys))[0];
  const repeat=L.filter(c=>c.yearsAttended.length>1).length;
  const groups=L.filter(c=>inSel(c,ys)>1).length;
  const kpis=`<section class="stub kpis">
    <div class="kpi"><span class="lbl">Companies</span><b class="num">${fmt(L.length)}</b><small>${ys.length>1?ys[0]+'–'+ys.at(-1):ys[0]??'—'}</small></div>
    <div class="kpi"><span class="lbl">Tickets</span><b class="num">${fmt(people)}</b><small>with a company named</small></div>
    <div class="kpi"><span class="lbl">Per company</span><b class="num">${L.length?fmt(people/L.length):'0'}</b><small>average headcount</small></div>
    <div class="kpi"><span class="lbl">Sent a group</span><b class="num">${fmt(groups)}</b><small>2 or more people</small></div>
    <div class="kpi"><span class="lbl">Largest group</span><b class="num">${big?inSel(big,ys):0}</b><small>${big?esc(big.name):'—'}</small></div>
    <div class="kpi"><span class="lbl">Came back</span><b class="num">${fmt(repeat)}</b><small>attended in 2+ years</small></div>
  </section>`;
  // per-year (all years, current filters except year)
  const perYear=D.years.map(y=>{ const cs=filtered({...D}).length; return y; });
  const yAll=D.years;
  const saveYears=S.years; S.years=new Set();
  const Lall=filtered(D); S.years=saveYears;
  const pY=yAll.map(y=>Lall.reduce((n,c)=>n+(c.by[y]||0),0)), cY=yAll.map(y=>Lall.filter(c=>c.by[y]).length);
  const chart1=columnChart(yAll.map(String),[{name:'Tickets',color:'var(--accent)',values:pY},{name:'Companies',color:'var(--y3)',values:cY}],{label:'Tickets and companies per year'});
  const bands=[['1',n=>n===1],['2',n=>n===2],['3',n=>n===3],['4',n=>n===4],['5–9',n=>n>=5&&n<10],['10+',n=>n>=10]];
  const bv=bands.map(([,f])=>L.filter(c=>f(inSel(c,ys))).length);
  const chart2=columnChart(bands.map(b=>b[0]),[{name:'Companies',color:'var(--y4)',values:bv}],{label:'Companies by group size'});
  const top=[...L].sort((a,b)=>inSel(b,ys)-inSel(a,ys)||a.name.localeCompare(b.name)).slice(0,10);
  const max=Math.max(1,...top.map(c=>inSel(c,ys)));
  LAST_TABLE={head:['Company',...ys.map(String),'Total'],rows:[...L].sort((a,b)=>inSel(b,ys)-inSel(a,ys)).map(c=>[c.name,...ys.map(y=>c.by[y]||0),inSel(c,ys)])};
  return kpis+`<div class="grid2">
    <section class="stub card"><header><h2>Every year</h2><div class="legend"><span><i style="background:var(--accent)"></i>Tickets</span><span><i style="background:var(--y3)"></i>Companies</span></div></header>${chart1}
      ${yAll.length<2?'<p class="muted" style="margin:0;font-size:.88rem">Only one year loaded. Drop earlier exports onto the page to see the trend.</p>':''}</section>
    <section class="stub card"><header><h2>Group sizes</h2><span class="muted">companies sending N people</span></header>${chart2}</section>
  </div>
  <section class="stub card"><header><h2>Top 10 by headcount</h2>${legend(ys)}</header>${top.length?barRows(top,ys,max):'<div class="empty">No companies match these filters.</div>'}</section>`;
}
function vLeaderboard(D){
  const ys=selYears(D), L=filtered(D).sort((a,b)=>inSel(b,ys)-inSel(a,ys)||a.name.localeCompare(b.name));
  const list=S.topN==='all'?L:L.slice(0,+S.topN), max=Math.max(1,...list.map(c=>inSel(c,ys)));
  LAST_TABLE={head:['Rank','Company',...ys.map(String),'Total'],rows:list.map((c,i)=>[i+1,c.name,...ys.map(y=>c.by[y]||0),inSel(c,ys)])};
  return `<section class="stub card"><header><h2>Leaderboard</h2>
    <div class="field"><label for="topN" class="lbl">Show</label><select id="topN">${['10','25','50','100','all'].map(v=>`<option value="${v}" ${String(S.topN)===v?'selected':''}>${v==='all'?'All':'Top '+v}</option>`).join('')}</select>
    <span class="muted">${fmt(L.length)} companies</span></div></header>
    ${legend(ys)}
    ${list.length?barRows(list,ys,max):'<div class="empty">No companies match these filters.</div>'}</section>`;
}
function vMatrix(D){
  const ys=selYears(D), L=filtered(D), {col,dir}=S.sort;
  const val=c=>col==='name'?c.name.toLowerCase(): col==='total'?inSel(c,ys): col==='years'?c.yearsAttended.length: col==='first'?c.first: col==='last'?c.last: (c.by[col]||0);
  L.sort((a,b)=>{const x=val(a),y=val(b);return (x<y?-1:x>y?1:0)*dir||a.name.localeCompare(b.name)});
  const max=Math.max(1,...L.flatMap(c=>ys.map(y=>c.by[y]||0)));
  const th=(k,l,cls='')=>`<th class="${cls}"><button data-sort="${k}" ${col==k?`data-dir="${dir>0?'▲':'▼'}"`:''}>${l}</button></th>`;
  LAST_TABLE={head:['Company',...ys.map(String),'Total','Years attended','First','Last'],rows:L.map(c=>[c.name,...ys.map(y=>c.by[y]||0),inSel(c,ys),c.yearsAttended.length,c.first,c.last])};
  return `<section class="stub card"><header><h2>Company × year</h2><span class="muted">${fmt(L.length)} companies · click a header to sort, a row for detail</span></header>
  ${L.length?`<div class="tablewrap"><table><thead><tr>${th('name','Company')}${ys.map(y=>th(y,y,'c')).join('')}${th('total','Total','r')}${th('years','Years','r')}${th('first','First','r')}${th('last','Last','r')}</tr></thead><tbody>
  ${L.map(c=>`<tr data-co="${esc(c.key)}" tabindex="0"><td class="company">${esc(c.name)}${c.variants.size>1?` <span class="muted" title="${esc([...c.variants.keys()].join(', '))}">+${c.variants.size-1}</span>`:''}</td>${ys.map(y=>`<td class="c">${c.by[y]?`<span class="heat" style="${heat(c.by[y],max)}">${c.by[y]}</span>`:'<span class="muted">·</span>'}</td>`).join('')}<td class="r"><b>${inSel(c,ys)}</b></td><td class="r">${c.yearsAttended.length}</td><td class="r">${c.first}</td><td class="r">${c.last}</td></tr>`).join('')}
  </tbody></table></div>`:'<div class="empty">No companies match these filters.</div>'}</section>`;
}
function vMovers(D){
  if(D.years.length<2){ LAST_TABLE=null; return `<div class="empty"><h2>Needs two years of data</h2><p>Only ${D.years[0]??'no year'} is loaded. Drop an export from another year onto the page to see which companies are new, returning or missing.</p></div>`; }
  const B=S.cmpB&&D.years.includes(S.cmpB)?S.cmpB:D.years.at(-1);
  const A=S.cmpA&&D.years.includes(S.cmpA)&&S.cmpA!==B?S.cmpA:D.years[D.years.indexOf(B)-1]??D.years[0];
  const save=S.years; S.years=new Set([A,B]); const L=filtered(D); S.years=save;
  const neu=L.filter(c=>c.by[B]&&!c.by[A]).sort((a,b)=>b.by[B]-a.by[B]);
  const ret=L.filter(c=>c.by[B]&&c.by[A]).sort((a,b)=>(b.by[B]-b.by[A])-(a.by[B]-a.by[A]));
  const lost=L.filter(c=>c.by[A]&&!c.by[B]).sort((a,b)=>b.by[A]-a.by[A]);
  const opt=sel=>D.years.map(y=>`<option ${y===sel?'selected':''}>${y}</option>`).join('');
  const li=(c,right)=>`<button class="li" data-co="${esc(c.key)}"><span>${esc(c.name)}</span><span class="num">${right}</span></button>`;
  const d=c=>{const x=c.by[B]-c.by[A];return `${c.by[A]} → ${c.by[B]} <span class="delta ${x>0?'up':x<0?'down':''}">${x>0?'+':''}${x||'='}</span>`};
  LAST_TABLE={head:['Company','Status',String(A),String(B)],rows:[...neu.map(c=>[c.name,'new',0,c.by[B]]),...ret.map(c=>[c.name,'returning',c.by[A],c.by[B]]),...lost.map(c=>[c.name,'missing',c.by[A],0])]};
  return `<section class="stub card"><header><h2>Compare two years</h2>
    <div class="row" style="display:flex;gap:10px;flex-wrap:wrap"><div class="field"><label for="cmpA" class="lbl">From</label><select id="cmpA">${opt(A)}</select></div>
    <div class="field"><label for="cmpB" class="lbl">To</label><select id="cmpB">${opt(B)}</select></div></div></header>
    <div class="cols3">
      <div><h3><span class="pill new">New</span> ${neu.length} in ${B}, not ${A}</h3><div class="list">${neu.map(c=>li(c,c.by[B])).join('')||'<span class="muted">None</span>'}</div></div>
      <div><h3><span class="pill ret">Returning</span> ${ret.length} in both</h3><div class="list">${ret.map(c=>li(c,d(c))).join('')||'<span class="muted">None</span>'}</div></div>
      <div><h3><span class="pill lost">Missing</span> ${lost.length} in ${A}, not ${B}</h3><div class="list">${lost.map(c=>li(c,c.by[A])).join('')||'<span class="muted">None</span>'}</div></div>
    </div></section>`;
}
function vTimeline(D){
  const ys=selYears(D), L=filtered(D);
  const series=ys.map(y=>{
    const ts=L.flatMap(c=>c.dates.filter(d=>d.year===y).map(d=>d.t)).sort((a,b)=>a-b);
    const start=new Date(y,0,1).getTime(), len=new Date(y+1,0,1).getTime()-start;
    let n=0; const pts=[]; for(const t of ts){ n++; const x=(t-start)/len; if(pts.length&&pts.at(-1).x===x) pts.at(-1).y=n; else pts.push({x,y:n}); }
    return {name:String(y), color:yCol(y), pts};
  });
  const allx=series.flatMap(s=>s.pts.map(p=>p.x));
  if(!allx.length){ LAST_TABLE=null; return '<div class="empty">No order dates in the selected data.</div>'; }
  const mo=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const xmin=Math.max(0,Math.floor(Math.min(...allx)*12)/12), xmax=Math.min(1,Math.ceil(Math.max(...allx)*12+.0001)/12);
  const xticks=mo.map((l,i)=>({x:i/12,label:l})).filter(t=>t.x>=xmin-1e-9&&t.x<=xmax+1e-9);
  const chart=lineChart(series,{xmin,xmax,xticks,label:'Cumulative tickets by order date'});
  const ty=S.tlYear&&ys.includes(S.tlYear)?S.tlYear:ys.at(-1);
  const firsts=L.map(c=>{const d=c.dates.find(d=>d.year===ty);return d?{c,t:d.t,n:c.by[ty]}:null}).filter(Boolean).sort((a,b)=>a.t-b.t);
  LAST_TABLE={head:['Company','First order','People'],rows:firsts.map(f=>[f.c.name,fmtDate(f.t),f.n])};
  // monthly bars
  const months=mo.map((m,i)=>i), mv=ys.map(y=>({name:String(y),color:yCol(y),values:months.map(i=>L.reduce((n,c)=>n+c.dates.filter(d=>d.year===y&&new Date(d.t).getMonth()===i).length,0))}));
  const used=months.filter(i=>mv.some(s=>s.values[i]));
  const chart2=columnChart(used.map(i=>mo[i]),mv.map(s=>({...s,values:used.map(i=>s.values[i])})),{label:'Tickets per month'});
  return `<div class="grid2">
    <section class="stub card"><header><h2>Tickets over the booking window</h2>${legend(ys)}</header>${chart}<p class="muted" style="margin:0;font-size:.88rem">Running total of tickets by order date. Years are overlaid on the same calendar.</p></section>
    <section class="stub card"><header><h2>Tickets per month</h2>${legend(ys)}</header>${chart2}</section>
  </div>
  <section class="stub card"><header><h2>When each company first booked</h2>
    <div class="field"><label for="tlYear" class="lbl">Year</label><select id="tlYear">${ys.map(y=>`<option ${y===ty?'selected':''}>${y}</option>`).join('')}</select></div></header>
    <div class="tablewrap"><table><thead><tr><th>Company</th><th class="r">First order</th><th class="r">People</th></tr></thead><tbody>
    ${firsts.map(f=>`<tr data-co="${esc(f.c.key)}" tabindex="0"><td class="company">${esc(f.c.name)}</td><td class="r">${fmtDate(f.t)}</td><td class="r">${f.n}</td></tr>`).join('')}
    </tbody></table></div></section>`;
}

/* ---------- detail dialog ---------- */
let D=null;
function openDetail(key){
  const c=D.cos.find(c=>c.key===key); if(!c) return;
  const max=Math.max(1,...D.years.map(y=>c.by[y]||0));
  const chart=columnChart(D.years.map(String),[{name:c.name,color:'var(--accent)',values:D.years.map(y=>c.by[y]||0)}],{label:'Headcount per year'});
  const others=D.cos.filter(o=>o.key!==key&&o.key!=='__blank').sort((a,b)=>a.name.localeCompare(b.name));
  $('#dlgBody').innerHTML=`<header><div><div class="lbl">Company</div><h2>${esc(c.name)}</h2></div><button class="btn" id="dlgClose">Close</button></header>
  <div class="kpis stub" style="border-radius:8px"><div class="kpi"><span class="lbl">Tickets</span><b class="num">${c.total}</b></div><div class="kpi"><span class="lbl">Years</span><b class="num">${c.yearsAttended.length}</b></div><div class="kpi"><span class="lbl">Peak</span><b class="num">${max}</b></div></div>
  ${chart}
  <div><div class="lbl">Names on orders</div><div class="variants">${[...c.variants].map(([v,n])=>`<code>${esc(v)} ×${n}</code>`).join('')}</div></div>
  ${c.dates.length?`<div><div class="lbl">Order dates</div><div class="variants">${c.dates.map(d=>`<code>${fmtDate(d.t)}</code>`).join('')}</div></div>`:''}
  <form id="mergeForm" class="field" style="flex-wrap:wrap"><label for="mergeInto" class="lbl">Merge into</label>
    <select id="mergeInto"><option value="">Choose a company…</option>${others.map(o=>`<option value="${esc(o.key)}">${esc(o.name)}</option>`).join('')}</select>
    <button class="btn primary">Merge</button></form>`;
  $('#dlg').showModal();
  $('#dlgClose').onclick=()=>$('#dlg').close();
  $('#mergeForm').onsubmit=e=>{e.preventDefault();const to=$('#mergeInto').value;if(!to)return;S.manual[key]=to;store.set('manual',S.manual);$('#dlg').close();render();toast(`Merged ${c.name}`)};
}
$('#dlg').addEventListener('click',e=>{if(e.target===$('#dlg'))$('#dlg').close()});

/* ---------- render ---------- */
const EMPTY=`<div class="empty" style="padding:56px 24px;display:grid;gap:10px;justify-items:center">
  <h2>Drop CSV exports onto the page</h2>
  <p style="margin:0;max-width:52ch">Each file needs a column with “company” in its name. A column with “date” in its name sets the year, so you can drop one export per year and compare them.</p>
  <p style="margin:0"><label class="btn primary" for="file">Choose files</label></p>
  <pre class="num" style="margin:8px 0 0;text-align:left;background:var(--sunk);padding:10px 14px;border-radius:6px;font-size:12px;overflow-x:auto;max-width:100%">Order date,Company name
12 Jun 2025 10:00 AM,Example Ltd
14 Jun 2025 09:30 AM,Example Ltd</pre>
</div>`;
const VIEWS={overview:vOverview,leaderboard:vLeaderboard,matrix:vMatrix,movers:vMovers,timeline:vTimeline};
function render(){
  D=build(); YEARS_ALL=D.years;
  $('#yearChips').innerHTML=`<button class="chip" data-year="all" aria-pressed="${S.years.size===0}">All</button>`+
    D.years.map(y=>`<button class="chip" data-year="${y}" aria-pressed="${S.years.has(y)}"><span class="sw" style="background:${yCol(y)}"></span>${y}</button>`).join('');
  document.querySelectorAll('nav.tabs button').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===S.tab));
  $('#view').innerHTML=S.sources.length? VIEWS[S.tab](D) : EMPTY;
  if(!S.sources.length) LAST_TABLE=null;
  $('#sources').innerHTML=S.sources.map((s,i)=>{const ys=[...new Set(s.records.map(r=>r.year))].sort().join(', ');return `<span class="src">${esc(s.name)} · ${s.records.length} rows · ${ys}<button aria-label="Remove ${esc(s.name)}" data-rm="${i}">×</button></span>`}).join('')||'<span class="muted">No data loaded.</span>';
  $('#sourcesBar').innerHTML=$('#sources').innerHTML;
  $('#srcSummary').textContent=`${S.sources.reduce((n,s)=>n+s.records.length,0)} rows · ${D.years.join(', ')||'no years'}`;
}

/* ---------- events ---------- */
document.addEventListener('click',e=>{
  const t=e.target.closest('[data-tab],[data-year],[data-co],[data-sort],[data-rm]'); if(!t) return;
  if(t.dataset.tab){ S.tab=t.dataset.tab; store.set('tab',S.tab); history.replaceState(null,'','#'+S.tab); render(); }
  else if(t.dataset.year){ const y=t.dataset.year; if(y==='all') S.years.clear(); else { const n=+y; S.years.has(n)?S.years.delete(n):S.years.add(n); } store.set('years',[...S.years]); render(); }
  else if(t.dataset.sort){ const k=isNaN(t.dataset.sort)?t.dataset.sort:+t.dataset.sort; S.sort={col:k,dir:S.sort.col===k?-S.sort.dir:(k==='name'?1:-1)}; store.set('sort',S.sort); render(); }
  else if(t.dataset.rm){ S.sources.splice(+t.dataset.rm,1); saveSources(); render(); }
  else if(t.dataset.co){ openDetail(t.dataset.co); }
});
document.addEventListener('keydown',e=>{ if(e.key==='Enter'&&e.target.matches('tr[data-co]')) openDetail(e.target.dataset.co); });
document.addEventListener('change',e=>{
  const id=e.target.id;
  if(id==='topN'){S.topN=e.target.value;store.set('topN',S.topN);render()}
  if(id==='cmpA'){S.cmpA=+e.target.value;render()}
  if(id==='cmpB'){S.cmpB=+e.target.value;render()}
  if(id==='tlYear'){S.tlYear=+e.target.value;render()}
});
$('#q').addEventListener('input',e=>{S.q=e.target.value;render()});
$('#minPeople').addEventListener('input',e=>{S.minPeople=Math.max(1,+e.target.value||1);render()});
$('#minYears').addEventListener('input',e=>{S.minYears=Math.max(1,+e.target.value||1);render()});
$('#sizeBand').addEventListener('change',e=>{S.size=e.target.value;render()});
for(const k of ['merge','hideFree','showBlank']){ const el=$('#'+k); el.checked=S[k]; el.addEventListener('change',()=>{S[k]=el.checked;store.set(k,S[k]);render()}); }
$('#btnData').onclick=()=>{const p=$('#dataPanel');p.hidden=!p.hidden;$('#btnData').setAttribute('aria-expanded',!p.hidden)};
$('#fallbackYear').value=new Date().getFullYear();
function addText(name,text){
  try{ const recs=toRecords(text,+$('#fallbackYear').value||new Date().getFullYear()); S.sources.push({name,records:recs}); saveSources(); render(); toast(`Added ${recs.length} rows from ${name}`); }
  catch(err){ toast(`${name}: ${err.message}`); }
}
function addFiles(files){ for(const f of files){ const r=new FileReader(); r.onload=()=>addText(f.name,r.result); r.readAsText(f); } }
$('#file').addEventListener('change',e=>{addFiles(e.target.files);e.target.value=''});
const overlay=$('#dropOverlay'); let dragDepth=0;
const hasFiles=e=>[...(e.dataTransfer?.types||[])].includes('Files');
window.addEventListener('dragenter',e=>{if(!hasFiles(e))return;e.preventDefault();dragDepth++;overlay.hidden=false});
window.addEventListener('dragover',e=>{if(!hasFiles(e))return;e.preventDefault();e.dataTransfer.dropEffect='copy'});
window.addEventListener('dragleave',e=>{if(!hasFiles(e))return;if(--dragDepth<=0){dragDepth=0;overlay.hidden=true}});
window.addEventListener('drop',e=>{if(!hasFiles(e))return;e.preventDefault();dragDepth=0;overlay.hidden=true;
  const fs=[...e.dataTransfer.files].filter(f=>/\.csv$|text\/csv|text\/plain/i.test(f.name+' '+f.type));
  if(!fs.length){toast('Drop a .csv file');return} addFiles(fs)});
$('#btnPaste').onclick=()=>{const t=$('#paste').value.trim();if(!t)return;addText('pasted data',t);$('#paste').value=''};
$('#btnReset').onclick=()=>{S.sources=[];saveSources();render();toast('All data cleared')};
$('#btnUnmerge').onclick=()=>{S.manual={};store.set('manual',{});render();toast('Manual merges cleared')};
$('#btnCopy').onclick=async()=>{
  if(!LAST_TABLE){toast('Nothing to copy in this view');return}
  const q=v=>/[",\n]/.test(String(v))?`"${String(v).replace(/"/g,'""')}"`:v;
  const csv=[LAST_TABLE.head,...LAST_TABLE.rows].map(r=>r.map(q).join(',')).join('\n');
  try{await navigator.clipboard.writeText(csv);toast(`Copied ${LAST_TABLE.rows.length} rows`)}
  catch{ $('#paste').value=csv; $('#dataPanel').hidden=false; $('#paste').closest('details').open=true; $('#paste').select(); toast('Clipboard blocked; CSV is selected in the paste box') }
};
window.addEventListener('hashchange',()=>{const h=location.hash.slice(1);if(VIEWS[h]){S.tab=h;render()}});
render();
