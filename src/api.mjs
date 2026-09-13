/**
 * HTTP vrstva (Request → Response), bez vazby na framework kvůli testům.
 *
 *   GET  /api/health                → verze webu a serveru
 *   GET  /api/diag                  → připojení, počet záznamů, zda je nastavené heslo náhledu
 *   POST /api/log      { soubory, prompt, odpoved, rezim, model }   → zapíše záznam
 *   POST /api/zaznamy  { heslo, limit }                             → vrátí uložené záznamy
 *
 * Přijímá JSON i formulářová data (stránka posílá FormData, stejně jako dřív do Make).
 * Zápis je bez hesla, stejně jako dosud – klíč ve stránce nikdy nebyl tajný, je vidět ve zdroji.
 * Náhled záznamů heslo vyžaduje (SCANLOG_HESLO v .env na serveru). CORS otevřený.
 */
import * as log from './log.mjs';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Accept' };
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS } });

/** Tělo požadavku: JSON, nebo formulář (multipart / urlencoded) – stránka posílá FormData. */
async function telo(req) {
  const typ = (req.headers.get('content-type') || '').toLowerCase();
  try {
    if (typ.includes('application/json')) return (await req.json()) || {};
    const fd = await req.formData();
    return Object.fromEntries([...fd.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : '']));
  } catch {
    throw Object.assign(new Error('Tělo požadavku se nepodařilo přečíst.'), { status: 400 });
  }
}

export function createHandler({ dbs }) {
  return async function handle(req) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '');
    const m = req.method.toUpperCase();
    try {
      if (m === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
      if (m === 'GET' && path === '/api/health') return json({ ok: true, cas: new Date().toISOString(), verze: process.env.APP_VERZE || '', commit: process.env.APP_COMMIT || '', vetev: process.env.APP_VETEV || '', nasazeno: process.env.APP_NASAZENO || '', spusteno: process.env.APP_SPUSTENO || '' });
      if (m === 'GET' && path === '/api/diag') return json({ ok: true, ...(await log.diagnostika(dbs)) });
      if (m === 'POST' && path === '/api/log') return json({ ok: true, ...(await log.zapis(dbs, await telo(req))) }, 201);
      if (m === 'POST' && path === '/api/zaznamy') return json({ ok: true, ...(await log.zaznamy(dbs, await telo(req))) });
      if (path.startsWith('/api/')) return json({ ok: false, error: m === 'GET' || m === 'POST' ? 'Neznámá cesta.' : 'Metoda není povolena.' }, m === 'GET' || m === 'POST' ? 404 : 405);
      return json({ ok: false, error: 'Neznámá cesta.' }, 404);
    } catch (e) {
      const status = e.status || 500;
      const msg = e.originalError?.message || e.message || String(e);
      const pretty = status >= 500 && /ETIMEOUT|ESOCKET|ECONNREFUSED|ECONNRESET|Failed to connect|timeout/i.test(msg + (e.code || '')) ? 'SQL Server je nedostupný: ' + msg : msg;
      if (status >= 500) console.error('[scandokumentu]', m, path, msg);
      return json({ ok: false, error: pretty }, status);
    }
  };
}
