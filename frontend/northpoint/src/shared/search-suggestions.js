import {photoData} from '../features/photos/photo-service.js';
import {photoActivityService} from '../features/photos/photo-activity.js';
let current=null,serial=0;
function closeSuggestions(){if(!current)return;current.box.hidden=true;current.input.setAttribute('aria-expanded','false');current.input.removeAttribute('aria-activedescendant');current=null;}
function candidates(form,c){
 const employee=e=>({label:e.name,detail:[e.id,e.department].filter(Boolean).join(' · '),value:e.name,action:'profile',id:e.profileId||e.id});
 const record=v=>({label:v.typeName,detail:(c.store.employees.find(e=>e.id===v.employeeId)?.name||v.employee?.name||'')+' · Case '+v.id,value:v.typeName,action:'case-details',id:v.id});
 switch(form.id){
 case 'global-search':return [...c.visibleEmployees().map(employee),...c.visibleViolations().map(record)];
 case 'employee-filters':return c.visibleEmployees().map(employee);
 case 'violation-filters':return c.visibleViolations().map(record);
 case 'type-filters':return c.store.types.map(t=>({label:t.name,detail:t.description,value:t.name}));
 case 'photo-filters':return photoData.items.map(p=>({label:p.name,detail:p.owner,value:p.name}));
 case 'photo-activity-filters':return photoActivityService.state.items.filter(e=>e.photo_display_name).map(e=>({label:e.photo_display_name,detail:e.actor,value:e.photo_display_name}));
 case 'secondary-filter':return c.getFilters('history').tab==='removals'?c.store.removals.map(e=>({label:e.employeeName,detail:e.typeName,value:e.employeeName})):c.store.activities.map(e=>({label:e.detail||e.actor,detail:e.actor,value:e.detail||e.actor}));
 case 'tracking-filters':return [...document.querySelectorAll('.tracking-device')].map(el=>({label:el.querySelector('strong').textContent,detail:el.dataset.id,value:el.dataset.id}));
 default:return [];
 }
}
export function enhanceSearchSuggestions(c){
 closeSuggestions();
 document.querySelectorAll('#global-query,.record-toolbar .record-search input[type="search"]').forEach(input=>{
  if(input.dataset.suggestionsBound)return;input.dataset.suggestionsBound='true';
  const form=input.closest('form'),host=input.closest('.record-search')||form,global=form.id==='global-search',box=document.createElement('div');
  box.className='search-suggestions';box.id='search-suggestions-'+(++serial);box.setAttribute('role','listbox');box.setAttribute('aria-label','Search suggestions');box.hidden=true;host.append(box);
  input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-controls',box.id);input.setAttribute('aria-expanded','false');
  let active=-1,matches=[];
  const select=index=>{const item=matches[index];if(!item)return;input.value=item.value;closeSuggestions();if(!global)form.requestSubmit();};
  function show(){
   const words=input.value.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);if(!words.length){closeSuggestions();box.hidden=true;return;}
   const seen=new Set();matches=candidates(form,c).filter(item=>{const key=item.label+'|'+item.value+(global?'|'+item.id:'');if(seen.has(key)||!words.every(word=>(item.label+' '+(item.detail||'')).toLocaleLowerCase().includes(word)))return false;seen.add(key);return true;}).slice(0,5);
   if(!matches.length){closeSuggestions();box.hidden=true;return;}
   if(current?.input!==input)closeSuggestions();current={input,box};active=-1;
   box.innerHTML=matches.map((item,i)=>`<button type="button" role="option" id="${box.id}-${i}" aria-selected="false" ${global?`data-action="${item.action}" data-id="${c.esc(item.id)}"`:''}><strong>${c.esc(item.label)}</strong>${item.detail?`<span>${c.esc(item.detail)}</span>`:''}</button>`).join('');
   [...box.children].forEach((button,i)=>button.addEventListener('click',()=>select(i)));
   const rect=host.getBoundingClientRect(),viewport=globalThis.visualViewport,top=viewport?.offsetTop||0,bottom=top+(viewport?.height||innerHeight),below=bottom-rect.bottom-12,above=rect.top-top-12;
   const flip=below<150&&above>below;box.classList.toggle('above',flip);box.style.maxHeight=Math.max(70,Math.min(240,flip?above:below))+'px';box.hidden=false;input.setAttribute('aria-expanded','true');
  }
  input.addEventListener('input',show);input.addEventListener('focus',()=>{if(input.value)show();});
  input.addEventListener('keydown',event=>{
   if(box.hidden)return;
   if(event.key==='Escape'){closeSuggestions();event.preventDefault();event.stopPropagation();return;}
   if(event.key==='Tab'){closeSuggestions();return;}
   if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();event.stopPropagation();active=(active+(event.key==='ArrowDown'?1:-1)+matches.length)%matches.length;[...box.children].forEach((el,i)=>el.setAttribute('aria-selected',String(i===active)));const item=box.children[active];input.setAttribute('aria-activedescendant',item.id);item.scrollIntoView({block:'nearest'});}
   if(event.key==='Enter'&&active>=0){event.preventDefault();event.stopPropagation();box.children[active].click();}
  });
  form.addEventListener('submit',closeSuggestions);
  host.addEventListener('focusout',()=>setTimeout(()=>{if(!host.contains(document.activeElement)&&current?.input===input)closeSuggestions();},0));
 });
}
document.addEventListener('click',event=>{if(current&&!current.input.closest('form').contains(event.target))closeSuggestions();});
window.addEventListener('resize',closeSuggestions);
