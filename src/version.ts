/**
 * Version de la aplicacion, la de `package.json`.
 *
 * Se muestra en el pie de la pantalla y en el pie de CADA hoja del PDF. Un
 * reporte sin version no es auditable: cuando una cifra cambia entre dos
 * reportes, la version es lo unico que dice con que codigo se genero cada uno
 * (GOBERNANZA.md, seccion 3).
 *
 * Una sola fuente de verdad: nunca se escribe el numero a mano en la UI.
 */
export const VERSION: string = __APP_VERSION__;

/** Como se lee en los pies de pagina: `v1.0.0`. */
export const ETIQUETA_VERSION = `v${VERSION}`;
