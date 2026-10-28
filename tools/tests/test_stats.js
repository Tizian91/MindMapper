const fs = require('fs'), vm = require('vm'), path = require('path');
const root = process.argv[2], out = [];
try {
  const window = { MM: {} };
  const ctx = vm.createContext({ window, console, document: { getElementById: () => null, documentElement: {} }, navigator: { language: 'en' }, localStorage: null, setTimeout, clearTimeout, Intl, Date });
  for (const f of ['state.js', 'meta.js', 'tasks.js', 'overview.js', 'stats.js']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f), 'utf8'), ctx, { filename: f });
  const MM = window.MM;
  MM.tr = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (v && v[k] !== undefined ? v[k] : m));
  MM.t = (k, d) => d || k;
  const h = 60;
  const task = (doc, text, meta, tags) => {
    const n = MM.createNode('task', 0, 0, { text });
    n.meta = Object.assign(MM.emptyMeta(), meta);
    n.tags = tags || [];
    doc.nodes[n.id] = n;
    return n;
  };
  const arrow = (doc, a, b) => {
    const e = MM.createEdge({ node: a.id, anchor: 'auto' }, { node: b.id, anchor: 'auto' });
    doc.edges[e.id] = e;
  };
  // project MoS2 (estimated 20h at first, raised to its steps later) with steps in this map and in its derived map
  const A = MM.emptyDoc(), B = MM.emptyDoc();
  const P = task(A, 'MoS2', { estimate: 32 * h, estimateFirst: 20 * h, status: 'progress' }, ['MoS2']);
  const s1 = task(A, 'Proben 1', { estimate: 4 * h, estimateFirst: 3 * h, actual: 6 * h, status: 'done' }, ['Probenpräparation']);
  const s2 = task(A, 'Proben 2', { estimate: 4 * h, actual: 5 * h, status: 'done' }, ['Probenpräparation']);
  const s3 = task(A, 'Messung', { estimate: 8 * h, actual: 7 * h, status: 'done' }, ['Messung']);
  const s4 = task(A, 'Auswertung', { estimate: 8 * h, status: 'open' }, ['Auswertung']);           // not done
  const s5 = task(A, 'Verworfen', { estimate: 2 * h, actual: 1 * h, status: 'dropped' }, ['Messung']); // dropped: no step
  for (const s of [s1, s2, s3, s4, s5]) arrow(A, P, s);
  P.derivedMap = 'B.mindmap.json';
  const b1 = task(B, 'Proben 3', { estimate: 4 * h, actual: 4 * h, status: 'done' }, []);  // no own tag: MoS2 from its project
  const b2 = task(B, 'Ohne Ist', { estimate: 4 * h, status: 'done' }, ['Messung']);        // no actual: no step
  // a single task without project and without tag
  task(A, 'Allein', { estimate: 1 * h, actual: 2 * h, status: 'done' });
  // a finished project whose actual time was entered on the project itself only
  const Q = task(A, 'Altprojekt', { estimate: 10 * h, actual: 15 * h, status: 'done' });
  const q1 = task(A, 'Q-Schritt', { estimate: 10 * h, status: 'done' });
  arrow(A, Q, q1);

  const model = MM.overview.model(new Map([['A.mindmap.json', A], ['B.mindmap.json', B]]));
  const r = MM.stats.compute(model.items);
  const f = (v) => (v === null ? '-' : v.toFixed(2));
  out.push('all            | n=' + r.all.n + ' est=' + r.all.est / h + 'h act=' + r.all.act / h + 'h factor=' + f(r.all.factor) +
    ' (n=5: Proben 1-3, Messung, Allein; est 3+4+4+8+1=20h, act 6+5+4+7+2=24h, 1.20)');
  for (const g of r.tags) {
    out.push('tag ' + (g.tag || '(none)').padEnd(17) + '| n=' + g.n + ' est=' + g.est / h + 'h act=' + g.act / h + 'h factor=' + f(g.factor) +
      ' median=' + f(g.median) + ' hit=' + f(g.hit) + ' steps=' + g.steps.map((s) => s.it.title).join(','));
  }
  out.push('               | (expected: MoS2 n=4 [Proben 1, Proben 2, Messung, Proben 3]; Probenpräparation n=2 est 7h act 11h;')
  out.push('               |  Messung n=1 (Ohne Ist / Verworfen left out); (none) n=1 Allein - "without tag" last)');
  for (const p of r.projects) {
    out.push('project ' + p.it.title.padEnd(13) + '| first=' + p.first / h + 'h planned=' + p.planned / h + 'h act=' + p.act / h + 'h steps=' +
      p.done + '/' + p.steps + ' recorded=' + p.recorded + ' own=' + p.own + ' finished=' + p.finished);
  }
  out.push('               | (expected: MoS2 first 20h, planned 4+4+8+8+4+4=32h, act 6+5+7+4=22h, 5/6 done, 4 recorded, running first;')
  out.push('               |  Altprojekt first 10h, planned 10h, act 15h own=true, finished)');
  out.push('summary empty  | ' + JSON.stringify(MM.stats.summary([])) + ' (n 0, factor/median/hit null)');

  // ---- period: the day a step was finished (doneAt, else the end of its last stopwatch run)
  const ST = MM.stats, today = new Date(2026, 9, 28);
  out.push('since          | all="' + ST.since('all', today) + '" 30=' + ST.since('30', today) + ' 90=' + ST.since('90', today) +
    ' year=' + ST.since('year', today) + ' (all="", 30=2026-09-29, 90=2026-07-31, year=2026-01-01)');
  s1.meta.doneAt = '2026-10-20';
  s2.meta.doneAt = '2026-05-02';
  s3.meta.timeLog = [{ s: new Date(2026, 9, 1, 9).getTime(), e: new Date(2026, 9, 1, 11).getTime() }, { s: new Date(2026, 9, 25, 9).getTime(), e: new Date(2026, 9, 25, 10).getTime() }];
  Q.meta.doneAt = '2026-03-01';
  out.push('doneDay        | ' + [s1, s2, s3, b1].map((n) => n.text + '=' + (ST.doneDay(n.meta) || '-')).join(' ') + ' (2026-10-20, 2026-05-02, 2026-10-25 from the stopwatch, -)');
  const m2 = MM.overview.model(new Map([['A.mindmap.json', A], ['B.mindmap.json', B]]));
  const r30 = ST.compute(m2.items, ST.since('30', today));
  out.push('last 30 days   | n=' + r30.all.n + ' steps=' + r30.all.steps.map((s) => s.it.title).join(',') + ' undated=' + r30.undated +
    ' projects=' + r30.projects.map((p) => p.it.title).join(',') + ' (2: Proben 1, Messung; undated 2 (Proben 3, Allein); MoS2 running, Altprojekt finished in March left out)');
  const rYear = ST.compute(m2.items, ST.since('year', today));
  out.push('this year      | n=' + rYear.all.n + ' projects=' + rYear.projects.map((p) => p.it.title).join(',') + ' (3 with Proben 2; MoS2, Altprojekt)');
} catch (e) { out.push('ERROR ' + e.stack); }
fs.writeFileSync(process.argv[3], out.join('\n'));
