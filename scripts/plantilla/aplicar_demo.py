"""Escribe en el demo las formulas de cobrado y saldo a nivel de folio, con sus valores.

NO ES UN GENERADOR: registro de como se edito el demo el 2026-10-10. Lea README.md.

    python3 scripts/plantilla/aplicar_demo.py <demo_original.xlsx> <salida.xlsx> <valores.json>

`valores.json` lo produce calcular_demo.mjs. En el demo, `ventas` es sheet2.xml.
"""
import json, re, sys, zipfile
from xml.sax.saxutils import escape

if len(sys.argv) != 4:
    raise SystemExit(__doc__)
src, dst, pq = sys.argv[1], sys.argv[2], json.load(open(sys.argv[3], encoding="utf-8"))
if "/docs/" in dst.replace("\\", "/") or dst.replace("\\", "/").startswith("docs/"):
    raise SystemExit("No se escribe sobre docs/: genere en otra ruta, compare, y copie a mano si procede.")

zin = zipfile.ZipFile(src)
partes = {i.filename: zin.read(i.filename) for i in zin.infolist()}
xml = partes["xl/worksheets/sheet2.xml"].decode("utf-8")

def nueva(ref, estilo, f, v):
    formula = escape(f, {'"': "&quot;"})
    if isinstance(v, (int, float)):
        val = str(int(v)) if float(v).is_integer() else repr(v)
        return f'<c r="{ref}" s="{estilo}" t="n"><f aca="false">{formula}</f><v>{val}</v></c>'
    return f'<c r="{ref}" s="{estilo}" t="str"><f aca="false">{formula}</f><v>{escape(v)}</v></c>'

cambios = 0
for n in range(3, 302):
    for col in ("P", "Q"):
        ref = f"{col}{n}"
        patron = rf'<c r="{ref}" s="(\d+)" t="\w+"><f aca="false">[^<]*</f><v>[^<]*</v></c>'
        estilos = re.findall(patron, xml)
        if len(estilos) != 1:
            raise SystemExit(f"demo: la celda {ref} no es la esperada ({len(estilos)} coincidencias)")
        vieja = re.search(patron, xml).group(0)
        d = pq[str(n)][col]
        xml = xml.replace(vieja, nueva(ref, estilos[0], d["f"], d["v"]))
        cambios += 1

partes["xl/worksheets/sheet2.xml"] = xml.encode("utf-8")
with zipfile.ZipFile(dst, "w") as zout:
    for i in zin.infolist():
        zout.writestr(i, partes[i.filename], compress_type=i.compress_type)
print("celdas reescritas en el demo:", cambios)
