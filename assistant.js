'use strict';
const escA=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g,'&#39;').split(String.fromCharCode(34)).join('&quot;');
// Local-first paste extraction. The assistant produces a review object, then converts it to the existing document state.
const Assistant=(()=>{
 const blank=()=>({type:'invoice',company:{name:'',reg:'',address:''},client:{name:'',attn:'',phone:'',email:'',address:''},doc:{no:'',date:'',due:'',payTerms:'',ref:'',currency:'MYR',taxRate:0,discountVal:0,discountType:'amount',deposit:0,method:'',txn:''},items:[],notes:'',termsText:'',bank:{bank:'',name:'',no:''},meta:{},warnings:[]});
 const linesOf=t=>String(t||'').replace(/[\u200b\ufeff]/g,'').replace(/\u00a0/g,' ').split(/\r\n|[\n\r\u2028\u2029]/).map(x=>x.trim()).filter(Boolean);
 const after=(lines,rx)=>{const x=lines.find(l=>rx.test(l));if(!x)return '';return x.replace(rx,'').replace(/^[:#-]\s*/,'').trim();};
 const numA=v=>{const m=String(v||'').replace(/,/g,'').match(/-?\d+(?:\.\d+)?/);return m?Number(m[0]):0;};
 const dateA=v=>{let m=String(v||'').match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);if(m)return m[1]+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[3]).padStart(2,'0');m=String(v||'').match(/(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);if(m)return m[3]+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[1]).padStart(2,'0');m=String(v||'').match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);if(m){const months={january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12};const mo=months[m[2].toLowerCase()];if(mo)return m[3]+'-'+String(mo).padStart(2,'0')+'-'+String(m[1]).padStart(2,'0');}return '';};
 function typeA(t){const x=t.toLowerCase();if(/receipt|payment received|amount received/.test(x))return'receipt';if(/proforma/.test(x))return'proforma';if(/quotation|quote|valid until/.test(x))return'quotation';return'invoice';}
 // A quoted Amount column is a line total, not necessarily a unit price. Keep both in review.
 function parseItems(lines){
  const rows=[];let section=false,number=0;
  const moneyValue=s=>Number(String(s).replace(/,/g,''));
 const push=(no,d,q,unit,price,total,explicit)=>{if(!d||!Number.isFinite(q)||q<=0)return;const line=total==null?Math.round(q*price*100)/100:total;const p=price==null?Math.round(line/q*100)/100:price;rows.push({no:String(no||++number),d:d.trim(),q,p,total:line,unit:unit||'',explicitTotal:!!explicit});number=Math.max(number,Number(no)||number);};
  for(const line of lines){
   if(/^(?:quotation details|item details|items|page \d+\s*[-–]\s*.+)$/i.test(line)){section=true;continue;}
   if(/^(?:scope of work|technical specifications|terms(?:\s*&| and)\s*conditions|payment details|notes|remarks)$/i.test(line)){section=false;continue;}
   if(/^(?:no\.?\s+)?(?:item )?description\s+qty|^no\.?\s+item description|^no\.?\s+description|^qty\s+description/i.test(line)){section=true;continue;}
   if(/\b(?:grand total|total quotation|total amount|subtotal|sub-total|amount in words)\b/i.test(line))continue;
   const cells=line.split(/\s*[|\t]\s*/).map(x=>x.trim()).filter(Boolean);
   if(cells.length>=4){
    const no=/^\d+[.)]?$/.test(cells[0])?parseInt(cells.shift(),10):null;
    const desc=cells.shift(),qcell=cells.shift(),qty=qcell&&qcell.match(/^(\d+(?:\.\d+)?)\s*(unit|units|lot|lots|set|sets|pc|pcs|piece|pieces)?$/i);
    const values=cells.map(c=>c.match(/^\s*(?:(?:RM|MYR|USD|SGD|EUR|GBP|CNY)\s*)?([\d,]+(?:\.\d{1,2})?)\s*$/i)).filter(Boolean).map(m=>moneyValue(m[1]));
    if(qty&&values.length){push(no,desc,Number(qty[1]),qty[2]||'',values.length>1?values[0]:null,values[values.length-1],true);continue;}
   }
   const numbered=line.match(/^(\d+)[.)]?\s+(.+?)\s+(\d+(?:\.\d+)?)\s*(units?|lots?|sets?|pcs?|pieces?)?\s+(?:(?:RM|MYR|USD|SGD)\s*)?([\d,]+\.\d{2})(?:\s+(?:(?:RM|MYR|USD|SGD)\s*)?([\d,]+\.\d{2}))?\s*$/i);
   if(numbered&&(section||numbered[4])){const q=Number(numbered[3]),first=moneyValue(numbered[5]),second=numbered[6]?moneyValue(numbered[6]):null;push(numbered[1],numbered[2],q,numbered[4]||'',second==null?null:first,second==null?first:second,true);continue;}
   const simple=line.match(/^(\d+)[.)]?\s+(.+?)\s+(?:(?:RM|MYR|USD|SGD)\s*)?([\d,]+\.\d{2})\s*$/i);
   if(simple&&section){push(simple[1],simple[2],1,'',null,moneyValue(simple[3]),true);continue;}
   const pipes=line.match(/^(.+?)\s*[|\t]\s*(\d+(?:\.\d+)?)\s*[|\t]\s*(?:(?:RM|MYR|USD|SGD)\s*)?([\d,]+\.\d{2})(?:\s*[|\t]\s*(?:(?:RM|MYR|USD|SGD)\s*)?([\d,]+\.\d{2}))?\s*$/i);
   if(pipes){const q=Number(pipes[2]),first=moneyValue(pipes[3]),second=pipes[4]?moneyValue(pipes[4]):null;push(null,pipes[1],q,'',first,second,second!=null);}
  }
  return rows;
 }
 function attachItemRemarks(items,lines){
  if(!items.length||!lines.length)return lines;
  const blocks=[];let current=null;
  const normalize=s=>String(s||'').toLowerCase().replace(/^\d+[.)]\s*/,'').replace(/[–—]/g,'-').replace(/[^a-z0-9]+/g,' ').trim();
  const itemCode=s=>(String(s||'').match(/\b[A-Z]{1,5}[-–][A-Z]?\d+\b/i)||[])[0]||'';
  for(const line of lines){
   const heading=line.match(/^\d+[.)\u2060]?\s+(.+)$/);
   if(heading){if(current)blocks.push(current);current={title:heading[1],lines:[],raw:[line]};}
   else if(current){current.raw.push(line);current.lines.push(line);}
   else blocks.push({title:'',lines:[],raw:[line]});
  }
  if(current)blocks.push(current);
  const unmatched=[];
  for(const block of blocks){
   const title=normalize(block.title),code=itemCode(block.title).toLowerCase();
   const candidates=items.filter(it=>{const desc=normalize(it.d),dc=itemCode(it.d).toLowerCase();return title&&(code&&dc?code===dc:(desc===title||desc.includes(title)||title.includes(desc)));});
   if(candidates.length!==1||!block.lines.length){unmatched.push(...block.raw);continue;}
   const it=candidates[0];
   const details=block.lines.map(l=>l.replace(/^[\s\u2060\u200b]*[•·\-*]?[\s\u2060\u200b]*/,'').trim()).filter(Boolean).map(l=>'- '+l);
   if(details.length)it.d=it.d+'\n'+details.join('\n');
  }
  return unmatched;
 }
 function parse(t){const s=blank(),ls=linesOf(t),x=String(t||'');s.type=typeA(x);
  const numberMatch=x.match(/\b(?:invoice|quotation|proforma|receipt)\s*(?:no\.?|number)\s*[:#-]?\s*([A-Z0-9][A-Z0-9&.\/ -]{2,})/i)||x.match(/\b(?:SRWK[- ]?QT[- ]?\d{4}[- ]?[\d&-]+)\b/i);s.doc.no=numberMatch?String(numberMatch[1]||numberMatch[0]).trim().replace(/[.,;:]+$/,''):'';
  const dates=[...x.matchAll(/\b\d{4}[-\/]\d{1,2}[-\/]\d{1,2}\b|\b\d{1,2}[-\/]\d{1,2}[-\/]\d{4}\b|\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/gi)].map(m=>dateA(m[0]));s.doc.date=dates[0]||'';s.doc.due=dates[1]||'';
  s.doc.currency=/\b(USD|SGD|EUR|GBP|CNY)\b/i.test(x)?x.match(/\b(USD|SGD|EUR|GBP|CNY)\b/i)[1].toUpperCase():'MYR';
  s.company.name=after(ls,/^(?:from|company|seller|issued by|prepared by)\s*:/i)||after(ls,/^(?:SRWK Diorama Lab|YSYD Sdn Bhd)$/i)||((ls[0]&&!/^(?:project|reference|client|quotation date|quotation details|scope of work|terms)/i.test(ls[0])&&!/invoice|quotation|receipt|proforma/i.test(ls[0]))?ls[0]:'');
  s.company.reg=after(ls,/^(?:registration|reg\.? no\.?)\s*:/i);s.company.address=after(ls,/^(?:company )?address\s*:/i);
  s.client.name=after(ls,/^(?:bill to|invoice to|received from|prepared for|client|customer)\s*:?\s*/i)||after(ls,/^quotation for\s*:?\s*/i);s.client.attn=after(ls,/^(?:attention|attn)\s*:?\s*/i);s.client.email=(x.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)||[''])[0];s.client.phone=(x.match(/(?:\+?\d[\d ()-]{7,}\d)/)||[''])[0];s.client.address=after(ls,/^(?:client )?address\s*:?\s*/i);
  s.doc.ref=after(ls,/^(?:reference|ref(?:erence)?)\s*:?\s*/i)||after(ls,/^project\s*:?\s*/i);
  const nextAfter=(rx)=>{const i=ls.findIndex(l=>rx.test(l));return i>=0&&ls[i+1]&&!/:$/.test(ls[i])?ls[i+1].trim():'';};if(!s.client.name)s.client.name=nextAfter(/^quotation for:?\s*$/i);if(!s.doc.ref)s.doc.ref=nextAfter(/^reference:?\s*$/i);
  s.doc.taxRate=numA((x.match(/(?:tax|sst|gst)[^\d]*(\d+(?:\.\d+)?)\s*%?/i)||[])[1]);const dm=x.match(/discount[^\d]*(\d+(?:\.\d+)?)\s*(%|percent)?/i);if(dm){s.doc.discountVal=numA(dm[1]);s.doc.discountType=dm[2]?'percent':'amount';}
  s.doc.deposit=numA((x.match(/(?:deposit|paid)[^\d]*([\d,]+(?:\.\d+)?)/i)||[])[1]);s.doc.payTerms=after(ls,/^(?:payment terms|terms)\s*:/i);s.doc.method=after(ls,/^(?:payment method|method)\s*:/i);s.doc.txn=after(ls,/^(?:transaction|transaction ref(?:erence)?)\s*:/i);
  s.bank.bank=after(ls,/^bank\s*:/i);s.bank.name=after(ls,/^(?:account name|account holder)\s*:/i);s.bank.no=after(ls,/^(?:account no|account number)\s*:/i);
  s.items=parseItems(ls);
  const total=/(?:^|\n)\s*(?:grand total|total quotation|total amount|amount due|balance due|amount received|total)\s*[:=]?\s*(?:RM|MYR|USD|SGD|EUR|GBP|CNY)?\s*([\d,]+(?:\.\d+)?)/im.exec(x);if(total)s.meta.total=numA(total[1]);if(total&&!s.items.length)s.items=[{no:'1',d:s.type==='receipt'?'Payment received':'Imported total',q:1,p:numA(total[1]),total:numA(total[1]),unit:'',explicitTotal:true}];s.meta.amountWords=(ls.find(l=>/ringgit malaysia|dollars? only|cents? only/i.test(l))||'');s.meta.subtotals=ls.filter(l=>/(?:subtotal|sub-total)/i.test(l));
  const scopeAt=ls.findIndex(l=>/^scope of work$/i.test(l)),techAt=ls.findIndex(l=>/^(?:technical specifications|technical details)$/i.test(l)),termsAt=ls.findIndex(l=>/^terms(?: &| and) conditions$/i.test(l));const scopeEnd=[techAt,termsAt].filter(i=>i>=0).sort((a,b)=>a-b)[0];const scopeLines=scopeAt>=0?ls.slice(scopeAt+1,scopeEnd==null?ls.length:scopeEnd):[];const remainingScope=attachItemRemarks(s.items,scopeLines);s.meta.itemRemarks=s.items.filter(it=>it.d.includes('\n')).length;s.meta.scopeDetected=scopeLines.length>0;s.notes=remainingScope.length?remainingScope.join(NL):after(ls,/^(?:remarks|notes)\s*:/i);s.meta.techSpecs=techAt>=0?ls.slice(techAt+1,termsAt>=0?termsAt:ls.length).join(NL):'';s.termsText=termsAt>=0?ls.slice(termsAt+1).join(NL):after(ls,/^(?:terms and conditions|terms)\s*:/i);
  const fields=['doc.no','company.name','client.name'];fields.forEach(k=>{const v=k.split('.').reduce((a,z)=>a&&a[z],s);s.meta[k]={confidence:v?'high':'low',needsReview:!v};});if(!s.client.name)s.warnings.push('Client name was not found.');if(!s.items.length)s.warnings.push('No line items were detected; add them during review.');if(!s.doc.date)s.warnings.push('Document date was not found.');s.items.forEach(it=>{if(it.explicitTotal&&Math.abs(it.q*it.p-it.total)>0.01)s.warnings.push('Line '+it.no+' amount does not match quantity × unit price; review the row.');});if(s.meta.total&&s.items.length&&Math.abs(s.items.reduce((a,i)=>a+i.total,0)-s.meta.total)>0.01)s.warnings.push('Line-item totals do not match the stated grand total.');return s;}
 function toState(r){const s=defaultState();merge(s,r);if(r.meta&&r.meta.techSpecs)s.notes=String(s.notes||'')+(s.notes?'\n\nTechnical specifications:\n':'Technical specifications:\n')+r.meta.techSpecs;delete s.meta;delete s.warnings;s.doc.date=r.doc.date||today();s.doc.due=r.doc.due||addDays(s.doc.date,TYPES[r.type].dueDays);s.doc.no=r.doc.no||freeNo(r.type);s.items=r.items&&r.items.length?r.items:[{d:'',q:1,p:0}];s.docId='';s.restored=false;return s;}
 return{parse:parse,toState:toState,blank:blank};
})();

let assistantResult=null,assistantReviewDirty=false;
function enhanceCategorySummary(){const r=assistantResult;if(!r||!$('#assistantReview'))return;const v=p=>p.split('.').reduce((a,k)=>a&&a[k],r)||'';const grid=$('#assistantReview .assistant-category-grid');if(!grid)return;Array.from(grid.children).forEach(el=>{const label=el.querySelector('strong')?.textContent||'';if(label==='Notes and terms')el.remove();if(label==='Totals and tax'&&r.meta&&r.meta.total){el.classList.remove('missing');el.classList.add('found');const icon=el.querySelector('.assistant-category-icon');if(icon)icon.textContent='✓';const sm=el.querySelector('small');if(sm)sm.textContent=(r.doc.currency==='MYR'?'RM':r.doc.currency)+' '+fmt(r.meta.total)+(v('doc.taxRate')?' · Tax '+v('doc.taxRate'):'');const status=el.querySelector('em');if(status)status.textContent='Detected';}});const add=(label,found,detail)=>{const el=document.createElement('div');el.className='assistant-category '+(found?'found':'missing');el.innerHTML=`<span class='assistant-category-icon'>${found?'✓':'!'}</span><div><strong>${escA(label)}</strong><small>${escA(detail)}</small></div><em>${found?'Detected':'Needs input'}</em>`;grid.appendChild(el);};const total=r.meta&&r.meta.total;const paymentText=String(v('termsText')||'');add('Project / reference',!!v('doc.ref'),v('doc.ref')||'Project or drawing reference not found');add('Grand total',!!total,total?((r.doc.currency==='MYR'?'RM':r.doc.currency)+' '+fmt(total)):'Grand total not found');add('Scope of work',!!(r.meta&&r.meta.scopeDetected)||!!v('notes'),v('notes')?String(v('notes')).split(NL).length+' scope lines captured':'No scope of work detected');add('Technical specifications',!!(r.meta&&r.meta.techSpecs),r.meta&&r.meta.techSpecs?'Technical specification block captured':'No technical specifications detected');add('Terms and conditions',!!v('termsText'),v('termsText')?String(v('termsText')).split(NL).length+' terms lines captured':'No terms and conditions detected');if(paymentText&&/payment|deposit|balance|delivery/i.test(paymentText))add('Payment terms',true,'Payment schedule found in terms');if(r.meta&&r.meta.amountWords)add('Amount in words',true,r.meta.amountWords);}
function initAssistant(){
 const open=()=>{assistantReviewDirty=false;$('#assistantPanel').classList.remove('hide');$('#assistantBack').classList.remove('hide');$('#assistantInputView').classList.remove('hide');$('#assistantReviewView').classList.add('hide');$('#assistantFoot').classList.add('hide');$('#assistantTitle').textContent='Paste content';$('#assistantPaste').focus();};
 const close=()=>{$('#assistantPanel').classList.add('hide');$('#assistantBack').classList.add('hide');};
 $('#btnAssistant').addEventListener('click',open);$('#assistantClose').addEventListener('click',close);$('#assistantCancel').addEventListener('click',close);$('#assistantBack').addEventListener('click',close);
 const cfg=Store.assistantConfig();$('#assistantEndpoint').value=cfg.endpoint||'https://max2.jojocode.com/v1/chat/completions';$('#assistantModel').value=cfg.model||'';$('#assistantApiKey').value=cfg.apiKey||'';
 $('#assistantSettings').addEventListener('click',()=>{if(typeof Auth==='undefined'||!Auth.can('aiSettings')){alert('Only approved workspace users can access AI settings.');return;}$('#assistantSettingsBox').classList.toggle('hide');});$('#assistantSaveSettings').addEventListener('click',()=>{Store.saveAssistantConfig({endpoint:$('#assistantEndpoint').value,model:$('#assistantModel').value,apiKey:$('#assistantApiKey').value});setStatus('AI settings saved');});
 $('#assistantTestAI').addEventListener('click',testAssistantAI);
 $('#assistantClear').addEventListener('click',()=>{$('#assistantPaste').value='';assistantResult=null;$('#assistantReviewView').classList.add('hide');$('#assistantInputView').classList.remove('hide');});
 const parseNow=()=>{if(assistantReviewDirty&&!confirm('Manual review changes detected. Re-parse and refresh extracted fields?'))return;if(!String($('#assistantPaste').value||'').trim()){$('#assistantPaste').focus();$('#assistantPaste').setCustomValidity('Paste some content before continuing.');$('#assistantPaste').reportValidity();return;}$('#assistantPaste').setCustomValidity('');assistantResult=Assistant.parse($('#assistantPaste').value);renderAssistantReview();enhanceCategorySummary();$('#assistantTitle').textContent='Review categories';$('#assistantFoot').classList.remove('hide');};$('#assistantParse').addEventListener('click',parseNow);$('#assistantReparse').addEventListener('click',parseNow);
 $('#assistantEnhance').addEventListener('click',enhanceWithAI);
 $('#assistantSave').addEventListener('click',()=>{if(!assistantResult)return;const r=readAssistantReview();const issues=assistantValidationIssues(r);if(issues.length){alert('Please review before saving: '+issues.join(' | '));return;}const s=Assistant.toState(r);const id=Store.saveDoc(s,calc(s).grand);if(!id){alert('Could not save draft in browser storage.');return;}s.docId=id;state=s;write(KEYS.draft,s);markClean();if(typeof GoogleSync!=='undefined')GoogleSync.saveDocument(Store.getDoc(id));close();openState(s,'New draft saved');});
}
function assistantJson(text){
 const raw=String(text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
 try{return JSON.parse(raw);}catch(e){const a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a>=0&&b>a)return JSON.parse(raw.slice(a,b+1));throw Error('AI returned invalid JSON.');}
}
function assistantMergeAI(local,ai){
 const out=Assistant.parse('');merge(out,local);if(!ai||typeof ai!=='object')throw Error('AI returned an empty result.');
 ['type','items','notes','termsText'].forEach(k=>{if(ai[k]!==undefined)out[k]=ai[k];});
 ['company','client','doc','bank'].forEach(k=>{if(ai[k]&&typeof ai[k]==='object')merge(out[k],ai[k]);});
 if(!['quotation','proforma','invoice','receipt'].includes(out.type))out.type=local.type||'quotation';
 out.items=Array.isArray(out.items)?out.items.map((it,i)=>({no:it.no==null?String(i+1):String(it.no),d:String(it.d||it.description||''),q:Number(it.q||it.quantity||1)||1,p:Number(it.p||it.unitPrice||0)||0,total:Number(it.total||it.totalPrice||0)||0,unit:String(it.unit||'unit')})):local.items;
 return out;
}
async function enhanceWithAI(){
 if(typeof Auth==='undefined'||!Auth.can('aiSettings')){alert('AI enhancement is restricted to approved workspace users.');return;}
 const c=Store.assistantConfig(),endpoint=String(c.endpoint||$('#assistantEndpoint').value||'').trim(),key=String(c.apiKey||$('#assistantApiKey').value||'').trim(),model=String(c.model||$('#assistantModel').value||'').trim();
 if(!endpoint||!key||!model){alert('Open AI settings, enter the JOJO endpoint, model name, and API key, then click Save settings.');return;}
 const source=String($('#assistantPaste').value||'').trim();if(!source)return;
 const b=$('#assistantEnhance');b.disabled=true;b.textContent='Enhancing...';
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
 const schema='Return JSON only with this shape: {type, company:{name,reg,address}, client:{name,attn,phone,email,address}, doc:{no,date,due,payTerms,ref,currency,taxRate,discountVal,discountType,deposit,method,txn}, items:[{no,d,q,unit,p,total}], notes, termsText, bank:{bank,name,no}}. Preserve item remarks in d after the main title separated by new lines. Do not invent missing values.';
 try{
  const request={model,messages:[{role:'system',content:schema},{role:'user',content:source}],temperature:0};if(/api\.openai\.com/i.test(endpoint))request.response_format={type:'json_object'};
  const res=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify(request),signal:controller.signal});
  const body=await res.text();let json;try{json=JSON.parse(body);}catch(e){throw Error('AI endpoint returned invalid JSON.');}
  if(!res.ok)throw Error((json.error&&json.error.message)||json.message||('AI request failed ('+res.status+').'));
  const content=json.choices?.[0]?.message?.content||json.output_text||json.content;if(!content)throw Error('AI response did not contain extracted content.');
  assistantResult=assistantMergeAI(Assistant.parse(source),assistantJson(content));renderAssistantReview();enhanceCategorySummary();alert('AI enhancement complete. Review the extracted fields before saving.');
 }catch(e){alert((e.name==='AbortError'?'AI request timed out. ': 'AI enhancement failed: '+e.message+' ' )+'The local parse is still available.');}
 finally{clearTimeout(timer);b.disabled=false;b.textContent='Enhance with AI';}
}
async function testAssistantAI(){
 if(typeof Auth==='undefined'||!Auth.can('aiSettings'))return;
 const endpoint=String($('#assistantEndpoint').value||'').trim().replace(/\/chat\/completions\/?$/,'/models'),key=String($('#assistantApiKey').value||'').trim();
 if(!endpoint||!key){alert('Enter the endpoint and API key first.');return;}
 const b=$('#assistantTestAI');if(b)b.disabled=true;try{const r=await fetch(endpoint,{headers:{Authorization:'Bearer '+key}});const j=await r.json();if(!r.ok)throw Error(j.error?.message||'Could not load models.');const models=(j.data||[]).map(x=>x.id).filter(Boolean);alert(models.length?'Connection works. Available models: '+models.slice(0,12).join(', '):'Connection works, but no model list was returned.');}catch(e){alert('JOJO connection failed: '+e.message);}finally{if(b)b.disabled=false;}
}
function assistantValidationIssues(r){const issues=[];if(!String(r.doc?.no||'').trim())issues.push('Document number is missing.');if(!String(r.client?.name||'').trim())issues.push('Client name is missing.');if(!r.items?.length)issues.push('At least one line item is required.');return issues;}
function fieldA(label,path,val,review){return `<label class='assistant-field ${review?'needs-review':''}'><span>${escA(label)}${review?` <em>Review</em>`:''}</span><input data-ap='${path}' value='${escA(val)}'></label>`;}
function categoryA(label,found,detail){return `<div class='assistant-category ${found?'found':'missing'}'><span class='assistant-category-icon'>${found?'✓':'!'}</span><div><strong>${escA(label)}</strong><small>${escA(detail|| (found?'Detected from pasted content':'Add during review'))}</small></div><em>${found?'Detected':'Needs input'}</em></div>`;}
function renderAssistantReview(){const r=assistantResult;$('#assistantInputView').classList.add('hide');$('#assistantReviewView').classList.remove('hide');const v=(p)=>p.split('.').reduce((a,k)=>a&&a[k],r)||'';const warn=r.warnings&&r.warnings.length?`<div class='assistant-warning'>${r.warnings.map(escA).join('<br>')}</div>`:'';const itemDetail=r.items.length?`${r.items.length} line item${r.items.length===1?'':'s'} detected`:'No line items detected';const categories=categoryA('Document',!!(v('doc.no')||v('doc.date')),v('doc.no')||'Document number not found')+categoryA('Company',!!(v('company.name')||v('company.address')),v('company.name')||'Company details not found')+categoryA('Client',!!v('client.name'),v('client.name')||'Client name not found')+categoryA('Line items',r.items.length>0,itemDetail)+categoryA('Totals and tax',!!(v('doc.taxRate')||v('doc.deposit')),v('doc.taxRate')?`Tax ${v('doc.taxRate')}%`: 'No totals or tax detected')+categoryA('Payment details',!!(v('bank.bank')||v('doc.method')||v('doc.payTerms')),v('bank.bank')||v('doc.method')||'No payment details detected')+categoryA('Notes and terms',!!(v('notes')||v('termsText')),v('notes')||v('termsText')||'No notes or terms detected');const fields=[fieldA('Document no.','doc.no',v('doc.no'),r.meta['doc.no']&&r.meta['doc.no'].needsReview),fieldA('Date','doc.date',v('doc.date'),!v('doc.date')),fieldA('Due date','doc.due',v('doc.due'),false),fieldA('Currency','doc.currency',v('doc.currency'),false),fieldA('Company name','company.name',v('company.name'),r.meta['company.name']&&r.meta['company.name'].needsReview),fieldA('Company address','company.address',v('company.address'),false),fieldA('Client name','client.name',v('client.name'),r.meta['client.name']&&r.meta['client.name'].needsReview),fieldA('Client email','client.email',v('client.email'),false),fieldA('Client phone','client.phone',v('client.phone'),false),fieldA('Client address','client.address',v('client.address'),false),fieldA('Tax rate (%)','doc.taxRate',v('doc.taxRate'),false),fieldA('Discount','doc.discountVal',v('doc.discountVal'),false),fieldA('Payment terms','doc.payTerms',v('doc.payTerms'),false),fieldA('Bank','bank.bank',v('bank.bank'),false),fieldA('Account no.','bank.no',v('bank.no'),false)];$('#assistantReview').innerHTML=`<div class='assistant-review-top'><label class='f'><span>Detected type</span><select data-ap='type'><option value='quotation'>Quotation</option><option value='proforma'>Proforma Invoice</option><option value='invoice'>Invoice</option><option value='receipt'>Receipt</option></select></label></div><div class='assistant-category-grid'>${categories}</div>${warn}<div class='assistant-group'><h4>Document</h4><div class='assistant-grid'>${fields.slice(0,4).join('')}</div></div><div class='assistant-group'><h4>Company and client</h4><div class='assistant-grid'>${fields.slice(4,10).join('')}</div></div><div class='assistant-group'><h4>Totals and payment</h4><div class='assistant-grid'>${fields.slice(10).join('')}</div></div><div class='assistant-group'><h4>Line items</h4><div class='assistant-items-head'><span>Description</span><span>Qty</span><span>Unit price</span><span></span></div><div id='assistantItems'>${r.items.map((it,i)=>`<div class='assistant-item' data-ai='${i}'><input data-aif='d' value='${escA(it.d)}' placeholder='Description'><input data-aif='q' type='number' value='${it.q||1}'><input data-aif='p' type='number' value='${it.p||0}'><button class='x' data-aidel='${i}'>&times;</button></div>`).join('')}</div><button class='link' id='assistantAddItem'>+ Add item</button></div>`;$('#assistantReview select[data-ap=type]').value=r.type;$('#assistantReview').addEventListener('input',assistantReviewInput,{once:false});$('#assistantAddItem').addEventListener('click',()=>{r.items.push({d:'',q:1,p:0});renderAssistantReview();});$$('#assistantReview [data-aidel]').forEach(b=>b.addEventListener('click',()=>{r.items.splice(+b.dataset.aidel,1);renderAssistantReview();}));}
 function assistantReviewInput(e){assistantReviewDirty=true;const el=e.target;if(!el.dataset.ap)return;let o=assistantResult;const p=el.dataset.ap.split('.'),k=p.pop();p.reduce((a,z)=>a[z],o)[k]=el.type==='number'?num(el.value):el.value;if(el.dataset.ap==='type')assistantResult.type=el.value;}
 function readAssistantReview(){const r=Assistant.parse('');const src=assistantResult;merge(r,src);$$('#assistantReview [data-ap]').forEach(el=>{const p=el.dataset.ap.split('.'),k=p.pop();p.reduce((a,z)=>a[z],r)[k]=el.value;});r.type=$('#assistantReview [data-ap=type]').value;r.items=$$('#assistantItems .assistant-item').map(row=>({d:row.querySelector('[data-aif=d]').value,q:num(row.querySelector('[data-aif=q]').value)||1,p:num(row.querySelector('[data-aif=p]').value)}));return r;}
// Extend the existing review with explicit row numbers and line totals. The editor
// persists q/p; the review retains the original amount for comparison and edits.
const renderAssistantReviewBase=renderAssistantReview;
renderAssistantReview=function(){
 renderAssistantReviewBase();
 const head=$('#assistantReview .assistant-items-head');
 if(head)head.innerHTML='<span>No.</span><span>Description</span><span>Qty</span><span>Unit price</span><span>Total price</span><span></span>';
 $$('#assistantItems .assistant-item').forEach((row,i)=>{
  const it=assistantResult.items[i],desc=row.querySelector('[data-aif=d]');
  if(!it||!desc)return;
  const description=document.createElement('textarea');description.dataset.aif='d';description.setAttribute('aria-label','Item description and remarks');description.rows=it.d.includes('\n')?5:2;description.value=it.d;desc.replaceWith(description);
  const no=document.createElement('input');no.dataset.aif='no';no.setAttribute('aria-label','Item number');no.value=it.no||String(i+1);row.insertBefore(no,description);
  const total=document.createElement('input');total.dataset.aif='total';total.setAttribute('aria-label','Line total');total.type='number';total.step='0.01';total.min='0';total.value=it.total==null?round2(num(it.q)*num(it.p)):it.total;row.insertBefore(total,row.querySelector('[data-aidel]'));
 });
};
const readAssistantReviewBase=readAssistantReview;
readAssistantReview=function(){
 const r=readAssistantReviewBase();
 r.items=$$('#assistantItems .assistant-item').map(row=>({
  no:row.querySelector('[data-aif=no]').value.trim(),
  d:row.querySelector('[data-aif=d]').value.trim(),
  q:num(row.querySelector('[data-aif=q]').value)||1,
  p:num(row.querySelector('[data-aif=p]').value),
  total:num(row.querySelector('[data-aif=total]').value),
  unit:assistantResult.items[+row.dataset.ai]?.unit||''
 }));
 return r;
};
document.addEventListener('input',e=>{
 const el=e.target,field=el.dataset?.aif,row=el.closest?.('#assistantItems .assistant-item');
 if(!row||!['q','p','total'].includes(field))return;
 const q=row.querySelector('[data-aif=q]'),p=row.querySelector('[data-aif=p]'),total=row.querySelector('[data-aif=total]');
 if(field==='total')p.value=num(q.value)>0?round2(num(total.value)/num(q.value)):0;
 else total.value=round2(num(q.value)*num(p.value));
 const item=assistantResult.items[+row.dataset.ai];if(item){item.q=num(q.value);item.p=num(p.value);item.total=num(total.value);}
});
if(typeof initAssistant==='function')initAssistant();
