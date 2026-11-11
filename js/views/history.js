// Vue Historique.
// Route lue : #/history (aucun paramètre). Chaque ligne mène à #/log/<entryId>.
import { getLog } from '../store.js';
import { mondayOf, addDays, formatDateFr } from '../util.js';
import { h, sessionTitle, sessionKind, statusBadge, entrySummary } from './session.js';

let filter = 'all'; // all | run | calisthenics

export function render(container, params = {}) {
  container.replaceChildren();
  const root = h('div', { class: 'v-history stack' });
  container.append(root);

  const entries = (getLog().entries || []).slice().sort((a, b) =>
    a.date === b.date ? String(b.loggedAt || '').localeCompare(String(a.loggedAt || '')) : (a.date < b.date ? 1 : -1));

  const list = h('div', { class: 'stack' });
  const seg = h('div', { class: 'segmented v-seg', role: 'group', 'aria-label': 'Filtre' });
  [['all', 'Tout'], ['run', 'Course'], ['calisthenics', 'Calisthénie']].forEach(([k, l]) => {
    seg.append(h('button', {
      type: 'button', class: 'v-seg-btn' + (filter === k ? ' active' : ''), 'aria-pressed': filter === k ? 'true' : 'false',
      onclick: () => { filter = k; render(container, params); },
    }, l));
  });
  root.append(h('h2', { class: 'v-title' }, 'Historique'), seg, list);

  const shown = entries.filter(e => filter === 'all' || sessionKind(e.sessionId, e) === filter);
  if (!shown.length) {
    list.append(h('div', { class: 'card muted' }, entries.length ? 'Aucune saisie pour ce filtre.' : 'Aucune saisie pour le moment.'));
    return;
  }
  let curWeek = null, group = null;
  shown.forEach(e => {
    const mon = mondayOf(e.date);
    if (mon !== curWeek) {
      curWeek = mon;
      list.append(h('div', { class: 'section-title' }, `Semaine du ${formatDateFr(mon, { weekday: false })} au ${formatDateFr(addDays(mon, 6), { weekday: false })}`));
      group = h('div', { class: 'card v-group' });
      list.append(group);
    }
    const kind = sessionKind(e.sessionId, e);
    const sum = entrySummary(e);
    group.append(h('a', { class: 'v-hrow', href: `#/log/${e.id}` },
      h('div', { class: 'v-hrow-top' },
        h('span', { class: 'v-hdate muted' }, formatDateFr(e.date)),
        statusBadge(e.status)),
      h('div', { class: 'v-line-title' }, (kind === 'run' ? '🏃 ' : '💪 ') + sessionTitle(e.sessionId, e)),
      sum ? h('div', { class: 'muted v-line-sum' }, sum) : null,
      e.feeling ? h('div', { class: 'muted v-feel-tag' }, `Ressenti ${e.feeling}/5`) : null));
  });
}
