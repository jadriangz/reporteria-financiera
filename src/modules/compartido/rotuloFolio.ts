import type { SaldoPartida } from "../../lib/calc";

/**
 * Como se nombra un folio en un renglon.
 *
 * Un folio puede traer varias partidas —un equipo y sus accesorios— y una tabla
 * que lista folios solo tiene una celda para decir que se vendio. Se nombra con
 * su partida PRINCIPAL, la de mayor precio, y se DICE cuantas mas trae:
 * «AX-55 + 1 más». Un «AX-55» a secas en un folio de tres partidas afirmaria que
 * la venta fue solo eso.
 *
 * Una sola regla para Cobranza y Clientes. Es presentacion: elige que partida
 * nombrar, no suma ni recalcula nada. El desglose completo esta al expandir.
 */
export interface RotuloFolio {
  readonly linea: string | null;
  readonly modelo: string | null;
  /** Cuantas partidas trae el folio ademas de la principal. */
  readonly otras: number;
}

/** La partida de mayor precio. En un empate, la primera del archivo. */
export function partidaPrincipal(partidas: readonly SaldoPartida[]): SaldoPartida | undefined {
  let principal: SaldoPartida | undefined;
  for (const p of partidas) {
    if (principal === undefined || p.precioVenta > principal.precioVenta) principal = p;
  }
  return principal;
}

/**
 * «+ 1 más» va con espacios DUROS: el aviso de que hay mas partidas no se parte.
 * En el PDF, «AX-100 + 1 más» en una columna angosta salia como «AX-100 + 1» en
 * un renglon y «más» en el siguiente (observado el 2026-10-10). Si el rotulo no
 * cabe, se parte antes del signo, no dentro del aviso.
 */
export const sufijoOtras = (otras: number): string => (otras === 0 ? "" : ` +\u00a0${otras}\u00a0más`);

const conOtras = (texto: string, otras: number): string => `${texto}${sufijoOtras(otras)}`;

export function rotuloDeFolio(partidas: readonly SaldoPartida[]): RotuloFolio {
  const principal = partidaPrincipal(partidas);
  if (principal === undefined) return { linea: null, modelo: null, otras: 0 };
  const otras = partidas.length - 1;
  return {
    linea: conOtras(principal.linea, otras),
    modelo: conOtras(principal.modelo.trim(), otras),
    otras,
  };
}
