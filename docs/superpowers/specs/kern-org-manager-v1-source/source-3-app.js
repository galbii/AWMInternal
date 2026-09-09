// kern-org-manager.html source lines 236-2332 — the entire application.

const DEFAULT_TITLES = SEED.titles.slice();
const LS_KEY = 'kernOrgApp.v3';
const IDB_DB = 'kernOrgApp';
let seq = 0;
const uid = (p)=> p+'-'+(Date.now().toString(36))+'-'+(seq++).toString(36);

/* ---------- state ---------- */
let state = load();
let dirty = false;
let fileHandle = null;
let activeTab = 'branches';
let filter = '';
let openBranchId = null;   // when set, Branches tab shows detail editor
let branchSort = {key:'name', dir:1};
let dataMetric = 'dollars';
let tenureMetric = 'both';
let tenureView = 'charts';
let tenureSel = null;
let rosterFilter = 'all';
let creditSel = null;
let empFilters = {name:'',title:'',branch:'',email:'',phone:''};
let empActiveFilter = null;
let analysisMetric = 'dollars';
let analysisDim = 'division';
let analysisTopN = 10;
let highlightMetric = 'dollars';
let highlightDim = 'division';
let highlightQA = null;
let highlightQB = null;
let monthlyMetric = 'dollars';
let monthlyMode = 'cumulative';
let monthlySel = null;
let monthlyBranchSel = null;
let monthlyView = 'merged';
let monthlyConf = 0.75;
let chartInstances = [];
let resizeHooked = false;
const PALETTE=['#25e0ff','#ff3b52','#7cf6ff','#b06bff','#38f2b0','#ffd166','#ff7ab0','#5aa9ff','#f472b6','#a3e635','#22d3ee','#fb923c','#e879f9','#4ade80','#60a5fa','#f87171'];

function emp(name,title){ return {id:uid('e'),name:(name||'').trim(),title:title||'',email:'',phone:'',notes:''}; }

function load(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(raw){ const d = JSON.parse(raw); if(d && d.branches) return normalize(d); }
  }catch(e){}
  return normalize(JSON.parse(JSON.stringify(SEED)));
}
function normalize(d){
  d.divisions ||= []; d.regions ||= []; d.areas ||= []; d.branches ||= [];
  d.titles = (Array.isArray(d.titles)&&d.titles.length)? d.titles : DEFAULT_TITLES.slice();
  d.divisions.forEach(x=>{ if(x.manager===undefined)x.manager=''; });
  d.superDivisions = Array.isArray(d.superDivisions)? d.superDivisions : [];
  d.superDivisions.forEach(s=>{ if(s.manager===undefined)s.manager=''; });
  if(!d.superDivisions.length){ const sid=uid('sd'); d.superDivisions.push({id:sid,name:'Matrix',manager:''}); d.divisions.forEach(x=>{ x.parentId=sid; }); }
  d.divisions.forEach(x=>{ if(x.parentId===undefined) x.parentId=(d.superDivisions[0]?d.superDivisions[0].id:null); });
  d.areas.forEach(a=>{ if(a.manager===undefined)a.manager=''; });
  d.regions.forEach(r=>{ if(r.manager===undefined)r.manager=''; });
  d.branches.forEach(b=>{
    if(b.areaId===undefined)b.areaId=null; if(b.regionId===undefined)b.regionId=null; if(b.divisionId===undefined)b.divisionId=null;
    b.servicedBy = Array.isArray(b.servicedBy)? b.servicedBy : [];
    if(!Array.isArray(b.roster)){
      const r=[];
      if(b.manager) r.push(emp(b.manager,'Branch Manager'));
      (b.processors||[]).forEach(n=>{ if(n) r.push(emp(n,'Processor')); });
      (b.loas||[]).forEach(n=>{ if(n) r.push(emp(n,'Loan Officer Assistant')); });
      b.roster=r;
    }
    b.processors ||= []; b.loas ||= [];
    b.archived = !!b.archived;
  });
  if(!d.production || typeof d.production!=='object') d.production = JSON.parse(JSON.stringify(PROD));
  if(!d.prodExcluded || typeof d.prodExcluded!=='object') d.prodExcluded = {};
  if(!d.productMix || typeof d.productMix!=='object') d.productMix = {};   // {org:{conv,fha,va,nonqm}}
  if(!d.pnl || typeof d.pnl!=='object') d.pnl = {};
  d.pnl = Object.assign({procFee:695, loaBps:10, people:5, salary:5000, hiBps:10, loBps:5, procHiPct:67, loaHiPct:33, onTop:true, useRoster:true, units:'', vol:''}, d.pnl);
  // drop junk branches (no name and no numeric ORGID)
  d.branches = d.branches.filter(b=>{ const nm=(b.name||'').trim(); const og=(b.orgid||'').toString().trim();
    return nm || /^\d+$/.test(og); });
  // one-time division tagging: Matrix Red -> Smukalla / VanderWegen / Dennis; Matrix Blue -> everyone else
  if(!d._divTagsApplied){
    const redDiv=d.divisions.find(x=>/red/i.test(x.name));
    const blueDiv=d.divisions.find(x=>/blue/i.test(x.name));
    const RED=['smukalla','vanderwegen','dennis'];
    d.branches.forEach(b=>{
      const key=((b.manager||'')+' '+(b.name||'')).toLowerCase();
      if(RED.some(n=>key.includes(n))){ if(redDiv)b.divisionId=redDiv.id; }
      else if(blueDiv){ b.divisionId=blueDiv.id; }
    });
    d._divTagsApplied=true;
  }
  // one-time import of Ty Kern division roster (adds new branches + people, non-destructive, dedup by email/name)
  if(!d._tyRosterImported && typeof TYROSTER!=='undefined' && TYROSTER){
    (TYROSTER.branches||[]).forEach(nb=>{
      if(!d.branches.some(b=>String(b.orgid)===String(nb.orgid))){
        d.branches.push({id:uid('b'),name:nb.name,orgid:String(nb.orgid),manager:'',
          processors:[],loas:[],servicedBy:[],roster:[],areaId:null,regionId:null,divisionId:null,archived:false});
      }
    });
    (TYROSTER.people||[]).forEach(p=>{
      const b=d.branches.find(x=>String(x.orgid)===String(p.orgid)); if(!b)return; b.roster=b.roster||[];
      const em=(p.email||'').toLowerCase(), nmL=(p.name||'').toLowerCase();
      const dup=b.roster.some(e=>(em&&(e.email||'').toLowerCase()===em)||(nmL&&(e.name||'').toLowerCase()===nmL));
      if(!dup) b.roster.push({id:uid('e'),name:p.name,title:'',email:p.email||'',phone:'',notes:'',mgr:p.mgr||''});
    });
    d._tyRosterImported=true;
  }
  return d;
}
function saveLocal(){ try{ localStorage.setItem(LS_KEY, JSON.stringify(state)); }catch(e){} }
function touch(){ dirty=true; updateStatus(); saveLocal(); }
function updateStatus(){
  const ss=document.getElementById('saveStatus');
  ss.textContent = dirty ? 'Unsaved changes' : 'All changes saved';
  ss.className = 'status'+(dirty?' dirty':'');
  const fs=document.getElementById('fileStatus');
  fs.textContent = 'Saved in this app';
}

/* ---------- helpers ---------- */
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function byId(arr,id){ return arr.find(x=>x.id===id); }
/* Area / Region / Division are INDEPENDENT tags on each branch. */
function branchArea(b){ return b.areaId?byId(state.areas,b.areaId):null; }
function branchRegion(b){ return b.regionId?byId(state.regions,b.regionId):null; }
function branchDivision(b){ return b.divisionId?byId(state.divisions,b.divisionId):null; }
function branchHasTag(b){ return !!(b.areaId||b.regionId||b.divisionId); }
function branchTagLabel(b){ const a=branchArea(b),r=branchRegion(b),d=branchDivision(b); return a?a.name:(r?r.name:(d?d.name:'')); }
function divisionOfRegion(rid){ const r=byId(state.regions,rid); return r?r.divisionId:null; }
function branchCountForArea(aid){ return state.branches.filter(b=>!b.archived&&b.areaId===aid).length; }
function branchCountForRegion(rid){ return state.branches.filter(b=>!b.archived&&b.regionId===rid).length; }
function branchCountForDivision(did){ return state.branches.filter(b=>!b.archived&&b.divisionId===did).length; }
function subdivisionsOf(sid){ return state.divisions.filter(d=>d.parentId===sid); }
function branchCountForSuperDivision(sid){ return subdivisionsOf(sid).reduce((n,d)=>n+branchCountForDivision(d.id),0); }
function superOfSub(subId){ const d=byId(state.divisions,subId); return d&&d.parentId?byId(state.superDivisions,d.parentId):null; }
function statusPill(s){
  const t=(s||'').toLowerCase(); let cls='none';
  if(t==='active')cls='active'; else if(t==='inactive')cls='inactive'; else if(t==='pending')cls='pending';
  return '<span class="pill '+cls+'">'+esc(s||'—')+'</span>';
}
function toast(msg,err){
  const t=document.getElementById('toast');
  t.textContent=msg; t.className='toast show'+(err?' err':'');
  clearTimeout(t._t); t._t=setTimeout(()=>t.className='toast',1900);
}
function refreshTitlesDatalist(){
  document.getElementById('titlesList').innerHTML = state.titles.map(t=>'<option value="'+esc(t)+'">').join('');
}

/* ---------- persistence ---------- */
function idb(){ return new Promise((res,rej)=>{const r=indexedDB.open(IDB_DB,1);
  r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);}); }
async function idbSet(k,v){ try{const db=await idb();return new Promise(res=>{const tx=db.transaction('kv','readwrite');tx.objectStore('kv').put(v,k);tx.oncomplete=()=>res();});}catch(e){} }
async function idbGet(k){ try{const db=await idb();return new Promise(res=>{const tx=db.transaction('kv','readonly');const rq=tx.objectStore('kv').get(k);rq.onsuccess=()=>res(rq.result);rq.onerror=()=>res(null);});}catch(e){return null;} }
const canFS = 'showSaveFilePicker' in window;
async function reconnectHandle(){ if(!canFS)return; const h=await idbGet('fileHandle'); if(!h)return; try{await h.queryPermission({mode:'readwrite'}); fileHandle=h; updateStatus();}catch(e){} }

function saveToFile(){
  // Save into the app itself (this browser). Data is also auto-saved on every change.
  saveLocal(); dirty=false; updateStatus(); toast('Saved');
}
function downloadJSON(data){
  const blob=new Blob([data],{type:'application/json'}); const a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download='kern-org.json'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
async function loadFromFile(){
  try{
    if(canFS){
      const [h]=await window.showOpenFilePicker({types:[{description:'Org data (JSON)',accept:{'application/json':['.json']}}]});
      const f=await h.getFile(); state=normalize(JSON.parse(await f.text())); fileHandle=h; await idbSet('fileHandle',h);
      dirty=false; saveLocal(); openBranchId=null; render(); toast('Loaded '+f.name);
    }else{
      const inp=document.createElement('input'); inp.type='file'; inp.accept='.json,application/json';
      inp.onchange=async()=>{const f=inp.files[0];if(!f)return; state=normalize(JSON.parse(await f.text()));
        dirty=false; saveLocal(); openBranchId=null; render(); toast('Loaded '+f.name);}; inp.click();
    }
  }catch(e){ if(e&&e.name!=='AbortError') toast('Could not load file',true); }
}
function exportCSV(){
  const rows=[['ORGID','Branch','Status','Sub-division','Region','Area','Branch Manager','Area Manager','Regional Manager','Divisional Manager','Serviced By','Roster']];
  state.branches.filter(b=>!b.archived).forEach(b=>{
    const r=branchRegion(b); const div=branchDivision(b); const ar=branchArea(b);
    rows.push([b.orgid,b.name,b.status,div?div.name:'',r?r.name:'',ar?ar.name:'',
      b.manager||'', ar?ar.manager:'', r?r.manager:'', div?div.manager:'',
      (b.servicedBy||[]).join('; '),
      (b.roster||[]).map(e=>e.name+(e.title?' ('+e.title+')':'')).join('; ')]);
  });
  const csv=rows.map(r=>r.map(c=>{c=String(c==null?'':c);return /[",\n]/.test(c)?'"'+c.replace(/"/g,'""')+'"':c;}).join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv'}); const a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download='kern-branches.csv'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); toast('Exported CSV');
}
function resetToSeed(){
  confirmDialog('Reset to spreadsheet defaults?','This replaces all current data with the original spreadsheet import. Save a backup first if needed.',()=>{
    state=normalize(JSON.parse(JSON.stringify(SEED))); openBranchId=null; touch(); render(); toast('Reset to defaults');
  },'Reset');
}
function confirmDialog(title,msg,onYes,yesLabel){
  const d=document.getElementById('confirmDlg');
  document.getElementById('confirmTitle').textContent=title;
  document.getElementById('confirmMsg').textContent=msg;
  const yes=document.getElementById('confirmYes'); yes.textContent=yesLabel||'Delete';
  const no=document.getElementById('confirmNo');
  const cleanup=()=>{yes.onclick=null;no.onclick=null;d.close();};
  yes.onclick=()=>{cleanup();onYes();}; no.onclick=cleanup; d.showModal();
}

/* ---------- tabs ---------- */
const TABS=[
  {id:'branches',label:'Branches'},{id:'areas',label:'Areas'},{id:'regions',label:'Regions'},
  {id:'divisions',label:'Divisions'},{id:'titles',label:'Titles'},{id:'archive',label:'Archive'},{id:'employees',label:'Employees'},{id:'roster',label:'Branch Roster'},
  {id:'data',label:'Data'},{id:'credit',label:'Credit Report Analysis'},{id:'tenure',label:'Tenure'},{id:'analysis',label:'Analysis'},{id:'monthly',label:'Monthly'},{id:'highlight',label:'Highlight'},{id:'hierarchy',label:'Hierarchy'},{id:'builder',label:'Org Builder'},
];
function renderTabs(){
  const counts={branches:state.branches.filter(b=>!b.archived).length,areas:state.areas.length,regions:state.regions.length,
    divisions:state.superDivisions.length,titles:state.titles.length,archive:state.branches.filter(b=>b.archived).length,
    employees:state.branches.filter(b=>!b.archived).reduce((n,b)=>n+(b.roster||[]).length,0),
    roster:state.branches.filter(b=>!b.archived).length,
    data:Object.keys(state.production||{}).length};
  const noCount={builder:1,hierarchy:1,analysis:1,highlight:1,monthly:1,tenure:1,credit:1};
  document.getElementById('tabs').innerHTML=TABS.map(t=>
    '<div class="tab'+(t.id===activeTab?' active':'')+'" data-tab="'+t.id+'">'+t.label+
    (noCount[t.id]?'':'<span class="count">'+counts[t.id]+'</span>')+'</div>').join('');
  document.querySelectorAll('.tab').forEach(el=>el.onclick=()=>{activeTab=el.dataset.tab;filter='';openBranchId=null;render();});
}

/* ---------- shared toolbar ---------- */
function toolbar(addLabel,onAdd,showSearch){
  const t=document.createElement('div'); t.className='toolbar';
  if(onAdd){ const b=document.createElement('button'); b.className='primary'; b.textContent='+ '+addLabel; b.onclick=onAdd; t.appendChild(b); }
  if(showSearch){ const s=document.createElement('input'); s.className='search'; s.placeholder='Search…'; s.value=filter;
    s.oninput=()=>{filter=s.value.toLowerCase();renderBody();}; t.appendChild(s); }
  const grow=document.createElement('div'); grow.className='grow'; t.appendChild(grow);
  const save=document.createElement('button'); save.className='good'; save.textContent='💾 Save';
  save.title='Save into the app (stored in this browser)'; save.onclick=saveToFile; t.appendChild(save);
  const csv=document.createElement('button'); csv.className='ghost'; csv.textContent='Export CSV'; csv.onclick=exportCSV; t.appendChild(csv);
  const rs=document.createElement('button'); rs.className='ghost'; rs.textContent='Reset'; rs.onclick=resetToSeed; t.appendChild(rs);
  return t;
}

/* ---------- select builders ---------- */
function branchParentSelect(b){
  const opts=['<option value="">— Unassigned —</option>'];
  if(state.regions.length){ opts.push('<optgroup label="Regions (direct)">');
    state.regions.forEach(r=>opts.push('<option value="region:'+r.id+'"'+(!b.areaId&&b.regionId===r.id?' selected':'')+'>'+esc(r.name)+'</option>'));
    opts.push('</optgroup>'); }
  if(state.areas.length){ opts.push('<optgroup label="Areas">');
    state.areas.forEach(a=>{const r=byId(state.regions,a.regionId);
      opts.push('<option value="area:'+a.id+'"'+(b.areaId===a.id?' selected':'')+'>'+esc(a.name)+(r?' ('+esc(r.name)+')':'')+'</option>');});
    opts.push('</optgroup>'); }
  return '<select data-role="branchParent">'+opts.join('')+'</select>';
}
function simpleSelect(role,list,selId,placeholder){
  let o='<option value="">'+placeholder+'</option>';
  list.forEach(x=>o+='<option value="'+x.id+'"'+(x.id===selId?' selected':'')+'>'+esc(x.name)+'</option>');
  return '<select data-role="'+role+'">'+o+'</select>';
}
function setBranchParent(b,val){
  if(!val){b.areaId=null;b.regionId=null;}
  else{const [t,id]=val.split(':'); if(t==='area'){b.areaId=id;b.regionId=null;}else{b.regionId=id;b.areaId=null;}}
}

/* ---------- render ---------- */
function render(){ renderTabs(); refreshTitlesDatalist(); renderBody(); updateStatus(); }
function renderBody(){
  disposeCharts();
  const v=document.getElementById('view'); v.innerHTML='';
  if(activeTab==='branches')return openBranchId?renderBranchDetail(v):renderBranches(v);
  if(activeTab==='builder')return renderBuilder(v);
  if(activeTab==='areas')return renderAreas(v);
  if(activeTab==='regions')return renderRegions(v);
  if(activeTab==='divisions')return renderDivisions(v);
  if(activeTab==='titles')return renderTitles(v);
  if(activeTab==='archive')return renderArchive(v);
  if(activeTab==='employees')return renderEmployees(v);
  if(activeTab==='roster')return renderRoster(v);
  if(activeTab==='data')return renderData(v);
  if(activeTab==='tenure')return renderTenure(v);
  if(activeTab==='credit')return renderCredit(v);
  if(activeTab==='analysis')return renderAnalysis(v);
  if(activeTab==='monthly')return renderMonthly(v);
  if(activeTab==='highlight')return renderHighlight(v);
  if(activeTab==='hierarchy')return renderHierarchy(v);
}

/* ---------- Branches list ---------- */
function renderBranches(v){
  const tb=toolbar('Add branch',()=>{
    const nb={id:uid('b'),orgid:'',name:'New Branch',manager:'',status:'Active',regionPending:'',
      processors:[],loas:[],servicedBy:[],roster:[],areaId:null,regionId:null,divisionId:null,archived:false};
    state.branches.unshift(nb); openBranchId=nb.id; touch(); renderBody();
  },true);
  const inactiveN=state.branches.filter(b=>!b.archived && (b.status||'').toLowerCase()==='inactive').length;
  const arch=document.createElement('button'); arch.className='sm';
  arch.textContent='Archive inactive'+(inactiveN?(' ('+inactiveN+')'):''); arch.disabled=!inactiveN;
  arch.title='Move all Inactive branches to the Archive tab'; arch.onclick=archiveInactiveBranches;
  tb.insertBefore(arch, tb.children[1]);
  v.appendChild(tb);
  v.insertAdjacentHTML('beforeend','<div class="hint">Click <b>Open</b> to edit a single branch — placement, managers, serviced-by, and full roster. Use <b>Archive</b> to move a branch to the Archive tab.</div>');
  const card=document.createElement('div'); card.className='card';
  let list=state.branches.filter(b=>!b.archived);
  if(filter) list=list.filter(b=>[b.orgid,b.name,b.manager,b.status,b.regionPending].join(' ').toLowerCase().includes(filter));
  if(!list.length){ card.innerHTML='<div class="empty">No branches match.</div>'; v.appendChild(card); return; }
  const cols=[
    {key:'orgid',label:'ORGID',num:true,get:b=>b.orgid},
    {key:'name',label:'Branch',get:b=>b.name},
    {key:'manager',label:'Branch Manager',get:b=>b.manager},
    {key:'area',label:'Area',get:b=>{const a=branchArea(b);return a?a.name:'';}},
    {key:'region',label:'Region',get:b=>{const r=branchRegion(b);return r?r.name:'';}},
    {key:'division',label:'Sub-division',get:b=>{const d=branchDivision(b);return d?d.name:'';}},
    {key:'roster',label:'Roster',num:true,get:b=>(b.roster||[]).length},
  ];
  const sc=cols.find(c=>c.key===branchSort.key)||cols[1];
  list.sort((a,b)=>{
    let va=sc.get(a), vb=sc.get(b);
    if(sc.num){ va=parseFloat(va)||0; vb=parseFloat(vb)||0; return (va-vb)*branchSort.dir; }
    va=(va||'').toString().toLowerCase(); vb=(vb||'').toString().toLowerCase();
    return (va<vb?-1:va>vb?1:0)*branchSort.dir;
  });
  let html='<table class="tbl-center"><thead><tr>';
  cols.forEach(c=>{ const on=branchSort.key===c.key; const arrow=on?(branchSort.dir>0?'▲':'▼'):'▲';
    html+='<th class="sortable" data-sk="'+c.key+'">'+esc(c.label)+'<span class="sort-arrow'+(on?' on':'')+'">'+arrow+'</span></th>'; });
  html+='<th style="width:220px"></th></tr></thead><tbody>';
  list.forEach(b=>{
    const ar=branchArea(b); const r=branchRegion(b); const dv=branchDivision(b);
    html+='<tr data-id="'+b.id+'">'+
      '<td class="muted">'+esc(b.orgid||'—')+'</td>'+
      '<td><button class="link" data-open="1">'+esc(b.name||'(unnamed)')+'</button></td>'+
      '<td>'+(b.manager?esc(b.manager):'—')+'</td>'+
      '<td class="muted">'+(ar?esc(ar.name):'—')+'</td>'+
      '<td class="muted">'+(r?esc(r.name):'—')+'</td>'+
      '<td class="muted">'+(dv?esc(dv.name):'—')+'</td>'+
      '<td class="num">'+(b.roster||[]).length+'</td>'+
      '<td class="actions"><button class="sm" data-open="1">Open</button> <button class="sm" data-arch="1">Archive</button> <button class="sm danger" data-del="1">Delete</button></td></tr>';
  });
  html+='</tbody></table>'; card.innerHTML=html; v.appendChild(card);
  card.querySelectorAll('th[data-sk]').forEach(th=>th.onclick=()=>{
    const k=th.dataset.sk;
    if(branchSort.key===k) branchSort.dir*=-1; else { branchSort.key=k; branchSort.dir=1; }
    renderBody();
  });
  card.querySelectorAll('tr[data-id]').forEach(tr=>{
    const b=byId(state.branches,tr.dataset.id);
    tr.querySelectorAll('[data-open]').forEach(el=>el.onclick=()=>{openBranchId=b.id;renderBody();window.scrollTo(0,0);});
    tr.querySelector('[data-arch]').onclick=()=>archiveBranch(b.id);
    tr.querySelector('[data-del]').onclick=()=>confirmDialog('Delete branch?','“'+(b.name||b.orgid)+'” will be removed.',()=>{
      state.branches=state.branches.filter(x=>x.id!==b.id);touch();renderTabs();renderBody();});
  });
}

/* archive actions */
function archiveBranch(id){ const b=byId(state.branches,id); if(!b)return; b.archived=true; if(openBranchId===id)openBranchId=null;
  touch(); renderTabs(); renderBody(); toast('Branch archived'); }
function restoreBranch(id){ const b=byId(state.branches,id); if(!b)return; b.archived=false; touch(); renderTabs(); renderBody(); toast('Branch restored'); }
function archiveInactiveBranches(){
  const targets=state.branches.filter(b=>!b.archived && (b.status||'').toLowerCase()==='inactive');
  if(!targets.length){ toast('No inactive branches to archive',true); return; }
  confirmDialog('Archive inactive branches?', targets.length+' branch'+(targets.length>1?'es':'')+' marked Inactive will move to the Archive tab.',()=>{
    targets.forEach(b=>b.archived=true); touch(); renderTabs(); renderBody(); toast('Archived '+targets.length+' inactive branch'+(targets.length>1?'es':''));
  },'Archive');
}

/* ---------- Archive tab ---------- */
function renderArchive(v){
  const tb=document.createElement('div'); tb.className='toolbar';
  tb.insertAdjacentHTML('beforeend','<div style="font-weight:600">Archived branches</div>');
  const grow=document.createElement('div'); grow.className='grow'; tb.appendChild(grow);
  const save=document.createElement('button'); save.className='good'; save.textContent='💾 Save'; save.onclick=saveToFile; tb.appendChild(save);
  v.appendChild(tb);
  v.insertAdjacentHTML('beforeend','<div class="hint">Retired or inactive branches live here, out of the active lists. <b>Restore</b> sends one back to Branches with its placement intact.</div>');
  const archived=state.branches.filter(b=>b.archived);
  const card=document.createElement('div'); card.className='card';
  if(!archived.length){ card.innerHTML='<div class="empty">Nothing archived yet. Use “Archive inactive” or a branch’s Archive button on the Branches tab.</div>'; v.appendChild(card); return; }
  let html='<table><thead><tr><th style="width:80px">ORGID</th><th>Branch</th><th>Manager</th><th style="width:100px">Status</th><th>Last placement</th><th style="width:170px"></th></tr></thead><tbody>';
  archived.forEach(b=>{
    const place=esc(branchTagLabel(b)||'—');
    html+='<tr data-id="'+b.id+'"><td class="muted">'+esc(b.orgid||'—')+'</td>'+
      '<td>'+esc(b.name||'(unnamed)')+'</td>'+
      '<td class="muted">'+esc(b.manager||'—')+'</td>'+
      '<td>'+statusPill(b.status)+'</td>'+
      '<td class="muted">'+place+'</td>'+
      '<td class="actions"><button class="sm primary" data-restore="1">Restore</button> <button class="sm danger" data-del="1">Delete</button></td></tr>';
  });
  html+='</tbody></table>'; card.innerHTML=html; v.appendChild(card);
  card.querySelectorAll('tr[data-id]').forEach(tr=>{
    const b=byId(state.branches,tr.dataset.id);
    tr.querySelector('[data-restore]').onclick=()=>restoreBranch(b.id);
    tr.querySelector('[data-del]').onclick=()=>confirmDialog('Delete permanently?','“'+(b.name||b.orgid)+'” will be removed for good.',()=>{
      state.branches=state.branches.filter(x=>x.id!==b.id); touch(); renderTabs(); renderBody();});
  });
}

/* ---------- generic chips (names) editor ---------- */
function chipsEditor(arr,placeholder,onchange){
  const wrap=document.createElement('div'); wrap.className='chips';
  const draw=()=>{
    wrap.innerHTML='';
    arr.forEach((name,i)=>{
      const c=document.createElement('span'); c.className='chip-item';
      c.innerHTML='<span>'+esc(name)+'</span>';
      const x=document.createElement('button'); x.textContent='×'; x.title='Remove';
      x.onclick=()=>{arr.splice(i,1);onchange();draw();}; c.appendChild(x); wrap.appendChild(c);
    });
    const inp=document.createElement('input'); inp.className='chip-add'; inp.placeholder=placeholder;
    const commit=()=>{ const val=inp.value.trim(); if(!val)return; inp.value=''; arr.push(val); onchange(); draw();
      const ni=wrap.querySelector('.chip-add'); if(ni)ni.focus(); };
    inp.onkeydown=e=>{ if(e.key==='Enter'){e.preventDefault(); commit();} };
    inp.onblur=commit;
    wrap.appendChild(inp);
  };
  draw(); return wrap;
}

/* ---------- Branch detail ---------- */
function renderBranchDetail(v){
  const b=byId(state.branches,openBranchId);
  if(!b){ openBranchId=null; return renderBranches(v); }
  const activeList=state.branches.filter(x=>!x.archived);
  const aIdx=activeList.indexOf(b);
  const area=branchArea(b);
  const region=branchRegion(b);
  const division=branchDivision(b);

  // top bar
  const head=document.createElement('div'); head.className='detail-head';
  const back=document.createElement('button'); back.className='ghost'; back.textContent='← Branches';
  back.onclick=()=>{openBranchId=null;renderBody();}; head.appendChild(back);
  const h2=document.createElement('h2'); h2.textContent=b.name||'(unnamed branch)'; head.appendChild(h2);
  head.insertAdjacentHTML('beforeend','<span class="muted">'+(b.orgid?('ORGID '+esc(b.orgid)):'')+'</span>');
  const grow=document.createElement('div'); grow.className='grow'; head.appendChild(grow);
  const prev=document.createElement('button'); prev.className='sm'; prev.textContent='‹ Prev'; prev.disabled=aIdx<=0;
  prev.onclick=()=>{openBranchId=activeList[aIdx-1].id;renderBody();window.scrollTo(0,0);};
  const next=document.createElement('button'); next.className='sm'; next.textContent='Next ›'; next.disabled=aIdx<0||aIdx>=activeList.length-1;
  next.onclick=()=>{openBranchId=activeList[aIdx+1].id;renderBody();window.scrollTo(0,0);};
  const archBtn=document.createElement('button'); archBtn.className='sm'; archBtn.textContent='Archive'; archBtn.title='Move to Archive';
  archBtn.onclick=()=>archiveBranch(b.id);
  const save=document.createElement('button'); save.className='good'; save.textContent='💾 Save'; save.onclick=saveToFile;
  head.appendChild(prev); head.appendChild(next); head.appendChild(archBtn); head.appendChild(save);
  v.appendChild(head);

  const wrap=document.createElement('div'); wrap.className='detail';

  // Section: Branch info
  const s1=document.createElement('div'); s1.className='section';
  s1.innerHTML='<h3>Branch</h3>';
  const g1=document.createElement('div'); g1.className='grid';
  g1.appendChild(field('Branch name','text',b.name,val=>{b.name=val;h2.textContent=val||'(unnamed branch)';touch();}));
  g1.appendChild(field('ORGID','text',b.orgid,val=>{b.orgid=val;touch();}));
  g1.appendChild(selectField('Status',['Active','Inactive','Pending',''],b.status,val=>{b.status=val;touch();}));
  s1.appendChild(g1); wrap.appendChild(s1);

  // Section: Placement
  const s2=document.createElement('div'); s2.className='section';
  s2.innerHTML='<h3>Placement</h3>';
  const g2=document.createElement('div'); g2.className='grid';
  g2.appendChild(entitySelectField('Sub-division tag', state.divisions, b.divisionId, val=>{b.divisionId=val||null;touch();renderBody();}));
  g2.appendChild(entitySelectField('Region tag', state.regions, b.regionId, val=>{b.regionId=val||null;touch();renderBody();}));
  g2.appendChild(entitySelectField('Area tag', state.areas, b.areaId, val=>{b.areaId=val||null;touch();renderBody();}));
  s2.appendChild(g2);
  s2.insertAdjacentHTML('beforeend','<div class="hint">Area, Region, and Sub-division are independent tags — set any combination. A branch can carry just a Sub-division tag, a Region without an Area, or all three.</div>');
  wrap.appendChild(s2);

  // Section: Management
  const s3=document.createElement('div'); s3.className='section';
  s3.innerHTML='<h3>Management</h3>';
  const g3=document.createElement('div'); g3.className='grid';
  g3.appendChild(field('Branch Manager','text',b.manager,val=>{b.manager=val;touch();}));
  g3.appendChild(managerField('Area Manager', area, 'assign an Area first'));
  g3.appendChild(managerField('Regional Manager', region, 'assign a Region first'));
  g3.appendChild(managerField('Divisional Manager', division, 'assign a Division first'));
  s3.appendChild(g3);
  s3.insertAdjacentHTML('beforeend','<div class="hint">Area / Regional / Divisional managers apply to the whole area, region, or division — editing here updates them everywhere.</div>');
  wrap.appendChild(s3);

  // Section: Serviced by
  const s4=document.createElement('div'); s4.className='section';
  s4.innerHTML='<h3>Serviced by</h3>';
  s4.appendChild(chipsEditor(b.servicedBy,'Add name + Enter',()=>touch()));
  wrap.appendChild(s4);

  // Section: Roster
  const s5=document.createElement('div'); s5.className='section';
  const h=document.createElement('h3'); h.innerHTML='Roster <span class="flex"></span>';
  const addEmp=document.createElement('button'); addEmp.className='sm primary'; addEmp.textContent='+ Add employee';
  addEmp.onclick=()=>{b.roster.push(emp('',''));touch();renderBody();}; h.appendChild(addEmp);
  s5.appendChild(h);
  const rc=document.createElement('div'); rc.className='card';
  if(!b.roster.length){ rc.innerHTML='<div class="empty">No employees yet. Click “+ Add employee”.</div>'; }
  else{
    let html='<table><thead><tr><th>Name</th><th style="width:200px">Title</th><th>Email</th><th style="width:140px">Phone</th><th>Notes</th><th style="width:60px"></th></tr></thead><tbody>';
    b.roster.forEach(e=>{
      html+='<tr data-eid="'+e.id+'">'+
        '<td><input data-f="name" value="'+esc(e.name)+'" placeholder="Full name"></td>'+
        '<td><input data-f="title" list="titlesList" value="'+esc(e.title)+'" placeholder="Title"></td>'+
        '<td><input data-f="email" value="'+esc(e.email)+'" placeholder="email@…"></td>'+
        '<td><input data-f="phone" value="'+esc(e.phone)+'"></td>'+
        '<td><input data-f="notes" value="'+esc(e.notes)+'"></td>'+
        '<td class="actions"><button class="sm danger" data-del="1">✕</button></td></tr>';
    });
    html+='</tbody></table>'; rc.innerHTML=html;
  }
  s5.appendChild(rc); wrap.appendChild(s5);
  v.appendChild(wrap);

  // roster wiring
  rc.querySelectorAll('tr[data-eid]').forEach(tr=>{
    const e=b.roster.find(x=>x.id===tr.dataset.eid);
    tr.querySelectorAll('input[data-f]').forEach(inp=>inp.oninput=()=>{e[inp.dataset.f]=inp.value;touch();});
    tr.querySelector('[data-del]').onclick=()=>{b.roster=b.roster.filter(x=>x.id!==e.id);touch();renderBody();};
  });
}

/* field builders for detail */
function field(label,type,val,onInput){
  const d=document.createElement('div'); d.className='field';
  d.innerHTML='<label>'+esc(label)+'</label>';
  const i=document.createElement('input'); i.type=type||'text'; i.value=val||'';
  i.oninput=()=>onInput(i.value); d.appendChild(i); return d;
}
function selectField(label,opts,val,onChange){
  const d=document.createElement('div'); d.className='field';
  d.innerHTML='<label>'+esc(label)+'</label>';
  const s=document.createElement('select');
  s.innerHTML=opts.map(o=>'<option value="'+esc(o)+'"'+(o===val?' selected':'')+'>'+(o===''?'—':esc(o))+'</option>').join('');
  s.onchange=()=>onChange(s.value); d.appendChild(s); return d;
}
function readonlyField(label,val){
  const d=document.createElement('div'); d.className='field';
  d.innerHTML='<label>'+esc(label)+'</label><div class="val">'+esc(val)+'</div>'; return d;
}
function entitySelectField(label,list,selId,onChange){
  const d=document.createElement('div'); d.className='field';
  d.innerHTML='<label>'+esc(label)+'</label>';
  const s=document.createElement('select');
  s.innerHTML='<option value="">— none —</option>'+list.map(x=>'<option value="'+x.id+'"'+(x.id===selId?' selected':'')+'>'+esc(x.name)+'</option>').join('');
  s.onchange=()=>onChange(s.value); d.appendChild(s); return d;
}
function managerField(label,entity,disabledHint){
  const d=document.createElement('div'); d.className='field';
  d.innerHTML='<label>'+esc(label)+'</label>';
  const i=document.createElement('input'); i.type='text';
  if(entity){ i.value=entity.manager||''; i.oninput=()=>{entity.manager=i.value;touch();}; }
  else{ i.disabled=true; i.placeholder=disabledHint; }
  d.appendChild(i); return d;
}

/* ---------- Areas ---------- */
function renderAreas(v){
  v.appendChild(toolbar('Add area',()=>{state.areas.unshift({id:uid('a'),name:'New Area',manager:'',regionId:state.regions[0]?state.regions[0].id:null});touch();renderBody();},true));
  v.insertAdjacentHTML('beforeend','<div class="hint">Areas group branches under a Region. The Area Manager applies to every branch in the area.</div>');
  const card=document.createElement('div'); card.className='card';
  let list=state.areas; if(filter) list=list.filter(a=>a.name.toLowerCase().includes(filter));
  if(!list.length){ card.innerHTML='<div class="empty">No areas yet. Click “+ Add area”.</div>'; v.appendChild(card); return; }
  let html='<table><thead><tr><th>Area</th><th>Area Manager</th><th style="width:200px">Region (parent)</th><th>Division</th><th style="width:80px">Branches</th><th></th></tr></thead><tbody>';
  list.forEach(a=>{const r=byId(state.regions,a.regionId); const div=r?byId(state.divisions,r.divisionId):null;
    const bc=state.branches.filter(b=>b.areaId===a.id).length;
    html+='<tr data-id="'+a.id+'"><td><input data-f="name" value="'+esc(a.name)+'"></td>'+
      '<td><input data-f="manager" value="'+esc(a.manager||'')+'"></td>'+
      '<td>'+simpleSelect('regionId',state.regions,a.regionId,'— Unassigned —')+'</td>'+
      '<td class="muted">'+(div?esc(div.name):'—')+'</td><td class="num">'+bc+'</td>'+
      '<td class="actions"><button class="sm danger" data-del="1">Delete</button></td></tr>';});
  html+='</tbody></table>'; card.innerHTML=html; v.appendChild(card);
  card.querySelectorAll('tr[data-id]').forEach(tr=>{const a=byId(state.areas,tr.dataset.id);
    tr.querySelector('[data-f="name"]').oninput=e=>{a.name=e.target.value;touch();};
    tr.querySelector('[data-f="manager"]').oninput=e=>{a.manager=e.target.value;touch();};
    tr.querySelector('[data-role="regionId"]').onchange=e=>{a.regionId=e.target.value||null;touch();renderBody();};
    tr.querySelector('[data-del]').onclick=()=>confirmDialog('Delete area?','Branches in “'+a.name+'” will move directly under its region.',()=>{
      state.branches.forEach(b=>{if(b.areaId===a.id){b.regionId=a.regionId;b.areaId=null;}});
      state.areas=state.areas.filter(x=>x.id!==a.id);touch();renderBody();});});
}

/* ---------- Regions ---------- */
function renderRegions(v){
  v.appendChild(toolbar('Add region',()=>{state.regions.unshift({id:uid('r'),name:'New Region',manager:'',divisionId:state.divisions[0]?state.divisions[0].id:null});touch();renderBody();},true));
  v.insertAdjacentHTML('beforeend','<div class="hint">Regions group Areas and Branches. The Regional Manager applies across the region.</div>');
  const card=document.createElement('div'); card.className='card';
  let list=state.regions; if(filter) list=list.filter(r=>(r.name+' '+(r.manager||'')).toLowerCase().includes(filter));
  if(!list.length){ card.innerHTML='<div class="empty">No regions yet.</div>'; v.appendChild(card); return; }
  let html='<table><thead><tr><th>Region</th><th>Regional Manager</th><th style="width:200px">Sub-division (parent)</th><th style="width:70px">Areas</th><th style="width:80px">Branches</th><th></th></tr></thead><tbody>';
  list.forEach(r=>{const ac=state.areas.filter(a=>a.regionId===r.id).length; const bc=branchCountForRegion(r.id);
    html+='<tr data-id="'+r.id+'"><td><input data-f="name" value="'+esc(r.name)+'"></td>'+
      '<td><input data-f="manager" value="'+esc(r.manager||'')+'"></td>'+
      '<td>'+simpleSelect('divisionId',state.divisions,r.divisionId,'— Unassigned —')+'</td>'+
      '<td class="num">'+ac+'</td><td class="num">'+bc+'</td>'+
      '<td class="actions"><button class="sm danger" data-del="1">Delete</button></td></tr>';});
  html+='</tbody></table>'; card.innerHTML=html; v.appendChild(card);
  card.querySelectorAll('tr[data-id]').forEach(tr=>{const r=byId(state.regions,tr.dataset.id);
    tr.querySelector('[data-f="name"]').oninput=e=>{r.name=e.target.value;touch();};
    tr.querySelector('[data-f="manager"]').oninput=e=>{r.manager=e.target.value;touch();};
    tr.querySelector('[data-role="divisionId"]').onchange=e=>{r.divisionId=e.target.value||null;touch();renderBody();};
    tr.querySelector('[data-del]').onclick=()=>confirmDialog('Delete region?','Areas and branches under “'+r.name+'” will become unassigned.',()=>{
      state.areas.forEach(a=>{if(a.regionId===r.id)a.regionId=null;});
      state.branches.forEach(b=>{if(b.regionId===r.id)b.regionId=null;});
      state.regions=state.regions.filter(x=>x.id!==r.id);touch();renderBody();});});
}

/* ---------- Divisions ---------- */
function renderDivisions(v){
  v.appendChild(toolbar('Add division',()=>{state.superDivisions.unshift({id:uid('sd'),name:'New Division',manager:''});touch();renderBody();},false));
  v.insertAdjacentHTML('beforeend','<div class="hint">A <b>Division</b> is the combined entity (e.g. <b>Matrix</b>). It contains <b>Sub-divisions</b> such as Matrix Red and Matrix Blue. Branches, regions and areas roll up through the sub-divisions.</div>');

  // ----- Divisions (parents) -----
  const c1=document.createElement('div'); c1.className='card';
  if(!state.superDivisions.length){ c1.innerHTML='<div class="empty">No divisions yet — click “+ Add division”.</div>'; }
  else{
    let h='<table><thead><tr><th>Division</th><th>Divisional Manager</th><th style="width:100px">Sub-divisions</th><th style="width:90px">Branches</th><th></th></tr></thead><tbody>';
    state.superDivisions.forEach(sd=>{ h+='<tr data-sid="'+sd.id+'"><td><input data-f="name" value="'+esc(sd.name)+'"></td>'+
      '<td><input data-f="manager" value="'+esc(sd.manager||'')+'"></td>'+
      '<td class="num">'+subdivisionsOf(sd.id).length+'</td><td class="num">'+branchCountForSuperDivision(sd.id)+'</td>'+
      '<td class="actions"><button class="sm danger" data-del="1">Delete</button></td></tr>'; });
    h+='</tbody></table>'; c1.innerHTML=h;
  }
  v.appendChild(c1);
  c1.querySelectorAll('tr[data-sid]').forEach(tr=>{ const sd=byId(state.superDivisions,tr.dataset.sid);
    tr.querySelector('[data-f="name"]').oninput=e=>{sd.name=e.target.value;touch();};
    tr.querySelector('[data-f="manager"]').oninput=e=>{sd.manager=e.target.value;touch();};
    tr.querySelector('[data-del]').onclick=()=>confirmDialog('Delete division?','Its sub-divisions will become unassigned to a division (they keep their regions and branches).',()=>{
      subdivisionsOf(sd.id).forEach(d=>d.parentId=null);
      state.superDivisions=state.superDivisions.filter(x=>x.id!==sd.id);touch();renderBody();});});

  // ----- Sub-divisions -----
  const bar=document.createElement('div'); bar.className='toolbar'; bar.style.marginTop='20px';
  const add=document.createElement('button'); add.className='primary'; add.textContent='+ Add subdivision';
  add.onclick=()=>{ state.divisions.unshift({id:uid('d'),name:'New Sub-division',manager:'',parentId:(state.superDivisions[0]?state.superDivisions[0].id:null)}); touch(); renderBody(); };
  bar.appendChild(add);
  bar.insertAdjacentHTML('beforeend','<div style="font-weight:600;margin-left:6px">Sub-divisions</div>');
  v.appendChild(bar);
  const c2=document.createElement('div'); c2.className='card';
  if(!state.divisions.length){ c2.innerHTML='<div class="empty">No sub-divisions yet — click “+ Add subdivision”.</div>'; v.appendChild(c2); return; }
  let h2='<table><thead><tr><th>Sub-division</th><th>Manager</th><th style="width:180px">Division (parent)</th><th style="width:80px">Regions</th><th style="width:90px">Branches</th><th></th></tr></thead><tbody>';
  state.divisions.forEach(d=>{ const rc=state.regions.filter(r=>r.divisionId===d.id).length;
    h2+='<tr data-id="'+d.id+'"><td><input data-f="name" value="'+esc(d.name)+'"></td>'+
      '<td><input data-f="manager" value="'+esc(d.manager||'')+'"></td>'+
      '<td>'+simpleSelect('parentId',state.superDivisions,d.parentId,'— Unassigned —')+'</td>'+
      '<td class="num">'+rc+'</td><td class="num">'+branchCountForDivision(d.id)+'</td>'+
      '<td class="actions"><button class="sm danger" data-del="1">Delete</button></td></tr>'; });
  h2+='</tbody></table>'; c2.innerHTML=h2; v.appendChild(c2);
  c2.querySelectorAll('tr[data-id]').forEach(tr=>{ const d=byId(state.divisions,tr.dataset.id);
    tr.querySelector('[data-f="name"]').oninput=e=>{d.name=e.target.value;touch();};
    tr.querySelector('[data-f="manager"]').oninput=e=>{d.manager=e.target.value;touch();};
    tr.querySelector('[data-role="parentId"]').onchange=e=>{d.parentId=e.target.value||null;touch();renderBody();};
    tr.querySelector('[data-del]').onclick=()=>confirmDialog('Delete sub-division?','Regions and branch tags pointing to “'+d.name+'” will become unassigned.',()=>{
      state.regions.forEach(r=>{if(r.divisionId===d.id)r.divisionId=null;});
      state.branches.forEach(b=>{if(b.divisionId===d.id)b.divisionId=null;});
      state.divisions=state.divisions.filter(x=>x.id!==d.id);touch();renderBody();});});
}

/* ---------- Titles ---------- */
function renderTitles(v){
  const t=document.createElement('div'); t.className='toolbar';
  const inp=document.createElement('input'); inp.className='search'; inp.placeholder='New title…'; t.appendChild(inp);
  const add=document.createElement('button'); add.className='primary'; add.textContent='+ Add title';
  const doAdd=()=>{const val=inp.value.trim(); if(!val)return;
    if(state.titles.some(x=>x.toLowerCase()===val.toLowerCase())){toast('Title already exists',true);return;}
    state.titles.push(val); inp.value=''; touch(); render(); toast('Title added');};
  add.onclick=doAdd; inp.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();doAdd();}};
  t.appendChild(add);
  const grow=document.createElement('div'); grow.className='grow'; t.appendChild(grow);
  const save=document.createElement('button'); save.className='good'; save.textContent='💾 Save'; save.onclick=saveToFile; t.appendChild(save);
  v.appendChild(t);
  v.insertAdjacentHTML('beforeend','<div class="hint">These titles populate the Title dropdown in every branch roster. Add or edit the ones your team uses.</div>');
  const card=document.createElement('div'); card.className='card';
  let list=state.titles.map((name,i)=>({name,i}));
  if(!list.length){ card.innerHTML='<div class="empty">No titles yet. Add one above.</div>'; v.appendChild(card); return; }
  let html='<table><thead><tr><th>Title</th><th style="width:120px">In use</th><th style="width:90px"></th></tr></thead><tbody>';
  list.forEach(o=>{ const used=state.branches.filter(b=>!b.archived).reduce((n,b)=>n+(b.roster||[]).filter(e=>e.title===o.name).length,0);
    html+='<tr data-i="'+o.i+'"><td><input data-f="title" value="'+esc(o.name)+'"></td>'+
      '<td class="num">'+used+'</td>'+
      '<td class="actions"><button class="sm danger" data-del="1">Delete</button></td></tr>';});
  html+='</tbody></table>'; card.innerHTML=html; v.appendChild(card);
  card.querySelectorAll('tr[data-i]').forEach(tr=>{const i=+tr.dataset.i;
    tr.querySelector('[data-f="title"]').oninput=e=>{state.titles[i]=e.target.value;touch();refreshTitlesDatalist();};
    tr.querySelector('[data-del]').onclick=()=>{const nm=state.titles[i];
      confirmDialog('Delete title?','“'+nm+'” will be removed from the list (existing roster entries keep their text).',()=>{
        state.titles.splice(i,1);touch();render();});};});
}

/* ---------- Employees (all rosters) ---------- */
function titleSelect(cur){
  const inList=state.titles.some(t=>t===cur);
  let o='<option value="">— none —</option>';
  o+=state.titles.map(t=>'<option'+(t===cur?' selected':'')+'>'+esc(t)+'</option>').join('');
  if(cur && !inList) o+='<option selected value="'+esc(cur)+'">'+esc(cur)+'</option>';
  return '<select data-role="title">'+o+'</select>';
}
function exportEmployeesCSV(){
  const rows=[['Name','Title','Branch','Email','Phone']];
  state.branches.filter(b=>!b.archived).forEach(b=>(b.roster||[]).forEach(e=>rows.push([e.name,e.title,b.name,e.email||'',e.phone||''])));
  const csv=rows.map(r=>r.map(c=>{c=String(c==null?'':c);return /[",\n]/.test(c)?'"'+c.replace(/"/g,'""')+'"':c;}).join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv'}); const a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download='kern-employees.csv'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); toast('Exported employees CSV');
}
function parseCSV(text){
  const rows=[]; let i=0,f='',row=[],q=false; text=String(text).replace(/\r\n/g,'\n').replace(/\r/g,'\n');
  while(i<text.length){ const c=text[i];
    if(q){ if(c=='"'){ if(text[i+1]=='"'){f+='"';i+=2;continue;} q=false;i++;continue;} f+=c;i++;continue; }
    if(c=='"'){q=true;i++;continue;}
    if(c==','){row.push(f);f='';i++;continue;}
    if(c=='\n'){row.push(f);rows.push(row);row=[];f='';i++;continue;}
    f+=c;i++;
  }
  if(f.length||row.length){row.push(f);rows.push(row);}
  return rows;
}
function exportEmployeeTemplate(){
  const s=state.branches.filter(b=>!b.archived).map(b=>b.name||b.orgid).filter(Boolean);
  const s1=s[0]||'Branch Name', s2=s[1]||s1;
  const rows=[['Branch','Name','Title','Email','Phone'],
    [s1,'Jane Smith','Loan Officer','jane@example.com','555-100-2000'],
    [s2,'John Doe','Processor','john@example.com','555-100-3000']];
  const csv=rows.map(r=>r.map(c=>{c=String(c==null?'':c);return /[",\n]/.test(c)?'"'+c.replace(/"/g,'""')+'"':c;}).join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv'}); const a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download='kern-employee-import-template.csv'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  toast('Template downloaded — columns: Branch, Name, Title, Email, Phone');
}
function importEmployeeTemplate(){
  const inp=document.createElement('input'); inp.type='file'; inp.accept='.csv,text/csv';
  inp.onchange=()=>{ const file=inp.files[0]; if(!file)return; const rd=new FileReader();
    rd.onload=()=>{ try{
      const rows=parseCSV(rd.result).filter(r=>r.some(c=>String(c).trim()!==''));
      if(!rows.length){toast('That file looks empty',true);return;}
      let start=0; const h=rows[0].map(c=>c.trim().toLowerCase());
      const idx={branch:h.indexOf('branch'),name:h.indexOf('name'),title:h.indexOf('title'),email:h.indexOf('email'),phone:h.indexOf('phone')};
      if(idx.branch>=0&&idx.name>=0){ start=1; } else { idx.branch=0;idx.name=1;idx.title=2;idx.email=3;idx.phone=4; }
      const bmap={}; state.branches.forEach(b=>{ if(b.name)bmap[b.name.trim().toLowerCase()]=b; if(b.orgid)bmap[String(b.orgid).trim().toLowerCase()]=b; });
      let added=0; const unmatched=new Set();
      for(let i=start;i<rows.length;i++){ const r=rows[i];
        const bkey=(r[idx.branch]||'').trim().toLowerCase(); const nm=(r[idx.name]||'').trim();
        if(!bkey||!nm) continue;
        const b=bmap[bkey]; if(!b){ unmatched.add((r[idx.branch]||'').trim()); continue; }
        const e=emp(nm,(idx.title>=0?(r[idx.title]||''):'').trim());
        e.email=(idx.email>=0?(r[idx.email]||''):'').trim(); e.phone=(idx.phone>=0?(r[idx.phone]||''):'').trim();
        if(e.title && !state.titles.some(t=>t.toLowerCase()===e.title.toLowerCase())) state.titles.push(e.title);
        b.roster=b.roster||[]; b.roster.push(e); added++;
      }
      touch(); render();
      let msg='Imported '+added+' employee'+(added==1?'':'s');
      if(unmatched.size) msg+=' · skipped '+unmatched.size+' unmatched branch'+(unmatched.size==1?'':'es')+': '+[...unmatched].slice(0,3).join(', ')+(unmatched.size>3?'…':'');
      toast(msg, added===0);
    }catch(err){ toast('Import failed: '+err.message,true); } };
    rd.readAsText(file);
  };
  inp.click();
}
function renderEmployees(v){
  const tb=document.createElement('div'); tb.className='toolbar';
  const s=document.createElement('input'); s.className='search'; s.placeholder='Search employees…'; s.value=filter;
  s.oninput=()=>{filter=s.value.toLowerCase();renderBody();}; tb.appendChild(s);
  const grow=document.createElement('div'); grow.className='grow'; tb.appendChild(grow);
  const tmpl=document.createElement('button'); tmpl.className='ghost'; tmpl.textContent='⬇ Export Template'; tmpl.onclick=exportEmployeeTemplate; tb.appendChild(tmpl);
  const imp=document.createElement('button'); imp.className='primary'; imp.textContent='⬆ Import Template'; imp.onclick=importEmployeeTemplate; tb.appendChild(imp);
  const save=document.createElement('button'); save.className='good'; save.textContent='💾 Save'; save.onclick=saveToFile; tb.appendChild(save);
  const csv=document.createElement('button'); csv.className='ghost'; csv.textContent='Export CSV'; csv.onclick=exportEmployeesCSV; tb.appendChild(csv);
  v.appendChild(tb);
  let all=[];
  state.branches.filter(b=>!b.archived).forEach(b=>(b.roster||[]).forEach(e=>all.push({b,e})));
  const titleSet=[...new Set(all.map(x=>x.e.title).filter(Boolean))].sort((a,b)=>a.toLowerCase().localeCompare(b.toLowerCase()));
  const branchSet=[...new Set(all.map(x=>x.b.name).filter(Boolean))].sort((a,b)=>a.toLowerCase().localeCompare(b.toLowerCase()));
  const F=empFilters; const inc=(val,f)=>!f||String(val||'').toLowerCase().includes(f.toLowerCase());
  let rows=all;
  if(filter) rows=rows.filter(({b,e})=>[e.name,e.title,e.email,e.phone,b.name].join(' ').toLowerCase().includes(filter));
  rows=rows.filter(({b,e})=> inc(e.name,F.name) && (!F.title||(e.title||'')===F.title) && (!F.branch||(b.name||'')===F.branch) && inc(e.email,F.email) && inc(e.phone,F.phone));
  const anyF=F.name||F.title||F.branch||F.email||F.phone||filter;
  v.insertAdjacentHTML('beforeend','<div class="hint">Everyone across all branch rosters — <b>showing '+rows.length+' of '+all.length+'</b>. Filter any column with the row under the headers; change a Title from the dropdown; click a Branch to open it.</div>');
  const fsel=(col,list,sel)=>'<select class="colf" data-col="'+col+'"><option value="">All</option>'+list.map(x=>'<option'+(x===sel?' selected':'')+'>'+esc(x)+'</option>').join('')+'</select>';
  const card=document.createElement('div'); card.className='card';
  rows.sort((x,y)=>(x.e.name||'').toLowerCase().localeCompare((y.e.name||'').toLowerCase()));
  let html='<table class="tbl-center emp"><thead>'+
    '<tr><th>Name</th><th style="width:210px">Title</th><th>Branch</th><th>Email</th><th style="width:150px">Phone</th><th style="width:60px"></th></tr>'+
    '<tr class="filt-row">'+
      '<th><input class="colf" data-col="name" value="'+esc(F.name)+'" placeholder="Filter name…"></th>'+
      '<th>'+fsel('title',titleSet,F.title)+'</th>'+
      '<th>'+fsel('branch',branchSet,F.branch)+'</th>'+
      '<th><input class="colf" data-col="email" value="'+esc(F.email)+'" placeholder="Filter email…"></th>'+
      '<th><input class="colf" data-col="phone" value="'+esc(F.phone)+'" placeholder="Filter…"></th>'+
      '<th>'+(anyF?'<button class="sm ghost" id="clrFilt" title="Clear all filters">✕</button>':'')+'</th>'+
    '</tr></thead><tbody>';
  if(!rows.length){ html+='<tr><td colspan="6" class="empty">No employees match these filters.</td></tr>'; }
  rows.forEach(({b,e})=>{
    html+='<tr data-bid="'+b.id+'" data-eid="'+e.id+'">'+
      '<td><input data-f="name" value="'+esc(e.name)+'" placeholder="Full name"></td>'+
      '<td>'+titleSelect(e.title)+'</td>'+
      '<td><button class="link" data-open="1">'+esc(b.name||'(unnamed)')+'</button></td>'+
      '<td><input data-f="email" value="'+esc(e.email||'')+'" placeholder="email@…"></td>'+
      '<td><input data-f="phone" value="'+esc(e.phone||'')+'"></td>'+
      '<td class="actions"><button class="sm danger" data-del="1">✕</button></td></tr>';
  });
  html+='</tbody></table>'; card.innerHTML=html; v.appendChild(card);
  // column filters
  card.querySelectorAll('input.colf').forEach(inp=>inp.oninput=()=>{ empFilters[inp.dataset.col]=inp.value; empActiveFilter=inp.dataset.col; renderBody(); });
  card.querySelectorAll('select.colf').forEach(sel=>sel.onchange=()=>{ empFilters[sel.dataset.col]=sel.value; empActiveFilter=null; renderBody(); });
  const clr=card.querySelector('#clrFilt'); if(clr) clr.onclick=()=>{ empFilters={name:'',title:'',branch:'',email:'',phone:''}; empActiveFilter=null; renderBody(); };
  card.querySelectorAll('tr[data-eid]').forEach(tr=>{
    const b=byId(state.branches,tr.dataset.bid); const e=(b&&b.roster||[]).find(x=>x.id===tr.dataset.eid);
    if(!e)return;
    tr.querySelectorAll('input[data-f]').forEach(inp=>inp.oninput=()=>{e[inp.dataset.f]=inp.value;touch();});
    tr.querySelector('select[data-role="title"]').onchange=ev=>{e.title=ev.target.value;touch();};
    tr.querySelector('[data-open]').onclick=()=>{activeTab='branches';openBranchId=b.id;render();window.scrollTo(0,0);};
    tr.querySelector('[data-del]').onclick=()=>{b.roster=b.roster.filter(x=>x.id!==e.id);touch();renderTabs();renderBody();};
  });
  // restore focus to the active column filter after re-render
  if(empActiveFilter){ const f=card.querySelector('input.colf[data-col="'+empActiveFilter+'"]'); if(f){ f.focus(); const val=f.value; f.value=''; f.value=val; } }
}

/* ---------- Production helpers (Data + Analysis) ---------- */
function prodName(org){ if(org==='OTHER')return 'Other'; const b=state.branches.find(x=>String(x.orgid)===String(org)); return b?b.name:('ORG '+org); }
function prodMonths(){ const s=new Set(); Object.values(state.production).forEach(mm=>Object.keys(mm).forEach(m=>s.add(m))); return [...s].sort(); }
function isIncluded(org){ return !(state.prodExcluded && state.prodExcluded[org]); }
function prodGroups(all){
  return Object.keys(state.production).filter(org=>all||isIncluded(org)).map(org=>{ const mm=state.production[org]; let d=0,u=0;
    Object.values(mm).forEach(v=>{d+=v[0]||0;u+=v[1]||0;}); return {org,name:prodName(org),d,u}; })
    .sort((a,b)=>b.d-a.d);
}
function divisionForOrg(org){
  if(org==='OTHER') return 'Unassigned';
  const b=state.branches.find(x=>String(x.orgid)===String(org));
  if(b&&b.divisionId){ const d=byId(state.divisions,b.divisionId); if(d)return d.name; }
  return 'Unassigned';
}
function groupKeyForOrg(org,dim){
  if(dim==='branch') return prodName(org);
  const b = org==='OTHER'? null : state.branches.find(x=>String(x.orgid)===String(org));
  if(dim==='division'){ // merge untagged / Other into the single division ("the whole")
    const sub=b&&b.divisionId&&byId(state.divisions,b.divisionId); const sup=sub&&sub.parentId&&byId(state.superDivisions,sub.parentId);
    if(sup) return sup.name;
    return state.superDivisions.length===1 ? state.superDivisions[0].name : 'Unassigned';
  }
  if(!b) return 'Unassigned';
  let ent=null;
  if(dim==='subdivision') ent=b.divisionId&&byId(state.divisions,b.divisionId);
  else if(dim==='region') ent=b.regionId&&byId(state.regions,b.regionId);
  else if(dim==='area') ent=b.areaId&&byId(state.areas,b.areaId);
  return ent?ent.name:'Unassigned';
}
function groupMonthly(dim){   // { groupName: { month:[d,u] } }, included branches only
  const out={};
  Object.keys(state.production).filter(isIncluded).forEach(org=>{
    const key=groupKeyForOrg(org,dim), mm=state.production[org]; out[key]=out[key]||{};
    Object.keys(mm).forEach(m=>{ out[key][m]=out[key][m]||[0,0]; out[key][m][0]+=mm[m][0]||0; out[key][m][1]+=mm[m][1]||0; });
  });
  return out;
}
function monthsByQuarter(list){ const q={}; list.forEach(m=>{ const [y,mo]=m.split('-').map(Number); (q[y+'-Q'+Math.ceil(mo/3)] = q[y+'-Q'+Math.ceil(mo/3)]||[]).push(m); }); return q; }
function divColor(name){ const n=(name||'').toLowerCase(); if(n.includes('red'))return '#ff3b52'; if(n.includes('blue'))return '#25e0ff'; return '#8aa0b8'; }
function pctChange(cur,prev){ if(!prev) return null; return ((cur-prev)/prev)*100; }
function fmtUSD(n){ return '$'+Math.round(n).toLocaleString(); }
function fmtShort(n){ if(!isFinite(n))return '$—'; n=n||0; const a=Math.abs(n); if(a>=1e6)return '$'+(n/1e6).toFixed(1)+'M'; if(a>=1e3)return '$'+(n/1e3).toFixed(0)+'K'; return '$'+Math.round(n); }
function disposeCharts(){ chartInstances.forEach(c=>{try{c.dispose();}catch(e){}}); chartInstances=[]; }
function mkChart(el,opt){ if(typeof echarts==='undefined')return null; const c=echarts.init(el,null,{renderer:'canvas'}); c.setOption(opt); chartInstances.push(c); return c; }
function segToggle(options,current,onPick){
  const w=document.createElement('div'); w.className='seg';
  options.forEach(o=>{ const b=document.createElement('button'); b.className='seg-btn'+(o.v===current?' on':''); b.textContent=o.label; b.onclick=()=>onPick(o.v); w.appendChild(b); });
  return w;
}
function otherToggle(){
  const on=isIncluded('OTHER');
  const b=document.createElement('button'); b.className='sm '+(on?'primary':'ghost'); b.textContent=(on?'✓ ':'')+'Other';
  b.title='Include or exclude the untagged “Other” production from this view (shared with the Data tab).';
  b.onclick=()=>{ if(isIncluded('OTHER')) state.prodExcluded['OTHER']=true; else delete state.prodExcluded['OTHER']; touch(); renderBody(); };
  return b;
}

/* ---------- Data tab (editable production numbers) ---------- */
function exportProductionCSV(){
  const rows=[['Branch','ORG ID','Month','Dollars','Units']]; const months=prodMonths();
  prodGroups().forEach(g=>months.forEach(m=>{ const rec=state.production[g.org][m]; if(rec)rows.push([g.name,g.org,m,rec[0],rec[1]]); }));
  const csv=rows.map(r=>r.map(c=>{c=String(c==null?'':c);return /[",\n]/.test(c)?'"'+c.replace(/"/g,'""')+'"':c;}).join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='kern-production.csv'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); toast('Exported production CSV');
}
/* ---------- Credit Report Analysis tab ---------- */
function creditOrgName(o){ return o==='UNKNOWN' ? 'Unknown' : prodName(o); }
function exportCreditCSV(){
  const D=CREDIT.descs, OP=CREDIT.ops||[]; const rows=[['Branch','ORG ID','Loan Ref','Borrower','Operator','Date','Description','Charge','Credit','Net']];
  Object.keys(CREDIT.orgs).forEach(o=>{ const nm=creditOrgName(o); const loans=CREDIT.orgs[o].loans;
    Object.keys(loans).forEach(ref=>{ const l=loans[ref]; l.i.forEach(it=>rows.push([nm,o,ref,l.b||'',(OP[it[4]]||''),it[0],D[it[1]]||'',it[2],it[3],(it[2]+it[3]).toFixed(2)])); }); });
  const csv=rows.map(r=>r.map(c=>{c=String(c==null?'':c);return /[",\n]/.test(c)?'"'+c.replace(/"/g,'""')+'"':c;}).join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv'}); const a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download='kern-credit-report-costs.csv'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); toast('Exported credit-report line items');
}
function renderCredit(v){
  const D=CREDIT.descs, orgs=CREDIT.orgs;
  const c2=n=>(n<0?'-$':'$')+Math.abs(n).toFixed(2);
  const list=Object.keys(orgs).map(o=>{ const loans=orgs[o].loans; let ch=0,cr=0,ni=0;
    Object.values(loans).forEach(l=>l.i.forEach(it=>{ch+=it[2];cr+=it[3];ni++;}));
    return {o,name:creditOrgName(o),nl:Object.keys(loans).length,ni,ch,cr,net:ch+cr}; }).sort((a,b)=>b.ch-a.ch);
  if(!creditSel||!orgs[creditSel]) creditSel=list[0]&&list[0].o;

  const tb=document.createElement('div'); tb.className='toolbar';
  const s=document.createElement('input'); s.className='search'; s.placeholder='Search branch…'; s.value=filter;
  s.oninput=()=>{filter=s.value.toLowerCase();renderBody();}; tb.appendChild(s);
  const grow=document.createElement('div'); grow.className='grow'; tb.appendChild(grow);
  const save=document.createElement('button'); save.className='good'; save.textContent='💾 Save'; save.onclick=saveToFile; tb.appendChild(save);
  const csv=document.createElement('button'); csv.className='ghost'; csv.textContent='Export CSV'; csv.onclick=exportCreditCSV; tb.appendChild(csv);
  v.appendChild(tb);

  const T={ch:0,cr:0,nl:0,ni:0}; list.forEach(r=>{T.ch+=r.ch;T.cr+=r.cr;T.nl+=r.nl;T.ni+=r.ni;});
  const kp=document.createElement('div'); kp.className='kpis';
  const tile=(l,val,sub)=>'<div class="kpi"><div class="k-val">'+val+'</div><div class="k-lab">'+l+'</div>'+(sub?'<div class="k-sub">'+sub+'</div>':'')+'</div>';
  kp.innerHTML=tile('Total charges',fmtUSD(T.ch),c2(T.ch))
    +tile('Credits / refunds',fmtUSD(T.cr),'')
    +tile('Net cost',fmtUSD(T.ch+T.cr),'')
    +tile('Loans',T.nl.toLocaleString(),'')
    +tile('Line items',T.ni.toLocaleString(),'')
    +tile('Avg / loan',fmtUSD(T.nl?(T.ch+T.cr)/T.nl:0),'net');
  v.appendChild(kp);
  v.insertAdjacentHTML('beforeend','<div class="hint">Credit-report & verification invoice costs. Pick a branch (left, ordered by spend) to see every loan and each line-item cost. Click a loan to expand its charges.</div>');

  let shown=list; if(filter) shown=list.filter(r=>r.name.toLowerCase().includes(filter)||r.o.toLowerCase().includes(filter));

  const split=document.createElement('div'); split.className='tn-split'; v.appendChild(split);
  const L=document.createElement('div'); L.className='tn-list'; split.appendChild(L);
  shown.forEach((r,i)=>{ const it=document.createElement('div'); it.className='tn-li'+(r.o===creditSel?' sel':'');
    it.innerHTML='<span class="tn-li-rank">'+(i+1)+'</span>'+
      '<span class="tn-li-main"><span class="tn-li-name">'+esc(r.name)+' <span class="tn-li-org">ORG '+esc(r.o)+'</span></span>'+
      '<span class="tn-li-meta">'+r.nl+' loans · '+r.ni+' items · <b class="cr-amt">'+fmtUSD(r.ch)+'</b></span></span>';
    it.onclick=()=>{creditSel=r.o;renderBody();}; L.appendChild(it); });

  const det=document.createElement('div'); det.className='tn-detail'; split.appendChild(det);
  const org=orgs[creditSel]; const nm=creditOrgName(creditSel);
  let ch=0,cr=0,ni=0; Object.values(org.loans).forEach(l=>l.i.forEach(it=>{ch+=it[2];cr+=it[3];ni++;}));
  const loans=Object.keys(org.loans).map(ref=>{ const l=org.loans[ref]; let lc=0,lr=0; l.i.forEach(it=>{lc+=it[2];lr+=it[3];});
    return {ref,b:l.b,op:l.op,items:l.i,ch:lc,cr:lr,net:lc+lr}; }).sort((a,b)=>b.ch-a.ch);
  det.innerHTML='<div class="tn-dhead"><span class="tn-dname">'+esc(nm)+'</span>'+
    '<span class="tn-dmeta">ORG '+esc(creditSel)+' · '+loans.length+' loans · '+ni+' line items · charges '+fmtUSD(ch)+' · credits '+fmtUSD(cr)+' · net '+fmtUSD(ch+cr)+'</span></div>';

  // operator breakdown — who is pulling on this invoice
  const OP=CREDIT.ops||[]; const opAgg={};
  Object.values(org.loans).forEach(l=>l.i.forEach(it=>{ const k=it[4]; opAgg[k]=opAgg[k]||{items:0,ch:0,cr:0}; opAgg[k].items++; opAgg[k].ch+=it[2]; opAgg[k].cr+=it[3]; }));
  const opRows=Object.keys(opAgg).map(k=>{ const code=OP[k]||'(blank)'; const last=code.split('.')[0].toLowerCase();
    const home=state.branches.find(bb=>{ const n=(bb.name||'').toLowerCase(); const t=n.split(' '); return n&&(t.includes(last)||t[t.length-1]===last||n==='branch '+last||n.replace('branch ','')===last); });
    return {code,items:opAgg[k].items,ch:opAgg[k].ch,net:opAgg[k].ch+opAgg[k].cr, home:home?home.name:null, homeOrg:home?home.orgid:null}; })
    .sort((a,b)=>b.ch-a.ch);
  const opCard=document.createElement('div'); opCard.className='cr-ops';
  let oh='<div class="cr-ops-h">Operators on this invoice <span class="muted">('+opRows.length+')</span></div><table class="cr-optbl"><thead><tr><th>Operator</th><th>Items</th><th>Charges</th><th>Net</th><th>Home branch</th></tr></thead><tbody>';
  opRows.forEach(r=>{ const known=!!r.home; const self=String(r.homeOrg)===String(creditSel);
    oh+='<tr class="'+(known?(self?'':'foreign'):'unknown')+'"><td class="cr-op">'+esc(r.code)+'</td><td>'+r.items+'</td><td>'+fmtUSD(r.ch)+'</td><td>'+fmtUSD(r.net)+'</td>'+
      '<td>'+(known?(esc(r.home)+' <span class="muted">('+esc(String(r.homeOrg))+')</span>'+(self?'':' <span class="cr-tag foreign">not this branch</span>')):'<span class="cr-tag unknown">unrecognized</span>')+'</td></tr>'; });
  oh+='</tbody></table>';
  opCard.innerHTML=oh; det.appendChild(opCard);

  const bar=document.createElement('div'); bar.className='cr-bar';
  bar.innerHTML='<button class="ghost sm" data-x="1">Expand all</button><button class="ghost sm" data-x="0">Collapse all</button>';
  det.appendChild(bar);
  const wrap=document.createElement('div'); wrap.className='cr-loans'; det.appendChild(wrap);
  loans.forEach(l=>{
    const lo=document.createElement('div'); lo.className='cr-loan';
    lo.innerHTML='<div class="cr-lhead"><span class="cr-tw">▸</span>'+
      '<span class="cr-ref">'+esc(l.ref)+'</span>'+
      '<span class="cr-bor">'+esc(l.b||'—')+'</span>'+
      '<span class="cr-cnt">'+l.items.length+' items</span>'+
      '<span class="cr-ch">'+c2(l.ch)+'</span>'+
      '<span class="cr-crd">'+(l.cr?c2(l.cr):'')+'</span>'+
      '<span class="cr-net">'+c2(l.net)+'</span></div>';
    let items='<table class="cr-items"><thead><tr><th>Date</th><th>Description</th><th>Charge</th><th>Credit</th></tr></thead><tbody>';
    l.items.slice().sort((a,b)=>String(a[0]).localeCompare(String(b[0]))).forEach(it=>{
      items+='<tr><td class="cr-dt">'+esc(it[0])+'</td><td class="cr-desc">'+esc(D[it[1]]||'')+'</td><td class="cr-ch">'+c2(it[2])+'</td><td class="cr-crd">'+(it[3]?c2(it[3]):'')+'</td></tr>'; });
    items+='</tbody></table>';
    const body=document.createElement('div'); body.className='cr-lbody'; body.innerHTML=items; lo.appendChild(body);
    lo.querySelector('.cr-lhead').onclick=()=>{ lo.classList.toggle('open'); };
    wrap.appendChild(lo);
  });
  bar.querySelector('[data-x="1"]').onclick=()=>wrap.querySelectorAll('.cr-loan').forEach(x=>x.classList.add('open'));
  bar.querySelector('[data-x="0"]').onclick=()=>wrap.querySelectorAll('.cr-loan').forEach(x=>x.classList.remove('open'));
}

/* ---------- Branch Roster tab ---------- */
function knownSupport(kind){   // kind: 'proc' | 'loa' — pool of known support names
  const set=new Set();
  const isProc=t=>/process/i.test(t||'');
  const isLoa=t=>/(loan officer assistant|\bloa\b|assistant)/i.test(t||'');
  state.branches.forEach(b=>{
    (b.roster||[]).forEach(e=>{ const t=e.title||''; if(!e.name)return;
      if(kind==='proc'&&isProc(t)) set.add(e.name.trim());
      if(kind==='loa'&&isLoa(t)) set.add(e.name.trim()); });
    (kind==='proc'?(b.processors||[]):(b.loas||[])).forEach(n=>{ if(n&&n.trim())set.add(n.trim()); });
    const cur=kind==='proc'?b.processorName:b.loaName; if(cur)set.add(cur);
  });
  return [...set].sort((a,b)=>a.toLowerCase().localeCompare(b.toLowerCase()));
}
function supportSelect(role,list,sel){
  let o='<option value="">— none —</option>';
  const inList=list.some(n=>n===sel);
  list.forEach(n=>o+='<option'+(n===sel?' selected':'')+'>'+esc(n)+'</option>');
  if(sel&&!inList)o+='<option selected value="'+esc(sel)+'">'+esc(sel)+'</option>';
  return '<select data-role="'+role+'">'+o+'</select>';
}
function exportRosterCSV(){
  const rows=[['Branch','Need Processor','Need LOA','Monthly Units','Processor Name','Processor Allocation','LOA Name','LOA Allocation']];
  state.branches.filter(b=>!b.archived).sort((a,b)=>(a.name||'').toLowerCase().localeCompare((b.name||'').toLowerCase()))
    .forEach(b=>rows.push([b.name||'',b.needProcessor?'Yes':'',b.needLO?'Yes':'',(b.monthlyUnits??''),b.processorName||'',(b.procAlloc??''),b.loaName||'',(b.loaAlloc??'')]));
  const csv=rows.map(r=>r.map(c=>{c=String(c==null?'':c);return /[",\n]/.test(c)?'"'+c.replace(/"/g,'""')+'"':c;}).join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv'}); const a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download='kern-branch-roster.csv'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); toast('Exported branch roster');
}
function renderPnl(el, rosterUnits, rosterVol){
  const P=state.pnl;
  const units = P.useRoster ? rosterUnits : (+P.units||0);
  const vol   = P.useRoster ? rosterVol   : (+P.vol||0);
  const team  = (+P.people||0)*(+P.salary||0);
  const rev   = units*(+P.procFee||0) + vol*(+P.loaBps||0)/10000;
  const procBps = (P.procHiPct/100)*P.hiBps + (1-P.procHiPct/100)*P.loBps;
  const loaBps  = (P.loaHiPct/100)*P.hiBps + (1-P.loaHiPct/100)*P.loBps;
  const compBlend = vol*(procBps+loaBps)/10000;
  const compLow   = vol*(2*(+P.loBps||0))/10000;
  const fixed = P.onTop ? team : 0;
  const netBlend = rev - compBlend - fixed;
  const netLow   = rev - compLow   - fixed;
  const avgLoan = units? vol/units : 0;
  const contribLow = (+P.procFee||0) + ((+P.loaBps||0) - 2*(+P.loBps||0))*avgLoan/10000;
  const beUnits = contribLow>0 ? team/contribLow : null;
  const money=n=>(n<0?'-$':'$')+Math.abs(Math.round(n)).toLocaleString();

  const num=(lab,key,step,suf,dis)=>'<label class="pl-f'+(dis?' dim':'')+'"><span>'+lab+'</span><input type="number" data-k="'+key+'" value="'+(P[key]===''||P[key]==null?'':P[key])+'" step="'+(step||'any')+'"'+(dis?' disabled':'')+'>'+(suf?'<em>'+suf+'</em>':'')+'</label>';
  el.innerHTML=
    '<div class="pl-head">Support P&amp;L <span class="pl-sub">monthly</span></div>'+
    '<div class="pl-grid">'+
      '<label class="pl-chk"><input type="checkbox" data-k="useRoster"'+(P.useRoster?' checked':'')+'> Use roster totals</label>'+
      num('Units','units','1','',P.useRoster)+
      num('Volume $','vol','1','',P.useRoster)+
      num('Processing $/loan','procFee','5','$/loan')+
      num('LOA charge','loaBps','1','bps')+
      num('# support people','people','1','')+
      num('Avg salary','salary','100','$/mo')+
      num('High-cost tier','hiBps','1','bps')+
      num('Low-cost tier','loBps','1','bps')+
      num('Processing % @ high','procHiPct','1','%')+
      num('LOA % @ high','loaHiPct','1','%')+
      '<label class="pl-chk"><input type="checkbox" data-k="onTop"'+(P.onTop?' checked':'')+'> Comp on top of salary</label>'+
    '</div>'+
    '<div class="pl-basis">'+units.toLocaleString()+' units · '+fmtShort(vol)+' · avg loan '+fmtShort(avgLoan)+'</div>'+
    '<div class="pl-rows">'+
      '<div class="pl-r"><span>Revenue</span><b>'+money(rev)+'</b></div>'+
      '<div class="pl-r"><span>Comp — blended ('+procBps.toFixed(2)+' / '+loaBps.toFixed(2)+' bps)</span><b class="neg">-'+Math.round(compBlend).toLocaleString().replace(/^/,'$')+'</b></div>'+
      (P.onTop?'<div class="pl-r"><span>Team salary ('+P.people+' × '+fmtShort(+P.salary)+')</span><b class="neg">-'+Math.round(team).toLocaleString().replace(/^/,'$')+'</b></div>':'')+
      '<div class="pl-r tot '+(netBlend>=0?'pos':'negT')+'"><span>Net — blended mix</span><b>'+money(netBlend)+'</b></div>'+
    '</div>'+
    '<div class="pl-alt">'+
      '<div class="pl-r"><span>If all files → low-cost tier</span><b class="'+(netLow>=0?'pos':'negT')+'">'+money(netLow)+'</b></div>'+
      '<div class="pl-note">Comp saving vs blended: '+money(compBlend-compLow)+(beUnits!=null?(' · break-even ≈ '+Math.ceil(beUnits)+' units'):'')+'</div>'+
    '</div>';

  el.querySelectorAll('input[data-k]').forEach(inp=>{
    if(inp.type==='checkbox'){ inp.onchange=()=>{ state.pnl[inp.dataset.k]=inp.checked; touch(); renderBody(); }; }
    else { inp.onchange=()=>{ const k=inp.dataset.k; const val=inp.value.trim();
      state.pnl[k]= val===''?'':(parseFloat(val)||0); touch(); renderBody(); }; }
  });
}
function renderRoster(v){
  const tb=document.createElement('div'); tb.className='toolbar';
  const s=document.createElement('input'); s.className='search'; s.placeholder='Search branches…'; s.value=filter;
  s.oninput=()=>{filter=s.value.toLowerCase();renderBody();}; tb.appendChild(s);
  tb.appendChild(segToggle([{v:'all',label:'All'},{v:'needs',label:'Needs only'}], rosterFilter, m=>{rosterFilter=m;renderBody();}));
  const sumBadge=document.createElement('span'); sumBadge.className='units-badge'; tb.appendChild(sumBadge);
  const grow=document.createElement('div'); grow.className='grow'; tb.appendChild(grow);
  const save=document.createElement('button'); save.className='good'; save.textContent='💾 Save'; save.onclick=saveToFile; tb.appendChild(save);
  const csv=document.createElement('button'); csv.className='ghost'; csv.textContent='Export CSV'; csv.onclick=exportRosterCSV; tb.appendChild(csv);
  v.appendChild(tb);
  const procs=knownSupport('proc'), loas=knownSupport('loa');
  const needP=state.branches.filter(b=>!b.archived&&b.needProcessor).length, needL=state.branches.filter(b=>!b.archived&&b.needLO).length;
  v.insertAdjacentHTML('beforeend','<div class="hint">Staffing needs per branch. Tick <b>Need Processor</b> / <b>Need LOA</b>, and assign a <b>Processor</b> or <b>LOA</b> from your known support (pulled from branch rosters). '+needP+' need a processor · '+needL+' need an LOA. Use <b>Needs only</b> to show just branches with a need checked.</div>');
  const partialM = (typeof PROD_RUNRATE!=='undefined' && PROD_RUNRATE) ? PROD_RUNRATE.month : null;
  const monthlyUnits=(b)=>{ const org=b&&b.orgid!=null?String(b.orgid):null; if(!org)return null;
    const mm=state.production[org]; if(!mm)return null; let tot=0,n=0;
    Object.keys(mm).forEach(m=>{ if(m===partialM)return; const u=mm[m][1]||0; if(u>0){tot+=u;n++;} });
    return n? tot/n : null; };
  // avg loan size per branch (funded $/units), with a global fallback for branches lacking data
  let gD=0,gU=0; Object.keys(state.production).forEach(o=>Object.keys(state.production[o]).forEach(m=>{ if(m===partialM)return; gD+=state.production[o][m][0]||0; gU+=state.production[o][m][1]||0; }));
  const globalAvgLoan = gU? gD/gU : 0;
  const avgLoan=(b)=>{ const org=b&&b.orgid!=null?String(b.orgid):null; const mm=org&&state.production[org]; if(!mm)return globalAvgLoan;
    let d=0,u=0; Object.keys(mm).forEach(m=>{ if(m===partialM)return; d+=mm[m][0]||0; u+=mm[m][1]||0; }); return u? d/u : globalAvgLoan; };
  let branches=state.branches.filter(b=>!b.archived);
  if(rosterFilter==='needs') branches=branches.filter(b=>b.needProcessor||b.needLO);
  if(filter) branches=branches.filter(b=>(b.name||'').toLowerCase().includes(filter));
  branches.sort((a,b)=>(a.name||'').toLowerCase().localeCompare((b.name||'').toLowerCase()));
  const card=document.createElement('div'); card.className='card';
  if(!branches.length){ card.innerHTML='<div class="empty">No branches'+(rosterFilter==='needs'?' have a need checked'+(filter?' matching your search':''):(filter?' match':''))+'.</div>'; v.appendChild(card); return; }
  let html='<table class="tbl-center rost"><thead><tr>'+
    '<th style="width:170px">Branch</th><th style="width:100px">Need Processor</th><th style="width:90px">Need LOA</th>'+
    '<th style="width:100px">Monthly Units</th>'+
    '<th style="width:186px">Processor Name</th><th style="width:110px">Processor Allocation</th>'+
    '<th style="width:186px">LOA Name</th><th style="width:110px">LOA Allocation</th></tr></thead><tbody>';
  let unitSum=0, volSum=0;
  branches.forEach(b=>{
    const muAvg=monthlyUnits(b);
    const muEff=(b.monthlyUnits!=null&&b.monthlyUnits!=='')?(+b.monthlyUnits||0):(muAvg!=null?Math.round(muAvg):0); unitSum+=muEff; volSum+=muEff*avgLoan(b);
    html+='<tr data-bid="'+b.id+'">'+
      '<td><button class="link" data-open="1">'+esc(b.name||'(unnamed)')+'</button></td>'+
      '<td class="'+(b.needProcessor?'need':'')+'"><input type="checkbox" class="rchk" data-f="needProcessor"'+(b.needProcessor?' checked':'')+'></td>'+
      '<td class="'+(b.needLO?'need':'')+'"><input type="checkbox" class="rchk" data-f="needLO"'+(b.needLO?' checked':'')+'></td>'+
      '<td><input class="ralloc" type="number" min="0" step="any" data-f="monthlyUnits" value="'+(b.monthlyUnits!=null&&b.monthlyUnits!==''?b.monthlyUnits:'')+'" placeholder="'+(muAvg!=null?('~'+Math.round(muAvg)):'—')+'" title="'+(muAvg!=null?('Funded avg: '+(Math.round(muAvg*10)/10)+' units/mo'):'no funded data')+'"></td>'+
      '<td>'+supportSelect('processorName',procs,b.processorName||'')+'</td>'+
      '<td><input class="ralloc" type="number" min="0" step="any" data-f="procAlloc" value="'+(b.procAlloc!=null&&b.procAlloc!==''?b.procAlloc:'')+'" placeholder="—"></td>'+
      '<td>'+supportSelect('loaName',loas,b.loaName||'')+'</td>'+
      '<td><input class="ralloc" type="number" min="0" step="any" data-f="loaAlloc" value="'+(b.loaAlloc!=null&&b.loaAlloc!==''?b.loaAlloc:'')+'" placeholder="—"></td></tr>';
  });
  html+='</tbody></table>'; card.innerHTML=html;
  const layout=document.createElement('div'); layout.className='rost-layout';
  const tblWrap=document.createElement('div'); tblWrap.className='rost-tblwrap'; tblWrap.appendChild(card); layout.appendChild(tblWrap);
  const aside=document.createElement('div'); aside.className='rost-pnl'; layout.appendChild(aside);
  v.appendChild(layout);
  renderPnl(aside, unitSum, volSum);
  sumBadge.innerHTML='Σ '+unitSum.toLocaleString()+' units/mo <span class="units-vol">· est. '+fmtShort(volSum)+'/mo</span>';
  sumBadge.title='Across the '+branches.length+' branch'+(branches.length===1?'':'es')+' shown · est. volume = monthly units × avg loan size ('+fmtShort(globalAvgLoan)+' overall)';
  card.querySelectorAll('tr[data-bid]').forEach(tr=>{ const b=byId(state.branches,tr.dataset.bid); if(!b)return;
    tr.querySelectorAll('input.rchk').forEach(chk=>chk.onchange=()=>{ b[chk.dataset.f]=chk.checked; touch(); renderBody(); });
    tr.querySelector('select[data-role="processorName"]').onchange=e=>{ b.processorName=e.target.value; touch(); };
    tr.querySelector('select[data-role="loaName"]').onchange=e=>{ b.loaName=e.target.value; touch(); };
    tr.querySelectorAll('input.ralloc').forEach(inp=>inp.onchange=()=>{ const val=inp.value.trim(); b[inp.dataset.f]= val===''?'':(parseFloat(val)||0); touch(); });
    tr.querySelector('[data-open]').onclick=()=>{ activeTab='branches'; openBranchId=b.id; render(); window.scrollTo(0,0); };
  });
}

function renderData(v){
  const tb=document.createElement('div'); tb.className='toolbar';
  tb.appendChild(segToggle([{v:'dollars',label:'Dollars'},{v:'units',label:'Units'}], dataMetric, m=>{dataMetric=m;renderBody();}));
  const grow=document.createElement('div'); grow.className='grow'; tb.appendChild(grow);
  const save=document.createElement('button'); save.className='good'; save.textContent='💾 Save'; save.onclick=saveToFile; tb.appendChild(save);
  const csv=document.createElement('button'); csv.className='ghost'; csv.textContent='Export CSV'; csv.onclick=exportProductionCSV; tb.appendChild(csv);
  v.appendChild(tb);
  const excl=Object.keys(state.prodExcluded||{}).filter(o=>state.prodExcluded[o]).length;
  v.insertAdjacentHTML('beforeend','<div class="hint">Funded production by branch (matched to ORG ID; unknown ORG IDs combined into <b>Other</b>). Editing cells updates the Analysis charts. Untick <b>In analysis</b> to exclude a branch from the Analysis &amp; Highlight tabs'+(excl?(' ('+excl+' excluded)'):'')+'.</div>');
  const months=prodMonths(); const groups=prodGroups(true);
  const wrap=document.createElement('div'); wrap.className='pivot-wrap'; const card=document.createElement('div'); card.className='card';
  const isD=dataMetric==='dollars';
  let html='<table class="pivot"><thead><tr><th class="stick s-inc">In analysis</th><th class="stick s0">Branch</th><th class="stick s1">ORG ID</th>';
  months.forEach(m=>html+='<th>'+m+'</th>'); html+='<th class="tot">Total</th></tr></thead><tbody>';
  const colTot={}; let grand=0;
  groups.forEach(g=>{
    let rowTot=0; const inc=isIncluded(g.org);
    html+='<tr data-org="'+esc(g.org)+'" class="'+(inc?'':'excluded')+'">'+
      '<td class="stick s-inc"><input type="checkbox" class="incchk"'+(inc?' checked':'')+'></td>'+
      '<td class="stick s0 bname">'+esc(g.name)+'</td><td class="stick s1 muted">'+esc(g.org)+'</td>';
    months.forEach(m=>{ const rec=state.production[g.org][m]; const val=rec?(isD?rec[0]:rec[1]):0; rowTot+=val; colTot[m]=(colTot[m]||0)+val;
      html+='<td><input class="cell" type="number" data-m="'+m+'" value="'+(val?(isD?Math.round(val):val):'')+'"></td>'; });
    grand+=rowTot;
    html+='<td class="tot">'+(isD?fmtShort(rowTot):rowTot)+'</td></tr>';
  });
  html+='</tbody><tfoot><tr><td class="stick s-inc"></td><td class="stick s0">Total</td><td class="stick s1"></td>';
  months.forEach(m=>html+='<td class="tot">'+(isD?fmtShort(colTot[m]||0):(colTot[m]||0))+'</td>'); html+='<td class="tot">'+(isD?fmtShort(grand):grand)+'</td></tr></tfoot></table>';
  card.innerHTML=html; wrap.appendChild(card); v.appendChild(wrap);
  card.querySelectorAll('tr[data-org]').forEach(tr=>{ const org=tr.dataset.org;
    tr.querySelector('input.incchk').onchange=ev=>{ if(ev.target.checked) delete state.prodExcluded[org]; else state.prodExcluded[org]=true; touch(); renderTabs(); renderBody(); };
    tr.querySelectorAll('input.cell').forEach(inp=>inp.onchange=()=>{
      const m=inp.dataset.m; let val=parseFloat(inp.value)||0; if(val<0)val=0;
      state.production[org]=state.production[org]||{}; state.production[org][m]=state.production[org][m]||[0,0];
      if(isD) state.production[org][m][0]=val; else state.production[org][m][1]=Math.round(val);
      if(!state.production[org][m][0] && !state.production[org][m][1]) delete state.production[org][m];
      touch(); renderBody();
    });
  });
}

/* ---------- Tenure tab (each branch/orgid, monthly $ + units, longest tenure first) ---------- */
function renderTenure(v){
  const isCharts=tenureView==='charts';
  const tb=document.createElement('div'); tb.className='toolbar';
  tb.appendChild(segToggle([{v:'charts',label:'Charts'},{v:'table',label:'Table'}], tenureView, m=>{tenureView=m; renderBody();}));
  if(!isCharts) tb.appendChild(segToggle([{v:'both',label:'Both'},{v:'dollars',label:'Dollars'},{v:'units',label:'Units'}], tenureMetric, m=>{tenureMetric=m;renderBody();}));
  const grow=document.createElement('div'); grow.className='grow'; tb.appendChild(grow);
  const save=document.createElement('button'); save.className='good'; save.textContent='💾 Save'; save.onclick=saveToFile; tb.appendChild(save);
  const csv=document.createElement('button'); csv.className='ghost'; csv.textContent='Export CSV'; csv.onclick=exportProductionCSV; tb.appendChild(csv);
  v.appendChild(tb);
  v.insertAdjacentHTML('beforeend','<div class="hint">'+(isCharts?'Pick a branch on the left (ordered longest tenure → most recent) to see its monthly <b>volume</b> and <b>units</b> charts. The first active month is highlighted.':'Every branch / ORG ID with monthly funded production — <b>volume</b> and <b>units</b>. Ordered by tenure: earliest first funded month first → most recently onboarded last.')+'</div>');

  const months=prodMonths();
  if(!months.length){ v.insertAdjacentHTML('beforeend','<div class="empty">No production data.</div>'); return; }
  // build one record per org with first active month + totals
  const rows=Object.keys(state.production).map(org=>{
    const mm=state.production[org]; let first=null,d=0,u=0,active=0;
    months.forEach(m=>{ const rec=mm[m]; if(rec&&((rec[0]||0)>0||(rec[1]||0)>0)){ if(!first)first=m; d+=rec[0]||0; u+=rec[1]||0; active++; } });
    return {org,name:prodName(org),mm,first:first||'9999-99',d,u,active};
  }).filter(r=>r.first!=='9999-99');
  // longest tenure first: earliest first month, then most active months, then biggest volume
  rows.sort((a,b)=> a.first.localeCompare(b.first) || b.active-a.active || b.d-a.d );

  if(isCharts){ renderTenureCharts(v,rows,months); return; }

  const showD=tenureMetric!=='units', showU=tenureMetric!=='dollars', both=tenureMetric==='both';
  const cellFmt=(rec,isFirst)=>{ const has=rec&&((rec[0]||0)>0||(rec[1]||0)>0);
    if(!has) return '<td><span class="muted">·</span></td>';
    let inner='';
    if(showD) inner+='<div class="t-d">'+fmtShort(rec[0]||0)+'</div>';
    if(showU) inner+='<div class="t-u">'+((rec[1]||0).toLocaleString())+(both?'':' u')+'</div>';
    return '<td class="'+(isFirst?'t-first':'')+'">'+inner+'</td>'; };

  const wrap=document.createElement('div'); wrap.className='pivot-wrap'; const card=document.createElement('div'); card.className='card';
  let html='<table class="pivot tn"><thead><tr>'+
    '<th class="stick tn-r">#</th><th class="stick tn0">Branch</th><th class="stick tn1">ORG ID</th>'+
    '<th>Since</th><th>Mo</th>';
  months.forEach(m=>html+='<th>'+m+'</th>');
  html+='<th class="tot">Total'+(both?' ($ / u)':(showD?' $':' u'))+'</th></tr></thead><tbody>';
  const colD={},colU={}; let gD=0,gU=0;
  rows.forEach((r,i)=>{
    html+='<tr><td class="stick tn-r muted">'+(i+1)+'</td><td class="stick tn0 bname">'+esc(r.name)+'</td><td class="stick tn1 muted">'+esc(r.org)+'</td>'+
      '<td class="t-since">'+r.first+'</td><td class="muted">'+r.active+'</td>';
    months.forEach(m=>{ const rec=r.mm[m]; html+=cellFmt(rec,m===r.first);
      if(rec){ colD[m]=(colD[m]||0)+(rec[0]||0); colU[m]=(colU[m]||0)+(rec[1]||0); } });
    gD+=r.d; gU+=r.u;
    let tot=''; if(showD)tot+='<div class="t-d">'+fmtShort(r.d)+'</div>'; if(showU)tot+='<div class="t-u">'+r.u.toLocaleString()+(both?'':' u')+'</div>';
    html+='<td class="tot">'+tot+'</td></tr>';
  });
  html+='</tbody><tfoot><tr><td class="stick tn-r"></td><td class="stick tn0">Total</td><td class="stick tn1"></td><td></td><td></td>';
  months.forEach(m=>{ let t=''; if(showD)t+='<div class="t-d">'+fmtShort(colD[m]||0)+'</div>'; if(showU)t+='<div class="t-u">'+((colU[m]||0).toLocaleString())+(both?'':' u')+'</div>'; html+='<td>'+t+'</td>'; });
  let gt=''; if(showD)gt+='<div class="t-d">'+fmtShort(gD)+'</div>'; if(showU)gt+='<div class="t-u">'+gU.toLocaleString()+(both?'':' u')+'</div>';
  html+='<td class="tot">'+gt+'</td></tr></tfoot></table>';
  card.innerHTML=html; wrap.appendChild(card); v.appendChild(wrap);
}

/* master list (longest tenure → least) on the left; volume + units bar charts on the right */
function renderTenureCharts(v,rows,months){
  if(typeof echarts==='undefined'){ v.insertAdjacentHTML('beforeend','<div class="empty">Charts library did not load.</div>'); return; }
  if(!tenureSel || !rows.some(r=>r.org===tenureSel)) tenureSel=rows[0].org;

  const split=document.createElement('div'); split.className='tn-split'; v.appendChild(split);

  // left: ranked list
  const list=document.createElement('div'); list.className='tn-list';
  rows.forEach((r,i)=>{
    const it=document.createElement('div'); it.className='tn-li'+(r.org===tenureSel?' sel':'');
    const sub=groupKeyForOrg(r.org,'subdivision'); const dc=divColor(sub);
    it.innerHTML='<span class="tn-li-rank">'+(i+1)+'</span>'+
      '<span class="tn-li-dot" style="background:'+dc+'"></span>'+
      '<span class="tn-li-main"><span class="tn-li-name">'+esc(r.name)+' <span class="tn-li-org">ORG '+esc(r.org)+'</span></span>'+
      '<span class="tn-li-meta"><span class="tn-li-first">First: '+r.first+'</span> · '+r.active+' mo · '+fmtShort(r.d)+' · '+r.u.toLocaleString()+' u</span></span>';
    it.onclick=()=>{ tenureSel=r.org; renderBody(); };
    list.appendChild(it);
  });
  split.appendChild(list);

  // right: detail with two charts
  const r=rows.find(x=>x.org===tenureSel);
  const detail=document.createElement('div'); detail.className='tn-detail';
  const sub=groupKeyForOrg(r.org,'subdivision'); const base=divColor(sub);
  detail.innerHTML='<div class="tn-dhead"><span class="tn-dot" style="background:'+base+'"></span>'+
    '<span class="tn-dname">'+esc(r.name)+'</span>'+
    '<span class="tn-dmeta">ORG '+esc(r.org)+' · '+sub+' · since '+r.first+' · '+r.active+' active months</span></div>';
  const mkCardHTML=(cls,title,val)=>'<div class="tn-dcard '+cls+'"><div class="tn-dctitle">'+title+' <span class="tn-dcsum">'+val+'</span></div><div class="tn-dccanvas"></div></div>';
  detail.insertAdjacentHTML('beforeend', mkCardHTML('vol','Monthly Volume ($)', fmtShort(r.d)+' total')+mkCardHTML('unit','Monthly Units', r.u.toLocaleString()+' loans total'));

  // Product mix pie (editable — no loan-type field exists in the source, so it's maintained here)
  const PT=[['conv','Conventional','#25e0ff'],['fha','FHA','#b06bff'],['va','VA','#38f2b0'],['nonqm','Non-QM','#ffd166']];
  const mix=state.productMix[r.org]||{}; const mtot=PT.reduce((s,p)=>s+(+mix[p[0]]||0),0);
  let pcard='<div class="tn-dcard mix"><div class="tn-dctitle">Product Mix <span class="tn-dcsum">'+(mtot?mtot+' loans entered':'enter counts →')+'</span></div><div class="tn-mixwrap"><div class="tn-mixpie"></div><div class="tn-mixform">';
  PT.forEach(p=>{ const val=(+mix[p[0]]||0); const pct=mtot?(val/mtot*100):0;
    pcard+='<label class="tn-mixrow"><span class="tn-mixdot" style="background:'+p[2]+'"></span><span class="tn-mixlab">'+p[1]+'</span>'+
      '<input class="tn-mixinp" type="number" min="0" data-pt="'+p[0]+'" value="'+(val||'')+'" placeholder="0">'+
      '<span class="tn-mixpct">'+(mtot?pct.toFixed(0)+'%':'—')+'</span></label>'; });
  pcard+='<div class="tn-mixhint">Counts by loan program for this branch. Saved in the app.</div></div></div></div>';
  detail.insertAdjacentHTML('beforeend', pcard);
  split.appendChild(detail);

  const mkBars=(canvas,isD,color)=>{
    const data=months.map(m=>{ const rec=r.mm[m]; const val=rec?(isD?(rec[0]||0):(rec[1]||0)):0; const isFirst=(m===r.first);
      return { value:isD?Math.round(val):val, itemStyle:{ color:isFirst?'#eaf7ff':color, borderColor:isFirst?color:'transparent', borderWidth:isFirst?2:0 } }; });
    mkChart(canvas,{
      backgroundColor:'transparent',
      grid:{left:64,right:18,top:16,bottom:52},
      tooltip:{ trigger:'axis', axisPointer:{type:'shadow'}, valueFormatter:val=> isD?fmtUSD(val):val+' units' },
      xAxis:{ type:'category', data:months, axisLabel:{color:'#8fb8cf',fontSize:11,rotate:45,interval:0}, axisLine:{lineStyle:{color:'#2a4c6a'}}, axisTick:{show:false} },
      yAxis:{ type:'value', axisLabel:{color:'#8fb8cf',formatter:val=>isD?fmtShort(val):val}, splitLine:{lineStyle:{color:'#122c42'}} },
      series:[{ type:'bar', data, barWidth:'58%', label:{show:true,position:'top',color:'#9fc4d8',fontSize:9,formatter:p=> p.value? (isD?fmtShort(p.value):p.value):'' }, emphasis:{focus:'series'} }]
    });
  };
  mkBars(detail.querySelector('.tn-dcard.vol .tn-dccanvas'), true, base);
  mkBars(detail.querySelector('.tn-dcard.unit .tn-dccanvas'), false, '#b06bff');

  // product-mix pie
  const pieEl=detail.querySelector('.tn-mixpie');
  const drawPie=()=>{ const mx=state.productMix[r.org]||{}; const pd=PT.map(p=>({name:p[1],value:+mx[p[0]]||0,itemStyle:{color:p[2]}})).filter(x=>x.value>0);
    if(!pd.length){ pieEl.innerHTML='<div class="tn-mixempty">No product mix entered yet.<br>Enter loan counts on the right.</div>'; return; }
    pieEl.innerHTML='';
    mkChart(pieEl,{ backgroundColor:'transparent',
      tooltip:{trigger:'item', formatter:p=>p.name+': '+p.value+' ('+p.percent+'%)'},
      legend:{bottom:0,textStyle:{color:'#bfe6f5'},itemWidth:10,itemHeight:10},
      series:[{ type:'pie', radius:['42%','70%'], center:['50%','44%'], avoidLabelOverlap:true,
        itemStyle:{borderColor:'#0a1420',borderWidth:2},
        label:{color:'#dce9f2',formatter:'{b}\n{d}%',fontSize:11},
        data:pd }] }); };
  drawPie();
  detail.querySelectorAll('.tn-mixinp').forEach(inp=>inp.onchange=()=>{
    const pt=inp.dataset.pt; let val=parseInt(inp.value)||0; if(val<0)val=0;
    state.productMix[r.org]=state.productMix[r.org]||{}; state.productMix[r.org][pt]=val;
    touch(); renderBody();
  });
}

/* ---------- Analysis tab (3D + line charts) ---------- */
function renderAnalysis(v){
  const DIMS=[['branch','By Branch','Branch','Branches'],['area','By Area','Area','Areas'],['region','By Region','Region','Regions'],['subdivision','By Sub-division','Sub-division','Sub-divisions'],['division','By Division','Division','Divisions']];
  const dcur=DIMS.find(d=>d[0]===analysisDim)||DIMS[0];
  const tb=document.createElement('div'); tb.className='toolbar';
  const dimSel=document.createElement('select'); dimSel.className='search'; dimSel.style.minWidth='150px';
  DIMS.forEach(d=>{ const o=document.createElement('option'); o.value=d[0]; o.textContent=d[1]; if(d[0]===analysisDim)o.selected=true; dimSel.appendChild(o); });
  dimSel.onchange=()=>{analysisDim=dimSel.value;renderBody();}; tb.appendChild(dimSel);
  tb.appendChild(segToggle([{v:'dollars',label:'Dollars'},{v:'units',label:'Units'}], analysisMetric, m=>{analysisMetric=m;renderBody();}));
  const lbl=document.createElement('span'); lbl.className='muted'; lbl.style.marginLeft='6px'; lbl.textContent='Top:'; tb.appendChild(lbl);
  const topSel=document.createElement('select'); topSel.className='search'; topSel.style.minWidth='80px';
  [5,10,15,20,999].forEach(n=>{ const o=document.createElement('option'); o.value=n; o.textContent=(n>=999?'All':n); if(n===analysisTopN)o.selected=true; topSel.appendChild(o); });
  topSel.onchange=()=>{analysisTopN=+topSel.value;renderBody();}; tb.appendChild(topSel);
  tb.appendChild(otherToggle());
  const grow=document.createElement('div'); grow.className='grow'; tb.appendChild(grow);
  const edit=document.createElement('button'); edit.className='ghost'; edit.textContent='Edit numbers →'; edit.onclick=()=>{activeTab='data';render();}; tb.appendChild(edit);
  v.appendChild(tb);
  if(typeof echarts==='undefined'){ v.insertAdjacentHTML('beforeend','<div class="empty">Charts library did not load.</div>'); return; }

  const gm=groupMonthly(analysisDim); const months=prodMonths();
  const groups=Object.keys(gm).map(name=>{ const mm=gm[name]; let d=0,u=0; Object.values(mm).forEach(vv=>{d+=vv[0]||0;u+=vv[1]||0;}); return {name,mm,d,u}; }).sort((a,b)=>b.d-a.d);
  let totalD=0,totalU=0; const mTot={};
  Object.values(gm).forEach(mm=>Object.keys(mm).forEach(m=>{ const d=mm[m][0]||0,u=mm[m][1]||0; totalD+=d;totalU+=u; mTot[m]=mTot[m]||[0,0]; mTot[m][0]+=d; mTot[m][1]+=u; }));
  const avg=totalU?totalD/totalU:0;
  let peak=months[0]; months.forEach(m=>{ if((mTot[m]||[0,0])[0] > (mTot[peak]||[0,0])[0]) peak=m; });
  const isD=analysisMetric==='dollars';
  const mv=(mm,m)=>{ const rec=mm[m]; return rec?(isD?rec[0]:rec[1]):0; };

  // KPI tiles
  const kpis=document.createElement('div'); kpis.className='kpis';
  const tile=(lab,val,sub)=>'<div class="kpi"><div class="k-val">'+val+'</div><div class="k-lab">'+lab+'</div>'+(sub?'<div class="k-sub">'+sub+'</div>':'')+'</div>';
  kpis.innerHTML=tile('Total funded',fmtShort(totalD),fmtUSD(totalD))
    +tile('Units',totalU.toLocaleString(),'loans')
    +tile('Avg loan size',fmtShort(avg),'')
    +tile(dcur[3],(groups.length)+'', analysisDim==='branch'?'incl. Other':'incl. Unassigned')
    +tile('Months',months.length+'', (months[0]||'')+' – '+(months[months.length-1]||''))
    +tile('Peak month',peak||'—', fmtShort((mTot[peak]||[0,0])[0]));
  v.appendChild(kpis);

  const top=groups.slice(0,analysisTopN);
  const palette=['#25e0ff','#ff3b52','#7cf6ff','#b06bff','#38f2b0','#ffd166','#ff7ab0','#5aa9ff','#f472b6','#a3e635','#22d3ee','#fb923c','#e879f9','#4ade80','#60a5fa','#f87171','#c084fc','#2dd4bf','#facc15','#fb7185'];

  // partial last-month run-rate (data-derived factor — see Monthly tab)
  const lastM=months[months.length-1];
  const monthPartial = !!(PROD_RUNRATE && PROD_RUNRATE.month===lastM);
  const mProj = monthPartial ? (isD?PROD_RUNRATE.factorD:PROD_RUNRATE.factorU) : 1;

  // Stacked bar: month(x), stacked by chosen dimension
  const boxBar=document.createElement('div'); boxBar.className='card chart-box tall';
  boxBar.innerHTML='<div class="chart-title">Production by '+dcur[2]+' × Month — '+(isD?'Dollars':'Units')+(monthPartial?(' · '+lastM+' @ BD'+PROD_RUNRATE.bday+' — purple→red top = run-rate ('+PROD_RUNRATE.confidence+' conf.)'):'')+'</div><div class="chart-canvas" id="cbar"></div>';
  v.appendChild(boxBar);
  const barActual=top.map((g,i)=>({ name:g.name, type:'bar', stack:'prod', emphasis:{focus:'series'}, itemStyle:{color:palette[i%palette.length]},
    data:months.map(m=>{ const val=mv(g.mm,m); return isD?Math.round(val):val; }) }));
  const projGrad= new echarts.graphic.LinearGradient(0,0,0,1,[
    {offset:0,color:'rgba(255,59,82,0.65)'},{offset:1,color:'rgba(176,107,255,0.58)'}]);
  const barProj= monthPartial? [{ name:'run-rate', type:'bar', stack:'prod',
    itemStyle:{color:projGrad, borderColor:'rgba(255,255,255,0.35)', borderWidth:1, borderType:'dashed'},
    data:months.map(m=> m===lastM? Math.round( top.reduce((s,g)=> s+mv(g.mm,m),0)*(mProj-1) ) : 0) }] : [];
  mkChart(document.getElementById('cbar'),{
    backgroundColor:'transparent',
    tooltip:{ trigger:'axis', axisPointer:{type:'shadow'}, valueFormatter:val=> isD?fmtUSD(val):val+' units', order:'valueDesc' },
    legend:{ type:'scroll', top:0, textStyle:{color:'#bfe6f5'}, data: top.map(g=>g.name).concat(monthPartial?['run-rate']:[]) },
    grid:{left:72,right:24,top:44,bottom:70},
    xAxis:{ type:'category', data:months, axisLabel:{color:'#8fb8cf',rotate:45}, axisLine:{lineStyle:{color:'#2a4c6a'}} },
    yAxis:{ type:'value', axisLabel:{color:'#8fb8cf',formatter:v=>isD?fmtShort(v):v}, splitLine:{lineStyle:{color:'#122c42'}} },
    series: barActual.concat(barProj)
  });

  // Line: monthly total dollars + units (dual axis)
  const box1=document.createElement('div'); box1.className='card chart-box';
  box1.innerHTML='<div class="chart-title">Monthly production trend — Dollars &amp; Units</div><div class="chart-canvas" id="cl1"></div>';
  v.appendChild(box1);
  mkChart(document.getElementById('cl1'),{
    backgroundColor:'transparent', tooltip:{trigger:'axis'},
    legend:{data:['Dollars','Units'],textStyle:{color:'#bfe6f5'}},
    grid:{left:70,right:64,top:44,bottom:70},
    xAxis:{type:'category',data:months,axisLabel:{color:'#8fb8cf',rotate:45},axisLine:{lineStyle:{color:'#2a4c6a'}}},
    yAxis:[{type:'value',name:'$',nameTextStyle:{color:'#9fd6ea'},axisLabel:{color:'#8fb8cf',formatter:v=>fmtShort(v)},splitLine:{lineStyle:{color:'#122c42'}}},
           {type:'value',name:'Units',nameTextStyle:{color:'#9fd6ea'},axisLabel:{color:'#8fb8cf'},splitLine:{show:false}}],
    series:[
      {name:'Dollars',type:'line',smooth:true,symbol:'circle',symbolSize:6,areaStyle:{color:'rgba(37,224,255,.15)'},lineStyle:{width:3,color:'#25e0ff'},itemStyle:{color:'#25e0ff'},data:months.map(m=>Math.round((mTot[m]||[0,0])[0]))},
      {name:'Units',type:'line',yAxisIndex:1,smooth:true,symbol:'circle',symbolSize:5,lineStyle:{width:2,color:'#ff3b52'},itemStyle:{color:'#ff3b52'},data:months.map(m=>(mTot[m]||[0,0])[1])}
    ]
  });

  // Line: top groups over time
  const box2=document.createElement('div'); box2.className='card chart-box';
  box2.innerHTML='<div class="chart-title">Top '+dcur[3].toLowerCase()+' over time — '+(isD?'Dollars':'Units')+'</div><div class="chart-canvas" id="cl2"></div>';
  v.appendChild(box2);
  mkChart(document.getElementById('cl2'),{
    backgroundColor:'transparent', tooltip:{trigger:'axis'},
    legend:{type:'scroll',top:0,textStyle:{color:'#bfe6f5'}},
    grid:{left:70,right:24,top:44,bottom:70},
    xAxis:{type:'category',data:months,axisLabel:{color:'#8fb8cf',rotate:45},axisLine:{lineStyle:{color:'#2a4c6a'}}},
    yAxis:{type:'value',axisLabel:{color:'#8fb8cf',formatter:v=>isD?fmtShort(v):v},splitLine:{lineStyle:{color:'#122c42'}}},
    series:top.map((g,i)=>({name:g.name,type:'line',smooth:true,showSymbol:false,lineStyle:{width:2,color:palette[i%palette.length]},itemStyle:{color:palette[i%palette.length]},
      data:months.map(m=>{ const val=mv(g.mm,m); return isD?Math.round(val):val; })}))
  });

  if(!resizeHooked){ window.addEventListener('resize',()=>{ chartInstances.forEach(c=>{try{c.resize();}catch(e){}}); }); resizeHooked=true; }
}

/* ---------- Monthly tab (intra-month curve by business day) ---------- */
function renderMonthly(v){
  const allMonths=Object.keys(PROD_MBDAYS).sort();
  const branchKeys=Object.keys(PROD_DAILY_BR);
  const isD=monthlyMetric==='dollars', mkey=isD?'d':'u';
  const BD=PROD_RUNRATE?PROD_RUNRATE.bday:5, PM=PROD_RUNRATE?PROD_RUNRATE.month:allMonths[allMonths.length-1];
  const tb=document.createElement('div'); tb.className='toolbar';
  tb.appendChild(segToggle([{v:'merged',label:'Merged'},{v:'separate',label:'Separate'}], monthlyView, m=>{monthlyView=m;renderBody();}));
  tb.appendChild(segToggle([{v:'dollars',label:'Dollars'},{v:'units',label:'Units'}], monthlyMetric, m=>{monthlyMetric=m;renderBody();}));
  tb.appendChild(segToggle([{v:'cumulative',label:'Cumulative'},{v:'daily',label:'Daily'}], monthlyMode, m=>{monthlyMode=m;renderBody();}));
  tb.insertAdjacentHTML('beforeend','<span class="muted" style="font-size:12px;margin-left:6px">Interval</span>');
  tb.appendChild(segToggle([{v:0.5,label:'50%'},{v:0.75,label:'75%'},{v:0.9,label:'90%'}], monthlyConf, c=>{monthlyConf=+c;renderBody();}));
  const grow=document.createElement('div'); grow.className='grow'; tb.appendChild(grow);
  const save=document.createElement('button'); save.className='good'; save.textContent='💾 Save'; save.onclick=saveToFile; tb.appendChild(save);
  v.appendChild(tb);
  if(!allMonths.length){ v.insertAdjacentHTML('beforeend','<div class="empty">No daily data.</div>'); return; }
  if(!monthlySel){ monthlySel={}; const last=allMonths[allMonths.length-1]; const pick=new Set([last]);
    for(let i=1;i<=3;i++){ const idx=allMonths.length-1-i; if(idx>=0)pick.add(allMonths[idx]); }
    const parts=last.split('-'); const yoy=(parseInt(parts[0],10)-1)+'-'+parts[1]; if(PROD_MBDAYS[yoy])pick.add(yoy);
    pick.forEach(m=>monthlySel[m]=true); }
  if(!monthlyBranchSel){ monthlyBranchSel={}; branchKeys.forEach(k=>monthlyBranchSel[k]=true); }

  const mkBtn=(lab,fn)=>{ const b=document.createElement('button'); b.className='sm ghost'; b.textContent=lab; b.onclick=fn; return b; };
  // Branch picker
  const brOrder=branchKeys.slice().map(k=>{ let t=0; Object.values(PROD_DAILY_BR[k]).forEach(mm=>t+=mm.d[mm.d.length-1]||0); return {k,t}; }).sort((a,b)=>b.t-a.t).map(x=>x.k);
  const bBar=document.createElement('div'); bBar.className='toolbar'; bBar.style.marginTop='0';
  bBar.insertAdjacentHTML('beforeend','<span class="muted" style="font-size:12px;font-weight:600">Branches</span>');
  bBar.appendChild(mkBtn('All',()=>{branchKeys.forEach(k=>monthlyBranchSel[k]=true);renderBody();}));
  bBar.appendChild(mkBtn('Clear',()=>{monthlyBranchSel={};renderBody();}));
  const bChips=document.createElement('div'); bChips.className='mchips';
  brOrder.forEach(k=>{ const c=document.createElement('button'); c.className='mchip'+(monthlyBranchSel[k]?' on':''); c.textContent=prodName(k);
    c.onclick=()=>{ if(monthlyBranchSel[k])delete monthlyBranchSel[k]; else monthlyBranchSel[k]=true; renderBody(); }; bChips.appendChild(c); });
  bBar.appendChild(bChips); v.appendChild(bBar);
  // Month picker
  const mBar=document.createElement('div'); mBar.className='toolbar'; mBar.style.marginTop='0';
  mBar.insertAdjacentHTML('beforeend','<span class="muted" style="font-size:12px;font-weight:600">Months</span>');
  mBar.appendChild(mkBtn('All',()=>{allMonths.forEach(m=>monthlySel[m]=true);renderBody();}));
  mBar.appendChild(mkBtn('Clear',()=>{monthlySel={};renderBody();}));
  const mChips=document.createElement('div'); mChips.className='mchips';
  allMonths.forEach(m=>{ const c=document.createElement('button'); c.className='mchip'+(monthlySel[m]?' on':''); c.textContent=m;
    c.onclick=()=>{ if(monthlySel[m])delete monthlySel[m]; else monthlySel[m]=true; renderBody(); }; mChips.appendChild(c); });
  mBar.appendChild(mChips); v.appendChild(mBar);

  const selMonths=allMonths.filter(m=>monthlySel[m]);
  const selBr=branchKeys.filter(k=>monthlyBranchSel[k]);
  const fV=n=> isD?fmtShort(n):Math.round(n).toLocaleString();
  // subset cumulative array for a month (sum of selected branches), for current metric
  const subArr=(mo)=>{ const N=PROD_MBDAYS[mo]; const a=new Array(N).fill(0);
    selBr.forEach(k=>{ const bm=PROD_DAILY_BR[k]&&PROD_DAILY_BR[k][mo]; if(bm){ const src=bm[mkey]; for(let i=0;i<N;i++) a[i]+=src[i]||0; } }); return a; };
  // subset run-rate (point + percentile band + back-test mape), computed from selected branches
  const at=(mo)=>{ const a=subArr(mo); const n=Math.min(BD,a.length); return {cum:a[n-1]||0, tot:a[a.length-1]||0, bdays:a.length, arr:a}; };
  const compSel=selMonths.filter(m=>m!==PM);
  const patMonths = (compSel.filter(m=>at(m).tot>0).length>=3) ? compSel : allMonths.filter(m=>m!==PM);
  let RR=null;
  if(PROD_RUNRATE){
    let maxTot=0; patMonths.forEach(mo=>{ const t=at(mo).tot; if(t>maxTot)maxTot=t; });
    const thr=Math.max(1, maxTot*0.1);   // ignore immaterial months (<10% of peak) for a stable pattern
    const fracs=[]; let sumCum=0,sumTot=0; const shapeMonths=[];
    patMonths.forEach(mo=>{ const x=at(mo); if(x.tot>thr){ fracs.push(x.cum/x.tot); sumCum+=x.cum; sumTot+=x.tot; shapeMonths.push(mo); } });
    const pmX=at(PM);
    if(fracs.length && sumTot>0 && pmX.cum>0){
      fracs.sort((a,b)=>a-b);
      const q=(arr,p)=>{ const i=(arr.length-1)*p, lo=Math.floor(i), hi=Math.ceil(i); return arr[lo]+(arr[hi]-arr[lo])*(i-lo); };
      // blended fraction quantile: shrink small samples toward the stable all-branch distribution; floor so it can't blow up
      const gf=(isD?PROD_RUNRATE.gfD:PROD_RUNRATE.gfU).slice().sort((a,b)=>a-b);
      const nM=fracs.length, w=nM/(nM+8), fl=x=>Math.max(0.03,x);
      const bq=(pp)=> fl( w*q(fracs,pp) + (1-w)*q(gf,pp) );
      let ae=0,cnt=0;
      shapeMonths.forEach(mo=>{ const x=at(mo); const sc=sumCum-x.cum, st=sumTot-x.tot; if(st<=0)return; ae+=Math.abs((x.cum/(sc/st))/x.tot-1); cnt++; });
      const mape=cnt?ae/cnt*100:0, conf= mape>30?'Low':(mape>15?'Moderate':'High');
      RR={actual:pmX.cum, frac:bq(0.5), bq, mape, conf, bdaysPm:pmX.bdays, n:cnt, shapeMonths, qf:q};
    }
  }

  // projection tiles
  if(RR){
    const C=monthlyConf, pc=Math.round(C*100);
    const proj=RR.actual/RR.frac, projLo=RR.actual/RR.bq((1+C)/2), projHi=RR.actual/RR.bq((1-C)/2);
    const confColor= RR.conf==='High'?'#4ade80':(RR.conf==='Moderate'?'#ffd166':'#ff8fa0');
    const kpis=document.createElement('div'); kpis.className='kpis';
    const tile=(lab,val,sub,col)=>'<div class="kpi"><div class="k-val"'+(col?(' style="color:'+col+'"'):'')+'>'+val+'</div><div class="k-lab">'+lab+'</div>'+(sub?'<div class="k-sub">'+sub+'</div>':'')+'</div>';
    const scope= selBr.length===branchKeys.length?'all branches':(selBr.length+' branch'+(selBr.length>1?'es':''));
    kpis.innerHTML=tile(PM+' so far', fV(RR.actual), scope+' · through BD'+BD)
      +tile(PM+' projected', fV(proj), 'run-rate ×'+(1/RR.frac).toFixed(2)+' · median pace')
      +tile(pc+'% range', fV(projLo)+' – '+fV(projHi), '~'+pc+'% chance the month lands in here')
      +tile('Reliability @ BD'+BD, RR.conf, 'back-test ±'+RR.mape.toFixed(0)+'% over '+RR.n+' mo', confColor);
    v.appendChild(kpis);
  }

  const box=document.createElement('div'); box.className='card chart-box tall';
  box.innerHTML='<div class="chart-title">'+(monthlyView==='separate'?'Per-branch ':'')+(monthlyMode==='cumulative'?'Cumulative':'Daily')+' production by business day — '+(isD?'Dollars':'Units')+'</div><div class="chart-canvas" id="cmonthly"></div>';
  v.appendChild(box);
  if(typeof echarts!=='undefined' && selMonths.length){
    const subCache={}; const getSub=(mo)=>{ if(!subCache[mo])subCache[mo]=subArr(mo); return subCache[mo]; };
    const maxN=Math.max(1,...selMonths.map(m=>PROD_MBDAYS[m]));
    const xcats=Array.from({length:maxN},(_,i)=>i+1);
    const series=[]; let legendData=[];
    const brCurve=(k)=>{ const arr=new Array(maxN).fill(0);
      selMonths.forEach(mo=>{ const bm=PROD_DAILY_BR[k]&&PROD_DAILY_BR[k][mo]; if(bm){ const src=bm[mkey],N=src.length; for(let j=0;j<maxN;j++) arr[j]+=(j<N?src[j]:(src[N-1]||0)); } }); return arr; };
    if(monthlyView==='separate'){
      selBr.forEach((k,i)=>{ const arr=brCurve(k);
        const data= monthlyMode==='cumulative'? arr.slice() : arr.map((val,j)=>j===0?val:Math.max(0,val-arr[j-1]));
        series.push({name:prodName(k),type:'line',smooth:true,showSymbol:false,lineStyle:{width:2,color:PALETTE[i%PALETTE.length]},itemStyle:{color:PALETTE[i%PALETTE.length]},emphasis:{focus:'series'},data:data});
        legendData.push(prodName(k)); });
    } else if(RR && monthlySel[PM]){
      const C=monthlyConf, actual=RR.actual, endN=RR.bdaysPm, q=RR.qf;
      // per-business-day median pace shape from the reference months
      const medShape=new Array(maxN).fill(1);
      for(let k=1;k<=maxN;k++){ const vals=RR.shapeMonths.map(mo=>{ const a=getSub(mo); const tot=a[a.length-1]||1; return (a[Math.min(k,a.length)-1]||0)/tot; }).sort((x,y)=>x-y); medShape[k-1]=q(vals,.5); }
      const mBD=medShape[BD-1]||1e-9, mEnd=medShape[endN-1]||1, denom=(mEnd-mBD)||1;
      const curve=(frac)=>{ const T=actual/frac, a=new Array(maxN).fill(null);
        for(let k=BD;k<=endN;k++){ const g=Math.min(1,Math.max(0,(medShape[k-1]-mBD)/denom)); a[k-1]=Math.round(actual+(T-actual)*g); } return a; };
      if(monthlyMode==='cumulative'){
        const bandFill=(loArr,hiArr,op,st)=>{ const base=new Array(maxN).fill(null),delta=new Array(maxN).fill(null);
          for(let k=BD;k<=endN;k++){ base[k-1]=loArr[k-1]; delta[k-1]=hiArr[k-1]-loArr[k-1]; }
          const grad=new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:'rgba(255,59,82,'+(op*1.08)+')'},{offset:1,color:'rgba(176,107,255,'+op+')'}]);
          series.push({name:st+'b',type:'line',stack:st,symbol:'none',lineStyle:{opacity:0},areaStyle:{opacity:0},data:base,silent:true});
          series.push({name:st+'f',type:'line',stack:st,symbol:'none',lineStyle:{opacity:0},areaStyle:{color:grad},data:delta,silent:true}); };
        bandFill(curve(RR.bq((1+C)/2)),curve(RR.bq((1-C)/2)),0.12,'oB');   // outer = selected confidence interval
        bandFill(curve(RR.bq(0.75)),curve(RR.bq(0.25)),0.30,'iB');         // inner 50% (more solid)
        // median pace line (typical), full month
        const med=new Array(maxN).fill(null); const c50=curve(RR.frac);
        for(let k=1;k<=BD;k++) med[k-1]=Math.round(actual*medShape[k-1]/mBD);
        for(let k=BD;k<=endN;k++) med[k-1]=c50[k-1];
        series.push({name:'Typical pace',type:'line',connectNulls:true,showSymbol:false,lineStyle:{width:1.5,color:'#9fb6cf',type:'dashed'},itemStyle:{color:'#9fb6cf'},data:med});
        // current month actual (bold)
        const a=getSub(PM), act=new Array(maxN).fill(null); for(let k=1;k<=Math.min(BD,a.length);k++) act[k-1]=a[k-1];
        series.push({name:PM+' actual',type:'line',showSymbol:true,symbolSize:6,lineStyle:{width:3.5,color:'#25e0ff'},itemStyle:{color:'#25e0ff'},data:act});
        legendData=[PM+' actual','Typical pace'];
      } else {
        // daily: current-month bars + typical daily line
        const a=getSub(PM), bars=new Array(maxN).fill(null);
        for(let k=1;k<=Math.min(BD,a.length);k++) bars[k-1]= k===1?a[0]:a[k-1]-a[k-2];
        series.push({name:PM+' actual',type:'bar',itemStyle:{color:'#25e0ff'},data:bars});
        const med=new Array(maxN).fill(null); for(let k=1;k<=BD;k++) med[k-1]=Math.round(actual*medShape[k-1]/mBD);
        const c50=curve(RR.frac); for(let k=BD;k<=endN;k++) med[k-1]=c50[k-1];
        const td=new Array(maxN).fill(null); for(let k=1;k<=endN;k++){ const prev=k>1?med[k-2]:0; if(med[k-1]!=null&&prev!=null) td[k-1]=Math.max(0,med[k-1]-prev); }
        series.push({name:'Typical daily',type:'line',smooth:true,showSymbol:false,lineStyle:{width:2,color:'#9fb6cf',type:'dashed'},itemStyle:{color:'#9fb6cf'},data:td});
        legendData=[PM+' actual','Typical daily'];
      }
    } else {
      // no current month selected → plain comparison lines
      selMonths.forEach((m,i)=>{ let arr=getSub(m);
        let data= monthlyMode==='cumulative'? arr.slice(): arr.map((val,k)=>k===0?val:val-arr[k-1]);
        series.push({name:m,type:'line',smooth:true,showSymbol:false,lineStyle:{width:2,color:PALETTE[i%PALETTE.length]},itemStyle:{color:PALETTE[i%PALETTE.length]},data:data});
        legendData.push(m); });
    }
    mkChart(document.getElementById('cmonthly'),{
      backgroundColor:'transparent',
      tooltip:{trigger:'axis', valueFormatter:val=> (val==null?'—':(isD?fmtUSD(val):val))},
      legend:{type:'scroll',top:0,textStyle:{color:'#bfe6f5'},data:legendData},
      grid:{left:72,right:24,top:44,bottom:52},
      xAxis:{type:'category',data:xcats,name:'Business day of month',nameLocation:'middle',nameGap:32,nameTextStyle:{color:'#9fd6ea'},axisLabel:{color:'#8fb8cf'},axisLine:{lineStyle:{color:'#2a4c6a'}}},
      yAxis:{type:'value',axisLabel:{color:'#8fb8cf',formatter:val=>isD?fmtShort(val):val},splitLine:{lineStyle:{color:'#122c42'}}},
      series:series
    });
  } else if(typeof echarts!=='undefined'){ document.getElementById('cmonthly').innerHTML=''; }
  v.insertAdjacentHTML('beforeend','<div class="hint"><b>Merged</b> sums the selected branches and projects '+PM+' — <span style="color:#c9a3ff">purple</span> near the current pace fading to <span style="color:#ff8fa0">red</span> at the top (p10–p90), with a typical-pace reference. <b>Separate</b> draws one line per selected branch (summed over the selected months). X-axis is <b>business-day-of-month</b> so months line up fairly. Projection tiles &amp; confidence recompute for the branches/months you select. Based on source funding dates.</div>');
  if(!resizeHooked){ window.addEventListener('resize',()=>{ chartInstances.forEach(c=>{try{c.resize();}catch(e){}}); }); resizeHooked=true; }
}

/* ---------- Highlight tab (YoY / QoQ by dimension) ---------- */
function renderHighlight(v){
  const isD=highlightMetric==='dollars', mi=isD?0:1;
  const gm=groupMonthly(highlightDim), months=prodMonths();
  const tb=document.createElement('div'); tb.className='toolbar';
  const dimSel=document.createElement('select'); dimSel.className='search'; dimSel.style.minWidth='150px';
  [['division','By Division'],['subdivision','By Sub-division'],['region','By Region'],['area','By Area'],['branch','By Branch']].forEach(([val,lab])=>{
    const o=document.createElement('option'); o.value=val; o.textContent=lab; if(val===highlightDim)o.selected=true; dimSel.appendChild(o); });
  dimSel.onchange=()=>{highlightDim=dimSel.value;renderBody();}; tb.appendChild(dimSel);
  tb.appendChild(segToggle([{v:'dollars',label:'Dollars'},{v:'units',label:'Units'}], highlightMetric, m=>{highlightMetric=m;renderBody();}));
  v.appendChild(tb);
  if(typeof echarts==='undefined' || !months.length){ v.insertAdjacentHTML('beforeend','<div class="empty">No production data.</div>'); return; }

  const years=[...new Set(months.map(m=>m.split('-')[0]))].sort();
  const latestYear=years[years.length-1], prevYear=years[years.length-2];
  const ytdNums=[...new Set(months.filter(m=>m.startsWith(latestYear)).map(m=>m.split('-')[1]))];
  const qmap=monthsByQuarter(months), quarters=Object.keys(qmap).sort();
  const sumM=(mm,list)=>(list||[]).reduce((s,m)=>s+((mm[m]||[0,0])[mi]||0),0);
  const fmtV=n=>isD?fmtShort(n):Math.round(n).toLocaleString();
  const colorFor=(name,i)=> highlightDim==='subdivision'?divColor(name):PALETTE[i%PALETTE.length];
  const parseQ=q=>{const a=q.split('-Q');return [parseInt(a[0],10),parseInt(a[1],10)];};
  const qLabel=q=>{const p=parseQ(q);return 'Q'+p[1]+' '+p[0];};
  const latestMonthNum=parseInt(months[months.length-1].split('-')[1],10);
  const completeQ=quarters.filter(q=>{const p=parseQ(q);return p[0]<parseInt(latestYear,10)||(p[0]==parseInt(latestYear,10)&&p[1]*3<=latestMonthNum);});
  const cmpQ=completeQ[completeQ.length-1]||quarters[quarters.length-1];
  const cp=parseQ(cmpQ), priorSameQ=(cp[0]-1)+'-Q'+cp[1];
  const cmpPrevQ = qmap[priorSameQ]?priorSameQ:(quarters[quarters.indexOf(cmpQ)-1]||null);
  const latestPartial = cmpQ!==quarters[quarters.length-1];
  // custom quarter pickers (3rd comparison)
  if(!quarters.includes(highlightQA)) highlightQA = cmpPrevQ || quarters[Math.max(0,quarters.length-2)];
  if(!quarters.includes(highlightQB)) highlightQB = cmpQ || quarters[quarters.length-1];
  const mkQSel=(selv)=>{ const s=document.createElement('select'); s.className='search'; s.style.minWidth='96px';
    quarters.forEach(q=>{ const o=document.createElement('option'); o.value=q; o.textContent=qLabel(q); if(q===selv)o.selected=true; s.appendChild(o); }); return s; };
  const cmpBox=document.createElement('span'); cmpBox.style.cssText='display:inline-flex;align-items:center;gap:6px;margin-left:8px';
  cmpBox.insertAdjacentHTML('beforeend','<span class="muted" style="font-size:12px">Compare</span>');
  const selA=mkQSel(highlightQA), selB=mkQSel(highlightQB);
  selA.onchange=()=>{highlightQA=selA.value;renderBody();};
  selB.onchange=()=>{highlightQB=selB.value;renderBody();};
  cmpBox.appendChild(selA); cmpBox.insertAdjacentHTML('beforeend','<span class="muted" style="font-size:12px">vs</span>'); cmpBox.appendChild(selB);
  tb.appendChild(cmpBox);
  tb.appendChild(otherToggle());
  const grow=document.createElement('div'); grow.className='grow'; tb.appendChild(grow);
  const save=document.createElement('button'); save.className='good'; save.textContent='💾 Save'; save.onclick=saveToFile; tb.appendChild(save);

  let groups=Object.keys(gm).filter(n=>n!=='Unassigned').map(name=>{ const mm=gm[name];
    const curYTD=ytdNums.reduce((s,mo)=>s+((mm[latestYear+'-'+mo]||[0,0])[mi]||0),0);
    const priorYTD=prevYear?ytdNums.reduce((s,mo)=>s+((mm[prevYear+'-'+mo]||[0,0])[mi]||0),0):0;
    return {name,mm,curYTD,priorYTD,curQ:sumM(mm,qmap[cmpQ]),prvQ:cmpPrevQ?sumM(mm,qmap[cmpPrevQ]):0,
      cA:sumM(mm,qmap[highlightQA]),cB:sumM(mm,qmap[highlightQB])}; })
    .sort((a,b)=>b.curYTD-a.curYTD);

  v.insertAdjacentHTML('beforeend','<div class="hint">Year-over-year compares '+latestYear+' vs '+(prevYear||'—')+' YTD ('+(ytdNums[0]||'')+'–'+(ytdNums[ytdNums.length-1]||'')+'). Quarter = latest complete quarter (<b>'+qLabel(cmpQ)+' vs '+(cmpPrevQ?qLabel(cmpPrevQ):'—')+'</b>). Custom = the two quarters you pick above. Excludes branches unticked on the Data tab.</div>');

  const deltaHTML=(cur,prev)=>{ const p=pctChange(cur,prev); if(p===null)return '<span class="hl-delta flat">— new</span>';
    const up=p>=0; return '<span class="hl-delta '+(up?'up':'down')+'">'+(up?'▲':'▼')+' '+(p>=0?'+':'')+p.toFixed(1)+'%</span>'; };
  const statBlock=(lab,prevLab,prevVal,curLab,curVal)=>'<div class="hl-stat"><div class="hl-lab">'+esc(lab)+'</div>'
    +'<div class="hl-cmp"><span class="hl-yr">'+esc(prevLab)+'</span><span class="hl-amt">'+fmtV(prevVal)+'</span></div>'
    +'<div class="hl-cmp cur"><span class="hl-yr">'+esc(curLab)+'</span><span class="hl-amt">'+fmtV(curVal)+'</span></div>'
    +deltaHTML(curVal,prevVal)+'</div>';

  const cardGroups=groups.slice(0,12);
  const grid=document.createElement('div'); grid.className='hl-grid';
  grid.innerHTML=cardGroups.map((g,i)=>{ const col=colorFor(g.name,i);
    return '<div class="hl-card" style="border-color:'+col+'66;box-shadow:0 0 18px '+col+'22">'
      +'<div class="hl-name" style="color:'+col+'">'+esc(g.name)+'</div>'
      +'<div class="hl-row">'
      +statBlock('Year over Year', (prevYear||'—'), g.priorYTD, latestYear, g.curYTD)
      +statBlock('Quarter', (cmpPrevQ?qLabel(cmpPrevQ):'—'), g.prvQ, qLabel(cmpQ), g.curQ)
      +statBlock('Custom', qLabel(highlightQA), g.cA, qLabel(highlightQB), g.cB)
      +'</div></div>';
  }).join('');
  v.appendChild(grid);
  if(groups.length>cardGroups.length) v.insertAdjacentHTML('beforeend','<div class="hint">Showing top '+cardGroups.length+' of '+groups.length+' by '+latestYear+' YTD. Charts below include the top 10.</div>');

  const chartGroups=groups.slice(0,10);
  // Yearly grouped bar
  const yBox=document.createElement('div'); yBox.className='card chart-box';
  yBox.innerHTML='<div class="chart-title">Year over year — '+(isD?'Dollars':'Units')+'</div><div class="chart-canvas" id="hlY"></div>';
  v.appendChild(yBox);
  mkChart(document.getElementById('hlY'),{
    backgroundColor:'transparent', tooltip:{trigger:'axis',axisPointer:{type:'shadow'},valueFormatter:val=>isD?fmtUSD(val):val},
    legend:{type:'scroll',top:0,textStyle:{color:'#bfe6f5'}}, grid:{left:70,right:20,top:40,bottom:40},
    xAxis:{type:'category',data:years,axisLabel:{color:'#8fb8cf'},axisLine:{lineStyle:{color:'#2a4c6a'}}},
    yAxis:{type:'value',axisLabel:{color:'#8fb8cf',formatter:val=>isD?fmtShort(val):val},splitLine:{lineStyle:{color:'#122c42'}}},
    series:chartGroups.map((g,i)=>({name:g.name,type:'bar',itemStyle:{color:colorFor(g.name,i)},
      data:years.map(y=>Math.round(sumM(g.mm,months.filter(m=>m.startsWith(y)))))}))
  });
  // Quarterly grouped bar
  const lq=quarters[quarters.length-1], pMonth=months[months.length-1];
  const monthFactor = (PROD_RUNRATE && PROD_RUNRATE.month===pMonth) ? (isD?PROD_RUNRATE.factorD:PROD_RUNRATE.factorU) : 1;
  const qBox=document.createElement('div'); qBox.className='card chart-box';
  qBox.innerHTML='<div class="chart-title">Quarterly production — '+(isD?'Dollars':'Units')+(latestPartial?(' · '+qLabel(lq)+' — faded top = '+pMonth+' run-rate'):'')+'</div><div class="chart-canvas" id="hlQ"></div>';
  v.appendChild(qBox);
  const qSeries=[];
  chartGroups.forEach((g,i)=>{ const col=colorFor(g.name,i);
    qSeries.push({name:g.name,type:'bar',stack:'q_'+g.name,emphasis:{focus:'series'},itemStyle:{color:col},
      data:quarters.map(q=>Math.round(sumM(g.mm,qmap[q])))});
    if(latestPartial){
      const pv = g.mm[pMonth]?(isD?g.mm[pMonth][0]:g.mm[pMonth][1]):0;
      qSeries.push({name:g.name+' · run-rate',type:'bar',stack:'q_'+g.name,
        itemStyle:{color:col,opacity:0.28,borderColor:col,borderWidth:1,borderType:'dashed'},
        data:quarters.map(q=> q===lq? Math.round(pv*(monthFactor-1)) : 0)});
    }
  });
  mkChart(document.getElementById('hlQ'),{
    backgroundColor:'transparent', tooltip:{trigger:'axis',axisPointer:{type:'shadow'},valueFormatter:val=>isD?fmtUSD(val):val},
    legend:{type:'scroll',top:0,textStyle:{color:'#bfe6f5'},data:chartGroups.map(g=>g.name)}, grid:{left:70,right:20,top:40,bottom:55},
    xAxis:{type:'category',data:quarters,axisLabel:{color:'#8fb8cf',rotate:45},axisLine:{lineStyle:{color:'#2a4c6a'}}},
    yAxis:{type:'value',axisLabel:{color:'#8fb8cf',formatter:val=>isD?fmtShort(val):val},splitLine:{lineStyle:{color:'#122c42'}}},
    series:qSeries
  });
  if(!resizeHooked){ window.addEventListener('resize',()=>{ chartInstances.forEach(c=>{try{c.resize();}catch(e){}}); }); resizeHooked=true; }
}

/* ---------- Org Builder (drag & drop) ---------- */
function newBranch(){ return {id:uid('b'),orgid:'',name:'New Branch',manager:'',status:'Active',regionPending:'',
  processors:[],loas:[],servicedBy:[],roster:[],areaId:null,regionId:null}; }

let drag=null;
const collapsed=new Set();   // ids of collapsed builder cards (UI state)
function clearDrag(){ drag=null; document.querySelectorAll('.drop-hover').forEach(x=>x.classList.remove('drop-hover')); }
function draggable(el,kind,id){
  el.setAttribute('draggable','true');
  el.addEventListener('dragstart',e=>{drag={kind,id}; e.dataTransfer.effectAllowed='move';
    try{e.dataTransfer.setData('text/plain',kind+':'+id);}catch(_){} e.stopPropagation(); el.classList.add('dragging');});
  el.addEventListener('dragend',()=>{ el.classList.remove('dragging'); clearDrag(); });
}
function dropzone(el,accepts,handler){
  el.addEventListener('dragover',e=>{ if(drag&&accepts.includes(drag.kind)){e.preventDefault();e.dataTransfer.dropEffect='move';el.classList.add('drop-hover');}});
  el.addEventListener('dragleave',e=>{ if(e.target===el) el.classList.remove('drop-hover'); });
  el.addEventListener('drop',e=>{ if(drag&&accepts.includes(drag.kind)){e.preventDefault();e.stopPropagation();
    const d=drag; clearDrag(); handler(d); touch(); renderTabs(); renderBody(); }});
}

function renderBuilder(v){
  // top toolbar (save/load/etc.)
  const tb=document.createElement('div'); tb.className='toolbar';
  tb.insertAdjacentHTML('beforeend','<div style="font-weight:600">Drag a branch onto any Area, Region, or Sub-division (independent tags) · Areas → Regions · Regions → Sub-divisions</div>');
  const grow=document.createElement('div'); grow.className='grow'; tb.appendChild(grow);
  const save=document.createElement('button'); save.className='good'; save.textContent='💾 Save'; save.onclick=saveToFile; tb.appendChild(save);
  v.appendChild(tb);
  v.insertAdjacentHTML('beforeend','<div class="hint">Drag the ⠿ handle (or a chip) between columns. Drop a branch back on the Branches column — or an area/region back on its own column — to detach it. Use “+ New” to create items.</div>');

  const wrap=document.createElement('div'); wrap.className='board-wrap';
  const board=document.createElement('div'); board.className='board';

  /* ----- Column: Branches ----- */
  const c1=colShell('Branches', state.branches.length, '+ New branch', ()=>{
    state.branches.unshift(newBranch()); touch(); renderTabs(); renderBody();
  });
  dropzone(c1.body,['branch'],d=>{ const b=byId(state.branches,d.id); if(b){b.areaId=null;b.regionId=null;b.divisionId=null;} });
  state.branches.filter(b=>!b.archived).forEach(b=>{
    const tag=branchTagLabel(b);
    const it=document.createElement('div'); it.className='item';
    it.innerHTML='<span>'+esc(b.name||'(unnamed)')+'</span>'+(tag?'<span class="meta">'+esc(tag)+'</span>':'');
    draggable(it,'branch',b.id); c1.body.appendChild(it);
  });
  board.appendChild(c1.col);

  /* ----- Column: Areas ----- */
  const c2=colShell('Areas', state.areas.length, '+ New area', ()=>{
    state.areas.unshift({id:uid('a'),name:'New Area',manager:'',regionId:null}); touch(); renderTabs(); renderBody();
  });
  dropzone(c2.body,['area'],d=>{ const a=byId(state.areas,d.id); if(a)a.regionId=null; });
  if(!state.areas.length) c2.body.insertAdjacentHTML('beforeend','<div class="empty-hint">No areas yet — click “+ New area”.</div>');
  state.areas.forEach(a=>{
    const r=byId(state.regions,a.regionId);
    const card=ocard('area',a.id,a.name,val=>{a.name=val;touch();}, r?('▸ '+r.name):'no region', ()=>{
      confirmDialog('Delete area?','Branches in it will move back to unassigned.',()=>{
        state.branches.forEach(b=>{if(b.areaId===a.id){b.areaId=null;}});
        state.areas=state.areas.filter(x=>x.id!==a.id); touch(); renderTabs(); renderBody();});
    });
    const kids=card.querySelector('.kids');
    const mine=state.branches.filter(b=>!b.archived&&b.areaId===a.id);
    if(!mine.length) kids.insertAdjacentHTML('beforeend','<div class="empty-hint">drop branches here</div>');
    mine.forEach(b=>kids.appendChild(childChip('branch',b.id,b.name,()=>{b.areaId=null;touch();renderTabs();renderBody();})));
    dropzone(card,['branch'],d=>{ const b=byId(state.branches,d.id); if(b){b.areaId=a.id;} });
    c2.body.appendChild(card);
  });
  board.appendChild(c2.col);

  /* ----- Column: Regions ----- */
  const c3=colShell('Regions', state.regions.length, '+ New region', ()=>{
    state.regions.unshift({id:uid('r'),name:'New Region',manager:'',divisionId:null}); touch(); renderTabs(); renderBody();
  });
  dropzone(c3.body,['region'],d=>{ const r=byId(state.regions,d.id); if(r)r.divisionId=null; });
  if(!state.regions.length) c3.body.insertAdjacentHTML('beforeend','<div class="empty-hint">No regions yet — click “+ New region”.</div>');
  state.regions.forEach(r=>{
    const div=byId(state.divisions,r.divisionId);
    const card=ocard('region',r.id,r.name,val=>{r.name=val;touch();}, div?('▸ '+div.name):'no division', ()=>{
      confirmDialog('Delete region?','Its areas and branches will become unassigned.',()=>{
        state.areas.forEach(a=>{if(a.regionId===r.id)a.regionId=null;});
        state.branches.forEach(b=>{if(b.regionId===r.id)b.regionId=null;});
        state.regions=state.regions.filter(x=>x.id!==r.id); touch(); renderTabs(); renderBody();});
    });
    const kids=card.querySelector('.kids');
    const areas=state.areas.filter(a=>a.regionId===r.id);
    const regionBranches=state.branches.filter(b=>!b.archived&&b.regionId===r.id);
    if(!areas.length&&!regionBranches.length) kids.insertAdjacentHTML('beforeend','<div class="empty-hint">drop areas or branches here</div>');
    areas.forEach(a=>kids.appendChild(childChip('area',a.id,'▤ '+a.name,()=>{a.regionId=null;touch();renderTabs();renderBody();})));
    regionBranches.forEach(b=>kids.appendChild(childChip('branch',b.id,b.name,()=>{b.regionId=null;touch();renderTabs();renderBody();})));
    dropzone(card,['area','branch'],d=>{
      if(d.kind==='area'){ const a=byId(state.areas,d.id); if(a)a.regionId=r.id; }
      else { const b=byId(state.branches,d.id); if(b){b.regionId=r.id;} }
    });
    c3.body.appendChild(card);
  });
  board.appendChild(c3.col);

  /* ----- Column: Divisions ----- */
  const c4=colShell('Sub-divisions', state.divisions.length, '+ New subdivision', ()=>{
    state.divisions.unshift({id:uid('d'),name:'New Sub-division',manager:'',parentId:(state.superDivisions[0]?state.superDivisions[0].id:null)}); touch(); renderTabs(); renderBody();
  });
  if(!state.divisions.length) c4.body.insertAdjacentHTML('beforeend','<div class="empty-hint">No divisions yet — click “+ New division”.</div>');
  state.divisions.forEach(dv=>{
    const card=ocard('division',dv.id,dv.name,val=>{dv.name=val;touch();}, null, ()=>{
      confirmDialog('Delete division?','Its regions will become unassigned.',()=>{
        state.regions.forEach(r=>{if(r.divisionId===dv.id)r.divisionId=null;});
        state.divisions=state.divisions.filter(x=>x.id!==dv.id); touch(); renderTabs(); renderBody();});
    });
    const kids=card.querySelector('.kids');
    const regions=state.regions.filter(r=>r.divisionId===dv.id);
    const divBranches=state.branches.filter(b=>!b.archived&&b.divisionId===dv.id);
    if(!regions.length&&!divBranches.length) kids.insertAdjacentHTML('beforeend','<div class="empty-hint">drop regions or branches here</div>');
    regions.forEach(r=>kids.appendChild(childChip('region',r.id,'◈ '+r.name,()=>{r.divisionId=null;touch();renderTabs();renderBody();})));
    divBranches.forEach(b=>kids.appendChild(childChip('branch',b.id,b.name,()=>{b.divisionId=null;touch();renderTabs();renderBody();})));
    dropzone(card,['region','branch'],d=>{
      if(d.kind==='region'){ const r=byId(state.regions,d.id); if(r)r.divisionId=dv.id; }
      else { const b=byId(state.branches,d.id); if(b){b.divisionId=dv.id;} }
    });
    c4.body.appendChild(card);
  });
  board.appendChild(c4.col);

  wrap.appendChild(board); v.appendChild(wrap);
}
function colShell(title,count,addLabel,onAdd){
  const col=document.createElement('div'); col.className='col';
  const head=document.createElement('div'); head.className='col-head';
  head.innerHTML='<span class="col-title">'+esc(title)+'</span><span class="count">'+count+'</span><span class="grow"></span>';
  const add=document.createElement('button'); add.className='sm primary'; add.textContent=addLabel; add.onclick=onAdd; head.appendChild(add);
  const body=document.createElement('div'); body.className='col-body';
  col.appendChild(head); col.appendChild(body);
  return {col,body};
}
function teamClass(name){ const n=(name||'').toLowerCase(); if(n.includes('red'))return ' team-red'; if(n.includes('blue'))return ' team-blue'; return ''; }
function ocard(kind,id,name,onName,parentTag,onDelete){
  const card=document.createElement('div'); card.className='ocard'+(kind==='division'?teamClass(name):'');
  const isCol=collapsed.has(id);
  const head=document.createElement('div'); head.className='ocard-head';
  const caret=document.createElement('span'); caret.className='ocaret'; caret.textContent=isCol?'▸':'▾'; caret.title='Collapse / expand';
  head.appendChild(caret);
  if(kind!=='division'){ const grip=document.createElement('span'); grip.className='grip'; grip.textContent='⠿'; grip.title='Drag to move';
    draggable(grip,kind,id); head.appendChild(grip); }
  const inp=document.createElement('input'); inp.value=name; inp.oninput=()=>onName(inp.value); head.appendChild(inp);
  const del=document.createElement('button'); del.className='sm danger'; del.textContent='×'; del.title='Delete'; del.onclick=onDelete; head.appendChild(del);
  card.appendChild(head);
  if(parentTag){ const t=document.createElement('div'); t.className='parent-tag'; t.textContent=parentTag; if(isCol)t.style.display='none'; card.appendChild(t); }
  const kids=document.createElement('div'); kids.className='kids'; if(isCol)kids.style.display='none'; card.appendChild(kids);
  caret.onclick=()=>{ const now=!collapsed.has(id); if(now)collapsed.add(id); else collapsed.delete(id);
    kids.style.display=now?'none':''; const pt=card.querySelector('.parent-tag'); if(pt)pt.style.display=now?'none':'';
    caret.textContent=now?'▸':'▾'; };
  return card;
}
function childChip(kind,id,label,onRemove){
  const c=document.createElement('div'); c.className='chip-sm';
  const s=document.createElement('span'); s.textContent=label; c.appendChild(s);
  const x=document.createElement('button'); x.textContent='×'; x.title='Detach'; x.onclick=e=>{e.stopPropagation();onRemove();}; c.appendChild(x);
  draggable(c,kind,id); return c;
}

/* ---------- Hierarchy ---------- */
function renderHierarchy(v){
  v.appendChild(toolbar(null,null,false));
  const wrap=document.createElement('div'); wrap.className='card'; wrap.style.padding='14px 12px';
  const tree=document.createElement('div'); tree.className='tree';
  const mkNode=(cls,label,tag)=>'<div class="node '+cls+'"><div class="row"><span class="caret">•</span><span class="lbl">'+esc(label)+'</span>'+(tag?'<span class="tag">'+esc(tag)+'</span>':'')+'</div>';
  const subNode=(d)=>{
    let s=mkNode('lvl-div',d.name,(d.manager?('mgr '+d.manager+' · '):'')+branchCountForDivision(d.id)+' branches')+'<div class="kids">';
    state.regions.filter(r=>r.divisionId===d.id).forEach(r=>{
      s+=mkNode('lvl-reg',r.name,(r.manager?('mgr '+r.manager+' · '):'')+branchCountForRegion(r.id)+' branches')+'<div class="kids">';
      state.areas.filter(a=>a.regionId===r.id).forEach(a=>{
        const abs=state.branches.filter(b=>!b.archived&&b.areaId===a.id);
        s+=mkNode('lvl-area',a.name,(a.manager?('mgr '+a.manager+' · '):'')+abs.length+' branches')+'<div class="kids">'+
          abs.map(b=>mkNode('lvl-branch',(b.orgid?b.orgid+' · ':'')+b.name,b.status)+'</div>').join('')+'</div>';
      });
      state.branches.filter(b=>!b.archived&&!b.areaId&&b.regionId===r.id).forEach(b=>{s+=mkNode('lvl-branch',(b.orgid?b.orgid+' · ':'')+b.name,b.status)+'</div>';});
      s+='</div></div>';
    });
    state.branches.filter(b=>!b.archived&&b.divisionId===d.id&&!b.regionId&&!b.areaId).forEach(b=>{s+=mkNode('lvl-branch',(b.orgid?b.orgid+' · ':'')+b.name,b.status)+'</div>';});
    s+='</div></div>'; return s;
  };
  let h='';
  state.superDivisions.forEach(sd=>{
    h+=mkNode('lvl-super',sd.name,(sd.manager?('mgr '+sd.manager+' · '):'')+branchCountForSuperDivision(sd.id)+' branches')+'<div class="kids">';
    const subs=subdivisionsOf(sd.id);
    if(subs.length) subs.forEach(d=>h+=subNode(d)); else h+='<div class="empty-hint">no sub-divisions</div>';
    h+='</div></div>';
  });
  state.divisions.filter(d=>!d.parentId||!byId(state.superDivisions,d.parentId)).forEach(d=>{ h+=subNode(d); });
  const orphanRegions=state.regions.filter(r=>!r.divisionId);
  const orphanBranches=state.branches.filter(b=>!b.archived&&!branchHasTag(b));
  if(orphanRegions.length||orphanBranches.length){
    h+=mkNode('lvl-div','Unassigned','')+'<div class="kids">';
    orphanRegions.forEach(r=>{h+=mkNode('lvl-reg',r.name+' (no division)',branchCountForRegion(r.id)+' branches')+'</div>';});
    orphanBranches.forEach(b=>{h+=mkNode('lvl-branch',(b.orgid?b.orgid+' · ':'')+b.name+' (no region)',b.status)+'</div>';});
    h+='</div></div>';
  }
  tree.innerHTML=h||'<div class="empty">Nothing to show.</div>';
  wrap.appendChild(tree); v.appendChild(wrap);
  tree.querySelectorAll('.caret').forEach(c=>{c.onclick=()=>{const kids=c.closest('.node').querySelector('.kids');
    if(!kids)return; const hidden=kids.style.display==='none'; kids.style.display=hidden?'':'none'; c.textContent=hidden?'•':'▸';};});
}
/* hierarchy styles injected */
const st=document.createElement('style'); st.textContent=`
.tree{font-size:13px}.node{padding:2px 0}.node .row{display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:8px}
.node .row:hover{background:var(--hover)}.caret{width:16px;text-align:center;color:var(--muted);cursor:pointer;user-select:none}
.lbl{font-weight:600}.kids{margin-left:22px;border-left:1px dashed var(--line);padding-left:8px}
.tag{font-size:11px;color:var(--muted);background:var(--chip);border-radius:6px;padding:1px 7px}
.lvl-super>.row>.lbl{color:#eaffff;font-weight:700;text-shadow:0 0 9px rgba(37,224,255,.45)}
.lvl-div>.row>.lbl{color:#93c5fd}.lvl-reg>.row>.lbl{color:#86efac}.lvl-area>.row>.lbl{color:#fbcfe8}
.lvl-branch>.row>.lbl{color:var(--ink);font-weight:500}
/* org builder */
.board-wrap{overflow-x:auto;padding-bottom:8px}
.board{display:grid;grid-template-columns:repeat(4,minmax(240px,1fr));gap:14px;align-items:start;min-width:1000px}
.col{background:var(--panel2);border:1px solid var(--line);border-radius:12px;display:flex;flex-direction:column;max-height:74vh}
.col-head{padding:9px 12px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:8px;
  position:sticky;top:0;background:var(--panel2);border-radius:12px 12px 0 0;z-index:2}
.col-title{font-weight:650;font-size:13px}
.col-head .count{font-size:11px;color:var(--muted);background:var(--chip);border-radius:20px;padding:1px 7px}
.col-body{padding:10px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;min-height:60px}
.col.drop-hover,.col-body.drop-hover{outline:2px dashed var(--accent);outline-offset:-4px;border-radius:12px}
.item{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:8px 10px;cursor:grab;
  font-size:13px;display:flex;justify-content:space-between;align-items:center;gap:8px}
.item:hover{border-color:#33477a}.item:active{cursor:grabbing}
.item.unassigned{border-left:3px solid #f59e0b}
.item .meta{font-size:11px;color:var(--muted);white-space:nowrap}
.item.dragging,.chip-sm.dragging{opacity:.4}
.ocard{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:9px}
.ocard.drop-hover{border-color:var(--accent);box-shadow:0 0 0 2px rgba(59,130,246,.35)}
.ocard-head{display:flex;align-items:center;gap:6px}
.grip{cursor:grab;color:var(--muted);user-select:none;padding:0 2px}
.grip:active{cursor:grabbing}
.ocard-head input{flex:1;background:transparent;border:1px solid transparent;color:var(--ink);font-weight:600;
  padding:4px 6px;border-radius:6px;font:inherit}
.ocard-head input:hover,.ocard-head input:focus{border-color:var(--line);background:var(--panel2);outline:none}
.parent-tag{font-size:11px;color:var(--muted);margin:3px 2px 0}
.ocard .kids{margin-top:7px;display:flex;flex-direction:column;gap:5px;min-height:24px}
.empty-hint{font-size:11px;color:var(--muted);padding:7px;text-align:center;border:1px dashed var(--line);border-radius:6px}
.chip-sm{background:var(--chip);border:1px solid var(--line);border-radius:6px;padding:4px 6px 4px 9px;font-size:12px;
  cursor:grab;display:flex;justify-content:space-between;align-items:center;gap:6px}
.chip-sm:active{cursor:grabbing}
.chip-sm button{border:none;background:transparent;color:var(--muted);font-size:14px;line-height:1;padding:0 2px}
.chip-sm button:hover{color:var(--danger)}
.tbl-center th,.tbl-center td{text-align:center}
table.emp tr.filt-row th{padding:4px 6px;background:var(--panel2);position:sticky;top:0}
table.emp tr.filt-row .colf{width:100%;background:var(--panel);border:1px solid var(--line);color:var(--ink);border-radius:6px;padding:4px 7px;font:inherit;font-size:12px}
table.emp tr.filt-row .colf:focus{outline:none;border-color:var(--accent)}
table.emp tr.filt-row select.colf{text-align:center;text-align-last:center}
.tbl-center th.sortable{cursor:pointer;user-select:none;white-space:nowrap}
.tbl-center th.sortable:hover{color:var(--accent)}
.sort-arrow{opacity:.35;font-size:9px;margin-left:4px}
.sort-arrow.on{opacity:1;color:var(--accent)}
/* segmented toggle */
.seg{display:inline-flex;border:1px solid var(--line);border-radius:9px;overflow:hidden;background:var(--panel2)}
.seg-btn{border:none;border-radius:0;background:transparent;color:var(--muted);padding:7px 16px}
.seg-btn:hover{background:var(--hover);color:var(--ink)}
.seg-btn.on{background:rgba(37,224,255,.16);color:#aef1ff;box-shadow:0 0 12px rgba(37,224,255,.25) inset}
.mchips{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.mchip{background:var(--panel2);border:1px solid var(--line);border-radius:20px;padding:5px 11px;font-size:12px;color:var(--muted);cursor:pointer;font-variant-numeric:tabular-nums}
.mchip:hover{border-color:#33477a;color:var(--ink)}
.mchip.on{background:rgba(37,224,255,.16);border-color:rgba(37,224,255,.5);color:#aef1ff}
/* KPI tiles */
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:18px}
.kpi{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:20px 22px;box-shadow:0 0 0 1px rgba(37,224,255,.05)}
.k-val{font-size:30px;font-weight:700;color:#aef1ff;text-shadow:0 0 12px rgba(37,224,255,.35);font-variant-numeric:tabular-nums;line-height:1.1}
.k-lab{font-size:12px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-top:6px}
.k-sub{font-size:12px;color:var(--muted);margin-top:3px}
/* chart boxes */
.chart-box{margin-bottom:14px;padding:12px 16px}
.chart-title{font-size:13px;font-weight:600;color:#cdeefe;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px}
.chart-canvas{width:100%;height:250px}
.chart-box.tall .chart-canvas{height:340px}
/* production pivot */
.pivot-wrap{overflow-x:auto}
table.pivot{border-collapse:separate;border-spacing:0;font-size:12px;min-width:100%}
table.pivot th,table.pivot td{border-bottom:1px solid var(--line);border-right:1px solid var(--line);padding:5px 8px;text-align:center;white-space:nowrap}
table.pivot thead th{position:sticky;top:0;background:var(--panel2);color:#8fd4ea;z-index:3}
table.pivot .stick{position:sticky;background:var(--panel2);z-index:2;text-align:left}
table.pivot .s0{left:0;min-width:150px}
table.pivot .s1{left:150px;min-width:78px}
table.pivot thead .s0{z-index:5} table.pivot thead .s1{z-index:5}
table.pivot .bname{font-weight:600;color:#cdeefe}
table.pivot tbody tr:hover td{background:var(--hover)}
table.pivot input.cell{width:82px;background:transparent;border:1px solid transparent;color:var(--ink);text-align:right;padding:3px 5px;border-radius:5px;font:inherit;font-variant-numeric:tabular-nums}
table.pivot input.cell:hover{border-color:var(--line)}
table.pivot input.cell:focus{outline:none;border-color:var(--accent);background:var(--panel2)}
table.pivot .tot{color:#aef1ff;font-weight:600;background:rgba(37,224,255,.05)}
table.pivot tfoot td{position:sticky;bottom:0;background:var(--panel2);color:#aef1ff;font-weight:700;border-top:1px solid var(--accent)}
table.pivot tfoot .stick{z-index:4}
table.pivot .s-inc{left:0;min-width:78px;text-align:center}
table.pivot .s0{left:78px}
table.pivot .s1{left:228px}
table.pivot tr.excluded{opacity:.42}
table.pivot input.incchk{width:16px;height:16px;accent-color:var(--accent);cursor:pointer}
/* tenure grid sticky columns + dual-metric cells */
table.pivot.tn .tn-r{left:0;min-width:34px;text-align:center}
table.pivot.tn .tn0{left:34px;min-width:150px}
table.pivot.tn .tn1{left:184px;min-width:72px}
table.pivot.tn thead .tn-r,table.pivot.tn thead .tn0,table.pivot.tn thead .tn1{z-index:5}
table.pivot.tn td,table.pivot.tn th{text-align:center}
table.pivot.tn .stick{text-align:left}
table.pivot.tn .t-d{color:#aef1ff;font-weight:600;font-variant-numeric:tabular-nums}
table.pivot.tn .t-u{color:#8fb8cf;font-size:10.5px;font-variant-numeric:tabular-nums;margin-top:1px}
table.pivot.tn .t-since{color:#7cf6ff;font-variant-numeric:tabular-nums}
table.pivot.tn td.t-first{box-shadow:inset 0 0 0 1px var(--accent);border-radius:4px;background:rgba(37,224,255,.06)}
table.pivot.tn tfoot .t-d{color:#eaf7ff} table.pivot.tn tfoot .t-u{color:#aef1ff}
/* credit report analysis tab */
.tn-li .cr-amt{color:#aef1ff}
.cr-ops{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-bottom:12px}
.cr-ops-h{font-size:12.5px;font-weight:700;color:#8fd4ea;margin-bottom:6px}
table.cr-optbl{width:100%;border-collapse:collapse;font-size:11.5px;font-variant-numeric:tabular-nums}
table.cr-optbl th{text-align:right;color:#8fb8cf;font-weight:600;padding:4px 8px;border-bottom:1px solid var(--line)}
table.cr-optbl th:first-child,table.cr-optbl th:last-child{text-align:left}
table.cr-optbl td{padding:4px 8px;border-bottom:1px solid var(--line);text-align:right}
table.cr-optbl td:first-child,table.cr-optbl td:last-child{text-align:left}
table.cr-optbl td.cr-op{color:#cdeefe;font-weight:600}
table.cr-optbl tr.foreign{background:rgba(255,209,102,.07)}
table.cr-optbl tr.unknown{background:rgba(255,59,82,.08)}
.cr-tag{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.3px;border-radius:4px;padding:1px 5px;margin-left:4px}
.cr-tag.foreign{background:rgba(255,209,102,.2);color:#ffd166}
.cr-tag.unknown{background:rgba(255,59,82,.2);color:#ff6b7d}
.cr-bar{display:flex;gap:8px;margin-bottom:10px}
.cr-bar .sm{padding:4px 10px;font-size:12px}
.cr-loans{max-height:72vh;overflow-y:auto;padding-right:4px}
.cr-loan{flex:0 0 auto;background:var(--panel);border:1px solid var(--line);border-radius:9px;overflow:hidden;margin-bottom:6px}
.cr-lhead{display:grid;grid-template-columns:16px 130px 1fr 78px 92px 78px 92px;align-items:center;gap:10px;padding:8px 12px;cursor:pointer;font-size:12.5px;font-variant-numeric:tabular-nums}
.cr-lhead:hover{background:var(--hover)}
.cr-tw{color:var(--muted);transition:transform .15s}
.cr-loan.open .cr-tw{transform:rotate(90deg)}
.cr-ref{color:#8fd4ea;font-weight:600}
.cr-bor{color:#cdeefe;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cr-cnt{color:var(--muted);text-align:right;font-size:11px}
.cr-lhead .cr-ch{color:#eaf7ff;text-align:right}
.cr-lhead .cr-crd{color:#7cf6ff;text-align:right}
.cr-lhead .cr-net{color:#aef1ff;font-weight:700;text-align:right}
.cr-lbody{display:none;border-top:1px solid var(--line);background:var(--panel2)}
.cr-loan.open .cr-lbody{display:block}
table.cr-items{width:100%;border-collapse:collapse;font-size:11.5px}
table.cr-items th{text-align:left;color:#8fb8cf;font-weight:600;padding:5px 12px;border-bottom:1px solid var(--line)}
table.cr-items th:nth-child(3),table.cr-items th:nth-child(4){text-align:right}
table.cr-items td{padding:4px 12px;border-bottom:1px solid var(--line);font-variant-numeric:tabular-nums}
table.cr-items td.cr-desc{color:#cdd9e3;white-space:normal}
table.cr-items td.cr-dt{color:var(--muted);white-space:nowrap}
table.cr-items td.cr-ch{text-align:right;color:#eaf7ff}
table.cr-items td.cr-crd{text-align:right;color:#7cf6ff}
/* branch roster tab */
.rost-layout{display:flex;gap:16px;align-items:flex-start}
.rost-tblwrap{overflow-x:auto;flex:1 1 auto;min-width:0}
.rost-pnl{flex:0 0 300px;position:sticky;top:12px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px}
.pl-head{font-size:15px;font-weight:700;color:#eaf7ff;margin-bottom:10px}
.pl-head .pl-sub{font-size:11px;font-weight:500;color:var(--muted);margin-left:6px}
.pl-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px 10px;margin-bottom:10px}
.pl-f{display:flex;flex-direction:column;gap:2px;font-size:10.5px;color:var(--muted);position:relative}
.pl-f.dim{opacity:.5}
.pl-f input{background:var(--panel2);border:1px solid var(--line);color:var(--ink);border-radius:6px;padding:4px 6px;font:inherit;font-size:12px;text-align:right;font-variant-numeric:tabular-nums}
.pl-f input:focus{outline:none;border-color:var(--accent)}
.pl-f em{position:absolute;right:7px;bottom:5px;font-style:normal;font-size:9px;color:var(--muted);pointer-events:none}
.pl-chk{grid-column:1/3;display:flex;align-items:center;gap:6px;font-size:11px;color:#cdeefe;cursor:pointer}
.pl-chk input{accent-color:var(--accent);width:14px;height:14px}
.pl-basis{font-size:10.5px;color:var(--muted);text-align:center;margin-bottom:8px;font-variant-numeric:tabular-nums}
.pl-rows,.pl-alt{border-top:1px solid var(--line);padding-top:8px}
.pl-r{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:12px;padding:3px 0;color:#cdeefe;font-variant-numeric:tabular-nums}
.pl-r span{color:var(--muted)}
.pl-r b{color:#eaf7ff}
.pl-r b.neg{color:#ff8fa0}
.pl-r.tot{border-top:1px solid var(--line);margin-top:5px;padding-top:7px;font-size:14px;font-weight:700}
.pl-r.tot span{color:#cdeefe}
.pl-r .pos,.pl-r.tot.pos b{color:#4ade80}
.pl-r .negT,.pl-r.tot.negT b{color:#ff6b7d}
.pl-alt{margin-top:8px}
.pl-note{font-size:10px;color:var(--muted);margin-top:4px;line-height:1.4}
@media(max-width:1000px){.rost-layout{flex-direction:column}.rost-pnl{position:static;flex-basis:auto;width:100%;max-width:420px}}
.units-badge{display:inline-flex;align-items:center;gap:5px;background:rgba(37,224,255,.12);border:1px solid var(--accent);color:#aef1ff;border-radius:20px;padding:4px 12px;font-size:12.5px;font-weight:600;white-space:nowrap;font-variant-numeric:tabular-nums}
.units-badge .units-vol{color:#b06bff;font-weight:700}
table.rost{width:auto;min-width:0}
table.rost th,table.rost td{text-align:center;vertical-align:middle;padding-left:10px;padding-right:10px}
table.rost input.rchk{width:17px;height:17px;accent-color:var(--accent);cursor:pointer}
table.rost td.need{background:rgba(255,209,102,.12)}
table.rost select{width:170px;margin:0 auto;display:block;text-align:center;text-align-last:center}
table.rost .link{margin:0 auto}
table.rost input.ralloc{width:90px;background:var(--panel2);border:1px solid var(--line);color:var(--ink);border-radius:6px;padding:5px 8px;text-align:center;font:inherit;font-variant-numeric:tabular-nums}
table.rost input.ralloc:focus{outline:none;border-color:var(--accent)}
/* tenure master-detail (list + charts) */
.tn-split{display:grid;grid-template-columns:300px 1fr;gap:16px;align-items:start}
.tn-list{background:var(--panel);border:1px solid var(--line);border-radius:12px;max-height:72vh;overflow-y:auto}
.tn-li{display:flex;align-items:center;gap:9px;padding:9px 11px;border-bottom:1px solid var(--line);cursor:pointer}
.tn-li:last-child{border-bottom:none}
.tn-li:hover{background:var(--hover)}
.tn-li.sel{background:rgba(37,224,255,.12);box-shadow:inset 3px 0 0 var(--accent)}
.tn-li-rank{font-size:11px;font-weight:700;color:var(--muted);min-width:20px;text-align:right;font-variant-numeric:tabular-nums}
.tn-li-dot{width:9px;height:9px;border-radius:50%;flex:none;box-shadow:0 0 6px currentColor}
.tn-li-main{display:flex;flex-direction:column;gap:2px;min-width:0}
.tn-li-name{font-size:13px;font-weight:600;color:#cdeefe;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tn-li-org{font-size:10px;font-weight:500;color:var(--muted)}
.tn-li-meta{font-size:10.5px;color:var(--muted);font-variant-numeric:tabular-nums}
.tn-li-first{color:#7cf6ff;font-weight:600}
.tn-detail{display:flex;flex-direction:column;gap:14px;min-width:0}
.tn-dhead{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.tn-dot{width:12px;height:12px;border-radius:50%;box-shadow:0 0 8px currentColor}
.tn-dname{font-size:20px;font-weight:700;color:#eaf7ff}
.tn-dmeta{font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}
.tn-dcard{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.tn-dctitle{font-size:13px;font-weight:600;color:#8fd4ea;margin-bottom:4px}
.tn-dcsum{font-size:11px;color:var(--muted);font-weight:500;margin-left:6px}
.tn-dccanvas{height:300px;width:100%}
.tn-mixwrap{display:grid;grid-template-columns:1fr 240px;gap:14px;align-items:center}
.tn-mixpie{height:240px;width:100%}
.tn-mixempty{display:flex;flex-direction:column;justify-content:center;align-items:center;height:100%;color:var(--muted);text-align:center;font-size:12px;line-height:1.5}
.tn-mixform{display:flex;flex-direction:column;gap:8px}
.tn-mixrow{display:grid;grid-template-columns:12px 1fr 66px 34px;align-items:center;gap:8px}
.tn-mixdot{width:11px;height:11px;border-radius:3px}
.tn-mixlab{font-size:12.5px;color:#cdeefe}
.tn-mixinp{background:var(--panel2);border:1px solid var(--line);color:var(--ink);border-radius:6px;padding:4px 7px;text-align:right;font:inherit;font-variant-numeric:tabular-nums}
.tn-mixinp:focus{outline:none;border-color:var(--accent)}
.tn-mixpct{font-size:11px;color:var(--muted);text-align:right;font-variant-numeric:tabular-nums}
.tn-mixhint{font-size:10.5px;color:var(--muted);margin-top:4px;line-height:1.4}
@media(max-width:820px){.tn-split{grid-template-columns:1fr}.tn-list{max-height:280px}.tn-mixwrap{grid-template-columns:1fr}}
/* highlight cards */
.hl-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,660px));gap:16px;margin-bottom:18px;justify-content:center}
.hl-card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:20px 24px}
.hl-name{font-size:19px;font-weight:700;letter-spacing:.4px;margin-bottom:14px;text-shadow:0 0 10px currentColor;text-align:center}
.hl-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
.hl-stat{background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.hl-lab{font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--muted);margin-bottom:7px}
.hl-cmp{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-top:3px}
.hl-cmp .hl-yr{font-size:12px;text-transform:uppercase;letter-spacing:.3px;color:var(--muted)}
.hl-cmp .hl-amt{font-size:16px;color:#cfe8f5;font-variant-numeric:tabular-nums}
.hl-cmp.cur .hl-amt{font-size:23px;font-weight:700;color:#eaf7ff}
.hl-big{font-size:21px;font-weight:700;color:#eaf7ff;font-variant-numeric:tabular-nums;margin:3px 0}
.hl-delta{font-size:13px;font-weight:700;display:inline-block;margin-top:7px}
.hl-delta.up{color:#4ade80} .hl-delta.down{color:#ff6b7d} .hl-delta.flat{color:var(--muted)}
.hl-prev{font-size:11px;color:var(--muted);margin-top:3px}
.proj-tag{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#04121b;background:var(--accent);border-radius:5px;padding:1px 5px;vertical-align:middle}`; document.head.appendChild(st);

window.addEventListener('beforeunload',e=>{ if(dirty){ e.preventDefault(); e.returnValue=''; } });
render();
</script>
