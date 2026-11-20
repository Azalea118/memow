// View state only. Nothing is saved to browser storage or a database.
const defaults={organization:'Northpoint',textSize:'standard',name:''};
export const store={employees:[],violations:[],types:[],removals:[],activities:[],settings:{...defaults}};
export function saveStore() { /* Preferences apply to this open tab only. */ }
export function visibleEmployees() {
  return store.employees.slice();
}
export function visibleViolations() {
  const ids = new Set(visibleEmployees().map(employee => employee.id));
  return store.violations.filter(record => ids.has(record.employeeId));
}
export function employeeSummary(id) {
  const employee = store.employees.find(employee => employee.id === id);
  const violations = store.violations.filter(record => record.employeeId === id);
  const maxOffense=Math.max(0,...violations.map(v=>v.offenseNumber),...store.removals.filter(r=>r.employeeId===id).map(r=>r.offenseNumber));
  return {violations,total:employee?.activeCount??null,activeCount:employee?.activeCount??null,totalOffenses:employee?.totalOffenses??null,maxOffense,status:maxOffense>=2?'Repeated offenses':employee?.activeCount?'For review':'No active violations'};
}
