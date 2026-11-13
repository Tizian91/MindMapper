'use strict';
/*
 * Audio notes: recording with the microphone, and playing audio files inside a note.
 *
 * A recording becomes a data note ("file" type, files.js): the sound is a file in the
 * project folder (Assets/), the note keeps only its path - a minute of sound is about
 * half a megabyte, too much to carry inside the map (and on Dropbox every autosave
 * would upload it again). Every data note with an audio file (also a dropped .mp3)
 * shows ▶ instead of its badge and a thin bar to seek; ↗ still opens the file.
 *
 * One sound plays at a time.
 */
(function (MM) {
  const S = MM.state;
  const AU = (MM.audio = {});
  const tr = (s, v) => MM.tr(s, v);

  // ---- Helpers -----------------------------------------------------------------

  const AUDIO_EXT = /\.(mp3|wav|ogg|oga|opus|m4a|aac|flac|weba)$/i;

  /** Is the file of a data note a sound? (.webm only when recorded as audio) */
  AU.isAudio = (file) => !!(file && file.path && (/^audio\//i.test(file.mime || '') || AUDIO_EXT.test(file.name || '')));

  /** 75 -> "1:15", 3725 -> "1:02:05". */
  AU.clock = function (sec) {
    const s = Math.max(0, Math.floor(Number(sec) || 0));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    const two = (x) => String(x).padStart(2, '0');
    return h ? `${h}:${two(m)}:${two(r)}` : `${m}:${two(r)}`;
  };

  /** The format this browser records in: { mime, ext }, or null (no MediaRecorder). */
  AU.format = function () {
    if (!window.MediaRecorder) return null;
    const list = [['audio/webm;codecs=opus', 'webm'], ['audio/webm', 'webm'], ['audio/mp4', 'm4a'], ['audio/ogg;codecs=opus', 'ogg']];
    for (const [mime, ext] of list) if (!MediaRecorder.isTypeSupported || MediaRecorder.isTypeSupported(mime)) return { mime, ext };
    return { mime: '', ext: 'webm' }; // the browser picks
  };

  /** File name of a recording made at `d`: "Recording 2026-11-13 14-32.webm" (no ":" in file names). */
  AU.fileName = function (d, ext) {
    const two = (x) => String(x).padStart(2, '0');
    return `${tr('Recording')} ${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}-${two(d.getMinutes())}.${ext}`;
  };

  /** May we write into the project folder? Explains why not. */
  async function folderReady() {
    if (MM.project.status === 'ready' || (await MM.project.ensureWriteAccess())) return true;
    alert(tr('Audio notes keep the recording as a file in your project folder (Assets/).\n') +
      tr(MM.project.status === 'unsupported'
        ? 'Project folders need Edge or Chrome, opened from disk (not file://).'
        : 'Open a folder in the "Project" sidebar first.'));
    return false;
  }

  // ---- Playing -----------------------------------------------------------------

  let cur = null; // { id, path, audio, url, loading }

  /** State of a note's sound: { playing, time, duration, loading } (nothing when it is not loaded). */
  AU.state = function (n) {
    if (!cur || cur.id !== n.id) return { playing: false, time: 0, duration: (n.file && n.file.duration) || 0, loading: false };
    const a = cur.audio;
    const known = a && isFinite(a.duration) && a.duration > 0 ? a.duration : 0;
    return {
      playing: !!a && !a.paused && !a.ended,
      time: a ? a.currentTime : 0,
      duration: known || (n.file && n.file.duration) || 0,
      loading: cur.loading,
    };
  };

  /** Second line of an audio note: "1:15 · 512 KB", while playing "0:12 / 1:15". */
  AU.subText = function (n) {
    const st = AU.state(n);
    const size = n.file && n.file.size ? MM.files.humanSize(n.file.size) : '';
    if (cur && cur.id === n.id && (st.time > 0 || st.playing)) return AU.clock(st.time) + (st.duration ? ' / ' + AU.clock(st.duration) : '');
    return [st.duration ? AU.clock(st.duration) : '', size].filter(Boolean).join(' · ') || MM.files.describe(n.file);
  };

  /** Bring the ▶ button, the time and the bar of a note up to date (no full redraw). */
  AU.paint = function (id) {
    const div = MM.render.nodeEls.get(id);
    const n = MM.node(id);
    if (!div || !n || !AU.isAudio(n.file)) return;
    const st = AU.state(n);
    const btn = div.querySelector('.audio-btn');
    if (btn) {
      btn.textContent = st.loading ? '…' : st.playing ? '❚❚' : '▶';
      btn.classList.toggle('playing', st.playing);
      btn.title = st.playing ? tr('Pause') : tr('Play');
    }
    const sub = div.querySelector('.file-sub');
    if (sub) sub.textContent = AU.subText(n);
    const fill = div.querySelector('.audio-bar > span');
    if (fill) fill.style.width = (st.duration ? Math.min(100, (st.time / st.duration) * 100) : 0) + '%';
  };

  function stop() {
    if (!cur) return;
    const old = cur;
    cur = null;
    if (old.audio) {
      old.audio.pause();
      old.audio.removeAttribute('src');
    }
    if (old.url) URL.revokeObjectURL(old.url);
    AU.paint(old.id);
  }
  AU.stop = stop;

  /**
   * Recordings of Chrome have no length in the file: the player says "Infinity" and
   * cannot seek. Jumping far ahead once makes it read to the end and learn the length.
   */
  function learnDuration(a) {
    return new Promise((resolve) => {
      if (isFinite(a.duration) && a.duration > 0) return resolve();
      const done = () => {
        a.removeEventListener('durationchange', check);
        clearTimeout(t);
        a.currentTime = 0;
        resolve();
      };
      const check = () => { if (isFinite(a.duration)) done(); };
      const t = setTimeout(done, 3000);
      a.addEventListener('durationchange', check);
      a.currentTime = 1e101;
    });
  }

  /** Load the sound of note `n` (stopping any other). Resolves with the <audio>, or null. */
  async function load(n) {
    if (cur && cur.id === n.id && cur.path === n.file.path) return cur.audio;
    stop();
    if (!MM.project.backend || !(await MM.project.ensureWriteAccess())) {
      alert(tr('This note points to "{path}".\nOpen the project folder first (sidebar "Project").', { path: n.file.path }));
      return null;
    }
    const me = (cur = { id: n.id, path: n.file.path, audio: null, url: '', loading: true });
    AU.paint(n.id);
    await MM.files.restoreTrashed(); // deleted with its note, the note came back (Ctrl+Z)
    let blob = null;
    try { blob = await MM.project.backend.readBlob(n.file.path); } catch (e) { /* missing */ }
    if (cur !== me) return null; // another note was started meanwhile
    if (!blob) {
      cur = null;
      AU.paint(n.id);
      alert(tr('File not found:\n{path}', { path: n.file.path }));
      return null;
    }
    const a = new Audio();
    me.url = URL.createObjectURL(blob);
    me.audio = a;
    a.preload = 'auto';
    for (const ev of ['play', 'pause', 'ended', 'timeupdate', 'durationchange']) a.addEventListener(ev, () => cur === me && AU.paint(me.id));
    a.addEventListener('ended', () => { if (cur === me) { a.currentTime = 0; AU.paint(me.id); } });
    a.src = me.url;
    await new Promise((resolve) => {
      a.addEventListener('loadedmetadata', resolve, { once: true });
      a.addEventListener('error', resolve, { once: true });
    });
    if (a.error) {
      stop();
      alert(tr('This browser cannot play {name}.', { name: n.file.name }));
      return null;
    }
    await learnDuration(a);
    me.loading = false;
    if (cur !== me) return null;
    AU.paint(me.id); // the length is known now (not written into the map: playing changes nothing)
    return a;
  }

  /** ▶ / ❚❚ of a note. */
  AU.toggle = async function (n) {
    if (!n || !AU.isAudio(n.file)) return;
    if (cur && cur.id === n.id && cur.loading) return;
    const a = await load(n);
    if (!a) return;
    if (a.paused || a.ended) {
      try { await a.play(); } catch (err) { MM.ui.flash(tr('Could not play the recording')); }
    } else a.pause();
  };

  /** Click on the bar of a note: jump there (loads the sound first). */
  AU.seek = async function (n, clientX, bar) {
    const b = bar.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (clientX - b.left) / (b.width || 1)));
    const wasPlaying = cur && cur.id === n.id && cur.audio && !cur.audio.paused;
    const a = await load(n);
    if (!a || !isFinite(a.duration)) return;
    a.currentTime = f * a.duration;
    if (!wasPlaying) AU.paint(n.id);
  };

  /** The note is drawn again (render.js): content for an audio note. */
  AU.build = function (n, icon, body) {
    icon.innerHTML = '';
    icon.classList.add('audio-icon');
    const btn = document.createElement('span');
    btn.className = 'audio-btn';
    icon.append(btn);
    const bar = document.createElement('div');
    bar.className = 'audio-bar';
    bar.title = tr('Click to jump there');
    bar.append(document.createElement('span'));
    body.append(bar);
    // after the frame is in the page
    requestAnimationFrame(() => AU.paint(n.id));
  };

  // ---- Recording ---------------------------------------------------------------

  /**
   * Record with the microphone; the recording becomes an audio note at world point `at`.
   * A dialog shows the time and the level; ❚❚ pauses, ■ saves, Cancel throws it away.
   */
  AU.record = async function (at) {
    const point = at || MM.viewCenter();
    const fmt = AU.format();
    if (!fmt || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert(tr('This browser cannot record sound.'));
      return;
    }
    if (!(await folderReady())) return;
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (err) {
      alert(err && err.name === 'NotAllowedError' ? tr('The microphone is not allowed. Allow it in the address bar (🔒 / ⓘ) and try again.')
        : err && err.name === 'NotFoundError' ? tr('No microphone found.')
          : tr('Could not start the microphone: {err}', { err: (err && err.message) || String(err) }));
      return;
    }
    stop(); // nothing plays into the recording

    const rec = new MediaRecorder(stream, fmt.mime ? { mimeType: fmt.mime } : undefined);
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const started = new Date();
    let ran = 0, since = Date.now(), keep = false;
    const elapsed = () => ran + (rec.state === 'recording' ? Date.now() - since : 0);

    // level meter
    let ctx = null, analyser = null, buf = null;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      buf = new Uint8Array(analyser.fftSize);
    } catch (e) { analyser = null; }

    const d = document.createElement('dialog');
    d.className = 'rec-dialog';
    d.innerHTML = `
      <form method="dialog" class="dlg">
        <h3>${MM.render.esc(tr('Audio recording'))}</h3>
        <div class="rec-row"><span class="rec-dot"></span><span class="rec-time">0:00</span>
          <div class="rec-level"><span></span></div></div>
        <p class="hint">${MM.render.esc(tr('Saved as a file in Assets/ of the project folder; the note plays it.'))}</p>
        <div class="dlg-buttons">
          <button type="button" data-rec="cancel">${MM.render.esc(tr('Cancel'))}</button>
          <span style="flex:1"></span>
          <button type="button" data-rec="pause">❚❚ ${MM.render.esc(tr('Pause'))}</button>
          <button type="submit" class="primary">■ ${MM.render.esc(tr('Stop and save'))}</button>
        </div>
      </form>`;
    document.body.appendChild(d);
    const timeEl = d.querySelector('.rec-time'), level = d.querySelector('.rec-level > span');
    const pauseBtn = d.querySelector('[data-rec="pause"]');
    let raf = 0;
    const tick = () => {
      timeEl.textContent = AU.clock(elapsed() / 1000);
      if (analyser && rec.state === 'recording') {
        analyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128));
        level.style.width = Math.min(100, (peak / 128) * 160) + '%';
      } else level.style.width = '0%';
      raf = requestAnimationFrame(tick);
    };

    pauseBtn.addEventListener('click', () => {
      if (rec.state === 'recording') {
        rec.pause();
        ran += Date.now() - since;
        d.classList.add('paused');
        pauseBtn.textContent = '● ' + tr('Continue');
      } else if (rec.state === 'paused') {
        rec.resume();
        since = Date.now();
        d.classList.remove('paused');
        pauseBtn.textContent = '❚❚ ' + tr('Pause');
      }
    });
    d.querySelector('[data-rec="cancel"]').addEventListener('click', () => {
      if (elapsed() < 3000 || confirm(tr('Throw the recording away?'))) d.close();
    });
    d.addEventListener('cancel', (e) => {
      // Esc: only throw away a short recording without asking
      if (elapsed() >= 3000 && !confirm(tr('Throw the recording away?'))) e.preventDefault();
    });
    d.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      keep = true;
      d.close();
    });
    d.addEventListener('keydown', (e) => e.stopPropagation());

    const finished = new Promise((resolve) => { rec.onstop = resolve; });
    const closed = new Promise((resolve) => d.addEventListener('close', resolve, { once: true }));
    rec.start(1000); // a chunk every second: little is lost if the tab dies
    d.showModal();
    tick();
    await closed;
    const duration = Math.round(elapsed() / 1000);
    cancelAnimationFrame(raf);
    if (rec.state !== 'inactive') rec.stop();
    await finished;
    for (const t of stream.getTracks()) t.stop();
    if (ctx) ctx.close().catch(() => {});
    d.remove();
    if (!keep || !chunks.length) return;

    const type = (rec.mimeType || fmt.mime || 'audio/webm').split(';')[0];
    const ext = /mp4|m4a|aac/.test(type) ? 'm4a' : /ogg/.test(type) ? 'ogg' : 'webm';
    const name = AU.fileName(started, ext);
    const file = new File([new Blob(chunks, { type })], name, { type });
    await AU.insert(file, point, duration);
  };

  /** Store a recording in Assets/ and put its note at `at`. If that fails, offer it as a download. */
  AU.insert = async function (file, at, duration) {
    let data = null;
    try {
      if (await folderReady()) data = await MM.files.store(file);
    } catch (err) {
      alert(tr('Could not attach {name}:\n{err}', { name: file.name, err: err.message }));
    }
    if (!data) {
      // never lose a recording: hand it over as a download instead
      if (confirm(tr('The recording could not be saved in the project folder. Download it instead?'))) {
        const url = URL.createObjectURL(file);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      }
      return null;
    }
    if (duration) data.duration = duration;
    const n = MM.createNode('file', at.x, at.y);
    n.text = file.name.replace(/\.[^.]+$/, '');
    n.file = data;
    S.doc.nodes[n.id] = n;
    MM.select([n.id]);
    MM.commit();
    MM.project.scan();
    MM.ui.flash(tr('Recording saved'));
    return n;
  };

  // another map opened: the sound of a note that is gone stops
  AU.prune = function () {
    if (cur && !MM.node(cur.id)) stop();
  };
})(window.MM);
