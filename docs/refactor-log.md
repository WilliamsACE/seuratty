# Seuratty — registro del refactor a módulos ES

Editor de arte braille/ANSI/ASCII. Partió de un único `index.html` con todo dentro
(CSS, motor FIGlet, ~1.4 MB de fuentes y ~1.500 líneas de aplicación) y se está
separando en módulos **sin cambiar ningún comportamiento ni la interfaz**.

Reglas vigentes del refactor:

- El código se mueve **tal cual**: ni se reescribe lógica, ni se reformatea, ni se
  renombra más de lo imprescindible, ni se traducen comentarios.
- Se permiten **imports circulares** entre módulos: se resuelven al llamar la
  función, no al evaluar el módulo.
- **Ningún módulo ejecuta código de otro ni registra listeners al importarse.**
  Todos los efectos de nivel superior siguen en `main.js` (dentro de un IIFE de
  transición) hasta el `init()` de la etapa 7.
- Estado compartido: `export let` en el módulo dueño + **setter exportado** solo
  cuando lo escribe otro módulo (asignar a un binding importado lanza
  `TypeError` en un módulo ES). Las lecturas usan live bindings y no cambian.
- No se usa git todavía. Antes de cada etapa se copia la carpeta a `../seuratty-etapaN/`.
- Criterio de éxito de cada etapa: `tests/smoke.py` en verde, `tests/check_state.py`
  con exit 0, y la captura del lienzo idéntica a `tests/screenshots/base.png`
  (grabada con el código pre-módulos).

> **Estado: cierre ejecutado y verde.** Secciones 10 y 11 para las etapas 6 y 7; la **12** es el
> bloque B (fuentes por fetch y comentarios en inglés) y la **13** el cierre (documentación,
> licencias, borrado de `backup/` y auditoría para GitHub Pages): esa es el estado actual.
> **Etapa 5:** Lo realmente movido, los setters definitivos y las
> desviaciones respecto al plan están en la **sección 9**, al final. Las secciones 1 a 8
> son el plan tal como se aprobó, con las referencias `main.js:NNN` del estado **previo**
> (tras la etapa 4, `js/main.js` de 1.317 líneas), y se conservan como registro de lo que
> se decidió y por qué. Para el estado actual del árbol, ir a la sección 10.

---

## 1. Estado al planificar la etapa 5 (tras la etapa 4)

```
seauritty/
├── index.html                    237     <script src="js/figlet.js">          (clásico)
│                                         <script src="data/fonts.js">         (clásico)
│                                         <script type="module" src="js/main.js">
├── css/style.css                  200
├── data/fonts.js                    1     window.FIGFONTS = {...}   (~1.4 MB, una línea)
├── js/
│   ├── figlet.js               1 374     motor FIGlet, script clásico, expone window.__figlet
│   ├── main.js                 1 317     IIFE de transición: todo lo aún no migrado
│   ├── history.js                  7
│   ├── core/
│   │   ├── util.js                21
│   │   ├── ansi.js                51
│   │   └── doc.js                 22
│   ├── render/canvas.js           70
│   ├── ui/
│   │   ├── status.js               3
│   │   ├── palette.js             24
│   │   └── color.js               34
│   └── io/save.js                 38
├── tests/
│   ├── smoke.py                  598     Playwright (Python, canal msedge)
│   ├── check_state.py            182     comprobador estático de `export let`
│   ├── screenshots/base.png            captura de referencia del lienzo
│   └── fixtures/test.png               imagen de prueba generada
├── backup/index.original.html          HTML monolítico original, intacto
└── docs/refactor-log.md                este archivo
```

Copias de seguridad fuera del proyecto: `../seuratty-paso1`, `../seuratty-paso2`,
`../seuratty-etapa1` … `../seuratty-etapa4`.

### Qué exporta cada módulo migrado

| Módulo | Exporta | Privado |
|---|---|---|
| `core/util.js` | `$`, `ESC`, `MONO`, `DOT`, `isBr`, `bitsOf`, `brChar`, `hex`, `parseHex`, `clamp`, `isBlank`, `line`, `isTyping`, `kb` | — |
| `core/ansi.js` | `parseText` | `BASIC`, `c256`, `sgr` |
| `core/doc.js` | **`doc`** (let), `setDoc`, `mkLayer`, `bind`, `normDoc`, `topLayer`, `shown` | `layerSeq` |
| `render/canvas.js` | **`zoom`, `cw`, `ch`, `dpr`, `pvRect`, `bgOn`, `bgColor`** (let), `cv`, `ctx`, `pv`, `pctx`, `setZoomValue`, `setCellSize`, `setPvRect`, `setBgOn`, `setBgColor`, `applyBg`, `canvasBg`, `updateFg`, `sizeCanvas`, `glyph` | `FG` |
| `ui/status.js` | `say` | — |
| `ui/palette.js` | **`curChar`** (let), `buildBuilder`, `setCurChar` | — |
| `ui/color.js` | **`curColor`** (let), `setCurColor`, `addRecent`, `scheduleDocColors` | `recent`, `swatch`, `renderSwatches`, `docColors`, `dcTimer` |
| `io/save.js` | `SAVE_KEY`, `MOB_KEY`, `store`, `serialize`, `restore`, `parseProject` | `packColors` |
| `history.js` | `undoStack`, `redoStack`, `snap`, `layerById` | — |

`canvas.js` hoy solo tiene las **primitivas**: `schedLay`, `drawCell`, `fullRedraw`,
`relayout` y `fit` siguen en `main.js` porque llaman a `updateLayBox` (capas) y
`updateSelBox` (selección), que se migran en la etapa 5.

---

## 2. Plan de la etapa 5, módulo por módulo

Se migran juntos porque forman un único ciclo de dependencias. Los rangos son
líneas de `main.js` tras la etapa 4.

### 2.1 `js/history.js` (completar)

| Líneas | Qué |
|---|---|
| 54 | `let stroke = null, histSeq = 0;` → `export let stroke` + `setStroke`, `export let histSeq` (sin setter) |
| 55 | `pushHist(e)` |
| 56 | `updHist()` |
| 57-61 | `setCell(i, c, col)` |
| 62-69 | `endStroke()` |
| 70-77 | `loadSnap(s)` |
| 78-82 | `replaceDoc(next, refit, name)` |
| 83-88 | `undo()` |
| 89-95 | `redo()` |

Importa de: `core/util` (`$`), `core/doc` (`doc`, `setDoc`, `bind`, `normDoc`),
`render/canvas` (`drawCell`, `relayout`, `fullRedraw`, `fit`),
`tools/select` (`clearSel`, `commitPaste`, `cancelPaste`, `pend`),
`layers` (`renderLayers`), `ui/color` (`addRecent`, `scheduleDocColors`, `curColor`),
`tools/tools` (`tool`), `io/save` (`scheduleSave`).

### 2.2 `js/layers.js` (nuevo)

| Líneas | Qué |
|---|---|
| 387-388 | `layBox` (`createElement` + `appendChild`) — **la creación del elemento se queda en `main.js`**, ver §5 |
| 389 | `let layFrame = false;` → `export let layFrame` + `setLayFrame` |
| 390-397 | `layBounds()` |
| 398-403 | `updateLayBox()` |
| 783-787 | `layerOp(fn)` |
| 788-792 | `newLayerName()` |
| 793-800 | `setActive(k)` |
| 801 | `updLayerBtns()` |
| 802-806 | `deleteLayerAt(k)` |
| 807-814 | `renameLayer(L, btn)` |
| 815-816 | `GRIP_SVG`, `TRASH_SVG` (privados) |
| 817-848 | `renderLayers()` |
| 853-859 | `pickLayerAt(e)` |
| 864-868 | `swapLayer` |
| 869 | `dragId`, `dragBefore`, `dragOrder` (privados) |
| 870-877 | `layerDragStart(e, id)` |
| 878-888 | `layerDragMove(e)` |
| 889-894 | `layerDragEnd()` |

Importa de: `core/util` (`$`, `clamp`), `core/doc` (`doc`, `mkLayer`, `bind`, `topLayer`),
`history` (`snap`, `pushHist`), `render/canvas` (`fullRedraw`, `cw`, `ch`),
`tools/select` (`clearSel`, `selectLayer`, `cellOf`, `sel`, `commitPaste`),
`tools/tools` (`tool`), `ui/color` (`scheduleDocColors`), `io/save` (`scheduleSave`),
`ui/status` (`say`).

**Ojo con la sombra de nombre**: `renderLayers` (817) declara `const grip` local para
el tirador de cada fila; no tiene nada que ver con `const grip = $('#grip')` de
`main.js:733` (la pestaña de redimensionar). Son dos cosas distintas y deben seguir
separadas.

### 2.3 `js/tools/select.js` (nuevo)

| Líneas | Qué |
|---|---|
| 383 | `let sel = null, sd = null;` → `export let sel` + `setSel`, `export let sd` (sin setter) |
| 384 | `const selBox = $('#selBox');` |
| 385-386 | `cellOf`, `inSel` |
| 404-409 | `updateSelBox()` |
| 410-411 | `fl` (`createElement` + `insertBefore`) — creación en `main.js`, ver §5 |
| 412-415 | `revertStroke()` |
| 416 | `clearSel()` |
| 417-423 | `lift()` |
| 424-428 | `mkDrag(lifted)` |
| 429-443 | `shiftTo(dx, dy)` |
| 444-460 | `beginFloat()` |
| 461-471 | `floatTo(dx, dy)` |
| 472-478 | `dropFloat(d)` |
| 479-484 | `cancelDrag()` |
| 485-493 | `selectLayer()` |
| 494-502 | `selDown(e)` |
| 503-508 | `selMove(e)` |
| 509-514 | `selUp()` |
| 515-519 | `nudge(dx, dy)` |
| 520 | `clip`, `menuCell`, `pointerCell` → privados salvo `pointerCell`, que necesita `setPointerCell` (lo escriben listeners que siguen en `main.js`) |
| 522 | `let pend = null;` → `export let pend` (sin setter) |
| 523-532 | `commitPaste()` |
| 533-536 | `cancelPaste()` |
| 539-542 | `viewCell()` |
| 543-551 | `selText()` |
| 556-560 | `copySelected()` |
| 561-583 | `pasteText(text, at)` |
| 589-593 | `pasteFromMenu()` |
| 594-596 | `MIR_H`, `MIR_V` (privados) |
| 597-604 | `mirrorChar(c, horiz)` |
| 605-615 | `flipSelected(horiz)` |
| 616-621 | `cmenu` (`createElement` + `innerHTML` + `appendChild`) — creación en `main.js`, ver §5 |
| 622 | `hideMenu` |
| 634-639 | `clearSelected()` |

Importa de: `core/util` (`$`, `clamp`, `isBlank`, `isBr`, `isTyping`), `core/ansi` (`parseText`),
`core/doc` (`doc`, `mkLayer`, `bind`, `shown`), `render/canvas` (`cv`, `cw`, `ch`, `dpr`, `glyph`,
`drawCell`, `fullRedraw`), `history` (`snap`, `pushHist`, `updHist`, `setCell`, `endStroke`,
`stroke`, `setStroke`, `undoStack`, `redoStack`, `layerById`), `layers` (`renderLayers`,
`updateLayBox`), `tools/tools` (`tool`, `setTool`, `pos`), `ui/color` (`scheduleDocColors`),
`ui/status` (`say`).

### 2.4 `js/tools/tools.js` (nuevo)

| Líneas | Qué |
|---|---|
| 17 | `tool`, `prevTool` (sin setter), `size` + `setSize`, `dotMode` + `setDotMode`, `eraseMode` + `setEraseMode` |
| 19 | `hoverCell` + `setHover` (`lastDims` se va a `canvas.js`) |
| 97-106 | `TOOLS` |
| 107-110 | `TOOL_TIPS` |
| 111-117 | `showTip(el, text, side)` |
| 118 | `toolTip` (`createElement` + `appendChild`) — creación en `main.js`, ver §5 |
| 119-135 | `buildTools()` |
| 136-145 | `setTool(id)` |
| 146 | `painting`, `eraseDrag`, `strokeMode`, `lastPt` (privados) |
| 147 | `pos` |
| 148-155 | `setDot(x, y, on)` |
| 156-170 | `dotsAt(e)` |
| 310-326 | `cellsAt(e)` |
| 327-333 | `pickAt(e)` |
| 334-351 | `moveCursor(e)` |
| 367 | `byDot` |
| 368-376 | `paintAt` |
| 378 | `stop` |
| 353-366 | cuerpo del `cv.pointerdown` → función con nombre `onCanvasPointerDown(e)`, ver §8, decisión 2 |

Importa de: `core/util` (`$`, `DOT`, `clamp`, `isBr`, `bitsOf`, `brChar`, `isBlank`, `line`),
`core/doc` (`doc`, `shown`), `render/canvas` (`cv`, `cw`, `ch`, `dpr`),
`history` (`setCell`, `endStroke`, `stroke`, `setStroke`), `tools/select` (`clearSel`, `sd`,
`selDown`, `selMove`, `selUp`, `cancelDrag`, `inSel`), `layers` (`layFrame`, `setLayFrame`,
`updateLayBox`, `pickLayerAt`, `renderLayers`), `tools/text` (`clearPreview`, `drawPreview`,
`placeText`, `block`), `ui/palette` (`setCurChar`), `ui/color` (`setCurColor`, `curColor`),
`ui/palette` (`curChar`).

### 2.5 `js/tools/text.js` (nuevo) — **añadido al plan, ver §8 decisión 1**

`tools.js` no puede migrar sin esto: `setTool` (145), `moveCursor` (338/340/343),
`paintAt` (370) y el `cv.pointerleave` (380) llaman a `clearPreview`, `drawPreview`,
`placeText` y leen `block`.

| Líneas | Qué |
|---|---|
| 171 | `FIG`, `FONTS`, `figLoaded` |
| 172 | `rgb` |
| 173-183 | `figLines(...)` |
| 184 | `let block` → `export let block` (sin setter) |
| 185 | `buildBlock()` |
| 186-202 | `makeBlock(lines0)` |
| 203 | `renderPreview()` |
| 204-218 | `renderInto(pre, blk)` |
| 219-222 | `clearPreview()` |
| 223-240 | `drawPreview(cx, cy)` |
| 241 | `refreshText()` |
| 242-248 | `fillFontSelect(sel)` |
| 249-253 | `pop`, `fprev`, `flist`, `fbtn` — creación en `main.js`, ver §5 |
| 254-264 | `buildFontList()` |
| 265-269 | `syncFontUI()` |
| 270 | `showFontPreview(v)` |
| 271 | `pickFont(v)` |
| 272-282 | `openFontPop()` |
| 283 | `closeFontPop()` |
| 297 | `popOpenedAt` (privada) |
| 300-309 | `placeText(cx, cy)` |

### 2.6 `js/render/canvas.js` (completar)

| Líneas | Qué |
|---|---|
| 18 | `showGhost`, `showGrid` → `export let` + `setGhost`, `setGrid` |
| 19 | `lastDims` (privada) |
| 23-24 | comentario de recorte de celdas |
| 25 | `layRaf` (privada) |
| 26 | `schedLay()` |
| 27-37 | `drawCell(i, clear)` |
| 38-41 | `fullRedraw()` |
| 42-47 | `relayout()` |
| 48-51 | `fit()` |

Añade imports de `layers` (`layFrame`, `updateLayBox`) y `tools/select` (`updateSelBox`).

### 2.7 `js/io/save.js` (completar)

| Líneas | Qué |
|---|---|
| 1258 | `saveTimer`, `dirty`, `saveWarned`, `booted` → ver §8 decisión 3 |
| 1259-1264 | `saveNow()` |
| 1265 | `scheduleSave()` |

Añade import de `tools/select` (`commitPaste`) y `ui/status` (`say`).

### 2.8 `js/ui/palette.js` (completar)

| Líneas | Qué |
|---|---|
| 20 | `let customChars = []` → `export let customChars` (solo se muta con `push`, sin setter) |
| 641-646 | `GROUPS` (pasa a privada) |
| 647 | `chipLabel(c)` (pasa a privada) |
| 648-665 | `renderPalette()` |

Añade import de `tools/tools` (`tool`, `setTool`).

---

## 3. Variables exportadas y setters nuevos en la etapa 5

| Variable | Módulo dueño | Escritores externos (archivo:línea actual) | ¿Setter? |
|---|---|---|---|
| `stroke` | `history.js` | `select.js` 414, 474, 482, 498, 518, 609, 637 · `tools.js` 364 | **`setStroke`** — tres módulos la reasignan |
| `histSeq` | `history.js` | ninguno (solo `pushHist`, 55) | no |
| `sel` | `select.js` | `main.js` 1224 (Ctrl+A, keydown global → `view.js` en etapa 6) | **`setSel`** |
| `sd` | `select.js` | ninguno (416, 498, 501, 518 son de `select.js`) | no |
| `pend` | `select.js` | ninguno (561-583, 523-536, todo de `select.js`) | no |
| `pointerCell` | `select.js` | `main.js` 537, 538 (listeners de `#cv` que siguen en `main.js`) | **`setPointerCell`** |
| `layFrame` | `layers.js` | `tools.js` 138 (`setTool`), 355 (`cv.pointerdown`) | **`setLayFrame`** |
| `hoverCell` | `tools.js` | `main.js` 743 (`#grip` pointerdown → `canvas-size.js` en etapa 6) | **`setHover`** |
| `size` | `tools.js` | `main.js` 1212, 1232, 1233 (→ `view.js` en etapa 6) | **`setSize`** |
| `dotMode` | `tools.js` | `main.js` 1213 (→ `view.js`) | **`setDotMode`** |
| `eraseMode` | `tools.js` | `main.js` 1214 (→ `view.js`) | **`setEraseMode`** |
| `tool`, `prevTool` | `tools.js` | ninguno (solo `setTool`, 137-138) | no |
| `showGhost` | `canvas.js` | `main.js` 1215 (→ `view.js`) | **`setGhost`** |
| `showGrid` | `canvas.js` | `main.js` 1216 (→ `view.js`) | **`setGrid`** |
| `block` | `text.js` | ninguno (solo `buildBlock`, 185) | no |
| `customChars` | `palette.js` | `main.js` 667 hace `customChars.push(...)` → es mutación, no reasignación | no |
| `booted`, `dirty`, `saveTimer` | `save.js` | `main.js` 1290-1291 (bloque de arranque) | ver §8 decisión 3 |

Setters nuevos, total: `setStroke`, `setSel`, `setPointerCell`, `setLayFrame`, `setHover`,
`setSize`, `setDotMode`, `setEraseMode`, `setGhost`, `setGrid` (+ los de `save.js`).

Ya existentes de etapas anteriores: `setDoc`, `setZoomValue`, `setCellSize`, `setPvRect`,
`setBgOn`, `setBgColor`.

---

## 4. Imports circulares

Todos se resuelven **en tiempo de llamada**. Ningún módulo ejecuta código de otro durante
su evaluación: las definiciones son declaraciones y asignaciones locales, y todos los
efectos (crear elementos, registrar listeners, arrancar) están en `main.js`.

| Par | A → B llama | B → A llama |
|---|---|---|
| `canvas` ↔ `layers` | `schedLay` → `updateLayBox`; lee `layFrame` | `renderLayers` → `fullRedraw`; `updateLayBox` lee `cw`, `ch` |
| `canvas` ↔ `select` | `relayout` → `updateSelBox` | `beginFloat` → `glyph`; varios → `drawCell`, `fullRedraw`; leen `cw`, `ch`, `dpr`, `cv` |
| `history` ↔ `select` | `loadSnap`, `replaceDoc`, `undo`, `redo` → `clearSel`, `commitPaste`, `cancelPaste`; leen `pend` | `commitPaste`, `pasteText` → `snap`, `pushHist`, `updHist`; `shiftTo`, `flipSelected`, `clearSelected` → `setCell`, `endStroke` |
| `history` ↔ `layers` | `loadSnap`, `replaceDoc`, `undo`, `redo` → `renderLayers` | `layerOp`, `layerDragEnd` → `snap`, `pushHist` |
| `history` ↔ `tools` | `endStroke` lee `tool` | `cellsAt`, `dotsAt`, `setDot` → `setCell`; `stop` → `endStroke` |
| `tools` ↔ `select` | `setTool` → `clearSel`; `cv` handlers → `selDown`, `selMove`, `selUp`, `cancelDrag`; leen `sd` | `pasteText` → `setTool`; `cellOf` → `pos`; leen `tool` |
| `tools` ↔ `text` | `setTool`, `moveCursor`, `paintAt` → `clearPreview`, `drawPreview`, `placeText`; leen `block` | `drawPreview` lee `tool`; `refreshText` lee `tool`, `hoverCell` |
| `tools` ↔ `palette` | `pickAt` → `setCurChar`; lee `curChar` | `renderPalette` → `setTool`; lee `tool` |
| `layers` ↔ `select` | `setActive`, `layerOp` → `clearSel`; `pickLayerAt` → `cellOf`, `selectLayer`; `updateLayBox` lee `sel` | `clearSel` → `commitPaste` → `renderLayers`; `pasteText` → `renderLayers`; `updateSelBox` → `updateLayBox` |
| `save` → `select` | `saveNow` → `commitPaste` | (no importa `save`; el ciclo se cierra vía `history.updHist` → `scheduleSave`) |

**Riesgo asociado y por qué no se materializa**: la mayoría de estas funciones son
`const` con función flecha (`clearSel`, `snap`, `layerById`, `byDot`, `paintAt`, `swapLayer`,
`pos`, `cellOf`, `inSel`, `hideMenu`, `stop`, `rgb`, `bind`…), que **no se izan**. Si un
módulo llamara a otra durante su evaluación, saltaría `ReferenceError` por TDZ. No ocurre
porque no hay llamadas a nivel superior en ningún módulo.

---

## 5. Efectos de nivel superior que se quedan en `main.js`

Se quedan **todos**, en su orden actual, hasta el `init()` de la etapa 7. Los cuerpos
anónimos que escriben estado de un módulo migrado pasan a ser funciones con nombre
exportadas por ese módulo (§8 decisión 2); el `addEventListener` sigue en `main.js`.

| Línea | Efecto |
|---|---|
| 118 | `createElement` `toolTip` + `appendChild` |
| 249-252 | `createElement` `pop` + `innerHTML` + `appendChild` |
| 284 | `fbtn` click |
| 285-289 | `fbtn` keydown |
| 290-295 | `pop` keydown |
| 296 | `document` pointerdown (cierra el popup de fuentes) |
| 298 | `document` scroll (captura) |
| 299 | `window` resize → `closeFontPop` |
| **352** | **`cv` contextmenu #1** — `e => e.preventDefault()` |
| **353-366** | **`cv` pointerdown** |
| **377** | **`cv` pointermove #1** — `moveCursor`, `paintAt`, `selMove` |
| 379 | `cv` pointerup → `stop`; `cv` pointercancel |
| **380** | **`cv` pointerleave #1** — oculta el cursor, limpia `hoverCell` y la vista previa |
| 387-388 | `createElement` `layBox` + `appendChild` en `#wrap` |
| 410-411 | `createElement` `fl` + `insertBefore` **antes de `selBox`** |
| **537** | **`cv` pointermove #2** — `pointerCell = cellOf(e)` |
| **538** | **`cv` pointerleave #2** — `pointerCell = null` |
| 552-555 | `document` copy |
| 584-588 | `document` paste |
| 616-621 | `createElement` `cmenu` + `innerHTML` + `appendChild` |
| 623 | `cmenu` click |
| **624-630** | **`cv` contextmenu #2** — abre el menú contextual |
| 631 | `document` pointerdown (captura) → `hideMenu` |
| 632 | `window` blur y `window` resize → `hideMenu` |
| **633** | **`document` keydown (captura) #1** — Escape → `hideMenu` |
| 666-670 | `#addChars` click |
| 671 | `#custom` keydown |
| 674-676 | `#colorPicker` input, `#colorHex` change, `#noColor` click |
| 689 | `#loadText` click |
| 694 | `#file` change |
| 696-698 | `#stage` dragenter/dragover/dragleave/drop |
| 703 | `#newAsk` click |
| **704** | **`document` keydown (captura) #2** — Escape del diálogo *New canvas*, hace `stopPropagation()` |
| 705-712 | `#newCv`, `#newNo`, `#newYes` click |
| 726-732 | `#rsApply` click |
| 739-767 | `#grip` pointerdown/pointermove/pointerup/pointercancel/lostpointercapture/keydown |
| 768-777 | `#rsCols` y `#rsRows`: keydown, focus, blur |
| 780 | `#sample` click |
| 849-852 | `#lyDup` click |
| 860-863 | `#lyAdd` click |
| 1041-1051 | `#imgFile` change, `#imgGo` click, 6 × change de opciones, `#imgStyle` change, `#imgCustom` input |
| 1073 | `createElement` `flashEl` + `appendChild` |
| 1091-1105 | `#fmt` change, `#copy` click, `#copyLine` click |
| 1106-1113 | `#txt`/`#gA`/`#gB` input, `#font` change, `#gMode` change, 4 × change → `refreshText` |
| 1114-1123 | `#fontFile` change |
| 1125 | IIFE async que resuelve `downloads` (`window.claude`) |
| 1131-1141 | `#save` click |
| 1165-1175 | `#savePng` click |
| 1177 | `#undo` y `#redo` click |
| 1187 | `#zoom` input |
| 1189-1196 | `#stage` wheel (`passive: false`) |
| 1198-1210 | `#stage` mousedown/pointerdown/pointermove/pointerup/pointercancel |
| 1211-1217 | `#fit`, `#size`, `#dotMode`, `#eraseMode`, `#ghost`, `#grid`, `#bg` |
| **1218-1234** | **`document` keydown (burbuja)** — atajos globales |
| 1236-1243 | bucle sobre `.side .panel > h2`: envuelve cada `h2` en un botón `.fold` y pliega el panel |
| 1245-1256 | `dockTabs` + click y keydown de cada pestaña |
| 1266-1268 | `window` pagehide, `window` beforeunload, `document` visibilitychange |
| 1271-1275 | aviso de pantalla pequeña (`#mob`, `#mobOk`) |
| 1278-1285 | bucle sobre `.info`: globo flotante de los iconos "i" |
| 1287-1291 | bloque de arranque |

### Listeners duplicados sobre el mismo evento — el orden importa

- **`#cv` `pointermove`**: 377 (herramientas: `moveCursor` → `paintAt` → `selMove`) **antes de**
  538 → 537 (selección: `pointerCell = cellOf(e)`). Hoy nadie lee `pointerCell` dentro del
  primero, pero el orden se conserva igualmente.
- **`#cv` `pointerleave`**: 380 (herramientas: `hoverCell = null`, `clearPreview`) **antes de**
  538 (selección: `pointerCell = null`).
- **`#cv` `contextmenu`**: 352 (`preventDefault`) **antes de** 624 (abre `#cmenu`).
- **`document` `keydown` en fase de captura**: 633 (`hideMenu`) **antes de** 704 (diálogo
  *New canvas*, que hace `stopPropagation()` y así impide que el keydown de burbuja de
  1218 ejecute `cancelDrag`/`clearSel`). **Invertir estos dos cambia el comportamiento de
  la tecla Escape.** Los dos de captura corren siempre antes que el de burbuja de 1218,
  independientemente del orden de registro.

---

## 6. Riesgos concretos de esta etapa

1. **TDZ por funciones flecha `const`.** Ver §4. Mitigación: ningún módulo llama a otro al
   evaluarse.
2. **`stroke` la reasignan tres módulos** (`history`, `tools`, `select`) en 8 sitios. Es la
   variable con más escritores del proyecto y la que más fácil se escapa: si alguna
   asignación se queda sin convertir a `setStroke`, el módulo lanza `TypeError` en tiempo
   de ejecución, no al cargar. `check_state.py` la detecta estáticamente.
3. **Sombras de nombre.** Un análisis léxico no distingue la local de la importada:
   - `asciifyPixels` (`main.js` 949-979) declara `let ch = null` que tapa el `ch` importado
     de `canvas.js`. Ya sale en `check_state.py` como "a revisar a mano" (6 líneas).
     Acordado renombrarla en la limpieza final.
   - `openFontPop` (`main.js` 281) declara `const sel = flist.querySelector(...)`, que tapará
     el `sel` de `select.js` si `text.js` llegara a importarlo. Hoy no lo importa.
   - El listener de `#savePng` (`main.js` 1168) declara `const size = kb(blob)`, que tapa el
     `size` de `tools.js`. Ese listener sigue en `main.js`, que sí importará `size`:
     aparecerá como aviso en `check_state.py`.
   - `renderLayers` (817) declara `const grip` local, homónimo del `const grip = $('#grip')`
     de 733.
4. **Estado restaurado en un `finally`.** `renderPng` (`main.js` 1142-1156) guarda `cw`/`ch`,
   los pisa para dibujar a 2× y los restaura en `finally { setCellSize(oc, oh); }`. **No se
   migra en esta etapa** (va en la 6, a `io/export.js`), pero `canvas.js` sí cambia, así que
   la invariante hay que volver a verificarla: tras guardar el PNG, `zoom`, `cw`, `ch` y el
   tamaño del lienzo deben quedar exactamente como estaban.
5. **`updateLayBox` se llama dentro de un `requestAnimationFrame`** (`schedLay`, 26). El
   callback corre mucho después de la evaluación de los módulos: seguro, pero significa que
   un fallo de import en ese camino no se vería hasta que el usuario elige una capa.
6. **`clearSel` (416) llama a `commitPaste`**, que fusiona la capa temporal "Pasted" y apila
   historial. Está en el cruce de `select` ↔ `history` ↔ `layers` ↔ `save` y lo invocan
   `setTool`, `setActive`, `layerOp`, `replaceDoc`, `loadSnap`, `undo`, `redo` y `saveNow`.
   Es el punto más sensible de toda la etapa.
7. **`fl` se inserta con `insertBefore(fl, selBox)`** (411): depende de que `selBox` ya exista
   en el DOM. El orden de creación de elementos no puede alterarse.
8. **`main.js` importará `size`, `sel`, `stroke`, `hoverCell`, `layFrame`, `pointerCell`** solo
   para que sus listeners los lean o los escriban vía setter. Es temporal: en las etapas 6-7
   esos listeners se van a `view.js` / `canvas-size.js` / `init()`.

---

## 7. Cobertura de pruebas

### Qué cubre hoy `tests/smoke.py` (19 pasos, todos en verde)

Carga sin errores de consola · captura del lienzo idéntica a la base · Dots (tecla 1) dibuja
y el clic derecho borra · Undo/Redo · capas: crear, duplicar, renombrar, reordenar con
flechas, borrar · Shift+clic elige capa · Select (tecla 7): seleccionar y mover · Flip
horizontal y vertical por menú contextual · Ctrl+C / Ctrl+V a capa "Pasted" y fusión al
hacer clic fuera · Supr · Text (tecla 6): vista previa, colocado y `#pv` sin restos ·
selector FIGlet con 90 fuentes · Image to ASCII · Export Copy · Save `.txt` · Save
`.seuratty` y reapertura · autoguardado en `localStorage` y restauración al recargar ·
New canvas con confirmación.

Sonda de estado del documento: `localStorage['seuratty.work.v1']` tras el debounce de 800 ms
del autoguardado. La captura compara solo `#cv`, tras `document.fonts.ready` y un clic en
*Fit* (las fuentes de Google cargan async y sin eso la imagen varía entre corridas).

### Qué NO cubre de lo que toca la etapa 5

| Sin cubrir | Módulo afectado |
|---|---|
| Save `.png` y la restauración de `zoom`/`cw`/`ch` del `finally` | `canvas.js` (riesgo 4) |
| Redimensionar por los campos `#rsCols`/`#rsRows` y por el tirador `#grip` | `canvas.js`, `layers.js` (`cropLayer`, `hoverCell`) |
| Ctrl+rueda para zoom, *Fit*, paneo con la herramienta Pan (tecla 8) | `canvas.js`, `tools.js` |
| Reordenar capas **arrastrando** (`layerDragStart/Move/End`) | `layers.js` |
| Pestañas del dock y paneles plegables | efectos de nivel superior |
| Aviso de pantalla pequeña (`#mob`) | `save.js` (`store`, `MOB_KEY`) |
| `nudge` con flechas, Ctrl+A, `[` y `]` para el tamaño de pincel | `select.js`, `tools.js` |
| Ocultar/mostrar una capa con su casilla | `layers.js`, `canvas.js` |
| Eyedropper (tecla 5) y Alt+clic | `tools.js`, `palette.js`, `color.js` |
| Recolor (4), Character/stamp (2), Erase (3) y sus modos | `tools.js` |
| Cancelar un arrastre de selección con Escape (`cancelDrag`) | `select.js` |
| Cargar una fuente `.flf` | `text.js` |

### Pruebas que propongo añadir antes de la etapa 5

Las 8 ya acordadas: Save `.png` verificando que `zoom` y `cw`/`ch` quedan intactos ·
redimensionado por campos y por el tirador · Ctrl+rueda + *Fit* + paneo · reordenar capas
arrastrando y con flechas · pestañas del dock · paneles plegables · aviso de pantalla
pequeña.

Y propongo añadir estas cuatro, que cubren caminos críticos de la etapa 5 que hoy quedan
ciegos (§8 decisión 4):

- **Escape cancela un arrastre de selección** (`cancelDrag`) y Escape con el menú contextual
  abierto — es la prueba directa del orden de los dos keydown en captura (§5).
- **Flechas mueven la selección** (`nudge`) y **Ctrl+A** la selecciona entera.
- **Eyedropper**: Alt+clic copia carácter y color, y devuelve la herramienta anterior.
- **Ocultar y mostrar una capa** con su casilla, comprobando que el lienzo se redibuja.

---

## 8. Decisiones que necesitan aprobación

**1. Incluir `tools/text.js` en la etapa 5.** No estaba en tu lista, pero `tools.js` no puede
migrar sin él: `setTool` (145), `moveCursor` (338, 340, 343), `paintAt` (370) y el
`cv.pointerleave` (380) llaman a `clearPreview`, `drawPreview` y `placeText`, y leen `block`.
Alternativas: (a) migrar `text.js` en la etapa 5 — recomendado, forma parte del mismo ciclo;
(b) dejar `setTool`, `moveCursor` y `paintAt` en `main.js`, lo que vacía `tools.js` de
contenido y obliga a exportar media docena de variables temporalmente.

**2. Convertir en funciones con nombre los cuerpos de listener que escriben estado.** El
`cv.pointerdown` (353-366) escribe `painting`, `eraseDrag`, `strokeMode`, `lastPt` y `stroke`
en una sola línea (364). Si el cuerpo se queda anónimo en `main.js`, esas cinco variables
necesitan setters exportados solo para eso. Propongo moverlo a `tools.js` como
`onCanvasPointerDown(e)` y dejar en `main.js` el `cv.addEventListener('pointerdown',
onCanvasPointerDown)` en la misma posición. Mismo tratamiento para 537, 538 y 380. Es la
forma que tendrá el `init()` de la etapa 7 de todos modos. Alternativa: 8-10 setters de usar
y tirar.

**3. Cómo migrar el final del bloque de arranque.** `main.js` 1290-1291 hace hoy
`booted = true; … ; dirty = false; clearTimeout(saveTimer);` (esto último cancela el guardado
que `updHist()` acaba de programar). Opciones: (a) exportar `setBooted(v)`, `setDirty(v)` y
`clearSaveTimer()` — tres líneas, conserva las sentencias una a una; (b) exportar una sola
función `markBootDone()` que haga las tres cosas — se lee mejor pero fusiona tres sentencias
en una llamada. Recomiendo (a) por fidelidad, aunque (b) es más limpio.

**4. Ampliar el smoke test con las cuatro pruebas extra de §7**, además de las 8 acordadas.
Suman unos 5 minutos de ejecución y cubren `cancelDrag`, `nudge`, el eyedropper, la
visibilidad de capas y el orden de los dos keydown en captura, que es el riesgo de regresión
más difícil de detectar a ojo.

**5. `layBox` en `layers.js` y no en `canvas.js`.** En el plan de la Fase 1 quedó en `layers.js`
(corrección 2) y así lo mantengo, pero conviene confirmarlo: `canvas.schedLay` lo necesita y
es la causa de que `drawCell`/`relayout` sigan en `main.js` desde la etapa 2.

---

## 9. Etapa 5 ejecutada — resultado real

Copia previa: `../seuratty-etapa5/`. Resultado: **`tests/smoke.py` 35/35**, `tests/check_state.py`
exit 0, captura del lienzo **idéntica** a `tests/screenshots/base.png`.

### 9.1 Árbol y líneas por archivo

```
js/
├── main.js                606   (antes 1.317)   IIFE de transición: efectos de nivel superior
├── history.js              57
├── layers.js              141
├── core/
│   ├── util.js             21
│   ├── ansi.js             51
│   └── doc.js              22
├── render/canvas.js       106
├── tools/
│   ├── tools.js           167
│   ├── select.js          252
│   └── text.js            137
├── ui/
│   ├── status.js            3
│   ├── palette.js          52
│   └── color.js            34
├── io/save.js              54
└── figlet.js            1 374   (script clásico, sin tocar)

tests/smoke.py            1 106   35 pasos
tests/check_state.py        182
```

`main.js` pasó de 1.317 a 606 líneas. Los 14 módulos suman 1.097 líneas de aplicación.

### 9.2 Verificación de fidelidad del código movido

Se comparó línea a línea cada módulo contra el rango original de `main.js`, deshaciendo el
prefijo `export` y las conversiones a setter:

| Módulo | Líneas originales | Sin correspondencia |
|---|---|---|
| `tools/select.js` | 214 | 1 (división deliberada, ver 9.6) |
| `tools/tools.js` | 138 | 0 |
| `tools/text.js` | 120 | 0 |
| `layers.js` | 119 | 0 |
| `history.js` | 42 | 0 |
| `render/canvas.js` | 29 | 0 |

### 9.3 Qué exporta cada módulo tras la etapa 5

| Módulo | Exporta |
|---|---|
| `core/util.js` | `$`, `ESC`, `MONO`, `DOT`, `isBr`, `bitsOf`, `brChar`, `hex`, `parseHex`, `clamp`, `isBlank`, `line`, `isTyping`, `kb` |
| `core/ansi.js` | `parseText` |
| `core/doc.js` | `doc`, `setDoc`, `mkLayer`, `bind`, `normDoc`, `topLayer`, `shown` |
| `render/canvas.js` | `cv`, `ctx`, `pv`, `pctx`, `zoom`, `cw`, `ch`, `dpr`, `pvRect`, `bgOn`, `bgColor`, `showGhost`, `showGrid`, `setZoomValue`, `setCellSize`, `setPvRect`, `setBgOn`, `setBgColor`, `setGhost`, `setGrid`, `applyBg`, `canvasBg`, `updateFg`, `sizeCanvas`, `glyph`, `schedLay`, `drawCell`, `fullRedraw`, `relayout`, `fit` |
| `history.js` | `undoStack`, `redoStack`, `snap`, `layerById`, `stroke`, `setStroke`, `histSeq`, `pushHist`, `updHist`, `setCell`, `endStroke`, `loadSnap`, `replaceDoc`, `undo`, `redo` |
| `layers.js` | `initLayBox`, `layFrame`, `setLayFrame`, `layBounds`, `updateLayBox`, `layerOp`, `newLayerName`, `setActive`, `updLayerBtns`, `deleteLayerAt`, `renameLayer`, `renderLayers`, `pickLayerAt`, `swapLayer`, `layerDragStart`, `layerDragMove`, `layerDragEnd` |
| `tools/tools.js` | `TOOLS`, `tool`, `prevTool`, `size`, `dotMode`, `eraseMode`, `hoverCell`, `setSize`, `setDotMode`, `setEraseMode`, `setHover`, `initToolTip`, `showTip`, `buildTools`, `setTool`, `pos`, `setDot`, `dotsAt`, `cellsAt`, `pickAt`, `moveCursor`, `byDot`, `paintAt`, `stop`, `onCanvasPointerDown`, `onCanvasPointerMove`, `onCanvasPointerLeave` |
| `tools/select.js` | `sel`, `setSel`, `sd`, `pend`, `pointerCell`, `cellOf`, `inSel`, `updateSelBox`, `initFloat`, `revertStroke`, `clearSel`, `lift`, `mkDrag`, `shiftTo`, `beginFloat`, `floatTo`, `dropFloat`, `cancelDrag`, `selectLayer`, `selDown`, `selMove`, `selUp`, `nudge`, `commitPaste`, `cancelPaste`, `trackPointerCell`, `forgetPointerCell`, `viewCell`, `selText`, `copySelected`, `pasteText`, `pasteFromMenu`, `mirrorChar`, `flipSelected`, `initCmenu`, `hideMenu`, `onCanvasContextMenu`, `hideMenuOnOutside`, `clearSelected` |
| `tools/text.js` | `FIG`, `FONTS`, `figLoaded`, `block`, `figLines`, `buildBlock`, `makeBlock`, `renderPreview`, `renderInto`, `clearPreview`, `drawPreview`, `refreshText`, `fillFontSelect`, `initFontPop`, `buildFontList`, `syncFontUI`, `showFontPreview`, `pickFont`, `openFontPop`, `closeFontPop`, `placeText` |
| `ui/palette.js` | `curChar`, `customChars`, `buildBuilder`, `setCurChar`, `renderPalette` |
| `ui/color.js` | `curColor`, `setCurColor`, `addRecent`, `scheduleDocColors` |
| `ui/status.js` | `say` |
| `io/save.js` | `SAVE_KEY`, `MOB_KEY`, `store`, `serialize`, `restore`, `parseProject`, `saveNow`, `scheduleSave`, `setBooted`, `setDirty`, `clearSaveTimer` |

### 9.4 Setters definitivos

27 variables con `export let`. **Cero escrituras foráneas** según `check_state.py`.

| Setter | Módulo | Lo llama |
|---|---|---|
| `setDoc` | `core/doc.js` | `history.loadSnap`, `history.replaceDoc`, arranque |
| `setZoomValue` | `render/canvas.js` | `canvas.fit`, `main.setZoom` |
| `setCellSize` | `render/canvas.js` | `main.renderPng` (patrón `try/finally` intacto) |
| `setPvRect` | `render/canvas.js` | `text.clearPreview`, `text.drawPreview` |
| `setBgOn` | `render/canvas.js` | `main`, campos de tamaño (focus/blur) |
| `setBgColor` | `render/canvas.js` | `main` (`#bg`), `save.parseProject` |
| `setGhost`, `setGrid` | `render/canvas.js` | `main` (`#ghost`, `#grid`) |
| `setStroke` | `history.js` | `select` (7 sitios), `tools.onCanvasPointerDown` |
| `setSel` | `tools/select.js` | `main`, atajo Ctrl+A |
| `setLayFrame` | `layers.js` | `tools.setTool`, `tools.onCanvasPointerDown` |
| `setHover` | `tools/tools.js` | `main`, tirador `#grip` |
| `setSize` | `tools/tools.js` | `main` (`#size`, teclas `[` y `]`) |
| `setDotMode`, `setEraseMode` | `tools/tools.js` | `main` (`#dotMode`, `#eraseMode`) |
| `setBooted`, `setDirty`, `clearSaveTimer` | `io/save.js` | bloque de arranque |

Sin setter, por tener un único escritor dentro de su propio módulo: `tool`, `prevTool`,
`curChar`, `curColor`, `customChars` (solo se muta con `push`), `histSeq`, `sd`, `pend`,
`pointerCell`, `block`, `dpr`.

### 9.5 Funciones initXxx() y funciones con nombre

Ningún módulo crea elementos ni registra listeners al importarse. Cada `initXxx()` crea su
elemento, lo guarda en un `let` privado del módulo y **lo devuelve** para que `main.js` pueda
engancharle los listeners que le corresponden, en la misma posición que antes:

| Init | Módulo | Devuelve | Posición original |
|---|---|---|---|
| `initToolTip()` | `tools/tools.js` | `toolTip` | `main.js:118` |
| `initFontPop()` | `tools/text.js` | `{ pop, fbtn }` | `main.js:249-253` |
| `initLayBox()` | `layers.js` | `layBox` | `main.js:387-388` |
| `initFloat()` | `tools/select.js` | `fl`, con su `insertBefore(fl, selBox)` | `main.js:410-411` |
| `initCmenu()` | `tools/select.js` | `cmenu` | `main.js:616-621` |

No hizo falta `initFlash()`: `flashEl` y `flash()` pertenecen a `io/export.js`, que se migra en
la etapa 6, y siguen juntos en `main.js` sin cruzar módulos.

Cuerpos de listener convertidos en funciones con nombre. El `addEventListener` sigue en
`main.js`, en su posición original:

| Función | Módulo | Antes | Motivo |
|---|---|---|---|
| `onCanvasPointerDown` | `tools/tools.js` | `main.js:353-366` | escribía `painting`, `eraseDrag`, `strokeMode`, `lastPt`, `stroke` |
| `onCanvasPointerMove` | `tools/tools.js` | `main.js:377` | lee `painting`, privada del módulo |
| `onCanvasPointerLeave` | `tools/tools.js` | `main.js:380` | escribía `hoverCell` |
| `trackPointerCell` | `tools/select.js` | `main.js:537` | escribía `pointerCell` |
| `forgetPointerCell` | `tools/select.js` | `main.js:538` | escribía `pointerCell` |
| `onCanvasContextMenu` | `tools/select.js` | `main.js:624-630` | escribía `menuCell` y usa `cmenu` privado |
| `hideMenuOnOutside` | `tools/select.js` | `main.js:631` | usa `cmenu` privado |

Orden de los listeners duplicados **conservado y verificado**: `#cv` `contextmenu`
(herramientas antes que selección), `pointermove` y `pointerleave` (herramientas antes que
selección), y los dos `keydown` en fase de captura (`#cmenu` antes que el diálogo *New canvas*).

### 9.6 Desviaciones respecto al plan

1. **`tools/text.js` se añadió a la etapa 5** (decisión 8.1, opción a). Confirmado en la
   práctica: `setTool`, `moveCursor` y `paintAt` no funcionan sin `clearPreview`, `drawPreview`,
   `placeText` y `block`.
2. **`let clip = null, menuCell = null, pointerCell = null;`** (`main.js:520`) se dividió en dos
   líneas: `clip` y `menuCell` quedan privadas y `pointerCell` necesita `export` porque lo
   escriben dos listeners que siguen en `main.js`. Es la única línea del código movido que no
   aparece literal en su módulo.
3. **`saveWarned`, `dirty`, `booted` y `saveTimer` no se exportan.** La sección 3 los daba como
   exportados; con los tres setters de la decisión 8.3 no hace falta, y quedan privados de
   `io/save.js`.
4. **`renderPalette`, `GROUPS`, `chipLabel` y `customChars` volvieron a `ui/palette.js`** en esta
   etapa. En la etapa 4 se habían quedado en `main.js` porque `tools.js` aún no existía;
   `GROUPS` y `chipLabel` quedan privadas.
5. **Sin `initFlash()`**, por lo explicado en 9.5.

### 9.7 Cuatro imports que faltaban, detectados y corregidos

La primera ejecución falló con `pend is not defined` y `hex is not defined`. En vez de iterar
error a error se escribió una comprobación que cruza, por módulo, los identificadores usados
contra los exportados y los declarados localmente. Encontró todos de golpe:

| Módulo | Faltaba | De |
|---|---|---|
| `layers.js` | `pend` | `tools/select.js` |
| `tools/tools.js` | `hex` | `core/util.js` |
| `tools/select.js` | `loadSnap` | `history.js` |
| `tools/select.js` | `DOT`, `brChar` | `core/util.js` |
| `main.js` | `parseHex` | `core/util.js` |

Conviene repetir esa comprobación en las etapas 6 y 7: un import que falta no se ve al cargar
el módulo, sino al ejecutar la función que lo usa.

### 9.8 Pruebas: de 19 a 35 pasos

Antes de tocar la etapa 5 se ampliaron y se confirmaron en verde **contra el código anterior**,
para que fueran red de seguridad y no juez de parte.

Las 12 previstas: Save `.png` (verificando que `zoom`, `cw`/`ch` y el tamaño del lienzo quedan
intactos, y que el PNG sale a 2x) · redimensionado por campos · redimensionado por el tirador de
la esquina · Ctrl+rueda + *Fit* + paneo con Pan · reordenar capas arrastrando · pestañas del
dock · paneles plegables · aviso de pantalla pequeña (contexto aparte con pantalla de 640x480) ·
eyedropper con Alt+clic y tecla 5 · flechas (`nudge`) y Ctrl+A · Escape cancelando un arrastre de
selección · ocultar y mostrar capas.

Las 4 sobre el pegado: Ctrl+Z con pegado pendiente lo cancela entero y quita la capa "Pasted" ·
un solo Ctrl+Z tras fusionar deshace el pegado con sus movimientos · cambiar de capa con un
pegado pendiente lo fusiona sin descuadrar los índices · Ctrl+V desde otra herramienta cambia a
Select y pega.

**Hallazgo al escribirlas**: Escape con el menú contextual abierto **también quita la
selección**, porque el `keydown` en captura de `#cmenu` no llama a `stopPropagation()` y el
atajo global de burbuja llega igualmente. Es el comportamiento actual y la prueba lo fija como
tal; si alguna vez se considera un fallo, habrá que decidirlo aparte.

Dos detalles de entorno resueltos: `#cellInfo` hay que leerlo con `text_content` porque
`inner_text` colapsa los dos espacios que separan los campos, y la salida del test se
reconfigura a UTF-8 porque imprimir un carácter braille revienta en la consola cp1252 de Windows.

### 9.9 Pendiente para la etapa 6

`io/export.js` (incluido `renderPng` con su `try/finally`), `image.js`, `io/import.js`,
`ui/canvas-size.js` y `view.js`. Siguen en `main.js` junto con todos los `addEventListener`,
el aviso de pantalla pequeña y el bloque de arranque, que se van en la etapa 7 con el `init()`
definitivo y la salida del IIFE.

Sin resolver, para la limpieza final: renombrar la local `ch` de `asciifyPixels` y la local
`size` del listener de `#savePng` (ambas tapan un import y son los 7 avisos "a revisar a mano"
de `check_state.py`), `askTimer` sin uso, y el bucle duplicado entre `layBounds` y `selectLayer`.

---

## 10. Etapa 6 ejecutada — resultado real

Alcance: `io/export.js`, `image.js`, `io/import.js`. `ui/canvas-size.js` y `view.js` quedan
para más adelante. Copia previa: `../seuratty-etapa6/` (sin `backup/` duplicado, ya está en
`../seuratty-paso1`). Resultado: **`tests/smoke.py` 42/42**, `check_state.py` y
`check_imports.py` exit 0, captura del lienzo **idéntica**, 0 errores de consola al cargar.

### 10.1 Qué se movió

| Módulo | Líneas | Contenido |
|---|---|---|
| `js/io/export.js` | 121 | `sgrTrue` (privada), `buildExport`, `flashEl`+`flashTimer`+`flash` (privadas), `initFlash`, `copyText`, `onCopyLineClick`, `syncGrad`, `downloads` (privada), `initDownloads`, `browserDownload`, `onSaveClick`, `renderPng`, `saveProject`, `onSavePngClick` |
| `js/image.js` | 158 | `IMG_PRESETS`, `bounce`, `clampIdx`, `grayOf`, `sobel3`, `gaussBlur9`, `cannyEdges`, `asciifyPixels`, `toPixels`, `imgOpts`, `imgToDoc`, `imgBmp`/`imgTitle`/`conv`/`convTimer` (privadas), `convert`, `liveConvert`, `onImgFileChange` |
| `js/io/import.js` | 24 | `loadFromText`, `readFile`, `SAMPLE_ART` (privada), `makeSample` |
| `js/layers.js` | +9 | `cropLayer` (ver desviación 1) |

`main.js`: 606 → **333 líneas**.

Fidelidad verificada con `diff` contra los rangos originales: el contenido de los tres
módulos es idéntico carácter a carácter, salvo el prefijo `export` y las envolturas de las
funciones con nombre.

### 10.2 Inits y funciones con nombre

Ni `downloads` ni `flashEl` se exportan con setter, como se pidió:

| Init | Módulo | Qué hace | Posición original |
|---|---|---|---|
| `initFlash()` | `io/export.js` | crea `flashEl` y lo añade al `body`; lo devuelve | `main.js:370` |
| `initDownloads()` | `io/export.js` | ejecuta el IIFE async que resuelve `window.claude.use('downloads')` | `main.js:422` |

Cuerpos de listener convertidos en funciones con nombre, por tocar estado privado del módulo
(`downloads`, `sgrTrue`, `imgBmp`/`imgTitle`). El `addEventListener` sigue en `main.js`:

| Función | Módulo | Antes | Por qué |
|---|---|---|---|
| `onSaveClick` | `io/export.js` | `main.js:428-436` | lee `downloads` |
| `onSavePngClick` | `io/export.js` | `main.js:462-471` | lee `downloads` |
| `onCopyLineClick` | `io/export.js` | `main.js:390-402` | usa `sgrTrue`, privada |
| `onImgFileChange` | `image.js` | `main.js:338-344` | escribe `imgBmp` e `imgTitle` |

Los listeners que solo llaman a funciones exportadas siguen anónimos en `main.js`: `#fmt`,
`#copy`, `#imgGo`, `#imgStyle`, `#imgCustom`, los seis `change` de opciones de imagen,
`#loadText`, `#file`, el arrastre sobre `#stage`, `#sample` y `#fontFile`.

**Sin setters nuevos.** Ninguna variable de estos tres módulos se escribe desde fuera.

### 10.3 `renderPng` sigue intacto

El patrón se conserva literal:

```js
const oc = cw, oh = ch, S = doc.cols * doc.rows > 60000 ? 1.5 : 2;
setCellSize(8 * S, 16 * S);
try { …dibuja el PNG… }
finally { setCellSize(oc, oh); }
```

La prueba correspondiente lo verifica tras la migración: el PNG sale a 1616x1600 px para
101x50 celdas (exactamente 2x) y `zoom`, `cw`, `ch` y el tamaño del lienzo quedan idénticos
antes y después.

### 10.4 Desviaciones respecto al plan

1. **`cropLayer` se movió a `js/layers.js`**, no a `ui/canvas-size.js` como decía el plan de la
   Fase 1. Motivo: lo usan `image.convert` (que migra ahora) y `resizeTo` (que sigue en
   `main.js` hasta que exista `canvas-size.js`). Recortar la rejilla de una capa es lógica de
   capas, así que ese es su sitio natural y no habrá que volver a moverlo.
2. **`#fontFile` se queda en `main.js`.** Está físicamente en la sección Exportar pero es una
   función del panel Text: su cuerpo solo usa exportaciones de `tools/text.js`, así que no
   necesita convertirse en función con nombre. Irá a `view.js` o se quedará en el `init()`.

### 10.5 Efecto lateral: `check_state.py` se quedó sin avisos

Los 7 avisos "a revisar a mano" de la etapa 5 **desaparecieron solos**: la local `ch` de
`asciifyPixels` se fue a `image.js`, que no importa `ch` de `canvas.js`, y la local `size` del
listener de `#savePng` se fue a `io/export.js`, que no importa `size` de `tools.js`. Las dos
sombras de nombre dejaron de serlo sin renombrar nada.

### 10.6 Hallazgos

Ninguno nuevo de la aplicación. Las tres pruebas que fallaron al engancharlas eran fallos de
los propios tests, no de la app:

1. **Recolor y Erase**: el foco se quedaba en `#colorHex` y el atajo de teclado se ignora
   dentro de un `<input>` — que es el comportamiento correcto y deliberado del manejador
   global. Se añadió un `blur()` en los tests.
2. **`#font` es un `<select hidden>`** por diseño: la interfaz real es el botón `#fontBtn` con
   su desplegable. `select_option` no puede actuar sobre un elemento oculto; el test restaura
   la fuente igual que lo hace `pickFont()`.
3. **Celda vacía leída como cadena vacía**: los dos espacios que separan los campos de
   `#cellInfo` se funden con el carácter cuando este es un espacio. Se añadió el helper
   `vacia()` en el test.

Sigue pendiente, como mejora posterior y **sin tocar**: Escape con el menú contextual abierto
quita también la selección (sección 9.8).

### 10.7 Tres extracciones mal cortadas, detectadas por la carga del módulo

La primera versión de `export.js` e `image.js` incluía por error el `});` de cierre de los
listeners dentro de las funciones con nombre, y `main.js` se quedó sin la apertura del IIFE.
Los tres fallos eran `SyntaxError` y los detectó la carga real de la página en el navegador.
**Aviso para quien siga**: el `diff` de fidelidad no los habría encontrado nunca, porque
compara contra el mismo rango de líneas que se eligió mal. Conviene cargar la página antes de
lanzar el suite completo: cuesta 3 segundos y localiza el problema de inmediato.

No hay `node` en este equipo, así que el `node --check` pedido se sustituyó por la carga real
de los 17 módulos en el navegador, que es una comprobación de sintaxis equivalente o mejor:
además del parseo verifica que todos los imports resuelven.

### 10.8 Pendiente

`ui/canvas-size.js` y `view.js`, y después la etapa 7: `main.js` con el `init()` definitivo,
el aviso de pantalla pequeña dentro y fuera el IIFE.

Para la limpieza final queda: `askTimer` sin uso y el bucle duplicado entre `layBounds` y
`selectLayer`. Los dos renombrados de variables locales que estaban anotados (`ch` y `size`)
ya no hacen falta.

---

## 11. Etapa 7 ejecutada — cierre de `main.js`

Copia previa: `../seuratty-etapa7/`. Resultado: **`tests/smoke.py` 44/44**, `check_state.py` y
`check_imports.py` exit 0, captura del lienzo **idéntica**, 0 errores de consola.

### 11.1 Módulos creados

| Módulo | Líneas | Contenido |
|---|---|---|
| `js/ui/canvas-size.js` | 90 | `rsDims`, `askTimer`, `askNew`, `resizeTo`, `showBox`, `grip`/`rsBox`/`gripDrag` (privadas), `onNewYes`, `onResizeApply`, `onGripDown/Move/Up/Cancel/LostCapture/Keydown`, `initCanvasSize` |
| `js/view.js` | 106 | `stg`, `setZoom`, `wheelAcc`/`pan` (privadas), `onStageWheel`, `onStageMouseDown`, `onStagePointerDown`, `onStagePointerMove`, `endPan`, `onKeydown`, `initFoldPanels`, `dockTabs`+`showTab`, `initDockTabs`, `initView` |
| `js/ui/tooltips.js` | 25 | `toolTip` (privada), `initTooltips`, `hideTip`, `showTip`, `initInfoTooltips` |
| `js/ui/small-screen.js` | 11 | `initSmallScreen` |

**`main.js`: 333 → 83 líneas**, de las cuales 19 son imports, 34 el `init()` y 25 el aviso de
licencias de terceros. Solo queda: imports, `init()` y la llamada `init()`.

### 11.2 Un único punto de arranque

`init()` llama a los 22 `initXxx()` en el mismo orden en que antes se ejecutaban las
instrucciones de arriba abajo, y después corre el bloque de inicio sin cambios. Cada módulo
registra sus propios listeners dentro de su `init`, así que ya no hay ningún
`addEventListener` en `main.js`. **El IIFE desapareció**: el ámbito de módulo ya es privado.

Orden preservado, incluidos los puntos sensibles: `initCmenuEvents()` registra el `keydown` en
captura de `#cmenu` **antes** de que `initCanvasSize()` registre el del diálogo *New canvas*,
y `initCanvasTools()` registra los listeners de `#cv` antes que `initSelectEvents()`.

### 11.3 Dos regresiones encontradas y corregidas

Al revisar `main.js` para trocearlo aparecieron **dos `ReferenceError` latentes desde la etapa
5**, confirmados en el navegador:

| Síntoma | Causa |
|---|---|
| `flist is not defined` al pulsar ↓ o ↑ sobre el botón de fuente | el listener se quedó en `main.js` pero `flist` es privada de `tools/text.js` |
| `popOpenedAt is not defined` al desplazar con el desplegable abierto | igual, `popOpenedAt` es privada de `tools/text.js` |

Rompían la navegación por teclado del selector de fuentes. Los **42 tests y los tres
comprobadores pasaban igual**: el primero solo se dispara con esa tecla concreta, y el segundo
está detrás de un `!pop.hidden &&` que cortocircuitaba con el desplegable cerrado.

La etapa 7 los corrige por construcción, porque esos listeners se han movido a `initFontPopEvents()`
dentro de `tools/text.js`. Además:

- **Prueba nueva** `t_font_popup_keyboard`: flechas, Escape, foco de vuelta al botón y cierre al
  desplazar. Cubre las dos rutas rotas.
- **`check_imports.py` reforzado**: ahora también detecta el uso de una variable **privada de
  otro módulo**, que es justo esta clase de fallo y que la comprobación anterior no veía (solo
  cruzaba contra lo exportado). Verificado con un auto-test reintroduciendo la fuga de `flist`:
  sale con exit 1 y señala el módulo dueño.

### 11.4 Desviaciones respecto a lo pedido

1. **El autosave no se llevó a `js/io/autosave.js`.** Su lógica (`SAVE_KEY`, `store`,
   `serialize`, `saveNow`, `scheduleSave`) ya vivía en `js/io/save.js` desde la etapa 3; lo único
   que quedaba suelto eran tres listeners de ventana. Se añadió `initAutosave()` a `save.js` en
   vez de partir el módulo en dos.
2. **`showTip` y el globo flotante se movieron de `tools/tools.js` a `ui/tooltips.js`.** El
   bucle de los iconos "i" usaba `toolTip`, privada de `tools.js`. En vez de exportar la
   variable, el globo pasa a ser infraestructura compartida: `tools.js` ahora importa `showTip`
   y `hideTip`. Es el único cambio de código real de la etapa (dos llamadas `toolTip.hidden =
   true` pasaron a `hideTip`).
3. **Los listeners del panel Text siguen registrándose desde `initTextPanel()`**, llamado entre
   `initExportTop()` e `initExportBottom()`, porque estaban físicamente en la sección Exportar.
   Así se conserva el orden original sin que `export.js` sea dueño de la UI de texto.

### 11.5 Pruebas: de 42 a 44

Lo que pediste cubrir ya estaba cubierto por las pruebas de las etapas anteriores: zoom/rueda/
paneo (`t_zoom_pan`), atajos (`t_brush_size`, `t_nudge_selectall`, `t_escape`, teclas 1-8 en los
tests de herramientas), pestañas y paneles (`t_dock_tabs`, `t_collapsible`), New canvas
(`t_new_canvas`), resize por campos y por tirador (`t_resize_fields`, `t_resize_grip`) y
autosave con recarga (`t_autosave`). No se duplicó ninguna.

Se añadieron solo las dos que faltaban de verdad: `t_font_popup_keyboard` (la regresión de 11.3)
y `t_redo_shortcuts` (Ctrl+Y y Ctrl+Shift+Z, que ninguna prueba tocaba).

### 11.6 Pendientes anotados, sin tocar

- Escape con el menú contextual abierto quita también la selección (sección 9.8).
- `askTimer` declarada y nunca usada, ahora en `ui/canvas-size.js`.
- Bucle duplicado entre `layBounds` (`layers.js`) y `selectLayer` (`tools/select.js`).

---

## 12. Bloque B — fuentes por fetch y comentarios en inglés

Copia previa: `../seuratty-etapa7/`; copia del resultado: `../seuratty-bloqueB/` (ambas sin
`backup/`). Resultado: **`tests/smoke.py` 46/46**, `check_state.py` y `check_imports.py`
exit 0, captura del lienzo **idéntica** a `tests/screenshots/base.png`, 0 errores de consola.

### 12.1 `data/fonts.js` → `data/fonts.json`

`data/fonts.js` era un script clásico de una sola línea (`window.FIGFONTS={…};`, 1.380.279 B).
Se le quitó el prefijo `window.FIGFONTS=` y el `;` final y el resto se escribió **literal**
como `data/fonts.json` (1.380.261 B, 1,32 MiB, 89 fuentes), sin reserializar: así el JSON no
puede diferir en el escapado.

Verificado dos veces antes de borrar nada: `json.loads` de los dos lados da el mismo objeto,
y en el navegador se cargaron a la vez `data/fonts.js` y `data/fonts.json` comparando clave a
clave — mismas 89 claves, en el mismo orden, y mismo valor en todas.

Borrados: `data/fonts.js` y su `<script src="data/fonts.js">` de `index.html`. `js/figlet.js`
sigue siendo un script clásico y no se tocó.

### 12.2 `js/fonts.js` (nuevo, 12 líneas)

```js
export const FONTS = {};
export async function loadFonts(){
  const res = await fetch(new URL('../data/fonts.json', import.meta.url));
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + res.statusText);
  Object.assign(FONTS, await res.json());
  return FONTS;
}
```

`new URL(..., import.meta.url)` resuelve la ruta contra el módulo, así que funciona igual en
una subcarpeta de GitHub Pages. **`FONTS` se rellena en su sitio** (`Object.assign`) en vez de
reasignarse: conserva la identidad del objeto, así que `tools/text.js` sigue viendo el mismo
que antes y cargar un `.flf` sigue añadiendo a él (`FONTS[name] = …`). Por eso no hace falta
setter y `check_state.py` sigue en cero.

`tools/text.js` pasó de `const FONTS = window.FIGFONTS || {}` a importarlo de `fonts.js` y
**re-exportarlo** (`export { FONTS };`), de modo que `main.js` no cambia su import. Cero
ejecución y cero listeners al importar, como el resto de módulos.

### 12.3 Arranque asíncrono

`main.js` ya no llama a `init()` directamente, sino a un `boot()` nuevo:

```js
async function boot(){
  let fontsError = '';
  try { await loadFonts(); }
  catch (e){ fontsError = 'Could not load the FIGlet fonts (…). Everything else works; …'; }
  init();
  if (fontsError) say(fontsError);
  document.body.dataset.ready = '1';
}
```

`init()` no cambia por dentro: el orden de los 22 `initXxx()` y del bloque de inicio es el
mismo. Si el fetch falla, la aplicación arranca igual y solo se queda sin fuentes figlet
(`figLines` ya devolvía `[text]` cuando no hay fuente), y el aviso en inglés se muestra
**después** de `init()` para que no lo pise el `say()` del bloque de inicio.

`document.body.dataset.ready = "1"` es la señal de "aplicación lista": los tests la esperan en
vez de usar temporizadores.

### 12.4 Pruebas: de 44 a 46

- Helper `wait_ready(page)` (espera `body.dataset.ready === "1"`) usado tras cada `goto` y cada
  `reload`: arranque, autoguardado, aviso de pantalla pequeña y el `goto` inicial de `main()`.
  Sustituye los dos `wait_for_function` sobre `#msg` del aviso de pantalla pequeña.
- **`t_fonts_fetch`**: `performance.getEntriesByType('resource')` confirma que `data/fonts.json`
  se pidió con `initiatorType === 'fetch'`, que `window.FIGFONTS` ya no existe, que no queda
  ningún `<script>` de `data/fonts.js` y que el selector sigue con 90 opciones.
- **`t_fonts_404`**: contexto aparte con `page.route` que responde 404 a `data/fonts.json`.
  Comprueba que la señal de lista llega igual, que el mensaje de error sale en inglés, que el
  arte de ejemplo se dibuja, que el selector queda solo con "No font", que el texto se coloca
  en una línea y que se puede dibujar y deshacer. Sin `pageerror`.

### 12.5 Comentarios a inglés

Traducidos **136 comentarios**: 77 en `js/` (18 archivos) y 59 entradas en `tests/` (28
comentarios y 19 docstrings de `smoke.py`, más los tres comprobadores). `css/style.css` e
`index.html` no tenían ningún comentario. `js/figlet.js` (terceros) y `docs/refactor-log.md`
no se tocaron. No se cambió ninguna cadena: los nombres de los pasos del test, los mensajes de
`assert` y la salida de `check_state.py` / `check_imports.py` siguen en español, porque son
código, no comentarios.

Verificación de que **solo** cambiaron comentarios: se quitaron los comentarios de los dos
árboles (`//`, `/* */`, `<!-- -->`, `#` y docstrings de nivel de sentencia) y se comparó
`../seuratty-etapa7` con la carpeta actual. El diff resultante contiene exactamente los cuatro
archivos del paso 1 (`index.html`, `js/main.js`, `js/tools/text.js`, `tests/smoke.py`) más
`data/fonts.js` borrado y `js/fonts.js` nuevo. Los otros 18 archivos de `js/` y los tres de
`tests/` no aparecen: su código es idéntico carácter a carácter.

Los finales de línea se conservaron archivo por archivo (el árbol mezcla LF y CRLF).

### 12.6 Pendientes, sin tocar

Los mismos de 11.6: Escape con el menú contextual abierto quita también la selección;
`askTimer` declarada y sin usar en `ui/canvas-size.js`; bucle duplicado entre `layBounds` y
`selectLayer`.

---

## 13. Cierre: documentación, licencias y auditoría para GitHub Pages

Copia previa: `../seuratty-bloqueB/`; copia del resultado: `../seuratty-final/`. Resultado:
**`tests/smoke.py` 46/46**, `check_state.py` y `check_imports.py` exit 0, captura del lienzo
**idéntica** a `tests/screenshots/base.png`, 0 errores de consola.

### 13.1 Archivos nuevos en la raíz

| Archivo | Qué |
|---|---|
| `LICENSE` | MIT, `Copyright (c) 2026 williamsaragorn2` |
| `THIRD_PARTY.md` | 217 líneas: asciify-them, ascii-view, figlet.js y las 89 fuentes FIGlet |
| `README.md` | descripción, captura, demo (placeholder), Features, Run locally, Deploy, estructura, Tests, License |
| `docs/screenshot.png` | copia de `tests/screenshots/base.png` (68.718 B) |
| `.nojekyll` | vacío, para que Pages sirva el árbol tal cual |
| `.gitignore` | `__pycache__/`, `*.pyc`, `.vscode/`, `tests/tmp/`, `tests/screenshots/current.png` |

`tests/.tmp` no existía; lo que las pruebas generan es `tests/tmp/` (con `art.txt`,
`art.seuratty`, `art.png`) y `tests/screenshots/current.png`, así que son esos los ignorados.

### 13.2 De dónde salen los avisos de licencia

Todo lo que el proyecto registraba estaba en tres sitios, y se copió literal:

- **`js/main.js`**, bloque "Third-party notices" del final: licencia MIT de asciify-them con
  `Copyright (c) 2026 Andrea Scalia`, la línea "Partially based on ascii-view by Xander Gouws,
  Copyright (c) 2025 Xander Gouws", el texto MIT completo y la coletilla de ascii-view
  (`https://github.com/gouwsxander/ascii-view`, MIT, `Copyright (c) 2025 Xander Gouws`).
- **`backup/index.original.html`** (líneas 3313-3337): el **mismo** aviso, palabra por palabra.
  No aportaba nada que no estuviera ya en `main.js`.
- **`index.html`**: las notas de los paneles — asciify-them con su URL
  (`https://github.com/ndrscalia/asciify-them`) y "figlet.js (MIT). Fonts keep their authors'
  credits."

**`js/figlet.js` no tiene cabecera**: empieza en `(function(){` y no menciona autor, año ni URL
en sus 1.374 líneas. Lo único que consta es el "(MIT)" de `index.html`.

### 13.3 Los "TODO: verify" que quedan (nada inventado)

1. **figlet.js**: URL de origen, titular del copyright y año. El archivo no los trae.
2. **Seis fuentes sin autor en su cabecera**: `ANSI Shadow`, `ANSI Regular`, `Elite`,
   `Calvin S` y `THIS` dicen literalmente `Font Author: ?`; `Nancyj` no tiene ninguna línea de
   crédito.
3. **Términos del conjunto de fuentes**: las cabeceras dan créditos, no una licencia única.

La tabla de `THIRD_PARTY.md` se generó leyendo `data/fonts.json` y volcando **verbatim** hasta
tres líneas de crédito por fuente (se filtró el relleno del tipo "This font has been created
using JavE's FIGlet font export assistant"). Se anotan aparte las licencias que sí constan:
`ANSI Compact` ("free to use and distribute / MIT License"), `Emboss` (**WTFPL v2**, de Sam
Hocevar — no es MIT), `Efti Robot` ("(c) Michel Eftimakis 1995") y la línea de permiso clásica
de FIGlet que llevan la mayoría.

### 13.4 Limpieza y ajustes

- **`backup/` eliminado** (3,0 MB): `backup/index.original.html` y la copia
  `backup/seauritybackup/`. El HTML monolítico original **sigue en el artifact v48** y también
  en `../seuratty-paso1/backup/index.original.html`, verificado byte a byte con `cmp` antes de
  borrar.
- **`index.html`**: añadido `<link rel="icon" href="data:,">` tras el `<title>`, que ya era
  `Seuratty`. Evita la petición de favicon y su 404.
- **"seauritty" → "seuratty"**: **cero ocurrencias** en `index.html`, `js/`, `css/` y `tests/`.
  La falta de ortografía solo está en el nombre de la carpeta local de trabajo; las claves de
  `localStorage` (`seuratty.work.v1`, `seuratty.mobileNote`) y la extensión `.seuratty` ya
  estaban bien escritas. No se cambió nada.

### 13.5 Auditoría para GitHub Pages (Linux, sensible a mayúsculas)

Se cruzaron **131 rutas** (imports ES, `new URL(...)`, `fetch`, `src`, `href`, `url()` de CSS y
enlaces de los Markdown) contra el inventario real de los 43 archivos del árbol, comparando la
capitalización exacta:

- **Ninguna ruta absoluta** ni `file:`; todas relativas y dentro del proyecto.
- **Ningún desajuste de mayúsculas** y ningún destino inexistente.
- **Ninguna referencia a lo borrado** salvo dos deliberadas: `tests/smoke.py` (`t_fonts_fetch`)
  comprueba justamente que **no** queda ningún `<script src="data/fonts.js">` ni
  `window.FIGFONTS`. Se dejan como están.
- Las rutas que las pruebas construyen con `pathlib` (`tests/screenshots/base.png`,
  `tests/fixtures/`, `tests/tmp/`) coinciden también en capitalización.

Lo único que sale del proyecto son las dos hojas de estilo de Google Fonts, por `https://`.

### 13.6 Pendientes, sin tocar

Los mismos de 11.6 y 12.6: Escape con el menú contextual abierto quita también la selección;
`askTimer` declarada y sin usar en `ui/canvas-size.js`; bucle duplicado entre `layBounds` y
`selectLayer`. Y, fuera del código, los tres `TODO: verify` de 13.3.

---

## 14. Image to ASCII como selección flotante

Nueva funcionalidad (se levantó la regla de comportamiento idéntico solo para esto).
Copia previa: `../seuratty-antes-imagen-flotante/`; copia del resultado:
`../seuratty-imagen-flotante/`. Resultado: **`tests/smoke.py` 52/52**, `check_state.py` y
`check_imports.py` exit 0, captura base idéntica, 0 errores de consola.

### 14.1 Causa del fallo original

El pegado de Select guarda lo pegado en una capa temporal "Pasted" de `cols × rows`, y
`pasteText` descarta al insertar lo que no cabe; además `floatTo`/`shiftTo` limitan el
arrastre al lienzo. Reproducido: un bloque de 6×4 pegado en (17,8) de un lienzo 20×10 conserva
6 de 24 celdas, y siguen siendo 6 al devolverlo hacia adentro.

### 14.2 Qué se hizo

- `js/tools/floatimg.js` (nuevo): buffer propio de la imagen (`w, h, x, y, chars, colors`, con
  `x/y` que pueden ser negativos) y un overlay `#fimg` que la dibuja entera, con fondo opaco y
  sin recortar. `stampFimg` la escribe en la capa y recorta lo que queda fuera.
- `tools/select.js`: `insertFloatImage` (activa Select y centra la imagen; si no cabe, amplía el
  lienzo con `growDocTo`, sin historial propio), arrastre `mode: 'fimg'` libre (siempre queda
  una celda dentro para poder agarrarla), y confirmación/cancelación reutilizando
  `commitPaste`/`cancelPaste`: cualquier gesto que hoy fija un pegado (clic fuera, cambiar de
  herramienta o de capa, `layerOp`, `replaceDoc`) fija también la imagen.
- `layers.js`: `growDocTo` (cropLayer sobre todas las capas). `image.js`: Convert ya no estampa,
  llama a `insertFloatImage`; tocar un control mientras flota la reemplaza sin apilar historial.
- `history.js`, `layers.js`, `view.js`: `pend || fimg` en undo/redo/setActive/deleteLayerAt;
  Escape con imagen flotante la descarta; flechas, Supr, Ctrl+A y menú contextual se ignoran
  mientras flota (operarían sobre la capa de debajo).
- `io/save.js`: `commitPaste(false)`: el autoguardado no fija una imagen flotante.
- UI: nota del panel actualizada; logo `data/seuratty_logo.png` junto al título.

### 14.3 Interpretación

- "Borrar lo de abajo": al confirmar, toda celda que cubre la imagen se sustituye, también con
  sus vacías; la vista previa ya lo muestra (overlay opaco).
- "No cortar": nada se pierde mientras flota; solo se recorta al confirmar, sin ampliar el lienzo.
- Tope de tamaño: `imgToDoc` ya limita a 400×200, igual que el lienzo, así que ampliar nunca lo
  supera. La capa activa no cambia hasta confirmar; si su nombre es "Layer N", toma el de la imagen.

### 14.4 Pruebas (de 46 a 52)

`t_image` reescrito (a) y seis pasos nuevos: (b) sobrescribe 1 a 1, vacías incluidas; (c)
imagen mayor que el lienzo; (d) sale por una esquina y vuelve completa; (d2) confirmar a medio
salir recorta sin ampliar; (e) un Ctrl+Z; (f) Escape sin residuos. El bloque guarda el documento
al empezar y lo restaura al final (achicar el lienzo con cropLayer no se deshace al volver a
agrandarlo).

Dos tests existentes fallaban por el orden, no por la app (el antiguo `t_image` los enmascaraba
al dejar la capa renombrada y el lienzo en 101×50):
- `t_tool_erase_modes` leía la vista combinada; tras `t_layer_reorder_drag` la activa es una capa
  vacía y "Layer 1" ya tiene `█` en (12,16). Ahora comprueba la capa activa.
- `t_font_popup_keyboard`: con el lienzo en 101×48 `#stage` no tiene desborde, `scrollTop += 2`
  no mueve nada y no hay evento. Si no se movió, el test despacha el evento `scroll`.

### 14.5 Casos límite sin resolver

- Lo que cuelga por arriba o por la izquierda no se ve (`.wrap` no tiene padding ahí); los datos
  se conservan.
- Una imagen flotante no se autoguarda: si se recarga la página mientras flota, se pierde.
- Ctrl+C con la imagen flotante copia lo que hay debajo, no la imagen.
- Tocar un control del panel mientras flota la vuelve a centrar.
- Un Ctrl+Z no restaura el nombre de la capa (comportamiento previo de `loadSnap`).
- Pendientes anteriores, sin tocar: Escape con menú contextual, `askTimer`, bucle
  `layBounds`/`selectLayer`. Visto de paso: `view.js` registra un listener de `#zoom` al
  importarse y llama dos veces a `initFoldPanels()` en `initView()`.
