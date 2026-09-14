import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { activarFixtureDesarrollo } from "../fixtureDesarrollo";

/**
 * La cerca del cargador de fixture, al estilo de la que protege
 * `src/lib/preferencias`.
 *
 * `src/dev/fixtureDesarrollo.ts` carga el archivo de demostracion cuando la
 * URL trae `?fixture=demo`. Es comodidad para `/verificar`, y como toda
 * comodidad que toca la carga de datos, necesita una cerca. Estas pruebas NO
 * verifican que el fixture se cargue —eso lo ve `/verificar` en el navegador—:
 * verifican que la comodidad NO PUEDA ESCAPARSE a produccion ni convertirse en
 * un cargador de rutas arbitrarias sin que alguien lo note.
 *
 * Las tres invariantes, y por que cada una importa:
 *
 * 1. El modulo entra SOLO por `main.tsx` y SOLO dentro de
 *    `if (import.meta.env.DEV)`. Es lo que hace que Rollup elimine la rama en
 *    `build` y nunca emita el chunk: sin la guarda, el cargador se publica.
 * 2. La ruta del archivo viene SOLO del import estatico `?url`. Si alguna vez
 *    saliera de la query, `?fixture=` dejaria de ser una bandera y pasaria a
 *    ser "cargue lo que le diga", en una aplicacion cuyo argumento de venta es
 *    que los datos no salen del navegador.
 * 3. No hay `import()` dinamico dentro del modulo, por lo mismo.
 *
 * Lo que estas pruebas NO revisan, a proposito: que `dist/` no contenga el
 * .xlsx. Los dos archivos de `docs/` YA son assets de produccion legitimos
 * —`ZonaCarga` los ofrece como descarga, la plantilla para capturar y el demo
 * para probar la aplicacion—, asi que buscarlos en `dist/` daria un falso
 * positivo. Lo que no debe aparecer ahi es el CODIGO ni la BANDERA, y eso lo
 * comprueba `/verificar` sobre el build.
 */

// Sin barra final y con barras normales: en Windows `fileURLToPath` devuelve
// barras invertidas y el prefijo no coincidiria al recortar.
const SRC = fileURLToPath(new URL("../../", import.meta.url))
  .split("\\")
  .join("/")
  .replace(/\/$/, "");

const MODULO = "dev/fixtureDesarrollo.ts";

const relativa = (ruta: string): string => ruta.split("\\").join("/").slice(SRC.length + 1);

/** Igual que en la cerca de preferencias: se mira el codigo, no la prosa. */
const sinComentarios = (fuente: string): string =>
  fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = `${dir}/${nombre}`;
    if (statSync(ruta).isDirectory()) return archivos(ruta);
    return /\.(ts|tsx)$/.test(nombre) ? [ruta] : [];
  });
}

const codigoDe = (relativo: string): string =>
  sinComentarios(readFileSync(`${SRC}/${relativo}`, "utf8"));

const veces = (fuente: string, aguja: string): number => fuente.split(aguja).length - 1;

describe("el cargador de desarrollo solo entra por main.tsx y bajo la guarda", () => {
  it("ningun otro archivo lo importa", () => {
    const culpables = archivos(SRC)
      .map(relativa)
      .filter((r) => !r.startsWith("dev/") && r !== "main.tsx")
      .filter((r) => /dev\/fixtureDesarrollo/.test(codigoDe(r)));

    expect(culpables, "estos archivos importan el cargador de desarrollo").toEqual([]);
  });

  it("main.tsx lo importa dentro de `if (import.meta.env.DEV)`", () => {
    // La guarda es lo que borra el modulo del bundle de produccion. Sin ella
    // el cargador viaja al cliente, y con el la bandera que lo activa.
    const guardado =
      /if\s*\(\s*import\.meta\.env\.DEV\s*\)\s*\{[^}]*?import\(\s*["']\.\/dev\/fixtureDesarrollo/;

    expect(guardado.test(codigoDe("main.tsx"))).toBe(true);
  });

  it("y no lo importa en ningun otro lugar de main.tsx", () => {
    // Una segunda entrada fuera de la guarda anularia a la primera.
    expect(veces(codigoDe("main.tsx"), "dev/fixtureDesarrollo")).toBe(1);
  });
});

describe("la ruta del fixture no puede venir de la URL", () => {
  it("hay un solo import estatico `?url` y es el unico origen de la ruta", () => {
    const codigo = codigoDe(MODULO);
    const imports = [...codigo.matchAll(/import\s+(\w+)\s+from\s+"[^"]+\?url";/g)];

    expect(imports, "se espera exactamente un import `?url`").toHaveLength(1);

    const identificador = imports[0]?.[1];
    if (identificador === undefined) throw new Error("el import `?url` no declara identificador");

    // La clave de todo: el identificador aparece DOS veces y nada mas, el
    // import y el `fetch`. Si apareciera en una plantilla o en una
    // concatenacion, la ruta seria construida y no constante.
    expect(veces(codigo, identificador)).toBe(2);
    expect(codigo).toContain(`fetch(${identificador})`);
    expect(veces(codigo, "fetch("), "un solo fetch, y con la ruta constante").toBe(1);
  });

  it("no hay `import()` dinamico dentro del modulo", () => {
    expect(/import\s*\(/.test(codigoDe(MODULO))).toBe(false);
  });

  it("lo que viene de la query solo se compara contra un literal", () => {
    const codigo = codigoDe(MODULO);

    // Se lee una vez y no se guarda en ninguna variable: se compara y se
    // descarta. Asi no hay nada que pueda llegar despues a `fetch`.
    expect(veces(codigo, "URLSearchParams")).toBe(1);
    expect(codigo).toMatch(
      /new URLSearchParams\(\s*busqueda\s*\)\.get\(\s*PARAMETRO\s*\)\s*!==\s*VALOR/,
    );
  });
});

/**
 * Lo anterior demuestra que la ruta es constante leyendo el codigo. Esto lo
 * demuestra corriendolo: sea lo que sea que traiga la query, o no se pide nada,
 * o se pide EXACTAMENTE el fixture.
 */
describe("en ejecucion, la bandera no puede pedir otra cosa", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** Un `fetch` que registra a donde se le llamo y nunca entrega nada util. */
  function espiarFetch(): ReturnType<typeof vi.fn> {
    const espia = vi.fn(() => Promise.resolve({ ok: false, status: 418 }));
    vi.stubGlobal("fetch", espia);
    // El fallo se reporta por consola a proposito; aqui solo estorba.
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    return espia;
  }

  const NO_ACTIVAN = [
    "",
    "?fixture=",
    "?fixture=1",
    "?fixture=Demo",
    "?fixture=demo2",
    "?fixture=../CLAUDE.md",
    "?fixture=/etc/passwd",
    "?fixture=http://ajeno.example/x.xlsx",
    "?fixture=docs/Plantilla_Captura_Reporteria_v1.xlsx",
    "?archivo=docs/DEMO_Agrodrones_Bajio_FICTICIO.xlsx",
    "?fixture=demo&archivo=/etc/passwd",
  ];

  it.each(NO_ACTIVAN.filter((q) => !q.startsWith("?fixture=demo&")))(
    "no pide nada con %j",
    async (busqueda) => {
      const espia = espiarFetch();
      await activarFixtureDesarrollo(busqueda);
      expect(espia).not.toHaveBeenCalled();
    },
  );

  it("con la bandera exacta pide el fixture, y solo el fixture", async () => {
    const espia = espiarFetch();
    await activarFixtureDesarrollo("?fixture=demo");

    expect(espia).toHaveBeenCalledTimes(1);
    expect(espia).toHaveBeenCalledWith("/docs/DEMO_Agrodrones_Bajio_FICTICIO.xlsx");
  });

  it("un parametro de ruta colado junto a la bandera se ignora", async () => {
    // Lo importante no es que no active: es QUE PIDE cuando activa.
    const espia = espiarFetch();
    await activarFixtureDesarrollo("?fixture=demo&archivo=/etc/passwd");

    expect(espia).toHaveBeenCalledTimes(1);
    expect(espia).toHaveBeenCalledWith("/docs/DEMO_Agrodrones_Bajio_FICTICIO.xlsx");
  });

  it("si el servidor falla, no lanza y no deja la aplicacion a medias", async () => {
    espiarFetch();
    await expect(activarFixtureDesarrollo("?fixture=demo")).resolves.toBeUndefined();
  });
});

describe("y la prueba sabe mirar", () => {
  it("encuentra los archivos que dice revisar", () => {
    // Sin esto, un error en el recorrido daria listas vacias y las pruebas
    // pasarian sin haber revisado nada.
    const todos = archivos(SRC).map(relativa);

    expect(todos).toContain(MODULO);
    expect(todos).toContain("main.tsx");
    expect(todos.length).toBeGreaterThan(40);
  });

  it("el modulo sigue donde se espera y con la forma que se espera", () => {
    const codigo = codigoDe(MODULO);

    expect(codigo).toContain("export async function activarFixtureDesarrollo");
    expect(codigo).toContain("?url");
  });
});
