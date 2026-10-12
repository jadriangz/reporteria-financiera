import plantillaUrl from "../../../docs/Plantilla_Captura_Reporteria_v2.xlsx?url";

/**
 * Los dos efectos de la exportacion a Excel que solo existen en el navegador:
 * traer la plantilla que se rellena y entregar el archivo. Van aparte para que
 * `excelDeDataset` siga siendo una funcion pura, que las pruebas llaman con la
 * plantilla leida del disco.
 */

/**
 * La plantilla v2, la misma que `ZonaCarga` ofrece para descargar.
 *
 * Es un archivo estatico del mismo origen que la app, como el chunk de SheetJS:
 * la peticion no lleva ningun dato, y la ruta es un import fijo. El dataset se
 * escribe sobre estos bytes en memoria y de ahi no sale.
 */
export async function cargarPlantilla(): Promise<Uint8Array> {
  const respuesta = await fetch(plantillaUrl);
  if (!respuesta.ok) throw new Error(`No se pudo cargar la plantilla (${respuesta.status}).`);
  return new Uint8Array(await respuesta.arrayBuffer());
}

const TIPO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Entrega `datos` como descarga con ese nombre. */
export function descargarArchivo(datos: Uint8Array<ArrayBuffer>, nombre: string): void {
  const url = URL.createObjectURL(new Blob([datos], { type: TIPO_XLSX }));
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}
