import { beforeAll, describe, expect, it } from "vitest";

import { ARCHIVO_FIXTURE, CORTE, ESPERADO, bufferFixture } from "../../lib/calc/__tests__/fixture";
import { useAppStore } from "../useAppStore";

/**
 * Recorrido del store con el archivo de demostracion, que es lo que la UI pinta.
 *
 * No es una prueba de componente y no necesita jsdom: ejercita el store en node,
 * igual que las demas. Cubre lo que el shell promete -- cargar, validar,
 * habilitar modulos, mover parametros y limpiar -- sin depender de como se vea.
 */
function archivoDemo(): File {
  return new File([bufferFixture()], ARCHIVO_FIXTURE);
}

describe("recorrido de la app", () => {
  beforeAll(async () => {
    useAppStore.getState().limpiar();
    await useAppStore.getState().cargarArchivo(archivoDemo());
    useAppStore.getState().actualizarParametro("fechaCorte", CORTE);
  });

  it("carga el archivo y deja el estado listo", () => {
    const s = useAppStore.getState();
    expect(s.estado).toBe("listo");
    expect(s.nombreArchivo).toBe(ARCHIVO_FIXTURE);
    expect(s.errorCarga).toBeNull();
    expect(s.calculos).not.toBeNull();
  });

  it("el panel de validacion muestra advertencias e info, sin un solo error", () => {
    const { hallazgos } = useAppStore.getState();
    const cuenta = (sev: string) => hallazgos.filter((h) => h.severidad === sev).length;
    expect(cuenta("error")).toBe(0);
    // 17 ventas sin dias_credito, 1 sin fecha y el sobrecobro de V-018.
    expect(cuenta("advertencia")).toBe(19);
    // 3 filas de ejemplo, 3 avisos de filas vacias y la fila Demo.
    expect(cuenta("info")).toBe(7);
    expect(hallazgos.some((h) => h.hoja === "cobranza" && h.mensaje.includes("V-018"))).toBe(true);
  });

  it("habilita los seis modulos: el archivo trae fecha en todos los abonos", () => {
    const c = useAppStore.getState().calculos;
    expect(c?.capacidades).toEqual({
      resumen: true,
      estadoResultados: true,
      flujo: true,
      cobranza: true,
      producto: true,
      clientes: true,
    });
  });

  it("los seis modulos tienen datos que volcar", () => {
    const c = useAppStore.getState().calculos;
    expect(c).not.toBeNull();
    if (c === null) return;

    expect(c.insights.map((i) => i.id)).toContain("cartera-mas-180");
    expect(c.resultados.total.ventaTotal).toBe(ESPERADO.ventaTotal);
    expect(c.resultados.total.utilidadBruta).toBe(ESPERADO.utilidadBruta);
    expect(c.cartera.saldoTotal).toBe(ESPERADO.saldo);
    expect(c.producto.porModelo.length).toBeGreaterThan(0);
    expect(c.producto.porLinea).toHaveLength(5);
    expect(c.clientes.totalClientes).toBe(11);
    expect(c.flujo.facturadoTotal).toBe(ESPERADO.ventaTotal);
  });

  it("cambiar la fecha de corte reclasifica los buckets sin alterar el saldo", () => {
    const antes = useAppStore.getState().calculos?.cartera.aging.porBucket;
    expect(antes?.["+180"]).toBe(ESPERADO.aging["+180"]);
    expect(antes?.["31-60"]).toBe(ESPERADO.aging["31-60"]);

    useAppStore.getState().actualizarParametro("fechaCorte", new Date(Date.UTC(2026, 5, 30)));
    const despues = useAppStore.getState().calculos?.cartera.aging.porBucket;

    // Al 30 de junio nada llega a 180 dias y la cartera vieja cae a 91-180.
    expect(despues?.["+180"]).toBe(0);
    expect(despues?.["91-180"]).toBe(67_000_000);
    expect(despues?.["0-30"]).toBe(128_580_000);

    // Mover el corte reclasifica la deuda; no la crea ni la borra.
    expect(useAppStore.getState().calculos?.cartera.saldoTotal).toBe(ESPERADO.saldo);

    useAppStore.getState().actualizarParametro("fechaCorte", CORTE);
  });

  it("cambiar la provision recalcula el motor", () => {
    // 91-180 al 25% mas +180 al 50%.
    expect(useAppStore.getState().calculos?.cartera.provision).toBe(36_450_000);

    useAppStore.getState().actualizarParametro("provisionMas180", 1);
    expect(useAppStore.getState().calculos?.cartera.provision).toBe(69_950_000);

    useAppStore.getState().actualizarParametro("provisionMas180", 0.5);
  });

  it("cambiar la base de comision por omision no toca las filas que traen la suya", () => {
    const base = useAppStore.getState().calculos?.resultados.total.comisionTotal;
    expect(base).toBe(ESPERADO.comision);

    // Este archivo captura comision_base en las 24 filas computables: ninguna
    // cae al valor por omision, asi que moverlo no puede cambiar el total.
    useAppStore.getState().actualizarParametro("comisionBaseDefault", "No aplica");
    expect(useAppStore.getState().calculos?.resultados.total.comisionTotal).toBe(base);

    useAppStore.getState().actualizarParametro("comisionBaseDefault", "Venta");
  });

  it("limpiar devuelve la app al estado vacio", () => {
    useAppStore.getState().limpiar();
    const s = useAppStore.getState();
    expect(s.estado).toBe("vacio");
    expect(s.dataset).toBeNull();
    expect(s.calculos).toBeNull();
    expect(s.nombreArchivo).toBeNull();
    expect(s.hallazgos).toEqual([]);
  });
});
