// Données : programme (lecture), journal (GitHub Contents API), file hors ligne.
// Aucun accès DOM / localStorage à l'import.

const K_SETTINGS = 'st.settings';
const K_QUEUE = 'st.queue';
const K_LOG = 'st.cache.log';
const K_PROGRAM = 'st.cache.program';
const DEFAULTS = { owner: 'alexandreGalas', repo: 'Sport-Tracker', branch: 'main', token: '' };

let program = { version: 1, startDate: '1970-01-01', goals: [], exercises: {}, sessions: {}, weeks: [{ label: 'Semaine 1', days: {} }] };
let baseLog = { version: 1, entries: [] }; // dernier état connu côté dépôt
let sha = null;
let queue = [];
let lastError = null;
let listeners = [];
let chain = Promise.resolve(); // sérialise les synchronisations
let initDone = false;

// ---------- utilitaires ----------
const ls = () => (typeof localStorage !== 'undefined' ? localStorage : null);
function lsGet(key, fallback) {
  try { const v = ls() && ls().getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function lsSet(key, value) {
  try { ls() && ls().setItem(key, JSON.stringify(value)); } catch { /* quota */ }
}

export function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
export function base64ToUtf8(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function emit() { listeners.forEach((cb) => { try { cb(); } catch (e) { console.error(e); } }); }

function normLog(l) {
  const entries = l && Array.isArray(l.entries) ? l.entries : [];
  return { version: (l && l.version) || 1, entries };
}

function applyOp(log, op) {
  const entries = log.entries.filter((e) => e.id !== (op.op === 'delete' ? op.id : op.entry.id));
  if (op.op === 'upsert') entries.push(op.entry);
  entries.sort((a, b) => (a.date + a.id).localeCompare(b.date + b.id));
  return { ...log, entries };
}
function applyOps(log, ops) { return ops.reduce(applyOp, log); }

// ---------- réglages ----------
export function getSettings() {
  return { ...DEFAULTS, ...lsGet(K_SETTINGS, {}) };
}
export function setSettings(s) {
  const cur = getSettings();
  lsSet(K_SETTINGS, {
    owner: (s.owner ?? cur.owner).trim(),
    repo: (s.repo ?? cur.repo).trim(),
    branch: (s.branch ?? cur.branch).trim(),
    token: (s.token ?? cur.token).trim(),
  });
  sha = null;
  emit();
}

// ---------- API GitHub ----------
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function gh(path, { method = 'GET', body } = {}) {
  const { owner, repo, token } = getSettings();
  const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${path}`, {
    method,
    cache: 'no-store',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = '';
    try { msg = (await res.json()).message || ''; } catch { /* ignore */ }
    throw new HttpError(res.status, msg || `HTTP ${res.status}`);
  }
  return res.json();
}

async function ghGetFile(file) {
  const { branch } = getSettings();
  const j = await gh(`/contents/${file}?ref=${encodeURIComponent(branch)}`);
  return { json: JSON.parse(base64ToUtf8(j.content)), sha: j.sha };
}

async function fetchRelative(file) {
  const res = await fetch(file, { cache: 'no-store' });
  if (!res.ok) throw new HttpError(res.status, `HTTP ${res.status}`);
  return res.json();
}

function describeError(e) {
  if (e instanceof HttpError) {
    if (e.status === 401) return 'Token invalide ou expiré';
    if (e.status === 403) return 'Accès refusé (droits du token)';
    if (e.status === 404) return 'Dépôt, branche ou fichier introuvable';
    if (e.status === 409 || e.status === 422) return 'Conflit de version (réessaie)';
    return e.message;
  }
  return 'Hors ligne';
}

// ---------- chargement ----------
async function loadProgram() {
  const { token } = getSettings();
  let p = null;
  if (token) { try { p = (await ghGetFile('data/program.json')).json; } catch { /* repli */ } }
  if (!p) { try { p = await fetchRelative('data/program.json'); } catch { /* repli cache */ } }
  if (p && p.weeks) { program = p; lsSet(K_PROGRAM, p); }
}

async function loadLog() {
  const { token } = getSettings();
  if (token) {
    try {
      const f = await ghGetFile('data/log.json');
      baseLog = normLog(f.json); sha = f.sha; lastError = null;
      lsSet(K_LOG, baseLog);
      return;
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) { baseLog = normLog(null); sha = null; return; }
      lastError = e instanceof HttpError ? describeError(e) : null; // hors ligne : pas une erreur
    }
  }
  try { baseLog = normLog(await fetchRelative('data/log.json')); lsSet(K_LOG, baseLog); } catch { /* cache déjà chargé */ }
}

export async function init() {
  program = lsGet(K_PROGRAM, program);
  baseLog = normLog(lsGet(K_LOG, baseLog));
  queue = lsGet(K_QUEUE, []);
  await Promise.all([loadProgram(), loadLog()]);
  if (!initDone && typeof window !== 'undefined') {
    initDone = true;
    window.addEventListener('online', () => { syncNow(); });
  }
  emit();
  await syncNow();
}

// ---------- lecture ----------
export function getProgram() { return program; }
export function getLog() { return applyOps(baseLog, queue); }
export function getEntry(date, sessionId) {
  return getLog().entries.find((e) => e.date === date && e.sessionId === sessionId);
}
export function getSyncState() {
  return { pending: queue.length, lastError, configured: !!getSettings().token };
}
export function onChange(cb) { listeners.push(cb); }

// ---------- écriture ----------
function enqueue(op) {
  queue.push(op);
  lsSet(K_QUEUE, queue);
  emit();
  return syncNow().then(() => ({ synced: queue.length === 0 && !!getSettings().token }));
}

export function saveEntry(entry) {
  const e = { ...entry, id: `${entry.date}-${entry.sessionId}` };
  if (!e.loggedAt) e.loggedAt = new Date().toISOString();
  return enqueue({ op: 'upsert', entry: e });
}
export function deleteEntry(id) {
  return enqueue({ op: 'delete', id });
}

function commitMessage(ops) {
  if (ops.length === 1) {
    const o = ops[0];
    return o.op === 'delete' ? `log: suppression ${o.id}` : `log: ${o.entry.date} ${o.entry.sessionId} (${o.entry.status})`;
  }
  return `log: ${ops.length} mises à jour`;
}

async function flush() {
  if (!getSettings().token) return;
  if (queue.length === 0) { return; }
  for (let attempt = 0; attempt < 3; attempt++) {
    const ops = queue.slice();
    try {
      if (sha === null || attempt > 0) {
        try {
          const f = await ghGetFile('data/log.json');
          baseLog = normLog(f.json); sha = f.sha;
        } catch (e) {
          if (e instanceof HttpError && e.status === 404) { baseLog = normLog(null); sha = null; } else throw e;
        }
      }
      const next = applyOps(baseLog, ops);
      const { branch } = getSettings();
      const body = {
        message: commitMessage(ops),
        content: utf8ToBase64(JSON.stringify(next, null, 2) + '\n'),
        branch,
      };
      if (sha) body.sha = sha;
      const res = await gh('/contents/data/log.json', { method: 'PUT', body });
      sha = res.content.sha;
      baseLog = next;
      queue = queue.slice(ops.length);
      lsSet(K_QUEUE, queue);
      lsSet(K_LOG, baseLog);
      lastError = null;
      if (queue.length === 0) return;
      attempt = -1; // des saisies sont arrivées pendant l'envoi : on continue
    } catch (e) {
      if (e instanceof HttpError && (e.status === 409 || e.status === 422) && attempt < 2) { sha = null; continue; }
      lastError = describeError(e);
      if (lastError === 'Hors ligne') lastError = null; // en attente, pas une erreur
      return;
    }
  }
}

export function syncNow() {
  const run = chain.then(async () => { await flush(); emit(); });
  chain = run.catch(() => {});
  return run;
}

export async function testConnection() {
  const { token, owner, repo, branch } = getSettings();
  if (!token) return { ok: false, message: 'Aucun token renseigné.' };
  try {
    const r = await gh('');
    await gh(`/contents/data/log.json?ref=${encodeURIComponent(branch)}`).catch((e) => {
      if (!(e instanceof HttpError && e.status === 404)) throw e;
    });
    const canPush = r.permissions ? !!r.permissions.push : null;
    if (canPush === false) return { ok: false, message: `Dépôt ${owner}/${repo} lisible, mais le token n'a pas le droit d'écrire (Contents : Read and write).` };
    return { ok: true, message: `Connexion réussie à ${owner}/${repo} (${branch}).` };
  } catch (e) {
    return { ok: false, message: describeError(e) };
  }
}
