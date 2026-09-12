import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PREFERENCIAS,
  claveDe,
  guardarPreferencia,
  leerPreferencia,
  olvidarPreferencia,
} from "../index";

/**
 * La excepción a la regla 1 de CLAUDE.md, con su cerca puesta.
 *
 * Estas pruebas no verifican que el tema se recuerde —eso es cosmético—: lo que
 * verifican es que la excepción NO SE PUEDA ENSANCHAR sin que alguien lo note.
 */

/** Un `localStorage` de mentira, porque las pruebas corren en node. */
function fingirAlmacenamiento(): Map<string, string> {
  const datos = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => {
      datos.set(k, v);
    },
    removeItem: (k: string) => {
      datos.delete(k);
    },
  });
  return datos;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("la lista blanca", () => {
  it("solo contiene preferencias de interfaz", () => {
    // Si esta lista crece, que crezca a propósito. Un dato financiero aquí
    // dentro convierte la excepción en la regla.
    expect(Object.keys(PREFERENCIAS)).toEqual(["tema"]);
  });

  it("cada preferencia declara sus valores y uno por omisión válido", () => {
    for (const [nombre, def] of Object.entries(PREFERENCIAS)) {
      expect(def.valores.length, nombre).toBeGreaterThan(1);
      expect(def.valores, nombre).toContain(def.porOmision);
    }
  });

  it("las claves llevan prefijo propio para no chocar con nada del origen", () => {
    expect(claveDe("tema")).toBe("rf.tema");
  });
});

describe("leer y guardar", () => {
  it("guarda y devuelve lo guardado", () => {
    const datos = fingirAlmacenamiento();
    guardarPreferencia("tema", "oscuro");
    expect(datos.get("rf.tema")).toBe("oscuro");
    expect(leerPreferencia("tema")).toBe("oscuro");
  });

  it("sin nada guardado devuelve el valor por omisión", () => {
    fingirAlmacenamiento();
    expect(leerPreferencia("tema")).toBe("sistema");
  });

  it("un valor corrupto se descarta en lugar de propagarse", () => {
    // Otra pestaña, una extensión o un usuario curioso pueden dejar cualquier
    // cosa ahí. Que no sea un valor de la lista es lo mismo que no tener nada.
    const datos = fingirAlmacenamiento();
    datos.set("rf.tema", "fucsia");
    expect(leerPreferencia("tema")).toBe("sistema");
  });

  it("olvidar devuelve al valor por omisión", () => {
    fingirAlmacenamiento();
    guardarPreferencia("tema", "claro");
    olvidarPreferencia("tema");
    expect(leerPreferencia("tema")).toBe("sistema");
  });

  it("sin localStorage no lanza: devuelve el valor por omisión", () => {
    // En node no existe el global; es el mismo caso que un render en servidor.
    expect(() => guardarPreferencia("tema", "oscuro")).not.toThrow();
    expect(leerPreferencia("tema")).toBe("sistema");
  });

  it("si el navegador lanza al leer o escribir, tampoco se cae la aplicación", () => {
    // Ventana privada con almacenamiento bloqueado: `getItem` lanza SecurityError.
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
      removeItem: () => {
        throw new Error("SecurityError");
      },
    });
    expect(leerPreferencia("tema")).toBe("sistema");
    expect(() => guardarPreferencia("tema", "oscuro")).not.toThrow();
    expect(() => olvidarPreferencia("tema")).not.toThrow();
  });
});

/**
 * La cerca de verdad.
 *
 * La lista blanca impide guardar una clave inventada, pero no impide que
 * alguien llame a `localStorage` directamente desde un componente y se salte el
 * módulo entero. Esta prueba recorre `src/` y exige que nadie más lo mencione:
 * es lo que convierte "está desaconsejado" en "no pasa de aquí".
 */
describe("ningún otro archivo toca el almacenamiento del navegador", () => {
  // Sin barra final y con barras normales: en Windows `fileURLToPath` devuelve
  // barras invertidas y el prefijo no coincidiría al recortar.
  const SRC = fileURLToPath(new URL("../../../", import.meta.url))
    .split("\\")
    .join("/")
    .replace(/\/$/, "");

  const PERMITIDOS = ["lib/preferencias/index.ts", "lib/preferencias/__tests__/preferencias.test.ts"];
  const PROHIBIDO = /\b(localStorage|sessionStorage|indexedDB)\b/;

  const relativa = (ruta: string): string => ruta.split("\\").join("/").slice(SRC.length + 1);

  /**
   * Se busca en el CÓDIGO, no en la prosa. Varios archivos nombran
   * `localStorage` en un comentario precisamente para explicar que no lo usan
   * —`useAppStore` recuerda la regla 1, `lib/tema` documenta dónde vive la
   * clave—, y prohibir la palabra en los comentarios castigaría justo a quien
   * se tomó la molestia de dejarlo escrito.
   */
  const sinComentarios = (fuente: string): string =>
    fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  function archivos(dir: string): string[] {
    return readdirSync(dir).flatMap((nombre) => {
      const ruta = `${dir}/${nombre}`;
      if (statSync(ruta).isDirectory()) return archivos(ruta);
      return /\.(ts|tsx)$/.test(nombre) ? [ruta] : [];
    });
  }

  it("solo src/lib/preferencias menciona localStorage", () => {
    const culpables = archivos(SRC)
      .filter((ruta) => !PERMITIDOS.includes(relativa(ruta)))
      .filter((ruta) => PROHIBIDO.test(sinComentarios(readFileSync(ruta, "utf8"))))
      .map(relativa);

    expect(culpables, "estos archivos se saltan src/lib/preferencias").toEqual([]);
  });

  it("y la prueba sabe mirar: se encuentra a sí misma y al módulo permitido", () => {
    // Sin esto, un error en el recorrido daría una lista vacía y la prueba
    // pasaría sin haber revisado nada.
    const todos = archivos(SRC).map(relativa);
    expect(todos).toContain("lib/preferencias/index.ts");
    expect(todos.length).toBeGreaterThan(40);
    for (const permitido of PERMITIDOS) {
      const fuente = sinComentarios(readFileSync(`${SRC}/${permitido}`, "utf8"));
      expect(PROHIBIDO.test(fuente), permitido).toBe(true);
    }
  });
});
