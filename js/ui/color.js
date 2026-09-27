import { $, hex, isBlank, parseHex } from '../core/util.js';
import { doc, shown } from '../core/doc.js';

export let curColor = 0x1b98a9;
const recent = [];

function swatch(n, label){
  const b = document.createElement('button'); b.type = 'button'; b.className = 'sw' + (n < 0 ? ' none' : '');
  if (n >= 0) b.style.background = hex(n);
  b.title = n < 0 ? 'No color' : hex(n); b.setAttribute('aria-label', label + ' ' + (n < 0 ? 'no color' : hex(n)));
  b.setAttribute('aria-pressed', String(n === curColor)); b.addEventListener('click', () => setCurColor(n));
  return b;
}
function renderSwatches(){
  const r = $('#recent'); r.textContent = '';
  if (!recent.length) r.innerHTML = '<span class="dim">None yet.</span>';
  recent.forEach(n => r.appendChild(swatch(n, 'Recent')));
  const d = $('#docColors'); d.textContent = '';
  docColors.forEach(n => d.appendChild(swatch(n, 'In drawing')));
}
export function setCurColor(n){
  curColor = n;
  if (n >= 0){ $('#colorPicker').value = hex(n); $('#colorHex').value = hex(n); } else $('#colorHex').value = '';
  $('#noColor').classList.toggle('primary', n < 0);
  document.querySelectorAll('.sw').forEach(b => b.setAttribute('aria-pressed', 'false'));
  renderSwatches();
}
export function addRecent(n){ const k = recent.indexOf(n); if (k >= 0) recent.splice(k, 1); recent.unshift(n); if (recent.length > 10) recent.pop(); renderSwatches(); }
let docColors = [], dcTimer = null;
export function scheduleDocColors(){ clearTimeout(dcTimer); dcTimer = setTimeout(() => {
  const m = new Map();
  for (let i = 0; i < doc.chars.length; i++){ const [ch2, c] = shown(i); if (c > 0 && !isBlank(ch2)) m.set(c, (m.get(c) || 0) + 1); }
  docColors = [...m].sort((a, b) => b[1] - a[1]).slice(0, 14).map(e => e[0]); renderSwatches();
}, 300); }

export function initColor(){
$('#colorPicker').addEventListener('input', e => setCurColor(parseHex(e.target.value)));
$('#colorHex').addEventListener('change', e => { const n = parseHex(e.target.value); if (n !== null) setCurColor(n); else setCurColor(curColor); });
$('#noColor').addEventListener('click', () => setCurColor(-1));
}
