import { $, isBr, isBlank } from '../core/util.js';
import { doc } from '../core/doc.js';
import { cw, ch, dpr, glyph, canvasBg } from '../render/canvas.js';

/* ---------- Floating image ----------
   A converted image waits here before it is fixed into a layer. The temporary "Pasted" layer of a
   paste is only cols × rows, so it cannot hold a cell that hangs outside the canvas while the image
   is dragged; this buffer keeps every cell of the image, with its own origin (x, y), and those
   cells are still there when it comes back in. x and y may be negative. */
export let fimg = null;                                 // { w, h, x, y, chars, colors, blank }
/* main.js creates the overlay with initFimg(), next to the floating canvas of the selection. */
let fi = null;
export function initFimg(){
  fi = document.createElement('canvas'); fi.id = 'fimg'; fi.hidden = true; fi.setAttribute('aria-hidden', 'true');
  $('#wrap').appendChild(fi);
  return fi;
}
export function makeFimg(d, x, y){ fimg = { w: d.cols, h: d.rows, x, y, chars: d.chars, colors: d.colors, blank: d.blank }; }
export function moveFimg(x, y){ if (fimg){ fimg.x = x; fimg.y = y; } }
export function dropFimg(){ fimg = null; if (fi) fi.hidden = true; }
export const overFimg = (x, y) => !!fimg && x >= fimg.x && x < fimg.x + fimg.w && y >= fimg.y && y < fimg.y + fimg.h;
/* Rectangle the image covers on the canvas, or null if none of it is inside. */
export function fimgSel(){
  if (!fimg) return null;
  const x0 = Math.max(0, fimg.x), y0 = Math.max(0, fimg.y);
  const x1 = Math.min(doc.cols - 1, fimg.x + fimg.w - 1), y1 = Math.min(doc.rows - 1, fimg.y + fimg.h - 1);
  return x1 < x0 || y1 < y0 ? null : { x0, y0, x1, y1 };
}
/* The whole image is painted on the overlay, over an opaque background and without being cropped:
   what the user drags is already what confirming will leave behind, layers below included. */
export function drawFimg(){
  if (!fi) return;
  if (!fimg){ fi.hidden = true; return; }
  const { w, h, x, y } = fimg;
  const fd = Math.max(.25, Math.min(dpr, Math.sqrt(1.6e7 / (w * cw * h * ch))));
  fi.width = Math.max(1, Math.round(w * cw * fd)); fi.height = Math.max(1, Math.round(h * ch * fd));
  fi.style.width = w * cw + 'px'; fi.style.height = h * ch + 'px';
  fi.style.left = x * cw + 'px'; fi.style.top = y * ch + 'px';
  const g = fi.getContext('2d');
  g.setTransform(fd, 0, 0, fd, 0, 0);
  g.fillStyle = canvasBg(); g.fillRect(0, 0, w * cw, h * ch);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++){
    const k = r * w + c, chr = fimg.chars[k];
    if (isBlank(chr)) continue;
    const px = c * cw, py = r * ch, text = !isBr(chr);
    g.save(); g.setTransform(fd, 0, 0, fd, 0, 0);
    if (text){ g.beginPath(); g.rect(px, py, cw, ch); g.clip(); }
    glyph(g, px, py, chr, fimg.colors[k], false); g.restore();
  }
  fi.hidden = false;
}
/* Writes into L the part of the image that falls inside the canvas, replacing every cell it covers:
   the blank cells of the image erase as well, so the result is the image and not a mix with what
   was below. Whatever falls outside is cropped, the same way a paste is. */
export function stampFimg(L){
  if (!fimg) return 0;
  let n = 0;
  for (let r = 0; r < fimg.h; r++) for (let c = 0; c < fimg.w; c++){
    const x = fimg.x + c, y = fimg.y + r;
    if (x < 0 || y < 0 || x >= doc.cols || y >= doc.rows) continue;
    const k = r * fimg.w + c, i = y * doc.cols + x, chr = fimg.chars[k], b = isBlank(chr);
    L.chars[i] = b ? doc.blank : chr; L.colors[i] = b ? -1 : fimg.colors[k];
    if (!b) n++;
  }
  return n;
}
