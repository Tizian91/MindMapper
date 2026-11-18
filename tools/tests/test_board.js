// Week board (board.js compute): columns, lanes, Soll = workload of the week, past / next week, fixed time.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = process.argv[2], out = [];
let bad = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  out.push((ok ? 'ok   ' : 'FAIL ') + name.padEnd(34) + JSON.stringify(got) + (ok ? '' : '  (expected ' + JSON.stringify(want) + ')'));
};
try {
  const window = { MM: {} };
  const ctx = vm.createContext({ window, console, document: { getElementById: () => null, documentElement: {}, addEventListener() {} }, navigator: { language: 'en' }, localStorage: null, setTimeout, clearTimeout, Intl, Date });
  window.MM.actions = {};
  for (const f of ['state.js', 'meta.js', 'tasks.js', 'overview.js', 'templates.js', 'routines.js', 'workload.js', 'board.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'js', f), 'utf8'), ctx, { filename: f });
  }
  const MM = window.MM;
  MM.tr = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (v && v[k] !== undefined ? v[k] : m));
  MM.t = (k, d) => d || k;
  MM.getLang = () => 'en';
  Object.assign(MM.state.settings, { hoursPerDay: 8, hoursPerWeekendDay: 0, workDays: [1, 2, 3, 4, 5], routineCategories: [] });
  const T = MM.templates, h = 60;
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const now = new Date(), t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const mon = T.mondayOf(t0), W = T.weekValue(mon), Wprev = T.weekValue(addDays(mon, -7)), Wnext = T.weekValue(addDays(mon, 7));

  const A = MM.emptyDoc();
  const task = (text, meta, tags) => {
    const n = MM.createNode('task', 0, 0, { text });
    n.meta = Object.assign(MM.emptyMeta(), meta);
    n.tags = tags || [];
    A.nodes[n.id] = n;
    return n;
  };
  const arrow = (a, b) => {
    const e = MM.createEdge({ node: a.id, anchor: 'auto' }, { node: b.id, anchor: 'auto' });
    A.edges[e.id] = e;
  };
  const far = iso(addDays(mon, 28));
  task('Paper', { estimate: 30 * h, deadline: far, status: 'open' }, ['Paper']);                   // backlog, not split up
  const lehre = task('Lehre', { estimate: 12 * h, deadline: far, status: 'progress' }, ['Teaching']); // project: stays in the backlog
  const s1 = task('Folien', { estimate: 4 * h, deadline: far, status: 'open', week: W });           // To-Do (lane of its main task)
  const s2 = task('Klausur', { estimate: 3 * h, deadline: far, status: 'progress', progress: 50 }); // Doing
  const s3 = task('Korrektur', { estimate: 2 * h, deadline: far, status: 'done', doneAt: iso(t0), week: W }); // Done (planned)
  [s1, s2, s3].forEach((s) => arrow(lehre, s));
  task('Alt', { estimate: 2 * h, deadline: far, status: 'open', week: Wprev }, ['paper']);         // To-Do "from" last week; tag case
  task('Später', { estimate: 1 * h, deadline: far, status: 'open', week: Wnext });                 // next week only
  task('Idee', { estimate: 1 * h, status: 'open' });                                               // backlog without deadline
  task('Spontan', { estimate: 1 * h, status: 'done', doneAt: iso(t0) });                           // Done, unplanned
  task('Workshop', { estimate: 2 * h, scheduled: iso(t0), scheduledTime: '09:00', status: 'open' }); // appointment: fixed, no card
  const r = task('Jour fixe', { estimate: 1 * h, status: 'open' });
  r.repeat = MM.normalizeRepeat({ kind: 'weekly', every: 1, days: [1, 2, 3, 4, 5], time: '10:00' });
  const b = task('Betreuung', { estimate: 2 * h, status: 'open' });
  b.repeat = MM.normalizeRepeat({ kind: 'budget' });

  const docs = new Map([['A.mindmap.json', A]]);
  const sum = MM.load.compute(MM.load.items(docs), MM.routines.collect(docs));
  const lanes = ['Paper', 'Teaching'];
  const d = MM.board.compute(docs, mon, { lanes, sum });
  const names = (l, col) => l.cards[col].map((c) => c.title);
  const lane = (data, tag) => data.lanes.find((l) => l.tag === tag);

  check('kind', d.kind, 'current');
  check('lanes', d.lanes.map((l) => l.tag || 'Other'), ['Paper', 'Teaching', 'Other']);
  check('Paper backlog', names(lane(d, 'Paper'), 'backlog'), ['Paper']);
  check('Paper not split up', lane(d, 'Paper').cards.backlog[0].notSplit, true);
  check('Paper todo (tag case, from)', names(lane(d, 'Paper'), 'todo'), ['Alt']);
  check('Alt from last week', lane(d, 'Paper').cards.todo[0].from, Wprev);
  check('Teaching backlog = project', names(lane(d, 'Teaching'), 'backlog'), ['Lehre']);
  check('Lehre parts this week', lane(d, 'Teaching').cards.backlog[0].parts, 2);
  check('Lehre not split up (3h rest)', lane(d, 'Teaching').cards.backlog[0].notSplit, false);
  check('Teaching todo', names(lane(d, 'Teaching'), 'todo'), ['Folien']);
  check('Teaching doing', names(lane(d, 'Teaching'), 'doing'), ['Klausur']);
  check('Teaching done', names(lane(d, 'Teaching'), 'done'), ['Korrektur']);
  check('Korrektur planned', lane(d, 'Teaching').cards.done[0].unplanned, false);
  check('Other backlog (no deadline apart)', [names(lane(d, ''), 'backlog'), names(lane(d, ''), 'nodl')], [[], ['Idee']]);
  check('Other done unplanned', lane(d, '').cards.done.map((c) => c.title + ':' + c.unplanned), ['Spontan:true']);
  check('Später not this week', JSON.stringify(d).includes('Später'), false);
  check('Workshop is no card', JSON.stringify(d.lanes).includes('Workshop'), false);
  check('doing count', d.totals.doing, 1);
  check('planned h (4 + 1.5 + 2)', Math.round(d.totals.planned / 6) / 10, 7.5);
  check('lane plan Teaching (4 + 1.5)', Math.round(lane(d, 'Teaching').plan / 6) / 10, 5.5);
  check('Soll = workload of the week', Math.round(d.totals.soll), Math.round(sum.weeks[0].load));
  check('lanes Soll add up', Math.round(d.lanes.reduce((s, l) => s + l.soll, 0)), Math.round(d.totals.soll));
  check('available = workload of the week', Math.round(d.totals.avail), Math.round(sum.weeks[0].cap));
  const kinds = d.fixed.entries.map((e) => e.kind + ':' + e.title);
  check('fixed: workshop', kinds.includes('appt:Workshop'), true);
  check('fixed: budget once', kinds.filter((k) => k === 'budget:Betreuung').length, 1);
  check('fixed: jour fixe Mon-Fri', kinds.filter((k) => k === 'routine:Jour fixe').length, 5);
  check('fixed minutes = routines + appts', Math.round(d.fixed.minutes), Math.round(sum.weeks[0].routine + sum.weeks[0].appt));

  // next week: only what is planned for it, nothing in Doing / Done
  const n = MM.board.compute(docs, addDays(mon, 7), { lanes, sum });
  check('next: kind', n.kind, 'future');
  check('next: todo', n.lanes.flatMap((l) => names(l, 'todo')), ['Später']);
  check('next: doing / done', n.lanes.flatMap((l) => names(l, 'doing').concat(names(l, 'done'))), []);
  check('next: backlog still there', names(lane(n, 'Paper'), 'backlog'), ['Paper']);
  check('next: available = whole week', Math.round(n.totals.avail), Math.round(sum.weeks[1].cap));

  // last week: what was planned and is still open; no backlog, no Soll
  const p = MM.board.compute(docs, addDays(mon, -7), { lanes, sum });
  check('past: kind', p.kind, 'past');
  check('past: todo', p.lanes.flatMap((l) => names(l, 'todo')), ['Alt']);
  check('past: no backlog', p.lanes.flatMap((l) => names(l, 'backlog')), []);
  check('past: no Soll', [p.totals.soll, p.totals.avail], [null, null]);

  // no lanes: one lane with everything
  const one = MM.board.compute(docs, mon, { lanes: [], sum });
  check('no lanes: one lane', one.lanes.length, 1);
  check('no lanes: all backlog', names(one.lanes[0], 'backlog'), ['Lehre', 'Paper']);

  check('normalizeLanes', MM.normalizeLanes([' Paper ', 'paper', '', 'Lehre', null]), ['Paper', 'Lehre']);
} catch (e) { bad++; out.push('ERROR ' + e.stack); }
out.push(bad ? bad + ' FAILED' : 'all ok');
fs.writeFileSync(process.argv[3], out.join('\n'));
process.exitCode = bad ? 1 : 0;
