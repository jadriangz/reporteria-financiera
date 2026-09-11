/**
 * Carga bajo demanda del dibujo de las graficas (recharts), igual que
 * `cargarSheetJS` hace con el lector de Excel.
 *
 * La app arranca sin recharts: la pantalla de carga no tiene graficas, y el
 * primer modulo con una la trae. La vista imprimible espera esta misma promesa
 * antes de llamar a window.print(), para no imprimir el espacio reservado en
 * lugar de la grafica.
 *
 * Si la descarga falla se olvida la promesa, para que un intento posterior
 * vuelva a probar.
 */
let carga: Promise<typeof import("./GraficaLienzo")> | null = null;

export function cargarGraficas(): Promise<typeof import("./GraficaLienzo")> {
  carga ??= import("./GraficaLienzo").catch((error: unknown) => {
    carga = null;
    throw error;
  });
  return carga;
}
