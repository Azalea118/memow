import {apiRequest,apiId} from '../../api/api-client.js';
import {loadingSkeleton} from '../../shared/loading.js';

export async function readSubsection(id){
 const raw=await apiRequest('/subsections/'+apiId(id));
 if(!raw||String(raw.id)!==String(id)||typeof raw.name!=='string'||typeof raw.is_active!=='boolean'||!Array.isArray(raw.penalties)||raw.penalties.some(p=>!Number.isInteger(p.offense_number)||p.offense_number<1||typeof p.description!=='string'))throw Error('The server returned an invalid rule or penalty schedule.');
 return raw;
}
export async function penaltyPreview(employeeId,subsectionId){
 const [rule,summary]=await Promise.all([readSubsection(subsectionId),apiRequest('/employees/'+apiId(employeeId)+'/offense-summary')]);
 if(!Array.isArray(summary))throw Error('The offense history could not be read.');
 const own=summary.find(r=>String(r.subsection_id)===String(subsectionId));
 // Assignment uses active + removed + 1. Never reset the sequence on removal.
 const number=own?own.active_offenses+own.removed_offenses+1:1;
 if(!Number.isSafeInteger(number)||number<1)throw Error('The offense history returned an invalid count.');
 const tiers=rule.penalties.slice().sort((a,b)=>a.offense_number-b.offense_number);
 const penalty=tiers.filter(p=>p.offense_number<=number).at(-1)||tiers[0];
 if(!rule.is_active)throw Error('This specific violation is inactive. Choose another rule.');
 if(!penalty)throw Error('No penalty tiers have been configured for this violation. Ask an administrator to set them up first.');
 return {rule,offenseNumber:number,penalty:penalty.description};
}
export async function fillSubsections(form,selected=''){
 const category=form.elements.typeId.value,select=form.elements.subsectionId;
 select.disabled=true;select.replaceChildren(new Option(category?'Loading violations…':'Choose a category first',''));
 if(!category)return;
 try{const rows=await apiRequest('/violation-types/'+apiId(category)+'/subsections');if(!Array.isArray(rows))throw Error('Invalid specific violation list.');if(!form.isConnected||form.elements.typeId.value!==category)return;select.replaceChildren(new Option(rows.length?'Select a specific violation':'No active violations in this category',''));for(const row of rows)select.add(new Option(row.name,String(row.id)));select.value=selected;select.disabled=!rows.length;}
 catch(error){if(!form.isConnected||form.elements.typeId.value!==category)return;select.replaceChildren(new Option('Could not load violations',''));const alert=form.querySelector('.form-error');alert.textContent=error.message+' Select the category again to retry.';alert.classList.add('show');}
}
// Page state stays in memory only. Never substitute local records for backend data.
const categoryRules=new Map(),ruleDrafts=new Map(),categoryDeletions=new Map();
let pageWriteBusy=false;
export function invalidateRulebookCache(){categoryRules.clear();}
function categoryPath(id){return 'category/'+apiId(id);}
function editorPath(category,id){return categoryPath(category)+'/rule/'+(id==='new'?'new':apiId(id));}
function listState(id){id=String(id);if(!categoryRules.has(id))categoryRules.set(id,{status:'idle',details:'idle',options:[],rows:[],error:''});return categoryRules.get(id);}
async function loadCategory(id,ctx,details=false){
 const state=listState(id);
 if(state.status==='loading'||details&&state.details==='loading')return;
 try{
  if(state.status==='idle'){
   state.status='loading';
   const rows=await apiRequest('/violation-types/'+apiId(id)+'/subsections',{query:{include_inactive:true}});
   if(!Array.isArray(rows)||rows.some(r=>!r||typeof r.name!=='string'||!r.id))throw Error('The server returned an invalid specific violation list.');
   state.options=rows;state.status='ready';
  }
  if(details&&state.status==='ready'&&state.details==='idle'){
   state.details='loading';state.rows=await Promise.all(state.options.map(r=>readSubsection(r.id)));state.details='ready';
  }
 }catch(error){if(state.status==='loading')state.status='error';else state.details='error';state.error=error.message;}
 finally{ctx.render();}
}
export function renderCategoryTiles(types,ctx){
 const {esc,icon}=ctx;
 for(const type of types)if(listState(type.id).status==='idle')void loadCategory(type.id,ctx);
 return `<div class="category-grid">${types.map(t=>{const state=listState(t.id);return `<div class="category-item"><button class="category-tile" data-action="rulebook-open" data-id="${esc(t.id)}" ${!t.active?'disabled aria-label="'+esc(t.name)+' — inactive"':''}><strong>${esc(t.name)}</strong><span>${state.status==='ready'?state.options.length+' specific violation'+(state.options.length===1?'':'s'):state.status==='error'?'Count unavailable':'Loading count…'}</span>${t.active?icon('chevron-right',22):''}</button>${state.status==='error'?`<button class="text-button category-retry" data-action="rulebook-retry" data-id="${esc(t.id)}">Retry count</button>`:''}</div>`;}).join('')||'<p class="muted">No categories match your search.</p>'}</div>`;
}
function backLink(path,label,ctx){return `<a class="button secondary rulebook-back" href="#${ctx.esc(path)}">${ctx.icon('chevron-left',18)} ${ctx.esc(label)}</a>`;}
function messagePanel(message,ctx,retry=''){return `<section class="panel rulebook-message"><p ${retry?'role="alert"':'role="status"'}>${ctx.esc(message)}</p>${retry}</section>`;}
function tierRow(number='',description='',esc){return `<div class="penalty-edit-row"><label class="field"><span>Offense no.</span><input name="tierNumber" type="number" min="1" step="1" required value="${esc(number)}"></label><label class="field"><span>Penalty</span><textarea name="tierDescription" required>${esc(description)}</textarea></label><button class="icon-button" type="button" data-action="rulebook-remove-tier" aria-label="Remove penalty tier">×</button></div>`;}
function captureDraft(){
 const form=document.querySelector('#rule-editor-form');if(!form)return;
 const draft=ruleDrafts.get(form.dataset.path);if(!draft||draft.busy)return;
 draft.name=form.elements.name.value;draft.penalties=[...form.querySelectorAll('.penalty-edit-row')].map(row=>({offense_number:row.querySelector('[name=tierNumber]').value,description:row.querySelector('[name=tierDescription]').value}));
 draft.deleteConfirmed=Boolean(form.elements.deleteConfirmed?.checked);
}
export function preserveRulebookDraft(){captureDraft();}
async function loadDraft(path,category,id,ctx){
 const draft={status:'loading',id:id==='new'?'':id,category,name:'',penalties:[],error:'',busy:false};ruleDrafts.set(path,draft);
 try{if(id==='new'){draft.penalties=[{offense_number:1,description:''}];draft.active=true;}
 else{const rule=await readSubsection(id);if(String(rule.violation_type_id)!==String(category))throw Error('This specific violation belongs to a different category.');draft.name=rule.name;draft.penalties=rule.penalties;draft.active=rule.is_active;}
 draft.status='ready';}catch(error){draft.status='error';draft.error=error.message;}
 queueMicrotask(()=>ctx.render());
}
export function renderRulebookPage(ctx){
 const {esc,icon}=ctx,parts=location.hash.slice(1).split('/'),categoryId=parts[1],ruleId=parts[3],path=parts.join('/');
 const category=ctx.store.types.find(t=>String(t.id)===categoryId),back=backLink(ruleId?categoryPath(categoryId):'types',ruleId?'Back to specific violations':'All categories',ctx);
 if(!category)return back+messagePanel('This category could not be found. Return to Violation Types and refresh the list.',ctx);
 if(!category.active)return back+messagePanel('This category is inactive and cannot be opened.',ctx);
 if(ruleId){
  if(!ruleDrafts.has(path))void loadDraft(path,categoryId,ruleId,ctx);
  const draft=ruleDrafts.get(path);
  if(draft.status==='loading')return back+loadingSkeleton('form','specific violation');
  if(draft.status==='error')return back+messagePanel(draft.error,ctx,`<button class="button secondary" data-action="rulebook-retry-editor" data-id="${esc(path)}">Try again</button>`);
  if(!draft.active)return back+messagePanel('This specific violation is inactive and cannot be edited.',ctx);
  return back+`<section class="panel rule-editor"><div class="rulebook-page-heading"><div><span class="eyebrow">${esc(category.name)}</span><h2>${ruleId==='new'?'Add specific violation':'Edit specific violation'}</h2></div></div><form id="rule-editor-form" data-path="${esc(path)}" aria-busy="${draft.busy}"><p class="form-error ${draft.error?'show':''}" role="alert">${esc(draft.error)}</p><fieldset ${draft.busy?'disabled':''}><div class="field"><label for="rule-name">Specific violation</label><textarea id="rule-name" name="name" maxlength="300" required placeholder="Enter the complete wording of this violation">${esc(draft.name)}</textarea><small>Use the complete wording of the company rule.</small></div><div class="rulebook-tiers-heading"><h3>Offenses &amp; penalties</h3><button class="button secondary small" type="button" data-action="rulebook-add-tier">${icon('plus',16)} Add penalty</button></div><div id="penalty-rows">${draft.penalties.map(p=>tierRow(p.offense_number,p.description,esc)).join('')}</div><p class="form-intro">Changes apply to future records. Previously issued violations keep their recorded penalty.</p><div class="rulebook-save-actions"><button class="button primary" type="submit">${draft.busy?'Saving…':'Save changes'}</button><button class="button secondary" type="button" data-action="rulebook-cancel">Cancel</button></div>${draft.id?`<details class="rulebook-delete"><summary>Delete this specific violation</summary><p>This cannot be undone. A violation that is already in use may not be deleted.</p><label class="confirm-check"><input type="checkbox" name="deleteConfirmed" ${draft.deleteConfirmed?'checked':''}> I want to delete this specific violation.</label><button class="button danger" type="button" data-action="rulebook-delete">Delete specific violation</button></details>`:''}</fieldset></form></section>`;
 }
 const state=listState(categoryId);if(state.status==='idle'||state.status==='ready'&&state.details==='idle')void loadCategory(categoryId,ctx,true);
 const heading=`<div class="rulebook-page-heading"><div><h2>${esc(category.name)}</h2><p class="muted">Select a specific violation to edit its wording and penalties.</p></div><div class="rulebook-page-actions"><button class="button primary" data-action="rulebook-add" data-id="${esc(categoryId)}">${icon('plus',18)} Add specific violation</button><button class="button danger-outline" data-action="rulebook-delete-category" data-id="${esc(categoryId)}">${icon('trash',17)} Delete category</button></div></div>`;
 if(state.status==='error'||state.details==='error')return back+`<section class="panel rulebook-page">${heading}<p role="alert">${esc(state.error)}</p><button class="button secondary" data-action="rulebook-retry" data-id="${esc(categoryId)}">Try again</button></section>`;
 if(state.details!=='ready')return back+`<section class="panel rulebook-page">${heading}${loadingSkeleton('rows','specific violations and penalties')}</section>`;
 const rows=state.rows.map(r=>{const tiers=r.penalties.slice().sort((a,b)=>a.offense_number-b.offense_number),penalties=tiers.length?tiers:[null];return `<tbody class="specific-rule-group ${r.is_active?'':'inactive-rule'}" ${r.is_active?`data-action="rulebook-edit" data-id="${r.id}" data-category="${esc(categoryId)}"`:''}>${penalties.map((p,index)=>`<tr>${index===0?`<th scope="rowgroup" rowspan="${penalties.length}" class="specific-rule-name">${r.is_active?`<a href="#${editorPath(categoryId,String(r.id))}">${esc(r.name)}</a>`:`${esc(r.name)} <small>Inactive</small>`}</th>`:''}<td class="specific-offense">${p?'Offense '+p.offense_number:'—'}</td><td class="specific-penalty">${p?esc(p.description):'No penalties configured'}</td></tr>`).join('')}</tbody>`;}).join('');
 return back+`<section class="panel rulebook-page">${heading}<p class="record-scroll-hint rulebook-swipe">Swipe left or right to see offenses and penalties</p><div class="table-wrap compact-record-scroll specific-rule-scroll" tabindex="0" role="region" aria-label="Specific violations, offense numbers and penalties"><table data-phone-layout="table"><thead><tr><th>Specific violation</th><th>Offense no.</th><th>Penalty</th></tr></thead>${rows||'<tbody><tr><td colspan="3">No specific violations yet. Add one to configure its penalties.</td></tr></tbody>'}</table></div></section>`;
}
export function openRulebook(categoryId,ctx){if(ctx.store.types.some(t=>String(t.id)===String(categoryId)&&t.active))ctx.navigate(categoryPath(categoryId));}
function categoryFingerprint(rows){return rows.map(row=>apiId(row.id)).sort().join(',');}
async function prepareCategoryDeletion(id,ctx){
 categoryDeletions.delete(String(id));
 ctx.openModal('Delete category?',loadingSkeleton('rows','category details'),'<button class="button secondary" data-action="close-modal">Cancel</button>');
 const content=document.querySelector('#modal .modal-content');
 try{
  const [category,rows]=await Promise.all([apiRequest('/violation-types/'+apiId(id)),apiRequest('/violation-types/'+apiId(id)+'/subsections',{query:{include_inactive:true}})]);
  if(typeof category?.name!=='string'||!Array.isArray(rows))throw Error('Could not read the category and its specific violations. Nothing has been deleted.');
  const fingerprint=categoryFingerprint(rows);if(!content.isConnected||!document.querySelector('#modal').open)return;
  categoryDeletions.set(String(id),{fingerprint,name:category.name});
  ctx.openModal('Delete category?',`<p class="form-error" role="alert"></p><div class="callout warning">${ctx.icon('alert')}<p>Delete <strong>${ctx.esc(category.name)}</strong> and <strong>${rows.length} specific ${rows.length===1?'violation':'violations'}</strong>, including their penalty tiers?</p></div><p class="form-intro">This permanently deletes the category and its specific violations. This cannot be undone. The server will block deletion if they are still used by employee violation records.</p>`,`<button class="button secondary" data-action="close-modal" autofocus>Cancel</button><button class="button danger" data-action="rulebook-confirm-delete-category" data-id="${ctx.esc(id)}">Yes, delete category</button>`);
 }catch(error){if(content.isConnected&&document.querySelector('#modal').open)content.innerHTML=`<p role="alert">${ctx.esc(error.message)}</p><button class="button secondary" data-action="rulebook-delete-category" data-id="${ctx.esc(id)}">Try again</button>`;}
}
function categoryDeleted(id,ctx){
 categoryRules.delete(String(id));categoryDeletions.delete(String(id));
 for(const [path,draft] of ruleDrafts)if(String(draft.category)===String(id))ruleDrafts.delete(path);
 const hash=location.hash.slice(1),path=categoryPath(id);if(hash===path||hash.startsWith(path+'/'))ctx.navigate('types');
}
export async function handleRulebookAction(action,el,ctx){
 if(pageWriteBusy)return;
 const id=el.dataset.id;
 if(action==='rulebook-delete-category'){await prepareCategoryDeletion(id,ctx);return;}
 if(action==='rulebook-confirm-delete-category'){
  const confirmation=categoryDeletions.get(String(id));if(!confirmation)throw Error('Open the delete confirmation again before deleting this category.');
  await ctx.mutate({message:'Category and its specific violations deleted.',execute:async()=>{
   const rows=await apiRequest('/violation-types/'+apiId(id)+'/subsections',{query:{include_inactive:true}});
   if(!Array.isArray(rows)||categoryFingerprint(rows)!==confirmation.fingerprint)throw Error('The specific violation list changed. Cancel and open Delete category again to review the updated count. Nothing has been deleted.');
   await apiRequest('/violation-types/'+apiId(id),{method:'DELETE',actor:ctx.store.settings.name});categoryDeleted(id,ctx);
  },reconcile:async()=>{try{await apiRequest('/violation-types/'+apiId(id));return false;}catch(error){if(error.status===404){categoryDeleted(id,ctx);return true;}throw error;}}});return;
 }
 if(action==='rulebook-open'){openRulebook(id,ctx);return;}
 if(action==='rulebook-retry'){categoryRules.delete(String(id));ctx.render();return;}
 if(action==='rulebook-retry-editor'){ruleDrafts.delete(id);ctx.render();return;}
 if(action==='rulebook-add'){const path=editorPath(id,'new'),previous=ruleDrafts.get(path);if(!previous?.unconfirmedName&&!previous?.id)ruleDrafts.delete(path);ctx.navigate(path);return;}
 if(action==='rulebook-cancel'){const form=el.closest('form'),draft=ruleDrafts.get(form.dataset.path);if(!draft?.error&&!draft?.unconfirmedName)ruleDrafts.delete(form.dataset.path);ctx.navigate(categoryPath(draft.category));return;}
 if(action==='rulebook-edit'){ctx.navigate(editorPath(el.dataset.category,id));return;}
 if(action==='rulebook-remove-tier'){el.closest('.penalty-edit-row').remove();captureDraft();return;}
 if(action==='rulebook-add-tier'){
  const numbers=[...document.querySelectorAll('#penalty-rows [name=tierNumber]')].map(input=>Number(input.value));
  document.querySelector('#penalty-rows').insertAdjacentHTML('beforeend',tierRow(Math.max(0,...numbers.filter(Number.isSafeInteger))+1,'',ctx.esc));captureDraft();document.querySelector('#penalty-rows .penalty-edit-row:last-child input').focus();return;
 }
 if(action==='rulebook-delete'){
  const form=el.closest('form');if(!form.elements.deleteConfirmed.checked){const alert=form.querySelector('.form-error');alert.textContent='Confirm deletion using the checkbox first.';alert.classList.add('show');return;}
  await writeRule(form,ctx,true);
 }
}
function samePenalties(actual,expected){return actual.length===expected.length&&expected.every(p=>actual.some(t=>t.offense_number===p.offense_number&&t.description===p.description));}
async function writeRule(form,ctx,deleting=false){
 if(pageWriteBusy)return;captureDraft();const draft=ruleDrafts.get(form.dataset.path);if(!draft)return;
 const name=draft.name.trim(),penalties=draft.penalties.map(p=>({offense_number:Number(p.offense_number),description:p.description.trim()}));
 if(!deleting&&(!name||name.length>300))throw Error('Enter a specific violation of 300 characters or fewer.');
 if(!deleting&&(!penalties.length||penalties.some(p=>!Number.isSafeInteger(p.offense_number)||p.offense_number<1||!p.description)||new Set(penalties.map(p=>p.offense_number)).size!==penalties.length))throw Error('Add at least one penalty. Use a different positive whole offense number and a penalty for each row.');
 pageWriteBusy=draft.busy=true;draft.error='';ctx.render();
 let success=false;
 const actor=ctx.store.settings.name;
 try{
  // Resolve a lost create reply by GET only; never blindly repeat a POST.
  if(draft.unconfirmedName){
   const rows=await apiRequest('/violation-types/'+apiId(draft.category)+'/subsections',{query:{include_inactive:true}}),matches=rows.filter(r=>r.name===draft.unconfirmedName&&!draft.beforeCreateIds.includes(String(r.id)));
   if(matches.length!==1)throw Error('The earlier creation is still unconfirmed. Refresh this category and check for the rule before trying again.');
   draft.id=String(matches[0].id);draft.unconfirmedName='';
  }
  if(deleting){
   try{await apiRequest('/subsections/'+apiId(draft.id),{method:'DELETE',actor});}
   catch(error){if(!error.uncertain)throw error;try{await readSubsection(draft.id);}catch(check){if(check.status===404){success=true;}else throw check;}if(!success)throw Error('Deletion could not be confirmed. The rule is still on the server.');}
  }else{
   const wasExisting=Boolean(draft.id);
   if(!draft.id){
    const before=await apiRequest('/violation-types/'+apiId(draft.category)+'/subsections',{query:{include_inactive:true}});
    if(!Array.isArray(before))throw Error('Could not check the existing rules. Nothing has been created.');
    draft.beforeCreateIds=before.map(r=>String(r.id));draft.unconfirmedName=name;
    try{const saved=await apiRequest('/violation-types/'+apiId(draft.category)+'/subsections',{method:'POST',body:{name},actor});draft.id=apiId(saved?.id);draft.unconfirmedName='';}
    catch(error){if(error.status&&!error.uncertain)draft.unconfirmedName='';throw error;}
   }
   // PATCH omits description so any existing backend clarification is preserved.
   if(wasExisting){try{await apiRequest('/subsections/'+apiId(draft.id),{method:'PATCH',body:{name},actor});}catch(error){if(!error.uncertain||(await readSubsection(draft.id)).name!==name)throw error;}}
   try{await apiRequest('/subsections/'+apiId(draft.id)+'/penalties',{method:'PUT',body:{penalties},actor});}catch(error){if(!error.uncertain||!samePenalties((await readSubsection(draft.id)).penalties,penalties))throw error;}
  }
  success=true;categoryRules.delete(String(draft.category));ruleDrafts.delete(form.dataset.path);
 }catch(error){draft.error=(draft.id&&!deleting?'The rule exists, but the full save did not finish. Your entries are kept. Save again to finish. ':'')+(error.message||'Unable to save. Please try again.');}
 finally{pageWriteBusy=draft.busy=false;}
 if(success){if(location.hash.slice(1)===form.dataset.path)ctx.navigate(categoryPath(draft.category));ctx.toast(deleting?'Specific violation deleted.':'Specific violation and penalties saved.');}
 else ctx.render();
}
export async function handleRulebookSubmit(form,ctx){if(form.id!=='rule-editor-form')return false;await writeRule(form,ctx);return true;}
