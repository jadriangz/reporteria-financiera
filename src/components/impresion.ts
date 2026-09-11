import { fechaISO } from "../lib/format";
import type { Capacidades } from "../lib/schema";
import type { Periodo } from "../modules/resumen/selectores";
import {
  type IdModulo,
  MODULOS,
  MOTIVO_DESHABILITADO,
  type ModoImpresion,
} from "../store/useAppStore";

/**
 * Logica pura de la exportacion a PDF: que se imprime, en que orden y con que
 * nombre. Separada de la vista para probarla en node.
 */

/**
 * Orden del reporte completo. No es el de la navegacion: en papel, Cobranza va
 * antes que Ventas y flujo porque el saldo explica el flujo, no al reves.
 */
export const ORDEN_REPORTE: readonly IdModulo[] = [
  "resumen",
  "resultados",
  "cobranza",
  "flujo",
  "producto",
  "clientes",
];

export interface ModuloOmitido {
  readonly id: IdModulo;
  readonly titulo: string;
  /** Que falta capturar para habilitarlo, en palabras del usuario. */
  readonly motivo: string;
}

export interface PlanImpresion {
  readonly imprimir: readonly IdModulo[];
  /** Solo en el reporte completo: los que no se imprimen y por que. */
  readonly omitidos: readonly ModuloOmitido[];
}

export function tituloModulo(id: IdModulo): string {
  return MODULOS.find((m) => m.id === id)?.titulo ?? id;
}

/**
 * Que modulos van al papel.
 *
 * - Modulo actual: exactamente lo que se ve, aunque sea el aviso de un modulo
 *   deshabilitado: el usuario pidio imprimir esa pantalla.
 * - Reporte completo: los habilitados en `ORDEN_REPORTE`. Los deshabilitados
 *   no se imprimen como paginas vacias; se listan al final con lo que falta.
 */
export function planImpresion(
  modo: ModoImpresion,
  moduloActivo: IdModulo,
  capacidades: Capacidades,
): PlanImpresion {
  if (modo === "actual") return { imprimir: [moduloActivo], omitidos: [] };

  const requisito = (id: IdModulo) =>
    MODULOS.find((m) => m.id === id)?.requiere ?? "resumen";

  return {
    imprimir: ORDEN_REPORTE.filter((id) => capacidades[requisito(id)]),
    omitidos: ORDEN_REPORTE.filter((id) => !capacidades[requisito(id)]).map((id) => ({
      id,
      titulo: tituloModulo(id),
      motivo: MOTIVO_DESHABILITADO[requisito(id)],
    })),
  };
}

/**
 * Nombre que el navegador propondra al guardar: "Reporte_<periodo>_<corte>".
 *
 * Se asigna a `document.title` antes de imprimir; el dialogo de "Guardar como
 * PDF" lo toma de ahi y agrega ".pdf" por su cuenta, por eso no se incluye la
 * extension (algunos navegadores la duplicarian). Las fechas van en
 * aaaa-mm-dd para que los archivos de varios cortes se ordenen solos.
 */
export function nombreArchivoReporte(periodo: Periodo | null, corte: Date): string {
  const tramo =
    periodo === null ? "sin-periodo" : `${fechaISO(periodo.inicio)}-a-${fechaISO(periodo.fin)}`;
  return `Reporte_${tramo}_${fechaISO(corte)}`;
}
