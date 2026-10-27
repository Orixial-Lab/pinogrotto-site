import { DatabaseSync } from "node:sqlite";
import { onRequest } from "./.fn.mjs";
const sqlite = new DatabaseSync(":memory:");
const st = (sql, a = []) => ({ bind: (...x) => st(sql, x), first: async () => sqlite.prepare(sql).get(...a) ?? null, all: async () => ({ results: sqlite.prepare(sql).all(...a) }), run: async () => sqlite.prepare(sql).run(...a), _exec: () => sqlite.prepare(sql).run(...a) });
const DB = { prepare: (s) => st(s), batch: async (l) => l.map((s) => s._exec()) };

const TEAM = "pinogrotto.cloudflareaccess.com", AUD = "aud-123";
const kp = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const other = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const jwk = { ...(await crypto.subtle.exportKey("jwk", kp.publicKey)), kid: "k1" };
const realFetch = globalThis.fetch;
globalThis.fetch = async (u) => String(u) === `https://${TEAM}/cdn-cgi/access/certs` ? new Response(JSON.stringify({ keys: [jwk] })) : realFetch(u);

const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
async function token(over = {}, { key = kp.privateKey, kid = "k1" } = {}) {
  const h = b64({ alg: "RS256", kid }), p = b64({ aud: [AUD], iss: `https://${TEAM}`, email: "terrilyn@pinogrotto.com", exp: Math.floor(Date.now() / 1000) + 3600, ...over });
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(h + "." + p));
  return h + "." + p + "." + Buffer.from(sig).toString("base64url");
}
const base = { DB, ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD };
async function who(tok, env = base, via = "header") {
  const headers = via === "header" ? { "Cf-Access-Jwt-Assertion": tok } : { Cookie: "x=1; CF_Authorization=" + tok };
  const r = await onRequest({ request: new Request("https://pinogrotto.com/api/admin/whoami", { headers }), env, waitUntil() {} });
  return r.status;
}
const cases = [
  ["valid token in header", await who(await token()), 200],
  ["valid token in cookie", await who(await token(), base, "cookie"), 200],
  ["no token", await who(""), 401],
  ["wrong audience", await who(await token({ aud: ["someone-else"] })), 401],
  ["wrong issuer", await who(await token({ iss: "https://evil.cloudflareaccess.com" })), 401],
  ["expired", await who(await token({ exp: Math.floor(Date.now() / 1000) - 10 })), 401],
  ["signed by another key", await who(await token({}, { key: other.privateKey })), 401],
  ["unknown key id", await who(await token({}, { kid: "nope" })), 401],
  ["alg none", await who(b64({ alg: "none", kid: "k1" }) + "." + b64({ aud: [AUD], iss: `https://${TEAM}`, email: "x@y.z", exp: 9e9 }) + "."), 401],
  ["email outside allow-list", await who(await token({ email: "someone@gmail.com" }), { ...base, EDITOR_EMAILS: "terrilyn@pinogrotto.com" }), 401],
  ["email inside allow-list", await who(await token(), { ...base, EDITOR_EMAILS: "Terrilyn@PinoGrotto.com, other@x.com" }), 200],
  ["Access not configured (fails closed)", await who(await token(), { DB }), 401],
  ["dev bypass ignored on real domain", await who("", { DB, DEV_EDITOR_EMAIL: "terrilyn@pinogrotto.com" }), 401],
];
let bad = 0;
for (const [name, got, want] of cases) { const ok = got === want; if (!ok) bad++; console.log((ok ? "PASS " : "FAIL ") + name + " -> " + got); }
console.log(bad ? bad + " FAILED" : "all " + cases.length + " passed");
process.exit(bad ? 1 : 0);
