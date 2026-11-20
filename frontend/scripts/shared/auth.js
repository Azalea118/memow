import {dataSource} from './api.js';
import {normalizeRole, setIdentity} from './permissions.js';
import {store} from '../northpoint/state/data.js';
import {API_BASE_URL} from '../northpoint/api/hosted-api.js';

const anonymous = {role:'', employeeId:'', username:'', fullName:'', firstName:'', lastName:''};
export const sessionState = {status:'idle', error:'', ...anonymous};
let sessionPromise;

export function signOut() {
  globalThis.location.replace(new URL('/auth/logout', API_BASE_URL).href);
}

function redirectToLogin() {
  const page = globalThis.location;
  if (!page || page.origin !== new URL(API_BASE_URL).origin) return;
  const login = new URL('/auth/login', page.origin);
  login.searchParams.set('next', page.pathname + page.search + page.hash);
  page.replace(login.href);
}

export function loadSession() {
  if (sessionPromise) return sessionPromise;
  Object.assign(sessionState, {status:'loading', error:''});
  sessionPromise = (async () => {
    try {
      const raw = await dataSource.request({service:'session', path:'/me'});
      const username = typeof raw?.username === 'string' ? raw.username.trim() : '';
      if (!username) throw new Error('The sign-in service returned no username.');
      const firstName = typeof raw.first_name === 'string' ? raw.first_name.trim() : '';
      const lastName = typeof raw.last_name === 'string' ? raw.last_name.trim() : '';
      const fullName = (typeof raw.full_name === 'string' ? raw.full_name.trim() : '') ||
        [firstName, lastName].filter(Boolean).join(' ') || username;
      const role = normalizeRole(raw.role);
      const linkedId = String(raw.employee_id);
      const employeeId = /^[1-9]\d*$/.test(linkedId) && Number.isSafeInteger(Number(linkedId)) ? linkedId : '';
      setIdentity(role ? {role, employeeId} : null);
      Object.assign(sessionState, {status:'ready', role, employeeId, username, firstName, lastName, fullName, error:''});
      store.settings.name = fullName;
    } catch (error) {
      setIdentity(null);
      Object.assign(sessionState, {...anonymous, status:'error', error:error.message || 'Could not read your sign-in session.'});
      store.settings.name = '';
      if (error.status === 401) redirectToLogin();
    } finally {
      sessionPromise = null;
    }
  })();
  return sessionPromise;
}

// Other names are preserved exactly as returned by the API.
export function displayActor(value) {
  return sessionState.status === 'ready' && value === sessionState.username ? sessionState.fullName : value;
}
