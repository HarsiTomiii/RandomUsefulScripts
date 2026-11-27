/* Home page: device switcher, pattern grid, PNG pack export, settings checklist. */
(function () {
  'use strict';

  const P = window.Patterns;
  const C = window.Checklists;
  const $ = (id) => document.getElementById(id);

  const store = {
    get(k, d) { try { const v = localStorage.getItem('tvcal.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('tvcal.' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  };

  let device = store.get('device', 'lgc6');
  if (!C[device]) device = 'lgc6';
  Viewer.setDeviceGetter(() => device);

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const indexOf = (id) => P.findIndex((p) => p.id === id);

  // ---------- devices ----------
  function renderDevices() {
    $('devices').innerHTML = Object.values(C).map((d) =>
      `<button class="dev ${d.id === device ? 'active' : ''}" data-dev="${d.id}">${esc(d.name)}</button>`).join('');
    $('deviceBlurb').textContent = C[device].blurb;
  }
  $('devices').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-dev]');
    if (!btn) return;
    device = btn.dataset.dev;
    store.set('device', device);
    renderDevices();
    renderChecklist();
  });

  // ---------- pattern grid ----------
  function renderGrid() {
    const grid = $('patternGrid');
    grid.innerHTML = P.map((p, i) => `
      <button class="card" data-idx="${i}">
        <canvas class="thumb" width="384" height="216"></canvas>
        <span class="card-body">
          <span class="card-title">${i + 1}. ${esc(p.name)} <span class="tag">${esc(p.group)}</span></span>
          <span class="card-sum">${esc(p.summary)}</span>
        </span>
      </button>`).join('');
    grid.querySelectorAll('canvas.thumb').forEach((cv, i) => {
      const p = P[i];
      const ctx = cv.getContext('2d', { alpha: false });
      try {
        if (p.thumb) p.thumb(ctx, cv.width, cv.height);
        else p.render(ctx, cv.width, cv.height, p.a ? p.a.def || 0 : 0, p.b ? p.b.def || 0 : 0, { frame: 40, hz: 0 });
      } catch (err) { console.error('thumb', p.id, err); }
    });
  }
  $('patternGrid').addEventListener('click', (e) => {
    const card = e.target.closest('[data-idx]');
    if (card) Viewer.show(+card.dataset.idx);
  });
  $('startAll').addEventListener('click', () => Viewer.show(0));

  window.ViewerOnClose = (idx) => {
    const card = document.querySelector(`.card[data-idx="${idx}"]`);
    if (card) card.focus();
  };

  // ---------- PNG pack ----------
  function packList() {
    const out = [];
    P.forEach((p, pi) => {
      if (!p.exportable) return;
      const defB = p.b ? p.b.def || 0 : 0;
      const variants = p.pack ? p.pack() : p.a ? p.a.options.map((_, ai) => [ai, defB]) : [[0, defB]];
      variants.forEach(([a, b]) => {
        const parts = [String(pi + 1).padStart(2, '0'), p.id];
        if (p.a) parts.push(String(a + 1).padStart(2, '0') + '-' + Viewer.slug(p.a.options[a]));
        if (p.b) parts.push(Viewer.slug(p.b.options[b]));
        out.push({ p, a, b, name: parts.join('_') + '.png' });
      });
    });
    return out;
  }

  const toBytes = (canvas) => new Promise((res, rej) =>
    canvas.toBlob((blob) => (blob ? blob.arrayBuffer().then((buf) => res(new Uint8Array(buf)), rej) : rej(new Error('toBlob failed'))), 'image/png'));

  $('exportPack').addEventListener('click', async () => {
    const btn = $('exportPack');
    const [w, h] = $('packRes').value.split('x').map(Number);
    const list = packList();
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { alpha: false });
    const folder = `TVCalibration-${w}x${h}/`;
    const files = [];
    btn.disabled = true;
    try {
      for (let i = 0; i < list.length; i++) {
        const it = list[i];
        $('packStatus').textContent = `Rendering ${i + 1}/${list.length}…`;
        it.p.render(ctx, w, h, it.a, it.b, null);
        files.push({ name: folder + it.name, data: await toBytes(canvas) });
      }
      const readme = [
        'TV calibration pattern pack',
        `Resolution: ${w}x${h}, full-range 8-bit sRGB.`,
        'Show the images at 100% with no zoom or slideshow effects.',
        'The TV photo viewer may use different picture settings than video apps.',
        '',
        ...P.filter((p) => p.exportable).map((p) => `${p.name}: ${p.look.join(' ')}`),
      ].join('\r\n');
      files.push({ name: folder + '00_README.txt', data: new TextEncoder().encode(readme) });
      $('packStatus').textContent = 'Zipping…';
      Viewer.download(Zip.build(files), `TVCalibration-patterns-${w}x${h}.zip`);
      $('packStatus').textContent = `Done: ${files.length - 1} images.`;
    } catch (err) {
      console.error(err);
      $('packStatus').textContent = 'Export failed: ' + err.message;
    } finally {
      btn.disabled = false;
    }
  });

  // ---------- checklist ----------
  function checks() { return store.get('checks.' + device, {}); }

  function renderChecklist() {
    const d = C[device];
    const done = checks();
    let total = 0, ticked = 0;
    $('checklist').innerHTML = d.sections.map((s) => `
      <div class="sec">
        <h3>${esc(s.title)}</h3>
        ${s.items.map((it) => {
          total++;
          const on = !!done[it.id];
          if (on) ticked++;
          const pi = it.pattern ? indexOf(it.pattern) : -1;
          return `<div class="item ${on ? 'done' : ''}">
            <label><input type="checkbox" data-check="${esc(it.id)}" ${on ? 'checked' : ''}>
              <span class="item-text">${esc(it.text)}</span></label>
            ${pi >= 0 ? `<button class="btn small" data-open="${pi}">Pattern: ${esc(P[pi].name)}</button>` : ''}
            ${it.detail ? `<div class="item-detail">${esc(it.detail)}</div>` : ''}
            ${it.cmd ? `<div class="cmd"><pre>${esc(it.cmd)}</pre><button class="btn small" data-copy>Copy</button></div>` : ''}
          </div>`;
        }).join('')}
      </div>`).join('');
    $('checkProgress').textContent = `${ticked}/${total} done`;
  }

  $('checklist').addEventListener('change', (e) => {
    const id = e.target.dataset && e.target.dataset.check;
    if (!id) return;
    const done = checks();
    if (e.target.checked) done[id] = true; else delete done[id];
    store.set('checks.' + device, done);
    renderChecklist();
    const again = document.querySelector(`[data-check="${CSS.escape(id)}"]`);
    if (again) again.focus();
  });
  $('checklist').addEventListener('click', (e) => {
    const b = e.target.closest('[data-open]');
    if (b) Viewer.show(+b.dataset.open);
    const cp = e.target.closest('[data-copy]');
    if (cp) {
      const txt = cp.parentElement.querySelector('pre').textContent;
      const done = () => { cp.textContent = 'Copied'; setTimeout(() => { cp.textContent = 'Copy'; }, 1500); };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(txt).then(done, () => selectText(cp));
      else selectText(cp);
    }
  });
  function selectText(btn) {  // clipboard API needs https/localhost; fall back to selecting the text
    const r = document.createRange();
    r.selectNodeContents(btn.parentElement.querySelector('pre'));
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    btn.textContent = 'Ctrl+C';
  }
  $('resetChecks').addEventListener('click', () => {
    if (!confirm('Clear all ticks for ' + C[device].name + '?')) return;
    store.set('checks.' + device, {});
    renderChecklist();
  });

  // ---------- TV remote navigation on the home page ----------
  // D-pad moves focus through buttons/checkboxes in page order (TV browsers often lack spatial nav).
  document.addEventListener('keydown', (e) => {
    if (Viewer.isOpen()) return;
    const k = e.key;
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) return;
    const active = document.activeElement;
    if (active && active.tagName === 'SELECT') return;
    const focusables = Array.from(document.querySelectorAll('button:not([disabled]), input, select'))
      .filter((el) => el.offsetParent !== null);
    if (!focusables.length) return;
    const i = focusables.indexOf(active);
    const fwd = k === 'ArrowDown' || k === 'ArrowRight';
    const next = i < 0 ? focusables[0] : focusables[(i + (fwd ? 1 : -1) + focusables.length) % focusables.length];
    next.focus();
    next.scrollIntoView({ block: 'nearest' });
    e.preventDefault();
  });

  renderDevices();
  renderGrid();
  renderChecklist();

  // Deep link: index.html#pattern=gamma opens that pattern (handy as a TV browser bookmark).
  const m = /pattern=([\w-]+)/.exec(location.hash);
  if (m && indexOf(m[1]) >= 0) Viewer.show(indexOf(m[1]), false);
})();
