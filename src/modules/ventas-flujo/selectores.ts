import type { PuntoTemporal, SerieGrafica } from "../../components/ui/datosGrafica";
import type { Tono } from "../../components/ui/primitivas";
import { type Centavos, type ClaveMes, type Flujo, SIN_FECHA, divSegura } from "../../lib/calc";
import { ejeContinuo, fechaDeMes } from "../compartido/ejeMensual";

/**
 * Logica de PRESENTACION de Ventas y flujo.
 *
 * El motor (`flujo.ts`) ya separo los dos calendarios: lo facturado por fecha
 * de venta y lo cobrado por fecha de pago real. Aqui solo se acomoda eso en
 * renglones, puntos de grafica y acumulados. Todo es puro y se prueba en node.
 */

// --------------------------- Indicadores ---------------------------

export interface IndicadoresFlujo {
  readonly facturado: Centavos;
  readonly cobrado: Centavos;
  /** facturado - cobrado. Coincide con el saldo de cartera del motor. */
  readonly saldo: Centavos;
  /** cobrado / facturado. null si no se facturo nada. */
  readonly conversion: number | null;
}

export function indicadoresFlujo(flujo: Flujo): IndicadoresFlujo {
  return {
    facturado: flujo.facturadoTotal,
    cobrado: flujo.cobradoTotal,
    saldo: flujo.facturadoTotal - flujo.cobradoTotal,
    conversion: divSegura(flujo.cobradoTotal, flujo.facturadoTotal),
  };
}

/**
 * Bajo este umbral, la conversion a efectivo se marca en riesgo. Es el espejo
 * del umbral de Cobranza: convertir menos del 70% es dejar mas del 30% de la
 * venta en la calle.
 */
export const UMBRAL_CONVERSION = 0.7;

export function tonoConversion(conversion: number | null): Tono {
  if (conversion === null) return "neutro";
  return conversion < UMBRAL_CONVERSION ? "riesgo" : "positivo";
}

// --------------------------- Tabla mensual ---------------------------

export interface FilaMesFlujo {
  /** Clave del motor, o "total" para la fila de pie. */
  readonly clave: ClaveMes | "total";
  readonly operaciones: number;
  readonly facturado: Centavos;
  readonly cobrado: Centavos;
  /**
   * facturado - cobrado del renglon. Negativo cuando en ese mes entro mas de lo
   * que se facturo: se cobro deuda de meses anteriores.
   */
  readonly saldoGenerado: Centavos;
  /** cobrado / facturado. Puede pasar de 100%, y es null sin facturacion. */
  readonly pctCobrado: number | null;
  readonly tono: Tono;
}

/**
 * Un renglon por mes del eje continuo, con el grupo sin fecha al final.
 *
 * El grupo sin fecha junta dos cosas distintas que el motor tampoco puede
 * ubicar: ventas sin fecha de venta y abonos sin fecha de pago. Se muestra en
 * ambar para que no se lea como un mes mas.
 */
export function filasMensualesFlujo(flujo: Flujo): readonly FilaMesFlujo[] {
  const porClave = new Map(flujo.meses.map((m) => [m.mes, m]));

  return ejeContinuo(flujo.meses.map((m) => m.mes)).map((clave): FilaMesFlujo => {
    const m = porClave.get(clave);
    const facturado = m?.facturado ?? 0;
    const cobrado = m?.cobrado ?? 0;
    const vacio = facturado === 0 && cobrado === 0;
    return {
      clave,
      operaciones: m?.operaciones ?? 0,
      facturado,
      cobrado,
      saldoGenerado: facturado - cobrado,
      pctCobrado: divSegura(cobrado, facturado),
      tono: clave === SIN_FECHA ? "advertencia" : vacio ? "tenue" : "neutro",
    };
  });
}

/** Fila de totales: los importes del motor, las operaciones contadas por mes. */
export function totalFlujo(flujo: Flujo): FilaMesFlujo {
  let operaciones = 0;
  for (const m of flujo.meses) operaciones += m.operaciones;
  const { facturado, cobrado, saldo, conversion } = indicadoresFlujo(flujo);
  return {
    clave: "total",
    operaciones,
    facturado,
    cobrado,
    saldoGenerado: saldo,
    pctCobrado: conversion,
    tono: "neutro",
  };
}

// --------------------------- Graficas ---------------------------

export const SERIES_MENSUALES: readonly SerieGrafica[] = [
  { clave: "facturado", etiqueta: "Facturado (por fecha de venta)", color: "marino" },
  { clave: "cobrado", etiqueta: "Cobrado (por fecha de pago)", color: "positivo" },
];

export const SERIES_ACUMULADAS: readonly SerieGrafica[] = [
  { clave: "facturado", etiqueta: "Facturado acumulado", color: "marino" },
  { clave: "cobrado", etiqueta: "Cobrado acumulado", color: "positivo" },
];

/** Importes que no caben en un eje de tiempo porque les falta la fecha. */
export interface FueraDelEje {
  readonly facturado: Centavos;
  readonly cobrado: Centavos;
  readonly operaciones: number;
}

export interface SerieTemporal {
  readonly puntos: readonly PuntoTemporal[];
  /**
   * Lo que no pudo dibujarse, o null si todo tiene fecha. La grafica no lo
   * muestra, asi que el modulo esta obligado a decirlo en texto.
   */
  readonly fueraDelEje: FueraDelEje | null;
}

function fueraDelEje(flujo: Flujo): FueraDelEje | null {
  const grupo = flujo.meses.find((m) => m.mes === SIN_FECHA);
  if (grupo === undefined || (grupo.facturado === 0 && grupo.cobrado === 0)) return null;
  return { facturado: grupo.facturado, cobrado: grupo.cobrado, operaciones: grupo.operaciones };
}

/** Renglones fechados del eje, en orden, con su fecha ya resuelta. */
function fechados(flujo: Flujo): { fecha: Date; facturado: Centavos; cobrado: Centavos }[] {
  return filasMensualesFlujo(flujo).flatMap((f) => {
    const fecha = f.clave === "total" ? null : fechaDeMes(f.clave);
    return fecha === null ? [] : [{ fecha, facturado: f.facturado, cobrado: f.cobrado }];
  });
}

/**
 * Facturado contra cobrado, mes por mes. Los meses sin actividad van en cero:
 * si se omitieran, las barras de junio quedarian junto a las de julio y el
 * hueco de estacionalidad desapareceria.
 */
export function puntosMensuales(flujo: Flujo): SerieTemporal {
  return {
    puntos: fechados(flujo).map((f) => ({
      fecha: f.fecha,
      valores: { facturado: f.facturado, cobrado: f.cobrado },
    })),
    fueraDelEje: fueraDelEje(flujo),
  };
}

/**
 * Facturado y cobrado acumulados al cierre de cada mes. La distancia vertical
 * entre las dos lineas es el saldo que se va quedando en la calle.
 *
 * Solo acumula lo fechado: lo que no tiene fecha no puede sumarse en ningun
 * punto de la linea sin inventarle un mes, y se reporta aparte.
 */
export function puntosAcumulados(flujo: Flujo): SerieTemporal {
  let facturado = 0;
  let cobrado = 0;
  return {
    puntos: fechados(flujo).map((f) => {
      facturado += f.facturado;
      cobrado += f.cobrado;
      return { fecha: f.fecha, valores: { facturado, cobrado } };
    }),
    fueraDelEje: fueraDelEje(flujo),
  };
}

/** Brecha al ultimo punto de la linea acumulada. null si no hay puntos. */
export function brechaFinal(serie: SerieTemporal): Centavos | null {
  const ultimo = serie.puntos[serie.puntos.length - 1];
  if (ultimo === undefined) return null;
  const f = ultimo.valores["facturado"] ?? null;
  const c = ultimo.valores["cobrado"] ?? null;
  return f === null || c === null ? null : f - c;
}
