// Shared rules for violation status and the weekly dashboard. No network calls.
export const VIOLATION_STATUSES = ['Active', 'Inactive'];
export const WATCHLIST_OFFENSE = 3;

function retained(violation) {
  return violation.status !== 'Removed' && !violation.removed && !violation.removedAt;
}

export function normalizeViolationStatus(value) {
  return /^(inactive|resolved)$/i.test(String(value).trim()) ? 'Inactive' : 'Active';
}

export function violationStatusLabel(value) {
  return normalizeViolationStatus(value) === 'Active' ? 'Active — not yet resolved' : 'Inactive — resolved';
}

export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateAtUTC(value) {
  return new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
}

function shiftDate(value, days) {
  const date = dateAtUTC(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function startOfWeek(value = localDate()) {
  const day = dateAtUTC(value).getUTCDay();
  return shiftDate(value, -((day + 6) % 7));
}

export function weeklyTotals(violations, today = localDate(), weeks = 6) {
  const current = startOfWeek(today);
  return Array.from({ length: weeks }, (_, index) => {
    const start = shiftDate(current, (index - weeks + 1) * 7);
    const end = shiftDate(start, 6);
    const count = violations.filter(violation => {
      const date = String(violation.date).slice(0, 10);
      return retained(violation) && date >= start && date <= end && date <= today;
    }).length;
    return { start, end, count, current: start === current };
  });
}

export function recentViolationActivity(violations, today = localDate()) {
  const from = shiftDate(today, -13);
  return violations.filter(violation => {
    const date = String(violation.date).slice(0, 10);
    return retained(violation) && date >= from && date <= today;
  }).slice().sort((a, b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id))).slice(0, 5);
}

export function dashboardSummary(employees, violations, removals=[]) {
 const ranked=employees.map(e=>{const own=violations.filter(v=>v.employeeId===e.id),removed=removals.filter(r=>r.employeeId===e.id);return {...e,violations:e.activeCount??own.length,totalOffenses:e.totalOffenses,maxOffense:Math.max(0,...own.map(v=>v.offenseNumber),...removed.map(v=>v.offenseNumber))};});
 const departments=[...new Set(employees.map(e=>e.department||'Unassigned'))].sort().map(name=>{const own=ranked.filter(e=>(e.department||'Unassigned')===name);return {name,employees:own.length,violations:own.reduce((n,e)=>n+e.violations,0),totalOffenses:own.some(e=>e.totalOffenses===null)?null:own.reduce((n,e)=>n+e.totalOffenses,0)};});
 return {employees:employees.length,violations:ranked.reduce((n,e)=>n+e.violations,0),offenses:ranked.some(e=>e.totalOffenses===null)?null:ranked.reduce((n,e)=>n+e.totalOffenses,0),watchlist:ranked.filter(e=>e.maxOffense>=WATCHLIST_OFFENSE),topOffenders:ranked.filter(e=>e.violations).sort((a,b)=>b.violations-a.violations),departments,recentRemovals:removals};
}

export function monthlyTotals(violations,today=localDate(),months=6){
 const base=dateAtUTC(today);base.setUTCDate(1);
 return Array.from({length:months},(_,index)=>{const startDate=new Date(base);startDate.setUTCMonth(startDate.getUTCMonth()+index-months+1);const endDate=new Date(startDate);endDate.setUTCMonth(endDate.getUTCMonth()+1);endDate.setUTCDate(0);const start=startDate.toISOString().slice(0,10),end=endDate.toISOString().slice(0,10);return {start,end,current:start.slice(0,7)===today.slice(0,7),count:violations.filter(v=>{const date=String(v.date).slice(0,10);return retained(v)&&date>=start&&date<=end&&date<=today;}).length};});
}
