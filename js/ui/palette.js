import { $, DOT, isBr, bitsOf, brChar } from '../core/util.js';
import { tool, setTool } from '../tools/tools.js';

export let curChar = '⣿';
export let customChars = [];

export function buildBuilder(){
  const box = $('#builder');
  for (let j = 0; j < 4; j++) for (let k = 0; k < 2; k++){
    const b = document.createElement('button'); b.type = 'button'; b.dataset.mask = DOT[j][k];
    b.setAttribute('aria-label', 'Dot ' + (j + 1) + ', column ' + (k + 1)); b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => { setCurChar(brChar(bitsOf(curChar) ^ DOT[j][k])); });
    box.appendChild(b);
  }
}
export function setCurChar(c){
  curChar = c;
  $('#curGlyph').textContent = c === ' ' ? '␣' : c;
  const cp = c.codePointAt(0);
  $('#curGlyph').classList.toggle('sm', cp >= 0x2580 && cp <= 0x259F);
  $('#curCode').textContent = 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');
  $('#curName').textContent = isBr(c) ? 'braille · ' + bitsOf(c).toString(2).padStart(8, '0') : 'character';
  document.querySelectorAll('#palette .chip').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.c === c)));
  const bits = bitsOf(c);
  document.querySelectorAll('#builder button').forEach(b => b.setAttribute('aria-pressed', String(!!(bits & Number(b.dataset.mask)))));
}

const GROUPS = [
  ['Braille, dense to sparse', [...'⣿⣾⣷⣶⣦⣤⣴⣠⣄⣀⡀⢀⠿⠟⠛⠋⠉⠁⠂⠄⠐⠠⡿⢿⣻⣽⣟⣯⡇⢸⠸⠇⣇⣸⡏⢹']],
  ['Blocks', [...'█▓▒░▀▄▌▐▖▗▘▝▚▞■▪']],
  ['ASCII', [...'.:-=+*#%@/\\|_\'`^~oO0']],
  ['Blank', ['⠀', ' ']]
];
function chipLabel(c){ return c === '⠀' ? 'blank braille' : c === ' ' ? 'space' : null; }
export function renderPalette(){
  const box = $('#palette'); box.textContent = '';
  const groups = GROUPS.slice(); if (customChars.length) groups.splice(3, 0, ['My characters', customChars]);
  for (const [name, list] of groups){
    const g = document.createElement('div'); g.className = 'grp';
    g.innerHTML = '<h3></h3><div class="chips"></div>'; g.firstChild.textContent = name;
    const chips = g.lastChild;
    for (const c of list){
      const b = document.createElement('button'); b.type = 'button'; b.className = name === 'Blocks' ? 'chip sm' : 'chip';
      const lab = chipLabel(c); b.textContent = lab || c; if (lab) b.classList.add('wide');
      b.setAttribute('aria-label', 'Character U+' + c.codePointAt(0).toString(16).toUpperCase());
      b.setAttribute('aria-pressed', String(c === curChar)); b.dataset.c = c;
      b.addEventListener('click', () => { setCurChar(c); if (tool === 'hand' || tool === 'pick') setTool('stamp'); });
      chips.appendChild(b);
    }
    box.appendChild(g);
  }
}

export function initPalette(){
$('#addChars').addEventListener('click', () => {
  for (const c of $('#custom').value) if (c.trim() !== '' && !customChars.includes(c)) customChars.push(c);
  renderPalette(); const f = [...$('#custom').value].find(c => c.trim() !== ''); if (f) setCurChar(f);
  $('#custom').value = '';
});
$('#custom').addEventListener('keydown', e => { if (e.key === 'Enter') $('#addChars').click(); });
}
