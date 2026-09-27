#!/usr/bin/env python
"""
Static check for missing imports (no dependencies).

A missing import is invisible when the module loads: it blows up when the
function that uses it runs. This check catches it earlier, crossing per module
the identifiers it uses against the ones it imports and the ones it declares.

Usage:
    python tests/check_imports.py

Exit code 0 if none is missing.

Limits (it is a helper, not a JS parser): the analysis is lexical. Strings and
comments are removed before searching, but function parameters and variables
declared inside blocks are not detected as declarations, so a name that matches
something exported by another module can show up as a false positive. That is
why the report separates them: the ones that are almost certainly real come
first.
"""

import pathlib
import re
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="backslashreplace")

ROOT = pathlib.Path(__file__).resolve().parent.parent
JS = ROOT / "js"
SKIP = {"figlet.js"}                      # third-party engine, classic script

# short or very generic names: nearly always parameters or destructured bindings
RUIDO = {"a", "b", "c", "d", "e", "g", "h", "k", "n", "p", "r", "s", "t", "v", "w", "x", "y", "z",
         "name", "chars", "size", "line", "block", "doc", "x0", "x1", "y0", "y1", "sel", "col"}


def strip_code(src):
    """Replaces strings and comments with spaces, keeping the line count."""
    out = []
    i, n = 0, len(src)
    while i < n:
        c = src[i]
        nxt = src[i + 1] if i + 1 < n else ""
        if c == "/" and nxt == "/":
            while i < n and src[i] != "\n":
                out.append(" ")
                i += 1
        elif c == "/" and nxt == "*":
            while i < n and not (src[i] == "*" and i + 1 < n and src[i + 1] == "/"):
                out.append("\n" if src[i] == "\n" else " ")
                i += 1
            out.append("  ")
            i += 2
        elif c in "'\"`":
            quote, roto = c, False
            out.append(" ")
            i += 1
            while i < n:
                if src[i] == "\\":
                    out.append("  ")
                    i += 2
                    continue
                if src[i] == quote:
                    out.append(" ")
                    i += 1
                    break
                if src[i] == "\n":
                    out.append("\n")
                    i += 1
                    if quote != "`":
                        roto = True
                        break
                    continue
                out.append(" ")
                i += 1
            if roto:
                continue
        else:
            out.append(c)
            i += 1
    return "".join(out)


def declared(code):
    """Names the file declares with function/class/const/let/var."""
    out = set()
    for m in re.finditer(r"(?:^|\s)(?:export\s+)?(?:async\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)", code):
        out.add(m.group(1))
    for m in re.finditer(r"(?:^|[;{}\s])(?:export\s+)?(?:const|let|var)\s+([^;\n=]*(?:=[^;\n]*)?)", code):
        for part in re.split(r",(?![^[{(]*[\]})])", m.group(1)):
            nombre = part.split("=")[0].strip()
            if re.fullmatch(r"[A-Za-z_$][\w$]*", nombre):
                out.add(nombre)
    # function and arrow parameters, plus destructured ones.
    # Careful: `if (x){` has the same shape as a signature, so the control
    # keywords have to be discarded, or any variable used in an if would count
    # as declared (and a missing import would go unnoticed).
    CONTROL = {"if", "while", "for", "switch", "catch", "return", "typeof"}
    for m in re.finditer(r"(?:^|[^\w$])([\w$]*)\s*\(([^)]*)\)\s*(?:=>|\{)", code):
        if m.group(1) in CONTROL:
            continue
        for part in re.split(r"[,\s\[\]{}:]+", m.group(2)):
            nombre = part.split("=")[0].strip()
            if re.fullmatch(r"[A-Za-z_$][\w$]*", nombre):
                out.add(nombre)
    for m in re.finditer(r"(?:^|[\s(,])([A-Za-z_$][\w$]*)\s*=>", code):
        out.add(m.group(1))
    for m in re.finditer(r"\bfor\s*\(\s*(?:const|let|var)\s+\[([^\]]*)\]", code):
        for part in re.split(r"[,\s]+", m.group(1)):
            if re.fullmatch(r"[A-Za-z_$][\w$]*", part):
                out.add(part)
    return out


def main():
    files = sorted(p for p in JS.rglob("*.js") if p.name not in SKIP)
    if not files:
        print(f"No encuentro modulos en {JS}")
        return 1
    raw = {p: p.read_text(encoding="utf-8") for p in files}
    src = {p: strip_code(s) for p, s in raw.items()}

    # what each module exports
    exporta = {}
    for p, s in src.items():
        for m in re.finditer(r"^export\s+(?:async\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)", s, re.M):
            exporta.setdefault(m.group(1), p)
        for m in re.finditer(r"^export\s+(?:const|let|var)\s+([^;\n]+)", s, re.M):
            for part in m.group(1).split(","):
                nombre = part.split("=")[0].strip()
                if re.fullmatch(r"[A-Za-z_$][\w$]*", nombre):
                    exporta.setdefault(nombre, p)

    # private to each module: declared at the very top without export. Using them
    # from another module is a ReferenceError that only fires when that path runs.
    privadas = {}
    for p, s in src.items():
        for m in re.finditer(r"^(?:async\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)", s, re.M):
            privadas.setdefault(m.group(1), p)
        for m in re.finditer(r"^(?:const|let|var)\s+([^;\n]+)", s, re.M):
            for part in m.group(1).split(","):
                nombre = part.split("=")[0].strip()
                if re.fullmatch(r"[A-Za-z_$][\w$]*", nombre) and nombre not in exporta:
                    privadas.setdefault(nombre, p)

    fugas = []
    for p, s in sorted(src.items()):
        importa = set()
        for m in re.finditer(r"import\s*\{([^}]*)\}", s):
            for part in m.group(1).split(","):
                importa.add(part.strip().split(" as ")[-1].strip())
        local = declared(s)
        cuerpo = re.sub(r"^import[^;]*;", "", s, flags=re.M)
        usados = set(re.findall(r"(?<![.\w$])([A-Za-z_$][\w$]*)", cuerpo))
        for nombre in sorted(usados & set(privadas)):
            if nombre in importa or nombre in local or nombre in exporta or privadas[nombre] == p:
                continue
            if nombre in RUIDO:
                continue
            fugas.append((p, nombre, privadas[nombre]))

    seguros, dudosos = [], []
    for p, s in sorted(src.items()):
        importa = set()
        for m in re.finditer(r"import\s*\{([^}]*)\}", s):
            for part in m.group(1).split(","):
                importa.add(part.strip().split(" as ")[-1].strip())
        local = declared(s)
        cuerpo = re.sub(r"^import[^;]*;", "", s, flags=re.M)
        usados = set(re.findall(r"(?<![.\w$])([A-Za-z_$][\w$]*)", cuerpo))
        for nombre in sorted(usados & set(exporta)):
            if nombre in importa or nombre in local or exporta[nombre] == p:
                continue
            fila = (p, nombre, exporta[nombre])
            (dudosos if nombre in RUIDO else seguros).append(fila)

    print(f"Modulos analizados: {len(src)}   nombres exportados: {len(exporta)}")
    if seguros:
        print(f"\nIMPORTS QUE FALTAN ({len(seguros)}):")
        for p, nombre, duenio in seguros:
            print(f"  {p.relative_to(ROOT).as_posix()}: falta {nombre}"
                  f"  (lo exporta {duenio.relative_to(ROOT).as_posix()})")
    if dudosos:
        print(f"\nPosibles falsos positivos ({len(dudosos)}): nombres genericos que suelen ser"
              f" parametros o variables de bloque")
        for p, nombre, duenio in dudosos:
            print(f"  {p.relative_to(ROOT).as_posix()}: {nombre}"
                  f"  (tambien lo exporta {duenio.relative_to(ROOT).as_posix()})")
    if fugas:
        print(f"\nVARIABLES PRIVADAS DE OTRO MODULO ({len(fugas)}): no se pueden importar,"
              f" hay que mover el codigo que las usa")
        for p, nombre, duenio in fugas:
            print(f"  {p.relative_to(ROOT).as_posix()}: usa {nombre}"
                  f"  (privada de {duenio.relative_to(ROOT).as_posix()})")
    if not seguros and not fugas:
        print("\nNo falta ningun import.")
    return 1 if (seguros or fugas) else 0


if __name__ == "__main__":
    sys.exit(main())
