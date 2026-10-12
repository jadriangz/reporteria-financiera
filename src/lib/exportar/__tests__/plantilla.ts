import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import * as XLSX from "xlsx";

import { readWorkbookFromBuffer } from "../../parse/readWorkbook";
import { validate, type ResultadoValidacion } from "../../parse/validate";
import type { Dataset } from "../../schema";
import { excelDeDataset } from "../index";

/**
 * La plantilla real de `docs/`, que es sobre la que exporta la app: en el
 * navegador llega por `cargarPlantilla`, aqui se lee del disco.
 */
export const PLANTILLA = new Uint8Array(
  readFileSync(fileURLToPath(new URL("../../../../docs/Plantilla_Captura_Reporteria_v2.xlsx", import.meta.url))),
);

export const exportar = (dataset: Dataset): Uint8Array<ArrayBuffer> => excelDeDataset(XLSX, PLANTILLA, dataset);

/** Exportar y volver a leer con el MISMO lector que usa la app. */
export function idaYVuelta(dataset: Dataset): ResultadoValidacion {
  return validate(readWorkbookFromBuffer(exportar(dataset).buffer, "exportado.xlsx", XLSX));
}
