import { $, clamp, isBlank } from './core/util.js';
import { doc, setDoc, mkLayer, bind, topLayer } from './core/doc.js';
import { cw, ch, fullRedraw, relayout } from './render/canvas.js';
import { snap, pushHist } from './history.js';
import { sel, clearSel, selectLayer, cellOf, commitPaste, pend } from './tools/select.js';
import { fimg } from './tools/floatimg.js';
import { tool } from './tools/tools.js';
import { scheduleDocColors } from './ui/color.js';
import { scheduleSave } from './io/save.js';
import { say } from './ui/status.js';

/* main.js creates the element by calling initLayBox(), at the same point where it
   used to be created; no module touches the DOM when imported. */
let layBox = null;
export function initLayBox(){
  layBox = document.createElement('div'); layBox.id = 'layBox'; layBox.hidden = true; layBox.setAttribute('aria-hidden', 'true');
  $('#wrap').appendChild(layBox);
  return layBox;
}
export const setLayFrame = v => { layFrame = v; };
export let layFrame = false;                     // shown after picking a layer from the list
export function layBounds(){
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let i = 0; i < doc.chars.length; i++) if (!isBlank(doc.chars[i])){
    const x = i % doc.cols, y = (i / doc.cols) | 0;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}
export function updateLayBox(){
  const b = layFrame && doc.layers[doc.active].visible ? layBounds() : null;
  if (!b || (sel && tool === 'select')){ layBox.hidden = true; return; }
  Object.assign(layBox.style, { left: b.x0 * cw - 1 + 'px', top: b.y0 * ch - 1 + 'px', width: (b.x1 - b.x0 + 1) * cw + 2 + 'px', height: (b.y1 - b.y0 + 1) * ch + 2 + 'px' });
  layBox.hidden = false;
}

export function layerOp(fn){
  commitPaste();
  const before = snap(); fn(); pushHist({ snap: true, before, after: snap() });
  clearSel(); fullRedraw(); renderLayers(); scheduleDocColors();
}
export function newLayerName(){
  const used = new Set(doc.layers.map(L => L.name)); let k = doc.layers.length + 1;
  while (used.has('Layer ' + k)) k++;
  return 'Layer ' + k;
}
export function setActive(k){
  if (pend || fimg){ const tgt = doc.layers[k]; commitPaste(); k = doc.layers.indexOf(tgt); if (k < 0) k = doc.active; }
  if (k === doc.active) return;
  doc.active = k; bind(doc); clearSel();
  const rows = [...$('#layers').children].reverse();
  rows.forEach((li, j) => j === k ? li.setAttribute('aria-current', 'true') : li.removeAttribute('aria-current'));
  updLayerBtns();
}
export function updLayerBtns(){ $('#lyAdd').disabled = $('#lyDup').disabled = doc.layers.length >= 10; }
export function deleteLayerAt(k){
  if (pend || fimg){ const tgt = doc.layers[k]; commitPaste(); k = doc.layers.indexOf(tgt); if (k < 0) return; }
  if (doc.layers.length <= 1) return;
  layerOp(() => { doc.layers.splice(k, 1); doc.active = clamp(doc.active > k ? doc.active - 1 : doc.active, 0, doc.layers.length - 1); bind(doc); });
}
export function renameLayer(L, btn){
  const inp = document.createElement('input'); inp.type = 'text'; inp.value = L.name; inp.maxLength = 30; inp.setAttribute('aria-label', 'Layer name');
  btn.replaceWith(inp); inp.focus(); inp.select();
  let done = false;
  const end = ok => { if (done) return; done = true; if (ok && inp.value.trim()) L.name = inp.value.trim(); renderLayers(); };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') end(true); else if (e.key === 'Escape') end(false); });
  inp.addEventListener('blur', () => end(true));
}
const GRIP_SVG = '<svg viewBox="0 0 8 16" width="8" height="16" aria-hidden="true"><circle cx="2" cy="2.5" r="1.1" fill="currentColor"/><circle cx="6" cy="2.5" r="1.1" fill="currentColor"/><circle cx="2" cy="8" r="1.1" fill="currentColor"/><circle cx="6" cy="8" r="1.1" fill="currentColor"/><circle cx="2" cy="13.5" r="1.1" fill="currentColor"/><circle cx="6" cy="13.5" r="1.1" fill="currentColor"/></svg>';
const TRASH_SVG = '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4h10"/><path d="M6 4V2.6c0-.3.3-.6.6-.6h2.8c.3 0 .6.3.6.6V4"/><path d="M4.5 4l.6 9c.05.8.7 1.4 1.5 1.4h2.8c.8 0 1.45-.6 1.5-1.4l.6-9"/><path d="M6.5 7v4"/><path d="M9.5 7v4"/></svg>';
export function renderLayers(){
  scheduleSave();
  const ul = $('#layers'); ul.textContent = '';
  for (let k = doc.layers.length - 1; k >= 0; k--){                 // top of the list = top of the stack
    const L = doc.layers[k], li = document.createElement('li');
    li.className = 'ly' + (L.visible ? '' : ' off') + (dragId === L.id ? ' dragging' : '');
    li.dataset.id = L.id;
    if (k === doc.active) li.setAttribute('aria-current', 'true');
    const grip = document.createElement('button'); grip.type = 'button'; grip.className = 'lygrip'; grip.tabIndex = -1;
    grip.setAttribute('aria-hidden', 'true'); grip.innerHTML = GRIP_SVG;
    grip.addEventListener('pointerdown', e => layerDragStart(e, L.id));
    const eye = document.createElement('input'); eye.type = 'checkbox'; eye.checked = L.visible; eye.title = 'Show or hide'; eye.setAttribute('aria-label', 'Show ' + L.name);
    eye.addEventListener('change', () => { L.visible = eye.checked; li.classList.toggle('off', !L.visible); fullRedraw(); scheduleDocColors(); scheduleSave(); });
    const nb = document.createElement('button'); nb.type = 'button'; nb.className = 'lname'; nb.textContent = L.name; nb.title = 'Double-click to rename. Focus and press ↑ / ↓ to reorder.';
    nb.addEventListener('click', () => { setActive(k); layFrame = true; if (tool === 'select') selectLayer(); else updateLayBox(); });
    nb.addEventListener('dblclick', () => renameLayer(L, nb));
    nb.addEventListener('keydown', e => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      if (doc.active !== k) setActive(k);
      const d = e.key === 'ArrowUp' ? 1 : -1, dest = k + d;
      if (dest < 0 || dest >= doc.layers.length) return;
      swapLayer(d);
      const again = $('#layers li[aria-current="true"] .lname'); if (again) again.focus();
    });
    const trash = document.createElement('button'); trash.type = 'button'; trash.className = 'lytrash'; trash.title = 'Delete layer'; trash.setAttribute('aria-label', 'Delete ' + L.name);
    trash.disabled = doc.layers.length <= 1; trash.innerHTML = TRASH_SVG;
    trash.addEventListener('click', e => { e.stopPropagation(); deleteLayerAt(k); });
    li.append(grip, eye, nb, trash); ul.appendChild(li);
  }
  updLayerBtns();
}

export function pickLayerAt(e){
  const [cx, cy] = cellOf(e), i = cy * doc.cols + cx, L = topLayer(i);
  if (!L){ say('No layer here.'); return; }
  const k = doc.layers.indexOf(L); setActive(k); layFrame = true;
  if (tool === 'select') selectLayer(); else updateLayBox();
  say('Picked ' + L.name + '.');
}

export const swapLayer = d => layerOp(() => {
  const a = doc.active, b = a + d, t = doc.layers[a]; doc.layers[a] = doc.layers[b]; doc.layers[b] = t; doc.active = b; bind(doc);
});
/* Drag a row of the list to reorder: it rearranges live while dragging
   and records a single undo step on release. */
let dragId = null, dragBefore = null, dragOrder = null;
export function layerDragStart(e, id){
  if (e.button !== 0) return;
  e.preventDefault();
  dragId = id; dragBefore = snap(); dragOrder = doc.layers.map(L => L.id);
  document.addEventListener('pointermove', layerDragMove);
  document.addEventListener('pointerup', layerDragEnd, { once: true });
  renderLayers();
}
export function layerDragMove(e){
  if (dragId == null) return;
  const li = document.elementFromPoint(e.clientX, e.clientY)?.closest('.ly');
  if (!li || Number(li.dataset.id) === dragId) return;
  const from = doc.layers.findIndex(L => L.id === dragId), to = doc.layers.findIndex(L => L.id === Number(li.dataset.id));
  if (from < 0 || to < 0) return;
  const activeId = doc.layers[doc.active].id;
  const [item] = doc.layers.splice(from, 1); doc.layers.splice(to, 0, item);
  doc.active = doc.layers.findIndex(L => L.id === activeId); bind(doc);
  fullRedraw(); renderLayers(); scheduleDocColors();
}
export function layerDragEnd(){
  document.removeEventListener('pointermove', layerDragMove);
  if (dragId != null && doc.layers.map(L => L.id).join() !== dragOrder.join()) pushHist({ snap: true, before: dragBefore, after: snap() });
  dragId = null; dragBefore = null; dragOrder = null;
  renderLayers();
}

/* Grows the canvas without touching the history: the caller (an image that does not fit) already
   holds the snapshot that undoes the whole thing in a single step. cropLayer reads doc.cols and
   doc.rows, so the layers are rebuilt before the new size is installed. */
export function growDocTo(nc, nr){
  const layers = doc.layers.map(L => cropLayer(L, nc, nr));
  setDoc(bind({ cols: nc, rows: nr, blank: doc.blank, active: doc.active, layers }));
  relayout();
}
export function cropLayer(L, nc, nr){
  const chars = new Array(nc * nr).fill(doc.blank), colors = new Int32Array(nc * nr).fill(-1);
  for (let r = 0; r < Math.min(doc.rows, nr); r++){
    for (let c = 0; c < Math.min(doc.cols, nc); c++){
      chars[r * nc + c] = L.chars[r * doc.cols + c]; colors[r * nc + c] = L.colors[r * doc.cols + c];
    }
  }
  return { ...L, chars, colors };
}

export function initLayerButtons(){
$('#lyDup').addEventListener('click', () => { if (doc.layers.length < 10) layerOp(() => {
  const A = doc.layers[doc.active], L = mkLayer(A.name + ' copy', A.chars.slice(), A.colors.slice()); L.visible = A.visible;
  doc.layers.splice(doc.active + 1, 0, L); doc.active++; bind(doc);
}); });
$('#lyAdd').addEventListener('click', () => layerOp(() => {
  const n = doc.cols * doc.rows, L = mkLayer(newLayerName(), new Array(n).fill(doc.blank), new Int32Array(n).fill(-1));
  doc.layers.splice(doc.active + 1, 0, L); doc.active++; bind(doc);
}));
}
