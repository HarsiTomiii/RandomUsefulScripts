'use strict';
/* ============================================================
   WORKBENCH: side panel, selection, actions, build guide
   ============================================================ */

function bayName(F, key) {
  const i = F.bays.findIndex(b => b.key === key);
  if (F.bays.length === 1) return 'Full width';
  return `Bay ${i + 1}${i === 0 ? ' (left)' : i === F.bays.length - 1 ? ' (right)' : ''}`;
}
function sheetOpts(cur) { return S.library.sheets.map(s => opt(s.id, s.name, cur)).join(''); }

function benchLevelEditor(lv, F) {
  const keys = levelBays(lv, F);
  return `<div class="grid2">
      <label>Top of shelf (mm)<input type="number" data-blv="${lv.id}:z" value="${lv.z}"></label>
      <label>Load (kg, spread)<input type="number" data-blv="${lv.id}:load" value="${lv.load}"></label></div>
    <label class="chk"><input type="checkbox" data-blv="${lv.id}:rails" ${lv.rails ? 'checked' : ''}> Front/back rails (stronger; needed for long bays)</label>
    ${F.bays.length > 1 ? `<div class="row">In: ${F.bays.map(b => `<label class="chk"><input type="checkbox" data-blvbay="${lv.id}:${b.key}" ${keys.includes(b.key) ? 'checked' : ''}> ${bayName(F, b.key)}</label>`).join('')}</div>` : ''}`;
}

function benchPanelHtml() {
  const d = S.design, m = S.model, F = m.F;
  const so = secOpen;
  const footCur = (d.rules.foot.items.find(it => { const f = fastener(it.type); return f && (f.kind === 'caster' || f.kind === 'foot'); }) || {}).type || '';
  const footItems = S.library.fasteners.filter(f => f.kind === 'caster' || f.kind === 'foot');
  let h = '';
  h += `<details ${so('bsize')} data-sec="bsize"><summary>Size &amp; materials</summary><div class="grid2">
    <label>Top length<input type="number" data-bset="L" value="${d.L}"></label>
    <label>Top depth<input type="number" data-path="Dp" value="${d.Dp}"></label>
    <label>Work height (top surface)<input type="number" data-path="H" value="${d.H}"></label>
    <label>Feet<select data-bset="foot">${opt('', 'None (stands on legs)', footCur)}${footItems.map(f => opt(f.id, f.name, footCur)).join('')}</select></label>
    <label>Top overhang at ends<input type="number" data-path="ohX" value="${d.ohX}"></label>
    <label>Top overhang front/back<input type="number" data-path="ohY" value="${d.ohY}"></label>
    <label>Legs<select data-path="roles.post">${profOpts(d.roles.post)}</select></label>
    <label>Leg orientation<select data-path="legOrient">${opt('wideX', 'Wide face to the front', d.legOrient)}${opt('wideY', 'Wide face to the side', d.legOrient)}</select></label>
    <label>Top frame rails<select data-path="roles.rail">${profOpts(d.roles.rail)}</select></label>
    <label>Top joists<select data-path="roles.joist">${profOpts(d.roles.joist)}</select></label>
    <label>Joist ends<select data-path="joistSupport">${opt('hanger', 'Joist hangers', d.joistSupport)}${opt('strip', 'Rest on a support strip', d.joistSupport)}${opt('screw', 'Screwed through rail', d.joistSupport)}</select></label>
    ${d.joistSupport === 'strip' ? `<label>Support strip<select data-path="roles.strip">${profOpts(d.roles.strip)}</select></label>` : ''}
    <label>Max joist spacing, top<input type="number" data-path="joistMax" value="${d.joistMax}"></label>
    <label>Shelf rails &amp; joists<select data-path="roles.srail">${profOpts(d.roles.srail)}</select></label>
    <label>Max joist spacing, shelves<input type="number" data-path="shelfJoistMax" value="${d.shelfJoistMax}"></label>
    <label>Shelf boards<select data-path="shelfSheetId">${sheetOpts(d.shelfSheetId)}</select></label>
    ${d.panels.back || d.panels.left || d.panels.right ? `<label>Panels<select data-path="panelSheetId">${sheetOpts(d.panelSheetId)}</select></label>` : ''}
    ${commonMatHtml(d)}
  </div>
  <div class="subh">Top layers (bottom → top)</div>
  ${d.topLayers.map((id, i) => `<div class="row"><span>${i + 1}.</span><select data-bset="layer:${i}">${sheetOpts(id)}</select>${d.topLayers.length > 1 ? `<button class="btn icon" data-act="dellayer" data-i="${i}">✕</button>` : ''}</div>`).join('')}
  <div class="row"><button class="btn small" data-act="addlayer">+ layer</button>
  ${d.topLayers.length > 1 ? `<label class="chk"><input type="checkbox" data-path="topGlued" ${d.topGlued ? 'checked' : ''}> glued together (much stiffer)</label>` : ''}</div>
  <p class="hint">Frame ${fmtMM(F.Lf)} × ${fmtMM(F.Df)} mm. Rails are screwed to the outside faces of the posts, flush with the post tops. The top sits on the posts, rails and joists. Shelf boards sit <i>between</i> the posts, so no notching.</p></details>`;

  h += `<details ${so('bloads')} data-sec="bloads"><summary>Design loads</summary><div class="grid2">
    <label>Spread load on top (kg)<input type="number" data-path="loads.top" value="${d.loads.top}"></label>
    <label>Point load on top (kN)<input type="number" step="0.1" data-path="loads.point" value="${d.loads.point}"></label>
    <label>Sideways push at top (N)<input type="number" step="10" data-path="loads.lateral" value="${d.loads.lateral}"></label></div>
    <p class="hint">Point load: someone kneeling on the bench, or a heavy item put down (1 kN ≈ 100 kg). Sideways push: planing, sawing, or pushing the bench on its wheels (400 N ≈ a firm shove). Shelf loads are set per shelf below.</p></details>`;

  const pairs = F.pairs;
  h += `<details ${so('bpairs')} data-sec="bpairs"><summary>Leg pairs &amp; bays (${pairs.length} pairs, ${F.bays.length} bay${F.bays.length > 1 ? 's' : ''})</summary>
    <table class="tbl"><tr><th>Pair</th><th>Centre x</th><th>Gap (c/c)</th><th></th></tr>
    ${pairs.map((p, i) => `<tr class="${isSel('pair', p.id) ? 'selrow' : ''}"><td>${p.end ? (i ? 'Right end' : 'Left end') : 'Divider ' + i}</td>
      <td>${p.end ? fmtMM(p.x) : `<input type="number" data-bpair="${p.id}" value="${p.x}">`}</td><td>${i ? fmtMM(p.x - pairs[i - 1].x) : '–'}</td>
      <td>${p.end ? '' : `<button class="btn icon" data-act="delpair" data-id="${p.id}">✕</button>`}</td></tr>`).join('')}</table>
    <div class="btnrow"><label class="inline">Dividers <input type="number" id="pairN" class="cnt" min="0" value="${d.pairs.length}" style="width:56px"></label>
      <button class="btn" data-act="pairdist">Spread evenly</button><button class="btn" data-act="addpair">+ in widest bay</button></div>
    <p class="hint">A divider is an extra front + back leg. It splits the bench into bays. Each shelf can be in any bay, so you can make a compartment with its own shelves. It also stiffens long benches.</p></details>`;

  const lvs = levelsSorted();
  h += `<details ${so('blevels')} data-sec="blevels"><summary>Shelves (${lvs.length})</summary>
    ${lvs.map(lv => `<div class="lvcard ${benchSelLevel() === lv.id ? 'sel' : ''}"><div class="row"><a href="#" data-act="sellevel" data-id="${lv.id}"><b>${esc(levelLabel(lv.id))}</b></a><span class="hint">${(m.lvGeo[lv.id] && m.lvGeo[lv.id].keys.map(k => bayName(F, k)).join(', ')) || 'no bay'}</span><button class="btn icon" style="margin-left:auto" data-act="dellevel" data-id="${lv.id}">✕</button></div>
      ${benchLevelEditor(lv, F)}</div>`).join('')}
    <div class="btnrow"><button class="btn" data-act="addlevel">+ shelf</button></div>
    <p class="hint">Height = top of the shelf board. Load = what you will store on it, spread out. Without rails the board rests only on the cross rails at the bay ends, which is fine for short bays.</p></details>`;

  h += `<details ${so('bpanels')} data-sec="bpanels"><summary>Panels (bracing)</summary>
    <label class="chk"><input type="checkbox" data-path="panels.back" ${d.panels.back ? 'checked' : ''}> Back panel</label>
    <label class="chk"><input type="checkbox" data-path="panels.left" ${d.panels.left ? 'checked' : ''}> Left end panel</label>
    <label class="chk"><input type="checkbox" data-path="panels.right" ${d.panels.right ? 'checked' : ''}> Right end panel</label>
    <p class="hint">A sheet screwed across the back (or both ends) stops the bench racking, the easiest way to make it rock-solid. Check the racking results under Checks first: you may not need them.</p></details>`;
  return h;
}

function benchSelectionHtml() {
  const sel = S.ui.sel, d = S.design, F = S.model.F;
  if (!sel) return `<p class="hint">Click a part to select it. Drag the divider legs sideways and the shelves up/down. <b class="link">Blue numbers</b> are dimensions you can click and type into. Ctrl+Z undoes.</p>`;
  if (sel.kind === 'pair') {
    const p = d.pairs.find(x => x.id === sel.id); if (!p) return '';
    return `<div class="selhead">Divider leg pair</div><div class="grid2"><label>Centre x (mm)<input type="number" data-bpair="${p.id}" value="${p.x}"></label></div>
      <div class="btnrow"><button class="btn danger" data-act="delpair" data-id="${p.id}">Delete</button></div><p class="hint">Arrow keys nudge (Shift = 50 mm).</p>`;
  }
  if (sel.kind === 'level') {
    const lv = d.levels.find(x => x.id === sel.id); if (!lv) return '';
    return `<div class="selhead">${esc(levelLabel(lv.id))}</div>${benchLevelEditor(lv, F)}
      <div class="btnrow"><button class="btn danger" data-act="dellevel" data-id="${lv.id}">Delete shelf</button></div>`;
  }
  if (sel.kind === 'joint') return jointSelHtml(sel);
  return '';
}

function benchPanelChange(el) {
  const d = S.design;
  const ds = el.dataset;
  if (ds.bset) {
    snapshot();
    if (ds.bset === 'L') setBenchLength(Math.max(500, num(el)));
    else if (ds.bset === 'foot') {
      const keep = d.rules.foot.items.filter(it => { const f = fastener(it.type); return f && f.kind !== 'caster' && f.kind !== 'foot'; });
      if (!el.value) d.rules.foot.items = [];
      else {
        const f = fastener(el.value);
        d.rules.foot.items = [{ type: el.value, n: 1 }, ...(keep.length ? keep : f.kind === 'caster' && fastener('f6x40') ? [{ type: 'f6x40', n: 4 }] : [])];
      }
    } else if (ds.bset.startsWith('layer:')) d.topLayers[+ds.bset.split(':')[1]] = el.value;
    return true;
  }
  if (ds.bpair) { snapshot(); d.pairs.find(p => p.id === ds.bpair).x = num(el); return true; }
  if (ds.blv) {
    snapshot();
    const [id, f] = ds.blv.split(':');
    const lv = d.levels.find(l => l.id === id);
    lv[f] = el.type === 'checkbox' ? el.checked : num(el);
    return true;
  }
  if (ds.blvbay) {
    snapshot();
    const [id, key] = ds.blvbay.split(':');
    const lv = d.levels.find(l => l.id === id);
    const F = benchFrame(d);
    let keys = levelBays(lv, F);
    keys = el.checked ? [...new Set([...keys, key])] : keys.filter(k => k !== key);
    lv.bays = keys.length === F.bays.length ? 'all' : keys;
    return true;
  }
  return false;
}

function benchPanelAction(a, b) {
  const d = S.design, m = S.model, F = m.F;
  switch (a) {
    case 'addpair': {
      snapshot();
      const bay = [...F.bays].sort((x, y) => (y.x1 - y.x0) - (x.x1 - x.x0))[0];
      const p = { id: uid('lp'), x: Math.round((bay.a.x + bay.b.x) / 2) };
      d.pairs.push(p); S.ui.sel = { kind: 'pair', id: p.id };
      break;
    }
    case 'delpair': {
      snapshot();
      const i = F.pairs.findIndex(p => p.id === b.dataset.id);
      const leftKey = F.pairs[i - 1].id;
      for (const lv of d.levels) if (Array.isArray(lv.bays) && lv.bays.includes(b.dataset.id)) {
        lv.bays = [...new Set(lv.bays.filter(k => k !== b.dataset.id).concat(leftKey))];
      }
      d.pairs = d.pairs.filter(p => p.id !== b.dataset.id);
      S.ui.sel = null; break;
    }
    case 'pairdist': {
      const n = Math.max(0, parseInt($('#pairN').value) || 0);
      snapshot();
      const old = [...d.pairs].sort((x, y) => x.x - y.x);
      const a0 = F.pairs[0].x, a1 = F.pairs[F.pairs.length - 1].x;
      d.pairs = Array.from({ length: n }, (_, k) => ({ id: old[k] ? old[k].id : uid('lp'), x: Math.round(a0 + (a1 - a0) * (k + 1) / (n + 1)) }));
      S.ui.sel = null; break;
    }
    case 'sellevel': S.ui.sel = { kind: 'level', id: b.dataset.id }; S.ui.selLevel = b.dataset.id; S.ui.planLevel = b.dataset.id; break;
    case 'addlevel': {
      snapshot();
      const lo = F.z0 + F.shS.t + F.pS.h + 30, hiCeil = F.zF - F.pR.h;
      const zs = [...d.levels].map(l => l.z).sort((x, y) => x - y);
      const pts = [lo, ...zs, hiCeil];
      let best = 0, bz = (lo + hiCeil) / 2;
      for (let i = 0; i < pts.length - 1; i++) if (pts[i + 1] - pts[i] > best) { best = pts[i + 1] - pts[i]; bz = (pts[i] + pts[i + 1]) / 2 + (i === 0 ? 0 : (F.shS.t + F.pS.h) / 2); }
      const lv = { id: uid('lv'), z: Math.round(bz / 5) * 5, load: 50, bays: 'all', rails: true };
      d.levels.push(lv); S.ui.sel = { kind: 'level', id: lv.id }; S.ui.selLevel = lv.id; S.ui.planLevel = lv.id;
      break;
    }
    case 'dellevel': snapshot(); d.levels = d.levels.filter(l => l.id !== b.dataset.id); S.ui.sel = null; break;
    case 'addlayer': snapshot(); d.topLayers.push(d.topLayers[d.topLayers.length - 1]); break;
    case 'dellayer': snapshot(); d.topLayers.splice(+b.dataset.i, 1); break;
    default: return false;
  }
  return true;
}

function benchKeyTarget(sel) {
  const d = S.design;
  if (sel.kind === 'pair') { const obj = d.pairs.find(p => p.id === sel.id); return { obj, axis: 'x', del: () => { d.pairs = d.pairs.filter(p => p !== obj); } }; }
  if (sel.kind === 'level') { const obj = d.levels.find(l => l.id === sel.id); return { obj, axis: 'z', del: () => { d.levels = d.levels.filter(l => l !== obj); } }; }
  return null;
}

function benchBasisHtml(b) {
  const d = S.design;
  return `
    <li>Simplified Eurocode 5 method. Ultimate loads = 1.35 × self-weight + 1.5 × loads. Spread loads count as long-term; the point load and the sideways push count as short-term. Timber ${b.grade}.</li>
    <li>The top is checked between its supports (rails, cross rails, joists) for the spread load (with creep) and the ${d.loads.point} kN point load at mid-span, spread over a strip of board. The overhang is checked with the point load at the edge. ${d.topLayers.length > 1 ? (d.topGlued ? 'Glued layers act as one thick board.' : 'Screwed (not glued) layers share the load but act as separate boards.') : ''}</li>
    <li>Joists, rails and cross rails are simple spans. Each takes the point load at mid-span as well as its share of the spread load.</li>
    <li>Joist ends screwed through the rail into end grain get ⅓ of the screw capacity (Eurocode 5). Hangers use the capacity from the catalog.</li>
    <li><b>Racking</b>: the sideways push (×1.5) is shared by all legs. Each leg is held by its screwed rail joints. Below the lowest rail it acts as a post standing on the floor; between rails it is fixed at both ends. The screws in each joint resist the resulting moment (as a screw group) plus the weight. A back panel or end panels take the push instead, through their screws.</li>
    <li>Casters: the total weight is shared by all but one caster (uneven floor), and compared with the rated load.</li>
    <li>Tipping is shown for information only. Brakes stop rolling, not tipping.</li>`;
}

function benchGuideHtml() {
  const m = S.model, d = S.design, F = m.F;
  const { pP, pR, pJ, pS, pT, dx, Lf, Df, zF, z0, pairs, bays, foot, layers } = F;
  const fn = (rule) => d.rules[rule].items.filter(i => i.n).map(i => `${i.n}× ${(fastener(i.type) || { name: '?' }).name}`).join(' + ') || 'none';
  const postLen = zF - z0;
  const fromBottom = (z) => fmtMM(z - z0);
  const levels = [...m.levels].sort((a, b) => b.z - a.z).filter(lv => m.lvGeo[lv.id] && m.lvGeo[lv.id].keys.length);
  const markOf = (role) => [...new Set(m.members.filter(x => x.role === role).map(x => x.mark))].join(', ');
  let n = 0;
  const step = (title, body) => `<li><b>${title}</b> ${body}</li>`;
  let h = `<div class="doc guide"><div class="headrow"><h2>Build guide: ${esc(d.name)}</h2><button class="btn" onclick="window.print()">🖨 Print</button></div>
  <p class="hint">Top ${fmtMM(d.L)} × ${fmtMM(d.Dp)} mm, work height ${fmtMM(d.H)} mm${foot.f ? ` on ${esc(foot.f.name)} (${foot.h} mm)` : ''}. Frame ${fmtMM(Lf)} × ${fmtMM(Df)} mm. x is measured from the left end of the frame; heights on the legs are measured from the <b>bottom end of the leg</b>.</p>
  <h3>Tools</h3><p>Circular or mitre saw, drill/driver, 3 mm drill for pilot holes, square, tape measure, clamps, spirit level${d.joistSupport === 'hanger' ? ', hammer (for hanger nails) or impact driver' : ''}.</p>
  <ol>`;
  h += step('Buy and cut.', `Cut all parts from the Cut plan tab and write the mark on each piece (${m.parts.map(p => p.mark).join(', ')}, boards ${m.sheetParts.map(p => p.mark).join(', ')}). All joints are plain butt joints, so cut square.`);
  h += step('Mark the legs.', `All ${pairs.length * 2} legs (${markOf('post')}, ${pP.name}) are ${fmtMM(postLen)} mm long. On each leg, from the bottom end, mark the <b>top</b> of each rail:
    <ul><li>Top frame rails: flush with the leg top (${fmtMM(postLen)}).</li>
    ${levels.map(lv => `<li>${esc(m.lvGeo[lv.id].label)}: rail top at ${fromBottom(m.lvGeo[lv.id].zR)} (${lv.rails ? 'front/back rails + cross rails' : 'cross rails only'}, in ${m.lvGeo[lv.id].keys.map(k => bayName(F, k)).join(', ')})</li>`).join('')}</ul>
    Tip: clamp all legs side by side and mark them in one go.`);
  h += step('Build the leg frames flat on the floor.', `For each leg pair, lay the back and front leg down ${fmtMM(Df - 2 * pR.t)} mm apart (outside to outside), then screw on:
    <ul><li><b>End pairs</b> (x = ${fmtMM(pairs[0].x)} and ${fmtMM(pairs[pairs.length - 1].x)}): the top end rail (${markOf('endrail')}) on the <i>outside</i> face, flush with the leg tops.</li>
    ${pairs.length > 2 ? `<li><b>Dividers</b> (x = ${pairs.filter(p => !p.end).map(p => fmtMM(p.x)).join(', ')}): the top cross rail (${markOf('topcross')}) on the <i>left</i> face, flush with the leg tops.</li>` : ''}
    ${levels.length ? `<li>The shelf cross rails (${markOf('scross')}) on the face that points <i>into</i> each bay that has that shelf (inside faces, so the boards can sit on them).</li>` : ''}</ul>
    Each rail end: ${fn('railLeg')} through the rail into the leg, spread in a square pattern (not in one line). Pre-drill near the rail ends. Measure the diagonals: they must be equal.`);
  h += step('Join the frames.', `Stand the frames up (a helper or clamps help) and screw on the long rails <i>on the outside</i> of the legs: the top front and back rails (${markOf('rail')}), flush with the leg tops and the outside of the end rails${levels.some(l => l.rails) ? `, and the shelf rails (${markOf('srail')}) at their marks` : ''}. Same ${fn('railLeg')} per leg. Corners: ${fn('railCorner')} through the long rail into the end rail. Before the last screws, check that the top frame is square (equal diagonals) and doesn't rock.`);
  if (m.joistsTop.length) {
    const how = d.joistSupport === 'hanger' ? `Fix a joist hanger to the rail at each mark (top of joist flush with the top of the rail; ${fn('joistHanger')} per hanger), then drop the joists in and fix them to the hangers.`
      : d.joistSupport === 'strip' ? `First screw the support strips (${markOf('strip')}, ${pT.name}) to the inside of the front and back rails, with their top ${fmtMM(pJ.h)} mm below the rail top (${fn('stripRail')} every ${d.rules.stripRail.spacing} mm). Lay the joists on the strips and fix each end with ${fn('joistScrew')}.`
        : `Screw through the rail into each joist end: ${fn('joistScrew')}. Pre-drill 3 mm; end grain splits easily.`;
    h += step('Top joists', `(${markOf('joist')}, ${pJ.name}, on edge) at x = ${m.joistsTop.map(j => fmtMM(j.x)).join(', ')} (centre). ${how}`);
  }
  const sj = levels.flatMap(lv => m.lvGeo[lv.id].bays.flatMap(bg => bg.joists.map(x => `${m.lvGeo[lv.id].label}: ${fmtMM(x)}`)));
  if (sj.length) h += step('Shelf joists', `at ${sj.join('; ')}, fixed the same way.`);
  if (foot.f) h += step('Casters / feet.', `Lay the frame upside down (on a blanket) and fit ${fn('foot')} under each leg${F.needPad ? `, on a 120×120 pad of ${esc(F.shS.name)} glued and screwed to the leg end` : ''}. Put the braked casters on two diagonally opposite corners at least, then turn the frame back over.`);
  else h += step('Feet.', 'Put a plastic or rubber pad under each leg so the wood doesn\'t take up water from the concrete.');
  if (levels.length) h += step('Shelf boards.', `Drop the boards in between the legs; they rest on the cross rails${levels.some(l => l.rails) ? ' and the front/back rails' : ''}. Screw down: ${fn('shelfScrews')} every ${d.rules.shelfScrews.spacing} mm along every support.`);
  if (d.panels.back || d.panels.left || d.panels.right) h += step('Panels.', `Screw the panel(s) to the rails/legs with ${fn('panelScrews')} every ${d.rules.panelScrews.spacing} mm along all edges that touch timber. Check the frame is square first: the panel locks it in that shape.`);
  h += step('Top.', `Lay the first layer (${esc(layers[0].name)}) with ${d.ohX} mm overhang at the ends and ${d.ohY} mm at front and back. Screw it down: ${fn('topScrews')} every ${d.rules.topScrews.spacing} mm along every rail and joist. Countersink the heads.${layers.length > 1 ? ` Then the next layer${layers.length > 2 ? 's' : ''} (${layers.slice(1).map(l => esc(l.name)).join(', ')})${d.topGlued ? ', glued (wood glue or construction adhesive spread all over, then screwed)' : ', screwed'}, with its screw rows offset from the layer below.` : ''}`);
  h += `</ol><h3>Using it</h3><ul>
    <li>Design loads: ${d.loads.top} kg spread on top, ${d.loads.point} kN (≈${Math.round(d.loads.point * 102)} kg) point load, ${levels.map(lv => `${esc(m.lvGeo[lv.id].label)} ${lv.load} kg`).join(', ') || 'no shelves'}.</li>
    <li>Bench weight ≈ ${m.mass.empty.toFixed(0)} kg empty. Heavy items on the bottom shelf make it far more stable.</li>
    ${d.manual.length ? `<li>Extra fasteners by hand: ${d.manual.map(mf => `x ${fmtMM(mf.x)}, y ${fmtMM(mf.y)}, z ${fmtMM(mf.z)}: ${mf.items.map(i => `${i.n}× ${(fastener(i.type) || { name: '?' }).name}`).join(', ')}${mf.note ? ' (' + esc(mf.note) + ')' : ''}`).join('; ')}</li>` : ''}
  </ul></div>`;
  return h;
}
