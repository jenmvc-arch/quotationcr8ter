'use strict';
// Company profile page. The profile is shared by new documents through KEYS.profile.
let companyDraft=null;

function companyDefaults(){
  const s=defaultState();
  return {company:Object.assign({},s.company),bank:Object.assign({},s.bank),logo:s.logo||''};
}

function companySavedProfile(){
  const saved=read(KEYS.profile)||{};
  const base=companyDefaults();
  return {
    company:Object.assign(base.company,saved.company||{}),
    bank:Object.assign(base.bank,saved.bank||{}),
    logo:saved.logo||base.logo||''
  };
}

function companySetStatus(message,type){
  const el=$('#companyStatus');
  if(!el)return;
  el.textContent=message||'';
  el.className='company-status'+(type?' '+type:'');
}

function companyRenderLogo(){
  const img=$('#companyLogoPreview');
  if(!img)return;
  if(companyDraft&&companyDraft.logo)img.src=companyDraft.logo;
  else img.removeAttribute('src');
}

function companyPopulate(){
  if(!companyDraft)companyDraft=companySavedProfile();
  $('#companyName').value=companyDraft.company.name||'';
  $('#companyReg').value=companyDraft.company.reg||'';
  $('#companyAddress').value=companyDraft.company.address||'';
  $('#companyBank').value=companyDraft.bank.bank||'';
  $('#companyAccountName').value=companyDraft.bank.name||'';
  $('#companyAccountNo').value=companyDraft.bank.no||'';
  companyRenderLogo();
}

function companyReadForm(){
  companyDraft=companyDraft||companySavedProfile();
  companyDraft.company={
    name:$('#companyName').value.trim(),
    reg:$('#companyReg').value.trim(),
    address:$('#companyAddress').value.trim()
  };
  companyDraft.bank={
    bank:$('#companyBank').value.trim(),
    name:$('#companyAccountName').value.trim(),
    no:$('#companyAccountNo').value.trim()
  };
  return companyDraft;
}

function companySave(){
  const profile=companyReadForm();
  if(!profile.company.name){companySetStatus('Enter a company name before saving.','error');$('#companyName').focus();return;}
  if(!write(KEYS.profile,profile)){companySetStatus('Could not save: browser storage is full or unavailable.','error');return;}
  companyDraft=companySavedProfile();
  companyPopulate();
  companySetStatus('Company details saved. New documents will use this profile.','ok');
}

function companyReset(){
  companyDraft=companySavedProfile();
  companyPopulate();
  companySetStatus('Form reset to the saved company profile.');
}

function companyUpload(){
  const input=$('#companyLogoFile');
  if(input)input.click();
}

function companyFileChanged(e){
  const file=e.target.files&&e.target.files[0];
  if(!file)return;
  if(!file.type||file.type.indexOf('image/')!==0){companySetStatus('Please choose an image file for the logo.','error');e.target.value='';return;}
  const reader=new FileReader();
  reader.onload=()=>{companyDraft=companyDraft||companySavedProfile();companyDraft.logo=String(reader.result||'');companyRenderLogo();companySetStatus('Logo selected. Click Save company details to keep it.');};
  reader.onerror=()=>companySetStatus('The logo could not be read. Please try another image.','error');
  reader.readAsDataURL(file);
}

function companyRemoveLogo(){
  companyDraft=companyDraft||companySavedProfile();
  companyDraft.logo='';
  const input=$('#companyLogoFile');if(input)input.value='';
  companyRenderLogo();
  companySetStatus('Logo removed from the form. Click Save company details to confirm.');
}

function bindCompany(){
  const save=$('#companySave');if(save)save.addEventListener('click',companySave);
  const reset=$('#companyReset');if(reset)reset.addEventListener('click',companyReset);
  const upload=$('#companyLogoUpload');if(upload)upload.addEventListener('click',companyUpload);
  const remove=$('#companyLogoReset');if(remove)remove.addEventListener('click',companyRemoveLogo);
  const file=$('#companyLogoFile');if(file)file.addEventListener('change',companyFileChanged);
}

function renderCompany(){
  if(!$('#pageCompany'))return;
  companyDraft=companySavedProfile();
  companyPopulate();
}

function initCompany(){
  bindCompany();
  if(typeof curPage==='function'&&curPage()==='company')renderCompany();
}

initCompany();
