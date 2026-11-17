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
 const card=(l,main,s,icon,cls)=>`<div class='card${cls||''}'><div class='card-icon' aria-hidden='true'><svg viewBox='0 0 24 24'><use href='#${icon}'></use></svg></div><div class='l'>${l}</div><div class='v'>${esc(main)}</div><div class='s'>${s}</div></div>`;
 $('#cards').innerHTML=card('Outstanding',o.main,sub('Sent invoices',o.rest),'iconCreate')+card('Overdue',v.main,sub(n+(n===1?' invoice':' invoices'),v.rest),'iconCompany',n?' warn':'')+card('Paid this month',p.main,sub('Invoices',p.rest),'iconDashboard')+card('Documents',String(st.count),sub('Saved in this browser',[]),'iconLibrary');}

// ---------- Document list ----------
function dashRows(all){
 const q=dFilter.q.trim().toLowerCase(),today=Store.todayStr();
 return all.filter(d=>(!dFilter.type||d.type===dFilter.type)&&(!dFilter.status||Store.effStatus(d,today)===dFilter.status)&&(!q||String(d.no||'').toLowerCase().indexOf(q)>=0||String(d.clientName||'').toLowerCase().indexOf(q)>=0)).sort((a,b)=>b.updatedAt-a.updatedAt);}
const EXPORT_HEADERS=['Number','Type','Client','Date','Due date','Currency','Amount','Status'];
function exportRows(){
 const today=Store.todayStr();
 return dashRows(Store.docs()).map(d=>[
  String(d.no||''),TYPES[d.type]?TYPES[d.type].label:String(d.type||''),String(d.clientName||''),
  String(d.date||''),String(d.due||''),String(d.currency||'MYR'),
  Number.isFinite(Number(d.grand))?Number(d.grand):0,Store.effStatus(d,today)
 ]);}
function exportName(ext){return 'documents-'+Store.todayStr()+'.'+ext;}
function exportExcel(){
 const rows=exportRows(),status=$('#exportStatus');
 if(!rows.length){status.textContent='No matching documents to export.';return;}
 try{
  if(typeof XLSX==='undefined')throw new Error('Spreadsheet writer unavailable');
  const sheet=XLSX.utils.aoa_to_sheet([EXPORT_HEADERS,...rows]);
  sheet['!cols']=[{wch:20},{wch:20},{wch:30},{wch:14},{wch:14},{wch:12},{wch:16},{wch:14}];
  rows.forEach((row,i)=>{const cell=sheet['G'+(i+2)];if(cell)cell.z='#,##0.00';});
  const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,'Documents');
  XLSX.writeFile(book,exportName('xlsx'));
  status.textContent='Excel export started for '+rows.length+(rows.length===1?' document.':' documents.');
 }catch(err){console.error(err);status.textContent='Could not export Excel. Please try again.';}}
async function exportPdf(){
 const rows=exportRows(),status=$('#exportStatus'),button=$('#exportPdf');
 if(!rows.length){status.textContent='No matching documents to export.';return;}
 if(typeof html2pdf==='undefined'){status.textContent='PDF export is unavailable. Please reload and try again.';return;}
 const report=document.createElement('div');
 report.style.cssText='width:760px;padding:24px;font:12px Arial,sans-serif;color:#102044;background:#fff;box-sizing:border-box';
 const header=EXPORT_HEADERS.map(h=>`<th style="padding:8px 6px;text-align:left;border-bottom:2px solid #cddbe5;background:#eff8fc">${esc(h)}</th>`).join('');
 const body=rows.map(row=>`<tr style="break-inside:avoid;page-break-inside:avoid">${row.map((v,i)=>`<td style="padding:8px 6px;border-bottom:1px solid #dfe8f0;vertical-align:top;${i===6?'text-align:right;':''}">${esc(i===6?fmt(v):v)}</td>`).join('')}</tr>`).join('');
 report.innerHTML=`<h1 style="font-size:21px;margin:0 0 6px">Documents</h1><p style="margin:0 0 18px;color:#52647d">Filtered document list · ${esc(Store.todayStr())}</p><table style="width:100%;table-layout:fixed;border-collapse:collapse;overflow-wrap:anywhere"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`;
 button.disabled=true;status.textContent='Preparing PDF…';
 try{
  await html2pdf().set({margin:10,filename:exportName('pdf'),image:{type:'jpeg',quality:.98},html2canvas:{scale:2,backgroundColor:'#ffffff'},jsPDF:{unit:'mm',format:'a4',orientation:'landscape'},pagebreak:{mode:['css','legacy'],avoid:'tr'}}).from(report).save();
  status.textContent='PDF export started for '+rows.length+(rows.length===1?' document.':' documents.');
 }catch(err){console.error(err);status.textContent='Could not export PDF. Please try again.';}
 finally{button.disabled=false;}}
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
  const sel=`<select data-st='${id}' aria-label='Status for ${esc(d.no)}'${L.length<2?' disabled':''}>${L.map(s=>`<option${s===d.status?' selected':''}>${s}</option>`).join('')}</select>`;
  const od=eff==='Overdue'?` <span class='badge Overdue'>Overdue</span>`:'';
  return `<tr class='click' data-id='${id}'><td><button class='doc-open' data-open='${id}'>${esc(d.no)}</button></td><td>${esc(TYPES[d.type]?TYPES[d.type].label:d.type)}</td><td class='doc-client'>${esc(d.clientName||'-')}</td><td>${esc(fmtDate(d.date))}</td><td>${esc(d.due?fmtDate(d.due):'-')}</td><td class='r'>${esc(money2(d.grand,d.currency))}</td><td>${sel}${od}</td><td><div class='acts'><button data-dup='${id}'>Duplicate</button><button class='del' data-del='${id}'>Delete</button></div></td></tr>`;}).join('');
 $('#docList').innerHTML=`<table class='dt'><thead><tr><th scope='col'>No.</th><th scope='col'>Type</th><th scope='col'>Client</th><th scope='col'>Date</th><th scope='col'>Due</th><th scope='col' class='r'>Amount</th><th scope='col'>Status</th><th scope='col'><span class='sr-only'>Actions</span></th></tr></thead><tbody>${tr}</tbody></table>`;}

function bindDashboard(){
 $('#exportPdf').addEventListener('click',exportPdf);
 $('#exportXlsx').addEventListener('click',exportExcel);
 const seg=(sel,key)=>$(sel).addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;dFilter[key]=b.dataset.v;$$(sel+' button').forEach(x=>{x.classList.toggle('on',x===b);x.setAttribute('aria-pressed',String(x===b));});renderDashboard();});
 seg('#fType','type');seg('#fStatus','status');
 $('#dSearch').addEventListener('input',e=>{dFilter.q=e.target.value;renderDashboard();});
 const closeNew=()=>{$('#newMenu').classList.add('hide');$('#btnNew').setAttribute('aria-expanded','false');};
 $('#btnNew').addEventListener('click',e=>{e.stopPropagation();$('#newMenu').classList.toggle('hide');$('#btnNew').setAttribute('aria-expanded',String(!$('#newMenu').classList.contains('hide')));});
 document.addEventListener('click',e=>{if(!e.target.closest('.newwrap'))closeNew();});
 $('#newMenu').addEventListener('click',e=>{const b=e.target.closest('[data-new]');if(!b)return;closeNew();newDocOf(b.dataset.new);});
 const nav=$('#dashboardNavToggle'),closeNav=()=>{document.body.classList.remove('dashboard-nav-open');nav.setAttribute('aria-expanded','false');nav.setAttribute('aria-label','Open navigation');};
 nav.addEventListener('click',()=>{const open=document.body.classList.toggle('dashboard-nav-open');nav.setAttribute('aria-expanded',String(open));nav.setAttribute('aria-label',open?'Close navigation':'Open navigation');});
 $('#dashboardNavBackdrop').addEventListener('click',closeNav);
 $('#sideNav').addEventListener('click',e=>{if(e.target.closest('a'))closeNav();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(document.body.classList.contains('dashboard-nav-open')){closeNav();nav.focus();}closeNew();}});
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
