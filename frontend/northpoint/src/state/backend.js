import {canOpen} from '../../scripts/shared/permissions.js';
import {businessDate} from '../features/reports/yesterday.js';
import { apiRequest, paginatedApi, apiId } from '../api/api-client.js';
import { employeeDirectory, loadEmployeeDirectory, suspendEmployeeDirectory } from '../features/employees/employee-api.js';
import { store } from './data.js';

export const resources = Object.fromEntries(['records', 'types', 'activeTypes', 'removals', 'timeline', 'recent'].map(name => [name, { status: 'idle', items: [], error: '' }]));
let changed = () => {};
const requests = new Map();
export function watchBackend(listener) { changed = listener; }
function text(value, field, required = true) { if (value == null && !required) return ''; if (typeof value !== 'string' || required && !value.trim()) throw new Error(`The API returned an invalid ${field}. Please refresh.`); return value; }
function number(value, field) { if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`The API returned invalid ${field}. Please refresh.`); return value; }
function boolean(value, field) { if (typeof value !== 'boolean') throw new Error(`The API returned an invalid ${field}. Please refresh.`); return value; }
function timestamp(value, field) { const result = text(value, field); if (!/^\d{4}-\d{2}-\d{2}T/.test(result) || Number.isNaN(Date.parse(result))) throw new Error(`The API returned an invalid ${field}. Please refresh.`); return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(result)?result:result+'Z'; }
function offense(value){if(!Number.isSafeInteger(value)||value<1)throw new Error('The API returned an invalid offense number.');return value;}
export function normalizeType(raw, activeOnly = false) { return { id: apiId(raw?.id), name: text(raw.name, 'violation name'), description: activeOnly ? '' : text(raw.description, 'description', false), active: activeOnly ? true : boolean(raw.is_active, 'type status'), source: 'api' }; }
export function normalizeViolation(raw, employees = store.employees, allowSnapshot = false) {
  const employeeApiId = apiId(raw?.employee_id);
  const snapshot = allowSnapshot && raw.employee && String(raw.employee.id) === employeeApiId ? { id: text(raw.employee.employee_code, 'employee code'), apiId: employeeApiId, name: text(raw.employee.full_name, 'employee name'), source: 'api' } : null;
  const employee = employees.find(item => item.apiId === employeeApiId) || snapshot;
  if (!employee) throw new Error('A violation refers to an employee missing from the directory. Refresh the employee list.');
  const subsection=raw.subsection;
  const categoryId=subsection?.violation_type_id == null ? '' : apiId(subsection.violation_type_id);
  return { id:apiId(raw.id),apiId:apiId(raw.id),employeeId:employee.id,employeeApiId,employee,
    typeId:categoryId, categoryName:store.types.find(t=>t.id===categoryId)?.name || 'Category #'+categoryId,
    subsectionId:apiId(raw.subsection_id),typeName:text(subsection?.name,'specific violation'),
    offenseNumber:offense(raw.offense_number),penalty:text(raw.penalty_description,'penalty',false),
    date:businessDate(timestamp(raw.issued_at,'issue date')),issuedAt:timestamp(raw.issued_at,'issue date'),createdAt:raw.created_at?timestamp(raw.created_at,'creation date'):null,
    description:text(raw.notes,'notes',false),recordedBy:text(raw.issued_by,'issuer',false),source:'api'};
}
export function normalizeRemoval(raw) { return {id:apiId(raw.id),violationId:apiId(raw.violation_record_id),employeeApiId:apiId(raw.employee_id),employeeId:text(raw.employee_code,'employee code'),employeeName:text(raw.employee_full_name,'employee name'),typeId:raw.subsection_id==null?'':apiId(raw.subsection_id),subsectionId:raw.subsection_id==null?'':apiId(raw.subsection_id),typeName:text(raw.subsection_name,'specific violation'),categoryName:text(raw.violation_type_name,'category'),offenseNumber:number(raw.offense_number,'offense number'),penalty:text(raw.penalty_description,'penalty',false),reason:text(raw.reason,'removal reason',false),removedBy:text(raw.removed_by,'remover',false),date:timestamp(raw.removed_at,'removal date'),originalIssuedBy:text(raw.original_issued_by,'original issuer',false),originalNotes:text(raw.original_notes,'original notes',false),originalIssuedAt:timestamp(raw.original_issued_at,'original issue date'),source:'api'}; }
export function normalizeActivity(raw) { return { id: apiId(raw.id), date: timestamp(raw.occurred_at, 'activity date'), actor: text(raw.actor, 'actor', false), action: text(raw.action, 'action'), detail: text(raw.summary, 'activity summary', false), employeeApiId: raw.employee_id == null ? null : apiId(raw.employee_id), targetType: text(raw.target_type, 'target type'), targetId: raw.target_id == null ? null : String(raw.target_id), metadata: raw.metadata_json && typeof raw.metadata_json === 'object' ? raw.metadata_json : {}, source: 'api' }; }
function publish(name, resource) {
  if (name === 'records') { store.violations = resource.items; store.recordsReady = resource.status === 'ready'; }
  if (name === 'types') store.types = resource.items;
  if (name === 'removals') store.removals = resource.items;
  if (name === 'timeline') store.activities = resource.items;
  changed();
}
async function load(name, fetcher, force = false) {
  if (requests.has(name)) return requests.get(name).promise;
  if (!force && resources[name].status === 'ready') return;
  const token = { controller: new AbortController(), promise: null };
  requests.set(name, token);
  const resource = resources[name];
  Object.assign(resource, { status: 'loading', items: [], error: '' }); publish(name, resource);
  const request = (async () => {
    try { const items = await fetcher(token.controller.signal); if (requests.get(name) === token) Object.assign(resource, { status: 'ready', items, error: '' }); }
    catch (error) { if (requests.get(name) === token) Object.assign(resource, { status: 'error', items: [], error: error.message || 'Data could not be loaded. Please try again.' }); }
    finally { if (requests.get(name) === token) { requests.delete(name); publish(name, resource); } }
  })();
  token.promise = request; return request;
}
export async function refreshEmployees() {
  store.violations = []; store.recordsReady = false;
  for (const name of ['records','recent']) { requests.get(name)?.controller.abort(); requests.delete(name); Object.assign(resources[name], { status: 'idle', items: [], error: '' }); }
  await loadEmployeeDirectory(() => { store.employees = employeeDirectory.status === 'ready' ? employeeDirectory.items : []; changed(); });
}
export async function loadRecords(force = false) {
  if (employeeDirectory.status !== 'ready') return;
  const employees = employeeDirectory.items.slice();
  return load('records', async signal => {
    await loadTypes();
    if(resources.types.status!=='ready')throw new Error(resources.types.error);
    const records = [], ids = new Set(); let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(4, employees.length) }, async () => {
      while (cursor < employees.length) {
        const employee = employees[cursor++], raw = await paginatedApi(`/employees/${apiId(employee.apiId)}/violations`, { array: true, signal });
        for (const item of raw) { if (String(item.employee_id) !== employee.apiId || ids.has(String(item.id))) throw new Error('The API returned inconsistent employee violation records. Please refresh.'); ids.add(String(item.id)); records.push(normalizeViolation(item, employees)); }
      }
    }));
    return records.sort((a, b) => b.issuedAt.localeCompare(a.issuedAt) || Number(b.id) - Number(a.id));
  }, force);
}
export function loadTypes(force = false) { return load('types', async () => { const raw = await apiRequest('/violation-types/all', { query: { include_inactive: true } }); if (!Array.isArray(raw)) throw new Error('The API returned an unexpected violation type list.'); return raw.map(item => normalizeType(item)); }, force); }
export function loadActiveTypes(force = false) { return load('activeTypes', async () => { const raw = await apiRequest('/violation-types'); if (!Array.isArray(raw)) throw new Error('The API returned an unexpected active type list.'); return raw.map(item => normalizeType(item, true)); }, force); }
export function loadRemovals(force = false) { return load('removals', async () => (await paginatedApi('/violation-removals')).map(normalizeRemoval), force); }
export function loadTimeline(force = false) { return load('timeline', async () => (await paginatedApi('/activity/timeline')).map(normalizeActivity), force); }
export function loadRecent(force = false) { const employees = store.employees.slice(); return load('recent', async signal => { const raw = await apiRequest('/violations/recent', { query: { days: 14, limit: 5 }, signal }); if (!Array.isArray(raw)) throw new Error('The API returned an unexpected recent activity list.'); return raw.map(item => normalizeViolation(item, employees, true)); }, force); }
export async function refreshWorkspace() {
  const independent = Promise.all([loadTypes(true), ...(canOpen('history') ? [loadRemovals(true), loadTimeline(true)] : [])]);
  await refreshEmployees();
  if (employeeDirectory.status === 'ready') await Promise.all([loadRecords(true), loadRecent(true)]);
  await independent;
}
export function ensurePageData(page) {
  if (!canOpen(page) || page === 'mine') return;
  if (['dashboard', 'violations', 'profile', 'reports', 'employees'].includes(page) && resources.records.status === 'idle' && employeeDirectory.status === 'ready') void loadRecords();
  if (page === 'dashboard' && resources.recent.status === 'idle' && employeeDirectory.status === 'ready') void loadRecent();
  if (['types', 'violations', 'reports'].includes(page) && resources.types.status === 'idle') void loadTypes();
  if (canOpen('history')&&['dashboard','reports'].includes(page)&&resources.timeline.status==='idle')void loadTimeline();
  if (canOpen('history')&&['dashboard','reports','employees','profile'].includes(page)&&resources.removals.status==='idle')void loadRemovals();
  if (page === 'history') { if (resources.timeline.status === 'idle') void loadTimeline(); if (resources.removals.status === 'idle') void loadRemovals(); }
}
