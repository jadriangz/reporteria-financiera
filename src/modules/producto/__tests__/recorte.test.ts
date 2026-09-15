import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

import { RECORTE_MODELOS, SERIES_PRODUCTO } from "../selectores";

/**
 * Producto USA el recorte de categorías, no solo existe la función.
 *
 * `recorteCategorias.test.ts` prueba que la función recorta bien. Eso no dice
 * nada de si el módulo se la pasa a su gráfica: sin la prop `recorte`, `Grafica`
 * no recorta nunca, y ninguna prueba de la función lo notaría. El 2026-09-14 se
 * sospechó que algo la había desactivado; no era así, y esta prueba es la que
 * permite afirmarlo sin revisar el código a mano la próxima vez.
 *
 * Se lee el JSX con el analizador de TypeScript, no con una expresión regular:
 * un comentario o un cambio de formato no la engañan.
 */

const RUTA = fileURLToPath(new URL("../index.tsx", import.meta.url));

function graficasDe(fuente: ts.SourceFile): ts.JsxSelfClosingElement[] {
  const encontradas: ts.JsxSelfClosingElement[] = [];
  const recorrer = (nodo: ts.Node): void => {
    if (ts.isJsxSelfClosingElement(nodo) && nodo.tagName.getText(fuente) === "Grafica") encontradas.push(nodo);
    ts.forEachChild(nodo, recorrer);
  };
  recorrer(fuente);
  return encontradas;
}

function atributo(elemento: ts.JsxSelfClosingElement, nombre: string): ts.JsxAttribute | undefined {
  return elemento.attributes.properties.find(
    (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText() === nombre,
  );
}

describe("el módulo Producto", () => {
  const fuente = ts.createSourceFile(
    "index.tsx",
    readFileSync(RUTA, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  it("le pasa el recorte de modelos a su gráfica de ingreso contra utilidad", () => {
    const graficas = graficasDe(fuente);
    const deModelos = graficas.filter((g) => atributo(g, "series")?.initializer?.getText(fuente) === "{SERIES_PRODUCTO}");
    expect(deModelos).toHaveLength(1);
    const grafica = deModelos[0];
    if (grafica === undefined) return;

    const recorte = atributo(grafica, "recorte")?.initializer;
    expect(recorte, "la gráfica de modelos no recibe la prop recorte").toBeDefined();
    if (recorte === undefined || !ts.isJsxExpression(recorte) || recorte.expression === undefined) return;

    const valor = recorte.expression;
    expect(ts.isObjectLiteralExpression(valor)).toBe(true);
    if (!ts.isObjectLiteralExpression(valor)) return;
    const esparce = valor.properties.some(
      (p) => ts.isSpreadAssignment(p) && p.expression.getText(fuente) === "RECORTE_MODELOS",
    );
    expect(esparce, "el recorte no parte de RECORTE_MODELOS").toBe(true);
  });

  it("y el recorte mide una serie que la gráfica sí dibuja", () => {
    // Si `por` apuntara a una serie inexistente, lo omitido pesaría 0% y la nota
    // afirmaría que lo que no se ve no importa.
    expect(SERIES_PRODUCTO.map((s) => s.clave)).toContain(RECORTE_MODELOS.por);
  });
});
