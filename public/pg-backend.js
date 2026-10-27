/* PinoGrotto: connects the page to its own backend on pinogrotto.com.
   It offers the same small interface the page was built against (db, user, sample, downloads),
   backed by the /api routes in functions/api/[[path]].js. */
(function () {
  "use strict";
  const PUBLIC_POLL = 30000, DESK_POLL = 8000;
  const FLAG = "pg-steward";
  let isEditor = false;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const err = (code, status) => Object.assign(new Error(code), { code, status });

  async function api(path, opts = {}) {
    let res;
    try {
      res = await fetch("/api/" + path, {
        credentials: "same-origin",
        cache: "no-store",
        redirect: "manual",
        ...opts,
        headers: { "Content-Type": "application/json", "X-PG": "1", ...(opts.headers || {}) },
      });
    } catch (e) {
      throw err("offline");
    }
    // Cloudflare Access answers a signed-out Steward with a redirect to its sign-in page.
    if (res.type === "opaqueredirect" || res.status === 401) throw err("signed_out", 401);
    if (!res.ok) {
      let body = {};
      try { body = await res.json(); } catch (e) {}
      throw err(body.error || "http_" + res.status, res.status);
    }
    return res.status === 204 ? null : res.json();
  }

  const snapDoc = (d) => ({ id: d.id, exists: true, data: () => clone(d.data) });
  const snapshot = (docs) => ({ docs: docs.map(snapDoc), size: docs.length, empty: !docs.length });

  /* ---------- live collections (polling) ---------- */
  const listeners = []; // { col, cb, onErr, last }
  let timer = null;

  async function fetchCols(cols) {
    const out = {};
    const pub = cols.filter((c) => c === "wines");
    const priv = cols.filter((c) => c !== "wines");
    if (pub.length) out.wines = (await api("col/wines")).docs;
    if (priv.length && isEditor) Object.assign(out, (await api("admin/cols?names=" + priv.join(","))).cols);
    return out;
  }

  async function refresh(onlyCol) {
    const cols = [...new Set(listeners.map((l) => l.col))].filter((c) => !onlyCol || c === onlyCol);
    if (!cols.length) return;
    let data;
    try {
      data = await fetchCols(cols);
    } catch (e) {
      listeners.filter((l) => cols.includes(l.col)).forEach((l) => { try { l.onErr && l.onErr(e); } catch (x) {} });
      if (e.code === "signed_out") signedOut();
      return;
    }
    for (const l of listeners) {
      if (!(l.col in data)) continue;
      const text = JSON.stringify(data[l.col]);
      if (text === l.last) continue;
      l.last = text;
      try { l.cb(snapshot(data[l.col])); } catch (e) { console.error(e); }
    }
  }

  function schedule() {
    clearTimeout(timer);
    const desk = listeners.some((l) => l.col !== "wines");
    timer = setTimeout(async () => {
      if (!document.hidden) await refresh();
      schedule();
    }, desk ? DESK_POLL : PUBLIC_POLL);
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });

  function signedOut() {
    if (!isEditor) return;
    isEditor = false;
    const bar = document.createElement("div");
    bar.setAttribute("role", "alert");
    bar.style.cssText = "position:fixed;left:16px;right:16px;bottom:16px;z-index:50;background:#7A3E26;color:#fff;padding:14px 18px;border-radius:2px;font:500 16px/1.4 system-ui,sans-serif;text-align:center";
    bar.innerHTML = 'Your Steward sign-in has expired. <a href="/steward" style="color:#fff;text-decoration:underline">Sign in again</a> to keep working.';
    document.body.appendChild(bar);
  }

  /* ---------- db ---------- */
  const db = {
    collection(col) {
      return {
        onSnapshot(cb, onErr) {
          const l = { col, cb, onErr, last: "" };
          listeners.push(l);
          refresh(col);
          schedule();
          return () => { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); };
        },
        async add(data) {
          const r = col === "requests" && !isEditor
            ? await api("requests", { method: "POST", body: JSON.stringify(data) })
            : await api("admin/col/" + encodeURIComponent(col), { method: "POST", body: JSON.stringify(data) });
          refresh(col);
          return { id: r.id };
        },
      };
    },
    doc(path) {
      const [col, id] = String(path).split("/");
      const at = "admin/doc/" + encodeURIComponent(col) + "/" + encodeURIComponent(id);
      const write = async (method, data) => {
        await api(at, { method, body: data === undefined ? undefined : JSON.stringify(data) });
        await refresh(col);
      };
      return {
        id,
        async get() {
          try {
            const r = col === "passports" && !isEditor ? await api("passport/" + encodeURIComponent(id)) : await api(at);
            return { id, exists: true, data: () => clone(r.data) };
          } catch (e) {
            if (e.status === 404) return { id, exists: false, data: () => undefined };
            throw e;
          }
        },
        set: (data) => write("PUT", data),
        update: (data) => write("PATCH", data),
        delete: () => write("DELETE"),
      };
    },
  };

  /* ---------- the signed-in Steward ---------- */
  const user = {
    async canEdit() {
      let flagged = false;
      try { flagged = localStorage.getItem(FLAG) === "1"; } catch (e) {}
      if (!flagged) return false;
      try {
        await api("admin/whoami");
        isEditor = true;
      } catch (e) {
        isEditor = false;
        if (e.code === "signed_out") {
          try { localStorage.removeItem(FLAG); } catch (x) {}
        }
      }
      return isEditor;
    },
  };

  /* ---------- "Find your match" ---------- */
  const sample = {
    async match(q, wines) {
      try {
        return await api("match", { method: "POST", body: JSON.stringify({ q, wines }) });
      } catch (e) {
        if (e.code === "ai_unavailable" || e.code === "not_configured") throw err("not_granted");
        throw e;
      }
    },
  };

  /* ---------- file downloads ---------- */
  const downloads = {
    async save({ filename, data }) {
      const blob = new Blob([data], { type: /\.html?$/i.test(filename) ? "text/html" : "application/octet-stream" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    },
  };

  const caps = { db, user, sample, downloads };
  window.PG = { use: async (name) => caps[name] || null };
})();
