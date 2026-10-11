"""Completa la hoja LEEME del demo: dice que avisos produce el archivo a proposito, y por que.

NO ES UN GENERADOR: registro de como se edito el demo el 2026-10-10. Lea README.md.

    python3 scripts/plantilla/leeme_demo.py <demo.xlsx> <salida.xlsx>

En el demo, LEEME es sheet1.xml. Se agregan renglones al final: no se renumera nada.
"""
import sys, zipfile
from xml.sax.saxutils import escape

if len(sys.argv) != 3:
    raise SystemExit(__doc__)
src, dst = sys.argv[1], sys.argv[2]
if "/docs/" in dst.replace("\\", "/") or dst.replace("\\", "/").startswith("docs/"):
    raise SystemExit("No se escribe sobre docs/: genere en otra ruta, compare, y copie a mano si procede.")

# (fila, estilo, texto). Estilos del LEEME: 2 texto, 5 encabezado de lista. Sin acentos, como el resto.
RENGLONES = [
    (18, 2, "  - Dos ventas con varios productos en el mismo folio (V-008 y V-015)."),
    (20, 5, "Avisos que vera al cargar este archivo. Ninguno es un error: estan puestos a proposito."),
    (21, 2, "  - Linea Demo (V-006): es una unidad de exhibicion, no una venta. Se lista aparte y no cuenta."),
    (22, 2, "  - Abonos que suman mas que el precio (V-018): se cobro de mas, para mostrar un saldo a favor."),
    (23, 2, "  - Falta fecha (V-025): una venta sin fecha de entrega. Se reporta aparte, no se descarta."),
    (24, 2, "  - Condicion distinta en sus partidas (V-015): el equipo dice Credito y su accesorio Contado."),
    (25, 2, "    La aplicacion aplica el primero a toda la venta y lo avisa."),
    (26, 2, "  - Sin dias de credito y con saldo (cinco ventas): su antiguedad se mide desde la entrega."),
]
ATR = 'customFormat="false" ht="15" hidden="false" customHeight="false" outlineLevel="0" collapsed="false"'

zin = zipfile.ZipFile(src)
partes = {i.filename: zin.read(i.filename) for i in zin.infolist()}
xml = partes["xl/worksheets/sheet1.xml"].decode("utf-8")
if xml.count("</sheetData>") != 1 or xml.count('<dimension ref="B2:B17"/>') != 1 or '<row r="18"' in xml:
    raise SystemExit("LEEME: la hoja no es la esperada")
filas = "".join(
    f'<row r="{n}" {ATR}><c r="B{n}" s="{estilo}" t="inlineStr"><is><t xml:space="preserve">{escape(texto)}</t></is></c></row>'
    for n, estilo, texto in RENGLONES
)
xml = xml.replace("</sheetData>", filas + "</sheetData>").replace('<dimension ref="B2:B17"/>', '<dimension ref="B2:B26"/>')
partes["xl/worksheets/sheet1.xml"] = xml.encode("utf-8")
with zipfile.ZipFile(dst, "w") as zout:
    for i in zin.infolist():
        zout.writestr(i, partes[i.filename], compress_type=i.compress_type)
print("LEEME: renglones agregados:", len(RENGLONES))
