import { $ } from './core/util.js';
import { doc, setDoc, bind, normDoc } from './core/doc.js';
import { drawCell, fullRedraw, relayout, fit } from './render/canvas.js';
import { clearSel, commitPaste, cancelPaste, pend } from './tools/select.js';
import { fimg } from './tools/floatimg.js';
import { renderLayers } from './layers.js';
import { curColor, addRecent, scheduleDocColors } from './ui/color.js';
import { tool } from './tools/tools.js';
import { scheduleSave } from './io/save.js';

/* ---------- History ---------- */
export const undoStack = [], redoStack = [];
export const snap = () => ({ cols: doc.cols, rows: doc.rows, blank: doc.blank, active: doc.active,
  layers: doc.layers.map(L => ({ id: L.id, name: L.name, visible: L.visible, chars: L.chars.slice(), colors: L.colors.slice() })) });
export const layerById = id => doc.layers.find(L => L.id === id);
export const setStroke = s => { stroke = s; };
export let stroke = null, histSeq = 0;
export function pushHist(e){ histSeq++; undoStack.push(e); if (undoStack.length > 120) undoStack.shift(); redoStack.length = 0; updHist(); }
export function updHist(){ $('#undo').disabled = !undoStack.length; $('#redo').disabled = !redoStack.length; scheduleSave(); }
export function setCell(i, c, col){
  if (doc.chars[i] === c && doc.colors[i] === col) return;
  if (stroke && !stroke.has(i)) stroke.set(i, [doc.chars[i], doc.colors[i]]);
  doc.chars[i] = c; doc.colors[i] = col; drawCell(i);
}
export function endStroke(){
  if (stroke && stroke.size){
    pushHist({ layer: doc.layers[doc.active].id, cells: [...stroke].map(([i, [oc, ol]]) => [i, oc, ol, doc.chars[i], doc.colors[i]]) });
    if ((tool === 'dots' || tool === 'stamp' || tool === 'recolor') && curColor >= 0) addRecent(curColor);
    scheduleDocColors();
  }
  stroke = null;
}
export function loadSnap(s){
  const cur = new Map(doc.layers.map(L => [L.id, L]));       // the name and the visibility are not undone
  setDoc(bind({ cols: s.cols, rows: s.rows, blank: s.blank, active: s.active, layers: s.layers.map(L => {
    const c = cur.get(L.id);
    return { id: L.id, name: c ? c.name : L.name, visible: c ? c.visible : L.visible, chars: L.chars.slice(), colors: L.colors.slice() };
  }) }));
  clearSel(); relayout(); renderLayers(); scheduleDocColors();
}
export function replaceDoc(next, refit, name){
  commitPaste();
  const before = snap(); setDoc(normDoc(next, name)); pushHist({ snap: true, before, after: snap() }); clearSel();
  if (refit) fit(); else relayout(); renderLayers(); scheduleDocColors();
}
export function undo(){
  if (pend || fimg){ cancelPaste(); return; }
  const e = undoStack.pop(); if (!e) return; redoStack.push(e);
  if (e.snap) loadSnap(e.before); else { const L = layerById(e.layer); if (L) for (const [i, oc, ol] of e.cells){ L.chars[i] = oc; L.colors[i] = ol; drawCell(i); } clearSel(); scheduleDocColors(); }
  updHist();
}
export function redo(){
  if (pend || fimg) return;
  const e = redoStack.pop(); if (!e) return; undoStack.push(e);
  if (e.snap) loadSnap(e.after); else { const L = layerById(e.layer); if (L) for (const [i, , , nc, nl] of e.cells){ L.chars[i] = nc; L.colors[i] = nl; drawCell(i); } clearSel(); scheduleDocColors(); }
  updHist();
}

