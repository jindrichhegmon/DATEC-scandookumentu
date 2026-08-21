# Scan dokumenů a rozebrání AI

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
