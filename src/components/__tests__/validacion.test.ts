import { describe, expect, it } from "vitest";

import type { Hallazgo, Severidad } from "../../lib/schema";
import {
  ORDEN_SEVERIDAD,
  agruparPorSeveridad,
  conClave,
  partesConteo,
  resumirValidacion,
  textoConteo,
} from "../validacion";

/**
 * El panel de validación es lo primero que se ve al cargar un archivo. Estas
 * pruebas fijan las dos reglas que lo hacen útil en vez de ruidoso: el tono es
 * proporcional a lo peor que haya dentro, y con errores presentes no se puede
 * esconder.
 */

const h = (severidad: Severidad, mensaje = "algo"): Hallazgo => ({
  severidad,
  hoja: "ventas",
  mensaje,
});

describe("el conteo, que siempre está visible", () => {
  it("nombra cada grupo con su número, en orden de gravedad", () => {
    const hallazgos = [
      ...Array.from({ length: 3 }, () => h("error")),
      ...Array.from({ length: 19 }, () => h("advertencia")),
      ...Array.from({ length: 7 }, () => h("info")),
    ];
    expect(resumirValidacion(hallazgos, 137).textoConteo).toBe(
      "3 errores · 19 advertencias · 7 informativos",
    );
  });

  it("usa el singular cuando hay uno solo", () => {
    expect(textoConteo({ error: 1, advertencia: 1, info: 1 })).toBe(
      "1 error · 1 advertencia · 1 informativo",
    );
  });

  it("omite los grupos vacíos en vez de escribir «0 errores»", () => {
    expect(textoConteo({ error: 0, advertencia: 19, info: 7 })).toBe(
      "19 advertencias · 7 informativos",
    );
    expect(textoConteo({ error: 0, advertencia: 0, info: 0 })).toBe("");
  });

  it("las partes vienen separadas, para pintar cada una en su tono", () => {
    const partes = partesConteo({ error: 2, advertencia: 0, info: 5 });
    expect(partes).toEqual([
      { severidad: "error", texto: "2 errores" },
      { severidad: "info", texto: "5 informativos" },
    ]);
  });
});

describe("el semáforo del encabezado", () => {
  it("va en riesgo si hay un solo error, aunque haya cien advertencias", () => {
    const hallazgos = [h("error"), ...Array.from({ length: 100 }, () => h("advertencia"))];
    const r = resumirValidacion(hallazgos, 10);
    expect(r.severidadMaxima).toBe("error");
    expect(r.tono).toBe("riesgo");
  });

  it("va en advertencia si solo hay advertencias", () => {
    expect(resumirValidacion([h("advertencia"), h("info")], 10).tono).toBe("advertencia");
  });

  it("va en neutro si solo hay informativos", () => {
    // Un informativo no es un problema: «se ignoraron 274 filas vacías» no
    // merece el mismo ámbar que un abono que excede el precio de venta.
    expect(resumirValidacion([h("info")], 10).tono).toBe("neutro");
  });

  it("va en neutro si está limpio", () => {
    const r = resumirValidacion([], 10);
    expect(r.tono).toBe("neutro");
    expect(r.severidadMaxima).toBeNull();
    expect(r.total).toBe(0);
  });

  it("el tono no depende del orden en que lleguen los hallazgos", () => {
    const desordenado = [h("info"), h("advertencia"), h("error")];
    expect(resumirValidacion(desordenado, 10).tono).toBe("riesgo");
  });
});

describe("comprimir no es esconder", () => {
  it("SIN errores el panel se comprime del todo", () => {
    expect(resumirValidacion([h("advertencia"), h("info")], 10).comprimibleDelTodo).toBe(true);
    expect(resumirValidacion([], 10).comprimibleDelTodo).toBe(true);
  });

  it("CON errores no se comprime del todo, ni con uno solo", () => {
    // La regla se queda aunque complique la implementación: el propósito del
    // panel comprimido es bajar el ruido, no ocultar problemas.
    expect(resumirValidacion([h("error")], 10).comprimibleDelTodo).toBe(false);
    expect(resumirValidacion([h("error"), h("advertencia")], 10).comprimibleDelTodo).toBe(false);
  });

  it("el conteo de errores queda a la mano para la línea que sobrevive", () => {
    expect(resumirValidacion([h("error"), h("error")], 10).errores).toBe(2);
  });
});

describe("estado vacío y estado limpio son distintos", () => {
  it("sin filas leídas: no hay nada que validar todavía", () => {
    const r = resumirValidacion([], 0);
    expect(r.vacio).toBe(true);
    expect(r.total).toBe(0);
  });

  it("con filas leídas y sin incidencias: el archivo está bien, y eso se dice", () => {
    // Ausencia de dato no es dato en cero, y ausencia de hallazgos no es
    // ausencia de revisión: son dos mensajes distintos en la interfaz.
    const r = resumirValidacion([], 137);
    expect(r.vacio).toBe(false);
    expect(r.total).toBe(0);
  });
});

describe("agrupación", () => {
  it("ordena por gravedad y descarta los grupos vacíos", () => {
    const grupos = agruparPorSeveridad([h("info"), h("error"), h("info")]);
    expect(grupos.map((g) => g.severidad)).toEqual(["error", "info"]);
    expect(grupos[1]?.items).toHaveLength(2);
  });

  it("el orden de severidad es el de gravedad decreciente", () => {
    expect(ORDEN_SEVERIDAD).toEqual(["error", "advertencia", "info"]);
  });

  it("no pierde ni duplica hallazgos", () => {
    const hallazgos = [h("error"), h("advertencia"), h("info"), h("advertencia")];
    const total = agruparPorSeveridad(hallazgos).reduce((t, g) => t + g.items.length, 0);
    expect(total).toBe(hallazgos.length);
  });
});

describe("claves de lista", () => {
  it("dos hallazgos idénticos reciben claves distintas", () => {
    const claves = conClave([h("error", "igual"), h("error", "igual")]).map((x) => x.clave);
    expect(new Set(claves).size).toBe(2);
  });

  it("la clave sale del contenido, no de la posición", () => {
    const [a] = conClave([h("error", "uno"), h("error", "dos")]);
    const [b] = conClave([h("error", "uno")]);
    expect(a?.clave).toBe(b?.clave);
  });
});
