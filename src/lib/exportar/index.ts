import type * as SheetJS from "xlsx";

import { fecha as fechaDeCaptura, fechaISO } from "../format";
import type { ModuloSheetJS } from "../parse";
import type { NombreHoja } from "../parse/tipos";
import { CAMPOS_CABECERA, type Cobranza, type Dataset, type Gasto, type Parametros, type Venta } from "../schema";

import {
  type Celda,
  PlantillaInesperada,
  type Valor,
  conEstilo,
  estiloDeCelda,
  extenderRangos,
  llenarFilaDeHoja,
  llenarHoja,
} from "./hojaXml";

/**
 * Exportacion del dataset a Excel: LA PLANTILLA v2, CON LOS DATOS PUESTOS.
 *
 * No se arma un libro nuevo. Se abre la plantilla que la app ofrece para
 * descargar y se escribe cada dato en la celda de captura que le toca. Todo lo
 * demas es de la plantilla y llega intacto: letra azul y negra, la fila de
 * ejemplo, las listas desplegables, los paneles fijos, INSTRUCCIONES, las
 * formulas de `cobrado` y `saldo` por folio con su flecha, y las que copian la
 * cabecera al repetir el folio. La version gratuita de SheetJS no escribe
 * estilos, listas ni paneles (GOBERNANZA.md, seccion 7): por eso no se le pide
 * que escriba la hoja, solo que abra y cierre el zip (`CFB`, que trae dentro).
 * Ver `docs/decisiones.md`, 2026-10-12.
 *
 * La prueba que importa es la de ida y vuelta: exportar, volver a cargar con el
 * mismo lector de la app y obtener exactamente el mismo dataset. Por eso cada
 * celda se escribe en la forma que el lector entiende sin ambiguedad:
 *
 * - Importes como numero en pesos (el lector multiplica por 100), nunca como
 *   texto con formato europeo.
 * - Fechas como serial de Excel calculado en UTC, sin pasar por un `Date` local:
 *   en Mexico la zona horaria correria cada fecha un dia.
 * - Porcentajes como fraccion (0.05), igual que los guarda Excel.
 *
 * Funcion pura: la plantilla y el modulo de SheetJS entran por parametro (ver
 * `descarga.ts` y `cargarSheetJS`).
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

/** Primera fila de datos: la 1 son encabezados y la 2 el ejemplo. */
const PRIMERA_FILA_DATOS = 3;

/** Fila hasta la que llegan los rangos de las formulas de `ventas` (`cobranza!$B$3:$B$1000`). */
const LIMITE_DE_RANGOS = 1000;

// --------------------------- Celdas ---------------------------

const MILIS_DIA = 86_400_000;
const EPOCA_EXCEL = Date.UTC(1899, 11, 30);

/** Serial de Excel de una fecha a medianoche UTC. Inverso exacto de `parseFecha`. */
export function serialExcel(fecha: Date): number {
  return (fecha.getTime() - EPOCA_EXCEL) / MILIS_DIA;
}

const pesos = (centavos: number | null): Valor => (centavos === null ? null : centavos / 100);
const serial = (d: Date | null): Valor => (d === null ? null : serialExcel(d));

// --------------------------- Filas ---------------------------

/** Campo del contrato -> lo que va en su celda. Lo que no esta aqui no se escribe. */
type Registro = Readonly<Record<string, Valor>>;

const deVenta = (v: Venta): Registro => ({
  folio: v.folio,
  fecha: serial(v.fecha),
  linea: v.linea,
  cliente: v.cliente,
  modelo: v.modelo,
  serie: v.serie,
  costo_unitario: pesos(v.costo_unitario),
  precio_venta: pesos(v.precio_venta),
  comision_pct: v.comision_pct,
  comision_base: v.comision_base,
  dias_credito: v.dias_credito,
  condicion: v.condicion,
  vendedor: v.vendedor,
  notas: v.notas,
});

const deCobranza = (c: Cobranza): Registro => ({
  folio_pago: c.folio_pago,
  folio_venta: c.folio_venta,
  fecha_pago: serial(c.fecha_pago),
  monto: pesos(c.monto),
  metodo: c.metodo,
  cliente_ref: c.cliente_ref,
  notas: c.notas,
});

const deGasto = (g: Gasto): Registro => ({
  folio_gasto: g.folio_gasto,
  fecha: serial(g.fecha),
  categoria: g.categoria,
  subcategoria: g.subcategoria,
  descripcion: g.descripcion,
  monto: pesos(g.monto),
  tipo: g.tipo,
  proveedor: g.proveedor,
  notas: g.notas,
});

/**
 * Las celdas de cada fila, en el orden de los encabezados. Las columnas
 * calculadas no tienen campo en el contrato y quedan `undefined`: conservan la
 * formula de la plantilla.
 */
function filas(hoja: NombreHoja, registros: readonly Registro[]): Celda[][] {
  return registros.map((r) => ENCABEZADOS[hoja].map((campo): Celda => r[campo]));
}

/**
 * Las filas de `ventas`, con la cabecera copiada donde la plantilla la copia.
 *
 * La formula de la plantilla en `cliente`, `dias_credito`, `condicion` y
 * `vendedor` muestra el valor de la fila de arriba si repite el folio, y nada
 * si no. Donde eso es justo lo que trae el dataset, la formula se conserva con
 * su valor guardado; donde no, se escribe el valor encima, que es lo que haria
 * quien captura. Asi el archivo dice siempre lo mismo que el dataset.
 */
function filasDeVentas(ventas: readonly Venta[]): Celda[][] {
  const celdas = filas("ventas", ventas.map(deVenta));
  ventas.forEach((v, i) => {
    const arriba = ventas[i - 1];
    const repite = arriba !== undefined && arriba.folio === v.folio;
    for (const campo of CAMPOS_CABECERA) {
      const muestra = repite ? arriba[campo] : null;
      const fila = celdas[i];
      if (fila !== undefined && v[campo] === muestra) fila[ENCABEZADOS.ventas.indexOf(campo)] = { copiada: muestra };
    }
  });
  return celdas;
}

// --------------------------- Parametros ---------------------------

const SI_NO = (v: boolean | null): Valor => (v === null ? null : v ? "SI" : "NO");

/**
 * Las fechas de los parametros van como texto dd/mm/aaaa, que es como las trae
 * la plantilla: su celda no tiene formato de fecha, y un serial se veria 46023.
 */
const deParametros = (p: Parametros): Registro => ({
  moneda_base: p.moneda_base,
  importes_incluyen_iva: SI_NO(p.importes_incluyen_iva),
  tasa_iva: p.tasa_iva,
  periodo_inicio: p.periodo_inicio === null ? null : fechaDeCaptura(p.periodo_inicio),
  periodo_fin: p.periodo_fin === null ? null : fechaDeCaptura(p.periodo_fin),
  comision_base_default: p.comision_base_default,
  dias_credito_default: p.dias_credito_default,
  provision_91_180: p.provision_91_180,
  provision_mas_180: p.provision_mas_180,
  tipo_cambio_usd: p.tipo_cambio_usd,
  nombre_cliente: p.nombre_cliente,
});

/** Como marca la plantilla, en la nota, el parametro que falta capturar. */
const PENDIENTE = /^PENDIENTE\s*—\s*/;

/**
 * La hoja clave-valor. Cada valor va en la columna B del renglon de su clave;
 * un parametro vacio se deja vacio (no se escribe su valor por omision ni el
 * que la plantilla sugiere) para que el archivo diga lo mismo que el dataset.
 * Un parametro capturado deja de estar pendiente: pierde el fondo de aviso y el
 * «PENDIENTE —» de su nota.
 */
function llenarParametros(xml: string, original: SheetJS.WorkSheet, p: Parametros): string {
  const valores = deParametros(p);
  const textoDe = (ref: string): string => String((original[ref] as SheetJS.CellObject | undefined)?.v ?? "").trim();
  const renglones = new Map<string, number>();
  for (let n = PRIMERA_FILA_DATOS - 1; textoDe(`A${n}`) !== ""; n++) renglones.set(textoDe(`A${n}`), n);

  // El estilo de un valor ya capturado es el de la primera celda de valor que
  // la plantilla trae llena.
  const llena = [...renglones.values()].find((n) => textoDe(`B${n}`) !== "" && !PENDIENTE.test(textoDe(`C${n}`)));
  const estiloCapturado = llena === undefined ? null : estiloDeCelda(xml, `B${llena}`);

  let salida = xml;
  for (const [clave, valor] of Object.entries(valores)) {
    const n = renglones.get(clave);
    if (n === undefined) throw new PlantillaInesperada(`la hoja parametros no trae «${clave}»`);
    const nota = textoDe(`C${n}`);
    const capturado = valor !== null && PENDIENTE.test(nota);
    salida = llenarFilaDeHoja(salida, n, [undefined, valor, capturado ? nota.replace(PENDIENTE, "") : undefined]);
    if (capturado && estiloCapturado !== null) salida = conEstilo(salida, `B${n}`, estiloCapturado);
  }
  return salida;
}

// --------------------------- El zip ---------------------------

/** Lo que usamos del modulo CFB que SheetJS trae dentro; sus tipos lo declaran sin forma. */
interface EntradaZip {
  content?: Uint8Array | readonly number[];
  size?: number;
}
interface ContenedorZip {
  readonly FullPaths: readonly string[];
  readonly FileIndex: EntradaZip[];
}
interface ModuloZip {
  read(datos: Uint8Array, opciones: { readonly type: "array" }): ContenedorZip;
  write(
    zip: ContenedorZip,
    opciones: { readonly fileType: "zip"; readonly type: "array"; readonly compression: true },
  ): Uint8Array | readonly number[];
}

const RAIZ = "Root Entry/";

function abrirZip(zip: ContenedorZip) {
  const entrada = (ruta: string): EntradaZip => {
    const e = zip.FileIndex[zip.FullPaths.indexOf(`${RAIZ}${ruta}`)];
    if (e?.content === undefined) throw new PlantillaInesperada(`falta ${ruta}`);
    return e;
  };
  return {
    leer: (ruta: string): string => new TextDecoder().decode(Uint8Array.from(entrada(ruta).content ?? [])),
    escribir(ruta: string, xml: string): void {
      const e = entrada(ruta);
      e.content = new TextEncoder().encode(xml);
      e.size = e.content.length;
    },
  };
}

const atributo = (etiqueta: string, nombre: string): string =>
  new RegExp(` ${nombre}="([^"]*)"`).exec(etiqueta)?.[1] ?? "";

/** Nombre de hoja -> ruta de su parte dentro del zip, siguiendo las relaciones del libro. */
function rutasDeHojas(libro: string, relaciones: string): Map<string, string> {
  const destinos = new Map<string, string>();
  for (const [etiqueta] of relaciones.matchAll(/<Relationship\b[^>]*>/g)) {
    destinos.set(atributo(etiqueta, "Id"), `xl/${atributo(etiqueta, "Target").replace(/^\/?(xl\/)?/, "")}`);
  }
  const rutas = new Map<string, string>();
  for (const [etiqueta] of libro.matchAll(/<sheet\b[^>]*>/g)) {
    const ruta = destinos.get(atributo(etiqueta, "r:id"));
    if (ruta !== undefined) rutas.set(atributo(etiqueta, "name"), ruta);
  }
  return rutas;
}

// --------------------------- El archivo ---------------------------

/**
 * El .xlsx del dataset: los bytes de la plantilla con los datos escritos.
 *
 * Lanza `PlantillaInesperada` si `plantilla` no es la que este codigo conoce
 * (otros encabezados, una hoja de menos): no escribe un archivo a medias.
 */
export function excelDeDataset(
  xlsx: ModuloSheetJS,
  plantilla: Uint8Array,
  dataset: Dataset,
): Uint8Array<ArrayBuffer> {
  // SheetJS lee la plantilla una vez, para saber donde esta cada cosa: que
  // columna es cada encabezado y que renglon es cada parametro.
  const original = xlsx.read(plantilla, { type: "array" });
  const cfb = xlsx.CFB as ModuloZip;
  const contenedor = cfb.read(plantilla, { type: "array" });
  const zip = abrirZip(contenedor);
  const rutas = rutasDeHojas(zip.leer("xl/workbook.xml"), zip.leer("xl/_rels/workbook.xml.rels"));

  const parte = (hoja: string): { ruta: string; ws: SheetJS.WorkSheet } => {
    const ruta = rutas.get(hoja);
    const ws = original.Sheets[hoja];
    if (ruta === undefined || ws === undefined) throw new PlantillaInesperada(`falta la hoja ${hoja}`);
    return { ruta, ws };
  };

  const porHoja: Readonly<Record<NombreHoja, Celda[][]>> = {
    ventas: filasDeVentas(dataset.ventas),
    cobranza: filas("cobranza", dataset.cobranza.map(deCobranza)),
    gastos: filas("gastos", dataset.gastos.map(deGasto)),
  };
  const ultimas: Partial<Record<NombreHoja, number>> = {};
  const xmlDe: Partial<Record<NombreHoja, string>> = {};
  for (const hoja of ["ventas", "cobranza", "gastos"] as const) {
    const { ruta, ws } = parte(hoja);
    const encabezados = (xlsx.utils.sheet_to_json<unknown[]>(ws, { header: 1 })[0] ?? []).map(String);
    if (encabezados.join("|") !== ENCABEZADOS[hoja].join("|")) {
      throw new PlantillaInesperada(`los encabezados de ${hoja} no son los del contrato`);
    }
    const llena = llenarHoja(zip.leer(ruta), porHoja[hoja], PRIMERA_FILA_DATOS);
    xmlDe[hoja] = llena.xml;
    ultimas[hoja] = llena.ultimaFila;
  }
  // `cobrado` y `saldo` suman sobre rangos de `ventas` y de `cobranza`.
  const masLarga = Math.max(ultimas.ventas ?? 0, ultimas.cobranza ?? 0);
  for (const hoja of ["ventas", "cobranza", "gastos"] as const) {
    const xml = xmlDe[hoja] ?? "";
    zip.escribir(parte(hoja).ruta, hoja === "ventas" ? extenderRangos(xml, LIMITE_DE_RANGOS, masLarga) : xml);
  }

  const parametros = parte("parametros");
  zip.escribir(parametros.ruta, llenarParametros(zip.leer(parametros.ruta), parametros.ws, dataset.parametros));

  return Uint8Array.from(cfb.write(contenedor, { fileType: "zip", type: "array", compression: true }));
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
