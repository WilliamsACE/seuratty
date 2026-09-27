import { $, DOT, clamp, isBr, isBlank, isTyping, brChar } from '../core/util.js';
import { parseText } from '../core/ansi.js';
import { doc, mkLayer, bind, shown } from '../core/doc.js';
import { cv, cw, ch, dpr, glyph, drawCell, fullRedraw, fit } from '../render/canvas.js';
import { snap, pushHist, updHist, setCell, endStroke, stroke, setStroke, undoStack, redoStack, layerById, loadSnap } from '../history.js';
import { renderLayers, updateLayBox, growDocTo } from '../layers.js';
import { fimg, makeFimg, moveFimg, dropFimg, drawFimg, stampFimg, fimgSel, overFimg } from './floatimg.js';
import { tool, setTool, pos } from './tools.js';
import { scheduleDocColors } from '../ui/color.js';
import { say } from '../ui/status.js';

/* ---------- Selection: move characters of the active layer ---------- */
export let sel = null, sd = null;                       // sel = {x0,y0,x1,y1} in cells (inclusive); sd = drag in progress
export const setSel = s => { sel = s; };                // the Ctrl+A shortcut writes it
const selBox = $('#selBox');
export const cellOf = e => { const { px, py } = pos(e); return [clamp(Math.floor(px / cw), 0, doc.cols - 1), clamp(Math.floor(py / ch), 0, doc.rows - 1)]; };
export const inSel = (x, y) => !!sel && x >= sel.x0 && x <= sel.x1 && y >= sel.y0 && y <= sel.y1;
export function updateSelBox(){
  updateLayBox(); drawFimg();                           // the floating image follows the zoom and every move
  if (!sel){ selBox.hidden = true; return; }
  Object.assign(selBox.style, { left: sel.x0 * cw + 'px', top: sel.y0 * ch + 'px', width: (sel.x1 - sel.x0 + 1) * cw + 'px', height: (sel.y1 - sel.y0 + 1) * ch + 'px' });
  selBox.hidden = false;
}
/* main.js creates the floating canvas with initFloat(), at the same point and with the
   same insertBefore(fl, selBox) as before. */
let fl = null;
export function initFloat(){
  fl = document.createElement('canvas'); fl.id = 'fl'; fl.hidden = true; fl.setAttribute('aria-hidden', 'true');
  $('#wrap').insertBefore(fl, selBox);
  return fl;
}
export function revertStroke(){
  if (stroke) for (const [i, [oc, ol]] of stroke){ doc.chars[i] = oc; doc.colors[i] = ol; drawCell(i); }
  setStroke(null);
}
export function clearSel(){ if (sd && sd.mode === 'move' && sd.floating) revertStroke(); sd = null; fl.hidden = true; commitPaste(); sel = null; updateSelBox(); }
/* Moves the floating image, with no clipping: it may hang outside the canvas, and only one cell
   has to stay inside so it can always be grabbed again. Guarded against a null fimg: autosave can
   land between two pointermove ticks of the same drag (see the note by fimgDragging below), and a
   drag that outlives it should just keep moving nothing rather than throw. */
export function fimgTo(dx, dy){
  if (!fimg) return;
  const x = clamp(sd.ox + dx, 1 - fimg.w, doc.cols - 1), y = clamp(sd.oy + dy, 1 - fimg.h, doc.rows - 1);
  if (x === fimg.x && y === fimg.y) return;
  moveFimg(x, y); sel = fimgSel(); updateSelBox();
}
export function lift(){                                 // non-blank characters of the active layer inside the selection
  const out = [];
  for (let y = sel.y0; y <= sel.y1; y++) for (let x = sel.x0; x <= sel.x1; x++){
    const i = y * doc.cols + x; if (!isBlank(doc.chars[i])) out.push([x, y, doc.chars[i], doc.colors[i]]);
  }
  return out;
}
export function mkDrag(lifted){
  let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
  for (const [x, y] of lifted){ x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { lifted, box: [x0, y0, x1, y1], r0: { ...sel }, dx: 0, dy: 0 };
}
export function shiftTo(dx, dy){                        // the content never leaves the canvas; every step starts from the original state
  const [x0, y0, x1, y1] = sd.box;
  dx = clamp(dx, -x0, doc.cols - 1 - x1); dy = clamp(dy, -y0, doc.rows - 1 - y1);
  if (dx === sd.dx && dy === sd.dy) return;
  sd.dx = dx; sd.dy = dy;
  for (const [i, [oc, ol]] of stroke){ doc.chars[i] = oc; doc.colors[i] = ol; drawCell(i); }
  stroke.clear();
  for (const [x, y] of sd.lifted) setCell(y * doc.cols + x, doc.blank, -1);
  for (const [x, y, c, col] of sd.lifted) setCell((y + dy) * doc.cols + x + dx, c, col);
  const r = sd.r0;
  sel = { x0: clamp(r.x0 + dx, 0, doc.cols - 1), y0: clamp(r.y0 + dy, 0, doc.rows - 1), x1: clamp(r.x1 + dx, 0, doc.cols - 1), y1: clamp(r.y1 + dy, 0, doc.rows - 1) };
  updateSelBox();
}
/* While dragging, the characters are drawn once into a background-less image that slides cell by cell
   (without redrawing the canvas); on release the characters settle into their new place. */
export function beginFloat(){
  const [x0, y0, x1, y1] = sd.box, w = x1 - x0 + 1, h = y1 - y0 + 1;
  const fd = Math.max(.25, Math.min(dpr, Math.sqrt(1.6e7 / (w * cw * h * ch))));
  fl.width = Math.max(1, Math.round(w * cw * fd)); fl.height = Math.max(1, Math.round(h * ch * fd));
  fl.style.width = w * cw + 'px'; fl.style.height = h * ch + 'px';
  fl.style.left = x0 * cw + 'px'; fl.style.top = y0 * ch + 'px'; fl.style.transform = 'translate(0,0)';
  const g = fl.getContext('2d');
  for (const [x, y, c, col] of sd.lifted){
    const px = (x - x0) * cw, py = (y - y0) * ch, text = !isBr(c);
    g.save(); g.setTransform(fd, 0, 0, fd, 0, 0);
    if (text){ g.beginPath(); g.rect(px, py, cw, ch); g.clip(); }
    glyph(g, px, py, c, col, false); g.restore();
  }
  fl.hidden = false;
  for (const [x, y] of sd.lifted) setCell(y * doc.cols + x, doc.blank, -1);   // the characters fall outside the canvas
  sd.floating = true;
}
export function floatTo(dx, dy){
  const [x0, y0, x1, y1] = sd.box;
  dx = clamp(dx, -x0, doc.cols - 1 - x1); dy = clamp(dy, -y0, doc.rows - 1 - y1);
  if (dx === sd.dx && dy === sd.dy) return;
  sd.dx = dx; sd.dy = dy;
  if (!sd.floating) beginFloat();
  fl.style.transform = 'translate(' + dx * cw + 'px,' + dy * ch + 'px)';
  const r = sd.r0;
  sel = { x0: clamp(r.x0 + dx, 0, doc.cols - 1), y0: clamp(r.y0 + dy, 0, doc.rows - 1), x1: clamp(r.x1 + dx, 0, doc.cols - 1), y1: clamp(r.y1 + dy, 0, doc.rows - 1) };
  updateSelBox();
}
export function dropFloat(d){
  fl.hidden = true;
  if (!d.floating){ setStroke(null); return; }
  if (!d.dx && !d.dy){ revertStroke(); return; }
  for (const [x, y, c, col] of d.lifted) setCell((y + d.dy) * doc.cols + x + d.dx, c, col);
  endStroke();
}
export function cancelDrag(){
  if (sd && sd.mode === 'fimg'){ const d = sd; sd = null; moveFimg(d.ox, d.oy); sel = fimgSel(); updateSelBox(); return; }
  if (!sd || sd.mode !== 'move') return;
  const d = sd; sd = null; fl.hidden = true;
  if (d.floating) revertStroke(); else setStroke(null);
  sel = { ...d.r0 }; updateSelBox();
}
export function selectLayer(){                          // box around everything in the active layer
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let i = 0; i < doc.chars.length; i++) if (!isBlank(doc.chars[i])){
    const x = i % doc.cols, y = (i / doc.cols) | 0;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0){ sel = null; updateSelBox(); say('This layer is empty.'); return; }
  sel = { x0, y0, x1, y1 }; updateSelBox(); say('Layer selected. Drag inside to move it.');
}
export function selDown(e){
  const [cx, cy] = cellOf(e); cv.setPointerCapture(e.pointerId);
  if (fimg){                                            // drag the floating image as a whole
    if (overFimg(cx, cy)){ sd = { mode: 'fimg', sx: cx, sy: cy, ox: fimg.x, oy: fimg.y }; return; }
    commitPaste();                                      // clicking outside fixes it, as it does a paste
  }
  if (inSel(cx, cy)){
    const lifted = lift();
    if (lifted.length){ sd = { mode: 'move', sx: cx, sy: cy, floating: false, ...mkDrag(lifted) }; setStroke(new Map()); return; }
  }
  commitPaste();
  sd = { mode: 'new', sx: cx, sy: cy, moved: false }; sel = { x0: cx, y0: cy, x1: cx, y1: cy }; updateSelBox();
}
export function selMove(e){
  const [cx, cy] = cellOf(e);
  if (sd.mode === 'fimg'){ fimgTo(cx - sd.sx, cy - sd.sy); return; }
  if (sd.mode === 'move'){ floatTo(cx - sd.sx, cy - sd.sy); return; }
  if (cx !== sd.sx || cy !== sd.sy) sd.moved = true;
  sel = { x0: Math.min(sd.sx, cx), y0: Math.min(sd.sy, cy), x1: Math.max(sd.sx, cx), y1: Math.max(sd.sy, cy) }; updateSelBox();
}
export function selUp(){
  if (!sd) return;
  const d = sd; sd = null;
  if (d.mode === 'fimg') return;                        // the image stays where it was left, unfixed
  if (d.mode === 'move'){ dropFloat(d); return; }
  if (!d.moved){ if (isBlank(doc.chars[d.sy * doc.cols + d.sx])) sel = null; updateSelBox(); }   // a click picks a character or clears the selection
}
export function nudge(dx, dy){
  if (!sel) return;
  const lifted = lift(); if (!lifted.length) return;
  sd = { mode: 'move', ...mkDrag(lifted) }; setStroke(new Map()); shiftTo(dx, dy); endStroke(); sd = null;
}
let clip = null, menuCell = null;
export let pointerCell = null;
/* Pending paste: what was pasted lives in a temporary layer ("Pasted") while it is placed; on release it merges into the source layer. */
export let pend = null;
/* Pending floating image (Image to ASCII): the buffer lives in floatimg.js, cells and all, even the
   ones currently outside the canvas. fimgSnap is the undo bookkeeping for it, the same shape pend
   uses for a paste: a snapshot from before anything changed, and the undoStack length to restore if
   it is cancelled instead of fixed. The active layer never changes while it floats. */
let fimgSnap = null;
function commitFimg(){
  const S = fimgSnap; fimgSnap = null;
  const L = doc.layers[doc.active];
  const n = stampFimg(L);
  if (S.title && /^Layer \d+$/.test(L.name)) L.name = S.title;   // a still-default layer name picks up the image's, like a Convert used to
  dropFimg();
  undoStack.length = S.undoLen; pushHist({ snap: true, before: S.before, after: snap() });
  fullRedraw(); renderLayers(); scheduleDocColors();
  say(n + ' cell' + (n === 1 ? '' : 's') + ' placed into "' + L.name + '".');
}
function revertFimg(){
  const S = fimgSnap; fimgSnap = null;
  dropFimg(); undoStack.length = S.undoLen; loadSnap(S.before); updHist();
}
/* Puts a converted image (image.js) in as a floating selection: it can be dragged, including partly
   or wholly out of the canvas, and is only written into the active layer when it is confirmed. If the
   image does not fit the canvas, the canvas is grown first (cropLayer, no history of its own): the
   grow and the eventual fix-in-place undo together as the single step fimgSnap.before restores. */
export function insertFloatImage(d, title){
  commitPaste();                                          // close a pending text paste first
  if (fimg) revertFimg();                                  // replace a still-floating image (e.g. a live slider tweak)
  const before = snap(), undoLen = undoStack.length;
  const nc = Math.max(doc.cols, d.cols), nr = Math.max(doc.rows, d.rows);
  if (nc !== doc.cols || nr !== doc.rows) growDocTo(nc, nr);
  const x = Math.max(0, Math.floor((doc.cols - d.cols) / 2)), y = Math.max(0, Math.floor((doc.rows - d.rows) / 2));
  makeFimg(d, x, y);
  fimgSnap = { before, undoLen, title };
  if (tool !== 'select') setTool('select');
  sel = fimgSel(); updateSelBox();
}
export const fimgPending = () => !!fimg;
const fimgDragging = () => !!(sd && sd.mode === 'fimg');   // an active drag has pointer capture: only autosave's own
                                                             // timer can reach commitPaste()/cancelPaste() mid-gesture
export function cancelFloatImage(){                        // Escape: discard, no residue
  if (!fimg || fimgDragging()) return false;
  revertFimg(); sel = null; updateSelBox(); say('Discarded.');
  return true;
}
/* fromUser is false only for autosave (io/save.js): a floating image is fixed in place by a
   confirm gesture, never by a passive timer, so autosave leaves it floating (and unsaved, like a
   selection still being dragged) rather than finalize it behind the user's back. */
export function commitPaste(fromUser = true){
  if (fimg && fromUser && !fimgDragging()) commitFimg();
  if (!pend) return;
  const P = pend; pend = null;
  const T = layerById(P.tmp), O = layerById(P.orig);
  if (!T || !O){ return; }
  for (let i = 0; i < T.chars.length; i++) if (!isBlank(T.chars[i])){ O.chars[i] = T.chars[i]; O.colors[i] = T.colors[i]; }
  doc.layers.splice(doc.layers.indexOf(T), 1); doc.active = doc.layers.indexOf(O); bind(doc);
  undoStack.length = P.undoLen; pushHist({ snap: true, before: P.before, after: snap() });
  fullRedraw(); renderLayers(); scheduleDocColors();
}
export function cancelPaste(){
  if (fimg){ if (!fimgDragging()) revertFimg(); return; }
  if (!pend) return;
  const P = pend; pend = null; undoStack.length = P.undoLen; loadSnap(P.before); updHist();
}
export function trackPointerCell(e){ pointerCell = cellOf(e); }
export function forgetPointerCell(){ pointerCell = null; }
export function viewCell(){                                 // top left corner of the visible part of the canvas
  const r = $('#stage').getBoundingClientRect(), c = cv.getBoundingClientRect();
  return [clamp(Math.floor((Math.max(r.left, c.left) - c.left) / cw) + 1, 0, doc.cols - 1), clamp(Math.floor((Math.max(r.top, c.top) - c.top) / ch) + 1, 0, doc.rows - 1)];
}
export function selText(){                                  // visible text inside the selection (plus an internal copy with colors)
  if (!sel) return '';
  const out = [], w = sel.x1 - sel.x0 + 1, h = sel.y1 - sel.y0 + 1, chars = [], colors = [];
  for (let y = sel.y0; y <= sel.y1; y++){
    let r = ''; for (let x = sel.x0; x <= sel.x1; x++){ const [c, col] = shown(y * doc.cols + x); r += c; chars.push(c); colors.push(col); }
    out.push(r);
  }
  const text = out.join('\n'); clip = { text, w, h, chars, colors }; return text;
}
export async function copySelected(){
  const t = selText(); if (!t) return;
  try { await navigator.clipboard.writeText(t); say('Copied.'); }
  catch { const a = document.createElement('textarea'); a.value = t; a.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(a); a.select(); const ok = document.execCommand('copy'); a.remove(); say(ok ? 'Copied.' : 'Copy failed.'); }
}
export function pasteText(text, at){
  if (!text) return;
  let g;
  if (clip && clip.text === text) g = clip;
  else { const P = parseText(text); if (!P || P.error){ say(P && P.error || 'Nothing to paste.'); return; } g = { w: P.cols, h: P.rows, chars: P.chars, colors: Array.from(P.colors) }; }
  if (!at) at = pointerCell || viewCell();
  const ox = at[0], oy = at[1];
  if (ox >= doc.cols || oy >= doc.rows) return;
  if (tool !== 'select') setTool('select');
  clearSel();                                            // commits a previous paste
  if (doc.layers.length >= 10){ say('Layer limit reached (10). Delete or merge a layer first.'); return; }
  const orig = doc.layers[doc.active]; orig.visible = true;
  const before = snap(), n = doc.cols * doc.rows, L = mkLayer('Pasted', new Array(n).fill(doc.blank), new Int32Array(n).fill(-1));
  for (let y = 0; y < g.h && oy + y < doc.rows; y++) for (let x = 0; x < g.w && ox + x < doc.cols; x++){
    const c = g.chars[y * g.w + x]; if (isBlank(c)) continue;
    L.chars[(oy + y) * doc.cols + ox + x] = c; L.colors[(oy + y) * doc.cols + ox + x] = g.colors[y * g.w + x];
  }
  pend = { orig: orig.id, tmp: L.id, before, undoLen: undoStack.length };
  doc.layers.splice(doc.active + 1, 0, L); doc.active++; bind(doc); redoStack.length = 0; updHist();
  fullRedraw(); renderLayers(); scheduleDocColors();
  sel = { x0: ox, y0: oy, x1: Math.min(ox + g.w, doc.cols) - 1, y1: Math.min(oy + g.h, doc.rows) - 1 }; updateSelBox();
  say('Pasted. Drag inside to move it.');
}
export async function pasteFromMenu(){
  try { pasteText(await Promise.race([navigator.clipboard.readText(), new Promise((_, no) => setTimeout(no, 700))]), menuCell); }
  catch { if (clip) pasteText(clip.text, menuCell); else say('Paste blocked by the browser. Use Ctrl+V.'); }
}
/* Flip the content of the selection (active layer). It also mirrors the braille dots and some symbols. */
const MIR_H = {}, MIR_V = {};
[['/', '\\'], ['(', ')'], ['[', ']'], ['{', '}'], ['<', '>'], ['▌', '▐'], ['▖', '▗'], ['▘', '▝'], ['▙', '▟'], ['▛', '▜'], ['◀', '▶'], ['◤', '◥'], ['◣', '◢']].forEach(([a, b]) => { MIR_H[a] = b; MIR_H[b] = a; });
[['/', '\\'], ['▀', '▄'], ['▖', '▘'], ['▗', '▝'], ['▙', '▛'], ['▟', '▜'], ['▲', '▼'], ['◤', '◣'], ['◥', '◢']].forEach(([a, b]) => { MIR_V[a] = b; MIR_V[b] = a; });
export function mirrorChar(c, horiz){
  if (isBr(c)){
    const b = c.codePointAt(0) - 0x2800; let n = 0;
    for (let r = 0; r < 4; r++) for (let k = 0; k < 2; k++) if (b & DOT[r][k]) n |= horiz ? DOT[r][1 - k] : DOT[3 - r][k];
    return brChar(n);
  }
  return (horiz ? MIR_H : MIR_V)[c] || c;
}
export function flipSelected(horiz){
  if (!sel) return;
  const { x0, y0, x1, y1 } = sel, src = new Map();
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++){ const i = y * doc.cols + x; src.set(i, [doc.chars[i], doc.colors[i]]); }
  setStroke(new Map());
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++){
    const j = horiz ? y * doc.cols + (x0 + x1 - x) : (y0 + y1 - y) * doc.cols + x, [c, col] = src.get(j);
    setCell(y * doc.cols + x, mirrorChar(c, horiz), col);
  }
  endStroke(); say(horiz ? 'Flipped horizontally.' : 'Flipped vertically.');
}
/* main.js creates the menu with initCmenu() and hooks up its click listener. */
let cmenu = null;
export function initCmenu(){
  cmenu = document.createElement('div'); cmenu.id = 'cmenu'; cmenu.hidden = true; cmenu.setAttribute('role', 'menu');
  cmenu.innerHTML = ['copy|Copy|Ctrl+C', 'paste|Paste|Ctrl+V', 'del|Delete|Del', '-', 'fh|Flip horizontal|', 'fv|Flip vertical|'].map(r => {
    if (r === '-') return '<hr>'; const [a, n, k] = r.split('|');
    return '<button type="button" role="menuitem" data-a="' + a + '"><span>' + n + '</span><kbd>' + k + '</kbd></button>';
  }).join('');
  document.body.appendChild(cmenu);
  return cmenu;
}
export const hideMenu = () => { cmenu.hidden = true; };
export function onCanvasContextMenu(e){
  if (tool !== 'select' || fimg) return;                    // a floating image is confirmed or cancelled, not edited from this menu
  menuCell = cellOf(e);
  cmenu.querySelectorAll('button').forEach(b => b.disabled = b.dataset.a !== 'paste' && !sel);
  cmenu.hidden = false;
  cmenu.style.left = Math.min(e.clientX, innerWidth - cmenu.offsetWidth - 6) + 'px'; cmenu.style.top = Math.min(e.clientY, innerHeight - cmenu.offsetHeight - 6) + 'px';
}
export function hideMenuOnOutside(e){ if (!cmenu.contains(e.target)) hideMenu(); }
export function clearSelected(){
  if (!sel) return;
  const lifted = lift(); if (!lifted.length) return;
  setStroke(new Map()); for (const [x, y] of lifted) setCell(y * doc.cols + x, doc.blank, -1); endStroke();
}

export function initSelectEvents(){
cv.addEventListener('pointermove', trackPointerCell);
cv.addEventListener('pointerleave', forgetPointerCell);
document.addEventListener('copy', e => {
  if (tool !== 'select' || !sel || isTyping(document.activeElement) || String(getSelection())) return;
  e.clipboardData.setData('text/plain', selText()); e.preventDefault(); say('Copied.');
});
document.addEventListener('paste', e => {
  if (isTyping(document.activeElement)) return;
  const t = e.clipboardData && e.clipboardData.getData('text/plain'); if (!t) return;
  e.preventDefault(); pasteText(t, null);
});
}
export function initCmenuEvents(){
cmenu.addEventListener('click', e => { const a = e.target.closest('button')?.dataset.a; hideMenu(); if (a === 'copy') copySelected(); else if (a === 'paste') pasteFromMenu(); else if (a === 'del') clearSelected(); else if (a === 'fh') flipSelected(true); else if (a === 'fv') flipSelected(false); });
cv.addEventListener('contextmenu', onCanvasContextMenu);
document.addEventListener('pointerdown', hideMenuOnOutside, true);
window.addEventListener('blur', hideMenu); window.addEventListener('resize', hideMenu);
document.addEventListener('keydown', e => { if (e.key === 'Escape') hideMenu(); }, true);
}
