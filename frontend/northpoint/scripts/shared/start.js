import {loadSession, sessionState, signOut} from './auth.js';
import {loadingSkeleton} from '../../src/shared/loading.js';
import {landingPage, roleLabels} from './permissions.js';

export async function startWorkspace(expectedRole) {
  const root = document.querySelector('#app');
  root.innerHTML = '<main id="main" class="session-gate">' + loadingSkeleton('rows', 'your workspace') + '</main>';
  await loadSession();
  if (sessionState.status !== 'ready' || !sessionState.role) {
    const retry = sessionState.status !== 'ready';
    showMessage(retry ? 'Unable to open Northpoint' : 'Workspace access unavailable',
      retry ? sessionState.error : 'Your sign-in session did not provide a recognized Northpoint role. Contact your administrator.',
      retry ? {label:'Try again', click:() => window.location.reload()} : null);
    return;
  }

  const role = sessionState.role;
  const url = new URL(role + '.html', location.href);
  if (!expectedRole) {
    url.hash = location.hash || '#' + landingPage(role);
    location.replace(url.href);
    return;
  }
  if (role !== expectedRole) {
    showMessage('Access denied', 'This page is reserved for ' + roleLabels[expectedRole] + '.',
      {label:'Open my workspace', click:() => location.replace(url.href)});
    return;
  }

  try {
    if (role === 'hr') await loadMapLibrary();
    await import('../../src/app.js');
  } catch (error) {
    console.error(error);
    showMessage('Unable to open Northpoint', 'The workspace could not load. Reload this page to try again.',
      {label:'Try again', click:() => window.location.reload()});
  }
}

function loadMapLibrary() {
  return new Promise(resolve => {
    const script = document.createElement('script');
    script.src = new URL('../../src/assets/vendor/leaflet/leaflet.js', import.meta.url).href;
    script.onload = script.onerror = resolve;
    document.head.append(script);
  });
}

function showMessage(title, message, action) {
  document.querySelector('#app').innerHTML = `<main id="main" class="session-gate">
    <section class="panel empty-state"><h1></h1><p role="alert"></p><div class="session-gate-actions"></div></section>
  </main>`;
  document.querySelector('.session-gate h1').textContent = title;
  document.querySelector('.session-gate p').textContent = message;
  if (action) addButton(action.label, action.click, 'primary');
  if (sessionState.status === 'ready') addButton('Sign out', signOut, 'secondary');
}

function addButton(label, click, variant) {
  const button = document.createElement('button');
  button.className = 'button ' + variant;
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', click);
  document.querySelector('.session-gate-actions').append(button);
}
