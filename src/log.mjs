/**
 * Datová vrstva logu AI rozborů dokumentů – MS SQL CLB1, tabulka dbo.CLB_SCANN_DOKUMENTU.
 *
 * Dřív stránka posílala data do webhooku Make „ScanDokumentu_LogSQL" (ID 9727444), který skládal
 * INSERT jako text a apostrofy jen zdvojoval. Tady jsou stejné dva dotazy, ale hodnoty jdou
 * jako parametry `@nazev` a do textu příkazu se nikdy nevlepují.
 *
 * Délky se ořezávají stejně jako ve scénáři: Soubory 1000, Rezim 20, Model 100 znaků.
 * Prompt a Odpoved se neořezávají (sloupce jsou NVARCHAR(MAX)).
 */

const chyba = (zprava, status = 400) => Object.assign(new Error(zprava), { status });
const orez = (hodnota, maxDelka) => {
  const t = String(hodnota ?? '').trim();
  return t ? t.slice(0, maxDelka) : null;
};

export const SQL = {
  vlozZaznam: `INSERT INTO dbo.CLB_SCANN_DOKUMENTU (Soubory, Prompt, Odpoved, Rezim, Model)
    VALUES (@soubory, @prompt, @odpoved, @rezim, @model);
    SELECT CAST(SCOPE_IDENTITY() AS int) AS id`,

  zaznamy: `SELECT TOP (@limit) Id, CONVERT(varchar(19), Datum, 120) AS Datum, Soubory, Prompt, Odpoved, Rezim, Model
    FROM dbo.CLB_SCANN_DOKUMENTU ORDER BY Id DESC`,
};

/** Zápis jednoho dotazu a odpovědi. Volá se „fire and forget“, chyba nesmí rozbít práci s aplikací. */
export async function zapis(dbs, telo = {}) {
  const prompt = orez(telo.prompt, 1_000_000);
  const odpoved = orez(telo.odpoved, 1_000_000);
  if (!prompt && !odpoved) throw chyba('Zápis musí obsahovat prompt nebo odpověď.');
  const rows = await dbs.clb1.query(SQL.vlozZaznam, {
    soubory: orez(telo.soubory, 1000),
    prompt, odpoved,
    rezim: orez(telo.rezim, 20),
    model: orez(telo.model, 100),
  });
  return { id: rows[0] ? Number(rows[0].id) : null };
}

/**
 * Náhled uložených záznamů. Chrání ho heslo ze SCANLOG_HESLO v .env
 * (dřív bylo natvrdo ve scénáři Make). Bez nastaveného hesla se náhled nepustí vůbec.
 */
export async function zaznamy(dbs, telo = {}) {
  const ocekavane = String(process.env.SCANLOG_HESLO || '').trim();
  if (!ocekavane) throw chyba('Náhled záznamů není nastavený – chybí SCANLOG_HESLO v .env na serveru.', 503);
  const zadane = String(telo.heslo ?? '').trim();
  if (zadane !== ocekavane) throw chyba('Nesprávné heslo.', 401);
  const n = Number(telo.limit);
  const limit = Number.isFinite(n) && n >= 1 ? Math.min(Math.trunc(n), 5000) : 500;   // nesmysl → výchozích 500
  return { radky: await dbs.clb1.query(SQL.zaznamy, { limit }) };
}

export async function diagnostika(dbs) {
  const out = { spojeni: {}, tabulky: {}, nastaveni: { heslo_nahledu: process.env.SCANLOG_HESLO ? 'nastaveno' : 'CHYBÍ' } };
  try {
    const i = (await dbs.clb1.query('SELECT DB_NAME() AS db, @@SERVERNAME AS server, SUSER_SNAME() AS login'))[0] || {};
    out.spojeni.clb1 = { ok: true, ...i };
  } catch (e) { out.spojeni.clb1 = { ok: false, chyba: e.originalError?.message || e.message }; }
  try {
    const r = (await dbs.clb1.query('SELECT COUNT(*) AS n, MAX(CONVERT(varchar(19), Datum, 120)) AS posledni FROM dbo.CLB_SCANN_DOKUMENTU'))[0] || {};
    out.tabulky.log = { zdroj: 'dbo.CLB_SCANN_DOKUMENTU', radku: Number(r.n || 0), posledni: r.posledni || null };
  } catch (e) { out.tabulky.log = { zdroj: 'dbo.CLB_SCANN_DOKUMENTU', chyba: e.originalError?.message || e.message }; }
  return out;
}
