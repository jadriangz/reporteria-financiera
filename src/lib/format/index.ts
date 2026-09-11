/**
 * Capa de formato. Nadie mas formatea: si un componente hace `.toFixed()` o
 * concatena un "$", esta mal.
 *
 * El motor trabaja en centavos enteros y devuelve `null` donde no hay dato.
 * Aqui es donde eso se convierte en texto, y donde se respeta la regla que da
 * sentido al reporte: **null nunca se pinta como "0", "NaN" ni vacio.** Se
 * pinta como raya. La diferencia entre "no hay dato" y "el dato es cero" es
 * informacion, y borrarla es mentirle al que lee.
 */

/** Lo que se pinta cuando no hay dato. */
export const SIN_DATO = "—";

const LOCALE = "es-MX";

/** Meses abreviados en español; Intl varia entre motores y aqui hace falta estabilidad. */
const MESES_CORTOS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
] as const;

export interface OpcionesMoneda {
  /** Muestra los centavos. Por omision se redondea a pesos. */
  readonly decimales?: boolean;
  /** Antepone el signo + a los positivos. Util en variaciones. */
  readonly signoExplicito?: boolean;
}

/**
 * Importe en pesos a partir de centavos.
 *
 * Convencion contable: los negativos van entre parentesis, no con signo menos.
 * En una columna de cifras el parentesis se ve de un vistazo y el menos se
 * confunde con un guion de separacion.
 *
 *   moneda(110023100)        -> "$1,100,231"
 *   moneda(110023100, {decimales: true}) -> "$1,100,231.00"
 *   moneda(-3800000)         -> "($38,000)"
 */
export function moneda(centavos: number | null, opciones: OpcionesMoneda = {}): string {
  if (centavos === null || !Number.isFinite(centavos)) return SIN_DATO;

  const decimales = opciones.decimales ?? false;
  const negativo = centavos < 0;
  const pesos = Math.abs(centavos) / 100;

  const cuerpo = pesos.toLocaleString(LOCALE, {
    minimumFractionDigits: decimales ? 2 : 0,
    maximumFractionDigits: decimales ? 2 : 0,
  });

  if (negativo) return `($${cuerpo})`;
  return opciones.signoExplicito === true ? `+$${cuerpo}` : `$${cuerpo}`;
}

/** Umbrales de la forma compacta, de mayor a menor. */
const ESCALAS = [
  { limite: 1_000_000_000, sufijo: "MM" },
  { limite: 1_000_000, sufijo: "M" },
  { limite: 1_000, sufijo: "k" },
] as const;

/**
 * Importe abreviado para ejes de graficas, donde no cabe la cifra completa.
 * Nunca para una tabla: ahi se comparan cifras y hay que verlas enteras.
 *
 *   monedaCompacta(110023100) -> "$1.1M"
 *   monedaCompacta(43800000)  -> "$438k"
 */
export function monedaCompacta(centavos: number | null): string {
  if (centavos === null || !Number.isFinite(centavos)) return SIN_DATO;

  const negativo = centavos < 0;
  const pesos = Math.abs(centavos) / 100;

  const escala = ESCALAS.find((e) => pesos >= e.limite);
  const texto =
    escala === undefined
      ? pesos.toLocaleString(LOCALE, { maximumFractionDigits: 0 })
      : `${recortarCero(pesos / escala.limite)}${escala.sufijo}`;

  return negativo ? `($${texto})` : `$${texto}`;
}

/** 1.0 -> "1", 1.1 -> "1.1". Un decimal, sin ceros de relleno. */
function recortarCero(valor: number): string {
  const uno = valor.toFixed(1);
  return uno.endsWith(".0") ? uno.slice(0, -2) : uno;
}

/**
 * Ratio (0 a 1) a porcentaje.
 *
 *   porcentaje(0.2)      -> "20.0%"
 *   porcentaje(0.2, 0)   -> "20%"
 */
export function porcentaje(ratio: number | null, decimales = 1): string {
  if (ratio === null || !Number.isFinite(ratio)) return SIN_DATO;
  return `${(ratio * 100).toFixed(decimales)}%`;
}

/**
 * aaaa-mm-dd en UTC. Para nombres de archivo, donde el orden alfabetico debe
 * coincidir con el cronologico y no caben diagonales. Nunca para pantalla.
 */
export function fechaISO(valor: Date | null): string {
  if (valor === null || Number.isNaN(valor.getTime())) return SIN_DATO;
  return valor.toISOString().slice(0, 10);
}

/** dd/mm/aaaa, el mismo formato en que el cliente captura. */
export function fecha(valor: Date | null): string {
  if (valor === null || Number.isNaN(valor.getTime())) return SIN_DATO;
  const d = String(valor.getUTCDate()).padStart(2, "0");
  const m = String(valor.getUTCMonth() + 1).padStart(2, "0");
  return `${d}/${m}/${valor.getUTCFullYear()}`;
}

/**
 * UNICO punto donde se arma el nombre de un mes: "jul 2026".
 *
 * Tablas, ejes, tooltips y los textos de `insights.ts` pasan por aqui. Antes
 * convivian "2026-03" en un hallazgo y "julio 2026" en otro; con un solo
 * constructor eso no puede volver a pasar. `indice` va de 0 a 11.
 */
function etiquetaMes(anio: number, indice: number): string | null {
  const nombre = MESES_CORTOS[indice];
  return nombre === undefined || !Number.isInteger(anio) ? null : `${nombre} ${anio}`;
}

/** "sep 2026" a partir de una fecha. Para ejes y encabezados, donde el dia sobra. */
export function fechaCorta(valor: Date | null): string {
  if (valor === null || Number.isNaN(valor.getTime())) return SIN_DATO;
  return etiquetaMes(valor.getUTCFullYear(), valor.getUTCMonth()) ?? SIN_DATO;
}

/**
 * Clave de mes del motor ("2026-01" o "sin-fecha") a etiqueta legible, con el
 * mismo formato que `fechaCorta`. El grupo sin fecha se nombra, nunca se deja
 * pasar como si fuera un mes. Una clave irreconocible se devuelve tal cual:
 * mejor ver el dato crudo que un mes inventado.
 */
export function mes(clave: string): string {
  if (clave === "sin-fecha") return "Sin fecha";
  const partes = /^(\d{4})-(\d{2})$/.exec(clave);
  if (partes === null) return clave;
  return etiquetaMes(Number(partes[1]), Number(partes[2]) - 1) ?? clave;
}

/** "204 días", con el singular resuelto. */
export function dias(cantidad: number | null): string {
  if (cantidad === null || !Number.isFinite(cantidad)) return SIN_DATO;
  const n = Math.trunc(cantidad);
  return `${n.toLocaleString(LOCALE)} ${Math.abs(n) === 1 ? "día" : "días"}`;
}

/** Entero simple: conteos de operaciones, clientes, unidades. */
export function entero(valor: number | null): string {
  if (valor === null || !Number.isFinite(valor)) return SIN_DATO;
  return Math.round(valor).toLocaleString(LOCALE);
}

/**
 * Envuelve cualquier valor que pueda faltar.
 * `nulo(cliente.nombre)` es preferible a `cliente.nombre || "-"`, que ademas
 * convierte la cadena vacia y el cero en el respaldo.
 */
export function nulo<T>(valor: T | null | undefined, respaldo: string = SIN_DATO): string {
  if (valor === null || valor === undefined) return respaldo;
  if (typeof valor === "string" && valor.trim() === "") return respaldo;
  if (typeof valor === "number" && !Number.isFinite(valor)) return respaldo;
  return String(valor);
}
