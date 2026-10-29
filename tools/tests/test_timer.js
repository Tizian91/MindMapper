const fs = require('fs'), vm = require('vm'), path = require('path');
const root = process.argv[2], out = [];
(async () => {
  try {
    const window = { MM: {} };
    const ctx = vm.createContext({ window, console, document: { getElementById: () => null, documentElement: {} }, navigator: { language: 'en' }, localStorage: null, setTimeout, clearTimeout, Intl, Date });
    for (const f of ['state.js', 'tasks.js', 'meta.js', 'actual.js']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f), 'utf8'), ctx, { filename: f });
    const MM = window.MM, S = MM.state, AT = MM.actual;
    MM.tr = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (v && v[k] !== undefined ? v[k] : m));
    MM.render = { esc: (s) => String(s) };
    MM.ui = { flash: (s) => out.push('  flash: ' + s) };
    let asked = [];
    AT.ask = (ids) => asked.push(ids.length);
    const wait = () => new Promise((r) => setTimeout(r, 10));
    S.doc = MM.emptyDoc();
    const n = MM.createNode('task', 0, 0, { text: 'Bericht' });
    n.meta = Object.assign(MM.emptyMeta(), { estimate: 120, status: 'open' });
    S.doc.nodes[n.id] = n;
    MM.history.reset();
    const rows = () => (AT.logHTML(n).match(/<b>[^<]*<\/b>/g) || []).map((b) => b.replace(/<\/?b>/g, '')).join(', ') || '(none)';

    AT.toggle(n);
    out.push('started        | running ' + !!n.meta.timerStart + ', button ' + /running/.test(AT.buttonHTML(n)) + ' (true, true)');
    n.meta.timerStart -= 90 * 60000; // 1h 30m ago
    AT.toggle(n);
    out.push('stopped        | running ' + !!n.meta.timerStart + ', list ' + rows() + ' (false, 1h 30m)');
    AT.toggle(n);
    AT.toggle(n);
    out.push('click by error | list ' + rows() + ' (1h 30m - a run under a minute is not listed)');
    AT.toggle(n);
    n.meta.timerStart -= 25 * 60000;
    AT.toggle(n);
    out.push('second run     | list ' + rows() + ', sum ' + AT.logged(n) + ', actual ' + n.meta.actual + ' (1h 30m, 25m, sum 115, actual null - nothing filled in)');
    AT.remove(n, 0);
    out.push('deleted first  | list ' + rows() + ' (25m)');
    // checking off stops a running stopwatch, the run is listed
    AT.toggle(n);
    n.meta.timerStart -= 10 * 60000;
    MM.meta.setValue([n], 'status', 'done');
    MM.commit();
    await wait();
    out.push('checked off    | running ' + !!n.meta.timerStart + ', list ' + rows() + ', asked ' + asked.length + ' (false, 25m, 10m, 1)');
    MM.history.undo();
    out.push('undo           | ' + S.doc.nodes[n.id].meta.status + ', running ' + !!S.doc.nodes[n.id].meta.timerStart + ' (open, true)');
    // stopped after 4 hours: maybe forgotten - the run opens for a correction
    let edited = null;
    AT.editEntry = (node, i, note) => { edited = i + ' ' + (note || '').slice(0, 15); };
    const m = S.doc.nodes[n.id];
    m.meta.timerStart = null; // undo above left it running
    m.meta.timeLog = [];
    AT.toggle(m);
    m.meta.timerStart -= 4 * 3600000;
    AT.toggle(m);
    out.push('long run       | ' + MM.meta.formatDuration(AT.logged(m)) + ', correction for entry ' + edited + ' (4h, entry 0 Running for 4h)');
    const d = MM.normalizeDoc({ nodes: { a: { id: 'a', type: 'task', meta: { timerStart: 'x', timeLog: [{ s: 5, e: 3 }, { s: 1000, e: 61000 }, null] } } }, edges: {} });
    out.push('normalize      | ' + JSON.stringify([d.nodes.a.meta.timerStart, d.nodes.a.meta.timeLog]) + ' ([null,[{"s":1000,"e":61000}]])');
  } catch (e) { out.push('ERROR ' + e.stack); }
  fs.writeFileSync(process.argv[3], out.join('\n'));
})();
