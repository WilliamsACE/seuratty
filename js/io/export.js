import { $, ESC, kb, isBlank } from '../core/util.js';
import { doc, shown } from '../core/doc.js';
import { cw, ch, setCellSize, glyph, bgColor } from '../render/canvas.js';
import { block } from '../tools/text.js';
import { commitPaste } from '../tools/select.js';
import { serialize } from './save.js';
import { say } from '../ui/status.js';

/* ---------- Export ---------- */
const sgrTrue = n => ESC + '[38;2;' + ((n >> 16) & 255) + ';' + ((n >> 8) & 255) + ';' + (n & 255) + 'm';
export function buildExport(fmt){
  const out = [];
  for (let r = 0; r < doc.rows; r++){
    let s = '', cur = -1;
    for (let c = 0; c < doc.cols; c++){
      const [chr, col] = shown(r * doc.cols + c);
      if (fmt === 'plain') s += chr;
      else if (fmt === 'per') s += (col < 0 ? ESC + '[0m' : sgrTrue(col)) + chr;
      else {
        if (col !== cur && !isBlank(chr)){ s += col < 0 ? ESC + '[0m' : sgrTrue(col); cur = col; }
        s += chr;
      }
    }
    if (fmt === 'per' || (fmt === 'compact' && cur >= 0)) s += ESC + '[0m';
    out.push(s);
  }
  return out.join('\n') + '\n';
}
/* main.js creates the flash notice with initFlash(), where it used to be created. */
let flashEl = null;
export function initFlash(){
  flashEl = document.createElement('div'); flashEl.id = 'flash'; flashEl.setAttribute('role', 'status'); document.body.appendChild(flashEl);
  return flashEl;
}
let flashTimer = 0;
function flash(btn, text){
  const r = btn.getBoundingClientRect(); flashEl.textContent = text;
  flashEl.style.left = r.left + r.width / 2 + 'px'; flashEl.style.top = r.top - 8 + 'px'; flashEl.classList.add('on');
  clearTimeout(flashTimer); flashTimer = setTimeout(() => flashEl.classList.remove('on'), 1200);
}
export async function copyText(t, ok, btn){
  let done = false;
  try { await navigator.clipboard.writeText(t); done = true; }
  catch {                                   // no clipboard permission: copy through an invisible temporary field
    const a = document.createElement('textarea'); a.value = t; a.setAttribute('readonly', ''); a.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(a); a.select();
    try { done = document.execCommand('copy'); } catch {}
    a.remove();
  }
  if (done){ say(ok); if (btn) flash(btn, 'Copied'); } else say('Copy failed. Use Save instead.');
}
export function onCopyLineClick(){
  if (!block.h){ say('Type some text first.'); return; }
  const out = block.rows.map(row => {
    let s = '', cur = -1;
    for (const cell of row){
      if (!cell){ s += ' '; continue; }
      if (cell[0] !== ' ' && cell[1] !== cur){ s += sgrTrue(cell[1]); cur = cell[1]; }
      s += cell[0];
    }
    return s + (cur >= 0 ? ESC + '[0m' : '');
  }).join('\n');
  copyText(out, 'ANSI text copied.', $('#copyLine'));
}
export function syncGrad(){
  const one = $('#gMode').value === 'solid';
  $('#gB').style.display = one ? 'none' : ''; $('#gA').setAttribute('aria-label', one ? 'Color' : 'Start color');
}
/* initDownloads() resolves it; main.js calls it where the async IIFE used to be. */
let downloads = null;
export function initDownloads(){
  (async () => { try { downloads = window.claude && await window.claude.use('downloads'); } catch { downloads = null; } })();
}
export function browserDownload(data, name = 'art.txt'){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type: 'text/plain;charset=utf-8' })); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
export async function onSaveClick(){
  if ($('#fmt').value === 'project'){ saveProject(); return; }
  const t = buildExport($('#fmt').value);
  if (downloads){
    try { await downloads.save({ filename: 'art.txt', data: t }); say('Saved (' + kb(t) + ').'); return; }
    catch (e){ if (e && e.code === 'declined'){ say('Save canceled.'); return; } }
  }
  try { browserDownload(t); say('Saved art.txt (' + kb(t) + ').'); } catch { say('Could not save. Use Copy.'); }
}
/* PNG: the visible drawing at 2× (16 × 32 px per cell), with or without the background color */
export function renderPng(transp){
  const oc = cw, oh = ch, S = doc.cols * doc.rows > 60000 ? 1.5 : 2;
  setCellSize(8 * S, 16 * S);
  try {
    const c = document.createElement('canvas'); c.width = Math.round(doc.cols * cw); c.height = Math.round(doc.rows * ch);
    const g = c.getContext('2d');
    if (!transp){ g.fillStyle = bgColor; g.fillRect(0, 0, c.width, c.height); }
    for (let i = 0; i < doc.cols * doc.rows; i++){
      const [chr, col] = shown(i); if (isBlank(chr)) continue;
      const x = (i % doc.cols) * cw, y = Math.floor(i / doc.cols) * ch;
      g.save(); g.beginPath(); g.rect(x, y, cw, ch); g.clip(); glyph(g, x, y, chr, col, false); g.restore();
    }
    return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('png')), 'image/png'));
  } finally { setCellSize(oc, oh); }
}
export async function saveProject(){
  commitPaste(); const t = serialize();
  if (downloads){
    try { await downloads.save({ filename: 'art.seuratty', data: t }); say('Project saved (' + kb(t) + ').'); return; }
    catch (e){ if (e && e.code === 'declined'){ say('Save canceled.'); return; } }
  }
  try { browserDownload(new Blob([t], { type: 'application/json' }), 'art.seuratty'); say('Saved art.seuratty (' + kb(t) + ').'); } catch { say('Could not save the project.'); }
}
export async function onSavePngClick(){
  let blob; say('Rendering PNG…');
  try { blob = await renderPng($('#pngTransp').checked); } catch { say('Could not create the PNG.'); return; }
  const size = kb(blob) ;
  if (downloads){
    try { await downloads.save({ filename: 'art.png', data: blob }); say('Saved art.png (' + size + ').'); return; }
    catch (e){ if (e && e.code === 'declined'){ say('Save canceled.'); return; } }
  }
  try { browserDownload(blob, 'art.png'); say('Saved art.png (' + size + ').'); } catch { say('Could not save the PNG.'); }
}

export function initExportTop(){
$('#fmt').addEventListener('change', () => { $('#copy').disabled = $('#fmt').value === 'project'; });
$('#copy').addEventListener('click', () => { const t = buildExport($('#fmt').value); copyText(t, 'Copied (' + kb(t) + ').', $('#copy')); });
$('#copyLine').addEventListener('click', onCopyLineClick);
}
export function initExportBottom(){
  initFlash();
  initDownloads();
$('#save').addEventListener('click', onSaveClick);
$('#savePng').addEventListener('click', onSavePngClick);
}
