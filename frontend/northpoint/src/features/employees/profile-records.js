import {displayActor} from '../../auth/session.js';
import {businessDate} from '../reports/yesterday.js';

const newest=(a,b)=>Date.parse(b.issuedAt)-Date.parse(a.issuedAt)||b.offenseNumber-a.offenseNumber||Number(b.id)-Number(a.id);
export function latestProfileViolations(records){
 const latest=new Map();
 for(const record of records.slice().sort(newest)){
  const key=String(record.subsectionId);if(!latest.has(key))latest.set(key,record);
 }
 return [...latest.values()];
}
export function profileHistoryRecords(employee,records,removals){
 return [...records.map(r=>({...r,removed:false})),...removals.filter(r=>String(r.employeeApiId)===String(employee.apiId)).map(r=>({
  id:r.violationId,removalId:r.id,subsectionId:r.subsectionId,typeName:r.typeName,categoryName:r.categoryName,offenseNumber:r.offenseNumber,penalty:r.penalty,
  issuedAt:r.originalIssuedAt,date:businessDate(r.originalIssuedAt),description:r.originalNotes,recordedBy:r.originalIssuedBy||'',removed:true,removedBy:r.removedBy,removedAt:r.date,reason:r.reason
 }))].sort(newest);
}
export function renderProfileRecords(ctx,employee,records){
 const {esc,icon,formatDate}=ctx,f=ctx.getFilters('profile'),tab=f.tab==='history'?'history':'active',active=latestProfileViolations(records),removalState=ctx.resources.removals;
 const history=removalState.status==='ready'?profileHistoryRecords(employee,records,ctx.store.removals):[];
 const rows=tab==='active'?active:history,current=Math.min(Math.max(1,Number(f.page)||1),Math.max(1,Math.ceil(rows.length/6))),shown=rows.slice((current-1)*6,current*6);
 const tabs=`<div class="tabs profile-record-tabs" role="tablist" aria-label="Employee violation views">${[['active','Active Violations'],['history','Violation History']].map(([id,label])=>`<button id="profile-tab-${id}" class="tab ${tab===id?'active':''}" role="tab" aria-selected="${tab===id}" aria-controls="profile-record-panel" tabindex="${tab===id?0:-1}" data-action="profile-record-tab" data-tab="${id}">${label}</button>`).join('')}</div>`;
 const content=tab==='history'&&removalState.status!=='ready'?ctx.resourceState(removalState,'employee removal history'):shown.length?`<p class="record-scroll-hint">Swipe left or right to see all columns</p><div class="table-wrap compact-record-scroll profile-record-scroll" tabindex="0" role="region" aria-label="Employee violations, scroll horizontally"><table data-phone-layout="table"><thead><tr><th>Specific violation</th><th>Incident date</th><th>Offense</th><th>Penalty at issue</th><th>Recorded by</th>${tab==='history'?'<th>Record</th>':''}<th>Action</th></tr></thead><tbody>${shown.map(v=>`<tr><td class="rule-description"><strong>${esc(v.typeName)}</strong>${v.description?`<p class="record-secondary">${esc(v.description)}</p>`:''}${v.removed?`<p class="record-secondary">Removed ${formatDate(v.removedAt)} by ${esc(displayActor(v.removedBy))}${v.reason?' · '+esc(v.reason):''}</p>`:''}</td><td>${formatDate(v.date)}</td><td>${v.offenseNumber}</td><td class="rule-description">${esc(v.penalty||'Not provided')}</td><td>${esc(displayActor(v.recordedBy)||'Not provided')}</td>${tab==='history'?`<td><span class="bordered-badge">${v.removed?'Removed':'Retained'}</span></td>`:''}<td>${v.removed?'<span class="muted">Removed</span>':`<div class="row-actions"><button class="record-action" data-action="case-details" data-id="${esc(v.id)}">View Case ${icon('chevron-right',13)}</button>${tab==='active'?`<button class="record-action profile-remove-record" data-action="remove-violation" data-id="${esc(v.id)}">${icon('trash',14)} Remove</button>`:''}</div>`}</td></tr>`).join('')}</tbody></table></div>`:`<div class="empty-state"><h3>${tab==='active'?'No active violations':'No violation history'}</h3><p>${tab==='active'?'There are no unremoved violations for this employee.':'Issued and removed violations will appear here.'}</p></div>`;
 return `${tabs}<section class="panel compact-records profile-record-panel" id="profile-record-panel" role="tabpanel" aria-labelledby="profile-tab-${tab}"><div class="panel-header"><div><h2>${tab==='active'?'Active Violations':'Violation History'}</h2><p>${tab==='active'?'Latest unremoved record per specific violation. All records remain in History.':'Every issued record, including repeated and removed violations. Most recent first.'}</p></div><span class="count-label">${tab==='active'||removalState.status==='ready'?rows.length+' records':'Loading…'}</span></div>${content}${tab==='active'||removalState.status==='ready'?ctx.pagination(rows.length,current,6,'profile'):''}</section>`;
}
