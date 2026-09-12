import { beforeEach, describe, expect, it } from "vitest";

import { ARCHIVO_FIXTURE, bufferFixture } from "../../lib/calc/__tests__/fixture";
import { entradasVacias } from "../../lib/captura";
import { useAppStore } from "../useAppStore";

/**
 * Recorrido de la captura manual en el store, en node. Las dos puertas de
 * entrada terminan en el mismo `dataset` que consume el motor.
 */
const archivoDemo = () => new File([bufferFixture()], ARCHIVO_FIXTURE);

const venta = (cambios: Record<string, string>) => ({
  ...entradasVacias("ventas"),
  folio: "V-1",
  fecha: "2026-03-10",
  cliente: "Cliente Uno",
  modelo: "T55",
  precio_venta: "289000",
  costo_unitario: "231200",
  ...cambios,
});

const s = () => useAppStore.getState();

describe("empezar sin archivo", () => {
  beforeEach(() => {
    s().limpiar();
    s().empezarSinArchivo();
  });

  it("deja la app lista, en la pantalla de captura y sin avisos de hojas faltantes", () => {
    expect(s().estado).toBe("listo");
    expect(s().pantalla).toBe("captura");
    expect(s().nombreArchivo).toBeNull();
    expect(s().hallazgos).toEqual([]);
    expect(s().dataset?.ventas).toEqual([]);
  });

  it("una venta capturada entra al dataset y habilita los modulos de venta", () => {
    s().guardarFila("ventas", venta({}), null);
    expect(s().dataset?.ventas).toHaveLength(1);
    expect(s().dataset?.ventas[0]?.precio_venta).toBe(28_900_000);
    expect(s().calculos?.capacidades.resumen).toBe(true);
    expect(s().calculos?.resultados.total.ventaTotal).toBe(28_900_000);
    // Sin abonos capturados, el motor no concluye nada de cartera: avisa.
    expect(s().calculos?.insights.map((i) => i.id)).toContain("cartera-no-disponible");
  });

  it("editar reemplaza la misma fila, sin crear otra ni cambiar su numero", () => {
    s().guardarFila("ventas", venta({}), null);
    const [captura] = s().capturas.ventas;
    s().guardarFila("ventas", venta({ precio_venta: "300000" }), captura?.id ?? null);
    expect(s().capturas.ventas).toHaveLength(1);
    expect(s().capturas.ventas[0]?.fila).toBe(captura?.fila);
    expect(s().dataset?.ventas[0]?.precio_venta).toBe(30_000_000);
  });

  it("borrar la quita del dataset y del reporte", () => {
    s().guardarFila("ventas", venta({}), null);
    s().borrarFila("ventas", s().capturas.ventas[0]?.id ?? "");
    expect(s().dataset?.ventas).toEqual([]);
    expect(s().calculos?.capacidades.resumen).toBe(false);
  });

  /**
   * El estado LIMPIO existe y se puede alcanzar.
   *
   * El panel de validacion muestra un mensaje en positivo cuando no hay una
   * sola incidencia. Si ese estado fuera inalcanzable, el mensaje seria codigo
   * muerto y nadie se enteraria: de ahi esta prueba.
   */
  it("un archivo capturado completo y sin incidencias deja el panel en limpio", () => {
    const completa = (folio: string, costo: string, precio: string, dia: string) =>
      venta({ folio, costo_unitario: costo, precio_venta: precio, fecha: `2026-03-${dia}`, dias_credito: "90", condicion: "Credito", comision_pct: "5", comision_base: "Venta" });

    // Margenes distintos a proposito: con uno solo, o con todos iguales, salta
    // la advertencia de "el costo parece derivado del precio".
    s().guardarFila("ventas", completa("V-1", "190000", "265000", "10"), null);
    s().guardarFila("ventas", completa("V-2", "295000", "385000", "11"), null);
    s().guardarFila("ventas", completa("V-3", "128000", "178000", "12"), null);

    expect(s().hallazgos).toEqual([]);
    expect(s().dataset?.ventas).toHaveLength(3);
  });

  it("un abono capturado a la venta capturada habilita cobranza", () => {
    s().guardarFila("ventas", venta({}), null);
    s().guardarFila(
      "cobranza",
      { ...entradasVacias("cobranza"), folio_venta: "V-1", fecha_pago: "2026-04-01", monto: "100000" },
      null,
    );
    expect(s().calculos?.capacidades.cobranza).toBe(true);
    expect(s().calculos?.capacidades.flujo).toBe(true);
    expect(s().calculos?.cartera.saldoTotal).toBe(18_900_000);
  });
});

describe("capturar sobre un archivo ya cargado", () => {
  beforeEach(async () => {
    s().limpiar();
    await s().cargarArchivo(archivoDemo());
  });

  it("agrega la fila al archivo, en la siguiente fila libre", () => {
    s().guardarFila("ventas", venta({ folio: "V-100" }), null);
    expect(s().dataset?.ventas).toHaveLength(26);
    // El archivo ocupa hasta la fila 27; la captura toma la 28.
    expect(s().capturas.ventas[0]?.fila).toBe(28);
    // Sus hallazgos se nombran con ese numero de fila, como los del archivo.
    expect(s().hallazgos.some((h) => h.hoja === "ventas" && h.fila === 28)).toBe(true);
  });

  it("un folio repetido contra el archivo queda como error, con el mensaje del panel de carga", () => {
    s().guardarFila("ventas", venta({ folio: "V-001" }), null);
    const error = s().hallazgos.find((h) => h.fila === 28 && h.campo === "folio");
    expect(error?.mensaje).toBe("El folio V-001 ya se uso en la fila 3.");
  });

  it("volver a cargar un archivo descarta las capturas: no se mezclan con otro origen", async () => {
    s().guardarFila("ventas", venta({ folio: "V-100" }), null);
    await s().cargarArchivo(archivoDemo());
    expect(s().capturas.ventas).toEqual([]);
    expect(s().dataset?.ventas).toHaveLength(25);
  });
});
