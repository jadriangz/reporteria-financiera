"""Guion con el que se escribio la plantilla v2 a partir de la v1 (2026-10-10).

NO ES UN GENERADOR. Es el registro de como se edito el XML, y el punto de partida
si hay que tocar una v3. La plantilla publicada es la que esta en docs/, no la que
este guion regenere. Lea scripts/plantilla/README.md antes de correrlo.

    python3 scripts/plantilla/construir_v2.py --salida <ruta.xlsx> [etapas...]

Etapas: ventas, cobranza, gastos, libro, instrucciones. Cada una se puede aplicar
sola, para verificar hoja por hoja. Toda sustitucion lleva su comprobacion: si el
XML de la v1 no es el esperado, el guion se detiene en vez de forzarlo.
"""
import re, sys, zipfile
from xml.sax.saxutils import escape

V1 = "docs/Plantilla_Captura_Reporteria_v1.xlsx"
ETAPAS = {"ventas", "cobranza", "gastos", "libro", "instrucciones"}
args = sys.argv[1:]
if len(args) < 2 or args[0] != "--salida":
    raise SystemExit(__doc__)
V2 = args[1]
etapas = set(args[2:]) or ETAPAS
if not etapas <= ETAPAS:
    raise SystemExit(f"Etapas desconocidas: {sorted(etapas - ETAPAS)}")
if V2.replace("\\", "/").startswith("docs/") or "/docs/" in V2.replace("\\", "/"):
    raise SystemExit("No se escribe sobre docs/: genere en otra ruta, compare, y copie a mano si procede.")

zin = zipfile.ZipFile(V1)
partes = {i.filename: zin.read(i.filename) for i in zin.infolist()}
texto = lambda p: partes[p].decode("utf-8")

ATR_FILA = 'customFormat="false" ht="15" hidden="false" customHeight="false" outlineLevel="0" collapsed="false"'
# Estilos que YA existen en styles.xml: captura en azul sin fondo, calculo en negro.
AZUL, AZUL_FECHA, AZUL_MONEDA, AZUL_PCT = 13, 14, 15, 16
NEGRO_MONEDA, NEGRO_PCT = 10, 11

def celda(col, n, estilo, formula=None):
    if formula is None:
        return f'<c r="{col}{n}" s="{estilo}"/>'
    return f'<c r="{col}{n}" s="{estilo}"><f>{escape(formula, {chr(34): "&quot;"})}</f></c>'

def rellenar(parte, hasta, estilo_folio_actual, fila):
    """Sustituye cada fila de relleno `<row r=n ...><c r="An" s=…/></row>` por la fila completa."""
    xml = texto(parte)
    for n in range(3, hasta + 1):
        vieja = f'<row r="{n}" {ATR_FILA}><c r="A{n}" s="{estilo_folio_actual}"/></row>'
        if xml.count(vieja) != 1:
            raise SystemExit(f"{parte}: la fila {n} no es la esperada ({xml.count(vieja)} coincidencias)")
        xml = xml.replace(vieja, f'<row r="{n}" {ATR_FILA}>{fila(n)}</row>')
    partes[parte] = xml.encode("utf-8")

# ---------------------------------------------------------------- ventas
def fila_ventas(n):
    a = n - 1  # la fila de arriba
    hereda = lambda col: f'IF(AND($A{n}<>"",$A{n}=$A{a}),{col}{a},"")'
    primera = f'COUNTIF($A$3:$A{n},$A{n})=1'
    return "".join([
        celda("A", n, AZUL),
        celda("B", n, AZUL_FECHA),
        celda("C", n, AZUL),
        celda("D", n, AZUL, hereda("D")),            # cliente: cabecera del folio
        celda("E", n, AZUL),
        celda("F", n, AZUL),
        celda("G", n, AZUL_MONEDA),
        celda("H", n, AZUL_MONEDA),
        celda("I", n, AZUL_PCT),
        celda("J", n, AZUL),
        celda("K", n, AZUL, hereda("K")),            # dias_credito
        celda("L", n, AZUL, hereda("L")),            # condicion
        celda("M", n, AZUL, hereda("M")),            # vendedor
        celda("N", n, NEGRO_MONEDA, f'IF(H{n}="","",H{n}-G{n})'),
        celda("O", n, NEGRO_PCT, f'IFERROR(N{n}/H{n},"")'),
        celda("P", n, NEGRO_MONEDA,
              f'IF($A{n}="","",IF({primera},SUMIF(cobranza!$B$3:$B$1000,$A{n},cobranza!$D$3:$D$1000),"↑"))'),
        celda("Q", n, NEGRO_MONEDA,
              f'IF($A{n}="","",IF({primera},SUMIFS($H$3:$H$1000,$A$3:$A$1000,$A{n},$C$3:$C$1000,"<>Demo")-P{n},"↑"))'),
        celda("R", n, AZUL),
    ])

if "ventas" in etapas:
    rellenar("xl/worksheets/sheet3.xml", 301, 18, fila_ventas)

# ---------------------------------------------------------------- cobranza y gastos
def fila_simple(columnas):
    return lambda n: "".join(celda(col, n, estilo) for col, estilo in columnas)

if "cobranza" in etapas:   # folio_pago, folio_venta, fecha_pago, monto, metodo, cliente_ref, notas
    rellenar("xl/worksheets/sheet4.xml", 501, 13, fila_simple(
        [("A", AZUL), ("B", AZUL), ("C", AZUL_FECHA), ("D", AZUL_MONEDA), ("E", AZUL), ("F", AZUL), ("G", AZUL)]))

if "gastos" in etapas:     # folio_gasto, fecha, categoria, subcategoria, descripcion, monto, tipo, proveedor, notas
    rellenar("xl/worksheets/sheet5.xml", 501, 13, fila_simple(
        [("A", AZUL), ("B", AZUL_FECHA), ("C", AZUL), ("D", AZUL), ("E", AZUL), ("F", AZUL_MONEDA), ("G", AZUL), ("H", AZUL), ("I", AZUL)]))

# ---------------------------------------------------------------- libro: calcular al abrir
if "libro" in etapas:
    xml = texto("xl/workbook.xml")
    viejo = '<calcPr iterateCount="100" refMode="A1" iterate="false" iterateDelta="0.0001"/>'
    if xml.count(viejo) != 1:
        raise SystemExit("workbook.xml: calcPr no es el esperado")
    partes["xl/workbook.xml"] = xml.replace(viejo, viejo[:-2] + ' fullCalcOnLoad="true"/>').encode("utf-8")

# ---------------------------------------------------------------- INSTRUCCIONES
def alto(txt):
    lineas = max(1, -(-len(txt) // 104))
    return {1: "15", 2: "27.75", 3: "41.25", 4: "54.75", 5: "68.25"}[lineas]

def fila_texto(n, etiqueta, txt):
    return (f'<row r="{n}" customFormat="false" ht="{alto(txt)}" hidden="false" customHeight="false" outlineLevel="0" collapsed="false">'
            f'<c r="B{n}" s="2" t="inlineStr"><is><t>{escape(etiqueta)}</t></is></c>'
            f'<c r="C{n}" s="3" t="inlineStr"><is><t>{escape(txt)}</t></is></c></row>')

if "instrucciones" in etapas:
    xml = texto("xl/worksheets/sheet1.xml")
    def reemplazar_celda(ref, estilo, nuevo, alto_fila=True):
        global xml
        m = re.search(rf'<c r="{ref}" s="{estilo}" t="(?:s"><v>\d+</v>|inlineStr"><is><t>[^<]*</t></is>)</c>', xml)
        if not m or len(re.findall(rf'<c r="{ref}" ', xml)) != 1:
            raise SystemExit(f"INSTRUCCIONES: la celda {ref} no es la esperada")
        xml = xml.replace(m.group(0), f'<c r="{ref}" s="{estilo}" t="inlineStr"><is><t>{escape(nuevo)}</t></is></c>')
        if alto_fila:
            n = ref[1:]
            fila = re.search(rf'<row r="{n}" customFormat="false" ht="[\d.]+"', xml)
            if not fila: raise SystemExit(f"INSTRUCCIONES: no encuentro la fila {n}")
            xml = xml.replace(fila.group(0), f'<row r="{n}" customFormat="false" ht="{alto(nuevo)}"')

    reemplazar_celda("B2", 1, "PLANTILLA DE CAPTURA v2 — REPORTERIA FINANCIERA Y OPERATIVA", alto_fila=False)
    reemplazar_celda("C7", 3, "Capture UNA FILA POR MOVIMIENTO: una por producto vendido, una por pago recibido, una por gasto. "
                              "No agrupe ni resuma: el sistema hace los totales.")
    reemplazar_celda("C8", 3, "Solo escriba en las celdas de LETRA AZUL. Las columnas de letra negra de la hoja ventas (utilidad, "
                              "margen, cobrado y saldo) se calculan solas con formulas: no escriba en ellas. La aplicacion las "
                              "vuelve a calcular por su cuenta al cargar el archivo.")
    reemplazar_celda("C12", 3, "El folio identifica UNA VENTA. Una venta con varios productos repite su folio en cada fila (vea "
                               "'Ventas con varios productos', abajo). Nunca use el mismo folio para dos ventas distintas: es la "
                               "llave que une las hojas.")
    reemplazar_celda("C16", 3, "Una fila por producto vendido (equipo, accesorio, servicio). Si una venta incluye 2 productos, son "
                               "2 filas con el mismo folio.")
    reemplazar_celda("C17", 3, "Una fila POR CADA PAGO O ABONO recibido, con su fecha y el folio de la venta que paga. Si un "
                               "cliente abono 3 veces, son 3 filas. Sin esta hoja no se puede saber cuanto se debe ni desde cuando.")
    reemplazar_celda("C24", 3, "Registre siempre los DIAS DE CREDITO pactados. Sin ese dato no se puede saber que cuenta esta "
                               "vencida. Cuentan desde la fecha de entrega de cada producto.")
    reemplazar_celda("C29", 3, "Columna calculada con formula. No escriba en ella.")

    nuevas = [
        ("Mismo folio", "Una venta que incluye varios productos se captura en varias filas CON EL MISMO FOLIO, una por "
                        "producto. Ejemplo: V-101, Equipo, Modelo A, $100,000 y en la fila de abajo V-101, Accesorios, Modelo B, "
                        "$10,000. Es UNA venta de $110,000 con dos partidas."),
        ("Datos de la venta", "Cliente, dias de credito, condicion y vendedor son de la venta completa. Al repetir el folio en "
                              "la fila de abajo se copian solos de la fila de arriba; puede escribir encima si hace falta. Si "
                              "quedan vacios, la aplicacion toma los de la primera fila de ese folio que los traiga."),
        ("Fecha", "La fecha es la de ENTREGA de cada producto. Si el equipo se entrego un dia y el accesorio otro, cada fila "
                  "lleva su fecha. Los dias de credito cuentan desde cada entrega."),
        ("Cobrado y saldo", "Son de la venta completa y aparecen solo en la PRIMERA fila de cada folio. En las demas filas del "
                            "mismo folio vera una flecha ↑, que quiere decir 'vea la primera fila de este folio'. Asi la columna "
                            "se puede sumar sin contar la misma venta dos veces."),
        ("Pagos", "En la hoja cobranza cada pago se anota contra el FOLIO de la venta, no contra un producto. Se aplican "
                  "primero a lo que se entrego primero: lo que queda pendiente es lo ultimo entregado."),
        ("Linea Demo", "Una unidad de linea Demo no es una venta. La hoja si suma en 'cobrado' los pagos anotados contra "
                       "su folio, pero el reporte no los cuenta como cobranza: por eso el total de esa columna puede ser "
                       "mayor que el 'Efectivo cobrado' del reporte."),
    ]
    encabezado = ('<row r="33" customFormat="false" ht="15" hidden="false" customHeight="false" outlineLevel="0" collapsed="false">'
                  '<c r="B33" s="4" t="inlineStr"><is><t>VENTAS CON VARIOS PRODUCTOS</t></is></c><c r="C33" s="5"/></row>')
    filas = encabezado + "".join(fila_texto(34 + i, e, t) for i, (e, t) in enumerate(nuevas))
    if xml.count("</sheetData>") != 1 or '<row r="32"' in xml or '<row r="33"' in xml:
        raise SystemExit("INSTRUCCIONES: el final de la hoja no es el esperado")
    xml = xml.replace("</sheetData>", filas + "</sheetData>")
    if xml.count('<dimension ref="B2:C31"/>') != 1:
        raise SystemExit("INSTRUCCIONES: dimension inesperada")
    xml = xml.replace('<dimension ref="B2:C31"/>', f'<dimension ref="B2:C{33 + len(nuevas)}"/>')
    partes["xl/worksheets/sheet1.xml"] = xml.encode("utf-8")

with zipfile.ZipFile(V2, "w") as zout:
    for i in zin.infolist():
        zout.writestr(i, partes[i.filename], compress_type=i.compress_type)
print("escrita", V2, "etapas:", " ".join(sorted(etapas)))
