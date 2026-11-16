import {apiRequest,apiId} from '../../api/api-client.js';
import {companyDefaults} from './company-defaults.js';

const key=value=>String(value||'').normalize('NFKC').trim().toLocaleLowerCase();
function list(value){if(!Array.isArray(value)||value.some(row=>!row||!row.id||typeof row.name!=='string'))throw Error('The company rule list could not be verified.');return value;}
const penaltiesEqual=(a,b)=>JSON.stringify(a.map(p=>({offense_number:p.offense_number,description:p.description})).sort((a,b)=>a.offense_number-b.offense_number))===JSON.stringify(b);
async function createOnce(path,body,actor,lookup){
 try{return await apiRequest(path,{method:'POST',body,actor});}
 catch(error){if(error.uncertain||error.status===409){const found=await lookup();if(found)return found;}throw error;}
}
export async function restoreCompanyRules(actor,onProgress=()=>{},request=apiRequest){
 // request injection is only used for isolated validation. Production always uses the live adapter.
 if(request!==apiRequest)return restoreWithRequest(actor,onProgress,request);
 return restoreWithRequest(actor,onProgress,apiRequest);
}
async function restoreWithRequest(actor,progress,request){
 const report={categoriesAdded:0,rulesAdded:0,schedulesAdded:0};
 let categories=list(await request('/violation-types/all',{query:{include_inactive:true}})),done=0;
 async function create(path,body,lookup){
  if(request===apiRequest)return createOnce(path,body,actor,lookup);
  try{return await request(path,{method:'POST',body,actor});}catch(error){if(error.uncertain||error.status===409){const found=await lookup();if(found)return found;}throw error;}
 }
 for(const category of companyDefaults){
  let target=categories.find(row=>key(row.name)===key(category.name));
  if(!target){target=await create('/violation-types',{name:category.name,description:'Company category '+category.reference,is_active:true},async()=>list(await request('/violation-types/all',{query:{include_inactive:true}})).find(row=>key(row.name)===key(category.name)));categories.push(target);report.categoriesAdded++;}
  const path='/violation-types/'+apiId(target.id)+'/subsections';
  let rows=list(await request(path,{query:{include_inactive:true}}));
  for(const rule of category.rules){
   progress('Restoring company rules: '+done+' of 78 checked.');
   const match=row=>key(row.name)===key(rule.name)||String(row.description||'').startsWith('Company rule '+rule.reference+'\n');
   let sub=rows.find(match);
   if(!sub){sub=await create(path,{name:rule.name,description:'Company rule '+rule.reference+'\n'+rule.description,is_active:true},async()=>list(await request(path,{query:{include_inactive:true}})).find(match));rows.push(sub);report.rulesAdded++;}
   const existing=await request('/subsections/'+apiId(sub.id));
   if(!Array.isArray(existing.penalties))throw Error('A company penalty schedule could not be verified.');
   if(!existing.penalties.length){
    try{const saved=await request('/subsections/'+apiId(sub.id)+'/penalties',{method:'PUT',actor,body:{penalties:rule.penalties}});if(!Array.isArray(saved?.penalties)||!penaltiesEqual(saved.penalties,rule.penalties))throw Object.assign(Error('The saved penalty schedule could not be verified.'),{uncertain:true});}
    catch(error){if(!error.uncertain)throw error;const saved=await request('/subsections/'+apiId(sub.id));if(!Array.isArray(saved.penalties)||!penaltiesEqual(saved.penalties,rule.penalties))throw error;}
    report.schedulesAdded++;
   }
   done++;progress('Restoring company rules: '+done+' of 78 checked.');
  }
 }
 return report;
}
export async function companyRulesPresent(){
 const categories=list(await apiRequest('/violation-types/all',{query:{include_inactive:true}}));
 for(const category of companyDefaults){const target=categories.find(row=>key(row.name)===key(category.name));if(!target)return false;
  const rows=list(await apiRequest('/violation-types/'+apiId(target.id)+'/subsections',{query:{include_inactive:true}}));
  for(const rule of category.rules){const sub=rows.find(row=>key(row.name)===key(rule.name)||String(row.description||'').startsWith('Company rule '+rule.reference+'\n'));if(!sub)return false;const full=await apiRequest('/subsections/'+apiId(sub.id));if(!Array.isArray(full.penalties)||!full.penalties.length)return false;}
 }
 return true;
}
