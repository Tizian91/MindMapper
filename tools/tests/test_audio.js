// Audio notes (audio.js): which data notes play, the time shown, the file name of a
// recording, and that a recording keeps its length in the map (state.js). Expected in brackets.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = process.argv[2], out = [];
try {
  const w = { MM: { state: {} } };
  const ctx = vm.createContext({ window: w, console, document: {}, Math, Date });
  vm.runInContext(fs.readFileSync(path.join(root, 'js', 'audio.js'), 'utf8'), ctx, { filename: 'audio.js' });
  const MM = w.MM, AU = MM.audio;
  let lang = 'en';
  MM.tr = (s, v) => (lang === 'de' && s === 'Recording' ? 'Aufnahme' : s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] !== undefined ? v[k] : m));
  MM.files = { humanSize: (b) => Math.round(b / 1024) + ' KB', describe: (f) => f.name };

  const f = (name, mime) => ({ path: 'Assets/' + name, name, mime });
  out.push('recorded webm   | ' + AU.isAudio(f('Aufnahme.webm', 'audio/webm')) + ' (true)');
  out.push('dropped mp3     | ' + AU.isAudio(f('Song.mp3', '')) + ' (true)');
  out.push('m4a from iPhone | ' + AU.isAudio(f('Memo.m4a', 'audio/x-m4a')) + ' (true)');
  out.push('video webm      | ' + AU.isAudio(f('Clip.webm', 'video/webm')) + ' (false)');
  out.push('pdf             | ' + AU.isAudio(f('Folie.pdf', 'application/pdf')) + ' (false)');
  out.push('no file yet     | ' + AU.isAudio({ path: '', name: '', mime: '' }) + ' (false)');

  out.push('clock           | ' + [0, 9, 75, 600, 3725].map(AU.clock).join(' ') + ' (0:00 0:09 1:15 10:00 1:02:05)');

  const d = new Date(2026, 10, 13, 9, 5);
  out.push('file name en    | ' + AU.fileName(d, 'webm') + ' (Recording 2026-11-13 09-05.webm)');
  lang = 'de';
  out.push('file name de    | ' + AU.fileName(d, 'm4a') + ' (Aufnahme 2026-11-13 09-05.m4a)');

  const n = { id: 'n1', file: { path: 'Assets/a.webm', name: 'a.webm', size: 512 * 1024, mime: 'audio/webm', duration: 75 } };
  out.push('sub not playing | ' + AU.subText(n) + ' (1:15 · 512 KB)');
  out.push('sub no length   | ' + AU.subText({ id: 'n2', file: { path: 'Assets/b.mp3', name: 'b.mp3', size: 2048, mime: '' } }) + ' (2 KB)');

  // the length survives saving and loading (normalizeDoc of state.js)
  const src = fs.readFileSync(path.join(root, 'js', 'state.js'), 'utf8');
  out.push('state keeps it  | ' + /node\.file\.duration = num\(f\.duration/.test(src) + ' (true)');
} catch (e) { out.push('ERROR ' + e.stack); }
fs.writeFileSync(process.argv[3], out.join('\n'));
