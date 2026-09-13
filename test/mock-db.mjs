// Mock CLB1 pro testy a lokální dev server.
export const ZAZNAMY = [
  { Id: 2, Datum: '2026-09-13 09:12:00', Soubory: 'faktura.pdf', Prompt: 'vytěž částku', Odpoved: '12 500 Kč', Rezim: 'make', Model: 'gpt-5.4' },
  { Id: 1, Datum: '2026-09-12 16:40:00', Soubory: '', Prompt: 'shrň stránku', Odpoved: 'shrnutí…', Rezim: 'claude', Model: 'claude-fable-5-1' },
];
export function mockClb1(opts = {}) {
  const calls = [];
  return {
    name: 'clb1', calls,
    async query(sqlText, params) {
      calls.push({ sql: sqlText.replace(/\s+/g, ' ').trim(), params });
      if (/SELECT DB_NAME\(\)/.test(sqlText)) return [{ db: 'CLB1', server: 'MOCK', login: 'clb1_app' }];
      if (/COUNT\(\*\) AS n/.test(sqlText)) return [{ n: ZAZNAMY.length, posledni: ZAZNAMY[0].Datum }];
      if (/INSERT INTO dbo\.CLB_SCANN_DOKUMENTU/.test(sqlText)) return [{ id: 3 }];
      if (/FROM dbo\.CLB_SCANN_DOKUMENTU/.test(sqlText)) return ZAZNAMY.map(r => ({ ...r }));
      throw new Error('mock clb1: neočekávaný dotaz ' + sqlText);
    },
    async exec() { return opts.zmeneno === undefined ? 1 : opts.zmeneno; },
  };
}
export const mockDbs = (opts) => ({ clb1: mockClb1(opts) });
