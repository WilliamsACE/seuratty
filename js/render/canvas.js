import { $, MONO, DOT, isBr, bitsOf, hex, clamp } from '../core/util.js';
import { doc, shown } from '../core/doc.js';
import { layFrame, updateLayBox } from '../layers.js';
import { updateSelBox } from '../tools/select.js';

export let zoom = 1, cw = 8, ch = 16, dpr = 1;
export let bgColor = '#000000';
export let showGhost = false, showGrid = false;
let FG = '#d9dfde';
let lastDims = '';
export const cv = $('#cv'), ctx = cv.getContext('2d');
export const pv = $('#pv'), pctx = pv.getContext('2d');
export let pvRect = null, bgOn = false;

/* Other modules write these: zoom from fit and setZoom, cw/ch from renderPng,
   pvRect from the text preview, bgOn and bgColor from the controls,
   showGhost and showGrid from the checkboxes in the tool bar. */
export const setZoomValue = z => { zoom = z; };
export const setCellSize = (w, h) => { cw = w; ch = h; };
export const setPvRect = r => { pvRect = r; };
export const setBgOn = v => { bgOn = v; };
export const setBgColor = c => { bgColor = c; };
export const setGhost = v => { showGhost = v; };
export const setGrid = v => { showGrid = v; };

/* While the size is being edited (columns or rows field focused) the canvas background shifts a little:
   dark backgrounds get lighter and light ones get darker */
export function applyBg(){ cv.style.backgroundColor = canvasBg(); }
export function canvasBg(){
  if (!bgOn) return bgColor;
  const n = parseInt(bgColor.slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const dark = .299 * c[0] + .587 * c[1] + .114 * c[2] < 128, to = dark ? 255 : 0, k = dark ? .14 : .12;
  return 'rgb(' + c.map(v => Math.round(v + (to - v) * k)).join(',') + ')';
}

/* ---------- Drawing ---------- */
export function updateFg(){
  const n = parseInt(bgColor.slice(1), 16);
  const l = .299 * (n >> 16) + .587 * ((n >> 8) & 255) + .114 * (n & 255);
  FG = l > 140 ? '#111111' : '#d9dfde';
}
export function sizeCanvas(){
  cw = 8 * zoom; ch = 16 * zoom;
  const W = doc.cols * cw, H = doc.rows * ch;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  while ((W * dpr > 16000 || H * dpr > 16000 || W * H * dpr * dpr > 1.2e8) && dpr > 1) dpr = Math.max(1, dpr - .5);
  cv.width = Math.max(1, Math.round(W * dpr)); cv.height = Math.max(1, Math.round(H * dpr));
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  pv.width = cv.width; pv.height = cv.height; pv.style.width = cv.style.width; pv.style.height = cv.style.height;
  pctx.setTransform(dpr, 0, 0, dpr, 0, 0); pvRect = null;
}
/* Draws the content of a cell whose corner is (x, y) in logical px; g must already carry the dpr scale */
export function glyph(g, x, y, c, col, ghost){
  const fg = col < 0 ? FG : hex(col);
  if (isBr(c)){
    const b = bitsOf(c), r = Math.max(.8, cw * .2);
    if (ghost && b !== 255){
      g.fillStyle = 'rgba(128,145,145,.28)'; g.beginPath();
      for (let j = 0; j < 4; j++) for (let k = 0; k < 2; k++) if (!(b & DOT[j][k])){
        const px = x + cw * (k ? .75 : .25), py = y + ch * (j * .25 + .125); g.moveTo(px + r, py); g.arc(px, py, r, 0, 6.2832);
      }
      g.fill();
    }
    if (b){
      g.fillStyle = fg; g.beginPath();
      for (let j = 0; j < 4; j++) for (let k = 0; k < 2; k++) if (b & DOT[j][k]){
        const px = x + cw * (k ? .75 : .25), py = y + ch * (j * .25 + .125); g.moveTo(px + r, py); g.arc(px, py, r, 0, 6.2832);
      }
      g.fill();
    }
  } else if (c !== ' '){
    g.fillStyle = fg; g.font = Math.round(ch * .85) + 'px ' + MONO;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(c, x + cw / 2, y + ch / 2 + ch * .05);
  }
}
/* Characters are clipped to their cell and the cell is cleared on whole device pixels:
   that way a character that spills a little out of its cell never leaves a trace when moved or erased. */
let layRaf = 0;
export function schedLay(){ if (layFrame && !layRaf) layRaf = requestAnimationFrame(() => { layRaf = 0; updateLayBox(); }); }
export function drawCell(i, clear = true){
  schedLay();
  const x = (i % doc.cols) * cw, y = Math.floor(i / doc.cols) * ch, [c, col] = shown(i);
  const X0 = Math.round(x * dpr), Y0 = Math.round(y * dpr), X1 = Math.round((x + cw) * dpr), Y1 = Math.round((y + ch) * dpr);
  if (clear){ ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(X0, Y0, X1 - X0, Y1 - Y0); ctx.restore(); }
  const text = !isBr(c) && c !== ' ';
  if (text){ ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.beginPath(); ctx.rect(X0, Y0, X1 - X0, Y1 - Y0); ctx.clip(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
  glyph(ctx, x, y, c, col, showGhost);
  if (text) ctx.restore();
  if (showGrid){ ctx.strokeStyle = 'rgba(128,145,145,.35)'; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, cw - 1, ch - 1); }
}
export function fullRedraw(){
  updateFg(); applyBg(); ctx.clearRect(0, 0, doc.cols * cw, doc.rows * ch);
  for (let i = 0; i < doc.chars.length; i++) drawCell(i, false);
}
export function relayout(){
  sizeCanvas(); fullRedraw(); updateSelBox();
  $('#dim').textContent = doc.cols + ' × ' + doc.rows + ' cells';
  const d = doc.cols + 'x' + doc.rows;
  if (d !== lastDims){ lastDims = d; $('#rsCols').value = doc.cols; $('#rsRows').value = doc.rows; }
}
export function fit(){
  const w = $('#stage').clientWidth - 28;
  setZoomValue(clamp(Math.floor(w / (doc.cols * 8) * 20) / 20, .25, 4)); $('#zoom').value = zoom; relayout();
}
