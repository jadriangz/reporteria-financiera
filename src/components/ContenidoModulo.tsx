import { ModuloClientes } from "../modules/clientes";
import { ModuloCobranza } from "../modules/cobranza";
import { ModuloEstadoResultados } from "../modules/estado-resultados";
import { ModuloProducto } from "../modules/producto";
import { ModuloResumen } from "../modules/resumen";
import { ModuloVentasFlujo } from "../modules/ventas-flujo";
import { type Calculos, type IdModulo, MODULOS, MOTIVO_DESHABILITADO } from "../store/useAppStore";
import { Deshabilitado } from "./ui/primitivas";

/**
 * Pinta un modulo, o el aviso de por que no puede calcularse.
 *
 * Un modulo deshabilitado no desaparece: explica que hoja falta. Es la regla de
 * degradacion elegante llevada hasta el contenido, no solo hasta la navegacion.
 *
 * Lo usan la pantalla y la vista imprimible, para que el papel muestre
 * exactamente lo mismo que la pantalla.
 */
export function ContenidoModulo({ id, calculos }: { id: IdModulo; calculos: Calculos }) {
  const definicion = MODULOS.find((m) => m.id === id);
  if (definicion === undefined) return null;

  if (!calculos.capacidades[definicion.requiere]) {
    return <Deshabilitado motivo={MOTIVO_DESHABILITADO[definicion.requiere]} />;
  }

  switch (id) {
    case "resumen":
      return <ModuloResumen calculos={calculos} />;
    case "resultados":
      return <ModuloEstadoResultados calculos={calculos} />;
    case "flujo":
      return <ModuloVentasFlujo calculos={calculos} />;
    case "cobranza":
      return <ModuloCobranza calculos={calculos} />;
    case "producto":
      return <ModuloProducto calculos={calculos} />;
    case "clientes":
      return <ModuloClientes calculos={calculos} />;
  }
}
