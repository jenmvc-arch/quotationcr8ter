'use strict';
// Saved documents and library data (localStorage). Loaded before app.js, so nothing here may depend on app.js at load time.
const Store=(()=>{
 const K={docs:'ig.docs.v1',clients:'ig.lib.clients.v1',items:'ig.lib.items.v1',terms:'ig.lib.terms.v1',oldItems:'ig.items.v1',assistant:'ig.assistant.v1'};
 const rd=(k,d)=>{try{const v=JSON.parse(localStorage.getItem(k));return v==null?d:v;}catch(e){return d;}};
 const wr=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));return true;}catch(e){return false;}};
 const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
 const r2=n=>Math.round((Number(n||0)+Number.EPSILON)*100)/100;
 const clone=o=>JSON.parse(JSON.stringify(o));
 const STATUS={quotation:['Draft','Sent','Accepted','Declined'],proforma:['Draft','Sent','Paid'],invoice:['Draft','Sent','Paid'],receipt:['Paid']};
 const LIB={clients:K.clients,items:K.items,terms:K.terms};
 const todayStr=()=>{const d=new Date(),p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());};
 function ymOf(ms){const x=new Date(ms);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0');}
 function statusList(type){return STATUS[type]||STATUS.invoice;}
 function validStatus(type,s){const L=statusList(type);return L.indexOf(s)>=0?s:L[0];}
 function effStatus(d,today){today=today||todayStr();return d.status==='Sent'&&(d.type==='invoice'||d.type==='proforma')&&d.due&&d.due<today?'Overdue':d.status;}

 // ---- documents ----
 function docs(){return rd(K.docs,[]);}
 function putDocs(a){return wr(K.docs,a);}
 function getDoc(id){return docs().find(d=>d.id===id)||null;}
 function saveDoc(s,grand){
  const all=docs();const rec=s.docId?all.find(d=>d.id===s.docId):null;
  const id=rec?rec.id:uid();
  const snap=clone(s);snap.docId=id;delete snap.restored;
  const meta={id:id,type:s.type,no:s.doc.no,clientName:s.client.name,date:s.doc.date,due:s.type==='receipt'?'':s.doc.due,currency:s.doc.currency,grand:r2(grand),updatedAt:Date.now(),snapshot:snap};
  if(rec){meta.status=validStatus(s.type,rec.status);Object.assign(rec,meta);}
  else{meta.status=validStatus(s.type,'Draft');all.push(meta);}
  return putDocs(all)?id:null;}
 function setStatus(id,st){
  const all=docs(),d=all.find(x=>x.id===id);if(!d)return false;
  d.status=validStatus(d.type,st);
  if(d.status==='Paid')d.paidAt=d.paidAt||Date.now();else delete d.paidAt;
  return putDocs(all);}
 function removeDoc(id){return putDocs(docs().filter(d=>d.id!==id));}
 function duplicateDoc(id,newNo){
  const all=docs(),src=all.find(x=>x.id===id);if(!src)return null;
  const nid=uid(),snap=clone(src.snapshot);
  snap.docId=nid;snap.doc.no=newNo;snap.nos=snap.nos||{};snap.nos[snap.type]=newNo;
  const c=clone(src);c.id=nid;c.no=newNo;c.status=validStatus(c.type,'Draft');delete c.paidAt;c.updatedAt=Date.now();c.snapshot=snap;
  all.push(c);return putDocs(all)?nid:null;}
 function stats(list,today){
  today=today||todayStr();const ym=today.slice(0,7),out={};
  const slot=c=>out[c]||(out[c]={outstanding:0,overdue:0,overdueCount:0,paidMonth:0});
  list.forEach(d=>{
   if(d.type!=='invoice')return;
   const st=effStatus(d,today),s=slot(d.currency||'MYR');
   if(st==='Sent'||st==='Overdue')s.outstanding=r2(s.outstanding+d.grand);
   if(st==='Overdue'){s.overdue=r2(s.overdue+d.grand);s.overdueCount++;}
   if(st==='Paid'&&(d.paidAt?ymOf(d.paidAt):String(d.date||'').slice(0,7))===ym)s.paidMonth=r2(s.paidMonth+d.grand);
  });
  return{byCur:out,count:list.length};}

 // ---- library: clients {name,attn,phone,email,address}, items {d,p}, terms {name,text,types[]} ----
 function lib(kind){return rd(LIB[kind],[]);}
 function libPut(kind,a){return wr(LIB[kind],a);}
 function libSave(kind,obj){
  const a=lib(kind),low=v=>String(v==null?'':v).trim().toLowerCase();
  let rec=obj.id?a.find(x=>x.id===obj.id):null;
  if(!rec&&kind==='clients')rec=a.find(x=>low(x.name)===low(obj.name));
  if(!rec&&kind==='items')rec=a.find(x=>low(x.d)===low(obj.d));
  if(rec)Object.assign(rec,obj,{id:rec.id});else{rec=Object.assign({},obj,{id:uid()});a.push(rec);}
  libPut(kind,a);return rec;}
 function libRemove(kind,id){libPut(kind,lib(kind).filter(x=>x.id!==id));}

 // First run: copy old quick items into the library and seed default terms. Old keys are left in place.
 function migrate(types){
  if(rd(K.items,null)===null){
   const old=rd(K.oldItems,null)||[{d:'Diorama model design and fabrication',p:3500},{d:'Hand-painted figurines',p:45},{d:'Delivery and on-site installation',p:300}];
   wr(K.items,old.filter(q=>q&&q.d).map(q=>({id:uid(),d:q.d,p:Number(q.p)||0})));}
  if(rd(K.terms,null)===null&&types){
   const t=[];Object.keys(types).forEach(k=>{if(types[k].terms)t.push({id:uid(),name:types[k].label+' terms',text:types[k].terms,types:[k]});});
   wr(K.terms,t);}
  if(rd(K.clients,null)===null)wr(K.clients,[]);}

 function assistantConfig(){return rd(K.assistant,{endpoint:'',model:'',apiKey:''});}
 function saveAssistantConfig(v){return wr(K.assistant,{endpoint:String(v.endpoint||'').trim(),model:String(v.model||'').trim(),apiKey:String(v.apiKey||'').trim()});}
 return{K:K,uid:uid,r2:r2,clone:clone,statusList:statusList,validStatus:validStatus,effStatus:effStatus,todayStr:todayStr,docs:docs,getDoc:getDoc,saveDoc:saveDoc,setStatus:setStatus,removeDoc:removeDoc,duplicateDoc:duplicateDoc,stats:stats,lib:lib,libSave:libSave,libRemove:libRemove,migrate:migrate,assistantConfig:assistantConfig,saveAssistantConfig:saveAssistantConfig};
})();
