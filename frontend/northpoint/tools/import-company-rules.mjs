// Explicit, authenticated import through the same APIs as Northpoint.
// No direct database access, employee changes, automatic startup import or fallback data.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {companyRulebook} from '../company-rulebook.mjs';

const args=process.argv.slice(2),apply=args.includes('--apply');
for(let i=0;i<args.length;i++){if(['--base-url','--backup-dir','--rules-file'].includes(args[i])){if(!args[++i])throw Error('Missing option value.');}else if(args[i]!=='--apply')throw Error('Unknown option: '+args[i]);}
const option=name=>{const index=args.indexOf(name);return index<0?'':args[index+1];};
const base=new URL(option('--base-url')||process.env.NORTHPOINT_BASE_URL||'http://localhost:8081/app1/');
if(!['http:','https:'].includes(base.protocol)||base.username||base.password||base.search||base.hash)throw Error('Use a plain HTTP(S) backend URL.');
base.pathname=base.pathname.replace(/\/+$/,'')+'/';
// Read the private source outside the served frontend; do not publish a document copy.
const source=await fs.readFile(option('--rules-file')||new URL('../../../COMPANY_RULES.md',import.meta.url),'utf8'),catalog=companyRulebook(source);
if(catalog.counts.categories!==8||catalog.counts.violations!==78)throw Error('Unexpected catalog. Review the source and rebuild.');
const normalize=value=>String(value||'').normalize('NFKC').replace(/[’‘]/g,"'").replace(/\s+/g,' ').trim().toLowerCase();
const categoryKey=value=>normalize(value).replace(/^[ivx]+\.\s*/,'');
const equalPenalties=(a,b)=>a.length===b.length&&b.every(p=>a.some(t=>t.offense_number===p.offense_number&&t.description===p.description));
let cookie='',actor='';
async function request(route,{method='GET',body}={}){
 const response=await fetch(new URL(route.replace(/^\//,''),base),{method,redirect:'manual',headers:{Cookie:cookie,Accept:'application/json',...(method!=='GET'?{'X-Actor':actor}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
 if(!response.ok){const message=(await response.text()).slice(0,400);throw Error(`${method} ${route}: HTTP ${response.status}. ${message}`);}
 if(response.status===204)return null;
 if(!(response.headers.get('content-type')||'').includes('application/json'))throw Error('The API returned a sign-in page instead of JSON.');
 return response.json();
}
async function readRules(category){
 const options=await request(`/violation-types/${category.id}/subsections?include_inactive=true`);
 if(!Array.isArray(options))throw Error('Invalid subsection list.');
 const rules=[];for(const rule of options)rules.push(await request('/subsections/'+rule.id));return rules;
}
function matchRule(rows,rule){
 const original=rule.description.split('\n')[1],marker=rule.description.split('\n')[0];
 const found=rows.filter(row=>normalize(row.name)===normalize(rule.name)||(!rule.reference.startsWith('VIII.F.')&&normalize(row.name)===normalize(original))||(row.description||'').split('\n')[0]===marker);
 if(found.length>1)throw Error('Multiple backend rules match '+rule.reference+'. Resolve the duplicate before importing.');
 return found[0];
}
function descriptionFor(existing,rule){
 const old=existing?.description||'',separator='\n\nExisting notes:\n';
 const notes=old.includes(separator)?old.split(separator).slice(1).join(separator):old&&!old.startsWith('Source: COMPANY_RULES.md · ')?old:'';
 return rule.description+(notes?separator+notes:'');
}
try{
 const username=process.env.NORTHPOINT_USERNAME,password=process.env.NORTHPOINT_PASSWORD;
 if(!username||!password)throw Error('Set NORTHPOINT_USERNAME and NORTHPOINT_PASSWORD for an existing browser user. Credentials are never written to files.');
 const login=await fetch(new URL('/auth/login',base),{method:'POST',redirect:'manual',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username,password,next:'/northpoint/'}),signal:AbortSignal.timeout(30000)});
 if(login.status!==303)throw Error('Sign-in failed (HTTP '+login.status+').');
 cookie=login.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');if(!cookie)throw Error('No session cookie was returned.');
 const meResponse=await fetch(new URL('/auth/me',base),{headers:{Cookie:cookie},redirect:'manual',signal:AbortSignal.timeout(30000)});if(!meResponse.ok)throw Error('Could not verify the signed-in user.');
 const me=await meResponse.json();actor=(me.full_name||[me.first_name,me.last_name].filter(Boolean).join(' ')||me.username||'').normalize('NFKD').replace(/[^\x20-\x7e]/g,'').trim();if(!actor)throw Error('No signed-in actor is available.');
 const types=await request('/violation-types/all?include_inactive=true');if(!Array.isArray(types))throw Error('Invalid category list.');
 const snapshot=[];for(const category of types)snapshot.push({...category,subsections:await readRules(category)});
 const plan=[],matched=[];
 for(const category of catalog.categories){
  const candidates=snapshot.filter(row=>categoryKey(row.name)===categoryKey(category.name));if(candidates.length>1)throw Error('Multiple matching categories: '+category.name);
  const existing=candidates[0];matched.push({category,existing});
  if(!existing)plan.push({action:'create category',name:category.name});
  for(const rule of category.violations){
   const current=matchRule(existing?.subsections||[],rule);
   if(!current)plan.push({action:'create specific violation and penalties',reference:rule.reference});
   else{
    if(current.name!==rule.name||current.description!==descriptionFor(current,rule))plan.push({action:'update wording/source notes',reference:rule.reference,id:current.id});
    if(!equalPenalties(current.penalties,rule.penalties))plan.push({action:'replace future penalty schedule',reference:rule.reference,id:current.id,before:current.penalties,after:rule.penalties});
   }
  }
 }
 console.log(JSON.stringify({mode:apply?'apply':'dry run',target:base.href,source:catalog.source,counts:catalog.counts,plannedChanges:plan.length,actions:plan},null,2));
 if(apply&&plan.length){
  const backupDir=option('--backup-dir')||path.join(os.tmpdir(),'northpoint-rulebook-backups');await fs.mkdir(backupDir,{recursive:true});
  const backup=path.join(backupDir,'rulebook-before-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json');
  await fs.writeFile(backup,JSON.stringify({target:base.href,source_sha256:catalog.source_sha256,categories:snapshot,plan},null,2)+'\n',{flag:'wx'});console.log('Rulebook backup: '+backup);
  for(const entry of matched){
   let category=entry.existing;
   if(!category)category=await request('/violation-types',{method:'POST',body:{name:entry.category.name,description:null,is_active:true}});
   let currentRows=entry.existing?.subsections||[];
   for(const rule of entry.category.violations){
    let current=matchRule(currentRows,rule);const description=descriptionFor(current,rule);
    if(!current){current=await request(`/violation-types/${category.id}/subsections`,{method:'POST',body:{name:rule.name,description,is_active:true}});currentRows.push(current);}
    else if(current.name!==rule.name||current.description!==description)current=await request('/subsections/'+current.id,{method:'PATCH',body:{name:rule.name,description}});
    if(!equalPenalties(current.penalties,rule.penalties))await request(`/subsections/${current.id}/penalties`,{method:'PUT',body:{penalties:rule.penalties}});
    const saved=await request('/subsections/'+current.id);
    if(saved.name!==rule.name||saved.description!==description||!equalPenalties(saved.penalties,rule.penalties))throw Error('Verification failed for '+rule.reference+'. Import stopped.');
   }
  }
  console.log('Verified all 78 specific violations and their penalty schedules. Unrelated categories, employees and issued records were not changed.');
 }else if(!plan.length)console.log('All company rules already match. No backend changes needed.');
}finally{
 // End only this script's temporary login; the browser session remains signed in.
 if(cookie)try{await fetch(new URL('/auth/logout',base),{method:'POST',headers:{Cookie:cookie},redirect:'manual',signal:AbortSignal.timeout(5000)});}catch{}
}
