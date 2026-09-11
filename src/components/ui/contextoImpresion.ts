import { createContext, useContext } from "react";

/**
 * ¿Se esta renderizando la vista imprimible?
 *
 * Algunas cosas no se pueden resolver solo con `@media print` porque dependen
 * de como se construye el componente, no de como se ve:
 *
 * - La grafica: el contenedor responsivo de recharts mide su caja, y en la vista
 *   de impresion (oculta en pantalla) mide cero. Imprimiendo, se dibuja con un
 *   ancho fijo en pixeles.
 * - Las filas desplegables: en papel no hay clic, asi que se imprimen abiertas.
 * - Los encabezados ordenables: se imprimen como texto, sin boton ni flechas.
 *
 * Vive en un `.ts` aparte para que los archivos de componente exporten solo
 * componentes.
 */
export const ContextoImpresion = createContext(false);

export function useImprimiendo(): boolean {
  return useContext(ContextoImpresion);
}
