'use strict';
// Dashboard page, plus new/open/duplicate/delete actions. Loaded last, so it can use store.js, app.js and library.js globals.
const dFilter={type:'',status:'',q:''};
const money2=(n,c)=>(c==='MYR'?'RM':c)+' '+fmt(n);

// ---------- Helpers for opening a document in the editor ----------
function freeNo(type){
 const used=new Set(Store.docs().map(d=>d.no));
 const c=read(KEYS.counters)||{};
 let i=(c[type]||0)+1,no;
 do{no=TYPES[type].prefix+'-'+new Date().getFullYear()+'-'+pad4(i++);}while(used.has(no));
 return no;}
function bumpCounter(type,no){
 const m=/-(\d+)$/.exec(no||'');if(!m)return;
 const c=read(KEYS.counters)||{};c[type]=Math.max(c[type]||0,parseInt(m[1],10));write(KEYS.counters,c);}
function openState(s,msg){
 state=s;write(KEYS.draft,state);
 applyTypeUI();syncForm();renderRows();renderSum();markClean();setStatus(msg);
 goPage('create');}
function openDoc(id){
 const rec=Store.getDoc(id);if(!rec)return;
 const s=merge(defaultState(),Store.clone(rec.snapshot));
 if(!TYPES[s.type])s.type='invoice';
 s.docId=rec.id;s.restored=false;
 openState(s,'Opened '+rec.no);}
function newDocOf(type){
 const T=TYPES[type],s=defaultState(),prof=read(KEYS.profile)||{};
 if(prof.company)merge(s.company,prof.company);
 if(prof.bank)merge(s.bank,prof.bank);
 s.logo=prof.logo||'';
 s.type=type;s.accent=state.accent;
 s.toggles=Object.assign({},state.toggles);s.toggles.signature=type==='quotation';
 s.client={name:'',attn:'',phone:'',email:'',address:''};
 s.items=[{d:'',q:1,p:0}];
 s.notes=T.notes;s.termsText=T.terms;s.nos={};
 s.doc.due=addDays(s.doc.date,T.dueDays);s.doc.no=freeNo(type);
 s.docId='';s.restored=false;
 openState(s,'New '+T.label.toLowerCase());}
function dupDoc(id){
 const src=Store.getDoc(id);if(!src)return;
 const no=freeNo(src.type);
 if(Store.duplicateDoc(id,no))bumpCounter(src.type,no);
 renderDashboard();}
function removeDocUI(id){
 const rec=Store.getDoc(id);if(!rec)return;
 if(!window.confirm('Delete '+rec.no+'? This cannot be undone.'))return;
 Store.removeDoc(id);
 if(state.docId===id){state.docId='';write(KEYS.draft,state);}
 renderDashboard();}

// ---------- Stat cards ----------
function cardAmt(byCur,key){
 const my=byCur.MYR?byCur.MYR[key]:0;
 const rest=Object.keys(byCur).filter(c=>c!=='MYR'&&byCur[c][key]).map(c=>money2(byCur[c][key],c));
 return{main:money2(my,'MYR'),rest:rest};}
function renderCards(all){
 const st=Store.stats(all),b=st.byCur;
 const o=cardAmt(b,'outstanding'),v=cardAmt(b,'overdue'),p=cardAmt(b,'paidMonth');
 const n=Object.keys(b).reduce((a,c)=>a+b[c].overdueCount,0);
 const sub=(lead,rest)=>[lead].concat(rest).map(esc).join('<br>');
 const card=(l,main,s,cls)=>`<div class='card${cls||''}'><div class='l'>${l}</div><div class='v'>${esc(main)}</div><div class='s'>${s}</div></div>`;
 $('#cards').innerHTML=card('Outstanding',o.main,sub('Sent invoices',o.rest))+card('Overdue',v.main,sub(n+(n===1?' invoice':' invoices'),v.rest),n?' warn':'')+card('Paid this month',p.main,sub('Invoices',p.rest))+card('Documents',String(st.count),sub('Saved in this browser',[]));}

// ---------- Document list ----------
function dashRows(all){
 const q=dFilter.q.trim().toLowerCase(),today=Store.todayStr();
 return all.filter(d=>(!dFilter.type||d.type===dFilter.type)&&(!dFilter.status||Store.effStatus(d,today)===dFilter.status)&&(!q||String(d.no||'').toLowerCase().indexOf(q)>=0||String(d.clientName||'').toLowerCase().indexOf(q)>=0)).sort((a,b)=>b.updatedAt-a.updatedAt);}
function renderDashboard(){
 const all=Store.docs(),today=Store.todayStr();
 renderCards(all);
 const rows=dashRows(all);
 if(!rows.length){
  const starters=Object.keys(TYPES).map(t=>`<button class='btn' data-new='${t}'>+ ${esc(TYPES[t].label)}</button>`).join(' ');
  $('#docList').innerHTML=all.length?`<div class='empty'>No documents match these filters.</div>`:`<div class='empty'>No documents yet. Create one, press Save, and it will show up here.<br><br>${starters}</div>`;
  return;}
 const tr=rows.map(d=>{
  const eff=Store.effStatus(d,today),L=Store.statusList(d.type),id=esc(d.id);
  const sel=`<select data-st='${id}'${L.length<2?' disabled':''}>${L.map(s=>`<option${s===d.status?' selected':''}>${s}</option>`).join('')}</select>`;
  const od=eff==='Overdue'?` <span class='badge Overdue'>Overdue</span>`:'';
  return `<tr class='click' data-id='${id}'><td>${esc(d.no)}</td><td>${esc(TYPES[d.type]?TYPES[d.type].label:d.type)}</td><td>${esc(d.clientName||'-')}</td><td>${esc(fmtDate(d.date))}</td><td>${esc(d.due?fmtDate(d.due):'-')}</td><td class='r'>${esc(money2(d.grand,d.currency))}</td><td>${sel}${od}</td><td><div class='acts'><button data-dup='${id}'>Duplicate</button><button class='del' data-del='${id}'>Delete</button></div></td></tr>`;}).join('');
 $('#docList').innerHTML=`<table class='dt'><thead><tr><th>No.</th><th>Type</th><th>Client</th><th>Date</th><th>Due</th><th class='r'>Amount</th><th>Status</th><th></th></tr></thead><tbody>${tr}</tbody></table>`;}

function bindDashboard(){
 const seg=(sel,key)=>$(sel).addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;dFilter[key]=b.dataset.v;$$(sel+' button').forEach(x=>x.classList.toggle('on',x===b));renderDashboard();});
 seg('#fType','type');seg('#fStatus','status');
 $('#dSearch').addEventListener('input',e=>{dFilter.q=e.target.value;renderDashboard();});
 $('#btnNew').addEventListener('click',e=>{e.stopPropagation();$('#newMenu').classList.toggle('hide');});
 document.addEventListener('click',e=>{if(!e.target.closest('.newwrap'))$('#newMenu').classList.add('hide');});
 $('#newMenu').addEventListener('click',e=>{const b=e.target.closest('[data-new]');if(!b)return;$('#newMenu').classList.add('hide');newDocOf(b.dataset.new);});
 $('#docList').addEventListener('change',e=>{const s=e.target.closest('select[data-st]');if(!s)return;Store.setStatus(s.dataset.st,s.value);renderDashboard();});
 $('#docList').addEventListener('click',e=>{
  const nb=e.target.closest('[data-new]');if(nb){newDocOf(nb.dataset.new);return;}
  const dup=e.target.closest('[data-dup]'),del=e.target.closest('[data-del]');
  if(dup){dupDoc(dup.dataset.dup);return;}
  if(del){removeDocUI(del.dataset.del);return;}
  if(e.target.closest('select'))return;
  const tr=e.target.closest('tr[data-id]');if(tr)openDoc(tr.dataset.id);});}

bindDashboard();
startRouter();
if(typeof initAssistant==='function')initAssistant();
