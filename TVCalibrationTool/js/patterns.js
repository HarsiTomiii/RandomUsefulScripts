/* Test patterns. Every canvas pattern draws in *device* pixels (the viewer sizes the
 * canvas 1:1 with the panel), so 1-pixel details stay 1 pixel on the TV.
 *
 * Pattern shape:
 *   id, name, group, summary          – shown on the home page
 *   look: [..]                        – "what to look for", shown in the viewer overlay
 *   tips: { lgc6, philips708 }        – optional device-specific hint
 *   a / b: { label, options: [..], def } – optional variant axes (▲▼ cycles a, OK cycles b)
 *   render(ctx, w, h, a, b, state)    – canvas patterns
 *   dom: true + renderDom(el, a, b)   – patterns rendered as real HTML text
 *   animated, exportable, pack()      – viewer/export flags
 */
(function () {
  'use strict';

  // ---------- helpers ----------
  const SANS = '"Noto Sans", "Segoe UI", Roboto, Cantarell, Arial, sans-serif';
  const MONO = '"JetBrains Mono", Hack, "Cascadia Mono", "Noto Sans Mono", "DejaVu Sans Mono", Consolas, monospace';
  const rgb =(r, g, b) => `rgb(${r},${g},${b})`;
  const gray = (v) => rgb(v, v, v);
  const to8 = (f) => Math.max(0, Math.min(255, Math.round(f * 255)));
  const unit = (w, h) => Math.min(w, h) / 100;

  function fill(ctx, color, x, y, w, h) {
    ctx.fillStyle = color;
    const x0 = Math.round(x), y0 = Math.round(y);
    ctx.fillRect(x0, y0, Math.round(x + w) - x0, Math.round(y + h) - y0);
  }

  function text(ctx, str, x, y, size, color, align, baseline, font) {
    ctx.font = `${Math.max(9, Math.round(size))}px ${font || SANS}`;
    ctx.fillStyle = color;
    ctx.textAlign = align || 'center';
    ctx.textBaseline = baseline || 'middle';
    ctx.fillText(str, Math.round(x), Math.round(y));
  }

  /** Horizontal ramp from `from` to `to` (inclusive), one band per code value. */
  function hRamp(ctx, x, y, w, h, from, to, colorFn) {
    const n = to - from + 1;
    for (let i = 0; i < n; i++) {
      const xa = x + Math.round((i * w) / n);
      const xb = x + Math.round(((i + 1) * w) / n);
      ctx.fillStyle = colorFn(from + i);
      ctx.fillRect(xa, y, xb - xa, h);
    }
  }

  /** Fill a rect with a periodic per-pixel tile (tw×th). fn(px, py) -> [r, g, b].
   *  The tile is anchored to the canvas origin, so pixels stay exact (no scaling). */
  function tileFill(ctx, x, y, w, h, tw, th, fn) {
    const tile = document.createElement('canvas');
    tile.width = tw; tile.height = th;
    const tctx = tile.getContext('2d');
    const img = tctx.createImageData(tw, th);
    for (let py = 0; py < th; py++) {
      for (let px = 0; px < tw; px++) {
        const c = fn(px, py), i = (py * tw + px) * 4;
        img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255;
      }
    }
    tctx.putImageData(img, 0, 0);
    ctx.fillStyle = ctx.createPattern(tile, 'repeat');
    const x0 = Math.round(x), y0 = Math.round(y);
    ctx.fillRect(x0, y0, Math.round(x + w) - x0, Math.round(y + h) - y0);
  }

  /** Grid of labelled squares inside rect r. */
  function squares(ctx, r, values, cols, squareColor, labelColor) {
    const rows = Math.ceil(values.length / cols);
    const size = Math.floor(Math.min(r.w / (cols + 1.5 + (cols - 1) * 0.25), r.h / (rows * 1.5 + 0.5)));
    const gap = Math.floor(size * 0.25);
    const cellH = size + Math.round(size * 0.5);
    const gridW = cols * size + (cols - 1) * gap;
    const gridH = rows * cellH - Math.round(size * 0.2);
    const x0 = r.x + Math.round((r.w - gridW) / 2);
    const y0 = r.y + Math.round((r.h - gridH) / 2);
    values.forEach((v, i) => {
      const c = i % cols, row = Math.floor(i / cols);
      const x = x0 + c * (size + gap), y = y0 + row * cellH;
      fill(ctx, squareColor(v), x, y, size, size);
      text(ctx, String(v), x + size / 2, y + size + size * 0.2, size * 0.22, labelColor);
    });
  }

  const range = (a, b, step) => { const o = []; for (let v = a; v <= b; v += step || 1) o.push(v); return o; };

  // sRGB / power-law encoding of a linear light fraction
  function encode(L, g) {
    if (g === 'sRGB') return L <= 0.0031308 ? 12.92 * L : 1.055 * Math.pow(L, 1 / 2.4) - 0.055;
    return Math.pow(L, 1 / g);
  }

  const BAR_COLORS = [
    ['White', 1, 1, 1], ['Yellow', 1, 1, 0], ['Cyan', 0, 1, 1], ['Green', 0, 1, 0],
    ['Magenta', 1, 0, 1], ['Red', 1, 0, 0], ['Blue', 0, 0, 1], ['Black', 0, 0, 0],
  ];
  const STEP_COLORS = [
    ['Red', 1, 0, 0], ['Green', 0, 1, 0], ['Blue', 0, 0, 1],
    ['Cyan', 0, 1, 1], ['Magenta', 1, 0, 1], ['Yellow', 1, 1, 0], ['White', 1, 1, 1],
  ];

  const WINDOW_LEVELS = range(0, 100, 5);
  const WINDOW_SIZES = [
    { label: '10% window', f: 0.10 }, { label: '18% window', f: 0.18 },
    { label: '50% window', f: 0.50 }, { label: 'Full field', f: 1.0 },
  ];
  const GAMMAS = [1.8, 2.0, 2.2, 'sRGB', 2.4, 2.6];
  const GAMMA_MIXES = [
    { label: '50% mix (1 of 2 lines lit)', on: 1, period: 2 },
    { label: '25% mix (1 of 4 lines lit)', on: 1, period: 4 },
    { label: '75% mix (3 of 4 lines lit)', on: 3, period: 4 },
  ];
  const FIELDS = [
    ['Grey 2%', 2], ['Grey 5%', 5], ['Grey 10%', 10], ['Grey 20%', 20], ['Grey 50%', 50],
    ['Grey 75%', 75], ['White 100%', 100],
    ['Red', [1, 0, 0]], ['Green', [0, 1, 0]], ['Blue', [0, 0, 1]],
    ['Cyan', [0, 1, 1]], ['Magenta', [1, 0, 1]], ['Yellow', [1, 1, 0]],
  ];
  const MOTION_SPEEDS = [4, 8, 16, 32];

  const CODE_SAMPLE = [
    ['k', 'async function '], ['f', 'loadContinueWatching'], ['p', '(userId, limit = 12) {'], ['br'],
    ['p', '  '], ['k', 'const '], ['v', 'url'], ['p', ' = `${'], ['v', 'BASE'], ['p', '}/Users/${'], ['v', 'userId'], ['p', '}/Items/Resume`;'], ['br'],
    ['p', '  '], ['k', 'const '], ['v', 'res'], ['p', ' = '], ['k', 'await '], ['f', 'fetch'], ['p', '(url, { headers });'], ['br'],
    ['p', '  '], ['k', 'if '], ['p', '(!res.ok) '], ['k', 'throw new '], ['t', 'Error'], ['p', '('], ['s', '"HTTP " '], ['p', '+ res.status);'], ['br'],
    ['p', '  '], ['c', '// sort by last played, newest first (0O 1lI| {}[] ;: ,.)'], ['br'],
    ['p', '  '], ['k', 'return '], ['p', '(await res.json()).Items.'], ['f', 'slice'], ['p', '('], ['n', '0'], ['p', ', limit);'], ['br'],
    ['p', '}'],
  ];

  function codeHtml() {
    return CODE_SAMPLE.map(([cls, t]) => (cls === 'br' ? '\n' : `<span class="tk-${cls}">${t.replace(/</g, '&lt;')}</span>`)).join('');
  }

  // ---------- patterns ----------
  const P = [];

  P.push({
    id: 'black-level', name: 'Black level', group: 'Levels',
    summary: 'Near-black squares 1–24 on true black. Sets Brightness/Black Level and catches range mismatch.',
    look: [
      'In a dark room, squares 2–3 should be faintly visible and 1 only just (or not at all on OLED).',
      'If 1–6 all vanish: black crush, either Brightness is too low or the TV expects limited range while the PC sends full.',
      'If the background looks dark grey instead of OLED "off" black: raised blacks (PC limited, TV full), or Brightness too high.',
    ],
    tips: {
      lgc6: 'Grey blacks at 4K 100/120 Hz on AMD mean the HDMI 2.1 FRL fallback to YCbCr 4:2:0 (see "lgtv-pc doctor"). Otherwise leave the Black Level slider near 50 and set the TV’s HDMI range (Auto/Low/High or Auto/Limited/Full, depending on firmware) to Auto.',
      philips708: 'Philips: adjust Brightness (black level) only after Ambilight and the light sensor are off.',
    },
    render(ctx, w, h) {
      fill(ctx, gray(0), 0, 0, w, h);
      squares(ctx, { x: 0, y: 0, w, h }, range(1, 24), 12, gray, gray(36));
    },
  });

  P.push({
    id: 'white-clip', name: 'White clipping', group: 'Levels',
    summary: 'Squares 230–254 on full white. Sets Contrast and shows highlight clipping or tint.',
    look: [
      'You should be able to tell squares up to ~250–253 apart from the 255 background.',
      'If the top squares disappear: Contrast too high, or a range mismatch is clipping highlights.',
      'Look for colour: near-white squares should stay neutral, not turn pink/green/yellow.',
      'OLED dims large white areas (ABL); use the small-window variant to see the panel at fuller brightness.',
    ],
    a: { label: 'Layout', options: ['Full field', 'Small window (less ABL)'], def: 0 },
    render(ctx, w, h, a) {
      if (a === 0) {
        fill(ctx, gray(255), 0, 0, w, h);
        squares(ctx, { x: 0, y: 0, w, h }, range(230, 254), 13, gray, gray(150));
      } else {
        fill(ctx, gray(0), 0, 0, w, h);
        const r = { x: w * 0.25, y: h * 0.3, w: w * 0.5, h: h * 0.4 };
        fill(ctx, gray(255), r.x, r.y, r.w, r.h);
        squares(ctx, r, range(240, 254), 8, gray, gray(150));
      }
    },
  });

  P.push({
    id: 'ramp', name: 'Grey ramp & gradients', group: 'Tone',
    summary: 'Smooth and stepped ramps: banding, posterisation and grey tint.',
    look: [
      'Smooth ramps should have no visible bands, jumps or coloured stripes.',
      'Stepped greys should all look neutral: no step turning pink, green or blue.',
      'Both ends should reach true black and full white without merging early (clipping).',
      'Near-black stretch: OLEDs often show blotches/banding here; processing like "Smooth Gradation" can hide it.',
    ],
    a: { label: 'Ramp', options: ['Smooth grey', 'Stepped grey (5%)', 'Smooth RGB', 'Near-black stretch (0–64)'], def: 0 },
    render(ctx, w, h, a) {
      const u = unit(w, h);
      fill(ctx, gray(0), 0, 0, w, h);
      if (a === 0) {
        hRamp(ctx, 0, 0, w, Math.round(h * 0.5), 0, 255, gray);
        hRamp(ctx, 0, Math.round(h * 0.5), w, h - Math.round(h * 0.5), 0, 255, (v) => gray(255 - v));
      } else if (a === 1) {
        const steps = range(0, 100, 5);
        steps.forEach((p, i) => {
          const xa = Math.round((i * w) / steps.length), xb = Math.round(((i + 1) * w) / steps.length);
          const v = to8(p / 100);
          fill(ctx, gray(v), xa, 0, xb - xa, h);
          text(ctx, p + '%', (xa + xb) / 2, h - 3 * u, 1.6 * u, v > 128 ? gray(40) : gray(170));
          text(ctx, String(v), (xa + xb) / 2, h - 6 * u, 1.3 * u, v > 128 ? gray(70) : gray(130));
        });
      } else if (a === 2) {
        const bands = [(v) => gray(v), (v) => rgb(v, 0, 0), (v) => rgb(0, v, 0), (v) => rgb(0, 0, v)];
        bands.forEach((fn, i) => {
          const ya = Math.round((i * h) / 4), yb = Math.round(((i + 1) * h) / 4);
          hRamp(ctx, 0, ya, w, yb - ya, 0, 255, fn);
        });
      } else {
        const top = Math.round(h * 0.6);
        hRamp(ctx, 0, 0, w, top, 0, 64, gray);
        const steps = range(0, 64, 4);
        steps.forEach((v, i) => {
          const xa = Math.round((i * w) / steps.length), xb = Math.round(((i + 1) * w) / steps.length);
          fill(ctx, gray(v), xa, top, xb - xa, h - top);
          text(ctx, String(v), (xa + xb) / 2, h - 3 * u, 1.5 * u, gray(110));
        });
      }
    },
  });

  P.push({
    id: 'window', name: 'Grey window', group: 'Tone',
    summary: 'A grey patch from 0–100% in 5% steps on black. Used for grey tint, panel brightness and the Phase 2 meter.',
    look: [
      'Step through levels with ▲▼. Every step should look the same neutral grey with no colour cast.',
      'A pink/magenta cast means too little green (common on WOLED); a green cast means too much.',
      'At 100%, compare the 10% window with full field to see how much the TV dims large bright areas (ABL).',
      'Use the 50% window to set a comfortable OLED brightness for desktop work.',
    ],
    a: { label: 'Level', options: WINDOW_LEVELS.map((p) => `${p}% (${to8(p / 100)})`), def: 10 },
    b: { label: 'Size', options: WINDOW_SIZES.map((s) => s.label), def: 1 },
    pack() { return WINDOW_LEVELS.map((_, i) => [i, 1]); },
    render(ctx, w, h, a, b) {
      const u = unit(w, h);
      const v = to8(WINDOW_LEVELS[a] / 100);
      const f = WINDOW_SIZES[b].f;
      fill(ctx, gray(0), 0, 0, w, h);
      if (f >= 1) { fill(ctx, gray(v), 0, 0, w, h); return; }
      const rw = Math.round(w * Math.sqrt(f)), rh = Math.round(h * Math.sqrt(f));
      fill(ctx, gray(v), (w - rw) / 2, (h - rh) / 2, rw, rh);
      text(ctx, `${WINDOW_LEVELS[a]}% · ${v}`, 2 * u, h - 2 * u, 1.4 * u, gray(60), 'left', 'bottom');
    },
  });

  P.push({
    id: 'gamma', name: 'Gamma check', group: 'Tone',
    summary: 'Solid patches beside fine line patterns. The patch that blends in shows the TV’s real gamma.',
    look: [
      'Step back or squint until the line background becomes a flat grey. The patch that disappears into it shows your gamma.',
      'For PC, web and YouTube, aim for 2.2 (or between 2.2 and sRGB). For films in a dark room, aim for 2.4 (BT.1886).',
      'Try the 25% and 75% mixes too: if a different patch matches at each, the curve isn’t a clean power law.',
      'Only valid when the overlay says the canvas is pixel-exact (browser zoom 100%).',
    ],
    tips: {
      lgc6: 'LG: Picture → Advanced → Brightness → Gamma. Compare 2.2 against BT.1886.',
      philips708: 'Philips: change the Gamma slider in Picture → Advanced → Contrast and re-check (name may vary).',
    },
    a: { label: 'Mix', options: GAMMA_MIXES.map((m) => m.label), def: 0 },
    b: { label: 'Lines', options: ['Horizontal lines', 'Vertical lines'], def: 0 },
    render(ctx, w, h, a, b) {
      const u = unit(w, h);
      const m = GAMMA_MIXES[a];
      fill(ctx, gray(0), 0, 0, w, h);
      ctx.fillStyle = gray(255);
      if (b === 0) { for (let y = 0; y < h; y++) if (y % m.period < m.on) ctx.fillRect(0, y, w, 1); }
      else { for (let x = 0; x < w; x++) if (x % m.period < m.on) ctx.fillRect(x, 0, 1, h); }
      const L = m.on / m.period;
      const n = GAMMAS.length;
      const pw = Math.floor(w / 9.5), ph = Math.floor(h / 3), gap = Math.floor(pw / 4);
      const total = n * pw + (n - 1) * gap;
      const x0 = Math.round((w - total) / 2), y0 = Math.round((h - ph) / 2 - 2 * u);
      GAMMAS.forEach((g, i) => {
        const v = to8(encode(L, g));
        const x = x0 + i * (pw + gap);
        fill(ctx, gray(v), x, y0, pw, ph);
        fill(ctx, gray(0), x, y0 + ph + u, pw, 5 * u);
        text(ctx, (g === 'sRGB' ? 'sRGB' : 'γ ' + g.toFixed(1)), x + pw / 2, y0 + ph + 2.6 * u, 1.8 * u, gray(230));
        text(ctx, String(v), x + pw / 2, y0 + ph + 4.8 * u, 1.3 * u, gray(140));
      });
    },
  });

  P.push({
    id: 'chroma', name: 'Chroma 4:4:4 / text colour', group: 'Detail',
    summary: 'Coloured text and 1-pixel colour lines. Shows whether the TV gets and keeps full 4:4:4 colour detail.',
    look: [
      'All coloured text should be as sharp as the white text. Smeared or blurry red/blue text means chroma subsampling (4:2:2/4:2:0).',
      'Up close, the 1-px red/blue lines should be separate lines, not a flat purple (and green/magenta not a flat grey).',
      'Check again at every refresh rate you use: some TVs drop to 4:2:0 at the highest refresh rates.',
    ],
    tips: {
      lgc6: 'Two causes on CachyOS/AMD: no HDMI 2.1 FRL (4K above 60 Hz falls back to 4:2:0; check with "lgtv-pc doctor"), or the TV input isn’t in PC mode ("lgtv-pc apply"; RTINGS notes the C6 needs PC mode for 4:4:4). RWBG subpixels still give some colour fringing on text when 4:4:4 works.',
      philips708: 'Philips: for a PC on HDMI, use the Monitor/PC picture style or the Game style so chroma isn’t subsampled (names vary).',
    },
    render(ctx, w, h) {
      const u = unit(w, h);
      fill(ctx, gray(0), 0, 0, w, h);
      const combos = [
        ['#ff0000', '#0000ff', 'Red on blue'], ['#0000ff', '#ff0000', 'Blue on red'],
        ['#00ff00', '#ff00ff', 'Green on magenta'], ['#ff00ff', '#00ff00', 'Magenta on green'],
        ['#ffff00', '#0000ff', 'Yellow on blue'], ['#00ffff', '#ff0000', 'Cyan on red'],
        ['#ff0000', '#000000', 'Red on black'], ['#ffffff', '#000000', 'White on black (reference)'],
      ];
      const top = Math.round(h * 0.66);
      const cols = 2, rows = 4, pad = Math.round(u);
      const cw = Math.floor((w - pad * (cols + 1)) / cols), chh = Math.floor((top - pad * (rows + 1)) / rows);
      const s1 = Math.max(13, Math.round(u * 0.8)), s2 = Math.max(16, Math.round(u * 1.3));
      combos.forEach(([fg, bg, name], i) => {
        const x = pad + (i % cols) * (cw + pad), y = pad + Math.floor(i / cols) * (chh + pad);
        fill(ctx, bg, x, y, cw, chh);
        text(ctx, name + ' — The quick brown fox jumps over 0123456789 {}[]();', x + pad * 1.5, y + chh * 0.3, s2, fg, 'left');
        text(ctx, 'Small text: const value = items.filter(i => i.watched).length; // 1lI| 0O', x + pad * 1.5, y + chh * 0.72, s1, fg, 'left');
      });
      const boxes = [
        ['1-px red/blue columns', (px) => (px % 2 ? [0, 0, 255] : [255, 0, 0])],
        ['1-px green/magenta columns', (px) => (px % 2 ? [255, 0, 255] : [0, 255, 0])],
        ['1-px red/blue checkerboard', (px, py) => ((px + py) % 2 ? [0, 0, 255] : [255, 0, 0])],
        ['1-px white/black columns (reference)', (px) => (px % 2 ? [0, 0, 0] : [255, 255, 255])],
      ];
      const bw = Math.floor((w - pad * 5) / 4), by = top + 4 * u, bh = h - by - 2 * u;
      boxes.forEach(([name, fn], i) => {
        const x = pad + i * (bw + pad);
        text(ctx, name, x + bw / 2, top + 2 * u, 1.3 * u, gray(200));
        tileFill(ctx, x, by, bw, bh, 2, 2, fn);
      });
    },
  });

  P.push({
    id: 'sharpness', name: 'Sharpness & overscan', group: 'Detail',
    summary: 'Edge lines and fine detail. Checks for overscan, sharpening halos and pixel mapping.',
    look: [
      'Overscan: the outer white 1-px line must be visible on all four edges (red/green/blue lines sit 2, 4 and 6 px inside it).',
      'Sharpening: no bright or dark halos around the black and white squares or the thin lines on the grey field.',
      'Line groups should look like crisp lines, not blur or moiré (blur means scaling: check resolution and zoom).',
    ],
    tips: {
      lgc6: 'LG: Aspect Ratio → Original, Just Scan on (if offered), Sharpness 0 for PC input.',
      philips708: 'Philips: Picture format → Original/Unscaled for HDMI sources; Sharpness low.',
    },
    render(ctx, w, h) {
      const u = unit(w, h);
      fill(ctx, gray(0), 0, 0, w, h);
      const frame = (inset, color) => {
        fill(ctx, color, inset, inset, w - 2 * inset, 1);
        fill(ctx, color, inset, h - 1 - inset, w - 2 * inset, 1);
        fill(ctx, color, inset, inset, 1, h - 2 * inset);
        fill(ctx, color, w - 1 - inset, inset, 1, h - 2 * inset);
      };
      frame(0, gray(255)); frame(2, rgb(255, 0, 0)); frame(4, rgb(0, 255, 0)); frame(6, rgb(0, 0, 255));
      const gx = Math.round(w * 0.06), gy = Math.round(h * 0.08), gw = w - 2 * gx, gh = h - 2 * gy;
      fill(ctx, gray(128), gx, gy, gw, gh);
      const sq = Math.round(gh * 0.3);
      fill(ctx, gray(0), gx + 4 * u, gy + 4 * u, sq, sq);
      fill(ctx, gray(255), gx + 8 * u + sq, gy + 4 * u, sq, sq);
      // thin lines on grey
      const lx = gx + 12 * u + 2 * sq, lw = gw - (lx - gx) - 4 * u;
      for (let i = 0; i < 6; i++) {
        fill(ctx, gray(0), lx, gy + 5 * u + i * 2 * u, lw, 1);
        fill(ctx, gray(255), lx, gy + 6 * u + i * 2 * u, lw, 1);
      }
      // line groups: 1px, 2px, 3px on/off, horizontal & vertical
      const gy2 = gy + 8 * u + sq, groupH = gh - (gy2 - gy) - 6 * u;
      const groups = [1, 2, 3];
      const gwid = Math.floor((gw - 8 * u) / 6);
      groups.forEach((p, i) => {
        const xv = gx + 4 * u + i * gwid, xh = gx + 4 * u + (i + 3) * gwid;
        tileFill(ctx, xv, gy2, gwid - 2 * u, groupH, 2 * p, 1, (px) => (Math.floor(px / p) % 2 ? [0, 0, 0] : [255, 255, 255]));
        tileFill(ctx, xh, gy2, gwid - 2 * u, groupH, 1, 2 * p, (px, py) => (Math.floor(py / p) % 2 ? [0, 0, 0] : [255, 255, 255]));
        text(ctx, `${p}px vertical`, xv + (gwid - 2 * u) / 2, gy2 + groupH + 2 * u, 1.3 * u, gray(20));
        text(ctx, `${p}px horizontal`, xh + (gwid - 2 * u) / 2, gy2 + groupH + 2 * u, 1.3 * u, gray(20));
      });
    },
  });

  P.push({
    id: 'text', name: 'Text clarity (coding)', group: 'Detail', dom: true, exportable: false,
    summary: 'Real browser text in dark and light editor themes, rendered with your desktop scaling and font anti-aliasing.',
    look: [
      'Text should look sharp at your normal viewing distance, without coloured fringes that tire your eyes.',
      'Coloured fringes: switch sub-pixel anti-aliasing to greyscale (KDE: Text & Fonts → Sub-pixel rendering: None; Windows: ClearType Text Tuner).',
      'Everything soft: browser zoom must be 100%, the browser must run natively (not XWayland), and TV Sharpness/Super Resolution off.',
      'Compare dark and light themes: on OLED, dark themes also reduce burn-in risk and ABL dimming.',
    ],
    tips: {
      lgc6: 'C6 = RWBG subpixels: use greyscale AA with Slight hinting (lgtv-pc doctor checks it). At 150% KDE scaling, run browsers/VS Code with --ozone-platform-hint=auto so they render natively on Wayland.',
    },
    renderDom(el) {
      const block = (theme) => `
        <div class="tp-pane tp-${theme}">
          ${[12, 14, 16, 18].map((s) => `<div class="tp-size">${s}px</div><pre class="tp-code" style="font-size:${s}px">${codeHtml()}</pre>`).join('')}
          <p class="tp-prose">UI font 15px: The quick brown fox jumps over the lazy dog. Jellyfin continue watching, sorted by last played. 0123456789</p>
        </div>`;
      el.innerHTML = `<div class="tp-text">${block('dark')}${block('light')}</div>`;
    },
    thumb(ctx, w, h) {
      fill(ctx, '#1e1e1e', 0, 0, w / 2, h);
      fill(ctx, '#ffffff', w / 2, 0, w / 2, h);
      text(ctx, '{ code }', w / 4, h / 2, h * 0.14, '#9cdcfe', 'center', 'middle', MONO);
      text(ctx, '{ code }', (3 * w) / 4, h / 2, h * 0.14, '#0000ff', 'center', 'middle', MONO);
    },
  });

  P.push({
    id: 'colour', name: 'Colour bars & steps', group: 'Colour',
    summary: 'Full and 75% bars, colour steps and near-black colour. Shows oversaturation, colour clipping and gamut mode problems.',
    look: [
      'Bars: colours should look rich but not glowing. Neon reds and greens on normal content usually mean a wide/native gamut mode is stretching sRGB.',
      'Colour steps: all 10 steps of each colour should be distinct. If 80/90/100% merge, the Colour setting is too high or the gamut is clipping.',
      'Near-black colour: dark steps should keep their hue and not flicker, go grey or jump.',
    ],
    tips: {
      lgc6: 'LG: Color Gamut → Auto Detect (or the sRGB/BT.709 option) for SDR, not Native/Wide. Color 50 in Filmmaker/Expert.',
      philips708: 'Philips: turn off Colour enhancement; Colour gamut "Normal"/"Native off" for SDR (names vary).',
    },
    a: { label: 'View', options: ['Bars 100% / 75%', 'Colour steps 10–100%', 'Near-black colour 2–20%'], def: 0 },
    render(ctx, w, h, a) {
      const u = unit(w, h);
      fill(ctx, gray(0), 0, 0, w, h);
      if (a === 0) {
        const n = BAR_COLORS.length;
        [1, 0.75].forEach((lvl, row) => {
          const ya = row === 0 ? 0 : Math.round(h * 0.55), yb = row === 0 ? Math.round(h * 0.55) : h;
          BAR_COLORS.forEach(([name, r, g, b], i) => {
            const xa = Math.round((i * w) / n), xb = Math.round(((i + 1) * w) / n);
            fill(ctx, rgb(to8(r * lvl), to8(g * lvl), to8(b * lvl)), xa, ya, xb - xa, yb - ya);
            if (row === 1) text(ctx, name, (xa + xb) / 2, h - 2.5 * u, 1.4 * u, name === 'Black' || name === 'Blue' ? gray(160) : gray(20));
          });
          text(ctx, row === 0 ? '100%' : '75%', 1.5 * u, ya + 2.5 * u, 1.4 * u, gray(row === 0 ? 20 : 30), 'left');
        });
      } else {
        const steps = a === 1 ? range(10, 100, 10) : range(2, 20, 2);
        const rows = STEP_COLORS.length;
        const lab = 9 * u;
        STEP_COLORS.forEach(([name, r, g, b], ri) => {
          const ya = Math.round((ri * h) / rows), yb = Math.round(((ri + 1) * h) / rows);
          text(ctx, name, 1.5 * u, (ya + yb) / 2, 1.5 * u, gray(160), 'left');
          steps.forEach((p, ci) => {
            const xa = Math.round(lab + (ci * (w - lab)) / steps.length), xb = Math.round(lab + ((ci + 1) * (w - lab)) / steps.length);
            const f = p / 100;
            fill(ctx, rgb(to8(r * f), to8(g * f), to8(b * f)), xa + 2, ya + 2, xb - xa - 4, yb - ya - 4);
            if (ri === rows - 1 || a === 2) text(ctx, p + '%', (xa + xb) / 2, yb - 1.5 * u, 1.1 * u, a === 2 ? gray(90) : gray(ri === rows - 1 && p > 50 ? 40 : 200));
          });
        });
      }
    },
  });

  P.push({
    id: 'uniformity', name: 'Uniformity & full fields', group: 'Uniformity',
    summary: 'Full-screen greys and colours: banding, vertical lines, tint blotches and image retention.',
    look: [
      'Dark greys (2–10%): look for vertical bands, blotches or a darker/lighter edge. Some near-black unevenness is normal on OLED.',
      'Mid greys: look for faint retained images (taskbar, code editor layout) and coloured tints in corners.',
      'Colour fields: should be even, without a different hue at the edges.',
      'Full white dims after a few seconds on OLED (ABL/ASBL). That’s normal.',
    ],
    a: { label: 'Field', options: FIELDS.map((f) => f[0]), def: 2 },
    render(ctx, w, h, a) {
      const v = FIELDS[a][1];
      const c = Array.isArray(v) ? rgb(to8(v[0]), to8(v[1]), to8(v[2])) : gray(to8(v / 100));
      fill(ctx, c, 0, 0, w, h);
    },
  });

  P.push({
    id: 'motion', name: 'Motion & refresh rate', group: 'Motion', animated: true, exportable: false,
    summary: 'Measures the real refresh rate and shows a scrolling text strip and a frame-skip strip.',
    look: [
      'The measured Hz should match the display settings (e.g. 144 or 165). If it shows 60, check the cable, the port, the refresh rate in KDE and, on AMD, HDMI 2.1 FRL.',
      'Moving text: compare its readability with the static copy. OLED is sharp in motion but still sample-and-hold blurred.',
      'Frame-skip strip: film it with the Pixel in slow motion (240 fps). Each cell should light exactly once per lap.',
      'Stutter in a steady scroll usually means dropped frames from the browser or GPU, not the TV.',
    ],
    a: { label: 'Speed', options: MOTION_SPEEDS.map((s) => `${s} px/frame`), def: 1 },
    render(ctx, w, h, a, b, st) {
      const u = unit(w, h);
      const frame = st ? st.frame : 0;
      fill(ctx, gray(24), 0, 0, w, h);
      const hz = st && st.hz ? st.hz.toFixed(1) + ' Hz' : 'measuring…';
      text(ctx, 'Measured refresh: ' + hz, w / 2, 7 * u, 4 * u, gray(235));
      text(ctx, `frame ${frame}   ·   ${MOTION_SPEEDS[a]} px/frame`, w / 2, 12 * u, 1.8 * u, gray(150));
      const msg = 'The quick brown fox jumps over the lazy dog — const x = 0O1lI;';
      const fs = Math.round(3 * u);
      ctx.font = `${fs}px ${MONO}`;
      const tw = Math.ceil(ctx.measureText(msg).width) + 4 * u;
      const bh = 7 * u;
      fill(ctx, rgb(16, 32, 64), (w - tw) / 2, 20 * u, tw, bh);
      text(ctx, msg, w / 2, 20 * u + bh / 2, fs, gray(240), 'center', 'middle', MONO);
      const span = w + tw;
      const x = ((frame * MOTION_SPEEDS[a]) % span) - tw;
      fill(ctx, rgb(16, 32, 64), x, 32 * u, tw, bh);
      text(ctx, msg, x + tw / 2, 32 * u + bh / 2, fs, gray(240), 'center', 'middle', MONO);
      // moving vertical bar
      const barW = Math.round(2 * u);
      const bx = ((frame * MOTION_SPEEDS[a]) % (w + barW)) - barW;
      fill(ctx, gray(255), bx, 44 * u, barW, 12 * u);
      // frame-skip cells
      const N = 60, cy = 64 * u, ch = 8 * u, pad = 2 * u;
      const cw = (w - 2 * pad) / N;
      for (let i = 0; i < N; i++) {
        const lit = frame % N === i;
        fill(ctx, lit ? gray(255) : gray(50), pad + i * cw + 1, cy, cw - 2, ch);
      }
      text(ctx, 'Frame-skip strip: each cell lights once per lap (60 frames)', w / 2, cy + ch + 3 * u, 1.6 * u, gray(150));
    },
  });

  // defaults
  P.forEach((p) => {
    if (p.exportable === undefined) p.exportable = !p.dom && !p.animated;
    if (!p.look) p.look = [];
  });

  window.Patterns = P;
  window.PatternUtil = { unit, fill, text, gray };
})();
