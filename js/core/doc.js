import { isBlank } from './util.js';

/* ---------- State ---------- */
export let doc = { cols: 0, rows: 0, chars: [], colors: new Int32Array(0), blank: '⠀', layers: [], active: 0 };
/* Layers: doc.chars and doc.colors always point at the active layer (tools only edit that one).
   What is shown and exported is the composite of the visible layers: the topmost one with a non-blank character wins. */
export const setDoc = d => { doc = d; };
let layerSeq = 0;
export const mkLayer = (name, chars, colors) => ({ id: ++layerSeq, name, visible: true, chars, colors });
export const bind = d => { const L = d.layers[d.active]; d.chars = L.chars; d.colors = L.colors; return d; };
export function normDoc(d, name){
  if (!d.layers){ d.layers = [mkLayer(name || 'Layer 1', d.chars, d.colors)]; d.active = 0; }
  return bind(d);
}
export function topLayer(i){
  for (let k = doc.layers.length - 1; k >= 0; k--){ const L = doc.layers[k]; if (L.visible && !isBlank(L.chars[i])) return L; }
  return null;
}
export function shown(i){
  const A = doc.layers[doc.active], L = topLayer(i) || (A.visible ? A : null);
  return L ? [L.chars[i], L.colors[i]] : [doc.blank, -1];
}
