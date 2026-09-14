import { z } from "zod";

/**
 * Contrato de datos canónico.
 * Coincide campo por campo con la plantilla Excel entregada al cliente
 * (Plantilla_Captura_Reporteria_v1.xlsx). Cambiar un nombre aquí obliga a
 * cambiarlo en la plantilla. No hacerlo unilateralmente.
 */

// ─────────────────────────── Enumeraciones ───────────────────────────

export const LINEA = ["Equipo", "Accesorios", "Refacciones", "Servicio", "Capacitacion", "Demo"] as const;
export const CONDICION = ["Contado", "Credito", "Consignacion"] as const;
export const COMISION_BASE = ["Venta", "Utilidad", "No aplica"] as const;
export const CATEGORIA_GASTO = [
  "Nomina", "Renta", "Servicios", "Operativos", "Comercial", "Viaticos",
  "Logistica", "Importacion", "Financieros", "Impuestos", "Otros",
] as const;
export const TIPO_GASTO = ["Fijo", "Variable"] as const;
export const METODO_PAGO = ["Efectivo", "Transferencia", "Cheque", "Deposito", "Otro"] as const;
/** Moneda del reporte. v1 reporta solo en pesos: multimoneda esta fuera de alcance. */
export const MONEDA_BASE = ["MXN"] as const;

// ─────────────────────────── Coerciones ───────────────────────────

const BASURA = new Set(["", "-", "n/a", "na", "nd", "null", "undefined", "$-", "$ -"]);

/** Un importe escrito como texto: el punto agrupa de tres en tres y la coma es decimal. */
const IMPORTE_EUROPEO = /^-?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?$/;

/**
 * Importes en formato europeo: "$ 444.800,00" → 44480000 (centavos).
 * El punto es separador de miles y la coma es decimal.
 *
 * Devuelve null para celdas vacías, basura conocida y todo texto que no sea de ese
 * formato. "1,234.56", "1234.56" y "1.50" se leían en silencio como 1.23, 123 456
 * y 150 pesos. No se adivina el formato: se rechaza, y el validador lo dice.
 */
export function parseMonto(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? Math.round(raw * 100) : null;
  if (raw == null) return null;
  const s = String(raw).replace(/\s|\u00A0|\$/g, "");
  if (BASURA.has(s.toLowerCase())) return null;
  if (!IMPORTE_EUROPEO.test(s)) return null;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** Años que puede tener una fecha del contrato. Fuera de rango es un número en la celda equivocada. */
export const ANIO_MINIMO = 1990;
export const ANIO_MAXIMO = 2100;

function dentroDeRango(d: Date): Date | null {
  if (Number.isNaN(d.getTime())) return null;
  const anio = d.getUTCFullYear();
  return anio >= ANIO_MINIMO && anio <= ANIO_MAXIMO ? d : null;
}

/**
 * Fechas en dd/mm/aaaa. NUNCA usar new Date(string): interpreta mm/dd.
 *
 * Acepta también el serial numérico de Excel, sin la hora: una celda de fecha y
 * hora (45000.75) es el día 45000, no las 18:00 de ese día. Fuera de 1990–2100
 * devuelve null: un serial 45 sería el 13 de febrero de 1900.
 */
export function parseFecha(raw: unknown): Date | null {
  if (raw instanceof Date) return dentroDeRango(raw);
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return null;
    // Serial de Excel, base 1899-12-30
    return dentroDeRango(new Date(Date.UTC(1899, 11, 30) + Math.floor(raw) * 86_400_000));
  }
  if (raw == null) return null;
  const s = String(raw).trim();
  if (BASURA.has(s.toLowerCase())) return null;
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  // Inalcanzable: el regex de arriba garantiza los tres grupos. La guarda
  // existe solo para satisfacer noUncheckedIndexedAccess.
  if (d == null || mo == null || y == null) return null;
  const yy = y.length === 2 ? 2000 + Number(y) : Number(y);
  const dt = new Date(Date.UTC(yy, Number(mo) - 1, Number(d)));
  return dt.getUTCMonth() === Number(mo) - 1 ? dentroDeRango(dt) : null;
}

/**
 * Porcentajes: "20,00%" | "20%" | 0.2 | 20 → 0.20.
 *
 * Un número mayor que 1 se lee como por ciento ("30" es 30%, nunca 3000%); uno
 * entre 0 y 1, como fracción; con signo %, siempre por ciento. Fuera de 0–100%
 * devuelve null: "150" no es una comisión ni una provisión.
 */
export function parsePct(raw: unknown): number | null {
  if (raw == null) return null;
  let valor: number;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return null;
    valor = raw > 1 ? raw / 100 : raw;
  } else {
    const s = String(raw).trim();
    if (BASURA.has(s.toLowerCase())) return null;
    const n = Number(s.replace("%", "").replace(",", "."));
    if (!Number.isFinite(n)) return null;
    valor = s.includes("%") || n > 1 ? n / 100 : n;
  }
  return valor >= 0 && valor <= 1 ? valor : null;
}

/**
 * Booleano capturado como texto en la hoja `parametros`: "SI" | "NO".
 * Acepta variantes con acento y en inglés. Devuelve null si está vacío o si
 * el valor no es reconocible — null significa "el cliente no lo contestó".
 */
export function parseBool(raw: unknown): boolean | null {
  if (typeof raw === "boolean") return raw;
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (BASURA.has(s)) return null;
  if (["si", "sí", "s", "yes", "y", "true", "verdadero", "1"].includes(s)) return true;
  if (["no", "n", "false", "falso", "0"].includes(s)) return false;
  return null;
}

/**
 * Número plano de la hoja `parametros`: días y tipo de cambio. NO es dinero (no
 * va a centavos) y NO es porcentaje (no se divide entre 100): 17.5 se queda en
 * 17.5. Acepta coma decimal. Las tasas y provisiones son porcentajes: `parsePct`.
 */
export function parseNumero(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (raw == null) return null;
  const s = String(raw).replace(/\s|\u00A0/g, "");
  if (BASURA.has(s.toLowerCase())) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Días: entero no negativo. "30dias", "-5" o "30.5" devuelven null, nunca NaN. */
export function parseEnteroNoNegativo(raw: unknown): number | null {
  const n = parseNumero(raw);
  return n !== null && Number.isInteger(n) && n >= 0 ? n : null;
}

/** Número mayor que cero, como un tipo de cambio. */
export function parsePositivo(raw: unknown): number | null {
  const n = parseNumero(raw);
  return n !== null && n > 0 ? n : null;
}

/** Texto libre: sin espacios sobrantes, y null si queda vacío. */
export function parseTexto(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  return s === "" ? null : s;
}

/** Normaliza claves de agrupación: "  t70p " → "T70P" */
export const norm = (s: unknown): string => String(s ?? "").trim().replace(/\s+/g, " ").toUpperCase();

/** Rango de diacríticos combinantes que deja `normalize("NFD")`. */
const DIACRITICOS = new RegExp("[̀-ͯ]", "g");

/**
 * Grafía del contrato de un valor de enumeración escrito con otra capitalización,
 * con espacios de más o con acentos: " demo " → "Demo", "Crédito" → "Credito".
 * null si no corresponde a ninguna opción. Parte de `norm()`, la misma
 * normalización con la que agrupa el motor, y además ignora los acentos: las
 * opciones del contrato se escriben sin ellos y quien captura a mano los pone.
 */
export function canonizar<T extends string>(opciones: readonly T[], valor: unknown): T | null {
  const clave = (s: unknown): string => norm(s).normalize("NFD").replace(DIACRITICOS, "");
  const buscada = clave(valor);
  return opciones.find((o) => clave(o) === buscada) ?? null;
}

/** Base de comisión cuando `parametros` no la fija, o la fija con un valor que no es de la lista. */
export const COMISION_BASE_POR_OMISION = "Venta" satisfies (typeof COMISION_BASE)[number];

/**
 * Las columnas de lista de cada hoja, con lo que recibe su celda vacía.
 *
 * Un valor que tras `canonizar()` sigue sin ser de la lista recibe LO MISMO QUE LA
 * CELDA VACÍA, y la regla `enumeracion-no-reconocida` del validador lo avisa con
 * hoja, fila, lo capturado y lo aplicado. Así nunca llega al motor un valor fuera
 * de la lista, y nunca se sustituye uno sin aviso. Esquema y regla leen esta misma
 * declaración. Ver docs/decisiones.md (2026-09-13).
 */
export const ENUMERACIONES = {
  ventas: {
    linea:         { opciones: LINEA,           siVacia: "Equipo" },
    comision_base: { opciones: COMISION_BASE,   siVacia: null },
    condicion:     { opciones: CONDICION,       siVacia: null },
  },
  cobranza: {
    metodo:        { opciones: METODO_PAGO,     siVacia: null },
  },
  gastos: {
    categoria:     { opciones: CATEGORIA_GASTO, siVacia: null },
    tipo:          { opciones: TIPO_GASTO,      siVacia: null },
  },
} as const;

const zMonto  = z.unknown().transform(parseMonto);
const zFecha  = z.unknown().transform(parseFecha);
const zPct    = z.unknown().transform(parsePct);
const zTexto  = z.unknown().transform((v) => { const s = String(v ?? "").trim(); return s === "" ? null : s; });

/**
 * Columna de lista que puede quedar vacía. El tipo sigue siendo `string | null`:
 * el esquema garantiza el valor, y estrechar el tipo es otro cambio.
 */
const zLista = (e: { readonly opciones: readonly string[]; readonly siVacia: null }) =>
  z.unknown().transform((v): string | null => canonizar(e.opciones, v) ?? e.siVacia);

// ─────────────────────────── Esquemas de hoja ───────────────────────────

export const VentaSchema = z.object({
  folio:          z.unknown().transform((v) => String(v ?? "").trim()).pipe(z.string().min(1, "folio requerido")),
  fecha:          zFecha,
  // Grafia del contrato («demo» → "Demo"): el motor compara exacto. Canonizar no
  // excluye. Ver ENUMERACIONES y CLAUDE.md, «Restricciones aprendidas».
  linea:          z.unknown().transform((v): (typeof LINEA)[number] => canonizar(LINEA, v) ?? ENUMERACIONES.ventas.linea.siVacia),
  cliente:        zTexto.pipe(z.string({ message: "cliente requerido" })),
  modelo:         zTexto.pipe(z.string({ message: "modelo requerido" })),
  serie:          zTexto,
  costo_unitario: zMonto,
  precio_venta:   zMonto,
  comision_pct:   zPct,
  comision_base:  zLista(ENUMERACIONES.ventas.comision_base),
  // Entero no negativo o null, nunca NaN: con Number(), "30dias" llegaba al aging como NaN.
  dias_credito:   z.unknown().transform(parseEnteroNoNegativo),
  condicion:      zLista(ENUMERACIONES.ventas.condicion),
  vendedor:       zTexto,
  notas:          zTexto,
});

export const CobranzaSchema = z.object({
  folio_pago:  zTexto,
  folio_venta: z.unknown().transform((v) => String(v ?? "").trim()).pipe(z.string().min(1, "folio_venta requerido")),
  fecha_pago:  zFecha,
  monto:       zMonto,
  metodo:      zLista(ENUMERACIONES.cobranza.metodo),
  cliente_ref: zTexto,
  notas:       zTexto,
});

export const GastoSchema = z.object({
  folio_gasto:  zTexto,
  fecha:        zFecha,
  categoria:    zLista(ENUMERACIONES.gastos.categoria),
  subcategoria: zTexto,
  descripcion:  zTexto,
  monto:        zMonto,
  tipo:         zLista(ENUMERACIONES.gastos.tipo),
  proveedor:    zTexto,
  notas:        zTexto,
});

export const ParametrosSchema = z.object({
  /** Nombre del cliente o empresa tal como va en la portada del reporte. */
  nombre_cliente:        z.string().nullable().default(null),
  moneda_base:           z
    .preprocess((v) => canonizar(MONEDA_BASE, v) ?? v, z.enum(MONEDA_BASE))
    .default("MXN"),
  importes_incluyen_iva: z.boolean().nullable().default(null),
  tasa_iva:              z.number().default(0.16),
  periodo_inicio:        z.date().nullable().default(null),
  periodo_fin:           z.date().nullable().default(null),
  // Canonizado como las columnas de lista («utilidad» → "Utilidad"). Un valor que ni
  // asi es de la lista no llega aqui: validate() lo omite y la regla
  // `parametro-no-reconocido` avisa que se aplico el valor por omision.
  comision_base_default: z
    .preprocess((v) => canonizar(COMISION_BASE, v) ?? v, z.enum(COMISION_BASE))
    .default(COMISION_BASE_POR_OMISION),
  dias_credito_default:  z.number().nullable().default(null),
  provision_91_180:      z.number().default(0.25),
  provision_mas_180:     z.number().default(0.5),
  tipo_cambio_usd:       z.number().nullable().default(null),
});

// ─────────────────────────── Tipos ───────────────────────────

export type Venta      = z.infer<typeof VentaSchema>;
export type Cobranza   = z.infer<typeof CobranzaSchema>;
export type Gasto      = z.infer<typeof GastoSchema>;
export type Parametros = z.infer<typeof ParametrosSchema>;

export interface Dataset {
  ventas: Venta[];
  cobranza: Cobranza[];
  gastos: Gasto[];
  parametros: Parametros;
}

export type Severidad = "error" | "advertencia" | "info";

export interface Hallazgo {
  severidad: Severidad;
  hoja: keyof Omit<Dataset, "parametros"> | "parametros";
  fila?: number;
  campo?: string;
  mensaje: string;
  /** Qué debe hacer el usuario para corregirlo. Obligatorio en errores. */
  accion?: string;
}

/** Módulos que se habilitan según la completitud del dataset. */
export interface Capacidades {
  resumen: boolean;         // ventas
  estadoResultados: boolean;// ventas + gastos
  flujo: boolean;           // ventas + cobranza con fecha_pago
  cobranza: boolean;        // ventas + cobranza
  producto: boolean;        // ventas
  clientes: boolean;        // ventas
}

export function capacidades(d: Dataset): Capacidades {
  const hayVentas   = d.ventas.length > 0;
  const hayCobranza = d.cobranza.length > 0;
  const hayFechas   = d.cobranza.some((c) => c.fecha_pago != null);
  const hayGastos   = d.gastos.length > 0;
  return {
    resumen:          hayVentas,
    estadoResultados: hayVentas && hayGastos,
    flujo:            hayVentas && hayCobranza && hayFechas,
    cobranza:         hayVentas && hayCobranza,
    producto:         hayVentas,
    clientes:         hayVentas,
  };
}
