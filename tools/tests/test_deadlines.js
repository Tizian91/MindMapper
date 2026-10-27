const fs = require('fs'), vm = require('vm'), path = require('path');
const root = process.argv[2], out = [];
(async () => {
  try {
    const window = { MM: {} };
    const ctx = vm.createContext({ window, console, document: { getElementById: () => null, documentElement: {} }, navigator: { language: 'en' }, localStorage: null, setTimeout, clearTimeout, Intl, Date });
    for (const f of ['state.js', 'tasks.js', 'meta.js']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f), 'utf8'), ctx, { filename: f });
    const MM = window.MM, S = MM.state;
    MM.tr = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (v && v[k] !== undefined ? v[k] : m));
    MM.ui = { flash: (s) => out.push('  flash: ' + s) };
    const task = (doc, text, deadline) => {
      const n = MM.createNode('task', 0, 0, { text });
      n.meta = Object.assign(MM.emptyMeta(), { deadline: deadline || '' });
      doc.nodes[n.id] = n;
      return n;
    };
    const arrow = (doc, a, b) => {
      const e = MM.createEdge({ node: a.id, anchor: 'auto' }, { node: b.id, anchor: 'auto' });
      doc.edges[e.id] = e;
    };
    const set = (n, v) => {
      MM.meta.setValue([n], 'deadline', v);
      MM.commit();
    };
    const dl = (...ns) => ns.map((n) => `${n.text}=${S.doc.nodes[n.id].meta.deadline || '-'}`).join(' ');
    const wait = () => new Promise((r) => setTimeout(r, 30));

    // ---- in one map: arrow A -> B
    S.file.path = 'A.mindmap.json';
    S.doc = MM.emptyDoc();
    MM.history.reset();
    const A = task(S.doc, 'A', '2026-11-20');
    MM.commit();
    const B = task(S.doc, 'B');
    arrow(S.doc, A, B);
    MM.commit();
    out.push('new sub-task   | ' + dl(A, B) + ' (B=2026-11-20)');
    set(B, '');
    out.push('B cleared      | ' + dl(A, B) + ' (B=-, stays cleared)');
    set(B, '2026-11-25');
    out.push('B later        | ' + dl(A, B) + ' (B=2026-11-20, moved back)');
    set(B, '2026-11-15');
    set(A, '2026-11-10');
    out.push('A earlier      | ' + dl(A, B) + ' (B=2026-11-10)');
    set(A, '2026-11-30');
    out.push('A later        | ' + dl(A, B) + ' (B follows: 2026-11-30)');
    const C = task(S.doc, 'C', '2026-11-05');
    arrow(S.doc, A, C);
    MM.commit();
    set(A, '');
    out.push('A cleared      | ' + dl(A, B, C) + ' (B=- follows, C keeps its own)');
    out.push('max of B       | ' + (MM.tasks.maxDeadline([B]) || '-') + ' (-)');
    set(A, '2026-11-12');
    out.push('A set again    | ' + dl(A, B, C) + ' (B=2026-11-12, C=2026-11-05)');
    out.push('max of B, C    | ' + MM.tasks.maxDeadline([B, C]) + ' (2026-11-12)');

    // ---- derived map: its top level tasks are sub-tasks of T in the other map
    const adoc = MM.emptyDoc();
    const T = task(adoc, 'T', '2026-11-20');
    T.derivedMap = 'B.mindmap.json';
    const files = new Map();
    MM.load = { loaded: () => true, docs: () => new Map([['A.mindmap.json', adoc], [S.file.path, S.doc]]), scheduleRefresh() {} };
    S.file.path = 'B.mindmap.json';
    S.doc = MM.emptyDoc();
    MM.history.reset();
    const X = task(S.doc, 'X');
    MM.commit();
    out.push('derived: new   | ' + dl(X) + ' (X=2026-11-20)');
    out.push('derived: max   | ' + MM.tasks.maxDeadline([X]) + ' (2026-11-20)');
    set(X, '2026-12-01');
    out.push('derived: later | ' + dl(X) + ' (X=2026-11-20)');
    const Y = task(S.doc, 'Y', '2026-11-05');
    const Z = task(S.doc, 'Z');
    arrow(S.doc, X, Z);
    MM.commit();
    out.push('derived: more  | ' + dl(X, Y, Z) + ' (Y own, Z=2026-11-20 from X)');
    files.set('B.mindmap.json', JSON.stringify(S.doc));

    // ---- the main task's deadline changes in its map: the derived map follows
    MM.project = {
      status: 'ready', find: (p) => files.has(p), ensureWriteAccess: async () => true,
      readMap: async (p) => MM.normalizeDoc(JSON.parse(files.get(p))),
      writeMap: async (p, d) => files.set(p, JSON.stringify(d)),
    };
    S.file.path = 'A.mindmap.json';
    S.doc = adoc;
    MM.history.reset();
    const inB = () => {
      const d = JSON.parse(files.get('B.mindmap.json'));
      return [X, Y, Z].map((n) => `${n.text}=${d.nodes[n.id].meta.deadline || '-'}`).join(' ');
    };
    set(T, '2026-11-28');
    await wait();
    out.push('T later        | ' + inB() + ' (X, Z follow: 2026-11-28, Y own)');
    set(T, '2026-11-01');
    await wait();
    out.push('T earlier      | ' + inB() + ' (all 2026-11-01)');
    set(T, '');
    await wait();
    out.push('T cleared      | ' + inB() + ' (all -)');
  } catch (e) { out.push('ERROR ' + e.stack); }
  fs.writeFileSync(process.argv[3], out.join('\n'));
})();
