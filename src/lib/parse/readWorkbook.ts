import Papa from "papaparse";
// Solo el TIPO se importa de forma estatica: el modulo pesa casi 1 MB y se
// trae con `import()` la primera vez que llega un .xlsx. Ver `cargarSheetJS`.
import type * as SheetJS from "xlsx";

import {
  COLUMNAS_MONTO,
  HOJAS_TABULARES,
  type NombreHoja,
  type RawCelda,
  type RawFila,
  type RawHoja,
  type RawParametros,
  type RawSheets,
} from "./tipos";

// --------------------------- Reglas de la plantilla ---------------------------

/**
 * Encabezados en la fila 1. Los datos empiezan en la fila 3 porque la fila 2 es
 * el ejemplo de la plantilla. Aun asi leemos desde la 2 y descartamos el ejemplo
 * POR FOLIO, no por posicion: si el cliente borro la fila de ejemplo, la 2 pasa a
 * ser un dato real y no queremos perderlo.
 */
const FILA_ENCABEZADOS = 1;
const PRIMERA_FILA_DATOS = 2;

/** Folios sentinela de la fila de ejemplo. Se descarta donde sea que aparezca. */
const FOLIOS_EJEMPLO: ReadonlySet<string> = new Set(["v-000", "p-000", "g-000"]);

/** Columna que identifica la fila en cada hoja. */
const COLUMNA_FOLIO: Readonly<Record<NombreHoja, string>> = {
  ventas: "folio",
  cobranza: "folio_pago",
  gastos: "folio_gasto",
};

/**
 * Columnas que la plantilla calcula con formulas de Excel para comodidad del
 * cliente. El motor las recalcula: leerlas seria confiar en una cifra que no
 * controlamos. Se descartan al leer, no mas adelante.
 *
 * Ademas tienen un efecto secundario que obliga a ignorarlas: en las filas
 * vacias del formato las formulas devuelven 0 y "", de modo que una fila sin
 * capturar parece tener datos. La vacuidad se juzga sin ellas.
 */
const COLUMNAS_CALCULADAS: Readonly<Record<NombreHoja, readonly string[]>> = {
  ventas: ["utilidad_bruta", "margen_pct", "cobrado", "saldo"],
  cobranza: [],
  gastos: [],
};

/** Encabezados de la hoja clave-valor de parametros. */
const COL_PARAMETRO = "parametro";
const COL_VALOR = "valor";

// --------------------------- Normalizacion ---------------------------

/** Rango de diacriticos combinantes que deja `normalize("NFD")`. */
const DIACRITICOS = new RegExp("[\u0300-\u036f]", "g");

/** "Parametros" -> "parametros". Insensible a mayusculas y acentos. */
function normalizarClave(valor: unknown): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(DIACRITICOS, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function celdaVacia(c: RawCelda): boolean {
  return c === null || c === undefined || String(c).trim() === "";
}

// --------------------------- Construccion de hojas ---------------------------

type Rejilla = readonly (readonly RawCelda[])[];

/** Hoja ausente del archivo. No truena: el validador decide que significa. */
function hojaVacia(nombre: NombreHoja): RawHoja {
  return {
    nombre,
    presente: false,
    encabezados: [],
    filas: [],
    filasVacias: 0,
    filasEjemplo: 0,
    filasNota: [],
    columnasIgnoradas: COLUMNAS_CALCULADAS[nombre],
  };
}

/**
 * Convierte una rejilla de celdas en filas con nombre de columna y numero de
 * fila real. `filaInicial` es el numero de fila de Excel de `rejilla[0]`.
 */
function construirHoja(nombre: NombreHoja, rejilla: Rejilla, filaInicial: number): RawHoja {
  const filaEncabezado = FILA_ENCABEZADOS - filaInicial;
  const crudos = rejilla[filaEncabezado] ?? [];
  const encabezados = crudos.map(normalizarClave);

  const calculadas = COLUMNAS_CALCULADAS[nombre];
  const indicesUtiles = encabezados
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => h !== "" && !calculadas.includes(h));

  const columnaFolio = COLUMNA_FOLIO[nombre];
  const filas: RawFila[] = [];
  let filasVacias = 0;
  let filasEjemplo = 0;
  const filasNota: number[] = [];

  for (let i = PRIMERA_FILA_DATOS - filaInicial; i < rejilla.length; i += 1) {
    const celdas = rejilla[i];
    if (celdas === undefined) continue;
    const numeroFila = i + filaInicial;

    // La vacuidad se juzga solo sobre columnas de entrada, nunca sobre las
    // calculadas: sus formulas rellenan las filas en blanco de la plantilla.
    if (indicesUtiles.every(({ i: col }) => celdaVacia(celdas[col] ?? null))) {
      filasVacias += 1;
      continue;
    }

    const valores: Record<string, RawCelda> = {};
    for (const { h, i: col } of indicesUtiles) valores[h] = celdas[col] ?? null;

    const folio = normalizarClave(valores[columnaFolio]);
    if (FOLIOS_EJEMPLO.has(folio)) {
      filasEjemplo += 1;
      continue;
    }

    // Sin folio y sin ningun importe no es un registro: es una nota que alguien
    // escribio en la hoja ("FALTA CAPTURAR: ..."). Se descarta y se informa.
    if (folio === "" && COLUMNAS_MONTO[nombre].every((c) => celdaVacia(valores[c] ?? null))) {
      filasNota.push(numeroFila);
      continue;
    }

    filas.push({ fila: numeroFila, valores });
  }

  return {
    nombre,
    presente: true,
    encabezados: indicesUtiles.map(({ h }) => h),
    filas,
    filasVacias,
    filasEjemplo,
    filasNota,
    columnasIgnoradas: calculadas,
  };
}

/** La hoja `parametros` es clave-valor, no tabular: necesita su propio lector. */
function construirParametros(rejilla: Rejilla, filaInicial: number): RawParametros {
  const filaEncabezado = FILA_ENCABEZADOS - filaInicial;
  const encabezados = (rejilla[filaEncabezado] ?? []).map(normalizarClave);
  const iParam = encabezados.indexOf(COL_PARAMETRO);
  const iValor = encabezados.indexOf(COL_VALOR);

  // Si faltan los encabezados esperados caemos a las dos primeras columnas:
  // la forma clave-valor es evidente aunque el cliente renombre los titulos.
  const colParam = iParam >= 0 ? iParam : 0;
  const colValor = iValor >= 0 ? iValor : 1;

  const valores: Record<string, RawCelda> = {};
  const filaDe: Record<string, number> = {};

  for (let i = filaEncabezado + 1; i < rejilla.length; i += 1) {
    const celdas = rejilla[i];
    if (celdas === undefined) continue;
    const clave = normalizarClave(celdas[colParam]);
    if (clave === "") continue;
    valores[clave] = celdas[colValor] ?? null;
    filaDe[clave] = i + filaInicial;
  }

  return { presente: true, valores, filaDe };
}

// --------------------------- Lectura de xlsx ---------------------------

/** El modulo de SheetJS tal como lo entrega `import("xlsx")`. */
export type ModuloSheetJS = typeof SheetJS;

let cargaSheetJS: Promise<ModuloSheetJS> | null = null;

/**
 * Trae SheetJS bajo demanda, una sola vez.
 *
 * La app arranca sin el: nadie necesita leer Excel hasta soltar un archivo, y
 * cargarlo de entrada casi duplicaba el bundle inicial. El chunk sale del mismo
 * origen que la app; ningun dato viaja a ningun lado por cargarlo.
 *
 * Si la descarga falla (sin red, despliegue a medias) se olvida la promesa
 * rechazada para que el siguiente intento vuelva a probar, y el error se
 * traduce a algo que el usuario pueda leer en el panel de carga.
 */
export function cargarSheetJS(): Promise<ModuloSheetJS> {
  cargaSheetJS ??= import("xlsx").catch((error: unknown) => {
    cargaSheetJS = null;
    throw new Error(
      "No se pudo cargar el lector de Excel. Verifique su conexión y vuelva a soltar el archivo.",
      { cause: error },
    );
  });
  return cargaSheetJS;
}

function rejillaDeHoja(
  sheetjs: ModuloSheetJS,
  ws: SheetJS.WorkSheet,
): { rejilla: Rejilla; filaInicial: number } {
  const ref = ws["!ref"];
  // Una hoja cuyo rango no arranca en A1 desplaza la numeracion: hay que
  // tenerlo en cuenta o los numeros de fila que reportamos serian falsos.
  const filaInicial = ref === undefined ? 1 : sheetjs.utils.decode_range(ref).s.r + 1;
  const rejilla = sheetjs.utils.sheet_to_json<RawCelda[]>(ws, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: true,
  });
  return { rejilla, filaInicial };
}

function leerXlsx(sheetjs: ModuloSheetJS, datos: ArrayBuffer, origen: string): RawSheets {
  const wb = sheetjs.read(datos, { type: "array", cellDates: false });

  // Indice por nombre normalizado: tolera "Ventas", "VENTAS", "Parametros".
  const porNombre = new Map<string, SheetJS.WorkSheet>();
  for (const nombre of wb.SheetNames) {
    const ws = wb.Sheets[nombre];
    if (ws !== undefined) porNombre.set(normalizarClave(nombre), ws);
  }

  const hojas = {} as Record<NombreHoja, RawHoja>;
  for (const nombre of HOJAS_TABULARES) {
    const ws = porNombre.get(nombre);
    if (ws === undefined) {
      hojas[nombre] = hojaVacia(nombre);
      continue;
    }
    const { rejilla, filaInicial } = rejillaDeHoja(sheetjs, ws);
    hojas[nombre] = construirHoja(nombre, rejilla, filaInicial);
  }

  const wsParam = porNombre.get("parametros");
  let parametros: RawParametros = { presente: false, valores: {}, filaDe: {} };
  if (wsParam !== undefined) {
    const { rejilla, filaInicial } = rejillaDeHoja(sheetjs, wsParam);
    parametros = construirParametros(rejilla, filaInicial);
  }

  return { origen, ...hojas, parametros };
}

// --------------------------- Lectura de csv ---------------------------

/**
 * Un CSV solo puede traer una hoja. Se decide cual por sus encabezados, que son
 * inequivocos, y el nombre del archivo queda como pista de respaldo.
 */
function hojaDeCsv(encabezados: readonly string[], origen: string): NombreHoja | "parametros" | null {
  const set = new Set(encabezados);
  if (set.has("folio_venta")) return "cobranza";
  if (set.has("folio_gasto")) return "gastos";
  if (set.has(COL_PARAMETRO)) return "parametros";
  if (set.has("folio") || set.has("precio_venta")) return "ventas";

  const archivo = normalizarClave(origen.replace(/\.csv$/i, ""));
  for (const nombre of HOJAS_TABULARES) if (archivo.includes(nombre)) return nombre;
  if (archivo.includes("parametros")) return "parametros";
  return null;
}

function leerCsv(datos: ArrayBuffer, origen: string): RawSheets {
  const texto = new TextDecoder("utf-8").decode(datos);
  const { data } = Papa.parse<RawCelda[]>(texto, {
    header: false,
    skipEmptyLines: false,
    dynamicTyping: true,
  });
  const rejilla: Rejilla = data;

  const vacio: RawSheets = {
    origen,
    ventas: hojaVacia("ventas"),
    cobranza: hojaVacia("cobranza"),
    gastos: hojaVacia("gastos"),
    parametros: { presente: false, valores: {}, filaDe: {} },
  };

  const encabezados = (rejilla[0] ?? []).map(normalizarClave);
  const destino = hojaDeCsv(encabezados, origen);
  if (destino === null) return vacio;
  if (destino === "parametros") return { ...vacio, parametros: construirParametros(rejilla, 1) };
  return { ...vacio, [destino]: construirHoja(destino, rejilla, 1) };
}

// --------------------------- API publica ---------------------------

const esCsv = (nombreArchivo: string): boolean => /\.csv$/i.test(nombreArchivo);

/**
 * Nucleo sincrono de la lectura. Recibe el contenido ya en memoria, de modo que
 * las pruebas puedan leer la plantilla real desde disco sin depender de `File`.
 *
 * SheetJS entra por parametro en lugar de importarse aqui: asi este modulo no
 * lo arrastra al bundle inicial, y las pruebas en node le pasan el mismo
 * modulo con un import estatico, que no llega al navegador.
 */
export function readWorkbookFromBuffer(
  datos: ArrayBuffer,
  nombreArchivo: string,
  sheetjs: ModuloSheetJS,
): RawSheets {
  return esCsv(nombreArchivo)
    ? leerCsv(datos, nombreArchivo)
    : leerXlsx(sheetjs, datos, nombreArchivo);
}

/**
 * Lee el archivo cargado por el usuario y devuelve las filas crudas por hoja,
 * sin validar. Es asincrona porque leer un `File` en el navegador lo es, y
 * porque la primera vez que llega un .xlsx hay que traer SheetJS. Un .csv no
 * lo necesita y no lo descarga.
 *
 * Una hoja ausente se devuelve vacia y marcada `presente: false`; no lanza.
 */
export async function readWorkbook(file: File): Promise<RawSheets> {
  const datos = await file.arrayBuffer();
  if (esCsv(file.name)) return leerCsv(datos, file.name);
  return leerXlsx(await cargarSheetJS(), datos, file.name);
}
