// Optional preview of the static frontend. Use the same server as /auth in production.
import http from 'node:http';
import {readFile} from 'node:fs/promises';

const preview = process.argv.includes('--rbac-preview') ? await import('./dev/rbac-preview.mjs') : null;
const port = Number(process.env.PORT ?? (preview ? 4175 : 4173));
const host = preview ? '127.0.0.1' : process.env.HOST || '127.0.0.1';
const contentTypes = {
  html:'text/html; charset=utf-8', js:'text/javascript; charset=utf-8',
  css:'text/css; charset=utf-8', png:'image/png', jpg:'image/jpeg', woff2:'font/woff2'
};
const entry = /^(?:index|hr|supervisor|c_manager|employee|login|camera)\.html$|^config\.js$/;
const asset = /^(?:css|scripts|src)\/(?:[a-z0-9_-]+\/)*[a-z0-9_.-]+\.(?:js|css|png|jpg|woff2)$/i;

const server = http.createServer(async (request, response) => {
  if (preview && request.headers.host !== '127.0.0.1:' + server.address().port) {
    response.writeHead(403).end('Open the preview using its local 127.0.0.1 address.');
    return;
  }
  const url = new URL(request.url, 'http://localhost');
  const role = preview?.previewRole(request);
  if (preview?.handlePreviewRequest(request, response, url, role)) return;
  const {pathname} = url;
  if (pathname === '/northpoint') {
    response.writeHead(308, {Location:'/northpoint/'}).end();
    return;
  }
  const path = pathname.replace(/^\/(?:northpoint\/)?/, '') || 'index.html';
  if (!['GET', 'HEAD'].includes(request.method) || (!entry.test(path) && path !== 'src/index.html' && !asset.test(path))) {
    response.writeHead(404).end('Not found');
    return;
  }
  try {
    let file = await readFile(new URL(path, import.meta.url));
    if (preview && path.endsWith('.html')) file = preview.previewPage(path, file.toString('utf8'), role);
    response.writeHead(200, {'Content-Type':contentTypes[path.split('.').at(-1)], 'Cache-Control':'no-store'});
    response.end(request.method === 'HEAD' ? undefined : file);
  } catch {
    response.writeHead(404).end('Not found');
  }
});
server.listen(port, host, () => {
  const url = 'http://' + host + ':' + server.address().port + '/';
  console.log(preview ? 'Development-only RBAC preview at ' + url : 'Static preview at ' + url + ' — use the backend server for authenticated workspaces.');
});
