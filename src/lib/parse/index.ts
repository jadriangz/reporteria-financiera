export {
  type ModuloSheetJS,
  cargarSheetJS,
  readWorkbook,
  readWorkbookFromBuffer,
} from "./readWorkbook";
export { validate, resumenHallazgos, type ResultadoValidacion } from "./validate";
export { REGLAS, type Regla, type ContextoValidacion, type FilaEvaluada } from "./reglas";
export {
  HOJAS_TABULARES,
  type NombreHoja,
  type RawCelda,
  type RawFila,
  type RawHoja,
  type RawParametros,
  type RawSheets,
} from "./tipos";
