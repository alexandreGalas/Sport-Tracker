// Bootstrap, routeur par hash, navigation, indicateur de synchro.
import * as store from './store.js';
import { el } from './util.js';
import * as today from './views/today.js';
import * as week from './views/week.js';
import * as session from './views/session.js';
import * as history from './views/history.js';
import * as progress from './views/progress.js';
import * as settings from './views/settings.js';

const NAV = [
  { route: 'today', label: "Aujourd'hui", icon: '●' },
  { route: 'week', label: 'Semaine', icon: '▦' },
  { route: 'progress', label: 'Progrès', icon: '↗' },
  { route: 'history', label: 'Historique', icon: '☰' },
];
const TITLES = {
  today: "Aujourd'hui", week: 'Semaine', progress: 'Progrès', history: 'Historique',
  session: 'Saisie', log: 'Modifier la saisie', settings: 'Réglages',
};
const VIEWS = { today, week, progress, history, session, log: session, settings };

const container = document.getElementById('view');
let current = null; // { name, params }

function parseHash() {
  const raw = (location.hash || '').replace(/^#\/?/, '');
  const [path, qs = ''] = raw.split('?');
  const segments = path.split('/').filter(Boolean).map(decodeURIComponent);
  const query = Object.fromEntries(new URLSearchParams(qs));
  const name = segments.shift() || 'today';
  const params = { route: name, segments, query };
  // Raccourcis nommés
  if (name === 'session') { params.date = segments[0]; params.sessionId = segments[1]; }
  if (name === 'log') params.id = segments[0];
  if (query.offset !== undefined) params.offset = parseInt(query.offset, 10) || 0;
  return { name, params };
}

function renderCurrent({ keepScroll = false } = {}) {
  const { name, params } = current;
  const view = VIEWS[name] || VIEWS.today;
  const y = window.scrollY;
  container.replaceChildren();
  try {
    view.render(container, params);
  } catch (e) {
    console.error(e);
    container.replaceChildren(el('div', { class: 'banner banner-error' }, 'Erreur d\'affichage : ' + e.message));
  }
  document.getElementById('app-title').textContent = TITLES[name] || 'Sport Tracker';
  const navRoute = name === 'session' || name === 'log' ? 'today' : name;
  document.querySelectorAll('#bottom-nav a').forEach((a) => {
    const on = a.dataset.route === navRoute;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  if (keepScroll) window.scrollTo(0, y); else window.scrollTo(0, 0);
}

function onRoute() {
  current = parseHash();
  renderCurrent();
}

function buildNav() {
  const nav = document.getElementById('bottom-nav');
  nav.replaceChildren(...NAV.map((n) =>
    el('a', { href: `#/${n.route}`, dataset: { route: n.route } },
      el('span', { class: 'nav-icon', 'aria-hidden': 'true' }, n.icon),
      el('span', { class: 'nav-label' }, n.label))));
}

function updateSync() {
  const b = document.getElementById('sync-indicator');
  const s = store.getSyncState();
  let text, cls;
  if (!s.configured) { text = 'lecture seule'; cls = 'sync-ro'; }
  else if (s.lastError) { text = '⚠ erreur'; cls = 'sync-err'; }
  else if (s.pending > 0) { text = `⟳ ${s.pending} en attente`; cls = 'sync-pending'; }
  else { text = '✓ synchronisé'; cls = 'sync-ok'; }
  b.className = 'sync ' + cls;
  b.textContent = text;
  b.title = s.lastError || '';
}

document.getElementById('sync-indicator').addEventListener('click', () => {
  const s = store.getSyncState();
  if (!s.configured || s.lastError) location.hash = '#/settings';
  else store.syncNow();
});

store.onChange(() => {
  updateSync();
  // Ne pas re-rendre les formulaires en cours d'édition (saisie, réglages).
  if (current && !['settings', 'session', 'log'].includes(current.name)) renderCurrent({ keepScroll: true });
});

async function boot() {
  buildNav();
  updateSync();
  window.addEventListener('hashchange', onRoute);
  container.replaceChildren(el('p', { class: 'muted center pad' }, 'Chargement…'));
  try { await store.init(); } catch (e) { console.error(e); }
  updateSync();
  if (!location.hash) location.hash = '#/today'; // déclenche onRoute
  else onRoute();
}
boot();
