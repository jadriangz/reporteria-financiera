import type * as SheetJS from "xlsx";

import { fechaISO } from "../format";
import type { ModuloSheetJS } from "../parse";
import type { NombreHoja } from "../parse/tipos";
import type { Cobranza, Dataset, Gasto, Parametros, Venta } from "../schema";

/**
 * Exportacion del dataset a Excel, con la estructura de la plantilla que se le
 * entrego al cliente: mismas hojas, mismos encabezados en el mismo orden, la
 * fila de ejemplo en la fila 2 y los datos desde la 3, formatos de moneda,
 * fecha y porcentaje, y las columnas calculadas como formulas.
 *
 * La prueba que importa es la de ida y vuelta: exportar, volver a cargar con el
 * mismo lector de la app y obtener exactamente el mismo dataset. Por eso cada
 * celda se escribe en la forma que el lector entiende sin ambiguedad:
 *
 * - Importes como numero en pesos (el lector multiplica por 100), nunca como
 *   texto con formato europeo.
 * - Fechas como serial de Excel calculado en UTC. SheetJS convierte los `Date`
 *   con la zona horaria local; en Mexico eso correria cada fecha un dia.
 * - Porcentajes como fraccion (0.05), igual que los guarda Excel.
 *
 * Funcion pura salvo por el modulo de SheetJS, que entra por parametro para no
 * arrastrarlo al bundle inicial (ver `cargarSheetJS`).
 */

/** Encabezados de cada hoja, en el orden exacto de la plantilla. */
export const ENCABEZADOS: Readonly<Record<NombreHoja, readonly string[]>> = {
  ventas: [
    "folio",
    "fecha",
    "linea",
    "cliente",
    "modelo",
    "serie",
    "costo_unitario",
    "precio_venta",
    "comision_pct",
    "comision_base",
    "dias_credito",
    "condicion",
    "vendedor",
    "utilidad_bruta",
    "margen_pct",
    "cobrado",
    "saldo",
    "notas",
  ],
  cobranza: ["folio_pago", "folio_venta", "fecha_pago", "monto", "metodo", "cliente_ref", "notas"],
  gastos: [
    "folio_gasto",
    "fecha",
    "categoria",
    "subcategoria",
    "descripcion",
    "monto",
    "tipo",
    "proveedor",
    "notas",
  ],
};

/** Formatos de numero de la plantilla, copiados de sus celdas. */
export const FORMATO = {
  moneda: '\\$#,##0.00;"($"#,##0.00\\);\\-',
  fecha: "dd/mm/yyyy",
  porcentaje: "0.0%",
} as const;

/** Anchos de columna de la plantilla, en caracteres. */
const ANCHOS: Readonly<Record<NombreHoja | "parametros", readonly number[]>> = {
  ventas: [9, 11, 12, 33, 16, 17, 14, 14, 11, 12, 10, 11, 15, 14, 10, 14, 14, 39],
  cobranza: [11, 11, 13, 15, 15, 33, 45],
  gastos: [11, 12, 15, 17, 45, 15, 11, 25, 33],
  parametros: [29, 21, 77],
};

/** Primera fila de datos: la 1 son encabezados y la 2 el ejemplo, como en la plantilla. */
const PRIMERA_FILA_DATOS = 3;

// --------------------------- Celdas ---------------------------

type Celda = SheetJS.CellObject | null;

const MILIS_DIA = 86_400_000;
const EPOCA_EXCEL = Date.UTC(1899, 11, 30);

/** Serial de Excel de una fecha a medianoche UTC. Inverso exacto de `parseFecha`. */
export function serialExcel(fecha: Date): number {
  return (fecha.getTime() - EPOCA_EXCEL) / MILIS_DIA;
}

const texto = (v: string | null): Celda => (v === null ? null : { t: "s", v });
const numero = (v: number | null): Celda => (v === null ? null : { t: "n", v });
const importe = (centavos: number | null): Celda =>
  centavos === null ? null : { t: "n", v: centavos / 100, z: FORMATO.moneda };
const fecha = (d: Date | null): Celda =>
  d === null ? null : { t: "n", v: serialExcel(d), z: FORMATO.fecha };
const porcentaje = (v: number | null): Celda =>
  v === null ? null : { t: "n", v, z: FORMATO.porcentaje };
const formula = (f: string, z: string): Celda => ({ t: "n", f, z });

// --------------------------- Filas ---------------------------

/**
 * Columnas calculadas de ventas, con las formulas de la plantilla. El lector
 * las ignora al cargar (el motor recalcula), pero el cliente las ve en Excel.
 */
function calculadasDeVenta(fila: number): Celda[] {
  return [
    formula(`IFERROR(H${fila}-G${fila},"")`, FORMATO.moneda),
    formula(`IFERROR(N${fila}/H${fila},"")`, FORMATO.porcentaje),
    formula(
      `IFERROR(SUMIF(cobranza!$B$3:$B$1000,A${fila},cobranza!$D$3:$D$1000),0)`,
      FORMATO.moneda,
    ),
    formula(`IFERROR(H${fila}-P${fila},"")`, FORMATO.moneda),
  ];
}

function filaVenta(v: Venta, fila: number): Celda[] {
  return [
    texto(v.folio),
    fecha(v.fecha),
    texto(v.linea),
    texto(v.cliente),
    texto(v.modelo),
    texto(v.serie),
    importe(v.costo_unitario),
    importe(v.precio_venta),
    porcentaje(v.comision_pct),
    texto(v.comision_base),
    numero(v.dias_credito),
    texto(v.condicion),
    texto(v.vendedor),
    ...calculadasDeVenta(fila),
    texto(v.notas),
  ];
}

function filaCobranza(c: Cobranza): Celda[] {
  return [
    texto(c.folio_pago),
    texto(c.folio_venta),
    fecha(c.fecha_pago),
    importe(c.monto),
    texto(c.metodo),
    texto(c.cliente_ref),
    texto(c.notas),
  ];
}

function filaGasto(g: Gasto): Celda[] {
  return [
    texto(g.folio_gasto),
    fecha(g.fecha),
    texto(g.categoria),
    texto(g.subcategoria),
    texto(g.descripcion),
    importe(g.monto),
    texto(g.tipo),
    texto(g.proveedor),
    texto(g.notas),
  ];
}

/**
 * La fila verde de ejemplo de la plantilla. Se exporta para que el archivo
 * tenga la misma forma que el que se entrego: el lector la descarta por folio.
 */
const EJEMPLO: Readonly<Record<NombreHoja, (fila: number) => Celda[]>> = {
  ventas: (fila) => [
    texto("V-000"),
    texto("15/03/2026"),
    texto("Equipo"),
    texto("EJEMPLO — Cliente Demostrativo"),
    texto("Modelo A"),
    texto("ABC123456789"),
    importe(20_000_000),
    importe(26_000_000),
    porcentaje(0.05),
    texto("Venta"),
    numero(90),
    texto("Credito"),
    texto("Nombre vendedor"),
    ...calculadasDeVenta(fila),
    texto("Fila de ejemplo — no borrar"),
  ],
  cobranza: () => [
    texto("P-000"),
    texto("V-000"),
    texto("20/04/2026"),
    importe(10_000_000),
    texto("Transferencia"),
    texto("EJEMPLO — Cliente Demostrativo"),
    texto("Fila de ejemplo — no borrar"),
  ],
  gastos: () => [
    texto("G-000"),
    texto("10/03/2026"),
    texto("Nomina"),
    texto("Sueldo"),
    texto("Sueldo mensual empleado operativo"),
    importe(1_500_000),
    texto("Fijo"),
    texto("N/A"),
    texto("Fila de ejemplo — no borrar"),
  ],
};

// --------------------------- Hojas ---------------------------

/** Arma una hoja a partir de filas de celdas; una celda null queda vacia. */
function hoja(
  xlsx: ModuloSheetJS,
  encabezados: readonly string[],
  filas: readonly (readonly Celda[])[],
  anchos: readonly number[],
): SheetJS.WorkSheet {
  const ws: SheetJS.WorkSheet = {};
  encabezados.forEach((h, c) => {
    ws[xlsx.utils.encode_cell({ r: 0, c })] = { t: "s", v: h };
  });
  filas.forEach((celdas, i) => {
    celdas.forEach((celda, c) => {
      if (celda !== null) ws[xlsx.utils.encode_cell({ r: i + 1, c })] = celda;
    });
  });
  ws["!ref"] = xlsx.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: Math.max(filas.length, 1), c: encabezados.length - 1 },
  });
  ws["!cols"] = anchos.map((wch) => ({ wch }));
  return ws;
}

function hojaTabular<T>(
  xlsx: ModuloSheetJS,
  nombre: NombreHoja,
  registros: readonly T[],
  aFila: (r: T, fila: number) => Celda[],
): SheetJS.WorkSheet {
  const filas = [
    EJEMPLO[nombre](PRIMERA_FILA_DATOS - 1),
    ...registros.map((r, i) => aFila(r, PRIMERA_FILA_DATOS + i)),
  ];
  return hoja(xlsx, ENCABEZADOS[nombre], filas, ANCHOS[nombre]);
}

const SI_NO = (v: boolean | null): Celda => (v === null ? null : texto(v ? "SI" : "NO"));

/**
 * La hoja clave-valor de parametros, en el orden de la plantilla. Un parametro
 * vacio se deja vacio (no se escribe su valor por omision) para que el archivo
 * diga lo mismo que dijo el cliente.
 */
function hojaParametros(xlsx: ModuloSheetJS, p: Parametros): SheetJS.WorkSheet {
  const filas: [string, Celda, string][] = [
    ["moneda_base", texto(p.moneda_base), "Moneda en que se capturan todos los importes."],
    [
      "importes_incluyen_iva",
      SI_NO(p.importes_incluyen_iva),
      p.importes_incluyen_iva === null
        ? "PENDIENTE — Escriba SI o NO. Critico: define si los reportes van con o sin IVA."
        : "SI o NO: define si los reportes van con o sin IVA.",
    ],
    ["tasa_iva", numero(p.tasa_iva), "Tasa aplicable."],
    ["periodo_inicio", fecha(p.periodo_inicio), "Inicio del periodo a reportar."],
    ["periodo_fin", fecha(p.periodo_fin), "Fin del periodo a reportar."],
    ["comision_base_default", texto(p.comision_base_default), "Venta, Utilidad o No aplica."],
    ["dias_credito_default", numero(p.dias_credito_default), "Dias de credito estandar que otorgan."],
    [
      "provision_91_180",
      numero(p.provision_91_180),
      "% de la cartera de 91-180 dias que se estima incobrable.",
    ],
    [
      "provision_mas_180",
      numero(p.provision_mas_180),
      "% de la cartera de mas de 180 dias que se estima incobrable.",
    ],
    ["tipo_cambio_usd", numero(p.tipo_cambio_usd), "Solo si compran en USD."],
    [
      "nombre_cliente",
      texto(p.nombre_cliente),
      "Nombre del cliente o empresa, tal como debe aparecer en la portada del reporte.",
    ],
  ];
  return hoja(
    xlsx,
    ["parametro", "valor", "nota"],
    filas.map(([clave, valor, nota]) => [texto(clave), valor, texto(nota)]),
    ANCHOS.parametros,
  );
}

/** El libro completo: ventas, cobranza, gastos y parametros, en ese orden. */
export function libroDeDataset(xlsx: ModuloSheetJS, dataset: Dataset): SheetJS.WorkBook {
  const libro = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(libro, hojaTabular(xlsx, "ventas", dataset.ventas, filaVenta), "ventas");
  xlsx.utils.book_append_sheet(libro, hojaTabular(xlsx, "cobranza", dataset.cobranza, filaCobranza), "cobranza");
  xlsx.utils.book_append_sheet(libro, hojaTabular(xlsx, "gastos", dataset.gastos, filaGasto), "gastos");
  xlsx.utils.book_append_sheet(libro, hojaParametros(xlsx, dataset.parametros), "parametros");
  return libro;
}

/**
 * Nombre del archivo exportado: "Datos_<periodo>_<corte>.xlsx", con las fechas
 * en aaaa-mm-dd como el PDF, para que los archivos de varios cortes se ordenen
 * solos. "Datos" y no "Reporte": es el insumo, no el reporte.
 */
export function nombreArchivoExcel(periodo: { readonly inicio: Date; readonly fin: Date } | null, corte: Date): string {
  const tramo = periodo === null ? "sin-periodo" : `${fechaISO(periodo.inicio)}-a-${fechaISO(periodo.fin)}`;
  return `Datos_${tramo}_${fechaISO(corte)}.xlsx`;
}
