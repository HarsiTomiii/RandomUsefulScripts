/* Fullscreen pattern viewer.
 * Keys (keyboard or TV remote D-pad):
 *   ◀ ▶  previous / next pattern      ▲ ▼  change variant (a)
 *   OK / Enter / Space  cycle option (b) or pin the info panel
 *   I / H / ?  pin the info panel      S  save the current pattern as PNG
 *   Esc / Back  close
 */
(function () {
  'use strict';

  const P = window.Patterns;
  let root, canvas, ctx, domHost, overlay;
  let idx = 0, a = 0, b = 0;
  let open = false, pinned = false, hideTimer = 0, cursorTimer = 0, raf = 0;
  let anim = { frame: 0, hz: 0, deltas: [], last: 0 };
  let lastInfo = null;
  let getDevice = () => 'lgc6';

  function build() {
    root = document.createElement('div');
    root.id = 'viewer';
    root.hidden = true;
    root.innerHTML = '<canvas></canvas><div class="v-dom"></div><div class="v-overlay"></div>';
    document.body.appendChild(root);
    canvas = root.querySelector('canvas');
    ctx = canvas.getContext('2d', { alpha: false });
    domHost = root.querySelector('.v-dom');
    overlay = root.querySelector('.v-overlay');

    window.addEventListener('resize', () => open && draw());
    document.addEventListener('fullscreenchange', () => open && draw());
    window.addEventListener('popstate', () => { if (open) teardown(); });
    document.addEventListener('keydown', onKey, true);
    root.addEventListener('click', () => { pinned = !pinned; showOverlay(); });
    root.addEventListener('wheel', (e) => { e.preventDefault(); stepA(e.deltaY > 0 ? -1 : 1); }, { passive: false });
    root.addEventListener('mousemove', () => {
      root.classList.add('show-cursor');
      clearTimeout(cursorTimer);
      cursorTimer = setTimeout(() => root.classList.remove('show-cursor'), 1500);
    });
  }

  function pat() { return P[idx]; }
  function defA(p) { return p.a ? p.a.def || 0 : 0; }
  function defB(p) { return p.b ? p.b.def || 0 : 0; }

  /** Size the canvas so one canvas pixel == one device pixel. Returns pixel-exactness info. */
  function fitCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const r = root.getBoundingClientRect();
    const cw = Math.round(r.width * dpr), ch = Math.round(r.height * dpr);
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    canvas.style.width = cw / dpr + 'px';
    canvas.style.height = ch / dpr + 'px';
    const exact = Math.abs(r.width * dpr - cw) < 0.01 && Math.abs(r.height * dpr - ch) < 0.01;
    const screenPx = `${Math.round(screen.width * dpr)}×${Math.round(screen.height * dpr)}`;
    return { cw, ch, dpr, exact, screenPx, full: !!document.fullscreenElement };
  }

  function draw() {
    const p = pat();
    const info = fitCanvas();
    lastInfo = info;
    if (p.dom) {
      canvas.hidden = true;
      domHost.hidden = false;
      p.renderDom(domHost, a, b);
    } else {
      canvas.hidden = false;
      domHost.hidden = true;
      domHost.innerHTML = '';
      p.render(ctx, canvas.width, canvas.height, a, b, anim);
    }
    renderOverlay(info);
  }

  function esc(s) { return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

  function renderOverlay(info) {
    const p = pat();
    const dev = getDevice();
    const tip = p.tips && p.tips[dev];
    const variants = [];
    if (p.a) variants.push(`<b>${esc(p.a.label)}:</b> ${esc(p.a.options[a])} <span class="k">▲▼</span>`);
    if (p.b) variants.push(`<b>${esc(p.b.label)}:</b> ${esc(p.b.options[b])} <span class="k">OK</span>`);
    let px;
    if (p.dom) px = `<span class="ok">HTML text at ${info.dpr}× scaling</span>`;
    else if (!info.exact) px = `<span class="warn">⚠ Not pixel-exact (${info.cw}×${info.ch}, DPR ${info.dpr}). Set browser zoom to 100%.</span>`;
    else if (!info.full) px = `<span class="warn">Canvas ${info.cw}×${info.ch}: not fullscreen. Press F11 or click "Fullscreen".</span>`;
    else px = `<span class="ok">✓ Pixel-exact ${info.cw}×${info.ch} (DPR ${info.dpr})</span>`;
    overlay.innerHTML = `
      <div class="v-title">${idx + 1}/${P.length} · ${esc(p.name)}</div>
      ${variants.length ? `<div class="v-var">${variants.join(' &nbsp;·&nbsp; ')}</div>` : ''}
      <ul>${p.look.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
      ${tip ? `<div class="v-tip">${esc(tip)}</div>` : ''}
      <div class="v-foot">${px}<br>
        <span class="k">◀▶</span> pattern · <span class="k">▲▼</span> variant · <span class="k">OK</span> option/pin ·
        <span class="k">I</span> info · ${p.exportable ? '<span class="k">S</span> save PNG · ' : ''}<span class="k">Esc/Back</span> close
        ${pinned ? ' · <b>info pinned</b>' : ''}</div>`;
  }

  function showOverlay() {
    overlay.classList.add('on');
    clearTimeout(hideTimer);
    if (!pinned) hideTimer = setTimeout(() => overlay.classList.remove('on'), 4000);
    if (open && lastInfo) renderOverlay(lastInfo);
  }

  function go(i) {
    idx = (i + P.length) % P.length;
    const p = pat();
    a = defA(p); b = defB(p);
    anim = { frame: 0, hz: 0, deltas: [], last: 0 };
    startStopAnim();
    draw();
    showOverlay();
  }

  function stepA(d) {
    const p = pat();
    if (!p.a) return;
    a = (a + d + p.a.options.length) % p.a.options.length;
    draw(); showOverlay();
  }

  function stepB() {
    const p = pat();
    if (!p.b) { pinned = !pinned; showOverlay(); return; }
    b = (b + 1) % p.b.options.length;
    draw(); showOverlay();
  }

  function startStopAnim() {
    cancelAnimationFrame(raf);
    if (!open || !pat().animated) return;
    const tick = (t) => {
      if (anim.last) {
        anim.deltas.push(t - anim.last);
        if (anim.deltas.length > 120) anim.deltas.shift();
        if (anim.deltas.length >= 20) {
          const s = anim.deltas.slice().sort((x, y) => x - y);
          anim.hz = 1000 / s[Math.floor(s.length / 2)];
        }
      }
      anim.last = t;
      anim.frame++;
      pat().render(ctx, canvas.width, canvas.height, a, b, anim);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  function savePng() {
    const p = pat();
    if (!p.exportable) return;
    canvas.toBlob((blob) => {
      const name = `${p.id}${p.a ? '_' + slug(p.a.options[a]) : ''}${p.b ? '_' + slug(p.b.options[b]) : ''}_${canvas.width}x${canvas.height}.png`;
      download(blob, name);
    }, 'image/png');
  }

  function slug(s) { return String(s).toLowerCase().replace(/%/g, 'pct').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = name;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function onKey(e) {
    if (!open) return;
    const k = e.key;
    let handled = true;
    if (k === 'ArrowRight' || k === 'PageDown') go(idx + 1);
    else if (k === 'ArrowLeft' || k === 'PageUp') go(idx - 1);
    else if (k === 'ArrowUp') stepA(1);
    else if (k === 'ArrowDown') stepA(-1);
    else if (k === 'Enter' || k === ' ' || k === 'Select') stepB();
    else if (k === 'i' || k === 'I' || k === 'h' || k === 'H' || k === '?' || k === 'Info') { pinned = !pinned; showOverlay(); }
    else if (k === 's' || k === 'S') savePng();
    else if (k === 'f' || k === 'F') toggleFullscreen();
    else if (k === 'Escape' || k === 'Backspace' || k === 'GoBack' || k === 'BrowserBack') close();
    else handled = false;
    if (handled) { e.preventDefault(); e.stopPropagation(); }
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (root.requestFullscreen) root.requestFullscreen().catch(() => {});
  }

  function show(i, fullscreen) {
    if (!root) build();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    open = true;
    root.hidden = false;
    document.documentElement.classList.add('viewing');
    history.pushState({ tvcalViewer: true }, '');
    if (fullscreen !== false && root.requestFullscreen && !document.fullscreenElement) {
      root.requestFullscreen().catch(() => {}).finally(() => open && draw());
    }
    go(i || 0);
  }

  function close() {
    if (!open) return;
    if (history.state && history.state.tvcalViewer) history.back(); // popstate -> teardown
    else teardown();
  }

  function teardown() {
    open = false;
    cancelAnimationFrame(raf);
    clearTimeout(hideTimer);
    root.hidden = true;
    document.documentElement.classList.remove('viewing');
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (window.ViewerOnClose) window.ViewerOnClose(idx);
  }

  window.Viewer = {
    show,
    isOpen: () => open,
    setDeviceGetter(fn) { getDevice = fn; },
    download,
    slug,
  };
})();
