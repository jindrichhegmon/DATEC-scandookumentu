# AI rozbor dokumentů a WEBů

Jednostránková aplikace (`Index.html`) pro vytěžování informací z dokumentů pomocí AI.

Podklady lze zadat dvěma způsoby:

- **nahráním souboru** – PDF, JPG, PNG, WEBP, GIF, TXT, MD, CSV, DOCX,
- **odkazem na web** – z adresy se stáhne text stránky (u odkazu na PDF nebo obrázek rovnou soubor)
  a přidá se mezi ostatní podklady; prompt pak běží nad vším dohromady.

Zpracování probíhá buď přes scénář Make (`ScanDokumentu_Vytezeni`), nebo přímo přes Claude API
s vlastním klíčem — přepíná se v Nastavení.

## Načítání odkazů

Prohlížeč nesmí kvůli CORS číst cizí stránky přímo, proto je stahuje serverová funkce
`netlify/functions/fetch-url.js`, která se nasazuje spolu s webem (konfigurace v `netlify.toml`).
Funkce povoluje jen `http://` a `https://`, odmítá adresy do místní sítě a stahuje nejvýše 6 MB.
Pokud funkce není k dispozici (např. při otevření souboru z disku), aplikace zkusí stránku
stáhnout přímo z prohlížeče — to funguje jen u serverů, které to přes CORS povolují.

## Přístupový token

Aplikaci lze spustit až po zadání přístupového tokenu na úvodní obrazovce:

- **interní token `DATEC-SCAN-…`** — v kódu je uložen pouze jeho SHA-256 otisk
  (konstanta `AUTH_HASH` v `Index.html`); samotný token v repozitáři není,
- **nebo Claude API klíč (`sk-ant-…`)** — ten se zároveň uloží pro režim přímého volání Claude API.

Po úspěšném přihlášení se přihlášení uloží do prohlížeče (localStorage + cookie na 1 rok),
takže se token příště nezadává. Odhlásit se lze v Nastavení tlačítkem **Zamknout aplikaci**.

Změna interního tokenu = vygenerovat nový token, spočítat jeho SHA-256
(vstup se před hashováním převádí na velká písmena) a nahradit hodnotu `AUTH_HASH`.

## Ukládání dotazů do SQL (od verze 2.0 bez Make)

Každý úspěšný běh (prompt + odpověď) se ukládá do MS SQL **CLB1**, tabulky
**`dbo.CLB_SCANN_DOKUMENTU`** (sloupce `Id`, `Datum`, `Soubory`, `Prompt`, `Odpoved`,
`Rezim`, `Model`). Dřív to obstarával scénář Make **ScanDokumentu_LogSQL** (ID 9727444),
který skládal `INSERT` jako text a proti SQL injection spoléhal jen na zdvojení apostrofů.
Nově zápis obsluhuje **vlastní Node server na VPS** a hodnoty jdou jako parametry `@nazev`.
Selhání logování ani teď neblokuje práci s aplikací.

| Funkce | Cesta na serveru | Dříve (Make) |
|---|---|---|
| zápis dotazu a odpovědi | `POST /api/log` | webhook `73h5ub8h…` |
| náhled uložených záznamů | `POST /api/zaznamy` | tentýž webhook, větev `akce=nahled` |
| verze serveru | `GET /api/health` | — |
| diagnostika | `GET /api/diag` | — |

V sekci **Historie** je tlačítko **🗄️ Náhled**, které po zadání hesla načte uložené záznamy.
Heslo už není v kódu stránky ani ve scénáři, ale v `SCANLOG_HESLO`
v `/opt/datec-scandookumentu/.env` na serveru. Bez něj náhled vůbec nejde spustit.
Dřívější kontrolní klíč `SCANLOG-P6MZZP59` byl zrušen, nikdy nebyl tajný, byl vidět ve zdroji
stránky. Zápis do logu proto zůstává bez hesla, stejně jako dosud.

Tabulka v CLB1 už existuje; její definice je pro jistotu v `sql/00_tabulka.sql`, ale server
ji na rozdíl od scénáře Make před každým zápisem nezakládá.

**Vytěžování dokumentu AI zůstává na Make** (scénář `ScanDokumentu_Vytezeni`), případně jde
přímo na Claude API. S SQL Serverem nemá nic společného.

## Server na VPS

Běží v `/opt/datec-scandookumentu` (pm2, port 3101, Caddy `scandok.95-216-201-2.sslip.io`).
Netlify servíruje stránku a přeposílá `/api/*` na VPS podle `netlify.toml`, protože firewall
SQL Serveru pouští jen pevnou IP adresu VPS. Funkce `fetch-url` na Netlify zůstává beze změny.

Poprvé: na VPS vytvořit `/opt/datec-scandookumentu/.env` podle `.env.example` a přidat blok
z `deploy/Caddyfile.snippet` do `/etc/caddy/Caddyfile`. Potom z Macu ve složce projektu:

```
./deploy/vps-deploy.sh
```

Testy bez databáze: `npm test`. Lokální server nad mockem: `node test/dev-server.mjs` (port 8793).

