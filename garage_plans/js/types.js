'use strict';
/* ============================================================
   Project type registry. Each type plugs its model, drawings,
   panel, checks text and build guide into the shared app.
   ============================================================ */
const TYPES = {
  shelf: {
    label: 'Shelf rack',
    build: buildShelfModel,
    rules: SHELF_RULES,
    renderViews: renderShelfViews,
    dragStart: shelfDragStart,
    manualAt: shelfManualAt,
    dimEdit: shelfDimEdit,
    selectionHtml: shelfSelectionHtml,
    panelHtml: shelfPanelHtml,
    panelChange: shelfPanelChange,
    panelAction: shelfPanelAction,
    keyTarget: shelfKeyTarget,
    basisHtml: shelfBasisHtml,
    guideHtml: shelfGuideHtml,
    viewTitles: {
      front: 'Front view <span class="muted">(looking at the wall; drag legs, crossbeams and shelves)</span>',
      side: 'Side section <span class="muted">(drag shelves up/down)</span>',
      plan: 'Plan of selected shelf <span class="muted">(from above, wall at the top)</span>',
    },
  },
  bench: {
    label: 'Workbench',
    build: buildBenchModel,
    rules: BENCH_RULES,
    renderViews: renderBenchViews,
    dragStart: benchDragStart,
    manualAt: benchManualAt,
    dimEdit: benchDimEdit,
    selectionHtml: benchSelectionHtml,
    panelHtml: benchPanelHtml,
    panelChange: benchPanelChange,
    panelAction: benchPanelAction,
    keyTarget: benchKeyTarget,
    basisHtml: benchBasisHtml,
    guideHtml: benchGuideHtml,
    viewTitles: {
      front: 'Front view <span class="muted">(drag divider legs and shelves; click blue numbers to type)</span>',
      side: 'Left end <span class="muted">(drag shelves up/down)</span>',
      plan: 'From above <span class="muted">(choose a level →)</span> <span id="plan-extra"></span>',
    },
  },
};

Object.assign(RULE_COLOR, {
  railLeg: '#e65100', railCorner: '#8d6e63', joistScrew: '#00897b', joistHanger: '#455a64', stripRail: '#6d4c41',
  topScrews: '#1e63b5', shelfScrews: '#3949ab', panelScrews: '#c2185b', foot: '#37474f',
});
