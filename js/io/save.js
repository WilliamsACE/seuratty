import { $, clamp } from '../core/util.js';
import { doc, mkLayer, bind } from '../core/doc.js';
import { bgColor, setBgColor } from '../render/canvas.js';
import { commitPaste } from '../tools/select.js';
import { say } from '../ui/status.js';

/* ---------- Autosave (in this browser) ---------- */
export const SAVE_KEY = 'seuratty.work.v1', MOB_KEY = 'seuratty.mobileNote';
export const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } }
};
function packColors(a){                          // [color, repeats, color, repeats, …]
  const out = [];
  for (let i = 0; i < a.length;){ let j = i + 1; while (j < a.length && a[j] === a[i]) j++; out.push(a[i], j - i); i = j; }
  return out;
}
export function serialize(){
  return JSON.stringify({ v: 1, cols: doc.cols, rows: doc.rows, blank: doc.blank, active: doc.active, bg: bgColor,
    layers: doc.layers.map(L => {
      const one = L.chars.every(c => c.length === 1 || (c.length === 2 && c.codePointAt(0) > 0xffff));
      return { name: L.name, visible: L.visible, chars: one ? L.chars.join('') : L.chars, colors: packColors(L.colors) };
    }) });
}
export function restore(){ const raw = store.get(SAVE_KEY); return raw ? parseProject(raw) : null; }
export function parseProject(raw){
  try {
    const d = JSON.parse(raw), n = d.cols * d.rows;
    if (d.v !== 1 || !(d.cols >= 1 && d.cols <= 400 && d.rows >= 1 && d.rows <= 200) || !Array.isArray(d.layers) || !d.layers.length) return null;
    const layers = d.layers.slice(0, 10).map((L, k) => {
      const chars = Array.isArray(L.chars) ? L.chars.map(String) : Array.from(String(L.chars));
      const colors = new Int32Array(n); let p = 0;
      for (let i = 0; i + 1 < L.colors.length; i += 2){ colors.fill(L.colors[i] | 0, p, p + L.colors[i + 1]); p += L.colors[i + 1]; }
      if (chars.length !== n || p !== n) throw new Error('size');
      const ly = mkLayer(String(L.name || 'Layer ' + (k + 1)).slice(0, 30), chars, colors); ly.visible = L.visible !== false; return ly;
    });
    if (typeof d.bg === 'string' && /^#[0-9a-f]{6}$/i.test(d.bg)){ setBgColor(d.bg); $('#bg').value = d.bg; }
    return bind({ cols: d.cols, rows: d.rows, blank: d.blank === ' ' ? ' ' : '⠀', active: clamp(d.active | 0, 0, layers.length - 1), layers });
  } catch { return null; }
}

let saveTimer = 0, dirty = false, saveWarned = false, booted = false;
/* The boot block writes these from outside: it marks the boot as done and
   cancels the save that updHist() has just scheduled. */
export const setBooted = v => { booted = v; };
export const setDirty = v => { dirty = v; };
export const clearSaveTimer = () => { clearTimeout(saveTimer); };
export function saveNow(){
  commitPaste(false);                              // a floating image is not autosaved, only fixed by a real confirm gesture
  clearTimeout(saveTimer); saveTimer = 0;
  if (!dirty || !booted) return; dirty = false;
  if (!store.set(SAVE_KEY, serialize()) && !saveWarned){ saveWarned = true; say('Autosave failed: browser storage is full or blocked.'); }
}
export function scheduleSave(){ if (!booted) return; dirty = true; clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 800); }

export function initAutosave(){
window.addEventListener('pagehide', saveNow);
window.addEventListener('beforeunload', saveNow);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
}
