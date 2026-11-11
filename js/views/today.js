// Vue Aujourd'hui.
// Route lue : #/today (aucun paramètre). Navigue vers #/session/<date>/<sessionId> et #/week.
import { getEntry, saveEntry, getProgram } from '../store.js';
import { weekInfo, sessionsForDate } from '../program.js';
import { todayISO, addDays, formatDateFr, formatDuration, formatPace } from '../util.js';
import { h, toast, fmtKm, safeSession, exInfo, statusBadge } from './session.js';
import { weekSummary } from './week.js';

function runSummary(s) {
  const p = s.plan || {};
  const parts = [];
  if (p.distanceKm) parts.push(`${fmtKm(p.distanceKm)} km`);
  if (p.durationSec) parts.push(formatDuration(p.durationSec));
  if (p.distanceKm && p.durationSec) parts.push(`allure cible ${formatPace(p.durationSec / p.distanceKm)}`);
  return parts.join(' · ');
}

function caliSummary(s) {
  return (s.exercises || []).map(ex => {
    const i = exInfo(ex);
    const unit = i.metric === 'seconds' ? ' s' : '';
    if (i.test) return `${i.name} (max)`;
    return `${i.name} ${ex.sets}×${ex.target}${unit}` + (i.optional ? ' (facultatif)' : '');
  }).join(' · ');
}

export function render(container, params = {}) {
  const today = todayISO();
  const program = getProgram();
  const info = weekInfo(today);
  const total = (program.weeks || []).length || 1;
  const idx = Math.min(Math.max(info.index, 0), total - 1);
  const items = sessionsForDate(today);

  container.replaceChildren();
  const root = h('div', { class: 'v-today stack' });
  container.append(root);

  const lbl = info.label && info.label.includes(':') ? info.label.split(':').slice(1).join(':').trim() : '';
  root.append(h('div', { class: 'v-todayhead' },
    h('h2', { class: 'v-title' }, formatDateFr(today)),
    h('div', { class: 'muted' }, `Semaine ${idx + 1} / ${total}` + (lbl ? ` · ${lbl}` : ''))));
  if (info.beforeStart) root.append(h('div', { class: 'banner' }, `Démarre le ${formatDateFr(program.startDate)}`));
  if (info.finished) root.append(h('div', { class: 'banner' }, 'Programme terminé : demande une mise à jour au coach'));

  const findEntry = (sessionId, bonus) => {
    let e = getEntry(today, sessionId);
    if (!e && bonus) {
      // le bonus du week-end peut avoir été fait l'autre jour
      const dow = (new Date(today + 'T00:00:00').getDay() + 6) % 7; // 0 = lundi
      const other = dow === 5 ? addDays(today, 1) : dow === 6 ? addDays(today, -1) : null;
      if (other) e = getEntry(other, sessionId);
    }
    return e;
  };

  items.forEach(({ sessionId, session, bonus }) => {
    const entry = findEntry(sessionId, bonus);
    const isRun = session.type === 'run';
    const target = entry ? entry.date : today;
    const detail = session.description ? h('details', { class: 'v-desc' }, h('summary', {}, 'Consigne du coach'), h('p', {}, session.description)) : null;
    const card = h('div', { class: 'card v-sess stack' },
      h('div', { class: 'v-sess-head' },
        h('span', { class: 'v-icon' }, isRun ? '🏃' : '💪'),
        h('strong', { class: 'v-sess-title' }, session.title || sessionId),
        h('span', { class: 'v-badges' }, bonus ? h('span', { class: 'badge badge-bonus' }, 'Bonus') : null,
          statusBadge(entry ? entry.status : 'todo'))),
      h('div', { class: 'muted v-sess-sum' }, isRun ? runSummary(session) : caliSummary(session)),
      detail,
      h('div', { class: 'row v-actions' },
        h('a', { class: 'btn btn-primary', href: `#/session/${target}/${sessionId}` }, entry ? 'Modifier' : 'Saisir'),
        entry ? null : h('button', {
          type: 'button', class: 'btn btn-ghost', onclick: async (ev) => {
            ev.target.disabled = true;
            try {
              const r = await saveEntry({ id: `${today}-${sessionId}`, date: today, sessionId, status: 'skipped', note: '', loggedAt: new Date().toISOString() });
              toast(r && r.synced === false ? 'Enregistré hors ligne, synchro en attente' : 'Séance marquée comme sautée');
            } catch (e) { toast('Erreur : ' + (e.message || e)); ev.target.disabled = false; }
          },
        }, 'Sauté')));
    root.append(card);
  });

  // entrées libres du jour
  const extra = getEntry(today, 'extra-run');
  if (extra) {
    root.append(h('div', { class: 'card v-sess stack' },
      h('div', { class: 'v-sess-head' }, h('span', { class: 'v-icon' }, '🏃'), h('strong', { class: 'v-sess-title' }, 'Course libre'), h('span', { class: 'v-badges' }, statusBadge(extra.status))),
      h('div', { class: 'row v-actions' }, h('a', { class: 'btn btn-primary', href: `#/session/${today}/extra-run` }, 'Modifier'))));
  }

  if (!items.length) {
    let next = null;
    for (let i = 1; i <= 7 && !next; i++) {
      const d = addDays(today, i);
      const s = sessionsForDate(d);
      if (s.length) next = { d, s: s[0] };
    }
    root.append(h('div', { class: 'card v-rest stack' },
      h('strong', {}, 'Repos 😴'),
      next ? h('div', { class: 'muted' }, `Prochaine séance : ${formatDateFr(next.d)}, ${next.s.session.title || next.s.sessionId}`) : null));
  }

  if (!extra) {
    root.append(h('a', { class: 'btn v-extra', href: `#/session/${today}/extra-run` }, '+ Course libre'));
  }

  const sum = weekSummary(info.mondayISO);
  root.append(h('a', { class: 'card v-weekcard', href: '#/week' },
    h('div', { class: 'section-title' }, 'Cette semaine'),
    h('div', { class: 'v-stats' },
      h('div', {}, h('strong', {}, `${sum.done}/${sum.planned}`), h('span', { class: 'muted' }, 'séances faites')),
      h('div', {}, h('strong', {}, `${fmtKm(sum.km)} km`), h('span', { class: 'muted' }, 'courus')))));
}
