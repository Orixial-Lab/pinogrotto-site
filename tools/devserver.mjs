// Local stand-in for Cloudflare Pages: serves site/public and routes /api/* to the real
// Pages Function, with D1 emulated on SQLite and Workers AI stubbed.
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { onRequest } from "./.fn.mjs";

const ROOT = path.resolve(new URL("../public", import.meta.url).pathname);
const PORT = Number(process.env.PORT || 8788);
const sqlite = new DatabaseSync(process.env.DB_FILE || ":memory:");

// --- minimal D1 emulation
function stmt(sql, args = []) {
  return {
    bind: (...a) => stmt(sql, a),
    first: async () => sqlite.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
    run: async () => { sqlite.prepare(sql).run(...args); return { success: true }; },
    _exec: () => (/^\s*(select|insert.*returning)/i.test(sql) ? sqlite.prepare(sql).all(...args) : sqlite.prepare(sql).run(...args)),
  };
}
const DB = { prepare: (sql) => stmt(sql), batch: async (list) => list.map((s) => s._exec()) };

// --- Workers AI stub: answers like the real model would
const AI = {
  async run(model, { messages }) {
    const q = messages[messages.length - 1].content.toLowerCase();
    if (/xyz|qwerty|ignore/.test(q)) return { response: '{"cape": null}' };
    const pick = /barolo|nebbiolo|syrah|rhone|hermitage/.test(q) ? ["Swartland Syrah", "syrah"] : /chablis|burgundy|chardonnay/.test(q) ? ["Hemel-en-Aarde Chardonnay", "chard"] : ["Stellenbosch Cabernet Sauvignon", "cab"];
    return { response: `Here you go: {"cape": "${pick[0]}", "why": "Similar structure and freshness from a cool, ocean-influenced site.", "wine": "${pick[1]}"}` };
  },
};

const env = {
  DB,
  AI: process.env.NO_AI ? undefined : AI,
  DEV_EDITOR_EMAIL: process.env.NO_EDITOR ? undefined : "terrilyn@pinogrotto.com",
  ACCESS_TEAM_DOMAIN: process.env.ACCESS_TEAM_DOMAIN,
  ACCESS_AUD: process.env.ACCESS_AUD,
};

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml" };

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
      const request = new Request(url, { method: req.method, headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : body });
      const waits = [];
      const out = await onRequest({ request, env, waitUntil: (p) => waits.push(p) });
      res.writeHead(out.status, Object.fromEntries(out.headers));
      res.end(Buffer.from(await out.arrayBuffer()));
      return;
    }
    let p = path.join(ROOT, decodeURIComponent(url.pathname));
    if (!p.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    try { if ((await stat(p)).isDirectory()) p = path.join(p, "index.html"); } catch (e) {}
    try {
      const data = await readFile(p);
      const csp = (await readFile(path.join(ROOT, "_headers"), "utf8")).match(/Content-Security-Policy: (.*)/)[1];
      res.writeHead(200, { "Content-Type": TYPES[path.extname(p)] || "application/octet-stream", ...(p.endsWith(".html") ? { "Content-Security-Policy": csp } : {}) });
      res.end(data);
    } catch (e) { res.writeHead(404); res.end("Not found"); }
  })
  .listen(PORT, () => console.log("PinoGrotto dev server on http://localhost:" + PORT));
