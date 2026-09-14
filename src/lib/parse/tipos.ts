/**
 * Tipos de la capa de lectura.
 *
 * `Raw*` es el archivo tal como venía: sin coercionar, sin validar y sin juzgar.
 * La única inteligencia que aplica el lector es estructural — qué hoja es cuál,
 * qué columnas ignorar, qué filas son relleno. Todo lo demás es del validador.
 */

/** Hojas tabulares. `parametros` es clave-valor y se modela aparte. */
export const HOJAS_TABULARES = ["ventas", "cobranza", "gastos"] as const;

export type NombreHoja = (typeof HOJAS_TABULARES)[number];

/**
 * Columnas de importe por hoja. Las usan el validador (para detectar importes
 * ilegibles) y el lector (para reconocer una fila de notas: sin folio y sin
 * ningun importe no es un registro, es un texto que alguien dejo en la hoja).
 */
export const COLUMNAS_MONTO: Readonly<Record<NombreHoja, readonly string[]>> = {
  ventas: ["costo_unitario", "precio_venta"],
  cobranza: ["monto"],
  gastos: ["monto"],
};

/** Lo que puede salir de una celda de Excel o CSV antes de coercionar. */
export type RawCelda = string | number | boolean | Date | null;

/**
 * Una fila cruda junto con su número REAL de fila en el archivo (base 1, tal
 * como lo muestra Excel). Ese número es lo que permite decirle al cliente
 * "corrige la fila 14" en vez de "hay un error en algún lado".
 */
export interface RawFila {
  readonly fila: number;
  readonly valores: Readonly<Record<string, RawCelda>>;
}

export interface RawHoja {
  readonly nombre: NombreHoja;
  /** false si la hoja no venía en el archivo. No es un error: lo evalúa el validador. */
  readonly presente: boolean;
  readonly encabezados: readonly string[];
  readonly filas: readonly RawFila[];
  /** Filas descartadas por estar completamente vacías. Se reportan como info. */
  readonly filasVacias: number;
  /** Filas de ejemplo de la plantilla (folio V-000 / P-000 / G-000) descartadas. */
  readonly filasEjemplo: number;
  /**
   * Numeros de fila descartados por ser notas: sin folio y sin ningun importe,
   * como el renglon "FALTA CAPTURAR: ..." al pie de la hoja gastos. No son
   * registros y no se cuentan; se informan para que nadie se pregunte a donde
   * se fueron.
   */
  readonly filasNota: readonly number[];
  /** Columnas calculadas por fórmula de Excel que el lector ignoró a propósito. */
  readonly columnasIgnoradas: readonly string[];
}

/** La hoja `parametros` es clave-valor: parametro | valor | nota. */
export interface RawParametros {
  readonly presente: boolean;
  readonly valores: Readonly<Record<string, RawCelda>>;
  /** Número de fila real de cada parámetro, para poder señalarlo. */
  readonly filaDe: Readonly<Record<string, number>>;
  /** Filas de cada clave escrita más de una vez. Gana la última; la regla `parametro-repetido` lo avisa. */
  readonly filasRepetidas: Readonly<Record<string, readonly number[]>>;
  /** Filas con un valor pero sin nombre de parámetro: el valor no se aplica, y se avisa. */
  readonly filasSinClave: readonly number[];
}

export interface RawSheets {
  /** Nombre del archivo de origen, para los mensajes de validación. */
  readonly origen: string;
  readonly ventas: RawHoja;
  readonly cobranza: RawHoja;
  readonly gastos: RawHoja;
  readonly parametros: RawParametros;
}
