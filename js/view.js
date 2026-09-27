import { $, clamp, isTyping } from './core/util.js';
import { doc } from './core/doc.js';
import { cv, zoom, setZoomValue, setBgColor, setGhost, setGrid, relayout, fullRedraw, fit } from './render/canvas.js';
import { undo, redo } from './history.js';
import { scheduleSave } from './io/save.js';
import { TOOLS, tool, setTool, size, setSize, setDotMode, setEraseMode } from './tools/tools.js';
import { sel, setSel, sd, updateSelBox, clearSel, clearSelected, nudge, cancelDrag, cancelFloatImage } from './tools/select.js';
import { fimg } from './tools/floatimg.js';

export const stg = $('#stage');

/* ---------- General controls ---------- */
export function setZoom(z, ax, ay){
  z = clamp(Math.round(z * 4) / 4, .25, 4);
  if (z === zoom) return;
  const r = stg.getBoundingClientRect();
  const mx = (ax ?? r.left + r.width / 2) - r.left, my = (ay ?? r.top + r.height / 2) - r.top;
  const px = (stg.scrollLeft + mx) / zoom, py = (stg.scrollTop + my) / zoom;
  setZoomValue(z); $('#zoom').value = z; relayout();
  stg.scrollLeft = px * zoom - mx; stg.scrollTop = py * zoom - my;
}
$('#zoom').addEventListener('input', e => setZoom(Number(e.target.value)));
let wheelAcc = 0;
export function onStageWheel(e){
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  wheelAcc += e.deltaY;
  if (Math.abs(wheelAcc) < 40) return;
  setZoom(zoom + (wheelAcc < 0 ? .25 : -.25), e.clientX, e.clientY);
  wheelAcc = 0;
}
let pan = null;
export function onStageMouseDown(e){ if (e.button === 1) e.preventDefault(); }
export function onStagePointerDown(e){
  if (e.button !== 1 && !(tool === 'hand' && e.button === 0 && e.pointerType === 'mouse')) return;
  e.preventDefault(); stg.setPointerCapture(e.pointerId); $('#cursor').hidden = true;
  pan = { x: e.clientX, y: e.clientY, sl: stg.scrollLeft, st: stg.scrollTop };
  cv.style.cursor = 'grabbing';
}
export function onStagePointerMove(e){
  if (!pan) return;
  stg.scrollLeft = pan.sl - (e.clientX - pan.x); stg.scrollTop = pan.st - (e.clientY - pan.y);
}
const endPan = () => { if (pan){ pan = null; cv.style.cursor = tool === 'hand' ? 'grab' : 'crosshair'; } };
export { endPan };
export function onKeydown(e){
  const t = e.target;
  if (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && t.type !== 'range' && t.type !== 'checkbox')) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z'){ e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if (mod && e.key.toLowerCase() === 'y'){ e.preventDefault(); redo(); }
  else if (mod && e.key.toLowerCase() === 'a' && tool === 'select' && !fimg){ e.preventDefault(); setSel({ x0: 0, y0: 0, x1: doc.cols - 1, y1: doc.rows - 1 }); updateSelBox(); }
  else if (mod && e.key.toLowerCase() === 'd' && sel){ e.preventDefault(); clearSel(); }
  else if (tool === 'select' && sel && !fimg && !mod && t === document.body && e.key.startsWith('Arrow')){
    e.preventDefault(); const k = e.shiftKey ? 5 : 1; nudge(e.key === 'ArrowLeft' ? -k : e.key === 'ArrowRight' ? k : 0, e.key === 'ArrowUp' ? -k : e.key === 'ArrowDown' ? k : 0);
  }
  else if (tool === 'select' && sel && !fimg && !mod && !isTyping(t) && (e.key === 'Delete' || e.key === 'Backspace')){ e.preventDefault(); clearSelected(); }
  else if (e.key === 'Escape' && sd) cancelDrag();
  else if (e.key === 'Escape' && fimg) cancelFloatImage();
  else if (e.key === 'Escape' && sel) clearSel();
  else if (!mod && /^[1-8]$/.test(e.key)) setTool(TOOLS[Number(e.key) - 1][0]);
  else if (e.key === '[' ){ setSize(Math.max(1, size - 1)); $('#size').value = size; $('#sizeVal').textContent = size; }
  else if (e.key === ']' ){ setSize(Math.min(8, size + 1)); $('#size').value = size; $('#sizeVal').textContent = size; }
}
/* ---------- Collapsible panels (right bar) ---------- */
export function initFoldPanels(){
  document.querySelectorAll('.side .panel > h2').forEach(h => {
  const p = h.parentElement, b = document.createElement('button');
  b.type = 'button'; b.className = 'fold'; b.textContent = h.textContent; b.setAttribute('aria-expanded', 'false');
  p.classList.add('collapsed'); b.setAttribute('aria-expanded', 'false');
  b.addEventListener('click', () => { b.setAttribute('aria-expanded', String(!p.classList.toggle('collapsed'))); });
  h.textContent = ''; h.appendChild(b);
});
}
/* ---------- Tabs: Character / Color ---------- */
const dockTabs = [...document.querySelectorAll('.tabs [role=tab]')];
function showTab(t){
  dockTabs.forEach(b => { const on = b === t; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; $('#' + b.getAttribute('aria-controls')).hidden = !on; });
}
export function initDockTabs(){
  dockTabs.forEach((b, k) => {
  b.addEventListener('click', () => showTab(b));
  b.addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault(); const nx = dockTabs[(k + (e.key === 'ArrowRight' ? 1 : -1) + dockTabs.length) % dockTabs.length]; showTab(nx); nx.focus();
  });
  });
}

export function initView(){
$('#undo').addEventListener('click', undo); $('#redo').addEventListener('click', redo);
$('#zoom').addEventListener('input', e => setZoom(Number(e.target.value)));
stg.addEventListener('wheel', onStageWheel, { passive: false });
stg.addEventListener('mousedown', onStageMouseDown);
stg.addEventListener('pointerdown', onStagePointerDown);
stg.addEventListener('pointermove', onStagePointerMove);
stg.addEventListener('pointerup', endPan); stg.addEventListener('pointercancel', endPan);
$('#fit').addEventListener('click', fit);
$('#size').addEventListener('input', e => { setSize(Number(e.target.value)); $('#sizeVal').textContent = size; });
$('#dotMode').addEventListener('change', e => { setDotMode(e.target.value); });
$('#eraseMode').addEventListener('change', e => { setEraseMode(e.target.value); });
$('#ghost').addEventListener('change', e => { setGhost(e.target.checked); fullRedraw(); });
$('#grid').addEventListener('change', e => { setGrid(e.target.checked); fullRedraw(); });
$('#bg').addEventListener('input', e => { setBgColor(e.target.value); fullRedraw(); scheduleSave(); });
document.addEventListener('keydown', onKeydown);
initFoldPanels();                                 /* before: the .side .panel > h2 loop, inline */
  initFoldPanels();
  initDockTabs();
}
