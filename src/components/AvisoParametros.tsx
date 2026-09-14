import { textoSustitucion } from "../lib/parse/parametros";
import type { Parametros } from "../lib/schema";
import { sustitucionesVigentes, useAppStore } from "../store/useAppStore";

/** Los parametros, agrupados por la cifra que mueven. Los que no mueven ninguna solo avisan en el panel. */
export const PARAMETROS_DE = {
  provision: ["provision_91_180", "provision_mas_180"],
  periodo: ["periodo_inicio", "periodo_fin"],
  iva: ["importes_incluyen_iva", "tasa_iva"],
  comision: ["comision_base_default"],
} as const satisfies Readonly<Record<string, readonly (keyof Parametros)[]>>;

/**
 * Aviso de un parametro que no se pudo leer, junto a la cifra que afecta.
 *
 * El panel de validacion ya lo dice, pero no esta a la vista cuando se lee la
 * cifra, y no viaja con el PDF. Este aviso si: se pinta donde se usa el
 * parametro y se imprime con el modulo. Lee las sustituciones que `validate()`
 * entrega como datos y no calcula nada. Desaparece cuando el usuario ajusta el
 * parametro desde la interfaz (`sustitucionesVigentes`).
 *
 * Es un `span` y no un `div`: tiene que poder vivir dentro de un parrafo, de una
 * celda de definicion o de un Callout.
 */
export function AvisoParametros({ claves, efecto }: { claves: readonly (keyof Parametros)[]; efecto?: string }) {
  const sustituciones = useAppStore((s) => s.sustituciones);
  const ajustados = useAppStore((s) => s.ajustados);
  const visibles = sustitucionesVigentes({ sustituciones, ajustados }).filter((s) => claves.includes(s.clave));
  if (visibles.length === 0) return null;

  return (
    <span
      role="note"
      className="mt-1 block border-l-2 border-advertencia pl-2 text-[11px] leading-snug text-advertencia"
    >
      {visibles.map((s) => (
        <span key={s.clave} className="block">
          {textoSustitucion(s)}
        </span>
      ))}
      {efecto !== undefined && <span className="block">{efecto}</span>}
    </span>
  );
}
