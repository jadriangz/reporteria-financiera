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

// ─────────────────────────── Coerciones ───────────────────────────

const BASURA = new Set(["", "-", "n/a", "na", "nd", "null", "undefined", "$-", "$ -"]);

/**
 * Importes en formato europeo: "$ 444.800,00" → 44480000 (centavos).
 * El punto es separador de miles y la coma es decimal.
 * Devuelve null para celdas vacías o basura conocida.
 */
export function parseMonto(raw: unknown): number | null {
  if (typeof raw === "number") return Math.round(raw * 100);
  if (raw == null) return null;
  const s = String(raw).replace(/\s|\u00A0|\$/g, "");
  if (BASURA.has(s.toLowerCase())) return null;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/**
 * Fechas en dd/mm/aaaa. NUNCA usar new Date(string): interpreta mm/dd.
 * Acepta también el serial numérico de Excel.
 */
export function parseFecha(raw: unknown): Date | null {
  if (raw instanceof Date) return raw;
  if (typeof raw === "number") {
    // Serial de Excel, base 1899-12-30
    return new Date(Date.UTC(1899, 11, 30) + raw * 86_400_000);
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
  return dt.getUTCMonth() === Number(mo) - 1 ? dt : null;
}

/** Porcentajes: "20,00%" | "20%" | 0.2 | 20 → 0.20 */
export function parsePct(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return raw > 1 ? raw / 100 : raw;
  const s = String(raw).trim();
  if (BASURA.has(s.toLowerCase())) return null;
  const n = Number(s.replace("%", "").replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return s.includes("%") || n > 1 ? n / 100 : n;
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
 * Número plano de la hoja `parametros`: tasas, provisiones, días y tipo de
 * cambio. NO es dinero (no va a centavos) y NO es porcentaje (no se divide
 * entre 100): 17.5 se queda en 17.5. Acepta coma decimal.
 */
export function parseNumero(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (raw == null) return null;
  const s = String(raw).replace(/\s|\u00A0/g, "");
  if (BASURA.has(s.toLowerCase())) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Normaliza claves de agrupación: "  t70p " → "T70P" */
export const norm = (s: unknown): string => String(s ?? "").trim().replace(/\s+/g, " ").toUpperCase();

const zMonto  = z.unknown().transform(parseMonto);
const zFecha  = z.unknown().transform(parseFecha);
const zPct    = z.unknown().transform(parsePct);
const zTexto  = z.unknown().transform((v) => { const s = String(v ?? "").trim(); return s === "" ? null : s; });

// ─────────────────────────── Esquemas de hoja ───────────────────────────

export const VentaSchema = z.object({
  folio:          z.unknown().transform((v) => String(v ?? "").trim()).pipe(z.string().min(1, "folio requerido")),
  fecha:          zFecha,
  linea:          zTexto.transform((v) => (v ?? "Equipo") as (typeof LINEA)[number]),
  cliente:        zTexto.pipe(z.string({ message: "cliente requerido" })),
  modelo:         zTexto.pipe(z.string({ message: "modelo requerido" })),
  serie:          zTexto,
  costo_unitario: zMonto,
  precio_venta:   zMonto,
  comision_pct:   zPct,
  comision_base:  zTexto,
  dias_credito:   z.unknown().transform((v) => (v == null || v === "" ? null : Number(v))),
  condicion:      zTexto,
  vendedor:       zTexto,
  notas:          zTexto,
});

export const CobranzaSchema = z.object({
  folio_pago:  zTexto,
  folio_venta: z.unknown().transform((v) => String(v ?? "").trim()).pipe(z.string().min(1, "folio_venta requerido")),
  fecha_pago:  zFecha,
  monto:       zMonto,
  metodo:      zTexto,
  cliente_ref: zTexto,
  notas:       zTexto,
});

export const GastoSchema = z.object({
  folio_gasto:  zTexto,
  fecha:        zFecha,
  categoria:    zTexto,
  subcategoria: zTexto,
  descripcion:  zTexto,
  monto:        zMonto,
  tipo:         zTexto,
  proveedor:    zTexto,
  notas:        zTexto,
});

export const ParametrosSchema = z.object({
  /** Nombre del cliente o empresa tal como va en la portada del reporte. */
  nombre_cliente:        z.string().nullable().default(null),
  moneda_base:           z.string().default("MXN"),
  importes_incluyen_iva: z.boolean().nullable().default(null),
  tasa_iva:              z.number().default(0.16),
  periodo_inicio:        z.date().nullable().default(null),
  periodo_fin:           z.date().nullable().default(null),
  comision_base_default: z.enum(COMISION_BASE).default("Venta"),
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
