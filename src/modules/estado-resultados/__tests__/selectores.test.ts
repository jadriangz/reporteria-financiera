import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { SIN_FECHA, calcularResultados } from "../../../lib/calc";
import { ESPERADO, bufferFixture, cargarFixture } from "../../../lib/calc/__tests__/fixture";
import { type Dataset, type Gasto, ParametrosSchema, type Venta } from "../../../lib/schema";
import {
  CONCEPTOS,
  SIN_CATEGORIA,
  SIN_SUBCATEGORIA,
  cascadaMensual,
  construirCascada,
  desgloseGastos,
  filaTotalGastos,
  filasGastos,
  leerEquilibrio,
  tipoDeGasto,
} from "../selectores";

function venta(p: Partial<Venta> & Pick<Venta, "folio">): Venta {
  return {
    fecha: new Date(Date.UTC(2026, 0, 15)),
    linea: "Equipo",
    cliente: "Cliente Uno",
    modelo: "T70P",
    serie: null,
    costo_unitario: 40_000_000,
    precio_venta: 50_000_000,
    comision_pct: null,
    comision_base: null,
    dias_credito: null,
    condicion: "Credito",
    vendedor: null,
    notas: null,
    ...p,
  };
}

function gasto(p: Partial<Gasto> = {}): Gasto {
  return {
    folio_gasto: "G-1",
    fecha: new Date(Date.UTC(2026, 0, 31)),
    categoria: "Renta",
    subcategoria: "Oficina",
    descripcion: null,
    monto: 1_000_000,
    tipo: "Fijo",
    proveedor: null,
    notas: null,
    ...p,
  };
}

function dataset(p: Partial<Dataset> = {}): Dataset {
  return {
    ventas: [],
    cobranza: [],
    gastos: [],
    parametros: ParametrosSchema.parse({}),
    ...p,
  };
}

const fixture = cargarFixture();
const resultadosFixture = calcularResultados(fixture);

const importeDe = (filas: ReturnType<typeof construirCascada>, clave: string) =>
  filas.find((f) => f.clave === clave)?.importe;

describe("cascada del periodo", () => {
  const filas = construirCascada(resultadosFixture.total);

  it("sigue el orden de lectura venta, costo, bruta, comision, contribucion, gastos, resultado", () => {
    expect(filas.map((f) => f.concepto)).toEqual([
      "Ingresos",
      "(–) Costo de venta",
      "= Utilidad bruta",
      "(–) Comisiones",
      "= Utilidad de contribución",
      "(–) Gastos operativos",
      "= Resultado",
    ]);
  });

  it("reproduce las cifras de CLAUDE.md, con las deducciones en negativo", () => {
    expect(importeDe(filas, "ingresos")).toBe(ESPERADO.ventaTotal);
    expect(importeDe(filas, "costo")).toBe(-ESPERADO.costoTotal);
    expect(importeDe(filas, "bruta")).toBe(ESPERADO.utilidadBruta);
    expect(importeDe(filas, "comisiones")).toBe(-ESPERADO.comision);
    expect(importeDe(filas, "contribucion")).toBe(ESPERADO.utilidadContribucion);
    expect(importeDe(filas, "gastos")).toBe(-(ESPERADO.gastosFijos + ESPERADO.gastosVariables));
    expect(importeDe(filas, "resultado")).toBe(ESPERADO.resultadoOperativo);
  });

  it("cada renglon = cuadra con los anteriores", () => {
    const i = (clave: string) => importeDe(filas, clave) ?? Number.NaN;
    expect(i("ingresos") + i("costo")).toBe(i("bruta"));
    expect(i("bruta") + i("comisiones")).toBe(i("contribucion"));
    expect(i("contribucion") + i("gastos")).toBe(i("resultado"));
  });

  it("el % sobre venta de una deduccion va en positivo, como en el reporte", () => {
    const costo = filas.find((f) => f.clave === "costo");
    expect(costo?.pctVenta).toBeCloseTo(0.7289, 4);
    expect(filas.find((f) => f.clave === "ingresos")?.pctVenta).toBe(1);
    expect(filas.find((f) => f.clave === "resultado")?.pctVenta).toBeCloseTo(0.016, 3);
  });

  it("los subtotales y el total llevan su enfasis", () => {
    const enfasis = Object.fromEntries(filas.map((f) => [f.clave, f.enfasis]));
    expect(enfasis).toMatchObject({ bruta: "subtotal", contribucion: "subtotal", resultado: "total" });
    expect(enfasis["costo"]).toBe("normal");
  });

  it("una deduccion en cero es cero positivo, no -0", () => {
    const sinComision = construirCascada(calcularResultados(dataset({ ventas: [venta({ folio: "V-1" })] })).total);
    expect(Object.is(importeDe(sinComision, "comisiones"), 0)).toBe(true);
  });

  it("un resultado negativo se marca en riesgo; un positivo no se pinta de verde", () => {
    const perdida = calcularResultados(
      dataset({ ventas: [venta({ folio: "V-1" })], gastos: [gasto({ monto: 50_000_000 })] }),
    );
    const filasPerdida = construirCascada(perdida.total);
    expect(filasPerdida.find((f) => f.clave === "resultado")?.tono).toBe("riesgo");
    expect(filas.find((f) => f.clave === "resultado")?.tono).toBe("neutro");
  });

  it("sin venta los porcentajes son null, no NaN", () => {
    const vacia = construirCascada(calcularResultados(dataset({ gastos: [gasto()] })).total);
    for (const f of vacia) expect(f.pctVenta).toBeNull();
  });
});

describe("cascada mensual", () => {
  const mensual = cascadaMensual(resultadosFixture);

  it("usa el eje continuo con los meses sin actividad y sin fecha al final", () => {
    expect(mensual.columnas).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      SIN_FECHA,
    ]);
  });

  it("la suma de los meses mas sin fecha cuadra con el total en CADA renglon", () => {
    for (const fila of mensual.filas) {
      let suma = 0;
      for (const mes of mensual.columnas) suma += fila.porMes[mes] ?? Number.NaN;
      expect(suma, fila.concepto).toBe(fila.total);
    }
  });

  it("los totales mensuales son los de la cascada del periodo", () => {
    const periodo = construirCascada(resultadosFixture.total);
    for (const fila of mensual.filas) {
      expect(fila.total).toBe(importeDe(periodo, fila.clave));
    }
  });

  it("un mes sin comisiones va en cero, no se omite", () => {
    // En abril, junio, agosto y septiembre ninguna venta pago comision.
    const comisiones = mensual.filas.find((f) => f.clave === "comisiones");
    for (const mes of ["2026-04", "2026-06", "2026-08", "2026-09"]) {
      expect(comisiones?.porMes[mes], mes).toBe(0);
    }
    // Y el mes existe como columna con el resto de sus renglones llenos.
    expect(mensual.columnas).toContain("2026-04");
    expect(mensual.filas.find((f) => f.clave === "ingresos")?.porMes["2026-04"]).toBe(32_100_000);
  });

  it("lo que no tiene fecha queda en su columna, no repartido", () => {
    const ingresos = mensual.filas.find((f) => f.clave === "ingresos");
    const gastos = mensual.filas.find((f) => f.clave === "gastos");
    // La unica venta sin fecha, V-025, por $3,600. Ningun gasto quedo sin fecha.
    expect(ingresos?.porMes[SIN_FECHA]).toBe(360_000);
    expect(gastos?.porMes[SIN_FECHA]).toBe(0);
  });

  it("sin nada sin fecha, no aparece la columna", () => {
    const r = calcularResultados(dataset({ ventas: [venta({ folio: "V-1" })], gastos: [gasto()] }));
    expect(cascadaMensual(r).columnas).toEqual(["2026-01"]);
  });

  it("trae los siete renglones de la cascada", () => {
    expect(mensual.filas.map((f) => f.clave)).toEqual(CONCEPTOS.map((c) => c.clave));
  });
});

describe("punto de equilibrio mensual", () => {
  it("divide entre los meses del eje y compara contra la venta promedio", () => {
    const e = leerEquilibrio(resultadosFixture);
    expect(e.periodo).toBe(resultadosFixture.puntoEquilibrio);
    expect(e.meses).toBe(9);
    expect(e.mensual).toBe(Math.round((e.periodo ?? 0) / 9));
    expect(e.ventaPromedioMensual).toBe(Math.round(ESPERADO.ventaTotal / 9));
    expect(e.gastosFijosMensuales).toBe(Math.round(ESPERADO.gastosFijos / 9));
    expect(e.holgura).toBe((e.ventaPromedioMensual ?? 0) - (e.mensual ?? 0));
    expect(e.motivo).toBeNull();
  });

  it("sin gastos fijos dice por que, en lugar de un cero", () => {
    const r = calcularResultados(
      dataset({ ventas: [venta({ folio: "V-1" })], gastos: [gasto({ tipo: "Variable" })] }),
    );
    const e = leerEquilibrio(r);
    expect(e.mensual).toBeNull();
    expect(e.motivo).toBe("sin-gastos-fijos");
  });

  it("con margen de contribucion negativo no hay volumen que alcance", () => {
    const r = calcularResultados(
      dataset({
        ventas: [venta({ folio: "V-1", costo_unitario: 60_000_000 })],
        gastos: [gasto()],
      }),
    );
    expect(leerEquilibrio(r).motivo).toBe("margen-no-positivo");
  });

  it("con fijos pero sin venta, el motivo es la venta", () => {
    expect(leerEquilibrio(calcularResultados(dataset({ gastos: [gasto()] }))).motivo).toBe("sin-venta");
  });

  it("si nada tiene fecha, el equilibrio del periodo existe pero no el mensual", () => {
    const r = calcularResultados(
      dataset({ ventas: [venta({ folio: "V-1", fecha: null })], gastos: [gasto({ fecha: null })] }),
    );
    const e = leerEquilibrio(r);
    expect(e.periodo).not.toBeNull();
    expect(e.meses).toBe(0);
    expect(e.mensual).toBeNull();
    expect(e.ventaPromedioMensual).toBeNull();
    expect(e.motivo).toBe("sin-fechas");
  });
});

/**
 * Diagnostico del defecto que ya costo una sesion: el punto de equilibrio
 * mensual salia de una cifra de gastos fijos que no era la del archivo. Estas
 * pruebas fijan la cadena completa y descartan las tres hipotesis de entonces:
 * perdida al leer, clasificacion equivocada y division entre meses aplicada dos
 * veces. Se conservan porque el defecto no era evidente en ningun total.
 */
describe("punto de equilibrio con el archivo cargado", () => {
  it("la lectura no pierde gastos: el motor suma lo mismo que una lectura cruda del xlsx", () => {
    const libro = XLSX.read(new Uint8Array(bufferFixture()));
    const hoja = libro.Sheets["gastos"];
    expect(hoja).toBeDefined();
    if (hoja === undefined) return;

    // Lectura independiente del parser: encabezados de la fila 1, sin coerciones.
    const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja, { defval: null });
    let fijos = 0;
    let total = 0;
    for (const f of filas) {
      const folio = String(f["folio_gasto"] ?? "").trim().toUpperCase();
      // G-000 es la fila verde de ejemplo; una fila sin folio es una nota al pie.
      if (folio === "" || folio === "G-000" || typeof f["monto"] !== "number") continue;
      total += f["monto"];
      if (String(f["tipo"] ?? "").trim().toLowerCase() === "fijo") fijos += f["monto"];
    }

    expect(fijos * 100).toBe(resultadosFixture.total.gastosFijos);
    expect(total * 100).toBe(resultadosFixture.total.gastosTotal);
    expect(resultadosFixture.total.gastosFijos).toBe(ESPERADO.gastosFijos);
  });

  it("fija los cuatro valores de la cadena", () => {
    const e = leerEquilibrio(resultadosFixture);
    // 1,072,750 / 4,496,900
    expect(e.margenContribucion).toBeCloseTo(0.238553, 6);
    // 640,800 / 9 = $71,200
    expect(e.gastosFijosMensuales).toBe(7_120_000);
    // 71,200 / 0.238553 = $298,465.89
    expect(e.mensual).toBe(ESPERADO.puntoEquilibrioMensual);
    // 4,496,900 / 9 = $499,655.56
    expect(e.ventaPromedioMensual).toBe(49_965_556);
  });

  it("la division entre meses se aplica una sola vez", () => {
    const e = leerEquilibrio(resultadosFixture);
    const margen = e.margenContribucion ?? Number.NaN;
    const directo = resultadosFixture.total.gastosFijos / e.meses / margen;
    // (fijos / margen) / meses y (fijos / meses) / margen difieren solo por redondeo.
    expect(Math.abs((e.mensual ?? Number.NaN) - directo)).toBeLessThanOrEqual(1);
  });
});

describe("gastos por categoria", () => {
  it("fijos y variables cuadran con los totales del motor sobre el archivo cargado", () => {
    const d = desgloseGastos(fixture.gastos);
    const [fijos, variables] = d.grupos;
    expect(fijos?.tipo).toBe("fijo");
    expect(fijos?.monto).toBe(resultadosFixture.total.gastosFijos);
    expect(variables?.monto).toBe(resultadosFixture.total.gastosVariables);
    expect(d.total).toBe(resultadosFixture.total.gastosTotal);
  });

  it("agrupa las subcategorias dentro de su categoria y ordena por monto", () => {
    const variables = desgloseGastos(fixture.gastos).grupos[1];
    expect(variables?.categorias.map((c) => c.nombre)).toEqual([
      "Importacion",
      "Comercial",
      "Viaticos",
      "Operativos",
      "Impuestos",
    ]);
    const importacion = variables?.categorias[0];
    expect(importacion?.monto).toBe(18_840_000);
    expect(importacion?.registros).toBe(4);
    expect(importacion?.subcategorias.map((s) => s.nombre)).toEqual(["Flete", "Agente aduanal"]);
    expect(importacion?.subcategorias[0]?.pctCategoria).toBeCloseTo(0.7219, 4);
  });

  it("una categoria puede aparecer en los dos grupos sin mezclarse", () => {
    // Operativos tiene seguros fijos y mantenimiento variable.
    const d = desgloseGastos(fixture.gastos);
    const fijo = d.grupos[0]?.categorias.find((c) => c.nombre === "Operativos");
    const variable = d.grupos[1]?.categorias.find((c) => c.nombre === "Operativos");
    expect(fijo?.monto).toBe(4_320_000);
    expect(variable?.monto).toBe(2_680_000);
    expect(fijo?.subcategorias.map((x) => x.nombre)).toEqual(["Seguros"]);
  });

  it("los porcentajes de las categorias suman 1 sobre el total de gastos", () => {
    const d = desgloseGastos(fixture.gastos);
    let suma = 0;
    for (const g of d.grupos) for (const c of g.categorias) suma += c.pctTotal ?? 0;
    expect(suma).toBeCloseTo(1, 9);
  });

  it("los 82 gastos del archivo llegan completos y todos con monto", () => {
    expect(fixture.gastos).toHaveLength(82);
    expect(desgloseGastos(fixture.gastos).sinMonto).toBe(0);
    expect(desgloseGastos(fixture.gastos).sinTipo).toBe(0);
  });

  it("un gasto con folio pero sin monto si se cuenta aparte, sin sumarlo", () => {
    expect(desgloseGastos([gasto({ monto: null })]).sinMonto).toBe(1);
  });

  it("usa la misma regla que el motor: sin tipo o tipo raro cuenta como fijo", () => {
    const gastos = [
      gasto({ tipo: null, monto: 100 }),
      gasto({ tipo: "Mixto", monto: 200 }),
      gasto({ tipo: " variable ", monto: 400 }),
      gasto({ tipo: "Fijo", monto: 800 }),
    ];
    expect(gastos.map(tipoDeGasto)).toEqual(["fijo", "fijo", "variable", "fijo"]);

    const d = desgloseGastos(gastos);
    const r = calcularResultados(dataset({ gastos }));
    expect(d.grupos[0]?.monto).toBe(r.total.gastosFijos);
    expect(d.grupos[1]?.monto).toBe(r.total.gastosVariables);
    expect(d.sinTipo).toBe(2);
  });

  it("une categorias con distinto espaciado o mayusculas y nombra las vacias", () => {
    const d = desgloseGastos([
      gasto({ categoria: "Nomina", subcategoria: "Sueldo", monto: 100 }),
      gasto({ categoria: "  nomina ", subcategoria: null, monto: 50 }),
      gasto({ categoria: null, subcategoria: null, monto: 10 }),
    ]);
    const fijos = d.grupos[0];
    expect(fijos?.categorias.map((c) => c.nombre)).toEqual(["Nomina", SIN_CATEGORIA]);
    expect(fijos?.categorias[0]?.monto).toBe(150);
    expect(fijos?.categorias[0]?.subcategorias.map((s) => s.nombre)).toEqual(["Sueldo", SIN_SUBCATEGORIA]);
  });

  it("siempre trae los dos grupos, aunque uno este vacio", () => {
    const d = desgloseGastos([gasto()]);
    expect(d.grupos.map((g) => g.tipo)).toEqual(["fijo", "variable"]);
    expect(d.grupos[1]?.monto).toBe(0);
    expect(d.grupos[1]?.pctTotal).toBe(0);
  });

  it("sin gastos los porcentajes son null, no NaN", () => {
    const d = desgloseGastos([]);
    expect(d.total).toBe(0);
    for (const g of d.grupos) expect(g.pctTotal).toBeNull();
  });

  it("la fila de total es el total de gastos del motor, al 100%", () => {
    const total = filaTotalGastos(desgloseGastos(fixture.gastos));
    expect(total.monto).toBe(resultadosFixture.total.gastosTotal);
    expect(total.pctTotal).toBe(1);
    expect(total.registros).toBe(82);
    expect(filaTotalGastos(desgloseGastos([])).pctTotal).toBeNull();
  });

  it("aplana cada grupo seguido de sus categorias; los grupos no se despliegan", () => {
    const filas = filasGastos(desgloseGastos(fixture.gastos));
    // Cinco categorias fijas y cinco variables, cada bloque tras su grupo.
    expect(filas.map((f) => f.nivel)).toEqual([
      "grupo",
      "categoria",
      "categoria",
      "categoria",
      "categoria",
      "categoria",
      "grupo",
      "categoria",
      "categoria",
      "categoria",
      "categoria",
      "categoria",
    ]);
    expect(filas[0]?.nombre).toBe("Gastos fijos");
    for (const f of filas.filter((x) => x.nivel === "grupo")) expect(f.subcategorias).toEqual([]);
    const ids = filas.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
