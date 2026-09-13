/**
 * Samostatný server (bez Netlify): servíruje public/ a obsluhuje /api stejným handlerem jako Netlify funkce.
 * Určeno pro VPS s pevnou IP adresou, kterou firewall SQL Serveru pouští.
 *   node server.mjs            (čte .env ve složce aplikace; PORT, HOST viz .env.example)
 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

/* .env bez závislosti na knihovně: KEY=value, řádky s # se přeskakují, proměnné z prostředí mají přednost */
try {
  const env = await readFile(path.join(ROOT, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
} catch { /* .env není – použijí se proměnné prostředí */ }

/* verze serveru: package.json + verze.json (zapisuje deploy/vps-deploy.sh: commit, větev, čas nasazení) */
try {
  const pkg = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
  process.env.APP_VERZE = pkg.version || '';
  try { const v = JSON.parse(await readFile(path.join(ROOT, 'verze.json'), 'utf8')); process.env.APP_COMMIT = v.commit || ''; process.env.APP_VETEV = v.vetev || ''; process.env.APP_NASAZENO = v.nasazeno || ''; } catch { /* bez verze.json (lokální běh) */ }
} catch { /* bez package.json */ }
process.env.APP_SPUSTENO = new Date().toISOString();

const { createHandler } = await import('./src/api.mjs');
const { dbs } = await import('./src/db.mjs');
const handle = createHandler({ dbs });

const PUBLIC = ROOT;   // stránka je v kořeni repozitáře (Index.html)
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      const chunks = []; for await (const c of req) chunks.push(c);
      const r = await handle(new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) }));
      res.writeHead(r.status, Object.fromEntries(r.headers));
      res.end(Buffer.from(await r.arrayBuffer()));
      return;
    }
    const rel = path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    const file = path.join(PUBLIC, rel === '' ? 'Index.html' : rel);
    if (!file.startsWith(PUBLIC)) { res.writeHead(403); res.end(); return; }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch (e) {
    if (e && e.code === 'ENOENT') { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Nenalezeno'); }
    else { console.error('[scandokumentu]', e); res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Chyba serveru'); }
  }
});

const port = Number(process.env.PORT || 3101);
const host = process.env.HOST || '127.0.0.1';
server.listen(port, host, () => console.log(`Log AI rozborů běží na http://${host}:${port}  (CLB1 ${process.env.SQL_SERVER || '?'})`));
