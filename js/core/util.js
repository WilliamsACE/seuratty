export const $ = s => document.querySelector(s);
export const ESC = '\x1b';
export const MONO = '"JetBrains Mono",ui-monospace,Menlo,Consolas,"DejaVu Sans Mono",monospace';
export const DOT = [[1,8],[2,16],[4,32],[64,128]];       // [row][column] -> braille bit
export const isBr = c => { const n = c.codePointAt(0); return n >= 0x2800 && n <= 0x28FF; };
export const bitsOf = c => isBr(c) ? c.codePointAt(0) - 0x2800 : 0;
export const brChar = b => String.fromCharCode(0x2800 + b);
export const hex = n => n < 0 ? '' : '#' + n.toString(16).padStart(6, '0');
export const parseHex = h => { const m = /^#?([0-9a-f]{6})$/i.exec(h.trim()); return m ? parseInt(m[1], 16) : null; };
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const isBlank = c => c === ' ' || c === '⠀';

export const line = (x0, y0, x1, y1, f) => {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let e = dx + dy;
  for (;;){ f(x0, y0); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy){ e += dy; x0 += sx; } if (e2 <= dx){ e += dx; y0 += sy; } }
};

export const isTyping = t => !!t && (t.isContentEditable || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || (t.tagName === 'INPUT' && !/^(range|checkbox|radio|button|file|color)$/.test(t.type)));

export const kb = t => { const n = t instanceof Blob ? t.size : new Blob([t]).size; return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; };
