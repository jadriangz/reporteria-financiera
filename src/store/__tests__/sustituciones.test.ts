import { beforeEach, describe, expect, it } from "vitest";

import * as XLSX from "xlsx";

import { ENCABEZADOS } from "../../lib/exportar";
import { sustitucionesVigentes, useAppStore } from "../useAppStore";

/**
 * Un parametro que no se pudo leer, del archivo al aviso junto a la cifra.
 *
 * `validate()` entrega las sustituciones como datos, el store las guarda con el
 * dataset, y la interfaz pinta las vigentes. Cuando el usuario ajusta el
 * parametro, la decision es suya y el aviso sobra; volver a validar no lo revive.
 */
function archivo(parametros: readonly (readonly [string, string | number])[]): File {
  const libro = XLSX.utils.book_new();
  const venta: Record<string, string | number> = {
    folio: "V-1",
    fecha: "15/01/2026",
    linea: "Equipo",
    cliente: "Cliente A",
    modelo: "Modelo A",
    costo_unitario: 800,
    precio_venta: 1000,
  };
  const ventas = [[...ENCABEZADOS.ventas], ENCABEZADOS.ventas.map((c) => venta[c] ?? "")];
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(ventas), "ventas");
  const filas = [["parametro", "valor", "nota"], ...parametros.map(([clave, valor]) => [clave, valor, ""])];
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(filas), "parametros");
  return new File([XLSX.write(libro, { type: "array", bookType: "xlsx" }) as ArrayBuffer], "parametros.xlsx");
}

const vigentes = () => sustitucionesVigentes(useAppStore.getState()).map((s) => s.clave);

describe("parametros sustituidos, del archivo a la cifra", () => {
  beforeEach(async () => {
    useAppStore.getState().limpiar();
    await useAppStore
      .getState()
      .cargarArchivo(archivo([["provision_91_180", "cincuenta"], ["periodo_inicio", "2026-01-01"], ["provision_mas_180", "60%"]]));
  });

  it("el store guarda las sustituciones con el dataset, y aplica el valor por omision", () => {
    const s = useAppStore.getState();
    expect(s.sustituciones.map((x) => [x.clave, x.capturado])).toEqual([
      ["periodo_inicio", "2026-01-01"],
      ["provision_91_180", "cincuenta"],
    ]);
    expect(s.sustituciones.find((x) => x.clave === "provision_91_180")?.aplicado).toBe("25% (valor por omisión)");
    expect(s.parametros.provision91180).toBe(0.25);
    expect(s.parametros.provisionMas180).toBe(0.6);
    expect(vigentes()).toEqual(["periodo_inicio", "provision_91_180"]);
  });

  it("al ajustar la tasa desde la interfaz, su aviso desaparece y los demas siguen", () => {
    useAppStore.getState().actualizarParametro("provision91180", 0.3);
    expect(vigentes()).toEqual(["periodo_inicio"]);
  });

  it("mover la fecha de corte no resuelve ningun aviso: no es un parametro de la hoja", () => {
    useAppStore.getState().actualizarParametro("fechaCorte", new Date(Date.UTC(2026, 8, 9)));
    expect(vigentes()).toEqual(["periodo_inicio", "provision_91_180"]);
  });

  it("volver a validar, al capturar o borrar una fila, no revive un aviso ya resuelto", () => {
    useAppStore.getState().actualizarParametro("provision91180", 0.3);
    useAppStore.getState().borrarFila("ventas", "no-existe");
    expect(useAppStore.getState().sustituciones).toHaveLength(2);
    expect(vigentes()).toEqual(["periodo_inicio"]);
  });

  it("cargar otro archivo empieza sin ajustes", async () => {
    useAppStore.getState().actualizarParametro("provision91180", 0.3);
    await useAppStore.getState().cargarArchivo(archivo([["provision_91_180", "cincuenta"]]));
    expect(vigentes()).toEqual(["provision_91_180"]);
  });
});
