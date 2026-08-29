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

## Ukládání dotazů do SQL

Každý úspěšný běh (prompt + odpověď) se odešle na Make webhook scénáře
**ScanDokumentu_LogSQL**, který jej zapíše do SQL databáze **CLB1**,
tabulky **`dbo.CLB_SCANN_DOKUMENTU`** (sloupce: `Id`, `Datum`, `Soubory`, `Prompt`,
`Odpoved`, `Rezim`, `Model`). Scénář vkládá záznamy s escapováním apostrofů a je chráněn
kontrolním klíčem; pokud tabulka neexistuje, při prvním zápisu si ji sám založí.
Selhání logování nijak neblokuje práci s aplikací.
