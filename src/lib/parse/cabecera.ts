import { CABECERA_VENTA, CAMPOS_CABECERA, type CampoCabecera, type LecturaCabecera } from "../schema";

import type { RawCelda, RawFila, RawHoja } from "./tipos";

/**
 * Resolucion de la cabecera de cada folio, antes de aplicar el esquema.
 *
 * Desde la v1.2.0 un folio agrupa partidas: varias filas de `ventas` con el
 * mismo folio son una sola operacion. `cliente`, `dias_credito`, `condicion` y
 * `vendedor` son de la operacion, y pueden venir escritos en una sola de sus
 * filas. Este paso agrupa las filas crudas por folio y le pone a cada una la
 * celda de cabecera que le toca.
 *
 * NO COERCIONA NADA. Que columnas son cabecera, como se lee cada una y como se
 * comparan dos valores lo declara `CABECERA_VENTA` en el esquema; aqui solo se
 * le pregunta al esquema si una celda trae algo, para decidir de que fila sale.
 * La celda elegida pasa despues por `VentaSchema`, como cualquier otra. Vive en
 * `parse/` y no en el motor por la restriccion de CLAUDE.md: un motor que leyera
 * una celda vacia como "heredar" estaria interpretando valores crudos.
 */

type Valores = Readonly<Record<string, RawCelda>>;

/** Una fila de ventas con su cabecera resuelta y, aparte, lo que se capturo en ella. */
export interface FilaResuelta {
  readonly fila: number;
  /** Lo que entra al esquema: las celdas de la fila, con la cabecera del folio. */
  readonly valores: Valores;
  /** Lo que el usuario escribio en ESTA fila, sin tocar. Para los avisos que citan lo capturado. */
  readonly capturados: Valores;
}

/** Dos partidas del mismo folio con un dato de cabecera distinto. */
export interface ConflictoCabecera {
  readonly folio: string;
  readonly campo: CampoCabecera;
  /** Cada fila que trae un valor, en orden. La primera es la que se aplica. */
  readonly capturas: readonly { readonly fila: number; readonly capturado: string }[];
}

export interface CabecerasResueltas {
  /** En el mismo orden que la hoja. */
  readonly filas: readonly FilaResuelta[];
  readonly conflictos: readonly ConflictoCabecera[];
  /** Folio -> numeros de fila, en orden. Solo folios no vacios. */
  readonly filasPorFolio: ReadonlyMap<string, readonly number[]>;
}

/** El folio tal como agrupa: sin espacios sobrantes, y exacto. Igual que `cobranza.folio_venta`. */
export function folioDe(valores: Valores): string {
  return String(valores["folio"] ?? "").trim();
}

function resolverGrupo(
  folio: string,
  grupo: readonly RawFila[],
  conflictos: ConflictoCabecera[],
): Map<CampoCabecera, RawCelda> {
  const cabecera = new Map<CampoCabecera, RawCelda>();
  for (const campo of CAMPOS_CABECERA) {
    const lectura: LecturaCabecera = CABECERA_VENTA[campo];
    const capturas: { fila: number; capturado: string; clave: string; celda: RawCelda }[] = [];
    for (const f of grupo) {
      const celda = f.valores[campo] ?? null;
      const leido = lectura.leer(celda);
      if (leido === null) continue;
      capturas.push({ fila: f.fila, capturado: String(celda).trim(), clave: lectura.clave(leido), celda });
    }
    const primera = capturas[0];
    if (primera === undefined) continue;
    cabecera.set(campo, primera.celda);
    if (capturas.some((c) => c.clave !== primera.clave)) {
      conflictos.push({
        folio,
        campo,
        capturas: capturas.map((c) => ({ fila: c.fila, capturado: c.capturado })),
      });
    }
  }
  return cabecera;
}

export function resolverCabeceras(hoja: RawHoja): CabecerasResueltas {
  const grupos = new Map<string, RawFila[]>();
  for (const f of hoja.filas) {
    const folio = folioDe(f.valores);
    if (folio === "") continue;
    const grupo = grupos.get(folio);
    if (grupo === undefined) grupos.set(folio, [f]);
    else grupo.push(f);
  }

  const conflictos: ConflictoCabecera[] = [];
  const cabeceras = new Map<string, Map<CampoCabecera, RawCelda>>();
  for (const [folio, grupo] of grupos) {
    // Un folio de una sola fila no tiene de quien heredar: se deja como vino.
    if (grupo.length > 1) cabeceras.set(folio, resolverGrupo(folio, grupo, conflictos));
  }

  const filas = hoja.filas.map((f): FilaResuelta => {
    const cabecera = cabeceras.get(folioDe(f.valores));
    if (cabecera === undefined) return { fila: f.fila, valores: f.valores, capturados: f.valores };
    const valores: Record<string, RawCelda> = { ...f.valores };
    for (const [campo, celda] of cabecera) valores[campo] = celda;
    return { fila: f.fila, valores, capturados: f.valores };
  });

  return {
    filas,
    conflictos,
    filasPorFolio: new Map([...grupos].map(([folio, grupo]) => [folio, grupo.map((f) => f.fila)])),
  };
}
