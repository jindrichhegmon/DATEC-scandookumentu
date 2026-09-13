// npm test – API a datová vrstva nad mockem CLB1 (bez SQL Serveru a bez internetu)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../src/api.mjs';
import { SQL } from '../src/log.mjs';
import { mockDbs, ZAZNAMY } from './mock-db.mjs';

const call = (handle, path, init) => handle(new Request('http://x' + path, init)).then(async r => ({ status: r.status, hlavicky: r.headers, body: await r.json() }));
const postJson = (handle, path, body) => call(handle, path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('zápis logu jde do CLB1 s parametry, ne vlepováním do textu dotazu', async () => {
  const dbs = mockDbs();
  const r = await postJson(createHandler({ dbs }), '/api/log', {
    soubory: 'faktura.pdf', prompt: "vytěž 'částku'", odpoved: '12 500 Kč', rezim: 'make', model: 'gpt-5.4',
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.id, 3);
  const zapis = dbs.clb1.calls[0];
  assert.equal(zapis.params.prompt, "vytěž 'částku'");
  assert.ok(!/vytěž/.test(zapis.sql), 'prompt není součástí textu dotazu');
  assert.ok(/@soubory, @prompt, @odpoved, @rezim, @model/.test(zapis.sql));
});

test('stránka posílá formulář, server ho přijme stejně jako JSON', async () => {
  const dbs = mockDbs();
  const fd = new FormData();
  fd.append('soubory', 'a.pdf');
  fd.append('prompt', 'shrň');
  fd.append('odpoved', 'shrnutí');
  fd.append('rezim', 'claude');
  fd.append('model', 'claude-fable-5-1');
  const r = await createHandler({ dbs })(new Request('http://x/api/log', { method: 'POST', body: fd }));
  assert.equal(r.status, 201);
  assert.equal(dbs.clb1.calls[0].params.rezim, 'claude');
});

test('délky se ořezávají stejně jako dřív ve scénáři Make', async () => {
  const dbs = mockDbs();
  await postJson(createHandler({ dbs }), '/api/log', {
    soubory: 'x'.repeat(1500), prompt: 'p', odpoved: 'o', rezim: 'y'.repeat(50), model: 'z'.repeat(200),
  });
  const p = dbs.clb1.calls[0].params;
  assert.equal(p.soubory.length, 1000);
  assert.equal(p.rezim.length, 20);
  assert.equal(p.model.length, 100);
});

test('prázdný zápis se odmítne a nic se neuloží', async () => {
  const dbs = mockDbs();
  const r = await postJson(createHandler({ dbs }), '/api/log', { soubory: 'a.pdf' });
  assert.equal(r.status, 400);
  assert.equal(dbs.clb1.calls.length, 0);
});

test('náhled záznamů chrání heslo ze serveru, ne z kódu stránky', async () => {
  const dbs = mockDbs();
  const handle = createHandler({ dbs });

  delete process.env.SCANLOG_HESLO;
  const bezHesla = await postJson(handle, '/api/zaznamy', { heslo: 'cokoliv' });
  assert.equal(bezHesla.status, 503, 'bez SCANLOG_HESLO se náhled nepustí vůbec');

  process.env.SCANLOG_HESLO = 'tajne-heslo';
  const spatne = await postJson(handle, '/api/zaznamy', { heslo: 'jine' });
  assert.equal(spatne.status, 401);
  assert.equal(dbs.clb1.calls.length, 0, 'při špatném hesle se do databáze nesahá');

  const dobre = await postJson(handle, '/api/zaznamy', { heslo: 'tajne-heslo' });
  assert.equal(dobre.status, 200);
  assert.deepEqual(dobre.body.radky.map(r => r.Id), ZAZNAMY.map(r => r.Id));
  assert.equal(dbs.clb1.calls[0].params.limit, 500);
  delete process.env.SCANLOG_HESLO;
});

test('limit náhledu se drží v rozumných mezích', async () => {
  process.env.SCANLOG_HESLO = 'h';
  const dbs = mockDbs();
  const handle = createHandler({ dbs });
  await postJson(handle, '/api/zaznamy', { heslo: 'h', limit: 99999 });
  assert.equal(dbs.clb1.calls[0].params.limit, 5000);
  await postJson(handle, '/api/zaznamy', { heslo: 'h', limit: -5 });
  assert.equal(dbs.clb1.calls[1].params.limit, 500);
  delete process.env.SCANLOG_HESLO;
});

test('dotazy nepouští předaný text a mažou ani neruší nic v databázi', () => {
  for (const [nazev, text] of Object.entries(SQL)) {
    assert.doesNotMatch(text, /@sql|sp_executesql|EXEC\b|\bDROP\b|\bDELETE\b|\bTRUNCATE\b|\bUPDATE\b/i, nazev);
  }
});

test('health, diag, neznámá cesta a CORS', async () => {
  process.env.APP_VERZE = '2.0.0';
  delete process.env.SCANLOG_HESLO;
  const handle = createHandler({ dbs: mockDbs() });
  const h = await call(handle, '/api/health');
  assert.equal(h.body.verze, '2.0.0');
  assert.equal(h.hlavicky.get('access-control-allow-origin'), '*');

  const d = await call(handle, '/api/diag');
  assert.equal(d.body.spojeni.clb1.db, 'CLB1');
  assert.equal(d.body.tabulky.log.radku, 2);
  assert.equal(d.body.nastaveni.heslo_nahledu, 'CHYBÍ');

  assert.equal((await call(handle, '/api/neco')).status, 404);
  assert.equal((await call(handle, '/api/log', { method: 'GET' })).status, 404);
});
