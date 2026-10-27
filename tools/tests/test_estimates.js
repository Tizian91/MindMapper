const fs = require('fs'), vm = require('vm'), path = require('path');
const root = process.argv[2], out = [];
(async () => {
  try {
    const window = { MM: {} };
    const ctx = vm.createContext({ window, console, document: { getElementById: () => null, documentElement: {} }, navigator: { language: 'en' }, localStorage: null, setTimeout, clearTimeout, Intl, Date });
    for (const f of ['state.js', 'tasks.js', 'meta.js']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f), 'utf8'), ctx, { filename: f });
    const MM = window.MM, S = MM.state;
    MM.tr = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (v && v[k] !== undefined ? v[k] : m));
    MM.render = { esc: (s) => String(s) };
    MM.ui = { flash: (s) => out.push('  flash: ' + s) };
    const task = (text, estimate) => {
      const n = MM.createNode('task', 0, 0, { text });
      n.meta = Object.assign(MM.emptyMeta(), { estimate: estimate === undefined ? null : estimate });
      S.doc.nodes[n.id] = n;
      return n;
    };
    const arrow = (a, b) => {
      const e = MM.createEdge({ node: a.id, anchor: 'auto' }, { node: b.id, anchor: 'auto' });
      S.doc.edges[e.id] = e;
    };
    // the estimate chip of a note: its text and title
    const chip = (n) => {
      const m = /<span class="chip chip-time[^"]*" data-meta="estimate" title="([^"]*)">.*?<\/svg>(.*?)<\/span>(?=<|$)/.exec(MM.meta.chipsHTML(n));
      return m ? `${m[2].replace(/<[^>]+>/g, '')} [${m[1]}]` : '(none)';
    };

    S.doc = MM.emptyDoc();
    MM.history.reset();
    const A = task('A');
    const B = task('B', 120), C = task('C', 60);
    arrow(A, B);
    arrow(A, C);
    MM.commit();
    out.push('no own        | ' + chip(A) + ' estimate=' + A.meta.estimate + ' (3h ∑, null)');
    MM.meta.setValue([A], 'estimate', 600);
    MM.commit();
    out.push('own bigger    | ' + chip(A) + ' (10h (3h ∑))');
    MM.meta.setValue([B], 'estimate', 600);
    MM.commit();
    out.push('subs bigger   | ' + chip(A) + ' estimate=' + A.meta.estimate + ' (11h ∑, 660)');
    MM.meta.setValue([A], 'estimate', 300);
    MM.commit();
    out.push('own set lower | estimate=' + A.meta.estimate + ' (660 - raised again)');
    MM.meta.setValue([B], 'estimate', 60);
    MM.commit();
    out.push('subs shrink   | ' + chip(A) + ' estimate=' + A.meta.estimate + ' (11h (2h ∑), stays 660)');
    // a sub-task that is a main task itself: its sum counts
    const D = task('D'), E = task('E', 240);
    arrow(C, D);
    arrow(D, E);
    MM.commit();
    out.push('nested        | C=' + C.meta.estimate + ' D=' + chip(D) + ' A=' + A.meta.estimate + ' (C 240, D 4h ∑, A 660)');
    out.push('plain task    | ' + chip(B) + ' (1h)');
  } catch (e) { out.push('ERROR ' + e.stack); }
  fs.writeFileSync(process.argv[3], out.join('\n'));
})();
