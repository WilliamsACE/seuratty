import { doc, setDoc, normDoc } from './core/doc.js';
import { fit } from './render/canvas.js';
import { updHist } from './history.js';
import { restore, setBooted, setDirty, clearSaveTimer, initAutosave } from './io/save.js';
import { initImport, initSample, makeSample } from './io/import.js';
import { initExportTop, initExportBottom, syncGrad } from './io/export.js';
import { initImage } from './image.js';
import { initLayBox, initLayerButtons, renderLayers } from './layers.js';
import { initTooltips, initInfoTooltips } from './ui/tooltips.js';
import { initPalette, buildBuilder, renderPalette, setCurChar } from './ui/palette.js';
import { initColor, setCurColor, scheduleDocColors } from './ui/color.js';
import { initCanvasSize } from './ui/canvas-size.js';
import { initSmallScreen } from './ui/small-screen.js';
import { initCanvasTools, buildTools, setTool } from './tools/tools.js';
import { initFloat, initCmenu, initSelectEvents, initCmenuEvents } from './tools/select.js';
import { initFimg } from './tools/floatimg.js';
import { initFontPop, initFontPopEvents, initTextPanel, fillFontSelect, refreshText, FONTS } from './tools/text.js';
import { initView } from './view.js';
import { say } from './ui/status.js';
import { loadFonts } from './fonts.js';

/* A single entry point: init() registers everything in the same order in which it
   used to run from top to bottom, and then runs the start block. */
function init(){
  initTooltips();          /* shared floating tooltip */
  initFontPop();           /* font dropdown */
  initFontPopEvents();
  initCanvasTools();       /* canvas listeners: tools */
  initLayBox();
  initFloat();
  initFimg();              /* overlay for a floating Image to ASCII conversion */
  initSelectEvents();      /* canvas listeners: selection, copy and paste */
  initCmenu();
  initCmenuEvents();
  initPalette();
  initColor();
  initImport();
  initCanvasSize();
  initSample();
  initLayerButtons();
  initImage();
  initExportTop();
  initTextPanel();
  initExportBottom();
  initView();
  initAutosave();
  initSmallScreen();
  initInfoTooltips();

  /* ---------- Start ---------- */
  fillFontSelect(FONTS['ANSI Shadow'] ? 'ANSI Shadow' : FONTS['Standard'] ? 'Standard' : ''); syncGrad(); refreshText();
  buildTools(); buildBuilder(); renderPalette(); setTool('dots'); setCurChar('⣿'); setCurColor(0x1b98a9);
  const saved = restore();
  setDoc(saved || normDoc(makeSample())); fit(); setBooted(true); renderLayers(); scheduleDocColors(); updHist();
  setDirty(false); clearSaveTimer();
  say(saved ? 'Restored your last work.' : 'Example loaded.');
}

/* The FIGlet fonts arrive by fetch, so init() has to wait for them: they used to be in
   window.FIGFONTS by the time the module was evaluated. If the fetch fails the app starts
   all the same and simply goes without figlet fonts.
   body.dataset.ready tells the tests that the boot is done, with no timers involved. */
async function boot(){
  let fontsError = '';
  try { await loadFonts(); }
  catch (e){ fontsError = 'Could not load the FIGlet fonts (' + e.message + '). Everything else works; text is placed as plain lines.'; }
  init();
  if (fontsError) say(fontsError);
  document.body.dataset.ready = '1';
}




/* ---------- Third-party notices ----------
 The "Image to ASCII" converter is a JavaScript port of the brightness ramp, charset presets, Sobel angles and Canny edge
 detection of asciify-them (https://github.com/ndrscalia/asciify-them):

   MIT License
   Copyright (c) 2026 Andrea Scalia
   Partially based on ascii-view by Xander Gouws, Copyright (c) 2025 Xander Gouws

   Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
   documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
   rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
   persons to whom the Software is furnished to do so, subject to the following conditions:

   The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
   Software.

   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
   WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
   COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
   OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

 ascii-view (https://github.com/gouwsxander/ascii-view) is also MIT licensed, Copyright (c) 2025 Xander Gouws.
*/

boot();
