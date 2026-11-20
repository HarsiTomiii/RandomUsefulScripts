'use strict';
/* ============================================================
   Cut optimisation
   - Timber: 1D bin packing over several stock lengths, minimising cost.
     Each bar: one end trim (squaring the factory end) + kerf per cut.
   - Sheets: guillotine strip packing (rip strips along the sheet length,
     then cross-cut). Pieces are not rotated, so the sheet's strong
     direction stays along the wall, across the crossbeams.
   ============================================================ */

function packBars(pieces, stock, kerf, trim, strategy) {
  const sorted = [...pieces].sort((a, b) => b.len - a.len);
  const stocks = [...stock].sort((a, b) => a.len - b.len);
  const bars = [];
  const fitsIn = (bar, p) => !bar.exact && bar.used + (bar.pieces.length ? kerf : 0) + p.len <= bar.len;
  for (const p of sorted) {
    let best = null, bestRem = Infinity;
    for (const b of bars) {
      if (fitsIn(b, p)) {
        const rem = b.len - (b.used + kerf + p.len);
        if (rem < bestRem) { bestRem = rem; best = b; }
      }
    }
    if (!best) {
      const need = trim + p.len;
      let s;
      if (strategy === 'largest') s = stocks[stocks.length - 1];
      else if (strategy === 'smallest') s = stocks.find(x => x.len >= need);
      else s = stocks.find(x => x.len === strategy);
      if (!s || s.len < need) s = stocks.find(x => x.len >= need);
      const exactStock = stocks.find(x => x.len >= p.len && x.len < need);
      if (exactStock && (!s || strategy === 'smallest' || strategy === exactStock.len)) s = null;
      if (!s) {
        // a part exactly as long as a stock board: use the board uncut
        s = stocks.find(x => x.len >= p.len);
        if (!s) return null;            // piece longer than any stock
        bars.push({ len: s.len, price: s.price, used: s.len, pieces: [p], exact: true });
        continue;
      }
      best = { len: s.len, price: s.price, used: trim, pieces: [] };
      bars.push(best);
    }
    best.used += (best.pieces.length ? kerf : 0) + p.len;
    best.pieces.push(p);
  }
  // downsize every bar to the cheapest stock that still holds it
  for (const b of bars) {
    const cands = stocks.filter(s => s.len >= b.used || (b.exact && s.len >= b.pieces[0].len)).sort((x, y) => x.price - y.price || x.len - y.len);
    if (cands.length) { b.len = cands[0].len; b.price = cands[0].price; }
    if (b.exact) b.used = b.len;
  }
  return bars;
}

function optimiseProfile(pieces, prof, kerf, trim) {
  if (!pieces.length) return { bars: [], cost: 0 };
  const strategies = ['smallest', 'largest', ...prof.stock.map(s => s.len)];
  let best = null;
  for (const st of strategies) {
    const bars = packBars(pieces, prof.stock, kerf, trim, st);
    if (!bars) continue;
    const cost = bars.reduce((a, b) => a + (+b.price || 0), 0);
    const waste = bars.reduce((a, b) => a + b.len - b.used, 0);
    if (!best || cost < best.cost - 0.001 || (Math.abs(cost - best.cost) < 0.001 && waste < best.waste))
      best = { bars, cost, waste };
  }
  if (!best) return { bars: [], cost: 0, error: `A piece is longer than every stock length of ${prof.name}.` };
  // stable ordering: longest bars first, bars sorted internally longest piece first
  best.bars.sort((a, b) => b.len - a.len || b.used - a.used);
  return best;
}

function packSheets(pieces, sheet, kerf) {
  // pieces: {w (along sheet length), dpt (across), mark}
  const sorted = [...pieces].sort((a, b) => b.dpt - a.dpt || b.w - a.w);
  const sheets = [];
  const errors = [];
  for (const p of sorted) {
    if (p.w > sheet.len || p.dpt > sheet.wid) { errors.push(`Piece ${p.mark} ${fmtMM(p.w)}×${fmtMM(p.dpt)} does not fit on a ${fmtMM(sheet.len)}×${fmtMM(sheet.wid)} sheet.`); continue; }
    let placed = false;
    for (const sh of sheets) {
      for (const st of sh.strips) {
        if (st.h >= p.dpt && st.used + (st.items.length ? kerf : 0) + p.w <= sheet.len) {
          const x = st.used + (st.items.length ? kerf : 0);
          st.items.push({ ...p, x, y: st.y });
          st.used = x + p.w; placed = true; break;
        }
      }
      if (placed) break;
      const y = sh.usedH + (sh.strips.length ? kerf : 0);
      if (y + p.dpt <= sheet.wid) {
        const st = { y, h: p.dpt, used: p.w, items: [{ ...p, x: 0, y }] };
        sh.strips.push(st); sh.usedH = y + p.dpt; placed = true; break;
      }
    }
    if (!placed) {
      sheets.push({ strips: [{ y: 0, h: p.dpt, used: p.w, items: [{ ...p, x: 0, y: 0 }] }], usedH: p.dpt });
    }
  }
  return { sheets, errors, cost: sheets.length * (+sheet.price || 0) };
}

function computeCutPlan(model) {
  const d = S.design;
  const { kerf, trim } = d.cut;
  const byProf = new Map();
  for (const mem of model.members) {
    if (!byProf.has(mem.prof.id)) byProf.set(mem.prof.id, { prof: mem.prof, pieces: [] });
    byProf.get(mem.prof.id).pieces.push({ len: mem.len, mark: mem.mark, role: mem.role, id: mem.id });
  }
  const timber = [];
  for (const { prof, pieces } of byProf.values()) {
    const r = optimiseProfile(pieces, prof, kerf, trim);
    timber.push({ prof, ...r, pieces });
  }
  const bySheet = new Map();
  for (const s of model.sheets) {
    if (!bySheet.has(s.sheetId)) bySheet.set(s.sheetId, []);
    bySheet.get(s.sheetId).push({ w: Math.round(s.w), dpt: Math.round(s.dpt), mark: s.mark, id: s.id, role: s.role });
  }
  const sheets = [];
  for (const [id, pieces] of bySheet) {
    const def = sheetDef(id);
    sheets.push({ def, ...packSheets(pieces, def, kerf) });
  }
  const nSheets = sheets.reduce((a, s) => a + s.sheets.length, 0);
  return { timber, sheets, nSheets };
}

/* ---------------- full cost ---------------- */
function computeCost(model, cut) {
  const lines = [];
  for (const t of cut.timber) {
    const byLen = new Map();
    t.bars.forEach(b => {
      const k = b.len;
      if (!byLen.has(k)) byLen.set(k, { len: b.len, price: +b.price || 0, qty: 0 });
      byLen.get(k).qty++;
    });
    for (const v of [...byLen.values()].sort((a, b) => b.len - a.len))
      lines.push({ group: 'Timber', name: `${t.prof.name} ${fmtMM(v.len)} mm`, qty: v.qty, unit: v.price, total: v.qty * v.price });
  }
  for (const sp of cut.sheets) if (sp.sheets.length)
    lines.push({ group: 'Sheets', name: `${sp.def.name} ${fmtMM(sp.def.len)}×${fmtMM(sp.def.wid)}`, qty: sp.sheets.length, unit: +sp.def.price || 0, total: sp.cost });

  const fcount = new Map();
  for (const j of model.joints) for (const it of j.items) {
    if (!it.n) continue;
    fcount.set(it.type, (fcount.get(it.type) || 0) + it.n);
  }
  const fast = [];
  for (const [type, n] of fcount) {
    const f = fastener(type);
    if (!f) continue;
    const boxes = Math.ceil(n / Math.max(1, f.perBox));
    const total = boxes * (+f.boxPrice || 0);
    fast.push({ f, n, boxes, total, usedValue: n / Math.max(1, f.perBox) * (+f.boxPrice || 0) });
    const grp = (f.kind === 'caster' || f.kind === 'foot' || f.kind === 'hardware') ? 'Hardware' : 'Fasteners';
    const nm = f.perBox > 1 ? `${f.name} (pack of ${f.perBox}), ${n} needed` : f.name;
    lines.push({ group: grp, name: nm, qty: boxes, unit: +f.boxPrice || 0, total });
  }
  for (const e of S.design.extras)
    lines.push({ group: 'Other', name: e.name || '(unnamed)', qty: +e.qty || 0, unit: +e.price || 0, total: (+e.qty || 0) * (+e.price || 0), extraId: e.id });

  const total = lines.reduce((a, l) => a + l.total, 0);
  const usedFastValue = fast.reduce((a, f) => a + f.usedValue, 0);
  const fastBuy = fast.reduce((a, f) => a + f.total, 0);
  return { lines, total, fast, usedFastValue, fastBuy };
}
