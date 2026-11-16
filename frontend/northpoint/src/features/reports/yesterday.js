import {dashboardSummary} from '../../shared/domain.js';
export function businessDate(value=new Date()){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));return ['year','month','day'].map(type=>parts.find(p=>p.type===type).value).join('-');}

function midnightActivity({employees,records,events,removals=[],today=businessDate()}){
 const current=dashboardSummary(employees,records,removals),models=new Map(employees.map(e=>[e.apiId,{...e}]));
 const uncertain={employees:false,violations:false,offenses:false,watchlist:false};let dailyUnknown=false;
 const rows=[...records.map(r=>({...r,removed:false})),...removals.map(r=>({...r,id:r.violationId,issuedAt:r.originalIssuedAt,date:businessDate(r.originalIssuedAt),removedAt:r.date,removed:true}))];
 const relevant=events.filter(e=>businessDate(e.date)===today);
 const createdToday=new Set(relevant.filter(e=>e.action==='employee.created').map(e=>String(e.targetId||e.employeeApiId)));
 const markRecordsUnknown=()=>{uncertain.violations=uncertain.offenses=uncertain.watchlist=true;};
 function matchingRow(event,removed){
  const m=event.metadata||{},employee=String(event.employeeApiId||''),target=String(event.targetId);
  // SQLite can reuse a deleted record ID. Match the actual offense instance,
  // including its employee, rule, sequence and timing, rather than the ID alone.
  return rows.filter(r=>r.removed===removed&&String(r.id)===target&&(!employee||String(r.employeeApiId)===employee)&&(!m.offense_number||r.offenseNumber===m.offense_number)&&(!m.subsection_id||String(r.subsectionId)===String(m.subsection_id))&&(!m.subsection_name||r.typeName===m.subsection_name))
   .sort((a,b)=>Math.abs(Date.parse(removed?a.removedAt:a.issuedAt)-Date.parse(event.date))-Math.abs(Date.parse(removed?b.removedAt:b.issuedAt)-Date.parse(event.date)))[0];
 }
 for(const event of relevant.sort((a,b)=>Date.parse(b.date)-Date.parse(a.date)||Number(b.id)-Number(a.id))){
  const id=String(event.employeeApiId||event.targetId||''),e=models.get(id),m=event.metadata||{};
  if(event.action==='employee.created')models.delete(String(event.targetId||event.employeeApiId));
  else if(event.action==='employees.bulk_created'){if(!Array.isArray(m.codes))uncertain.employees=true;else for(const [key,employee] of models)if(m.codes.includes(employee.id))models.delete(key);}
  else if(event.action==='employee.deleted'){if(!createdToday.has(id))markRecordsUnknown();}
  else if(event.action==='violation.updated'&&m.changes?.issued_at)dailyUnknown=true;
  else if(event.action==='violation.assigned'){
   if(!e&&createdToday.has(id))continue;
   const row=matchingRow(event,false);if(row){rows.splice(rows.indexOf(row),1);if(e){e.activeCount--;e.totalOffenses--;}}else markRecordsUnknown();
  }else if(event.action==='violation.removed'){
   if(!e&&createdToday.has(id))continue;
   const row=matchingRow(event,true);if(row){row.removed=false;if(e)e.activeCount++;}else markRecordsUnknown();
  }
 }
 const members=[...models.values()];if(members.some(e=>e.activeCount<0))uncertain.violations=true;if(members.some(e=>e.totalOffenses<0))uncertain.offenses=true;
 const base=dashboardSummary(members,rows.filter(r=>!r.removed),rows.filter(r=>r.removed));
 const employeeDelta=relevant.reduce((count,event)=>count+(event.action==='employee.created'?1:event.action==='employee.deleted'?-1:event.action==='employees.bulk_created'&&Array.isArray(event.metadata?.codes)?event.metadata.codes.length:0),0);
 const result={};for(const key of ['employees','violations','offenses','watchlist'])result[key]=uncertain[key]?null:key==='employees'?employeeDelta:key==='watchlist'?current[key].length-base[key].length:current[key]===null||base[key]===null?null:current[key]-base[key];
 return {result,unknown:dailyUnknown||uncertain.violations,members,rows};
}
export function todayChanges(options){const {result}=midnightActivity(options);return {...result,reason:Object.values(result).some(value=>value===null)?'Some audit details are unavailable, so this change cannot be calculated reliably.':''};}
export function yesterdayComparison(options){
 const {result,unknown,rows,members}=midnightActivity(options),today=options.today||businessDate(),days=options.days||30;
 const from=new Date(today+'T12:00:00Z');from.setUTCDate(from.getUTCDate()-days+1);const currentFrom=from.toISOString().slice(0,10);from.setUTCDate(from.getUTCDate()-1);const previousFrom=from.toISOString().slice(0,10);
 const previous=new Date(today+'T12:00:00Z');previous.setUTCDate(previous.getUTCDate()-1);const previousTo=previous.toISOString().slice(0,10);
 const count=options.records.filter(r=>r.date>=currentFrom&&r.date<=today).length;
 const baseline=rows.filter(r=>!r.removed&&members.some(e=>e.id===r.employeeId)&&r.date>=previousFrom&&r.date<=previousTo).length;
 return {...result,dailyAverage:unknown?null:(count-baseline)/days,reason:'Yesterday’s audit history cannot be reconstructed reliably.'};
}
function renderMetricChange(value,icon,reason,decimals,label,loading,fallback){
 if(value===undefined)return '<div class="metric-change neutral"><span>'+loading+'</span></div>';
 reason=String(reason).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 if(value===null)return `<div class="metric-change neutral" title="${reason||fallback}"><strong>—</strong><span>${label}</span></div>`;
 const rounded=Number(value.toFixed(decimals)),text=(rounded>=0?'+':'')+rounded.toFixed(decimals);
 return `<div class="metric-change ${rounded>0?'increase':rounded<0?'decrease':'neutral'}">${icon(rounded<0?'arrow-down':'arrow-up',15)}<strong>${text}</strong><span>${label}</span></div>`;
}
export function renderYesterdayChange(value,icon,reason='',decimals=0){return renderMetricChange(value,icon,reason,decimals,'vs yesterday','Loading comparison…','Yesterday’s data is unavailable.');}
export function renderTodayChange(value,icon,reason=''){return renderMetricChange(value,icon,reason,0,'today','Loading today’s activity…','Today’s activity is unavailable.');}
