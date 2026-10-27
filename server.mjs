import http from "node:http";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { FamilyStore } from "./lib/store.mjs";
import { addAudit, createParentLink, createPerson, createUnion, describeRelationship, LIFE_STATUSES, PARENT_TYPES, UNION_STATUSES, UNION_TYPES, clean } from "./lib/domain.mjs";

const port = Number(process.env.PORT || 3000);
const production = process.env.NODE_ENV === "production";
const sessionSecret = process.env.SESSION_SECRET || (production ? "" : "local-development-session-secret-change-me");
if (!sessionSecret || sessionSecret.length < 24) throw new Error("SESSION_SECRET must be at least 24 characters");
const store = new FamilyStore();
await store.init();

const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json; charset=utf-8", ".woff2": "font/woff2" };
const fontAssets = new Map([
  ["/fonts/inter-latin.woff2", new URL("./node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2", import.meta.url)],
  ["/fonts/inter-latin-italic.woff2", new URL("./node_modules/@fontsource-variable/inter/files/inter-latin-wght-italic.woff2", import.meta.url)],
  ["/fonts/lora-latin.woff2", new URL("./node_modules/@fontsource-variable/lora/files/lora-latin-wght-normal.woff2", import.meta.url)],
  ["/fonts/lora-latin-italic.woff2", new URL("./node_modules/@fontsource-variable/lora/files/lora-latin-wght-italic.woff2", import.meta.url)],
  ["/fonts/special-elite-latin.woff2", new URL("./node_modules/@fontsource/special-elite/files/special-elite-latin-400-normal.woff2", import.meta.url)]
]);
const roleRank = { viewer: 1, editor: 2, admin: 3 };

function sign(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", sessionSecret).update(data).digest("base64url");
  return `${data}.${signature}`;
}

function verify(token) {
  try {
    const [data, signature] = String(token || "").split(".");
    const expected = createHmac("sha256", sessionSecret).update(data).digest("base64url");
    const a = Buffer.from(signature || ""); const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
    return payload.exp > Date.now() ? payload : null;
  } catch { return null; }
}

function cookies(request) {
  return Object.fromEntries(String(request.headers.cookie || "").split(";").map((pair) => pair.trim().split(/=(.*)/s)).filter(([key]) => key));
}

function user(request) { return verify(cookies(request).roots_session); }

function requireRole(request, role) {
  const actor = user(request);
  if (!actor) throw Object.assign(new Error("Sign in required"), { status: 401 });
  if ((roleRank[actor.role] || 0) < roleRank[role]) throw Object.assign(new Error(`${role} role required`), { status: 403 });
  return actor;
}

async function jsonBody(request) {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 1_000_000) throw Object.assign(new Error("Request body is too large"), { status: 413 });
  }
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw Object.assign(new Error("Invalid JSON"), { status: 400 }); }
}

function headers(extra = {}) {
  return {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; font-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    ...extra
  };
}

function send(response, status, data, extra = {}) {
  response.writeHead(status, headers({ "Content-Type": "application/json; charset=utf-8", ...extra }));
  response.end(JSON.stringify(data));
}

function safeEqualText(actual, expected) {
  const a = Buffer.from(String(actual || "")); const b = Buffer.from(String(expected || ""));
  return a.length === b.length && timingSafeEqual(a, b);
}

function authenticate(email, password) {
  const development = !production;
  const accounts = [
    { email: process.env.ADMIN_EMAIL || "admin@roots.local", password: process.env.ADMIN_PASSWORD || (development ? "admin-demo" : ""), role: "admin", name: "Tree Administrator" },
    { email: process.env.EDITOR_EMAIL || "editor@roots.local", password: process.env.EDITOR_PASSWORD || (development ? "editor-demo" : ""), role: "editor", name: "Family Editor" }
  ];
  return accounts.find((account) => account.password && account.email.toLowerCase() === String(email || "").toLowerCase() && safeEqualText(password, account.password)) || null;
}

function publicSnapshot(actor) {
  const state = store.snapshot();
  if (actor) return state;
  const visibleIds = new Set(state.people.filter((p) => !p.archivedAt && p.privacy === "public").map((p) => p.id));
  return {
    ...state,
    people: state.people.filter((p) => visibleIds.has(p.id)),
    unions: state.unions.filter((u) => !u.archivedAt && u.privacy === "public" && u.partnerIds.every((id) => visibleIds.has(id))),
    parentLinks: state.parentLinks.filter((l) => !l.archivedAt && l.privacy === "public" && visibleIds.has(l.parentId) && visibleIds.has(l.childId)),
    stories: state.stories.filter((s) => s.visibility === "public"),
    audit: []
  };
}

async function api(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/bootstrap") {
    const actor = user(request);
    return send(response, 200, {
      currentUser: actor ? { email: actor.email, name: actor.name, role: actor.role } : null,
      state: publicSnapshot(actor),
      options: { lifeStatuses: LIFE_STATUSES, unionStatuses: UNION_STATUSES, unionTypes: UNION_TYPES, parentTypes: PARENT_TYPES },
      developmentLoginHint: production ? null : { admin: "admin@roots.local / admin-demo", editor: "editor@roots.local / editor-demo" }
    });
  }
  if (request.method === "POST" && url.pathname === "/api/auth/login") {
    const input = await jsonBody(request);
    const account = authenticate(input.email, input.password);
    if (!account) return send(response, 401, { error: "Invalid email or password" });
    const token = sign({ id: randomUUID(), email: account.email, name: account.name, role: account.role, exp: Date.now() + 8 * 60 * 60 * 1000 });
    return send(response, 200, { user: { email: account.email, name: account.name, role: account.role } }, { "Set-Cookie": `roots_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800${production ? "; Secure" : ""}` });
  }
  if (request.method === "POST" && url.pathname === "/api/auth/logout") return send(response, 200, { ok: true }, { "Set-Cookie": "roots_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" });
  if (request.method === "POST" && url.pathname === "/api/relationships/explain") {
    requireRole(request, "viewer");
    const input = await jsonBody(request);
    return send(response, 200, describeRelationship(store.snapshot(), input.fromId, input.toId));
  }
  if (request.method === "POST" && url.pathname === "/api/people") {
    const actor = requireRole(request, "editor"); const input = await jsonBody(request);
    const created = await store.mutate((state) => { const person = createPerson(input); state.people.push(person); addAudit(state, actor, "create", "person", person.id, `Added ${person.displayName}`); return person; });
    return send(response, 201, { person: created });
  }
  const personMatch = url.pathname.match(/^\/api\/people\/([^/]+)$/);
  if (personMatch && request.method === "PATCH") {
    const actor = requireRole(request, "editor"); const input = await jsonBody(request); const id = decodeURIComponent(personMatch[1]);
    const updated = await store.mutate((state) => {
      const index = state.people.findIndex((p) => p.id === id && !p.archivedAt); if (index < 0) throw Object.assign(new Error("Person not found"), { status: 404 });
      const next = createPerson({ ...state.people[index], ...input, id, createdAt: state.people[index].createdAt }); state.people[index] = next;
      addAudit(state, actor, "update", "person", id, `Updated ${next.displayName}`); return next;
    });
    return send(response, 200, { person: updated });
  }
  if (personMatch && request.method === "DELETE") {
    const actor = requireRole(request, "admin"); const id = decodeURIComponent(personMatch[1]);
    await store.mutate((state) => {
      const person = state.people.find((p) => p.id === id && !p.archivedAt); if (!person) throw Object.assign(new Error("Person not found"), { status: 404 });
      person.archivedAt = new Date().toISOString(); addAudit(state, actor, "archive", "person", id, `Archived ${person.displayName}`);
    });
    return send(response, 200, { archived: true });
  }
  if (request.method === "POST" && url.pathname === "/api/unions") {
    const actor = requireRole(request, "editor"); const input = await jsonBody(request);
    const union = await store.mutate((state) => { const item = createUnion(state, input); state.unions.push(item); addAudit(state, actor, "create", "union", item.id, `Created ${item.type}`); return item; });
    return send(response, 201, { union });
  }
  const unionMatch = url.pathname.match(/^\/api\/unions\/([^/]+)$/);
  if (unionMatch && request.method === "DELETE") {
    const actor = requireRole(request, "admin"); const id = decodeURIComponent(unionMatch[1]);
    await store.mutate((state) => {
      const union = state.unions.find((item) => item.id === id && !item.archivedAt); if (!union) throw Object.assign(new Error("Union not found"), { status: 404 });
      union.archivedAt = new Date().toISOString(); addAudit(state, actor, "archive", "union", id, `Archived ${union.type}`);
    });
    return send(response, 200, { archived: true });
  }
  if (request.method === "POST" && url.pathname === "/api/parent-links") {
    const actor = requireRole(request, "editor"); const input = await jsonBody(request);
    const link = await store.mutate((state) => { const item = createParentLink(state, input); state.parentLinks.push(item); addAudit(state, actor, "create", "parent_link", item.id, `Connected parent and child`); return item; });
    return send(response, 201, { link });
  }
  const linkMatch = url.pathname.match(/^\/api\/parent-links\/([^/]+)$/);
  if (linkMatch && request.method === "DELETE") {
    const actor = requireRole(request, "admin"); const id = decodeURIComponent(linkMatch[1]);
    await store.mutate((state) => {
      const link = state.parentLinks.find((item) => item.id === id && !item.archivedAt); if (!link) throw Object.assign(new Error("Parent link not found"), { status: 404 });
      link.archivedAt = new Date().toISOString(); addAudit(state, actor, "archive", "parent_link", id, "Archived parent-child relationship");
    });
    return send(response, 200, { archived: true });
  }
  return send(response, 404, { error: "API route not found" });
}

async function staticFile(response, pathname) {
  if (fontAssets.has(pathname)) {
    const content = await readFile(fontAssets.get(pathname));
    response.writeHead(200, headers({ "Content-Type": mime[".woff2"], "Cache-Control": "public, max-age=31536000, immutable" }));
    response.end(content); return;
  }
  const requested = pathname === "/" ? "/index.html" : pathname;
  const cleanPath = normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const publicRoot = new URL("./public/", import.meta.url);
  try {
    const content = await readFile(new URL(`.${cleanPath}`, publicRoot));
    response.writeHead(200, headers({ "Content-Type": mime[extname(cleanPath)] || "application/octet-stream", "Cache-Control": cleanPath === "/index.html" ? "no-cache" : "public, max-age=3600" }));
    response.end(content);
  } catch {
    const content = await readFile(fileURLToPath(new URL("./public/index.html", import.meta.url)));
    response.writeHead(200, headers({ "Content-Type": mime[".html"], "Cache-Control": "no-cache" })); response.end(content);
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  try {
    if (url.pathname === "/health") return send(response, 200, { status: "ok", service: "roots-leaves" });
    if (url.pathname === "/ready") {
      try { return send(response, 200, { status: "ready", ...(await store.ready()) }); }
      catch (error) { return send(response, 503, { status: "unavailable", error: clean(error.message, 160) }); }
    }
    if (url.pathname.startsWith("/api/")) return await api(request, response, url);
    return await staticFile(response, url.pathname);
  } catch (error) {
    console.error(error);
    return send(response, error.status || 400, { error: clean(error.message, 200) || "Request failed" });
  }
});

server.listen(port, "0.0.0.0", () => console.log(`Roots & Leaves listening on ${port}`));
function shutdown() { server.close(async () => { await store.pool?.end().catch(() => {}); process.exit(0); }); }
process.on("SIGTERM", shutdown); process.on("SIGINT", shutdown);
