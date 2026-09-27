import { ESC, isBr } from './util.js';

/* ---------- ANSI parsing ---------- */
const BASIC = [0x000000,0xcd0000,0x00cd00,0xcdcd00,0x0000ee,0xcd00cd,0x00cdcd,0xe5e5e5,0x7f7f7f,0xff0000,0x00ff00,0xffff00,0x5c5cff,0xff00ff,0x00ffff,0xffffff];
function c256(n){
  if (n < 16) return BASIC[n];
  if (n < 232){ n -= 16; const f = v => v ? 55 + v * 40 : 0; return (f(Math.floor(n/36)) << 16) | (f(Math.floor(n/6) % 6) << 8) | f(n % 6); }
  const g = 8 + (n - 232) * 10; return (g << 16) | (g << 8) | g;
}
function sgr(p, cur){
  const a = p === '' ? [0] : p.split(';').map(Number);
  for (let k = 0; k < a.length; k++){
    const v = a[k];
    if (v === 0 || v === 39) cur = -1;
    else if (v >= 30 && v <= 37) cur = BASIC[v - 30];
    else if (v >= 90 && v <= 97) cur = BASIC[v - 90 + 8];
    else if (v === 38){
      if (a[k+1] === 2){ cur = ((a[k+2] & 255) << 16) | ((a[k+3] & 255) << 8) | (a[k+4] & 255); k += 4; }
      else if (a[k+1] === 5){ cur = c256(a[k+2] & 255); k += 2; }
    } else if (v === 48){ if (a[k+1] === 2) k += 4; else if (a[k+1] === 5) k += 2; }
  }
  return cur;
}
export function parseText(text){
  text = text.replace(/\r\n?/g, '\n')
    .replace(/\^\[(?=\[)/g, ESC)
    .replace(/\\(?:x1b|033|e|u001b)(?=\[)/gi, ESC)
    .replace(/(?<!\x1b)\[(\d{1,3}(?:;\d{1,3})*)m/g, ESC + '[$1m')
    .replace(/\x1b\[[0-9;?]*[A-Za-ln-z]/g, '');
  const lines = text.split('\n');
  while (lines.length && lines[lines.length-1] === '') lines.pop();
  const re = /\x1b\[([0-9;]*)m/g;
  const grid = []; let cols = 0, braille = 0, total = 0;
  for (const line of lines){
    const row = []; let cur = -1, last = 0, m; re.lastIndex = 0;
    const push = s => { for (const c of s){ row.push([c, cur]); if (isBr(c)) braille++; total++; } };
    while ((m = re.exec(line))){ push(line.slice(last, m.index)); cur = sgr(m[1], cur); last = re.lastIndex; }
    push(line.slice(last));
    grid.push(row); if (row.length > cols) cols = row.length;
  }
  const rows = grid.length;
  if (!rows || !cols) return null;
  if (cols * rows > 250000) return { error: 'Drawing is too big (' + cols + '×' + rows + ').' };
  const blank = braille > total / 2 ? '⠀' : ' ';
  const chars = new Array(cols * rows), colors = new Int32Array(cols * rows).fill(-1);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++){
    const cell = grid[r][c], i = r * cols + c;
    if (cell){ chars[i] = cell[0]; colors[i] = cell[1]; } else chars[i] = blank;
  }
  return { cols, rows, chars, colors, blank };
}
