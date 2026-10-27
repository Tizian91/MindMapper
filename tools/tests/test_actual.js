const fs = require('fs'), vm = require('vm'), path = require('path');
const root = process.argv[2], out = [];
(async () => {
  try {
    const window = { MM: {} };
    const ctx = vm.createContext({ window, console, document: { getElementById: () => null, documentElement: {} }, navigator: { language: 'en' }, localStorage: null, setTimeout, clearTimeout, Intl, Date });
    for (const f of ['state.js', 'tasks.js', 'meta.js', 'actual.js']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f), 'utf8'), ctx, { filename: f });
    const MM = window.MM, S = MM.state;
    MM.tr = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (v && v[k] !== undefined ? v[k] : m));
    MM.render = { esc: (s) => String(s).replace(/[&<>"]/g, (c) => '&#' + c.charCodeAt(0) + ';') };
    let asked = [];
    MM.actual.ask = (ids) => asked.push(ids.map((id) => S.doc.nodes[id].text).join('+'));
    const wait = () => new Promise((r) => setTimeout(r, 10));
    const step = async (fn) => {
      asked = [];
      fn();
      MM.commit();
      await wait();
      return asked.join(' | ') || '(none)';
    };
    const node = (type, text, meta) => {
      const n = MM.createNode(type, 0, 0, { text });
      n.meta = Object.assign(MM.emptyMeta(), meta);
      S.doc.nodes[n.id] = n;
      return n;
    };
    const set = (n, k, v) => MM.meta.setValue([n], k, v);

    S.doc = MM.emptyDoc();
    MM.history.reset();
    const A = node('task', 'A', { estimate: 120, status: 'open' });
    const B = node('task', 'B', { estimate: 60, status: 'open' });
    const C = node('task', 'C', { status: 'open' });                                    // no estimate
    const D = node('task', 'D', { estimate: 30, scheduled: '2026-11-02', status: 'open' }); // appointment
    const E = node('note', 'E', { estimate: 45, status: 'open' });                       // a note with an estimate
    MM.commit();
    out.push('begun          | ' + (await step(() => set(A, 'status', 'progress'))) + ' first=' + A.meta.estimateFirst + ' (none, first=120)');
    out.push('re-estimated   | ' + (await step(() => set(A, 'estimate', 180))) + ' first=' + A.meta.estimateFirst + ' (none, first=120)');
    out.push('A done         | ' + (await step(() => set(A, 'status', 'done'))) + ' (A)');
    out.push('A again        | ' + (await step(() => { A.text = 'A2'; })) + ' (none - was done already)');
    out.push('B via 100 %    | ' + (await step(() => set(B, 'progress', 100))) + ' first=' + B.meta.estimateFirst + ' (B, first=60)');
    out.push('C, D, E done   | ' + (await step(() => { set(C, 'status', 'done'); set(D, 'status', 'done'); set(E, 'status', 'done'); })) + ' (E - C has no estimate, D is an appointment)');
    const F = node('task', 'F', { estimate: 20, status: 'open' });
    const G = node('task', 'G', { estimate: 20, status: 'open', actual: 25 });
    MM.commit();
    out.push('F, G together  | ' + (await step(() => { set(F, 'status', 'done'); set(G, 'status', 'done'); })) + ' (F - G has its actual time)');
    S.settings.askActual = false;
    const H = node('task', 'H', { estimate: 20, status: 'open' });
    MM.commit();
    out.push('turned off     | ' + (await step(() => set(H, 'status', 'done'))) + ' first=' + H.meta.estimateFirst + ' (none, first=20)');
    MM.history.undo();
    await wait();
    out.push('undo           | ' + (asked.join() || '(none)') + ' H=' + S.doc.nodes[H.id].meta.status + ' (none, H=open)');
    S.settings.askActual = true;
    MM.history.redo();
    await wait();
    out.push('redo           | ' + (asked.join() || '(none)') + ' (none)');

    const n = MM.normalizeDoc({ nodes: { a: { id: 'a', type: 'task', meta: { actual: -5, estimateFirst: '90' } }, b: { id: 'b', type: 'task', meta: {} } }, edges: {} });
    out.push('normalize      | a=' + n.nodes.a.meta.actual + '/' + n.nodes.a.meta.estimateFirst + ' b=' + n.nodes.b.meta.actual + ' (a=null/90 b=null)');
    out.push('chip           | ' + /chip-actual[^>]*title="([^"]*)"[^>]*>.*?(\d+m)/.exec(MM.meta.chipsHTML ? MM.meta.chipsHTML(G) : '')?.slice(1).join(' · ') + ' (Actual time - estimated 20m · 25m)');
  } catch (e) { out.push('ERROR ' + e.stack); }
  fs.writeFileSync(process.argv[3], out.join('\n'));
})();
