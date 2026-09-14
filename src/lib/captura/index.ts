import { validate } from "../parse/validate";
import { HOJAS_TABULARES, type NombreHoja, type RawCelda, type RawHoja, type RawSheets } from "../parse/tipos";
import { CobranzaSchema, GastoSchema, type Hallazgo, VentaSchema } from "../schema";
import { type Entradas, aCeldas } from "./campos";

export { CAMPOS, type CampoCaptura, type Entradas, type TipoCampo, aCelda, aCeldas, enBlanco, entradasVacias } from "./campos";

/**
 * Captura manual: la segunda puerta de entrada al MISMO dataset.
 *
 * Una fila capturada a mano se guarda como fila cruda, con sus celdas en el
 * formato que produce el lector de Excel, y entra al mismo `validate()` junto
 * con las del archivo. De ahi sale todo lo que importa, sin duplicar nada:
 *
 * - Los esquemas Zod del contrato (`schema.ts`) deciden si la fila es valida.
 * - Los mensajes son los del panel de carga, porque los producen las mismas
 *   reglas (`parse/reglas.ts`).
 * - Un folio repetido se detecta contra el archivo Y contra otras capturas.
 * - La exportacion a Excel escribe capturas y archivo por igual.
 *
 * Todo es puro: el store guarda el estado y llama a estas funciones.
 */

export interface FilaCapturada {
  readonly id: string;
  /**
   * Numero de fila que ocupa: la siguiente libre despues de lo que trae el
   * archivo. Es el numero con el que el validador la nombra en sus mensajes.
   */
  readonly fila: number;
  /** Lo que el usuario escribio, para poder editarlo tal cual. */
  readonly entradas: Entradas;
  /** Las mismas entradas, ya como celdas crudas. */
  readonly valores: Readonly<Record<string, RawCelda>>;
}

export type Capturas = Readonly<Record<NombreHoja, readonly FilaCapturada[]>>;

export const SIN_CAPTURAS: Capturas = { ventas: [], cobranza: [], gastos: [] };

export const ORIGEN_SIN_ARCHIVO = "Captura manual";

function hojaEnBlanco(nombre: NombreHoja): RawHoja {
  return {
    nombre,
    presente: true,
    encabezados: [],
    filas: [],
    filasVacias: 0,
    filasEjemplo: 0,
    filasNota: [],
    columnasIgnoradas: [],
  };
}

/**
 * Punto de partida sin archivo: las cuatro hojas presentes y vacias. Presentes
 * para que el validador no avise "el archivo no trae la hoja ventas": no hay
 * archivo, hay una captura que empieza de cero.
 */
export function hojasEnBlanco(): RawSheets {
  return {
    origen: ORIGEN_SIN_ARCHIVO,
    ventas: hojaEnBlanco("ventas"),
    cobranza: hojaEnBlanco("cobranza"),
    gastos: hojaEnBlanco("gastos"),
    parametros: { presente: true, valores: {}, filaDe: {}, filasRepetidas: {}, filasSinClave: [] },
  };
}

/**
 * El archivo mas las capturas, como un solo libro crudo. Las capturas van al
 * final de su hoja, en el orden en que se hicieron. Una hoja que el archivo no
 * traia pasa a estar presente en cuanto se le captura una fila.
 */
export function combinar(raw: RawSheets, capturas: Capturas): RawSheets {
  const hoja = (nombre: NombreHoja): RawHoja => {
    const base = raw[nombre];
    const extra = capturas[nombre];
    if (extra.length === 0) return base;
    return {
      ...base,
      presente: true,
      filas: [...base.filas, ...extra.map((c) => ({ fila: c.fila, valores: c.valores }))],
    };
  };
  return { ...raw, ventas: hoja("ventas"), cobranza: hoja("cobranza"), gastos: hoja("gastos") };
}

/**
 * La siguiente fila libre de una hoja: despues de todo lo que ocupa el archivo
 * (datos y notas) y de las capturas previas. Como en Excel, la 1 son los
 * encabezados y la 2 el ejemplo, asi que una hoja vacia empieza en la 3.
 */
export function siguienteFila(raw: RawSheets, capturas: Capturas, hoja: NombreHoja): number {
  const ocupadas = [
    2,
    ...raw[hoja].filas.map((f) => f.fila),
    ...raw[hoja].filasNota,
    ...capturas[hoja].map((c) => c.fila),
  ];
  return Math.max(...ocupadas) + 1;
}

/** Una fila capturada a partir de lo escrito. */
export function nuevaCaptura(id: string, fila: number, hoja: NombreHoja, entradas: Entradas): FilaCapturada {
  return { id, fila, entradas, valores: aCeldas(hoja, entradas) };
}

/**
 * Validacion EN VIVO de la fila que se esta escribiendo.
 *
 * Corre el validador completo sobre archivo + capturas + la candidata, y
 * devuelve solo los hallazgos que hablan de la candidata. La candidata va al
 * FINAL de su hoja: asi, si repite un folio, el hallazgo de duplicado cae en
 * ella ("ya se uso en la fila 7") y no en la fila original.
 *
 * `reemplaza` es el id de la captura que se esta editando, que se retira para
 * que no choque consigo misma.
 */
export function validarCandidata(
  raw: RawSheets,
  capturas: Capturas,
  hoja: NombreHoja,
  candidata: FilaCapturada,
  reemplaza: string | null,
): readonly Hallazgo[] {
  const conCandidata: Capturas = {
    ...capturas,
    [hoja]: [...capturas[hoja].filter((c) => c.id !== reemplaza), candidata],
  };
  return validate(combinar(raw, conCandidata)).hallazgos.filter(
    (h) => h.hoja === hoja && h.fila === candidata.fila,
  );
}

export const tieneErrores = (hallazgos: readonly Hallazgo[]): boolean =>
  hallazgos.some((h) => h.severidad === "error");

// --------------------------- Listado ---------------------------

export type OrigenFila = "archivo" | "captura";

/** Una fila de la hoja tal como la ve el listado de captura. */
export interface FilaListado {
  readonly clave: string;
  readonly origen: OrigenFila;
  /** Solo en capturas: para editar o borrar. */
  readonly idCaptura: string | null;
  readonly fila: number;
  readonly folio: string | null;
  readonly fecha: Date | null;
  /** Lo que identifica la fila de un vistazo: cliente y modelo, la venta abonada, la categoria. */
  readonly detalle: string;
  /** Centavos. null si falta o no se pudo leer. */
  readonly importe: number | null;
  /** false si el contrato la rechazo: no entra al reporte. */
  readonly valida: boolean;
  readonly errores: number;
  readonly advertencias: number;
}

const texto = (v: RawCelda | undefined): string => String(v ?? "").trim();

/** Lo que el listado muestra de cada hoja, leido con el mismo esquema del contrato. */
function resumirFila(
  hoja: NombreHoja,
  valores: Readonly<Record<string, RawCelda>>,
): Pick<FilaListado, "folio" | "fecha" | "detalle" | "importe" | "valida"> {
  if (hoja === "ventas") {
    const r = VentaSchema.safeParse(valores);
    if (!r.success) return { folio: texto(valores["folio"]) || null, fecha: null, detalle: texto(valores["cliente"]), importe: null, valida: false };
    return { folio: r.data.folio, fecha: r.data.fecha, detalle: `${r.data.cliente} · ${r.data.modelo}`, importe: r.data.precio_venta, valida: true };
  }
  if (hoja === "cobranza") {
    const r = CobranzaSchema.safeParse(valores);
    if (!r.success) return { folio: texto(valores["folio_pago"]) || null, fecha: null, detalle: texto(valores["folio_venta"]), importe: null, valida: false };
    return { folio: r.data.folio_pago, fecha: r.data.fecha_pago, detalle: `Abono a ${r.data.folio_venta}`, importe: r.data.monto, valida: true };
  }
  const r = GastoSchema.safeParse(valores);
  if (!r.success) return { folio: texto(valores["folio_gasto"]) || null, fecha: null, detalle: "", importe: null, valida: false };
  const detalle = [r.data.categoria, r.data.descripcion].filter((x): x is string => x !== null).join(" · ");
  return { folio: r.data.folio_gasto, fecha: r.data.fecha, detalle, importe: r.data.monto, valida: true };
}

/**
 * Todas las filas de una hoja, del archivo y capturadas, con su origen y sus
 * hallazgos. Las del archivo van primero, en su orden; las capturas despues.
 */
export function filasDeHoja(
  raw: RawSheets,
  capturas: Capturas,
  hoja: NombreHoja,
  hallazgos: readonly Hallazgo[],
): readonly FilaListado[] {
  const cuenta = (fila: number, severidad: Hallazgo["severidad"]) =>
    hallazgos.filter((h) => h.hoja === hoja && h.fila === fila && h.severidad === severidad).length;

  const delArchivo = raw[hoja].filas.map(
    (f): FilaListado => ({
      clave: `archivo-${f.fila}`,
      origen: "archivo",
      idCaptura: null,
      fila: f.fila,
      ...resumirFila(hoja, f.valores),
      errores: cuenta(f.fila, "error"),
      advertencias: cuenta(f.fila, "advertencia"),
    }),
  );
  const capturadas = capturas[hoja].map(
    (c): FilaListado => ({
      clave: `captura-${c.id}`,
      origen: "captura",
      idCaptura: c.id,
      fila: c.fila,
      ...resumirFila(hoja, c.valores),
      errores: cuenta(c.fila, "error"),
      advertencias: cuenta(c.fila, "advertencia"),
    }),
  );
  return [...delArchivo, ...capturadas];
}

/** Filas capturadas a mano por hoja, para marcarlas en el panel de validacion. */
export function filasCapturadas(capturas: Capturas): Readonly<Record<NombreHoja, ReadonlySet<number>>> {
  const de = (h: NombreHoja) => new Set(capturas[h].map((c) => c.fila));
  return { ventas: de("ventas"), cobranza: de("cobranza"), gastos: de("gastos") };
}

/** Cuantas filas se han capturado a mano en total. */
export function totalCapturas(capturas: Capturas): number {
  return HOJAS_TABULARES.reduce((t, h) => t + capturas[h].length, 0);
}

/**
 * De donde salen los datos, para barra, pie y encabezados del PDF: el nombre
 * del archivo, "Captura manual" si no hay archivo, y cuantas filas se
 * agregaron a mano si las hay. Un reporte con datos mezclados lo dice.
 */
export function etiquetaOrigen(nombreArchivo: string | null, capturadas: number): string {
  const base = nombreArchivo ?? ORIGEN_SIN_ARCHIVO;
  if (capturadas === 0 || nombreArchivo === null) return base;
  return `${base} + ${capturadas} ${capturadas === 1 ? "fila capturada" : "filas capturadas"} a mano`;
}
