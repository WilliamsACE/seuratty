import { $, clamp } from '../core/util.js';
import { doc } from '../core/doc.js';
import { cw, ch, setBgOn, applyBg } from '../render/canvas.js';
import { replaceDoc } from '../history.js';
import { cropLayer } from '../layers.js';
import { setHover } from '../tools/tools.js';
import { clearPreview } from '../tools/text.js';
import { say } from '../ui/status.js';

/* ---------- Canvas size ---------- */
export const rsDims = () => [clamp(parseInt($('#rsCols').value) || doc.cols, 1, 400), clamp(parseInt($('#rsRows').value) || doc.rows, 1, 200)];
let askTimer = 0;
export const askNew = on => { $('#newAsk').hidden = !on; if (on) $('#newNo').focus(); else $('#newCv').focus(); };
export function resizeTo(nc, nr){
  replaceDoc({ cols: nc, rows: nr, blank: doc.blank, active: doc.active, layers: doc.layers.map(L => cropLayer(L, nc, nr)) }, false);
  say('Canvas ' + nc + ' × ' + nr + ' cells.');
}
const grip = $('#grip'), rsBox = $('#rsBox');
let gripDrag = null;
export function showBox(){
  rsBox.hidden = false; rsBox.style.width = gripDrag.nc * cw + 'px'; rsBox.style.height = gripDrag.nr * ch + 'px';
  rsBox.querySelector('span').textContent = gripDrag.nc + ' × ' + gripDrag.nr;
}
export function onNewYes(){
  askNew(false);
  const [c, r] = rsDims();
  replaceDoc({ cols: c, rows: r, chars: new Array(c * r).fill('⠀'), colors: new Int32Array(c * r).fill(-1), blank: '⠀' }, true);
  say('Blank canvas ' + c + ' × ' + r + '.');
}
export function onResizeApply(){
  const [nc, nr] = rsDims();
  $('#rsCols').value = nc; $('#rsRows').value = nr;
  if (nc === doc.cols && nr === doc.rows){ say('Canvas is already that size.'); return; }
  resizeTo(nc, nr);
}
export function onGripDown(e){
  if (e.button !== 0) return;
  e.preventDefault(); e.stopPropagation(); grip.setPointerCapture(e.pointerId);
  grip.classList.add('busy');
  $('#cursor').hidden = true; setHover(null); clearPreview();
  gripDrag = { x: e.clientX, y: e.clientY, c: doc.cols, r: doc.rows, nc: doc.cols, nr: doc.rows };
  showBox();
}
export function onGripMove(e){
  if (!gripDrag) return;
  gripDrag.nc = clamp(gripDrag.c + Math.round((e.clientX - gripDrag.x) / cw), 1, 400);
  gripDrag.nr = clamp(gripDrag.r + Math.round((e.clientY - gripDrag.y) / ch), 1, 200);
  showBox();
}
export function onGripUp(){
  if (!gripDrag) return;
  const { nc, nr } = gripDrag; gripDrag = null; rsBox.hidden = true;
  if (nc !== doc.cols || nr !== doc.rows) resizeTo(nc, nr);
}
export function onGripCancel(){ gripDrag = null; rsBox.hidden = true; }
export function onGripLostCapture(){ grip.classList.remove('busy'); }
export function onGripKeydown(e){
  const d = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[e.key];
  if (!d) return;
  e.preventDefault();
  const s = e.shiftKey ? 10 : 1, nc = clamp(doc.cols + d[0] * s, 1, 400), nr = clamp(doc.rows + d[1] * s, 1, 200);
  if (nc !== doc.cols || nr !== doc.rows) resizeTo(nc, nr);
}
/* main.js calls this where these listeners used to be registered: first the ones
   for the corner grip, then the ones for the columns and rows fields. */
export function initCanvasSize(){
  $('#newAsk').addEventListener('click', e => { if (e.target === e.currentTarget) askNew(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#newAsk').hidden){ e.stopPropagation(); askNew(false); } }, true);
  $('#newCv').addEventListener('click', () => askNew(true));
  $('#newNo').addEventListener('click', () => askNew(false));
  $('#newYes').addEventListener('click', onNewYes);
  $('#rsApply').addEventListener('click', onResizeApply);
  grip.addEventListener('pointerdown', onGripDown);
  grip.addEventListener('pointermove', onGripMove);
  grip.addEventListener('pointerup', onGripUp);
  grip.addEventListener('pointercancel', onGripCancel);
  grip.addEventListener('lostpointercapture', onGripLostCapture);
  grip.addEventListener('keydown', onGripKeydown);
  /* If the field is left empty or invalid, it goes back to the current size */
  [['#rsCols', () => doc.cols, 400], ['#rsRows', () => doc.rows, 200]].forEach(([s, cur, max]) => {
  const el = $(s);
  el.addEventListener('keydown', e => { if (e.key === 'Enter') $('#rsApply').click(); });
  el.addEventListener('focus', () => { setBgOn(true); applyBg(); });
  el.addEventListener('blur', () => {
    setBgOn(false); applyBg();
    const n = parseInt(el.value);
    el.value = Number.isFinite(n) && n >= 1 ? Math.min(n, max) : cur();
  });
  });
}
