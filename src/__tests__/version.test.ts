import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ETIQUETA_VERSION, VERSION } from "../version";

/**
 * La version que se pinta en el pie de la pantalla y del PDF tiene que ser la
 * de `package.json`, siempre.
 *
 * Si se escribiera a mano en algun componente, tarde o temprano el PDF diria
 * una version y el repositorio otra, y el reporte dejaria de ser auditable
 * (GOBERNANZA.md, seccion 3). Esta prueba existe para que eso no pueda pasar
 * sin ponerse en rojo.
 */
const paquete = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../package.json", import.meta.url)), "utf8"),
) as { version: string };

describe("version de la aplicacion", () => {
  it("es exactamente la de package.json", () => {
    expect(VERSION).toBe(paquete.version);
  });

  it("hoy es la 1.1.4: parche que cierra la serie del contrato", () => {
    // PARCHE y no MAYOR (GOBERNANZA.md §3; docs/decisiones.md): el codigo deja
    // de contradecir lo que el contrato promete, sin cambiar ninguna definicion.
    // La 1.1.1 excluyo las filas «demo»; la 1.1.2 corrigio la base de comision y
    // los valores de lista; la 1.1.3 leyo la hoja parametros como capa; la 1.1.4
    // lleva las sustituciones hasta la cifra y el PDF, y valida el dominio de los
    // numeros y fechas de las hojas de datos. Todas mueven cifras de quien
    // escribio asi.
    expect(VERSION).toBe("1.1.4");
  });

  it("es un semver de tres numeros, sin sufijos", () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("la etiqueta de los pies de pagina lleva la v delante", () => {
    expect(ETIQUETA_VERSION).toBe(`v${paquete.version}`);
  });
});
