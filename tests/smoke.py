#!/usr/bin/env python
"""
Seuratty smoke test.

Serves the project folder over HTTP and drives the page with Playwright
(msedge channel, the Edge already installed). It is the success criterion
before and after every stage of the refactor to ES modules.

Usage:
    python tests/smoke.py                 # run everything
    python tests/smoke.py --headed        # with a visible window
    python tests/smoke.py --baseline      # re-record tests/screenshots/base.png

Output: list of OK/FALLO steps, and exit code 0 only if everything passes.
"""

import argparse
import functools
import hashlib
import http.server
import json
import pathlib
import re
import struct
import sys
import threading
import zlib

from playwright.sync_api import sync_playwright

# the Windows console is cp1252: without this, printing a braille character blows up
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="backslashreplace")
    except Exception:
        pass

ROOT = pathlib.Path(__file__).resolve().parent.parent
SHOTS = ROOT / "tests" / "screenshots"
FIXTURES = ROOT / "tests" / "fixtures"
TMP = ROOT / "tests" / "tmp"
SAVE_KEY = "seuratty.work.v1"

results = []
console_errors = []
SAVED = {}


# ---------- helpers ----------

def step(name):
    """Marks a function as a test step; records OK/FALLO and carries on."""
    def deco(fn):
        @functools.wraps(fn)
        def run(*a, **kw):
            try:
                detail = fn(*a, **kw)
                results.append((name, True, detail or ""))
                print(f"  OK    {name}" + (f"  ({detail})" if detail else ""))
                return True
            except Exception as e:
                msg = f"{type(e).__name__}: {e}"
                results.append((name, False, msg))
                print(f"  FALLO {name}\n          {msg}")
                return False
        return run
    return deco


def on_console(m):
    """Records console errors; ignores the favicon, which the browser asks for on its own."""
    if m.type != "error":
        return
    url = (m.location or {}).get("url", "")
    if "favicon" in url or "favicon" in m.text:
        return
    console_errors.append(f"{m.type}: {m.text} @ {url}")


def serve(directory, port=0):
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(directory))
    handler.log_message = lambda *a, **kw: None
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_address[1]}"


def make_flf(path, nombre="SmokeTest"):
    """Minimal but valid FIGlet font: height 1, the 95 ASCII and the 7 German characters."""
    cab = "flf2a$ 1 1 6 0 1\nFuente minima generada por tests/smoke.py\n"
    cuerpo = "".join(("$" if c == 32 else chr(c)) + "@@\n" for c in range(32, 127))
    cuerpo += "".join(ch + "@@\n" for ch in "ÄÖÜäöüß")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(cab + cuerpo, encoding="utf-8")
    return path


def set_tab(page, tab_id):
    page.click(tab_id)
    page.wait_for_timeout(80)


def make_png(path, w=72, h=72):
    """Test RGBA PNG with no external dependencies (gradient + opaque block)."""
    raw = b""
    for y in range(h):
        raw += b"\x00"
        for x in range(w):
            inside = 18 < x < 54 and 18 < y < 54
            raw += bytes((x * 3 % 256, y * 3 % 256, 200 if inside else 40, 255))

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw))
    png += chunk(b"IEND", b"")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(png)
    return path


def wait_ready(page, timeout=15000):
    """Waits for the boot-done signal: main.js sets body.dataset.ready = "1" once it has
    fetched the fonts and run init(). Avoids relying on timers."""
    page.wait_for_function("() => document.body.dataset.ready === '1'", timeout=timeout)


def wait_msg(page, pattern, timeout=9000):
    page.wait_for_function(
        "p => new RegExp(p).test(document.querySelector('#msg').textContent)",
        arg=pattern, timeout=timeout)
    return page.inner_text("#msg")


def msg(page):
    return page.inner_text("#msg")


def expand(page, title):
    """The panels of the right bar start collapsed; opens the one that is needed."""
    btn = page.locator(".side .panel > h2 > button.fold").filter(
        has_text=re.compile(r"^" + re.escape(title) + r"$"))
    if btn.get_attribute("aria-expanded") == "false":
        btn.click()
    page.wait_for_timeout(60)


def zoom_of(page):
    return float(page.locator("#zoom").input_value())


def cell_pt(page, cx, cy):
    """Center of the canvas cell (cx, cy), in window coordinates."""
    bb = page.locator("#cv").bounding_box()
    z = zoom_of(page)
    cw, ch = 8 * z, 16 * z
    x, y = bb["x"] + cx * cw + cw / 2, bb["y"] + cy * ch + ch / 2
    st = page.locator("#stage").bounding_box()
    if not (st["x"] <= x <= st["x"] + st["width"] and st["y"] <= y <= st["y"] + st["height"]):
        raise AssertionError(f"la celda ({cx},{cy}) queda fuera de la parte visible del lienzo")
    return x, y


def drag(page, a, b, button="left", steps=10):
    page.mouse.move(*a)
    page.mouse.down(button=button)
    page.mouse.move(*b, steps=steps)
    page.mouse.up(button=button)


def scroll_top(page):
    page.evaluate("() => { const s = document.querySelector('#stage'); s.scrollTop = 0; s.scrollLeft = 0; }")
    page.wait_for_timeout(60)


def off_canvas(page):
    """Moves the pointer off the canvas: hides the cell cursor and clears the preview."""
    st = page.locator("#stage").bounding_box()
    page.mouse.move(st["x"] + st["width"] / 2, st["y"] - 40)
    page.wait_for_timeout(60)


def state(page):
    """Document state as the autosave serializes it (waits for the debounce)."""
    page.wait_for_timeout(950)
    return page.evaluate("k => localStorage.getItem(k)", SAVE_KEY)


def canvas_empty(page, sel):
    return page.evaluate("""sel => {
        const c = document.querySelector(sel), g = c.getContext('2d');
        const d = g.getImageData(0, 0, c.width, c.height).data;
        for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) return false;
        return true;
    }""", sel)


def layer_names(page):
    return page.locator("#layers li .lname").all_inner_texts()


def active_layer(page):
    row = page.locator('#layers li[aria-current="true"]')
    return row.locator(".lname").inner_text() if row.count() else None


def dims(page):
    c, r = re.findall(r"\d+", page.inner_text("#dim"))
    return int(c), int(r)


def blur(page):
    """Gives the focus back to the body: several shortcuts only act when the target is document.body."""
    page.evaluate("() => { if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); }")


def cell_info(page, cx, cy):
    """(character, color) that the status bar shows for that cell.

    It has to be read with text_content: inner_text collapses the two spaces
    that separate the fields and leaves the format unrecognizable.
    """
    page.mouse.move(*cell_pt(page, cx, cy))
    page.wait_for_timeout(60)
    m = re.match(r"^col \d+, row \d+ {2}(.*?) {2}(.*)$", page.text_content("#cellInfo") or "")
    return (m.group(1), m.group(2)) if m else (None, None)


def vacia(ch):
    """Cell with no content. A space reads as an empty string because the two
    separator spaces of #cellInfo merge with the character itself."""
    return ch in ("", " ", "⠀", None)


def find_content_cell(page, cells):
    """First cell of the list whose content is not empty."""
    for cx, cy in cells:
        try:
            ch, col = cell_info(page, cx, cy)
        except AssertionError:
            continue
        if not vacia(ch):
            return cx, cy, ch, col
    raise AssertionError(f"ninguna de estas celdas tiene contenido: {cells}")


def paste(page, timeout=2500):
    """A real Ctrl+V; if headless does not deliver it, an equivalent synthetic paste event."""
    page.keyboard.press("Control+v")
    try:
        wait_msg(page, r"^Pasted\.", timeout=timeout)
        return "Ctrl+V real"
    except Exception:
        txt = page.evaluate("() => navigator.clipboard.readText()")
        page.evaluate("""t => {
            const dt = new DataTransfer(); dt.setData('text/plain', t);
            document.dispatchEvent(new ClipboardEvent('paste', {clipboardData: dt, bubbles: true, cancelable: true}));
        }""", txt)
        wait_msg(page, r"^Pasted\.")
        return "evento paste sintetico"


def ctrl_wheel(page, dy):
    """Ctrl+wheel over the canvas; if headless does not propagate the modifier, a synthetic event."""
    st = page.locator("#stage").bounding_box()
    x, y = st["x"] + st["width"] / 2, st["y"] + st["height"] / 2
    page.mouse.move(x, y)
    before = zoom_of(page)
    page.keyboard.down("Control")
    page.mouse.wheel(0, dy)
    page.keyboard.up("Control")
    page.wait_for_timeout(150)
    if zoom_of(page) != before:
        return "rueda real"
    page.evaluate("""([x, y, dy]) => document.querySelector('#stage').dispatchEvent(
        new WheelEvent('wheel', {deltaY: dy, ctrlKey: true, clientX: x, clientY: y, bubbles: true, cancelable: true}))""",
        [x, y, dy])
    page.wait_for_timeout(150)
    return "evento wheel sintetico"


def export_text(page, fmt):
    """Export > Copy, then read the clipboard."""
    expand(page, "Export")
    page.select_option("#fmt", fmt)
    page.click("#copy")
    wait_msg(page, r"Copied \(")
    # the Windows clipboard normalizes line breaks to CRLF
    return page.evaluate("() => navigator.clipboard.readText()").replace("\r\n", "\n")


def shift_click(page, pt):
    page.keyboard.down("Shift")
    page.mouse.click(*pt)
    page.keyboard.up("Shift")


def focus_art_layer(page):
    """Makes active the layer that has content under that cell."""
    shift_click(page, cell_pt(page, 50, 7))
    wait_msg(page, r"^(Picked .+\.|No layer here\.)$")


def resize_to(page, cols, rows):
    if dims(page) == (cols, rows):
        scroll_top(page)
        return
    expand(page, "Canvas")
    page.fill("#rsCols", str(cols))
    page.fill("#rsRows", str(rows))
    page.click("#rsApply")
    wait_msg(page, rf"^Canvas {cols} × {rows} cells\.$")
    scroll_top(page)


def layer_cells(page):
    """Non-blank cell count of the active layer, read straight from the live document. Unlike
    state(), which waits out the autosave debounce, this returns immediately: checking a floating
    image is NOT stamped only means something if it is read before autosave's own commitPaste()
    (io/save.js) would fix it in place."""
    return page.evaluate("""async () => {
        const { doc } = await import('./js/core/doc.js');
        const A = doc.layers[doc.active];
        return A.chars.filter(c => c !== doc.blank && c !== ' ').length;
    }""")


def layer_rect(page, x0, y0, w, h):
    """[char, color] of every cell of the active layer inside that rectangle."""
    return page.evaluate("""async ({x0, y0, w, h}) => {
        const { doc } = await import('./js/core/doc.js');
        const A = doc.layers[doc.active], out = [];
        for (let r = 0; r < h; r++) for (let c = 0; c < w; c++){
            const i = (y0 + r) * doc.cols + (x0 + c);
            out.push([A.chars[i], A.colors[i]]);
        }
        return out;
    }""", {"x0": x0, "y0": y0, "w": w, "h": h})


def fimg_info(page):
    """The floating image's own buffer (tools/floatimg.js): it is not part of the document, so this
    is the only way to read it, and the only way to get a converted image's exact non-blank cell
    count (the fixture is a synthetic gradient, not hand-picked content)."""
    return page.evaluate("""async () => {
        const { fimg } = await import('./js/tools/floatimg.js');
        if (!fimg) return null;
        return { w: fimg.w, h: fimg.h, x: fimg.x, y: fimg.y,
                 cells: Array.from(fimg.chars).map((c, i) => [c, fimg.colors[i]]) };
    }""")


def is_blank_cell(pair):
    return pair[0] in (" ", "⠀")


def cells_equal(a, b):
    """Compares [char, color] pairs the way the app itself treats them: any blank spelling matches
    any other, and the color of a blank cell does not matter."""
    if is_blank_cell(a) and is_blank_cell(b):
        return True
    return a[0] == b[0] and a[1] == b[1]


def start_image(page, canvas_cols, canvas_rows, img_cols, img_rows, custom=None):
    """Resizes the canvas, sets an exact width/height on the Image panel and picks the test fixture:
    the image comes in floating, selected, not yet written anywhere. Returns its starting (x, y).
    custom, when given, is a 2-character charset (dark, bright): with the fixture's fixed alpha=255
    it guarantees both filled and blank cells, which the default Braille preset does not at this size."""
    resize_to(page, canvas_cols, canvas_rows)
    expand(page, "Image to ASCII")
    if custom is not None:
        page.select_option("#imgStyle", "custom")
        page.fill("#imgCustom", custom)
    page.fill("#imgCols", str(img_cols))
    page.fill("#imgRows", str(img_rows))
    img = make_png(FIXTURES / "test.png")
    before = layer_cells(page)
    page.set_input_files("#imgFile", str(img))
    wait_msg(page, r"^Image ready: ")
    page.wait_for_timeout(80)
    blur(page)                                                # deja libres los atajos de teclado (Escape, Ctrl+Z, 1..8)
    assert layer_cells(page) == before, "el documento ya cambio antes de confirmar la imagen"
    fi = fimg_info(page)
    assert fi and fi["w"] == img_cols and fi["h"] == img_rows, f"tamano inesperado de la imagen flotante: {fi}"
    return fi


def confirm_at(page, cx, cy):
    """Clicks a cell to fix the floating image (or a pending paste) in place, exactly as clicking
    outside the selection already does."""
    page.mouse.click(*cell_pt(page, cx, cy))
    page.wait_for_timeout(150)


def restore_snapshot(page, saved_json):
    """Puts the document back exactly as parseProject() would on a fresh load (the same shape
    state()/autosave already produces), bypassing the UI. The Image to ASCII tests shrink the shared
    canvas to keep the drag math small; growing it back with cropLayer pads with blank cells instead
    of recovering what the shrink cropped away, so the earlier content has to be restored this way."""
    page.evaluate("""async (raw) => {
        const { parseProject } = await import('./js/io/save.js');
        const { setDoc } = await import('./js/core/doc.js');
        const { relayout } = await import('./js/render/canvas.js');
        const { renderLayers } = await import('./js/layers.js');
        const { clearSel } = await import('./js/tools/select.js');
        const { scheduleDocColors } = await import('./js/ui/color.js');
        const d = parseProject(raw);
        if (!d) throw new Error('parseProject devolvio null');
        setDoc(d); clearSel(); relayout(); renderLayers(); scheduleDocColors();
    }""", saved_json)
    page.wait_for_timeout(80)


# ---------- steps ----------

@step("carga sin errores de consola y con el arte de ejemplo")
def t_load(page, url):
    page.goto(url + "/index.html")
    wait_ready(page)
    wait_msg(page, r"Example loaded\.")
    if not page.locator("#mob").is_hidden():
        page.click("#mobOk")
    assert msg(page) == "Example loaded.", f"mensaje inesperado: {msg(page)!r}"
    assert not console_errors, f"errores de consola: {console_errors}"
    dim = page.inner_text("#dim")
    assert re.match(r"^\d+ × \d+ cells$", dim), f"#dim inesperado: {dim!r}"
    assert not canvas_empty(page, "#cv"), "el lienzo se ve vacio: el arte de ejemplo no se dibujo"
    assert canvas_empty(page, "#pv"), "el overlay #pv deberia arrancar vacio"
    return dim


@step("captura base del lienzo")
def t_baseline(page, rewrite):
    SHOTS.mkdir(parents=True, exist_ok=True)
    # the Google fonts load async: without waiting for them and redrawing, the shot varies between runs
    page.evaluate("async () => { await document.fonts.ready; return true; }")
    page.click("#fit")
    page.wait_for_timeout(250)
    off_canvas(page)
    shot = page.locator("#cv").screenshot()
    base = SHOTS / "base.png"
    if rewrite or not base.exists():
        base.write_bytes(shot)
        return f"grabada {base.name}"
    cur = SHOTS / "current.png"
    cur.write_bytes(shot)
    same = hashlib.sha1(shot).hexdigest() == hashlib.sha1(base.read_bytes()).hexdigest()
    assert same, f"la captura cambio respecto a {base}; mira {cur}"
    return "identica a la base"


@step("Dots (tecla 1) dibuja, y el clic derecho borra")
def t_dots(page):
    page.mouse.click(*cell_pt(page, 8, 3))
    page.keyboard.press("1")
    assert page.get_attribute('.tbtn[data-tool="dots"]', "aria-pressed") == "true"
    before = state(page)
    drag(page, cell_pt(page, 6, 6), cell_pt(page, 20, 6))
    off_canvas(page)
    drawn = state(page)
    assert drawn != before, "dibujar con Dots no cambio el documento"
    assert page.locator("#undo").is_enabled(), "Undo deberia habilitarse tras dibujar"
    drag(page, cell_pt(page, 6, 6), cell_pt(page, 20, 6), button="right")
    off_canvas(page)
    erased = state(page)
    assert erased != drawn, "el clic derecho no borro nada"
    return "dibujo y borrado confirmados"


@step("Undo / Redo")
def t_undo_redo(page):
    a = state(page)
    page.click("#undo")
    b = state(page)
    assert b != a, "Undo no cambio el estado"
    page.click("#redo")
    c = state(page)
    assert c == a, "Redo no devolvio el estado previo"
    page.click("#undo")
    page.click("#undo")
    d = state(page)
    assert d != c, "el segundo Undo no revirtio el trazo"
    assert page.locator("#redo").is_enabled(), "Redo deberia quedar habilitado"
    return "ida y vuelta correcta"


@step("capas: crear, duplicar, renombrar, reordenar y borrar")
def t_layers(page):
    n0 = page.locator("#layers li").count()
    assert n0 == 1, f"se esperaba 1 capa al arrancar, hay {n0}"
    page.click("#lyAdd")
    assert page.locator("#layers li").count() == 2, "+ Layer no agrego una capa"
    page.click("#lyDup")
    assert page.locator("#layers li").count() == 3, "Duplicate no agrego una capa"

    row = page.locator("#layers li").first.locator(".lname")
    row.dblclick()
    inp = page.locator("#layers input[type=text]")
    inp.fill("Prueba")
    inp.press("Enter")
    page.wait_for_timeout(80)
    assert "Prueba" in layer_names(page), f"el renombrado no se aplico: {layer_names(page)}"

    before = layer_names(page)
    page.locator("#layers li").nth(1).locator(".lname").focus()
    page.keyboard.press("ArrowUp")
    page.wait_for_timeout(120)
    after = layer_names(page)
    assert after != before, f"reordenar con ArrowUp no cambio el orden: {before} -> {after}"

    page.locator("#layers li").first.locator(".lytrash").click()
    page.wait_for_timeout(120)
    assert page.locator("#layers li").count() == 2, "borrar la capa no redujo la lista"
    return f"3 -> 2 capas, nombres {layer_names(page)}"


@step("Shift+clic elige la capa bajo el cursor")
def t_pick_layer(page):
    shift_click(page, cell_pt(page, 50, 7))
    wait_msg(page, r"^(Picked .+\.|No layer here\.)$")
    assert msg(page).startswith("Picked "), f"no eligio capa: {msg(page)!r}"
    return msg(page)


@step("Select (tecla 7): seleccionar y mover")
def t_select_move(page):
    off_canvas(page)
    focus_art_layer(page)
    page.keyboard.press("7")
    assert page.get_attribute('.tbtn[data-tool="select"]', "aria-pressed") == "true"
    drag(page, cell_pt(page, 44, 4), cell_pt(page, 58, 10))
    page.wait_for_timeout(80)
    assert page.locator("#selBox").is_visible(), "#selBox no aparecio tras arrastrar"
    before = state(page)
    drag(page, cell_pt(page, 50, 7), cell_pt(page, 53, 9))
    page.wait_for_timeout(120)
    moved = state(page)
    assert moved != before, "mover la seleccion no cambio el documento"
    return "seleccion creada y movida"


@step("Select: Flip horizontal y vertical desde el menu de clic derecho")
def t_flip(page):
    off_canvas(page)
    focus_art_layer(page)
    page.keyboard.press("7")
    # the region must straddle the edge of the drawing: a solid block looks the same flipped
    drag(page, cell_pt(page, 20, 6), cell_pt(page, 36, 16))
    page.wait_for_timeout(80)
    for action, expected in (("fh", "Flipped horizontally."), ("fv", "Flipped vertically.")):
        before = state(page)
        page.mouse.click(*cell_pt(page, 28, 11), button="right")
        page.wait_for_timeout(100)
        assert page.locator("#cmenu").is_visible(), "el menu de clic derecho no aparecio"
        page.click(f'#cmenu button[data-a="{action}"]')
        wait_msg(page, re.escape(expected))
        assert page.locator("#cmenu").is_hidden(), "el menu quedo abierto"
        assert state(page) != before, f"{expected} no cambio el documento"
    return "volteo horizontal y vertical"


@step("Select: Ctrl+C, Ctrl+V a una capa 'Pasted' y fusion al hacer clic fuera")
def t_copy_paste(page):
    off_canvas(page)
    focus_art_layer(page)
    page.keyboard.press("7")
    scroll_top(page)
    drag(page, cell_pt(page, 20, 6), cell_pt(page, 26, 10))   # small block: 7 × 5 cells
    page.wait_for_timeout(80)
    page.evaluate("() => getSelection().removeAllRanges()")
    page.keyboard.press("Control+c")
    wait_msg(page, r"^Copied\.$")
    copied = page.evaluate("() => navigator.clipboard.readText()")
    assert copied.strip(), "el portapapeles quedo vacio tras Ctrl+C"

    # the paste lands where the pointer is: pin it down to know which cell stays outside
    page.mouse.move(*cell_pt(page, 34, 4))
    page.wait_for_timeout(60)
    via = paste(page)
    assert "Pasted" in layer_names(page), f"no se creo la capa temporal: {layer_names(page)}"

    n_before = page.locator("#layers li").count()
    box = page.locator("#selBox").bounding_box()
    out = cell_pt(page, 5, 4)                                  # far from the block pasted at (34, 4)
    assert out[0] < box["x"] - 10, "la celda elegida no quedo fuera de la seleccion"
    page.mouse.click(*out)
    page.wait_for_timeout(250)
    assert "Pasted" not in layer_names(page), f"la capa Pasted no se fusiono: {layer_names(page)}"
    assert page.locator("#layers li").count() == n_before - 1, "la fusion no elimino la capa temporal"
    return via


@step("Select: Supr borra el contenido de la seleccion")
def t_delete(page):
    drag(page, cell_pt(page, 44, 4), cell_pt(page, 58, 10))
    page.wait_for_timeout(80)
    before = state(page)
    page.keyboard.press("Delete")
    after = state(page)
    assert after != before, "Supr no borro el contenido seleccionado"
    page.keyboard.press("Escape")
    return "contenido borrado"


@step("Text (tecla 6): vista previa, colocado y overlay #pv limpio")
def t_text(page):
    off_canvas(page)
    page.keyboard.press("6")
    assert page.get_attribute('.tbtn[data-tool="text"]', "aria-pressed") == "true"
    page.mouse.move(*cell_pt(page, 12, 12))
    page.wait_for_timeout(150)
    assert not canvas_empty(page, "#pv"), "no se dibujo la vista previa en #pv"
    before = state(page)
    page.mouse.click(*cell_pt(page, 12, 12))
    page.wait_for_timeout(150)
    assert canvas_empty(page, "#pv"), "quedaron restos en #pv justo despues de colocar el texto"
    placed = state(page)
    assert placed != before, "colocar el texto no cambio el documento"
    off_canvas(page)
    assert canvas_empty(page, "#pv"), "quedaron restos en #pv al salir del lienzo"
    return "vista previa, colocado y overlay limpio"


@step("selector de fuentes FIGlet poblado")
def t_fonts(page):
    expand(page, "Text")
    n = page.locator("#font option").count()
    assert n >= 80, f"solo hay {n} fuentes en el selector"
    label = page.inner_text("#fontBtn span")
    assert label.strip(), "el boton de fuente no muestra ninguna"
    assert page.inner_text("#txtPrev").strip(), "la vista previa de texto quedo vacia"
    return f"{n} opciones, activa {label!r}"


@step("las fuentes llegan por fetch de data/fonts.json")
def t_fonts_fetch(page):
    info = page.evaluate("""() => ({
        pedidos: performance.getEntriesByType('resource')
                    .filter(r => r.name.includes('data/fonts.json'))
                    .map(r => r.initiatorType),
        figfonts: typeof window.FIGFONTS,
        scriptViejo: [...document.scripts].filter(s => s.src.includes('data/fonts.js')).length,
        opciones: document.querySelector('#font').options.length,
    })""")
    assert info["pedidos"], "no se pidio data/fonts.json"
    assert "fetch" in info["pedidos"], f"fonts.json no vino por fetch: {info['pedidos']}"
    assert info["figfonts"] == "undefined", "window.FIGFONTS sigue existiendo"
    assert info["scriptViejo"] == 0, "sigue habiendo un <script> de data/fonts.js"
    assert info["opciones"] >= 80, f"solo hay {info['opciones']} opciones de fuente"
    # and the active font really is parsed from what the fetch brought
    assert page.inner_text("#txtPrev").strip(), "la vista previa quedo vacia"
    return f"{info['opciones']} opciones via {info['pedidos'][0]}"


@step("si data/fonts.json da 404 la aplicacion arranca igual, sin fuentes figlet")
def t_fonts_404(browser, url):
    errs = []
    ctx = browser.new_context(viewport={"width": 1600, "height": 1100},
                              screen={"width": 1920, "height": 1080}, device_scale_factor=1)
    try:
        pg = ctx.new_page()
        pg.set_default_timeout(10000)
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.route("**/data/fonts.json", lambda r: r.fulfill(status=404, body="not found"))
        pg.goto(url + "/index.html")
        wait_ready(pg)                                   # it booted despite the failure
        aviso = msg(pg)
        assert "Could not load the FIGlet fonts" in aviso, f"sin mensaje de error: {aviso!r}"
        assert not canvas_empty(pg, "#cv"), "el arte de ejemplo no se dibujo"
        opciones = pg.locator("#font option").count()
        assert opciones == 1, f"deberia quedar solo 'No font': hay {opciones} opciones"
        # the rest of the app responds: drawing, undo and the Text panel
        expand(pg, "Text")
        pg.fill("#txt", "abc")
        pg.wait_for_timeout(120)
        assert pg.inner_text("#txtPrev").strip() == "abc", \
            f"sin fuentes, el texto deberia salir en una linea: {pg.inner_text('#txtPrev')!r}"
        blur(pg)
        off_canvas(pg)
        pg.keyboard.press("1")
        antes = pg.locator("#cv").screenshot()
        drag(pg, cell_pt(pg, 6, 4), cell_pt(pg, 14, 4))
        off_canvas(pg)
        assert pg.locator("#cv").screenshot() != antes, "no se pudo dibujar"
        pg.click("#undo")
        pg.wait_for_timeout(150)
        assert not errs, f"errores en la pagina: {errs}"
    finally:
        ctx.close()
    return "arranca, avisa en ingles y se puede dibujar"


@step("Image to ASCII: al aceptar entra flotante y seleccionada, sin estampar (a)")
def t_image(page):
    off_canvas(page)
    scroll_top(page)
    SAVED["snapshot"] = state(page)                           # los pasos de Image to ASCII achican el lienzo; se restaura al final
    fi = start_image(page, 30, 16, 10, 6)
    assert page.locator('.tbtn[data-tool="select"]').get_attribute("aria-pressed") == "true", \
        "no cambio a la herramienta Select"
    assert not page.locator("#selBox").is_hidden(), "la imagen no quedo seleccionada"
    assert not page.locator("#fimg").is_hidden(), "la imagen flotante no se dibuja"
    nonblank = sum(1 for c in fi["cells"] if not is_blank_cell(c))
    assert nonblank > 0, "la imagen de prueba no genero ninguna celda con contenido"
    confirm_at(page, 0, 0)                                    # deja el lienzo limpio para el siguiente paso
    assert page.locator("#fimg").is_hidden(), "la imagen deberia haberse fijado al confirmar"
    return f"{fi['w']} × {fi['h']} celdas, {nonblank} no vacias, Select activo y sin estampar"


@step("Image to ASCII: al confirmar sustituye las celdas cubiertas, incluidas las vacias (b)")
def t_image_overwrite(page):
    off_canvas(page)
    scroll_top(page)
    fi = start_image(page, 30, 16, 10, 6, custom=" #")        # 2 niveles: fuerza celdas vacias y con contenido
    drag(page, cell_pt(page, fi["x"] + 5, fi["y"] + 3), cell_pt(page, fi["x"] + 7, fi["y"] + 4))
    page.wait_for_timeout(120)
    fi2 = fimg_info(page)                                     # mismas celdas, nueva posicion tras el arrastre
    confirm_at(page, 0, 0)
    placed = layer_rect(page, fi2["x"], fi2["y"], fi2["w"], fi2["h"])
    mismatches = [i for i, (a, b) in enumerate(zip(fi2["cells"], placed)) if not cells_equal(a, b)]
    assert not mismatches, f"{len(mismatches)} celdas no coinciden con la imagen (primera en {mismatches[0]})"
    assert any(is_blank_cell(c) for c in fi2["cells"]), "la imagen de prueba no tenia celdas vacias que probar"
    page.select_option("#imgStyle", "braille")                # deja el panel como lo encontro
    return f"{fi2['w'] * fi2['h']} celdas comparadas 1 a 1, vacias incluidas"


@step("Image to ASCII: una imagen mayor que el lienzo lo amplia sin perder celdas (c)")
def t_image_grows_canvas(page):
    off_canvas(page)
    scroll_top(page)
    resize_to(page, 16, 10)
    expand(page, "Image to ASCII")
    page.fill("#imgCols", "25")
    page.fill("#imgRows", "14")
    page.set_input_files("#imgFile", str(make_png(FIXTURES / "test.png")))
    wait_msg(page, r"^Image ready: ")
    page.wait_for_timeout(80)
    assert dims(page) == (25, 14), f"el lienzo no crecio a 25 x 14: {dims(page)}"
    fi = fimg_info(page)
    expected = sum(1 for c in fi["cells"] if not is_blank_cell(c))
    assert expected > 0
    blur(page)
    page.keyboard.press("1")                                  # el lienzo entero es la imagen: se confirma cambiando de herramienta
    wait_msg(page, r"placed into")
    assert layer_cells(page) == expected, "se perdieron celdas al colocar una imagen mayor que el lienzo"
    assert dims(page) == (25, 14), "el lienzo no debia encoger al confirmar"
    page.keyboard.press("7")
    return f"lienzo 16x10 -> 25x14, {expected} celdas conservadas"


def _drag_to_corner(page, fi, canvas_cols, canvas_rows):
    """Grabs the image 5 columns/3 rows into itself and drags it to the canvas' last cell."""
    gx, gy = fi["x"] + 5, fi["y"] + 3
    drag(page, cell_pt(page, gx, gy), cell_pt(page, canvas_cols - 1, canvas_rows - 1))
    page.wait_for_timeout(120)
    return fimg_info(page)


@step("Image to ASCII: lo que sale del lienzo al arrastrar se conserva completo al volver (d)")
def t_image_offcanvas_roundtrip(page):
    off_canvas(page)
    scroll_top(page)
    cc, cr = 30, 16
    fi = start_image(page, cc, cr, 10, 6)
    hanging = _drag_to_corner(page, fi, cc, cr)
    assert hanging["x"] + hanging["w"] > cc or hanging["y"] + hanging["h"] > cr, \
        "el arrastre no dejo la imagen saliendo del lienzo"
    # la agarra 2 celdas dentro de la parte visible y la devuelve a su posicion original
    hx, hy = hanging["x"] + 2, hanging["y"] + 2
    drag(page, cell_pt(page, hx, hy), cell_pt(page, fi["x"] + 2, fi["y"] + 2))
    page.wait_for_timeout(120)
    back = fimg_info(page)
    assert back["x"] == fi["x"] and back["y"] == fi["y"], \
        f"no volvio a la posicion original: {back['x'], back['y']} != {fi['x'], fi['y']}"
    expected = sum(1 for c in back["cells"] if not is_blank_cell(c))
    confirm_at(page, 0, 0)
    placed = layer_rect(page, back["x"], back["y"], back["w"], back["h"])   # solo el rectangulo de la imagen: el resto del lienzo puede tener otro contenido
    mismatches = [i for i, (a, b) in enumerate(zip(back["cells"], placed)) if not cells_equal(a, b)]
    assert not mismatches, f"{len(mismatches)} celdas no coinciden tras volver a entrar (primera en {mismatches[0]})"
    assert dims(page) == (cc, cr), "el lienzo no debia cambiar de tamano"
    return f"{expected} celdas conservadas tras salir y volver a entrar por una esquina"


@step("Image to ASCII: confirmar con la imagen a medio salir recorta sin ampliar el lienzo (d2)")
def t_image_confirm_offcanvas(page):
    off_canvas(page)
    scroll_top(page)
    cc, cr = 30, 16
    fi = start_image(page, cc, cr, 10, 6)
    hanging = _drag_to_corner(page, fi, cc, cr)
    assert hanging["x"] + hanging["w"] > cc or hanging["y"] + hanging["h"] > cr, \
        "el arrastre no dejo nada fuera del lienzo"
    vx0, vy0 = max(0, hanging["x"]), max(0, hanging["y"])
    vx1 = min(cc - 1, hanging["x"] + hanging["w"] - 1)
    vy1 = min(cr - 1, hanging["y"] + hanging["h"] - 1)
    vw, vh = vx1 - vx0 + 1, vy1 - vy0 + 1
    expected_cells = [hanging["cells"][r * hanging["w"] + c] for r in range(vh) for c in range(vw)]
    confirm_at(page, 0, 0)
    assert dims(page) == (cc, cr), "el lienzo no debia cambiar de tamano al confirmar recortando"
    placed = layer_rect(page, vx0, vy0, vw, vh)
    mismatches = [i for i, (a, b) in enumerate(zip(expected_cells, placed)) if not cells_equal(a, b)]
    assert not mismatches, f"la parte visible no coincide tras recortar ({len(mismatches)} celdas)"
    return f"recorte {vw}x{vh} de {hanging['w']}x{hanging['h']}, lienzo intacto en {cc}x{cr}"


@step("Image to ASCII: un solo Ctrl+Z deshace ampliar el lienzo y fijar la imagen (e)")
def t_image_undo(page):
    off_canvas(page)
    scroll_top(page)
    resize_to(page, 18, 10)
    before = state(page)                                      # lienzo y capas justo antes de que entre la imagen
    expand(page, "Image to ASCII")
    page.fill("#imgCols", "24")
    page.fill("#imgRows", "13")
    page.set_input_files("#imgFile", str(make_png(FIXTURES / "test.png")))
    wait_msg(page, r"^Image ready: ")
    assert dims(page) == (24, 13), "el lienzo no crecio para la imagen"
    blur(page)
    page.keyboard.press("1")                                  # confirma: el lienzo entero es la imagen
    wait_msg(page, r"placed into")
    blur(page)
    page.keyboard.press("Control+z")
    page.wait_for_timeout(200)
    assert dims(page) == (18, 10), f"el lienzo no volvio a 18 x 10: {dims(page)}"
    assert state(page) == before, "un solo Ctrl+Z no dejo el documento exactamente como antes"
    page.keyboard.press("7")
    return "ampliar + fijar deshecho en un solo paso"


@step("Image to ASCII: Escape descarta la imagen flotante sin dejar rastro (f)")
def t_image_escape(page):
    off_canvas(page)
    scroll_top(page)
    start_image(page, 30, 16, 10, 6)
    before_layers = layer_names(page)
    before_cells = layer_cells(page)
    blur(page)
    page.keyboard.press("Escape")
    page.wait_for_timeout(150)
    assert fimg_info(page) is None, "la imagen flotante sigue existiendo"
    assert page.locator("#selBox").is_hidden(), "la seleccion siguio visible"
    assert page.locator("#fimg").is_hidden(), "el overlay de la imagen siguio visible"
    assert dims(page) == (30, 16), "el lienzo cambio de tamano pese a cancelar"
    assert layer_names(page) == before_layers, f"aparecio una capa de mas: {layer_names(page)}"
    assert layer_cells(page) == before_cells, "el documento cambio pese a cancelar"
    if SAVED.get("snapshot"):                                 # deja el lienzo y las capas como los encontraron estos pasos
        restore_snapshot(page, SAVED["snapshot"])
    return "descartada sin residuos"


@step("Export: Copy")
def t_export_copy(page):
    txt = export_text(page, "plain")
    assert txt.strip(), "Export > Copy dejo el portapapeles vacio"
    lines = txt.rstrip("\n").split("\n")
    cols, rows = [int(v) for v in re.findall(r"\d+", page.inner_text("#dim"))]
    assert len(lines) == rows, f"el export tiene {len(lines)} filas y el lienzo {rows}"
    assert len(lines[0]) == cols, f"el export tiene {len(lines[0])} columnas y el lienzo {cols}"
    return f"{cols} × {rows} celdas copiadas"


@step("Export: Save (.txt)")
def t_export_save(page):
    expand(page, "Export")
    page.select_option("#fmt", "plain")
    with page.expect_download() as dl:
        page.click("#save")
    d = dl.value
    assert d.suggested_filename == "art.txt", f"nombre inesperado: {d.suggested_filename}"
    TMP.mkdir(parents=True, exist_ok=True)
    out = TMP / "art.txt"
    d.save_as(str(out))
    assert out.stat().st_size > 0, "el .txt descargado esta vacio"
    return f"{out.name}, {out.stat().st_size} bytes"


@step("Export: Save como Project (.seuratty) y reapertura con Open file")
def t_project_roundtrip(page):
    expand(page, "Export")
    page.select_option("#fmt", "project")
    assert page.locator("#copy").is_disabled(), "Copy deberia deshabilitarse con el formato Project"
    with page.expect_download() as dl:
        page.click("#save")
    d = dl.value
    assert d.suggested_filename == "art.seuratty", f"nombre inesperado: {d.suggested_filename}"
    TMP.mkdir(parents=True, exist_ok=True)
    proj = TMP / "art.seuratty"
    d.save_as(str(proj))
    data = json.loads(proj.read_text(encoding="utf-8"))
    assert data.get("v") == 1 and data.get("layers"), "el proyecto guardado no tiene capas"

    names_before = layer_names(page)
    page.click("#newCv")
    page.click("#newYes")
    wait_msg(page, r"^Blank canvas ")
    expand(page, "Import")
    page.set_input_files("#file", str(proj))
    wait_msg(page, r"art\.seuratty: \d+ × \d+, \d+ layers?\.")
    assert layer_names(page) == names_before, f"las capas no coinciden: {layer_names(page)} vs {names_before}"
    page.select_option("#fmt", "plain")
    return msg(page)


@step("Export: Save .png deja zoom, cw/ch y el tamano del lienzo intactos")
def t_export_png(page):
    expand(page, "Export")
    off_canvas(page)
    probe = """() => ({ zoom: document.querySelector('#zoom').value,
        dim: document.querySelector('#dim').textContent,
        cssW: document.querySelector('#cv').style.width, cssH: document.querySelector('#cv').style.height,
        pxW: document.querySelector('#cv').width, pxH: document.querySelector('#cv').height })"""
    before = page.evaluate(probe)
    with page.expect_download() as dl:
        page.click("#savePng")
    d = dl.value
    assert d.suggested_filename == "art.png", f"nombre inesperado: {d.suggested_filename}"
    TMP.mkdir(parents=True, exist_ok=True)
    out = TMP / "art.png"
    d.save_as(str(out))
    wait_msg(page, r"Saved art\.png")
    png = out.read_bytes()
    assert png[:8] == b"\x89PNG\r\n\x1a\n", "el archivo descargado no es un PNG"
    w, h = int.from_bytes(png[16:20], "big"), int.from_bytes(png[20:24], "big")
    cols, rows = dims(page)
    s = 1.5 if cols * rows > 60000 else 2
    assert (w, h) == (round(cols * 8 * s), round(rows * 16 * s)), \
        f"el PNG deberia salir a {s}x: {w}x{h} para {cols}x{rows} celdas"
    after = page.evaluate(probe)
    assert before == after, f"renderPng no restauro el estado:\n  antes  {before}\n  despues {after}"
    assert not canvas_empty(page, "#cv"), "el lienzo quedo vacio tras el PNG"
    return f"{w}x{h} px, zoom {after['zoom']} intacto"


@step("Eyedropper: Alt+clic copia caracter y color; la tecla 5 vuelve a la herramienta previa")
def t_eyedropper(page):
    off_canvas(page)
    scroll_top(page)
    focus_art_layer(page)
    page.keyboard.press("1")
    cols, rows = dims(page)
    candidatos = [(x, y) for y in range(3, min(rows, 18), 2) for x in range(6, min(cols, 70), 4)]
    cx, cy, ch, col = find_content_cell(page, candidatos)
    page.keyboard.down("Alt")
    page.mouse.click(*cell_pt(page, cx, cy))
    page.keyboard.up("Alt")
    page.wait_for_timeout(120)
    assert page.inner_text("#curGlyph") == ch, \
        f"el caracter activo es {page.inner_text('#curGlyph')!r} y la celda tenia {ch!r}"
    if col.startswith("#"):
        assert page.input_value("#colorHex").lower() == col.lower(), "el color activo no se copio"
    assert page.get_attribute('.tbtn[data-tool="dots"]', "aria-pressed") == "true", \
        "Alt+clic no deberia cambiar de herramienta"
    page.keyboard.press("5")
    assert page.get_attribute('.tbtn[data-tool="pick"]', "aria-pressed") == "true"
    page.mouse.click(*cell_pt(page, cx, cy))
    page.wait_for_timeout(120)
    assert page.get_attribute('.tbtn[data-tool="dots"]', "aria-pressed") == "true", \
        "tras usar el cuentagotas deberia volver a Dots"
    return f"celda ({cx},{cy}) = {ch!r} {col}"


@step("Select: las flechas mueven la seleccion y Ctrl+A la selecciona entera")
def t_nudge_selectall(page):
    off_canvas(page)
    scroll_top(page)
    focus_art_layer(page)
    page.keyboard.press("7")
    drag(page, cell_pt(page, 44, 5), cell_pt(page, 56, 11))
    page.wait_for_timeout(80)
    blur(page)
    before = state(page)
    box0 = page.locator("#selBox").bounding_box()
    page.keyboard.press("ArrowRight")
    page.wait_for_timeout(120)
    box1 = page.locator("#selBox").bounding_box()
    assert box1["x"] > box0["x"], "la flecha no movio el recuadro de seleccion"
    assert state(page) != before, "la flecha no movio el contenido"
    page.keyboard.press("Control+a")
    page.wait_for_timeout(120)
    sel_w = page.locator("#selBox").bounding_box()["width"]
    cv_w = page.locator("#cv").bounding_box()["width"]
    assert abs(sel_w - cv_w) < 2, f"Ctrl+A no selecciono todo: {sel_w} vs {cv_w}"
    page.keyboard.press("Escape")
    return "nudge y Ctrl+A"


@step("Escape cierra el menu contextual y cancela el arrastre de la seleccion")
def t_escape(page):
    off_canvas(page)
    scroll_top(page)
    focus_art_layer(page)
    page.keyboard.press("7")
    page.keyboard.press("Escape")                      # starts with no previous selection
    drag(page, cell_pt(page, 44, 5), cell_pt(page, 56, 11))
    page.wait_for_timeout(80)

    page.mouse.click(*cell_pt(page, 50, 8), button="right")
    page.wait_for_timeout(100)
    assert page.locator("#cmenu").is_visible(), "el menu contextual no se abrio"
    page.keyboard.press("Escape")
    page.wait_for_timeout(100)
    assert page.locator("#cmenu").is_hidden(), "Escape no cerro el menu contextual"
    # Escape also reaches the global shortcut: besides closing the menu, it clears the selection
    assert page.locator("#selBox").is_hidden(), "Escape deberia haber quitado tambien la seleccion"

    drag(page, cell_pt(page, 44, 5), cell_pt(page, 56, 11))     # a fresh selection for the drag
    page.wait_for_timeout(80)
    probes = [(46, 6), (50, 8), (54, 10)]
    before = [cell_info(page, *p) for p in probes]
    box0 = page.locator("#selBox").bounding_box()
    page.mouse.move(*cell_pt(page, 50, 8))
    page.mouse.down()
    page.mouse.move(*cell_pt(page, 54, 10), steps=8)
    page.wait_for_timeout(120)
    page.keyboard.press("Escape")
    page.wait_for_timeout(120)
    page.mouse.up()
    page.wait_for_timeout(150)
    assert page.locator("#fl").is_hidden(), "el lienzo flotante quedo visible"
    box1 = page.locator("#selBox").bounding_box()
    assert abs(box1["x"] - box0["x"]) < 2 and abs(box1["y"] - box0["y"]) < 2, \
        "la seleccion no volvio a su sitio"
    after = [cell_info(page, *p) for p in probes]
    assert after == before, f"el contenido no se restauro:\n  antes  {before}\n  despues {after}"
    page.keyboard.press("Escape")
    return "menu cerrado y arrastre revertido"


@step("Ctrl+Z con un pegado pendiente lo cancela entero y quita la capa Pasted")
def t_paste_undo_pending(page):
    off_canvas(page)
    scroll_top(page)
    focus_art_layer(page)
    page.keyboard.press("7")
    drag(page, cell_pt(page, 20, 6), cell_pt(page, 26, 10))
    page.wait_for_timeout(80)
    page.evaluate("() => getSelection().removeAllRanges()")
    page.keyboard.press("Control+c")
    wait_msg(page, r"^Copied\.$")
    n_before = page.locator("#layers li").count()
    before = state(page)

    page.mouse.move(*cell_pt(page, 34, 4))
    paste(page)
    assert "Pasted" in layer_names(page), f"no se creo la capa temporal: {layer_names(page)}"

    blur(page)
    page.keyboard.press("Control+z")
    page.wait_for_timeout(200)
    assert "Pasted" not in layer_names(page), f"la capa Pasted sigue ahi: {layer_names(page)}"
    assert page.locator("#layers li").count() == n_before, "el numero de capas no volvio a su sitio"
    assert state(page) == before, "el documento no volvio al estado previo al pegado"
    return "pegado cancelado por completo"


@step("un solo Ctrl+Z tras fusionar deshace el pegado con sus movimientos")
def t_paste_undo_merged(page):
    off_canvas(page)
    scroll_top(page)
    focus_art_layer(page)
    page.keyboard.press("7")
    drag(page, cell_pt(page, 20, 6), cell_pt(page, 26, 10))
    page.wait_for_timeout(80)
    page.evaluate("() => getSelection().removeAllRanges()")
    page.keyboard.press("Control+c")
    wait_msg(page, r"^Copied\.$")
    before = state(page)

    page.mouse.move(*cell_pt(page, 34, 4))
    paste(page)
    drag(page, cell_pt(page, 36, 6), cell_pt(page, 40, 9))      # moves what was pasted
    page.wait_for_timeout(150)
    drag(page, cell_pt(page, 38, 7), cell_pt(page, 42, 10))     # and again
    page.wait_for_timeout(150)
    box = page.locator("#selBox").bounding_box()
    out = cell_pt(page, 5, 4)
    assert out[0] < box["x"] - 10
    page.mouse.click(*out)
    page.wait_for_timeout(250)
    assert "Pasted" not in layer_names(page), "la capa Pasted no se fusiono"

    blur(page)
    page.keyboard.press("Control+z")
    page.wait_for_timeout(250)
    assert state(page) == before, "un solo Ctrl+Z no deshizo todo el pegado"
    return "pegado + 2 movimientos deshechos en un paso"


@step("cambiar de capa con un pegado pendiente lo fusiona sin descuadrar los indices")
def t_paste_layer_switch(page):
    off_canvas(page)
    scroll_top(page)
    if page.locator("#layers li").count() < 2:
        page.click("#lyAdd")
        page.wait_for_timeout(120)
    focus_art_layer(page)
    page.keyboard.press("7")
    drag(page, cell_pt(page, 20, 6), cell_pt(page, 26, 10))
    page.wait_for_timeout(80)
    page.evaluate("() => getSelection().removeAllRanges()")
    page.keyboard.press("Control+c")
    wait_msg(page, r"^Copied\.$")
    page.mouse.move(*cell_pt(page, 34, 4))
    paste(page)
    assert "Pasted" in layer_names(page)

    target = [n for n in layer_names(page) if n != "Pasted"][-1]     # the bottom one of the stack
    page.locator("#layers li").filter(has=page.locator(f'.lname:text-is("{target}")')).locator(".lname").click()
    page.wait_for_timeout(250)
    assert "Pasted" not in layer_names(page), f"no se fusiono al cambiar de capa: {layer_names(page)}"
    assert active_layer(page) == target, \
        f"la capa activa es {active_layer(page)!r} y deberia ser {target!r}"
    return f"fusionado y activa {target!r}"


@step("Ctrl+V desde otra herramienta cambia a Select y pega")
def t_paste_other_tool(page):
    off_canvas(page)
    scroll_top(page)
    focus_art_layer(page)
    page.keyboard.press("7")
    drag(page, cell_pt(page, 20, 6), cell_pt(page, 26, 10))
    page.wait_for_timeout(80)
    page.evaluate("() => getSelection().removeAllRanges()")
    page.keyboard.press("Control+c")
    wait_msg(page, r"^Copied\.$")

    page.keyboard.press("1")
    assert page.get_attribute('.tbtn[data-tool="dots"]', "aria-pressed") == "true"
    page.mouse.move(*cell_pt(page, 34, 4))
    paste(page)
    assert page.get_attribute('.tbtn[data-tool="select"]', "aria-pressed") == "true", \
        "el pegado deberia cambiar a la herramienta Select"
    assert "Pasted" in layer_names(page)
    page.mouse.click(*cell_pt(page, 5, 4))     # merges it and leaves things clean
    page.wait_for_timeout(200)
    return "cambio a Select y pego"


@step("ocultar y mostrar capas redibuja el lienzo")
def t_layer_visibility(page):
    off_canvas(page)
    eyes = page.locator("#layers li input[type=checkbox]")
    n = eyes.count()
    assert n >= 1
    assert not canvas_empty(page, "#cv"), "el lienzo ya estaba vacio antes de ocultar"
    for i in range(n):
        eyes.nth(i).uncheck()
    page.wait_for_timeout(200)
    assert canvas_empty(page, "#cv"), "ocultar todas las capas no vacio el lienzo"
    for i in range(n):
        eyes.nth(i).check()
    page.wait_for_timeout(200)
    assert not canvas_empty(page, "#cv"), "volver a mostrarlas no redibujo el lienzo"
    return f"{n} capas ocultadas y restauradas"


@step("reordenar capas arrastrando la fila, y deshacerlo")
def t_layer_reorder_drag(page):
    while page.locator("#layers li").count() < 3:
        page.click("#lyAdd")
        page.wait_for_timeout(120)
    before = layer_names(page)
    rows = page.locator("#layers li")
    src = rows.nth(0).locator(".lygrip").bounding_box()
    dst = rows.nth(2).bounding_box()
    page.mouse.move(src["x"] + src["width"] / 2, src["y"] + src["height"] / 2)
    page.mouse.down()
    page.mouse.move(dst["x"] + dst["width"] / 2, dst["y"] + dst["height"] / 2, steps=12)
    page.wait_for_timeout(150)
    page.mouse.up()
    page.wait_for_timeout(200)
    after = layer_names(page)
    assert after != before, f"arrastrar no reordeno: {before}"
    blur(page)
    page.keyboard.press("Control+z")
    page.wait_for_timeout(250)
    assert layer_names(page) == before, \
        f"Ctrl+Z no deshizo el reordenado: {layer_names(page)} vs {before}"
    return f"{before} -> {after} y vuelta"


@step("herramienta Character (2) coloca el caracter activo")
def t_tool_stamp(page):
    off_canvas(page)
    scroll_top(page)
    blur(page)
    focus_art_layer(page)
    set_tab(page, "#tabChar")
    page.click('#palette .chip[data-c="█"]')
    page.wait_for_timeout(80)
    assert page.inner_text("#curGlyph") == "█", f"el caracter activo es {page.inner_text('#curGlyph')!r}"
    page.keyboard.press("2")
    assert page.get_attribute('.tbtn[data-tool="stamp"]', "aria-pressed") == "true"
    page.mouse.click(*cell_pt(page, 12, 16))
    page.wait_for_timeout(120)
    ch, _ = cell_info(page, 12, 16)
    assert ch == "█", f"la celda quedo con {ch!r} en vez de '█'"
    return "caracter '█' colocado"


@step("herramienta Recolor (4) cambia el color y conserva el caracter")
def t_tool_recolor(page):
    off_canvas(page)
    set_tab(page, "#tabColor")
    page.fill("#colorHex", "#ff00ff")
    page.locator("#colorHex").press("Enter")
    page.wait_for_timeout(120)
    antes_ch, antes_col = cell_info(page, 12, 16)
    blur(page)                       # the shortcut is ignored while the focus is still in #colorHex
    page.keyboard.press("4")
    assert page.get_attribute('.tbtn[data-tool="recolor"]', "aria-pressed") == "true"
    page.mouse.click(*cell_pt(page, 12, 16))
    page.wait_for_timeout(120)
    ch, col = cell_info(page, 12, 16)
    assert ch == antes_ch, f"Recolor cambio el caracter: {antes_ch!r} -> {ch!r}"
    assert col.lower() == "#ff00ff", f"el color quedo en {col!r}"
    assert col.lower() != antes_col.lower(), "el color no cambio"
    set_tab(page, "#tabChar")
    return f"{antes_col} -> {col}"


@step("herramienta Erase (3) en sus dos modos")
def t_tool_erase_modes(page):
    off_canvas(page)
    scroll_top(page)
    blur(page)
    page.keyboard.press("1")
    drag(page, cell_pt(page, 20, 18), cell_pt(page, 30, 18))     # some braille to work with
    off_canvas(page)
    antes, _ = cell_info(page, 25, 18)
    assert not vacia(antes), "no se dibujo nada para borrar"

    page.keyboard.press("3")
    assert page.get_attribute('.tbtn[data-tool="erase"]', "aria-pressed") == "true"
    set_tab(page, "#tabBrush")
    assert page.locator("#eraseModeWrap").is_visible(), "no aparecio el selector de modo de borrado"
    page.select_option("#eraseMode", "dots")
    drag(page, cell_pt(page, 24, 18), cell_pt(page, 26, 18))
    off_canvas(page)
    tras_dots, _ = cell_info(page, 25, 18)
    assert tras_dots != antes, f"el modo Dots no borro nada: sigue en {antes!r}"

    page.select_option("#eraseMode", "cell")
    page.mouse.click(*cell_pt(page, 12, 16))                      # the cell holding '█'
    page.wait_for_timeout(120)
    off_canvas(page)
    # Erase edita solo la capa activa: la vista combinada puede seguir mostrando una capa de abajo
    # (tras t_layer_reorder_drag la activa es una capa nueva y "Layer 1" ya tiene '█' en esa celda)
    tras_cell = layer_rect(page, 12, 16, 1, 1)[0][0]
    assert vacia(tras_cell), f"el modo Full cell dejo {tras_cell!r} en la capa activa"
    page.select_option("#eraseMode", "dots")
    set_tab(page, "#tabChar")
    return f"dots: {antes!r} -> {tras_dots!r}; cell: vaciada"


@step("Dots en modo Paint full cell pinta la celda entera")
def t_dots_cell_mode(page):
    off_canvas(page)
    blur(page)
    page.keyboard.press("1")
    set_tab(page, "#tabBrush")
    assert page.locator("#dotModeWrap").is_visible(), "no aparecio el selector de modo de puntos"
    page.select_option("#dotMode", "cell")
    page.mouse.click(*cell_pt(page, 16, 20))
    page.wait_for_timeout(120)
    off_canvas(page)
    ch, _ = cell_info(page, 16, 20)
    assert ch == "⣿", f"deberia pintar la celda entera '⣿' y quedo {ch!r}"
    page.select_option("#dotMode", "paint")
    set_tab(page, "#tabChar")
    return "celda completa pintada"


@step("tamano de pincel con [ y ]")
def t_brush_size(page):
    off_canvas(page)
    blur(page)
    inicial = page.input_value("#size")
    for _ in range(3):
        page.keyboard.press("]")
    page.wait_for_timeout(80)
    subido = page.input_value("#size")
    assert int(subido) == min(8, int(inicial) + 3), f"] no subio el tamano: {inicial} -> {subido}"
    assert page.inner_text("#sizeVal") == subido, "el numero mostrado no acompana al control"
    for _ in range(3):
        page.keyboard.press("[")
    page.wait_for_timeout(80)
    assert page.input_value("#size") == inicial, "[ no devolvio el tamano original"
    assert page.inner_text("#sizeVal") == inicial
    return f"{inicial} -> {subido} -> {inicial}"


@step("casillas Empty dots y Grid, y color de fondo")
def t_view_toggles(page):
    off_canvas(page)
    scroll_top(page)
    base = page.locator("#cv").screenshot()

    page.check("#ghost")
    page.wait_for_timeout(200)
    con_ghost = page.locator("#cv").screenshot()
    assert con_ghost != base, "Empty dots no cambio el dibujo"
    page.uncheck("#ghost")
    page.wait_for_timeout(200)
    assert page.locator("#cv").screenshot() == base, "quitar Empty dots no restauro el dibujo"

    page.check("#grid")
    page.wait_for_timeout(200)
    assert page.locator("#cv").screenshot() != base, "Grid no cambio el dibujo"
    page.uncheck("#grid")
    page.wait_for_timeout(200)
    assert page.locator("#cv").screenshot() == base, "quitar Grid no restauro el dibujo"

    fondo0 = page.evaluate("() => document.querySelector('#cv').style.backgroundColor")
    page.fill("#bg", "#ffffff")
    page.wait_for_timeout(250)
    fondo1 = page.evaluate("() => document.querySelector('#cv').style.backgroundColor")
    assert fondo1 == "rgb(255, 255, 255)", f"el fondo quedo en {fondo1!r}"
    assert page.locator("#cv").screenshot() != base, "cambiar el fondo deberia redibujar con otro contraste"
    page.fill("#bg", "#000000")
    page.wait_for_timeout(250)
    assert page.evaluate("() => document.querySelector('#cv').style.backgroundColor") == fondo0
    assert page.locator("#cv").screenshot() == base, "restaurar el fondo no devolvio el dibujo"
    return f"ghost, grid y fondo {fondo0} -> {fondo1} -> {fondo0}"


@step("cargar una fuente .flf desde el panel Text")
def t_load_flf(page):
    flf = make_flf(FIXTURES / "SmokeTest.flf")
    expand(page, "Text")
    antes = page.locator("#font option").count()
    page.set_input_files("#fontFile", str(flf))
    wait_msg(page, r"^Font loaded: SmokeTest\.$")
    despues = page.locator("#font option").count()
    assert despues == antes + 1, f"el selector paso de {antes} a {despues} opciones"
    assert page.inner_text("#fontBtn span") == "SmokeTest", \
        f"la fuente activa es {page.inner_text('#fontBtn span')!r}"
    assert page.input_value("#font") == "SmokeTest"
    assert page.inner_text("#txtPrev").strip(), "la vista previa quedo vacia con la fuente nueva"
    # #font is a <select hidden> by design: the real UI is #fontBtn and its
    # dropdown, so it is restored the way pickFont() does it
    page.evaluate("""() => { const s = document.querySelector('#font');
        s.value = 'ANSI Shadow'; s.dispatchEvent(new Event('change')); }""")
    page.wait_for_timeout(150)
    assert page.inner_text("#fontBtn span") == "ANSI Shadow"
    return f"{antes} -> {despues} fuentes"


@step("desplegable de fuentes: flechas, Escape y cierre al desplazar")
def t_font_popup_keyboard(page):
    expand(page, "Text")
    blur(page)
    page.click("#fontBtn")
    page.wait_for_timeout(200)
    assert page.locator(".fpop").is_visible(), "no se abrio el desplegable"
    page.focus("#fontBtn")
    page.keyboard.press("ArrowDown")
    page.wait_for_timeout(200)
    foco = page.evaluate("() => document.activeElement.className")
    assert "fitem" in foco, f"la flecha no llevo el foco a la lista: {foco!r}"
    page.keyboard.press("ArrowDown")
    page.keyboard.press("ArrowUp")
    page.wait_for_timeout(120)
    page.keyboard.press("Escape")
    page.wait_for_timeout(150)
    assert page.locator(".fpop").is_hidden(), "Escape no cerro el desplegable"
    assert page.evaluate("() => document.activeElement.id") == "fontBtn", "el foco no volvio al boton"

    page.click("#fontBtn")
    page.wait_for_timeout(400)                       # past the 300 ms grace period
    assert page.locator(".fpop").is_visible()
    # if the canvas fits inside #stage, scrollTop += 2 moves nothing and fires no event: dispatch one instead
    page.evaluate("""() => { const s = document.querySelector('#stage'), t = s.scrollTop; s.scrollTop += 2;
        if (s.scrollTop === t) s.dispatchEvent(new Event('scroll')); }""")
    page.wait_for_timeout(250)
    assert page.locator(".fpop").is_hidden(), "desplazar no cerro el desplegable"
    return "flechas, Escape y cierre al desplazar"


@step("atajos de rehacer: Ctrl+Y y Ctrl+Shift+Z")
def t_redo_shortcuts(page):
    off_canvas(page)
    scroll_top(page)
    blur(page)
    page.keyboard.press("1")
    drag(page, cell_pt(page, 6, 22), cell_pt(page, 14, 22))
    off_canvas(page)
    dibujado = state(page)
    blur(page)
    page.keyboard.press("Control+z")
    deshecho = state(page)
    assert deshecho != dibujado, "Ctrl+Z no deshizo"
    page.keyboard.press("Control+y")
    assert state(page) == dibujado, "Ctrl+Y no rehizo"
    page.keyboard.press("Control+z")
    assert state(page) == deshecho
    page.keyboard.press("Control+Shift+z")
    assert state(page) == dibujado, "Ctrl+Shift+Z no rehizo"
    return "Ctrl+Y y Ctrl+Shift+Z"


@step("pestanas del dock: clic y flechas")
def t_dock_tabs(page):
    page.click("#tabColor")
    page.wait_for_timeout(80)
    assert page.locator("#paneColor").is_visible() and page.locator("#paneChar").is_hidden()
    assert page.get_attribute("#tabColor", "aria-selected") == "true"
    page.keyboard.press("ArrowRight")
    page.wait_for_timeout(80)
    assert page.locator("#paneBrush").is_visible(), "la flecha no paso a la pestana siguiente"
    assert page.get_attribute("#tabBrush", "aria-selected") == "true"
    page.click("#tabChar")
    page.wait_for_timeout(80)
    assert page.locator("#paneChar").is_visible()
    return "Character / Color / Brush"


@step("paneles plegables de la barra derecha")
def t_collapsible(page):
    fold = page.locator(".side .panel > h2 > button.fold").filter(has_text=re.compile(r"^Canvas$"))
    if fold.get_attribute("aria-expanded") == "false":
        fold.click()
        page.wait_for_timeout(80)
    assert page.locator("#rsApply").is_visible(), "el panel no se abrio"
    fold.click()
    page.wait_for_timeout(80)
    assert fold.get_attribute("aria-expanded") == "false"
    assert page.locator("#rsApply").is_hidden(), "el panel no se plego"
    fold.click()
    page.wait_for_timeout(80)
    assert page.locator("#rsApply").is_visible()
    return "plegado y desplegado"


@step("Ctrl+rueda hace zoom, Fit reajusta y la herramienta Pan desplaza")
def t_zoom_pan(page):
    off_canvas(page)
    scroll_top(page)
    z0 = zoom_of(page)
    via = ctrl_wheel(page, -120)
    z1 = zoom_of(page)
    assert z1 > z0, f"Ctrl+rueda no amplio: {z0} -> {z1}"
    for _ in range(3):
        ctrl_wheel(page, -120)
    page.wait_for_timeout(150)
    scrollable = page.evaluate("() => { const s = document.querySelector('#stage'); return s.scrollWidth > s.clientWidth + 10; }")
    assert scrollable, "tras ampliar, el lienzo deberia desbordar el area visible"

    page.keyboard.press("8")
    assert page.get_attribute('.tbtn[data-tool="hand"]', "aria-pressed") == "true"
    st = page.locator("#stage").bounding_box()
    page.evaluate("() => { document.querySelector('#stage').scrollLeft = 200; }")
    sl0 = page.evaluate("() => document.querySelector('#stage').scrollLeft")
    drag(page, (st["x"] + st["width"] * .7, st["y"] + st["height"] / 2),
               (st["x"] + st["width"] * .3, st["y"] + st["height"] / 2), steps=12)
    page.wait_for_timeout(150)
    sl1 = page.evaluate("() => document.querySelector('#stage').scrollLeft")
    assert sl1 > sl0, f"la herramienta Pan no desplazo el lienzo: {sl0} -> {sl1}"

    page.click("#fit")
    page.wait_for_timeout(200)
    z2 = zoom_of(page)
    assert z2 < z1, f"Fit no reajusto el zoom: {z1} -> {z2}"
    page.keyboard.press("1")
    return f"{via}: zoom {z0} -> {z1} -> {z2}, paneo {sl0} -> {sl1}"


@step("cambiar el tamano del lienzo por los campos")
def t_resize_fields(page):
    expand(page, "Canvas")
    SAVED["dims"] = dims(page)
    page.fill("#rsCols", "60")
    page.fill("#rsRows", "30")
    page.click("#rsApply")
    wait_msg(page, r"^Canvas 60 × 30 cells\.$")
    assert dims(page) == (60, 30), f"#dim quedo en {page.inner_text('#dim')!r}"
    page.click("#rsApply")
    wait_msg(page, r"already that size")
    page.fill("#rsCols", "")
    page.locator("#rsRows").focus()
    page.wait_for_timeout(120)
    assert page.input_value("#rsCols") == "60", \
        f"un campo vacio deberia volver al tamano actual, quedo en {page.input_value('#rsCols')!r}"
    blur(page)
    return "60 × 30, campo vacio restaurado"


@step("cambiar el tamano arrastrando el punto de la esquina")
def t_resize_grip(page):
    off_canvas(page)
    scroll_top(page)
    cols0, rows0 = dims(page)
    z = zoom_of(page)
    cw, ch = 8 * z, 16 * z
    g = page.locator("#grip").bounding_box()
    page.mouse.move(g["x"] + g["width"] / 2, g["y"] + g["height"] / 2)
    page.mouse.down()
    page.mouse.move(g["x"] + g["width"] / 2 - 10 * cw, g["y"] + g["height"] / 2 - 5 * ch, steps=10)
    page.wait_for_timeout(150)
    assert page.locator("#rsBox").is_visible(), "no aparecio la guia de tamano"
    assert page.inner_text("#rsBox") == f"{cols0 - 10} × {rows0 - 5}", \
        f"la guia muestra {page.inner_text('#rsBox')!r}"
    page.mouse.up()
    wait_msg(page, rf"^Canvas {cols0 - 10} × {rows0 - 5} cells\.$")
    assert dims(page) == (cols0 - 10, rows0 - 5)

    c, r = SAVED.get("dims", (101, 48))                     # leaves the canvas as it was
    expand(page, "Canvas")
    page.fill("#rsCols", str(c))
    page.fill("#rsRows", str(r))
    page.click("#rsApply")
    wait_msg(page, rf"^Canvas {c} × {r} cells\.$")
    blur(page)
    return f"{cols0}×{rows0} -> {cols0 - 10}×{rows0 - 5} -> {c}×{r}"


@step("aviso de pantalla pequena")
def t_mobile_notice(browser, url):
    errs = []
    ctx = browser.new_context(viewport={"width": 900, "height": 700},
                              screen={"width": 640, "height": 480}, accept_downloads=True)
    try:
        pg = ctx.new_page()
        pg.set_default_timeout(10000)
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(url + "/index.html")
        wait_ready(pg)
        assert pg.locator("#mob").is_visible(), "el aviso no aparecio con una pantalla de 640x480"
        pg.click("#mobOk")
        pg.wait_for_timeout(120)
        assert pg.locator("#mob").is_hidden(), "Continue anyway no cerro el aviso"
        assert pg.evaluate("() => localStorage.getItem('seuratty.mobileNote')") == "1", \
            "no se recordo que el aviso ya se vio"
        pg.reload()
        wait_ready(pg)
        assert pg.locator("#mob").is_hidden(), "el aviso volvio a salir tras recargar"
        assert not errs, f"errores en la pagina: {errs}"
    finally:
        ctx.close()
    return "mostrado, cerrado y recordado"


@step("autoguardado en localStorage y restauracion al recargar")
def t_autosave(page):
    off_canvas(page)
    page.keyboard.press("1")
    drag(page, cell_pt(page, 4, 3), cell_pt(page, 12, 3))
    off_canvas(page)
    saved = state(page)
    assert saved, "no se escribio nada en localStorage"
    page.reload()
    wait_ready(page)
    wait_msg(page, r"^Restored your last work\.$")
    assert not canvas_empty(page, "#cv"), "el lienzo restaurado se ve vacio"
    if not page.locator("#mob").is_hidden():
        page.click("#mobOk")
    page.keyboard.press("1")
    drag(page, cell_pt(page, 4, 20), cell_pt(page, 8, 20))
    off_canvas(page)
    page.click("#undo")
    again = state(page)
    assert again == saved, "el documento restaurado no coincide con el guardado"
    return "guardado y restaurado identicos"


@step("New canvas pide confirmacion y deja el lienzo en blanco")
def t_new_canvas(page):
    page.click("#newCv")
    page.wait_for_timeout(100)
    assert page.locator("#newAsk").is_visible(), "no aparecio la confirmacion"
    page.click("#newNo")
    page.wait_for_timeout(100)
    assert page.locator("#newAsk").is_hidden(), "Cancel no cerro la confirmacion"
    page.click("#newCv")
    page.click("#newYes")
    wait_msg(page, r"^Blank canvas \d+ × \d+\.$")
    assert canvas_empty(page, "#cv"), "el lienzo nuevo no quedo vacio"
    return msg(page)


@step("sin errores de consola en toda la sesion")
def t_no_errors():
    assert not console_errors, "errores de consola:\n    " + "\n    ".join(console_errors)
    return "consola limpia"


# ---------- run ----------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--headed", action="store_true")
    ap.add_argument("--baseline", action="store_true", help="regraba la captura base")
    args = ap.parse_args()

    srv, url = serve(ROOT)
    print(f"Sirviendo {ROOT} en {url}\n")

    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=not args.headed)
        ctx = browser.new_context(
            viewport={"width": 1600, "height": 1100},
            screen={"width": 1920, "height": 1080},
            device_scale_factor=1,
            accept_downloads=True,
        )
        ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=url)
        page = ctx.new_page()
        page.set_default_timeout(10000)
        page.on("console", on_console)
        page.on("pageerror", lambda e: console_errors.append(f"pageerror: {e}"))

        page.goto(url + "/index.html")
        wait_ready(page)
        page.evaluate("() => localStorage.clear()")

        t_load(page, url)
        t_baseline(page, args.baseline)
        t_dots(page)
        t_undo_redo(page)
        t_layers(page)
        t_pick_layer(page)
        t_select_move(page)
        t_flip(page)
        t_copy_paste(page)
        t_delete(page)
        t_text(page)
        t_fonts(page)
        t_fonts_fetch(page)
        t_image(page)
        t_image_overwrite(page)
        t_image_grows_canvas(page)
        t_image_offcanvas_roundtrip(page)
        t_image_confirm_offcanvas(page)
        t_image_undo(page)
        t_image_escape(page)
        t_export_copy(page)
        t_export_save(page)
        t_project_roundtrip(page)
        t_export_png(page)
        t_eyedropper(page)
        t_nudge_selectall(page)
        t_escape(page)
        t_paste_undo_pending(page)
        t_paste_undo_merged(page)
        t_paste_layer_switch(page)
        t_paste_other_tool(page)
        t_layer_visibility(page)
        t_layer_reorder_drag(page)
        t_tool_stamp(page)
        t_tool_recolor(page)
        t_tool_erase_modes(page)
        t_dots_cell_mode(page)
        t_brush_size(page)
        t_view_toggles(page)
        t_load_flf(page)
        t_font_popup_keyboard(page)
        t_redo_shortcuts(page)
        t_dock_tabs(page)
        t_collapsible(page)
        t_zoom_pan(page)
        t_autosave(page)
        t_resize_fields(page)
        t_resize_grip(page)
        t_new_canvas(page)
        t_mobile_notice(browser, url)
        t_fonts_404(browser, url)
        t_no_errors()

        ctx.close()
        browser.close()

    srv.shutdown()
    ok = sum(1 for _, good, _ in results if good)
    bad = [name for name, good, _ in results if not good]
    print(f"\n{ok}/{len(results)} pasos OK")
    if bad:
        print("Fallaron: " + ", ".join(bad))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
