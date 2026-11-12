'use strict';
// Library page, library pickers in the editor and the side drawer. Loaded after store.js and app.js, so it can use their globals.
const LIB_LABEL={clients:'Clients',items:'Items',terms:'Terms'};

// One floating suggestion list shared by every picker. Fixed position, so scroll containers never clip it.
const Pick=(()=>{
 let box=null,cur=null,list=[],cb=null,sel=-1,shownAt=0;
 function mk(){
  if(box)return box;
  box=document.createElement('div');box.className='combo-list';
  box.style.cssText='position:fixed;display:none;z-index:70;right:auto;margin:0;';
  box.addEventListener('mousedown',e=>{e.preventDefault();const b=e.target.closest('[data-pi]');if(b)choose(+b.dataset.pi);});
  document.body.appendChild(box);return box;}
 function hide(){if(box)box.style.display='none';cur=null;list=[];sel=-1;}
 function paint(empty){
  mk().innerHTML=list.length?list.map((x,i)=>{const st=i===sel?'background:#eff4f8':'';return `<button type='button' data-pi='${i}' style='${st}'>${esc(x.label)}${x.sub?`<small>${esc(x.sub)}</small>`:''}</button>`;}).join(''):`<div class='none'>${esc(empty||'No matches')}</div>`;}
 function place(input){
  const r=input.getBoundingClientRect(),b=mk(),w=Math.max(r.width,260);
  b.style.width=w+'px';b.style.left=Math.max(8,Math.min(r.left,window.innerWidth-w-8))+'px';b.style.top=(r.bottom+2)+'px';b.style.maxHeight=Math.max(120,window.innerHeight-r.bottom-16)+'px';}
 function show(input,items,onPick,empty){cur=input;list=items;cb=onPick;sel=-1;paint(empty);place(input);mk().style.display='block';shownAt=Date.now();}
 function choose(i){const x=list[i],f=cb;hide();if(x&&f)f(x);}
 // Delegated: works for inputs that are re-rendered, such as the item rows.
 function bind(root,selector,getItems,onPick,empty){
  const hit=e=>e.target&&e.target.matches&&e.target.matches(selector);
  const open=e=>{if(!hit(e))return;show(e.target,getItems(e.type==='input'?e.target.value:'',e.target),onPick,empty);};
  root.addEventListener('focusin',open);
  root.addEventListener('input',open);
  root.addEventListener('focusout',e=>{if(hit(e))hide();});
  root.addEventListener('keydown',e=>{
   if(!hit(e)||!cur)return;
   if(e.key==='Escape'){hide();return;}
   if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(!list.length)return;sel=(sel+(e.key==='ArrowDown'?1:-1)+list.length)%list.length;paint(empty);return;}
   if(e.key==='Enter'&&sel>=0){e.preventDefault();choose(sel);}});}
 window.addEventListener('resize',hide);
 // Focusing an input can scroll it into view; ignore that scroll so the list is not closed straight away.
 document.addEventListener('scroll',e=>{if(!cur||Date.now()-shownAt<250)return;if(box&&box.contains(e.target))return;hide();},true);
 return{bind:bind,hide:hide};
})();

// Right-hand drawer used for adding and editing library entries.
const Drawer=(()=>{
 let save=null,del=null;
 function close(){$('#drawer').classList.add('hide');$('#drawerBack').classList.add('hide');save=null;del=null;}
 function open(o){
  $('#drawerTitle').textContent=o.title;$('#drawerBody').innerHTML=o.html;
  $('#drawerSave').textContent=o.saveLabel||'Save';
  $('#drawerDel').classList.toggle('hide',!o.onDelete);
  save=o.onSave;del=o.onDelete||null;
  $('#drawer').classList.remove('hide');$('#drawerBack').classList.remove('hide');
  const f=$('#drawerBody input,#drawerBody textarea');if(f)f.focus();}
 function vals(){const out={};$$('#drawerBody [data-f]').forEach(el=>{out[el.dataset.f]=el.value;});return out;}
 function init(){
  $('#drawerClose').addEventListener('click',close);
  $('#drawerCancel').addEventListener('click',close);
  $('#drawerBack').addEventListener('click',close);
  $('#drawerSave').addEventListener('click',()=>{if(save&&save(vals())!==false)close();});
  $('#drawerDel').addEventListener('click',()=>{if(del&&confirm('Delete this entry? This cannot be undone.')&&del()!==false)close();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#drawer').classList.contains('hide'))close();});}
 return{open:open,close:close,init:init};
})();
// ---------- Editor pickers: choosing copies the data into the document, nothing stays linked ----------
function pickMatch(list,q,fields){q=String(q||'').trim().toLowerCase();return list.filter(x=>!q||fields.some(f=>String(x[f]||'').toLowerCase().indexOf(q)>=0)).slice(0,30);}
function bindEditorPickers(){
 Pick.bind($('#clientCombo'),`input[data-k='client.name']`,q=>pickMatch(Store.lib('clients'),q,['name','attn','email']).map(c=>({label:c.name,sub:[c.attn,c.email].filter(Boolean).join(' | '),rec:c})),x=>{
  const c=x.rec;Object.assign(state.client,{name:c.name||'',attn:c.attn||'',phone:c.phone||'',email:c.email||'',address:c.address||''});
  const nm=$(`#form [data-k='client.name']`);if(nm)nm.value=state.client.name;
  syncForm();changed();},'No saved clients yet');
 Pick.bind($('#itemCombo'),'#itemPick',q=>pickMatch(Store.lib('items'),q,['d']).map(i=>({label:i.d,sub:money(i.p),rec:i})),x=>{
  const i=x.rec,blank=state.items.length===1&&!state.items[0].d&&!num(state.items[0].p);
  const it={d:i.d,q:1,p:num(i.p)};
  if(blank)state.items=[it];else state.items.push(it);
  $('#itemPick').value='';renderRows();changed();},'No saved items yet');
 Pick.bind($('#rows'),`textarea[data-f='d']`,(q,el)=>{
  const row=el.closest('.irow'),idx=row?+row.dataset.i:-1;
  return pickMatch(Store.lib('items'),q,['d']).map(i=>({label:i.d,sub:money(i.p),rec:i,idx:idx}));},x=>{
  const it=state.items[x.idx];if(!it)return;
  it.d=x.rec.d;it.p=num(x.rec.p);if(state.type==='receipt')it.q=1;
  renderRows();changed();},'No saved items yet');
 Pick.bind($('#termCombo'),'#termPick',q=>pickMatch(Store.lib('terms').filter(t=>!t.types||!t.types.length||t.types.indexOf(state.type)>=0),q,['name','text']).map(t=>({label:t.name,sub:String(t.text||'').split(NL)[0],rec:t})),x=>{
  state.termsText=x.rec.text||'';$('#termPick').value='';syncForm();changed();},'No saved terms for this document type');
 $('#saveClient').addEventListener('click',()=>{
  const c=state.client;if(!String(c.name||'').trim()){setStatus('Enter a client name first');return;}
  Store.libSave('clients',{name:c.name.trim(),attn:c.attn||'',phone:c.phone||'',email:c.email||'',address:c.address||''});
  setStatus('Client saved to library');});
 $('#saveQuick').addEventListener('click',()=>{
  let n=0;state.items.forEach(it=>{const d=String(it.d||'').trim();if(!d)return;Store.libSave('items',{d:d,p:num(it.p)});n++;});
  setStatus(n?n+(n===1?' item':' items')+' saved to library':'Nothing to save: add a description first');});
 $('#saveTerm').addEventListener('click',()=>{
  const text=String(state.termsText||'').trim();if(!text){setStatus('Write some terms first');return;}
  const name=window.prompt('Template name',TYPES[state.type].label+' terms');if(!name||!name.trim())return;
  const ex=Store.lib('terms').find(t=>String(t.name).toLowerCase()===name.trim().toLowerCase());
  Store.libSave('terms',{id:ex?ex.id:undefined,name:name.trim(),text:text,types:[state.type]});
  setStatus('Terms saved as template');});
}
// ---------- Library page ----------
let libTab='clients';
const LIB_ONE={clients:'client',items:'item',terms:'terms'};
const LIB_EMPTY={
 clients:['Meet your future client library.','Save names, contact details and addresses for quicker document creation.','Add your first client'],
 items:['Build your item library.','Save products and services for quicker document creation.','Add your first item'],
 terms:['Keep your wording close at hand.','Save reusable terms for your documents.','Add your first terms']
};
const LIB_HEAD={clients:['Name','Contact','Phone','Email'],items:['Description','Unit price'],terms:['Name','Applies to','Preview']};
const LIB_FIND={clients:['name','attn','phone','email'],items:['d'],terms:['name','text']};
function libRows(kind,q){q=String(q||'').trim().toLowerCase();return Store.lib(kind).filter(x=>!q||LIB_FIND[kind].some(k=>String(x[k]||'').toLowerCase().indexOf(q)>=0));}
function libCells(kind,x){
 if(kind==='clients')return[x.name,x.attn,x.phone,x.email];
 if(kind==='items')return[x.d,fmt(num(x.p))];
 const ap=x.types&&x.types.length?x.types.map(t=>TYPES[t]?TYPES[t].label:t).join(', '):'All';
 return[x.name,ap,String(x.text||'').split(NL).slice(0,2).join(' / ')];}
function renderLibrary(){
 const kind=libTab,search=$('#libSearch');
 $$('#libTabs button').forEach(b=>{const on=b.dataset.v===kind;b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on));});
 $('#libAdd').textContent='+ Add '+LIB_ONE[kind];
 $('#libTitle').textContent=LIB_LABEL[kind];
 search.placeholder='Search '+kind;search.setAttribute('aria-label','Search '+kind);
 let all;
 try{const raw=localStorage.getItem(Store.K[kind]);all=raw===null?[]:JSON.parse(raw);if(!Array.isArray(all))throw new Error('Invalid library data');}
 catch(e){$('#libAdd').disabled=true;$('#libList').innerHTML="<div class='library-message' role='alert'><h4>Unable to load this library</h4><p>Check browser storage and try again.</p></div>";return;}
 $('#libAdd').disabled=false;
 const rows=libRows(kind,search.value);
 if(!rows.length){
  if(all.length){$('#libList').innerHTML="<div class='library-message'><h4>No matching results</h4><button class='btn' type='button' data-clear-search>Clear search</button></div>";return;}
  const empty=LIB_EMPTY[kind];
  $('#libList').innerHTML=`<div class='library-empty'><img src='assets/library-collection.png' alt=''><h4>${empty[0]}</h4><p>${empty[1]}</p><button class='btn primary' type='button' data-add='1'>${empty[2]}</button></div>`;return;}
 const th=LIB_HEAD[kind].map((h,i)=>`<th${kind==='items'&&i===1?` class='r'`:''}>${h}</th>`).join('');
 const tr=rows.map(x=>`<tr class='click' data-id='${esc(x.id)}'>${libCells(kind,x).map((c,i)=>`<td class='${(kind==='terms'&&i===2)||(kind==='items'&&i===0)?'wrap':''}${kind==='items'&&i===1?' r':''}'>${esc(c)}</td>`).join('')}<td class='r'><button type='button' class='library-edit' aria-label='Edit ${esc(LIB_ONE[kind])}: ${esc(kind==='items'?x.d:x.name)}'>Edit</button></td></tr>`).join('');
 $('#libList').innerHTML=`<div class='library-table'><table class='dt'><thead><tr>${th}<th><span class='sr-only'>Actions</span></th></tr></thead><tbody>${tr}</tbody></table></div>`;}
function openLibEntry(kind,rec){
 rec=rec||{};
 const L=(l,f,v,t)=>`<label class='f'><span>${l}</span><input data-f='${f}'${t?` type='${t}' step='any' min='0'`:''} value='${esc(v)}'></label>`;
 const A=(l,f,v,r)=>`<label class='f'><span>${l}</span><textarea data-f='${f}' rows='${r||4}'>${esc(v)}</textarea></label>`;
 let html='';
 if(kind==='clients')html=L('Client name','name',rec.name)+L('Attention','attn',rec.attn)+L('Phone','phone',rec.phone)+L('Email','email',rec.email)+A('Address','address',rec.address,3);
 else if(kind==='items')html=L('Description','d',rec.d)+L('Unit price','p',rec.p==null?'':rec.p,'number');
 else{
  const ck=Object.keys(TYPES).filter(t=>t!=='receipt').map(t=>`<label><input type='checkbox' data-ty='${t}'${rec.types&&rec.types.indexOf(t)>=0?' checked':''}> ${esc(TYPES[t].label)}</label>`).join('');
  html=L('Name','name',rec.name)+A('Terms (one per line)','text',rec.text,8)+`<div class='f'><span>Applies to (none ticked = all)</span><div class='chk'>${ck}</div></div>`;}
 Drawer.open({
  title:(rec.id?'Edit ':'Add ')+LIB_ONE[kind],html:html,
  onDelete:rec.id?()=>{if(!Store.libRemove(kind,rec.id)){window.alert('Could not delete this entry. Check browser storage and try again.');return false;}renderLibrary();}:null,
  onSave:v=>{
   const key=kind==='items'?'d':'name';
   const bad=!String(v[key]||'').trim()?key:(kind==='terms'&&!String(v.text||'').trim()?'text':'');
   if(bad){const el=$(`#drawerBody [data-f='${bad}']`);if(el){el.style.borderColor='#b42318';el.focus();}return false;}
   const o=Object.assign({},v);
   ['name','d'].forEach(k=>{if(o[k]!=null)o[k]=String(o[k]).trim();});
   if(kind==='items')o.p=num(v.p);
   if(kind==='terms')o.types=$$('#drawerBody [data-ty]:checked').map(x=>x.dataset.ty);
   if(rec.id)o.id=rec.id;
   if(!Store.libSave(kind,o)){window.alert('Could not save this entry. Check browser storage and try again.');return false;}
   renderLibrary();}});}
function bindLibrary(){
 $('#libTabs').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;libTab=b.dataset.v;$('#libSearch').value='';renderLibrary();});
 $('#libSearch').addEventListener('input',renderLibrary);
 $('#libAdd').addEventListener('click',()=>openLibEntry(libTab,null));
 $('#libList').addEventListener('click',e=>{
  if(e.target.closest('[data-add]')){openLibEntry(libTab,null);return;}
  if(e.target.closest('[data-clear-search]')){$('#libSearch').value='';renderLibrary();$('#libSearch').focus();return;}
  const tr=e.target.closest('tr[data-id]');if(!tr)return;
  const rec=Store.lib(libTab).find(x=>x.id===tr.dataset.id);if(rec)openLibEntry(libTab,rec);});}
// ---------- Page routing, shared by Dashboard, Create and Library ----------
const PAGES=['dashboard','create','library','company'];
let shownPage='';
function curPage(){const h=String(location.hash||'').replace('#/','').replace('#','');return PAGES.indexOf(h)>=0?h:'dashboard';}
function showPage(p){
 document.body.dataset.page=p;
 $$('#sideNav a').forEach(a=>a.classList.toggle('on',a.dataset.page===p));
 Pick.hide();$('#newMenu').classList.add('hide');
 if(p==='create')renderPaper();
 else if(p==='library')renderLibrary();
 else if(p==='company'&&typeof renderCompany==='function')renderCompany();
 else if(typeof renderDashboard==='function')renderDashboard();}
function route(){
 const p=curPage();
 if(shownPage==='create'&&p!=='create'&&isDirty()&&!window.confirm('You have unsaved changes. Leave this page without saving?')){location.hash='#/create';return;}
 shownPage=p;showPage(p);}
function goPage(p){if(curPage()===p){route();return;}location.hash='#/'+p;}
function startRouter(){window.addEventListener('hashchange',route);if(!location.hash)history.replaceState(null,'','#/dashboard');route();}
function initLibrary(){Drawer.init();bindEditorPickers();bindLibrary();renderLibrary();}
initLibrary();
