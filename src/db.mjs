/**
 * Připojení k databázím – každé spojení má vlastní pool a rozhraní { query, exec }.
 *
 *   clb1 … SQL Server CLB1 (SQL_SERVER, SQL_PORT, SQL_DATABASE, SQL_USER, SQL_PASSWORD) – tabulka CLB_SCANN_DOKUMENTU (log dotazů a odpovědí AI rozboru)
 *
 * Parametry vždy přes @nazev – hodnoty se nikdy nelepí do textu dotazu.
 */
import sql from 'mssql';

const env = (k, d = '') => (process.env[k] ?? d).toString().trim();
const bool = (k, d) => { const v = env(k); return v === '' ? d : /^(1|true|yes|ano)$/i.test(v); };

export function mssqlConfig() {
  const cfg = {
    server: env('SQL_SERVER'), port: Number(env('SQL_PORT', '1433')), database: env('SQL_DATABASE', 'CLB1'),
    user: env('SQL_USER'), password: env('SQL_PASSWORD'),
    connectionTimeout: 15000, requestTimeout: Number(env('SQL_TIMEOUT_MS', '30000')),
    pool: { max: 4, min: 0, idleTimeoutMillis: 60000 },
    options: { encrypt: bool('SQL_ENCRYPT', true), trustServerCertificate: bool('SQL_TRUST_CERT', true), enableArithAbort: true, useUTC: false },
  };
  const missing = ['SQL_SERVER', 'SQL_USER', 'SQL_PASSWORD'].filter(k => !env(k));
  if (missing.length) throw new Error(`Chybí nastavení SQL (${missing.join(', ')}) v proměnných prostředí.`);
  return cfg;
}
let mssqlPool = null;
function mssqlConnect() {
  if (!mssqlPool) {
    mssqlPool = new sql.ConnectionPool(mssqlConfig()).connect();
    mssqlPool.catch(() => { mssqlPool = null; });
  }
  return mssqlPool;
}
function bind(request, params) {
  for (const [k, v] of Object.entries(params || {})) {
    if (v instanceof Date) request.input(k, sql.DateTime2, v);
    else if (typeof v === 'number' && Number.isInteger(v)) request.input(k, sql.Int, v);
    else if (typeof v === 'number') request.input(k, sql.Float, v);
    else if (typeof v === 'boolean') request.input(k, sql.Bit, v);
    else request.input(k, sql.NVarChar(sql.MAX), v === undefined ? null : v);
  }
  return request;
}
export const clb1 = {
  name: 'clb1',
  async query(text, params) { const p = await mssqlConnect(); return (await bind(p.request(), params).query(text)).recordset || []; },
  async exec(text, params) { const p = await mssqlConnect(); return ((await bind(p.request(), params).query(text)).rowsAffected || []).reduce((a, b) => a + b, 0); },
  /** transakce (nepoužívá se – aplikace jen čte) */
  async transaction(fn) {
    const p = await mssqlConnect();
    const tx = new sql.Transaction(p);
    await tx.begin();
    const t = {
      query: async (text, params) => (await bind(new sql.Request(tx), params).query(text)).recordset || [],
      exec: async (text, params) => ((await bind(new sql.Request(tx), params).query(text)).rowsAffected || []).reduce((a, b) => a + b, 0),
    };
    try { const out = await fn(t); await tx.commit(); return out; }
    catch (e) { try { await tx.rollback(); } catch { /* už odvoláno */ } throw e; }
  },
};

export const dbs = { clb1 };
