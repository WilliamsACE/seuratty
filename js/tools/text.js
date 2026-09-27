import { $, MONO, hex, parseHex, clamp } from '../core/util.js';
import { doc } from '../core/doc.js';
import { cw, ch, dpr, pv, pctx, pvRect, setPvRect, canvasBg, drawCell } from '../render/canvas.js';
import { setCell, stroke } from '../history.js';
import { tool, hoverCell } from './tools.js';
import { syncGrad } from '../io/export.js';
import { say } from '../ui/status.js';
import { FONTS } from '../fonts.js';

/* Text with FIGlet fonts: it builds a block of [character, color] cells (or null when transparent) */
/* FONTS is re-exported from fonts.js, which fills it by fetch before the boot. */
export { FONTS };
export const FIG = window.__figlet, figLoaded = new Set();
const rgb = h => { const n = parseHex(h) ?? 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export function figLines(font = $('#font').value, layout = $('#layout').value, text = $('#txt').value){
  if (!text) return [];
  if (!font || !FIG || !FONTS[font]) return [text];
  try {
    if (!figLoaded.has(font)){ FIG.parseFont(font, FONTS[font]); figLoaded.add(font); }
    const lines = FIG.textSync(text, { font, horizontalLayout: layout }).split('\n');
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    while (lines.length && !lines[0].trim()) lines.shift();
    return lines.length ? lines : [text];
  } catch { return [text]; }
}
export let block = { rows: [], w: 0, h: 0 };
export function buildBlock(){ block = makeBlock(figLines()); }
export function makeBlock(lines0){
  const lines = lines0.map(l => [...l]);
  const w = Math.max(0, ...lines.map(l => l.length)), transp = $('#tTransp').checked, mode = $('#gMode').value;
  const a = rgb($('#gA').value), b = rgb($('#gB').value);
  const rows = lines.map(l => {
    const r = [];
    for (let x = 0; x < w; x++){
      const c = l[x] ?? ' ';
      if (c === ' ' && transp){ r.push(null); continue; }
      const t = mode === 'solid' || w < 2 ? 0 : mode === 'lin' ? x / (w - 1) : 1 - Math.abs(2 * x / (w - 1) - 1);
      const [rr, gg, bb] = a.map((v, k) => Math.round(v + (b[k] - v) * t));
      r.push([c, (rr << 16) | (gg << 8) | bb]);
    }
    return r;
  });
  return { rows, w, h: rows.length };
}
export function renderPreview(){ renderInto($('#txtPrev'), block); }
export function renderInto(pre, blk){
  pre.textContent = '';
  const frag = document.createDocumentFragment();
  for (const row of blk.rows){
    let run = '', runCol = null;
    const flush = () => { if (!run) return; const s = document.createElement('span'); s.textContent = run; if (runCol !== null) s.style.color = hex(runCol); frag.appendChild(s); run = ''; };
    for (const cell of row){
      const c = cell ? cell[0] : ' ', col = cell ? cell[1] : null;
      if (c !== ' ' && col !== runCol){ flush(); runCol = col; }
      run += c;
    }
    flush(); frag.appendChild(document.createTextNode('\n'));
  }
  pre.appendChild(frag);
}
export function clearPreview(){
  if (pvRect){ pctx.save(); pctx.setTransform(1, 0, 0, 1, 0, 0); pctx.clearRect(0, 0, pv.width, pv.height); pctx.restore(); setPvRect(null); }
}
/* Preview on the canvas: draws the block just as it would land, with the background of the cells it replaces */
export function drawPreview(cx, cy){
  clearPreview();
  if (tool !== 'text' || !block.h) return;
  pctx.font = Math.round(ch * .85) + 'px ' + MONO; pctx.textAlign = 'center'; pctx.textBaseline = 'middle';
  const d = dpr, R = v => Math.round(v * d) / d;
  block.rows.forEach((row, r) => {
    const y = cy + r; if (y >= doc.rows) return;
    row.forEach((cell, k) => {
      const x = cx + k; if (!cell || x >= doc.cols) return;
      const X0 = R(x * cw), Y0 = R(y * ch), X1 = R((x + 1) * cw), Y1 = R((y + 1) * ch);
      pctx.save(); pctx.beginPath(); pctx.rect(X0, Y0, X1 - X0, Y1 - Y0); pctx.clip();
      pctx.fillStyle = canvasBg(); pctx.fillRect(X0, Y0, X1 - X0, Y1 - Y0);
      if (cell[0] !== ' '){ pctx.fillStyle = hex(cell[1]); pctx.fillText(cell[0], x * cw + cw / 2, y * ch + ch / 2 + ch * .05); }
      pctx.restore();
    });
  });
  setPvRect([cx * cw, cy * ch, Math.min(block.w, doc.cols - cx) * cw, Math.min(block.h, doc.rows - cy) * ch]);
}
export function refreshText(){ buildBlock(); renderPreview(); if (hoverCell && tool === 'text') drawPreview(hoverCell[0], hoverCell[1]); }
export function fillFontSelect(sel){
  const s = $('#font'); s.textContent = '';
  s.add(new Option('No font (single line)', ''));
  Object.keys(FONTS).sort((a, b) => a.localeCompare(b)).forEach(n => s.add(new Option(n, n)));
  s.value = sel; buildFontList(); syncFontUI();
}
/* Font picker: hovering (or moving with the arrow keys) over each option shows a preview */
/* Font picker: hovering (or moving with the arrow keys) over each option shows a preview */
/* main.js creates the dropdown with initFontPop(), where it used to be created. */
let pop = null, fprev = null, flist = null, fbtn = null;
export function initFontPop(){
  pop = document.createElement('div');
  pop.className = 'fpop'; pop.hidden = true;
  pop.innerHTML = '<pre class="fprev" aria-hidden="true"></pre><div class="flist" role="listbox" aria-label="Fonts"></div>';
  document.body.appendChild(pop);
  fprev = pop.querySelector('.fprev'); flist = pop.querySelector('.flist'); fbtn = $('#fontBtn');
  return { pop, fbtn };
}
export function buildFontList(){
  flist.textContent = '';
  for (const o of $('#font').options){
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'fitem'; b.dataset.v = o.value; b.textContent = o.text; b.setAttribute('role', 'option');
    b.addEventListener('mouseenter', () => showFontPreview(o.value));
    b.addEventListener('focus', () => showFontPreview(o.value));
    b.addEventListener('click', () => pickFont(o.value));
    flist.appendChild(b);
  }
}
export function syncFontUI(){
  const s = $('#font');
  fbtn.querySelector('span').textContent = s.options[s.selectedIndex] ? s.options[s.selectedIndex].text : '';
  flist.querySelectorAll('.fitem').forEach(b => b.setAttribute('aria-selected', String(b.dataset.v === s.value)));
}
export function showFontPreview(v){ renderInto(fprev, makeBlock(figLines(v, $('#layout').value, $('#txt').value || '@Bluedot'))); }
export function pickFont(v){ const s = $('#font'); s.value = v; s.dispatchEvent(new Event('change')); closeFontPop(); fbtn.focus(); }
export function openFontPop(){
  const r = fbtn.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight;
  const width = Math.min(Math.max(r.width, 300), vw - 16);
  pop.style.width = width + 'px'; pop.style.left = clamp(r.left, 8, vw - width - 8) + 'px';
  const below = vh - r.bottom - 12, above = r.top - 12;
  if (below >= 300 || below >= above){ pop.style.top = (r.bottom + 4) + 'px'; pop.style.bottom = 'auto'; pop.style.maxHeight = Math.min(380, below) + 'px'; }
  else { pop.style.bottom = (vh - r.top + 4) + 'px'; pop.style.top = 'auto'; pop.style.maxHeight = Math.min(380, above) + 'px'; }
  pop.hidden = false; popOpenedAt = performance.now(); fbtn.setAttribute('aria-expanded', 'true');
  showFontPreview($('#font').value);
  const sel = flist.querySelector('[aria-selected="true"]'); if (sel) flist.scrollTop = sel.offsetTop - flist.clientHeight / 2;
}
export function closeFontPop(){ pop.hidden = true; fbtn.setAttribute('aria-expanded', 'false'); }
let popOpenedAt = 0;
export function placeText(cx, cy){
  if (stroke){
    for (const [i, [oc, ol]] of stroke){ doc.chars[i] = oc; doc.colors[i] = ol; drawCell(i); }
    stroke.clear();
  }
  block.rows.forEach((row, r) => {
    const y = cy + r; if (y >= doc.rows) return;
    row.forEach((cell, k) => { if (cell && cx + k < doc.cols) setCell(y * doc.cols + cx + k, cell[0], cell[1]); });
  });
}

/* These listeners use flist and popOpenedAt, private to the module. */
export function initFontPopEvents(){
fbtn.addEventListener('click', () => pop.hidden ? openFontPop() : closeFontPop());
fbtn.addEventListener('keydown', e => {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  e.preventDefault(); if (pop.hidden) openFontPop();
  (flist.querySelector('[aria-selected="true"]') || flist.firstChild).focus();
});
pop.addEventListener('keydown', e => {
  const items = [...flist.children], i = items.indexOf(document.activeElement);
  if (e.key === 'ArrowDown'){ e.preventDefault(); items[Math.min(items.length - 1, i + 1)].focus(); }
  else if (e.key === 'ArrowUp'){ e.preventDefault(); items[Math.max(0, i - 1)].focus(); }
  else if (e.key === 'Escape'){ e.preventDefault(); closeFontPop(); fbtn.focus(); }
});
document.addEventListener('pointerdown', e => { if (!pop.hidden && !pop.contains(e.target) && !fbtn.contains(e.target)) closeFontPop(); });
document.addEventListener('scroll', e => { if (!pop.hidden && !pop.contains(e.target) && performance.now() - popOpenedAt > 300) closeFontPop(); }, true);
window.addEventListener('resize', closeFontPop);
}
export function initTextPanel(){
['#txt', '#gA', '#gB'].forEach(s => $(s).addEventListener('input', refreshText));
$('#font').addEventListener('change', syncFontUI);
$('#gMode').addEventListener('change', syncGrad);
['#font', '#layout', '#gMode', '#tTransp'].forEach(s => $(s).addEventListener('change', refreshText));
$('#fontFile').addEventListener('change', e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    const name = f.name.replace(/\.flf$/i, '');
    try { FIG.parseFont(name, String(r.result)); FONTS[name] = String(r.result); figLoaded.add(name); fillFontSelect(name); refreshText(); say('Font loaded: ' + name + '.'); }
    catch { say('Invalid font. Use a FIGlet .flf file.'); }
  };
  r.onerror = () => say('Could not read the file.'); r.readAsText(f);
});
}
