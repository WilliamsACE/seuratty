#!/usr/bin/env python
"""
Static check of the shared state (no dependencies).

The rule it watches: a variable declared with `export let` may only be
reassigned inside the module that declares it. Other modules read it through
its live binding and, if they need to write it, must use the exported setter.

It detects plain assignment (x = ...), compound assignment (+=, -=, *=, /=, %=,
**=, &&=, ||=, ??=, <<=, >>=, >>>=, &=, |=, ^=) and ++/-- (++x, x--).

Usage:
    python tests/check_state.py

Output: inventory of variables and list of foreign writes.
Exit code 0 if there is none.

Limits (it is a helper, not a JS parser): the analysis is lexical. Strings and
comments are removed before searching, but a regular expression is not told
apart from a division, and hand-made aliases (const other = x) are not
resolved. For what is watched here that is enough.
"""

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
JS = ROOT / "js"
SKIP = {"figlet.js"}                      # third-party engine, classic script

ASSIGN_OPS = ["=", r"\+=", "-=", r"\*=", "/=", "%=", r"\*\*=", "&&=", r"\|\|=",
              r"\?\?=", "<<=", ">>=", ">>>=", "&=", r"\|=", r"\^="]


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
            quote, out_of_line = c, False
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
                    if quote != "`":          # unterminated string: it was not a string after all
                        out_of_line = True
                        break
                    continue
                out.append(" ")
                i += 1
            if out_of_line:
                continue
        else:
            out.append(c)
            i += 1
    return "".join(out)


def files():
    return sorted(p for p in JS.rglob("*.js") if p.name not in SKIP)


def find_exported_lets(sources):
    """{name: path of the owning module} for every `export let a, b = 1`."""
    owners = {}
    for path, code in sources.items():
        for m in re.finditer(r"\bexport\s+let\s+([^;\n]+)", code):
            for part in m.group(1).split(","):
                name = part.split("=")[0].strip()
                if re.fullmatch(r"[A-Za-z_$][\w$]*", name):
                    owners[name] = path
    return owners


def imports_name(code, name):
    for m in re.finditer(r"\bimport\s*\{([^}]*)\}\s*from", code):
        for part in m.group(1).split(","):
            bare = part.strip().split(" as ")[0].strip()
            if bare == name:
                return True
    return False


def declares_locally(code, name):
    """Line where the file declares the name with let/const/var, if it does.

    Shadowing an import with a local is legal and breaks nothing, but a lexical
    analysis cannot tell which of the two each write points at: those cases are
    reported separately so they can be reviewed by hand.
    """
    m = re.search(r"\b(?:let|const|var)\s+(?:[^;=\n]*[,\s])?" + re.escape(name) + r"\b\s*(?:=|[,;\n)])", code)
    return code[:m.start()].count("\n") + 1 if m else None


def foreign_writes(name, owner, sources):
    hits = []
    ops = "|".join(ASSIGN_OPS)
    # x = ... but not ==, ===, =>, <=, >=, !=
    assign = re.compile(r"(?<![.\w$])" + re.escape(name) + r"\s*(?:" + ops + r")(?![=>])")
    incdec = re.compile(r"(?<![.\w$])" + re.escape(name) + r"\s*(?:\+\+|--)"
                        r"|(?:\+\+|--)\s*" + re.escape(name) + r"(?![\w$])")
    for path, code in sources.items():
        if path == owner or not imports_name(code, name):
            continue
        shadow = declares_locally(code, name)
        for lineno, line in enumerate(code.split("\n"), 1):
            if assign.search(line) or incdec.search(line):
                raw = sources_raw[path].split("\n")[lineno - 1].strip()
                hits.append((path, lineno, raw, shadow))
    return hits


def main():
    if not JS.exists():
        print(f"No encuentro {JS}")
        return 1

    global sources_raw
    sources_raw = {p: p.read_text(encoding="utf-8") for p in files()}
    sources = {p: strip_code(c) for p, c in sources_raw.items()}

    owners = find_exported_lets(sources)
    print(f"Modulos analizados: {len(sources)}")
    if not owners:
        print("No hay variables con `export let` todavia.")
        return 0

    print(f"\nVariables con `export let` ({len(owners)}):")
    for name in sorted(owners):
        print(f"  {name:<16} {owners[name].relative_to(ROOT).as_posix()}")

    problems, shadowed = [], []
    for name, owner in sorted(owners.items()):
        for path, lineno, raw, shadow in foreign_writes(name, owner, sources):
            (shadowed if shadow else problems).append((name, path, lineno, raw, shadow))

    print()
    if shadowed:
        print(f"A REVISAR A MANO ({len(shadowed)}): el archivo declara una local con ese nombre")
        for name, path, lineno, raw, shadow in shadowed:
            rel = path.relative_to(ROOT).as_posix()
            print(f"  {name} en {rel}:{lineno} (local declarada en la linea {shadow})\n      {raw}")
        print()

    if problems:
        print(f"ESCRITURAS FORANEAS ({len(problems)}):")
        for name, path, lineno, raw, _ in problems:
            rel = path.relative_to(ROOT).as_posix()
            print(f"  {name} escrita en {rel}:{lineno}\n      {raw}")
            print(f"      duenio: {owners[name].relative_to(ROOT).as_posix()} - usa su setter")
        return 1

    print("Sin escrituras foraneas: cada `export let` se reasigna solo en su modulo.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
