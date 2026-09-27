import { $, DOT, clamp, isBr, isBlank, bitsOf, brChar, hex, line } from '../core/util.js';
import { doc, shown } from '../core/doc.js';
import { showTip, hideTip } from '../ui/tooltips.js';
import { cv, cw, ch } from '../render/canvas.js';
import { setCell, endStroke, stroke, setStroke } from '../history.js';
import { clearSel, sd, selDown, selMove, selUp, cancelDrag, inSel } from './select.js';
import { layFrame, setLayFrame, updateLayBox, pickLayerAt, renderLayers } from '../layers.js';
import { block, clearPreview, drawPreview, placeText } from './text.js';
import { curChar, setCurChar } from '../ui/palette.js';
import { curColor, setCurColor } from '../ui/color.js';
import { fullRedraw } from '../render/canvas.js';

export let tool = 'dots', prevTool = 'dots', size = 1, dotMode = 'paint', eraseMode = 'dots';
export let hoverCell = null;
/* The bar controls (view) and the resize grip write these. */
export const setSize = v => { size = v; };
export const setDotMode = v => { dotMode = v; };
export const setEraseMode = v => { eraseMode = v; };
export const setHover = v => { hoverCell = v; };

/* ---------- Tools ---------- */
export const TOOLS = [
  ['dots',   '⠶', 'Dots',       '1', 'Click or drag to place dots. Right-click erases. Shift+click picks a layer.'],
  ['stamp',  '⣿', 'Character',  '2', 'Place the active character in a cell.'],
  ['erase',  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><g transform="rotate(-45 8 8.2)"><rect x="1.6" y="5.6" width="12.8" height="5.2" rx="1.4"/><path d="M6.6 5.6v5.2"/><path d="M6.6 5.9h6.4a1.1 1.1 0 0 1 1.1 1.1v2.4a1.1 1.1 0 0 1-1.1 1.1H6.6z" fill="currentColor" stroke="none" fill-opacity=".38"/></g><path d="M8.6 14.2h6"/></svg>', 'Erase',      '3', 'Erase dots or whole cells.'],
  ['recolor','◐', 'Recolor',    '4', 'Change color, keep the shape.'],
  ['pick',   '⌖', 'Eyedropper', '5', "Copy a cell's color and character. Alt+click works in any tool."],
  ['text',   'T', 'Text',       '6', 'Click to place the text. Drag to move it.'],
  ['select', '⬚', 'Select',     '7', 'Drag to select, then drag inside to move. Click a layer to select all of it. Arrows nudge.'],
  ['hand',   '✥', 'Pan',        '8', 'Drag to pan. The middle mouse button pans in any tool.']
];
const TOOL_TIPS = {
  dots: 'A cell has 8 dots but only one color, so a single dot can\u2019t have its own. Painting a dot recolors the whole cell: in a white cell, dot 3 can\u2019t be blue on its own. For mixed colors, use separate cells or layers.',
  erase: 'If it doesn\u2019t erase, you may need to switch the Erase mode below: Dots is for braille, Full cell clears whole cells (needed for ASCII and blocks).'
};
export function buildTools(){
  const box = $('#toolbtns');
  for (const [id, icon, name, key] of TOOLS){
    const b = document.createElement('button');
    b.className = 'tbtn'; b.dataset.tool = id; b.type = 'button';
    b.innerHTML = '<i aria-hidden="true"' + (id === 'stamp' ? ' class="sm"' : icon.startsWith('<svg') ? ' class="ic"' : '') + '>' + icon + '</i><span>' + name + '</span>' + (TOOL_TIPS[id] ? '<span class="tinfo" tabindex="0" role="img" aria-label="More info">i</span>' : '') + '<kbd>' + key + '</kbd>';
    const ti = b.querySelector('.tinfo');
    if (ti){
      const show = () => showTip(ti, TOOL_TIPS[id], 'right');
      ti.addEventListener('mouseenter', show); ti.addEventListener('focus', show);
      ti.addEventListener('mouseleave', hideTip); ti.addEventListener('blur', hideTip);
      ti.addEventListener('click', e => e.stopPropagation());
    }
    b.addEventListener('click', () => setTool(id));
    box.appendChild(b);
  }
}
export function setTool(id){
  if (id === 'pick' && tool !== 'pick') prevTool = tool;
  tool = id; if (id !== 'select'){ setLayFrame(false); clearSel(); }
  document.querySelectorAll('.tbtn').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === id)));
  $('#hint').textContent = TOOLS.find(t => t[0] === id)[4];
  cv.style.touchAction = id === 'hand' ? 'auto' : 'none';
  $('#dotModeWrap').hidden = id !== 'dots'; $('#eraseModeWrap').hidden = id !== 'erase';
  cv.style.cursor = id === 'hand' ? 'grab' : 'crosshair';
  $('#cursor').hidden = true; hoverCell = null; clearPreview();
}
let painting = false, eraseDrag = false, strokeMode = null, lastPt = null;
export const pos = e => { const r = cv.getBoundingClientRect(); return { px: e.clientX - r.left, py: e.clientY - r.top }; };
export function setDot(x, y, on){
  const i = (y >> 2) * doc.cols + (x >> 1), old = doc.chars[i], mask = DOT[y & 3][x & 1];
  if (!on && !isBr(old)) return;
  const b = bitsOf(old), nb = on ? (b | mask) : (b & ~mask);
  const nc = on ? curColor : doc.colors[i];
  if (nb === b && nc === doc.colors[i] && isBr(old)) return;
  setCell(i, brChar(nb), nc);
}
export function dotsAt(e){
  const { px, py } = pos(e), W = doc.cols * 2, H = doc.rows * 4;
  const dx = clamp(Math.floor(px / (cw / 2)), 0, W - 1), dy = clamp(Math.floor(py / (ch / 4)), 0, H - 1);
  const from = lastPt || [dx, dy], o = Math.floor((size - 1) / 2);
  line(from[0], from[1], dx, dy, (x, y) => {
    for (let j = 0; j < size; j++) for (let k = 0; k < size; k++){
      const X = x - o + k, Y = y - o + j;
      if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      if (strokeMode === null) strokeMode = (eraseDrag || tool === 'erase') ? 'erase' : 'paint';
      setDot(X, Y, strokeMode === 'paint');
    }
  });
  lastPt = [dx, dy];
}
export function cellsAt(e){
  const { px, py } = pos(e);
  const cx = clamp(Math.floor(px / cw), 0, doc.cols - 1), cy = clamp(Math.floor(py / ch), 0, doc.rows - 1);
  const from = lastPt || [cx, cy], o = Math.floor((size - 1) / 2);
  line(from[0], from[1], cx, cy, (x, y) => {
    for (let j = 0; j < size; j++) for (let k = 0; k < size; k++){
      const X = x - o + k, Y = y - o + j;
      if (X < 0 || Y < 0 || X >= doc.cols || Y >= doc.rows) continue;
      const i = Y * doc.cols + X;
      if (tool === 'dots') setCell(i, eraseDrag ? doc.blank : '⣿', eraseDrag ? -1 : curColor);
      else if (tool === 'stamp') setCell(i, curChar, curColor);
      else if (tool === 'erase') setCell(i, doc.blank, -1);
      else if (tool === 'recolor' && !isBlank(doc.chars[i]) && (!isBr(doc.chars[i]) || bitsOf(doc.chars[i]) !== 0)) setCell(i, doc.chars[i], curColor);
    }
  });
  lastPt = [cx, cy];
}
export function pickAt(e){
  const { px, py } = pos(e);
  const i = clamp(Math.floor(py / ch), 0, doc.rows - 1) * doc.cols + clamp(Math.floor(px / cw), 0, doc.cols - 1);
  const [c, col] = shown(i);
  setCurColor(col);
  if (!isBlank(c)) setCurChar(c);
}
export function moveCursor(e){
  const cur = $('#cursor');
  if (tool === 'hand'){ cur.hidden = true; clearPreview(); return; }
  const { px, py } = pos(e);
  if (px < 0 || py < 0 || px >= doc.cols * cw || py >= doc.rows * ch){ cur.hidden = true; hoverCell = null; clearPreview(); return; }
  const cx = Math.floor(px / cw), cy = Math.floor(py / ch);
  if (tool === 'text' && !painting){ hoverCell = [cx, cy]; drawPreview(cx, cy); } else { hoverCell = null; clearPreview(); }
  const [sc, scol] = shown(cy * doc.cols + cx);
  $('#cellInfo').textContent = 'col ' + (cx + 1) + ', row ' + (cy + 1) + '  ' + sc + '  ' + (hex(scol) || 'no color');
  if (tool === 'select'){ cur.hidden = true; cv.style.cursor = (sd ? sd.mode === 'move' : inSel(cx, cy)) ? 'move' : 'crosshair'; return; }
  let w, h, x, y, bw; const b = tool === 'pick' ? 1 : size, o = Math.floor((b - 1) / 2);
  if (byDot()){ w = cw / 2; h = ch / 4; x = (Math.floor(px / w) - o) * w; y = (Math.floor(py / h) - o) * h; }
  else if (tool === 'text'){ w = cw; h = ch; x = cx * w; y = cy * h; bw = Math.max(1, block.w); }
  else { w = cw; h = ch; x = (cx - o) * w; y = (cy - o) * h; }
  const bh = tool === 'text' ? Math.max(1, block.h) : b;
  Object.assign(cur.style, { left: x + 'px', top: y + 'px', width: (bw || b) * w + 'px', height: bh * h + 'px' });
  cur.classList.toggle('outline', tool === 'text'); cur.hidden = false;
}
export function onCanvasPointerDown(e){
  if (tool === 'hand' || e.button === 1) return;
  if (layFrame){ setLayFrame(false); updateLayBox(); }
  if (e.shiftKey && e.button === 0){ pickLayerAt(e); return; }
  if (e.altKey || tool === 'pick'){
    pickAt(e); if (tool === 'pick') setTool(prevTool === 'pick' ? 'dots' : prevTool); return;
  }
  const A = doc.layers[doc.active];
  if (!A.visible){ A.visible = true; renderLayers(); fullRedraw(); }
  if (tool === 'select'){ if (e.button === 0) selDown(e); return; }
  cv.setPointerCapture(e.pointerId);
  painting = true; eraseDrag = e.button === 2; strokeMode = null; lastPt = null; setStroke(new Map());
  paintAt(e);
}
export const byDot = () => (tool === 'dots' && dotMode !== 'cell') || (tool === 'erase' && eraseMode === 'dots');
export const paintAt = e => {
  if (tool === 'text'){
    clearPreview(); hoverCell = null;
    const { px, py } = pos(e);
    placeText(clamp(Math.floor(px / cw), 0, doc.cols - 1), clamp(Math.floor(py / ch), 0, doc.rows - 1));
    return;
  }
  (byDot() ? dotsAt : cellsAt)(e);
};
export function onCanvasPointerMove(e){ moveCursor(e); if (painting) paintAt(e); if (sd) selMove(e); }
export const stop = () => { if (painting){ painting = false; endStroke(); } selUp(); };
export function onCanvasPointerLeave(){ if (!painting) $('#cursor').hidden = true; hoverCell = null; clearPreview(); }

export function initCanvasTools(){
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('pointerdown', onCanvasPointerDown);
cv.addEventListener('pointermove', onCanvasPointerMove);
cv.addEventListener('pointerup', stop); cv.addEventListener('pointercancel', () => { cancelDrag(); stop(); });
cv.addEventListener('pointerleave', onCanvasPointerLeave);
}
