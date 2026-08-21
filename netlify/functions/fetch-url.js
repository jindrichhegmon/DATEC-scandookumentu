"use strict";
/**
 * Serverový proxy pro načtení webové stránky (nebo PDF/obrázku) z odkazu.
 * Prohlížeč nemůže cizí stránky číst přímo kvůli CORS, proto je stáhne tato funkce.
 *
 * Vstup:  GET  /.netlify/functions/fetch-url?url=https://…
 *         POST /.netlify/functions/fetch-url  {"url":"https://…"}
 * Výstup: {"finalUrl","contentType","encoding":"text"|"base64","body"}
 */

const dns = require("dns").promises;
const net = require("net");

/* Netlify ukončí funkci po 10 s — vlastní rozpočet musí být kratší, aby stihla vrátit
   srozumitelnou chybu místo holé 502/503 od Netlify. */
const BUDGET_MS = 8000;
/* Odpověď funkce smí mít nejvýš 6 MB, base64 obsah je o třetinu delší než originál. */
const MAX_TEXT_BYTES = 4 * 1024 * 1024;
const MAX_BINARY_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function json(statusCode, obj) {
  return { statusCode, headers: { "Content-Type": "application/json; charset=utf-8", ...CORS }, body: JSON.stringify(obj) };
}

/* Neveřejné rozsahy — ochrana proti čtení vnitřní sítě přes tuto funkci */
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const p = ip.split(".").map(Number);
    if (p[0] === 10 || p[0] === 127 || p[0] === 0) return true;
    if (p[0] === 169 && p[1] === 254) return true;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true;
    if (p[0] >= 224) return true;
    return false;
  }
  const v6 = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (v6 === "::1" || v6 === "::") return true;
  if (v6.startsWith("fe80") || v6.startsWith("fc") || v6.startsWith("fd")) return true;
  if (v6.startsWith("::ffff:")) return isPrivateIp(v6.slice(7));
  return false;
}

async function assertPublicUrl(u) {
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("Podporovány jsou pouze odkazy http:// a https://.");
  }
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("Odkazy do místní sítě nelze načíst.");
  }
  let addrs;
  if (net.isIP(host)) {
    addrs = [{ address: host }];
  } else {
    try {
      addrs = await dns.lookup(host, { all: true });
    } catch {
      throw new Error(`Doménu „${host}" se nepodařilo najít.`);
    }
  }
  if (addrs.some(a => isPrivateIp(a.address))) {
    throw new Error("Odkazy do místní sítě nelze načíst.");
  }
}

/* Stahování s hlídáním velikosti */
async function readCapped(resp, maxBytes) {
  const limitMb = (maxBytes / 1024 / 1024).toFixed(0);
  const len = Number(resp.headers.get("content-length") || 0);
  if (len && len > maxBytes) {
    throw new Error(`Obsah odkazu je příliš velký (${(len / 1024 / 1024).toFixed(1)} MB, limit ${limitMb} MB).`);
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of resp.body) {
    const buf = Buffer.from(chunk);
    total += buf.length;
    if (total > maxBytes) throw new Error(`Obsah odkazu je příliš velký (limit ${limitMb} MB).`);
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

/* Přesměrování řešíme ručně, aby se kontrolovala i cílová adresa */
async function fetchFollowing(startUrl, deadline) {
  let current = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const left = deadline - Date.now();
    if (left <= 300) throw new Error("TIMEOUT");
    const u = new URL(current);
    await assertPublicUrl(u);
    const resp = await fetch(u.href, {
      redirect: "manual",
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/pdf,text/plain,image/*;q=0.8,*/*;q=0.5",
        "Accept-Language": "cs,sk;q=0.9,en;q=0.8",
        "Accept-Encoding": "gzip, deflate, br"
      },
      signal: AbortSignal.timeout(left)
    });
    if (resp.status >= 300 && resp.status < 400 && resp.headers.get("location")) {
      current = new URL(resp.headers.get("location"), u.href).href;
      if (resp.body) { try { await resp.body.cancel(); } catch {} }
      continue;
    }
    return { resp, finalUrl: u.href };
  }
  throw new Error("Odkaz obsahuje příliš mnoho přesměrování.");
}

exports.handler = async event => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };

  let target = (event.queryStringParameters && event.queryStringParameters.url) || "";
  if (!target && event.body) {
    try { target = (JSON.parse(event.body) || {}).url || ""; } catch {}
  }
  target = String(target).trim();
  if (!target) return json(400, { error: "Chybí parametr url." });
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(target)) target = "https://" + target;

  let parsed;
  try { parsed = new URL(target); } catch { return json(400, { error: "Neplatná adresa odkazu." }); }

  const deadline = Date.now() + BUDGET_MS;
  try {
    const { resp, finalUrl } = await fetchFollowing(parsed.href, deadline);
    if (!resp.ok) {
      let msg = `Server stránky vrátil chybu ${resp.status} ${resp.statusText || ""}`.trim() + ".";
      if ([401, 403, 405, 406, 429].includes(resp.status)) {
        msg += " Stránka nejspíš blokuje automatické stahování — uložte ji v prohlížeči jako PDF a nahrajte jako soubor.";
      }
      return json(502, { error: msg });
    }
    const contentType = (resp.headers.get("content-type") || "application/octet-stream").toLowerCase();
    const isText = /^(text\/|application\/(json|xml|xhtml\+xml|javascript))/.test(contentType);
    const buf = await readCapped(resp, isText ? MAX_TEXT_BYTES : MAX_BINARY_BYTES);

    return json(200, {
      finalUrl,
      contentType,
      encoding: isText ? "text" : "base64",
      body: isText ? buf.toString("utf8") : buf.toString("base64")
    });
  } catch (e) {
    const timedOut = (e && (e.name === "TimeoutError" || e.message === "TIMEOUT")) || Date.now() >= deadline;
    if (timedOut) {
      return json(504, { error: `Stránka neodpověděla do ${BUDGET_MS / 1000} s — server je pomalý nebo požadavek odmítá. Zkuste odkaz na konkrétní podstránku, nebo stránku uložte jako PDF a nahrajte jako soubor.` });
    }
    const c = e && e.cause;
    const code = (c && c.code) || (c && Array.isArray(c.errors) && c.errors[0] && c.errors[0].code) || "";
    let msg = (e && e.message) || "Odkaz se nepodařilo načíst";
    if (msg === "fetch failed") {
      msg = "Se serverem stránky se nepodařilo spojit" + (code ? ` (${code})` : "");
    } else if (code) {
      msg += ` (${code})`;
    }
    return json(502, { error: /[.!?]$/.test(msg) ? msg : msg + "." });
  }
};
