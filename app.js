'use strict';
const KEYS={draft:'ig.draft.v1',profile:'ig.profile.v1',items:'ig.items.v1',counters:'ig.counters.v1'};
const DEFAULT_LOGO='assets/logo.png';
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const NL=String.fromCharCode(10);
const $=s=>document.querySelector(s);
const $$=s=>Array.from(document.querySelectorAll(s));
const num=v=>{const n=parseFloat(v);return isFinite(n)?n:0;};
const round2=n=>Math.round((n+Number.EPSILON)*100)/100;
const pad=n=>String(n).padStart(2,'0');
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g,'&#39;').split(String.fromCharCode(34)).join('&quot;');}
function ymd(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
function today(){return ymd(new Date());}
function addDays(s,n){const d=new Date(s+'T00:00:00');if(isNaN(d.getTime()))return s;d.setDate(d.getDate()+n);return ymd(d);}
function fmtDate(s){if(!s||s.length!==10)return s||'';const p=s.split('-');return p[2]+'-'+MON[+p[1]-1]+'-'+p[0];}
function read(k){try{return JSON.parse(localStorage.getItem(k));}catch(e){return null;}}
function write(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true;}catch(e){return false;}}
function getPath(o,p){return p.split('.').reduce((a,k)=>a==null?a:a[k],o);}
function setPath(o,p,v){const k=p.split('.');const last=k.pop();k.reduce((a,x)=>a[x],o)[last]=v;}
function merge(a,b){if(!b||typeof b!=='object')return a;Object.keys(b).forEach(k=>{if(b[k]&&typeof b[k]==='object'&&!Array.isArray(b[k])&&a[k]&&typeof a[k]==='object'&&!Array.isArray(a[k]))merge(a[k],b[k]);else a[k]=b[k];});return a;}

const TYPES={
 quotation:{label:'Quotation',prefix:'QT',bill:'Quotation for',no:'Quotation no.',due:'Valid until',total:'TOTAL',dueDays:30,foot:'thanks',notes:'Prices are quoted in Malaysian Ringgit (RM). Production starts after quotation acceptance and deposit payment.',terms:['This quotation is valid for 30 days from the date of issue.','50% deposit is required to confirm the order; balance due upon delivery.','Estimated lead time: 4 to 6 weeks after deposit and artwork approval.','Changes to scope after confirmation may affect price and delivery date.'].join(NL)},
 proforma:{label:'Proforma Invoice',prefix:'PI',bill:'Bill to',no:'Proforma no.',due:'Payment due',total:'AMOUNT DUE',dueDays:7,foot:'thanks',notes:'This is a proforma invoice for payment arrangement only. It is not a tax invoice. A final invoice will be issued after payment is received and goods or services are delivered.',terms:['Production and delivery commence only after full or deposit payment is received.','Please quote the proforma number as the payment reference and send the transfer slip to our email.'].join(NL)},
 invoice:{label:'Invoice',prefix:'INV',bill:'Invoice to',no:'Invoice no.',due:'Due date',total:'BALANCE DUE',dueDays:30,foot:'auto',notes:'Please settle payment on or before the due date. Late payment may be subject to a charge as agreed in the quotation.',terms:['Payment is due within 30 days of the invoice date unless otherwise agreed in writing.','Goods and services remain the property of the company until full payment is received.'].join(NL)},
 receipt:{label:'Receipt',prefix:'RCT',bill:'Received from',no:'Receipt no.',due:'',total:'AMOUNT RECEIVED',dueDays:0,foot:'auto',notes:'Received with thanks. This receipt confirms payment of the amount stated above.',terms:''}
};
const DEFAULT_QUICK=[{d:'Diorama model design and fabrication',p:3500},{d:'Hand-painted figurines',p:45},{d:'Delivery and on-site installation',p:300}];

function nextNo(type){const c=read(KEYS.counters)||{};return TYPES[type].prefix+'-'+new Date().getFullYear()+'-'+pad4((c[type]||0)+1);}
function pad4(n){return String(n).padStart(4,'0');}
function defaultState(){const t=today();return{
 type:'invoice',nos:{},
 company:{name:'YSYD Sdn Bhd',reg:'Co. Reg: 202501031004 (1632416-W)',address:'NO. 181, 1st Floor, Hui Sing Garden Commercial Centre, Taman Hui Sing, 93350, Kuching, Sarawak'},
 logo:'',
 client:{name:'Client Company Sdn Bhd',attn:'',phone:'',email:'client@example.com',address:'Client address line 1, City, State'},
 doc:{no:'',date:t,due:addDays(t,30),payTerms:'Net 30 days',ref:'',method:'Online Transfer',txn:'',currency:'MYR',taxRate:0,discountVal:0,discountType:'amount',deposit:0},
 items:[{d:'Diorama model design and fabrication',q:1,p:3500},{d:'Hand-painted figurines',q:20,p:45},{d:'Delivery and on-site installation',q:1,p:300}],
 notes:TYPES.invoice.notes,termsText:TYPES.invoice.terms,
 bank:{bank:'MAYBANK BERHAD',name:'YSYD SDN BHD',no:''},
 toggles:{logo:true,tax:true,discount:true,payment:true,terms:true,signature:false},
 accent:'#825500',docId:''};}
function loadState(){
 const s=defaultState();const p=read(KEYS.profile);
 if(p){merge(s.company,p.company||{});merge(s.bank,p.bank||{});s.logo=p.logo||'';}
 const d=read(KEYS.draft);if(d)merge(s,d);s.restored=!!d;
 if(!TYPES[s.type])s.type='invoice';
 if(!Array.isArray(s.items)||!s.items.length)s.items=[{d:'',q:1,p:0}];
 if(!s.doc.no)s.doc.no=s.nos[s.type]||nextNo(s.type);
 return s;}

function calc(s){
 const t=s.type;
 const sub=round2(s.items.reduce((a,i)=>a+(t==='receipt'?num(i.p):num(i.q)*num(i.p)),0));
 let disc=0;
 if(t!=='receipt'&&s.toggles.discount){disc=s.doc.discountType==='percent'?sub*num(s.doc.discountVal)/100:num(s.doc.discountVal);disc=round2(Math.min(Math.max(disc,0),sub));}
 const tax=s.toggles.tax?round2((sub-disc)*num(s.doc.taxRate)/100):0;
 const total=round2(sub-disc+tax);
 const paid=t==='invoice'?round2(num(s.doc.deposit)):0;
 const grand=t==='invoice'?round2(total-paid):total;
 return{sub:sub,disc:disc,tax:tax,total:total,paid:paid,grand:grand};}
const rowAmt=it=>state.type==='receipt'?num(it.p):num(it.q)*num(it.p);
function fmt(n){return Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});}
function money(n,cur){cur=cur||state.doc.currency;return (cur==='MYR'?'RM':cur)+' '+fmt(n);}

const ONES=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
const TENS=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
function below1000(n){const h=Math.floor(n/100),r=n%100,out=[];if(h)out.push(ONES[h]+' Hundred');if(r){if(r<20)out.push(ONES[r]);else out.push(TENS[Math.floor(r/10)]+(r%10?'-'+ONES[r%10]:''));}return out.join(' ');}
function intWords(n){if(n===0)return 'Zero';const u=['','Thousand','Million','Billion'],out=[];let i=0;while(n>0&&i<u.length){const c=n%1000;if(c)out.unshift(below1000(c)+(u[i]?' '+u[i]:''));n=Math.floor(n/1000);i++;}return out.join(' ');}
function amountWords(v,cur){const t=Math.round(Math.abs(v)*100),whole=Math.floor(t/100),cents=t%100,myr=cur==='MYR';let s=intWords(whole);if(cents)s+=' and '+intWords(cents)+(myr?' Sen':' Cents');return myr?'Ringgit Malaysia '+s+' Only':s+' '+cur+' Only';}

Store.migrate(TYPES);
let state=loadState();

function syncForm(){
 $$('#form [data-k]').forEach(el=>{if(el===document.activeElement)return;const v=getPath(state,el.dataset.k);el.value=v==null?'':v;});
 $$('#form [data-t]').forEach(el=>{el.checked=!!state.toggles[el.dataset.t];});
 $$('#swatches button').forEach(b=>b.classList.toggle('on',b.dataset.accent===state.accent));
 $('#logoThumb').src=state.logo||DEFAULT_LOGO;}
function applyTypeUI(){
 const t=state.type,T=TYPES[t];
 $$('#docTabs button').forEach(b=>b.classList.toggle('on',b.dataset.type===t));
 $$('#form [data-only]').forEach(el=>el.classList.toggle('hide',el.dataset.only.split(' ').indexOf(t)<0));
 $('#lblDeposit').closest('label').classList.toggle('hide',t!=='invoice');
 $('#billTitle').textContent=T.bill;$('#lblNo').textContent=T.no;$('#lblDue').textContent=T.due||'Due date';
 $('#lblRef').textContent=t==='receipt'?'Invoice no.':'Ref. quotation';
 $('#itemsTitle').textContent=t==='receipt'?'Payment for':'Items';
 if(t==='receipt')selectNotesTab('remarks');
 ['discount','terms'].forEach(k=>$('[data-t='+k+']').closest('.tg').classList.toggle('hide',t==='receipt'));
 document.title=T.label+' - Invoice Generator';}
function renderRows(){
 const rec=state.type==='receipt',head=$('#itemsHead');
 head.className='irow head'+(rec?' single':'');
 head.innerHTML=rec?'<span>Payment for</span><span>Amount paid</span><span></span>':'<span>Description</span><span>Qty</span><span>Price</span><span>Amount</span><span></span>';
 $('#rows').innerHTML=state.items.map((it,i)=>rec
  ?`<div class='irow single' data-i='${i}'><textarea data-f='d' rows='2' aria-label='Payment description' placeholder='Payment for'>${esc(it.d)}</textarea><input data-f='p' aria-label='Amount paid' type='number' min='0' step='any' value='${it.p||''}' placeholder='0.00'><button class='x' data-del='${i}' aria-label='Remove item ${i+1}' title='Remove'>&times;</button></div>`
  :`<div class='irow' data-i='${i}'><textarea data-f='d' rows='2' aria-label='Item ${i+1} description' placeholder='Description'>${esc(it.d)}</textarea><input data-f='q' aria-label='Item ${i+1} quantity' type='number' min='0' step='any' value='${it.q}'><input data-f='p' aria-label='Item ${i+1} unit price' type='number' min='0' step='any' value='${it.p||''}' placeholder='0.00'><span class='amt'>${fmt(rowAmt(it))}</span><button class='x' data-del='${i}' aria-label='Remove item ${i+1}' title='Remove'>&times;</button></div>`).join('');}
function renderChips(){}
function renderSum(){
 const c=calc(state),T=TYPES[state.type];
 const r=(l,v)=>`<div class='r'><span>${l}</span><span>${v}</span></div>`;
 let h=r('Subtotal',money(c.sub));
 if(c.disc>0)h+=r('Discount','- '+money(c.disc));
 if(state.toggles.tax&&num(state.doc.taxRate)>0)h+=r('Tax ('+num(state.doc.taxRate)+'%)',money(c.tax));
 if(c.paid>0)h+=r('Deposit paid','- '+money(c.paid));
 h+=`<div class='g'><span>${T.total}</span><span>${money(c.grand)}</span></div>`;
 $('#sumbar').innerHTML=h;}

let saveTimer=null;
let savedSig='';
function sigNow(){const s=Object.assign({},state);delete s.restored;return JSON.stringify(s);}
function markClean(){savedSig=sigNow();}
function isDirty(){return sigNow()!==savedSig;}
function initClean(){const rec=state.docId?Store.getDoc(state.docId):null;if(rec)savedSig=JSON.stringify(rec.snapshot);else if(state.restored)savedSig='';else markClean();}
function setStatus(m){$('#saveStatus').textContent=m;}
function scheduleSave(){clearTimeout(saveTimer);setStatus('Unsaved changes');saveTimer=setTimeout(()=>saveNow(false),500);}
function commitNo(){const c=read(KEYS.counters)||{};Object.keys(state.nos).forEach(t=>{const m=/^[A-Z]+-\d{4}-(\d+)$/.exec(state.nos[t]||'');if(!m||!TYPES[t])return;const n=parseInt(m[1],10);if(n>(c[t]||0))c[t]=n;});write(KEYS.counters,c);}
function saveNow(manual){
 clearTimeout(saveTimer);state.nos[state.type]=state.doc.no;
 const ok=write(KEYS.draft,state)&&write(KEYS.profile,{company:state.company,bank:state.bank,logo:state.logo});
 let docOk=true;
 if(manual){
  commitNo();
  const id=Store.saveDoc(state,calc(state).grand);
  docOk=!!id;
  if(id){
   state.docId=id;write(KEYS.draft,state);markClean();
   if(typeof GoogleSync!=='undefined'){
    setStatus('Saved locally; syncing...');
    GoogleSync.saveDocument(Store.getDoc(id)).then(r=>{
     if(r.synced)setStatus('Saved and synced');
     else if(r.queued)setStatus('Saved locally; sync queued');
    });
   }
  }
 }
 const d=new Date();
 setStatus(ok&&docOk?(manual?'Saved ':'Auto-saved ')+pad(d.getHours())+':'+pad(d.getMinutes()):'Could not save: browser storage is full');}
function changed(skipPaper){renderSum();if(skipPaper)syncForm();else renderPaper();scheduleSave();}

function setType(t){
 const prev=state.type;if(prev===t||!TYPES[t])return;
 state.nos[prev]=state.doc.no;
 if(!state.doc.due||state.doc.due===addDays(state.doc.date,TYPES[prev].dueDays))state.doc.due=addDays(state.doc.date,TYPES[t].dueDays);
 if(!state.notes||state.notes===TYPES[prev].notes)state.notes=TYPES[t].notes;
 if(!state.termsText||state.termsText===TYPES[prev].terms)state.termsText=TYPES[t].terms;
 if(t==='receipt')state.items.forEach(i=>{i.p=round2(num(i.q)*num(i.p));i.q=1;});
 state.type=t;state.doc.no=state.nos[t]||nextNo(t);
 applyTypeUI();renderRows();syncForm();changed();}

function selectNotesTab(tab){
 const terms=tab==='terms'&&state.type!=='receipt';
 $('#remarksPanel').hidden=terms;$('#termsPanel').hidden=!terms;
 $$('#notesTabs [role=tab]').forEach(b=>{const on=b.dataset.notesTab===(terms?'terms':'remarks');b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;});}
function bind(){
 $('#docTabs').addEventListener('click',e=>{const b=e.target.closest('button');if(b)setType(b.dataset.type);});
 $('#mobTabs').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;document.body.dataset.view=b.dataset.view;$$('#mobTabs button').forEach(x=>{x.classList.toggle('on',x===b);x.setAttribute('aria-pressed',String(x===b));});fitPaper();});
 $('#notesTabs').addEventListener('click',e=>{const b=e.target.closest('[role=tab]');if(b)selectNotesTab(b.dataset.notesTab);});
 $('#notesTabs').addEventListener('keydown',e=>{if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;const b=e.target.closest('[role=tab]');if(!b||state.type==='receipt')return;e.preventDefault();const next=b.dataset.notesTab==='remarks'?'terms':'remarks';selectNotesTab(next);$('#'+next+'Tab').focus();});
 $('#previewZoom').addEventListener('change',fitPaper);
 $('#form').addEventListener('input',e=>{const el=e.target;if(!el.dataset.k)return;let v=el.value;if('num' in el.dataset)v=num(v);setPath(state,el.dataset.k,v);changed();});
 $('#form').addEventListener('change',e=>{const el=e.target;if(el.dataset.t){state.toggles[el.dataset.t]=el.checked;changed();}});
 $('#swatches').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;state.accent=b.dataset.accent;syncForm();changed();});
 $('#rows').addEventListener('input',e=>{const el=e.target,row=el.closest('.irow');if(!row||!el.dataset.f)return;const it=state.items[+row.dataset.i];if(!it)return;it[el.dataset.f]=el.dataset.f==='d'?el.value:num(el.value);if(state.type==='receipt')it.q=1;const a=row.querySelector('.amt');if(a)a.textContent=fmt(rowAmt(it));changed();});
 $('#rows').addEventListener('click',e=>{const b=e.target.closest('[data-del]');if(!b)return;state.items.splice(+b.dataset.del,1);if(!state.items.length)state.items.push({d:'',q:1,p:0});renderRows();changed();});
 $('#addItem').addEventListener('click',()=>{state.items.push({d:'',q:1,p:0});renderRows();changed();const r=$$('#rows .irow'),i=r[r.length-1].querySelector('[data-f=d]');if(i)i.focus();});
 $('#btnLogo').addEventListener('click',()=>$('#logoFile').click());
 $('#logoFile').addEventListener('change',e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{state.logo=String(r.result);syncForm();changed();};r.readAsDataURL(f);e.target.value='';});
 $('#btnLogoReset').addEventListener('click',()=>{state.logo='';syncForm();changed();});
 $('#btnSave').addEventListener('click',()=>saveNow(true));
 window.addEventListener('resize',fitPaper);}

// ---------- Paper (A4 preview) ----------
const CE=(()=>{const d=document.createElement('div');try{d.contentEditable='plaintext-only';}catch(e){}return d.contentEditable==='plaintext-only'?'plaintext-only':'true';})();
let paperDirty=false,paperStale=false;
function ed(k,ph,ml){return `<span class='ed' contenteditable='${CE}' data-k='${k}' data-ph='${esc(ph)}'${ml?` data-ml='1'`:''}>${esc(getPath(state,k))}</span>`;}
function edI(i,f,val,ph){return `<span class='ed' contenteditable='${CE}' data-i='${i}' data-f='${f}' data-ph='${esc(ph)}'>${esc(val)}</span>`;}
function itemDescEd(i,it){const parts=String(it.d||'').split(NL),title=parts.shift()||'';const details=parts.filter(Boolean);return `<span class='ed p-item-desc' contenteditable='${CE}' data-i='${i}' data-f='d' data-ph='${esc('Item description')}'><span class='p-item-title'>${esc(title)}</span>${details.length?`<span class='p-item-details'>${details.map(x=>`<span>${esc(x)}</span>`).join('')}</span>`:''}</span>`;}
function kv(l,v){return `<div class='p-kv'><span class='k'>${l}</span><span class='v'>${v}</span></div>`;}
function curLbl(){return state.doc.currency==='MYR'?'RM':state.doc.currency;}
function rowHtml(it,i){
 const rec=state.type==='receipt';
 const lead=`<td>${i+1}</td><td>${itemDescEd(i,it)}</td>`;
 if(rec)return `<tr>${lead}<td class='r'>${edI(i,'p',fmt(num(it.p)),'0.00')}</td></tr>`;
 return `<tr>${lead}<td class='c'>${edI(i,'q',it.q,'0')}</td><td class='r'>${edI(i,'p',fmt(num(it.p)),'0.00')}</td><td class='r' data-calc='amt:${i}'>${fmt(rowAmt(it))}</td></tr>`;}
function headHtml(){
 const T=TYPES[state.type],long=T.label.length>12;
 const logo=state.toggles.logo?`<img class='p-logo' src='${esc(state.logo||DEFAULT_LOGO)}' alt=''>`:'';
 const ts=long?` style='font-size:12.5px;letter-spacing:.1em'`:'';
 return `<div class='p-note'>Confidential - Strictly Private</div><div class='p-head'>${logo}<div class='p-co'><h1>${ed('company.name','Company name')}</h1><p>${ed('company.reg','Registration no.')}</p><p>${ed('company.address','Company address',1)}</p></div><div class='p-tag'><div class='t'${ts}>${esc(T.label)}</div><div class='n'>${ed('doc.no','Number')}</div></div></div><div class='p-rule'></div>`;}
function panelHtml(){
 const t=state.type,T=TYPES[t],d=state.doc,c=state.client;
 const L=[];
 if(c.attn)L.push(kv('Attention',ed('client.attn','Contact person')));
 L.push(kv('Address',ed('client.address','Client address',1)));
 if(c.email)L.push(kv('Email',ed('client.email','Email')));
 if(c.phone)L.push(kv('Phone',ed('client.phone','Phone')));
 const R=[kv(T.no,ed('doc.no','Number')),kv('Date',esc(fmtDate(d.date)))];
 if(t==='quotation')R.push(kv('Valid until',esc(fmtDate(d.due))));
 if(t==='proforma'){R.push(kv('Payment due',esc(fmtDate(d.due))));if(d.ref)R.push(kv('Ref. quotation',ed('doc.ref','Quotation no.')));}
 if(t==='invoice'){R.push(kv('Due date',esc(fmtDate(d.due))));R.push(kv('Payment terms',ed('doc.payTerms','Payment terms')));if(d.ref)R.push(kv('Ref. quotation',ed('doc.ref','Quotation no.')));}
 if(t==='receipt'&&d.ref)R.push(kv('Invoice no.',ed('doc.ref','Invoice no.')));
 return `<div class='p-panel'><div class='p-pt'>${esc(T.bill)}</div><div class='p-name'>${ed('client.name','Client name')}</div><div class='p-cols'><div>${L.join('')}</div><div>${R.join('')}</div></div></div>`;}
function tableHtml(from,to){
 const rec=state.type==='receipt',cl=esc(curLbl());
 const head=rec?`<tr><th style='width:44px'>No.</th><th>Payment for</th><th class='r' style='width:160px'>Amount (${cl})</th></tr>`:`<tr><th style='width:44px'>No.</th><th>Description</th><th class='c' style='width:60px'>Qty</th><th class='r' style='width:134px'>Unit price (${cl})</th><th class='r' style='width:120px'>Amount (${cl})</th></tr>`;
 let body='';for(let i=from;i<to;i++)body+=rowHtml(state.items[i],i);
 return `<table class='p-t'><thead>${head}</thead><tbody>${body}</tbody></table>`;}
function totRows(c){
 const t=state.type,tg=state.toggles,T=TYPES[t],r=(l,v)=>`<div class='row'><span>${l}</span><span>${v}</span></div>`;
 let h='';
 if(t!=='receipt'){
  h+=r('Subtotal',money(c.sub));
  if(tg.discount)h+=r('Discount','- '+money(c.disc));
  if(tg.tax)h+=r('Tax ('+num(state.doc.taxRate)+'%)',money(c.tax));
  if(t==='invoice')h+=r('Deposit paid','- '+money(c.paid));
 }
 return h+`<div class='row grand'><span>${T.total}</span><span>${money(c.grand)}</span></div>`;}
function bottomHtml(){
 const t=state.type,c=calc(state);
 const stamp=t==='receipt'?`<div class='p-stamp'>PAID</div>`:'';
 return `<div class='p-bottom'><div class='l'><div class='p-lbl'>Remarks</div><div class='p-muted'>${ed('notes','Remarks',1)}</div><div class='p-words'>${esc(amountWords(c.grand,state.doc.currency))}</div>${stamp}</div><div class='p-tot'>${totRows(c)}</div></div>`;}
function sandHtml(){
 const t=state.type,tg=state.toggles,d=state.doc;let h='';
 if(t==='receipt')h+=`<div class='p-sand'><h3>Payment Confirmation</h3>${kv('Method',ed('doc.method','Payment method'))}${d.txn?kv('Transaction no.',ed('doc.txn','Transaction no.')):''}${kv('Date paid',esc(fmtDate(d.date)))}</div>`;
 else if(tg.payment&&t!=='quotation')h+=`<div class='p-sand'><h3>Payment Details</h3>${kv('Bank',ed('bank.bank','Bank'))}${kv('Account name',ed('bank.name','Account name'))}${kv('Account no.',ed('bank.no','0000 0000 0000'))}${kv('Reference',esc(d.no))}</div>`;
 const L=String(state.termsText||'').split(NL).map(x=>x.trim()).filter(Boolean);
 if(t!=='receipt'&&tg.terms&&L.length)h+=`<div class='p-sand'><h3>Terms</h3><ol>${L.map(x=>`<li>${esc(x)}</li>`).join('')}</ol></div>`;
 if(t!=='receipt'&&tg.signature)h+=`<div class='p-sign'><div>Authorised signature<br>${esc(state.company.name)}</div><div>${t==='quotation'?'Accepted by':'Customer acknowledgement'}<br>${esc(state.client.name)}</div></div>`;
 return h;}
function footHtml(){
 const T=TYPES[state.type];
 const left=T.foot==='thanks'?'Thank you for your business with '+esc(state.company.name):'This is a computer generated document. No signature is required.';
 return `<div class='p-foot'><span>${left}</span><span>${esc(T.label)}</span></div>`;}

// Build all pages: measure every row in one tall probe page, then hand whole rows to pages.
function renderPaper(){
 document.documentElement.style.setProperty('--brand',state.accent);
 const paper=$('#paper'),n=state.items.length;
 const H=headHtml(),P=panelHtml(),B=bottomHtml()+sandHtml(),F=footHtml();
 paper.innerHTML=`<div class='page probe'>${H}${P}${tableHtml(0,n)}<div class='tailprobe' style='display:flow-root'>${B}</div>${F}</div>`;
 const pg=paper.firstChild,tb=pg.querySelector('table.p-t'),rule=pg.querySelector('.p-rule'),foot=pg.querySelector('.p-foot'),tail=pg.querySelector('.tailprobe');
 const rowH=Array.from(tb.tBodies[0].rows).map(r=>r.offsetHeight);
 const BUDGET=1123-34-28,footH=foot.offsetHeight+10,theadH=tb.tHead.offsetHeight+10;
 const headFull=tb.offsetTop-34,headMin=rule.offsetTop+rule.offsetHeight+16-34,tailH=tail.offsetHeight;
 const cap1=BUDGET-headFull-theadH-footH,capN=BUDGET-headMin-theadH-footH;
 const pages=[];let cur=[],used=0,cap=cap1;
 rowH.forEach((h,i)=>{if(cur.length&&used+h>cap){pages.push(cur);cur=[];used=0;cap=capN;}cur.push(i);used+=h;});
 pages.push(cur);
 if(used+tailH>cap)pages.push([]);
 let html='';
 pages.forEach((idx,pi)=>{
  let s=pi===0?H+P:H;
  if(idx.length)s+=tableHtml(idx[0],idx[idx.length-1]+1);
  if(pi===pages.length-1)s+=B;
  html+=`<div class='page'>${s+F}</div>`;});
 paper.innerHTML=html;
 $$('#paper .p-logo').forEach(im=>{if(!im.complete)im.addEventListener('load',()=>renderPaper(),{once:true});});
 fitPaper();}
// ---------- Edit on paper, fit, export, init ----------
function refreshCalc(){
 const c=calc(state);
 $$('#paper .p-tot').forEach(t=>{t.innerHTML=totRows(c);});
 $$('#paper .p-words').forEach(w=>{w.textContent=amountWords(c.grand,state.doc.currency);});
 $$('#paper [data-calc]').forEach(td=>{const it=state.items[+td.dataset.calc.split(':')[1]];if(it)td.textContent=fmt(rowAmt(it));});}
function paperEdit(el){
 const txt=el.textContent;
 if(el.dataset.k){
  setPath(state,el.dataset.k,txt);
  $$(`#paper .ed[data-k='${el.dataset.k}']`).forEach(o=>{if(o!==el&&o.textContent!==txt)o.textContent=txt;});
 }else if(el.dataset.i!==undefined){
  const it=state.items[+el.dataset.i];if(!it)return;
  const f=el.dataset.f;
  it[f]=f==='d'?txt:num(txt.split(',').join(''));
  if(state.type==='receipt')it.q=1;
  renderRows();
 }else return;
 paperStale=true;refreshCalc();changed(true);}
function bindPaper(){
 const P=$('#paper');
 P.addEventListener('input',e=>{const el=e.target.closest&&e.target.closest('.ed');if(el)paperEdit(el);});
 P.addEventListener('keydown',e=>{const el=e.target.closest&&e.target.closest('.ed');if(el&&e.key==='Enter'&&!el.dataset.ml){e.preventDefault();el.blur();}});
 P.addEventListener('paste',e=>{const el=e.target.closest&&e.target.closest('.ed');if(!el)return;e.preventDefault();const t=(e.clipboardData||window.clipboardData).getData('text/plain');document.execCommand('insertText',false,t);});
 P.addEventListener('focusout',()=>{setTimeout(()=>{const a=document.activeElement;const inPaper=a&&a.closest&&a.closest('#paper .ed');if(paperStale&&!inPaper){paperStale=false;renderPaper();}},150);});}

function fitPaper(){
 const col=$('#previewCol'),holder=$('#holder'),sc=$('#scaler');
 if(!col||!holder||!sc||!col.clientWidth)return;
 const pad=(parseFloat(getComputedStyle($('#stage')).paddingLeft)||28)*2;
 const zoom=$('#previewZoom').value;
 const s=zoom==='auto'?Math.max(0.3,Math.min(1,(col.clientWidth-pad)/794)):Number(zoom);
 const n=Math.max(1,$$('#paper .page').length);
 sc.style.transform='scale('+s+')';
 holder.style.width=(794*s)+'px';
 holder.style.height=(n*(1123+24)*s)+'px';}

async function downloadPdf(){
 if(typeof html2pdf==='undefined'){window.print();return;}
 if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();
 paperStale=false;renderPaper();
 const btn=$('#btnPdf'),old=btn.textContent;
 btn.disabled=true;btn.textContent='Preparing...';
 document.body.classList.add('exporting');
 const host=document.createElement('div');
 host.style.cssText='position:fixed;left:-10000px;top:0;width:794px;';
 const clone=$('#paper').cloneNode(true);
 clone.removeAttribute('id');
 clone.querySelectorAll('[contenteditable]').forEach(x=>x.removeAttribute('contenteditable'));
 const pages=clone.querySelectorAll('.page');
 pages.forEach((p,i)=>{p.style.height='1122px';p.style.marginBottom='0';if(i<pages.length-1){p.style.pageBreakAfter='always';p.style.breakAfter='page';}});
 host.appendChild(clone);document.body.appendChild(host);
 const name=((state.doc.no||'document')+' '+(state.client.name||'')).replace(/[^\p{L}\p{N} _.()-]+/gu,' ').replace(/ +/g,' ').trim();
 try{
  await html2pdf().set({margin:0,filename:name+'.pdf',image:{type:'jpeg',quality:0.98},html2canvas:{scale:2,useCORS:true,backgroundColor:'#ffffff',scrollX:0,scrollY:0},jsPDF:{unit:'px',format:[794,1123],orientation:'portrait',hotfixes:['px_scaling']},pagebreak:{mode:['css']}}).from(clone).save();
  setStatus('PDF downloaded');
 }catch(err){
  console.error(err);setStatus('PDF export failed, opening print dialog');
  document.body.classList.remove('exporting');host.remove();window.print();
 }finally{
  host.remove();document.body.classList.remove('exporting');btn.disabled=false;btn.textContent=old;}}

function init(){
 applyTypeUI();syncForm();renderRows();renderChips();renderSum();
 bind();bindPaper();
 $('#btnPdf').addEventListener('click',downloadPdf);
 document.body.dataset.view='form';
 $$('#mobTabs button').forEach(b=>b.classList.toggle('on',b.dataset.view==='form'));
 renderPaper();fitPaper();
 setStatus(state.restored?'Draft restored':'New draft');initClean();
 if(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>renderPaper());}
init();
