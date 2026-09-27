import { $, clamp, isBr, isBlank } from './core/util.js';
import { doc } from './core/doc.js';
import { insertFloatImage, fimgPending } from './tools/select.js';
import { say } from './ui/status.js';

/* ---------- Image to ASCII ---------- */
/* Presets, brightness ramp, Sobel angles and Canny edges: JS port of asciify-them (see license notice at the end of the file). */
const IMG_PRESETS = {"braille": "⠀⣀⣄⣤⣦⣶⣷⣿", "default": " .-=+*x#$&X@", "classic": " .':;il!i><+?-)(ItfjxnoC00@", "extended": "…^‚:;Il!i><v+_—?1[ł{1)(|/tfjrxnuvczXYUJCLQØ0Zmwqpdbkhао*#МW&8⅝В@$", "blocks": " ░▒▓█"};
const bounce = (i, n) => { if (n === 1) return 0; while (i < 0 || i >= n) i = i < 0 ? -i : 2 * n - 2 - i; return i; };   // BORDER_REFLECT_101
const clampIdx = (i, n) => i < 0 ? 0 : i >= n ? n - 1 : i;                                                          // BORDER_REPLICATE
export function grayOf(px, n){
  const g = new Uint8Array(n);
  for (let i = 0; i < n; i++) g[i] = Math.round((.299 * px[i * 4] + .587 * px[i * 4 + 1] + .114 * px[i * 4 + 2]) * px[i * 4 + 3] / 255);
  return g;
}
export function sobel3(g, w, h, edge){
  const gx = new Float64Array(w * h), gy = new Float64Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){
    const p = (dy, dx) => g[edge(y + dy, h) * w + edge(x + dx, w)];
    gx[y * w + x] = (p(-1, 1) + 2 * p(0, 1) + p(1, 1)) - (p(-1, -1) + 2 * p(0, -1) + p(1, -1));
    gy[y * w + x] = (p(1, -1) + 2 * p(1, 0) + p(1, 1)) - (p(-1, -1) + 2 * p(-1, 0) + p(-1, 1));
  }
  return [gx, gy];
}
export function gaussBlur9(g, w, h, sigma){
  const k = Array.from({ length: 9 }, (_, i) => Math.exp(-((i - 4) ** 2) / (2 * sigma * sigma)));
  const s = k.reduce((a, b) => a + b, 0); for (let i = 0; i < 9; i++) k[i] /= s;
  const t = new Float64Array(w * h), o = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){ let a = 0; for (let i = 0; i < 9; i++) a += k[i] * g[y * w + bounce(x + i - 4, w)]; t[y * w + x] = a; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){ let a = 0; for (let i = 0; i < 9; i++) a += k[i] * t[bounce(y + i - 4, h) * w + x]; o[y * w + x] = Math.round(a); }
  return o;
}
export function cannyEdges(g, w, h, low, high){
  const [dx, dy] = sobel3(g, w, h, clampIdx), mag = new Float64Array(w * h);
  for (let i = 0; i < mag.length; i++) mag[i] = Math.abs(dx[i]) + Math.abs(dy[i]);
  const at = (x, y) => x < 0 || y < 0 || x >= w || y >= h ? 0 : mag[y * w + x];
  const TG22 = 0.4142135623730950488;
  const cand = new Uint8Array(w * h), out = new Uint8Array(w * h), stack = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){
    const i = y * w + x, m = mag[i]; if (m <= low) continue;
    const ax = Math.abs(dx[i]), ay = Math.abs(dy[i]), tg22x = ax * TG22;
    let keep;
    if (ay < tg22x) keep = m > at(x - 1, y) && m >= at(x + 1, y);
    else if (ay > tg22x + ax * 2) keep = m > at(x, y - 1) && m >= at(x, y + 1);
    else { const s = (dx[i] < 0) !== (dy[i] < 0) ? -1 : 1; keep = m > at(x - s, y - 1) && m > at(x + s, y + 1); }
    if (!keep) continue;
    cand[i] = 1; if (m > high){ out[i] = 255; stack.push(i); }
  }
  while (stack.length){
    const i = stack.pop(), x = i % w, y = (i / w) | 0;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++){
      const nx = x + ox, ny = y + oy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx; if (cand[j] && !out[j]){ out[j] = 255; stack.push(j); }
    }
  }
  return out;
}
/* px: RGBA bytes (w × h). Returns one character and one 0xRRGGBB color (or -1 for blank) per pixel. */
export function asciifyPixels(px, w, h, o){
  const cs = o.charset, n = cs.length, n1 = w * h;
  const steps = Array.from({ length: n }, (_, i) => i === n - 1 ? 255 : Math.floor(255 * (i + 1) / n));
  let E = null, A = null;
  if (o.edges){
    const g = grayOf(px, n1), [sx, sy] = sobel3(g, w, h, bounce);
    A = sx.map((x, i) => { const a = Math.atan2(sy[i], x) * 180 / Math.PI; return a < 0 ? a + 360 : a; });
    E = cannyEdges(gaussBlur9(g, w, h, 1.5), w, h, 200, 300);
  }
  const chars = new Array(n1), colors = new Int32Array(n1);
  /* Images with transparency (PNG): transparent pixels stay blank and opaque ones are always drawn,
     even when dark, so the shape is not lost (asciify-them ignores alpha). */
  let alpha = false; for (let i = 3; i < px.length; i += 4) if (px[i] < 250){ alpha = true; break; }
  for (let i = 0; i < n1; i++){
    if (alpha && px[i * 4 + 3] < 128){ chars[i] = o.blank; colors[i] = -1; continue; }
    const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2], v = Math.max(r, g, b);
    let ch = null, col = o.bw ? 0xffffff : (r << 16) | (g << 8) | b;
    if (E && E[i]){
      const a = A[i];
      if ((a >= 80 && a < 100) || (a >= 260 && a < 280)) ch = '|';
      else if ((a >= 170 && a < 190) || a >= 350 || a < 10) ch = '_';
      else if ((a >= 35 && a < 55) || (a >= 215 && a < 235)) ch = '/';
      else if ((a >= 125 && a < 145) || (a >= 305 && a < 325)) ch = '\\';
      if (ch) col = 0xffffff;
    }
    if (!ch){ let k = 0; while (k < n - 1 && v > steps[k]) k++; if (alpha && k === 0 && n > 1) k = 1; ch = cs[k]; }
    chars[i] = ch; colors[i] = isBlank(ch) ? -1 : col;
  }
  return { chars, colors };
}

export function toPixels(bmp, w, h){
  let src = bmp, sw = bmp.width, sh = bmp.height;
  while (sw >= w * 2 && sh >= h * 2){                       // halve it in steps so the averaging holds up
    const nw = Math.max(w, sw >> 1), nh = Math.max(h, sh >> 1), c = document.createElement('canvas');
    c.width = nw; c.height = nh;
    const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, nw, nh);
    src = c; sw = nw; sh = nh;
  }
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, w, h);   // no fill: the alpha channel is kept
  return x.getImageData(0, 0, w, h).data;
}
const imgOpts = () => {
  const st = $('#imgStyle').value;
  let cs = st === 'custom' ? [...$('#imgCustom').value] : [...IMG_PRESETS[st]];
  if (!cs.length) cs = [...IMG_PRESETS.default];
  const rv = $('#imgRows').value.trim();
  return {
    cols: clamp(parseInt($('#imgCols').value) || 100, 10, 400),
    rows: rv ? clamp(parseInt(rv) || 1, 1, 200) : null,          // empty = automatic, from Aspect
    aspect: clamp(parseFloat($('#imgAspect').value) || 1, .5, 2),
    charset: cs, bw: $('#imgColor').value === 'bw', edges: $('#imgEdges').checked
  };
};
export function imgToDoc(bmp, o){
  let cols = o.cols, rows;
  if (o.rows) rows = o.rows;                                  // explicit height: it is not fitted to the image aspect
  else {
    const ar = 2 / o.aspect;                                  // cell height/width, corrected the way asciify-them does
    rows = Math.max(1, Math.round(cols * (bmp.height / bmp.width) / ar));
    if (rows > 200){ rows = 200; cols = clamp(Math.round(rows * ar * bmp.width / bmp.height), 1, 400); }
  }
  const blank = isBr(o.charset[0]) ? '⠀' : ' ';
  const { chars, colors } = asciifyPixels(toPixels(bmp, cols, rows), cols, rows, { ...o, blank });
  return { cols, rows, chars, colors, blank };
}
/* Accepting an image no longer stamps it straight into the canvas: it comes in as a floating
   selection (select.js's insertFloatImage), the same way a Select paste does, so it can be dragged
   before it is fixed in place. Adjusting a control while it is still floating replaces it in place
   instead of stacking an extra undo step, since nothing has been written to the document yet. */
let imgBmp = null, imgTitle = 'Image', convKey = null, convTimer = 0;
export function convert(){
  if (!imgBmp){ say('Choose an image first.'); return; }
  const o = imgOpts(); $('#imgCols').value = o.cols; $('#imgAspect').value = o.aspect;
  const d = imgToDoc(imgBmp, o);
  insertFloatImage(d, imgTitle);
  convKey = JSON.stringify(o);
  say('Image ready: ' + d.cols + ' × ' + d.rows + ' cells. Drag it, then click outside or switch tool to place it into "' + doc.layers[doc.active].name + '".');
}
export function liveConvert(){
  if (!imgBmp) return;
  if (!fimgPending()){ say('Press Convert to apply.'); return; }
  clearTimeout(convTimer);
  convTimer = setTimeout(() => { if (JSON.stringify(imgOpts()) !== convKey) convert(); }, 120);   // only if something changed
}
export async function onImgFileChange(e){
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try { imgBmp = await createImageBitmap(f); } catch { say('Could not read that image.'); return; }
  imgTitle = f.name.replace(/\.[^.]+$/, '').slice(0, 30) || 'Image';
  $('#imgName').textContent = f.name + ' · ' + imgBmp.width + '×' + imgBmp.height;
  convert();
}

export function initImage(){
$('#imgFile').addEventListener('change', onImgFileChange);
$('#imgGo').addEventListener('click', () => convert());
['#imgStyle', '#imgCols', '#imgRows', '#imgAspect', '#imgColor', '#imgEdges'].forEach(s => $(s).addEventListener('change', liveConvert));
$('#imgStyle').addEventListener('change', e => { $('#imgCustom').style.display = e.target.value === 'custom' ? '' : 'none'; });
$('#imgCustom').addEventListener('input', liveConvert);
}
