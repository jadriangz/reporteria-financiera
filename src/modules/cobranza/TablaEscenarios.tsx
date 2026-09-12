import { TablaCifras } from "../../components/ui/TablaCifras";
import type { ColumnaTabla } from "../../components/ui/tabla";
import type { Centavos, ClaveBucket } from "../../lib/calc";
import { moneda, porcentaje } from "../../lib/format";
import { useAppStore } from "../../store/useAppStore";
import { type FilaEscenario, filasEscenarios } from "./selectores";

const COLUMNAS_ESCENARIOS: readonly ColumnaTabla<FilaEscenario>[] = [
  {
    clave: "nombre",
    encabezado: "Escenario",
    celda: (e) =>
      e.coincideCon === null ? (
        e.nombre
      ) : (
        <>
          {e.nombre}{" "}
          <span className="font-normal text-slate-500">(igual a {e.coincideCon})</span>
        </>
      ),
  },
  {
    clave: "tasas",
    encabezado: "91-180 / +180",
    alineacion: "derecha",
    celda: (e) => `${porcentaje(e.pct91180, 0)} / ${porcentaje(e.pctMas180, 0)}`,
  },
  {
    clave: "provision",
    encabezado: "Provisión",
    alineacion: "derecha",
    celda: (e) => moneda(e.provision),
  },
  {
    clave: "ajustada",
    encabezado: "Utilidad ajustada",
    alineacion: "derecha",
    celda: (e) => moneda(e.utilidadAjustada),
  },
  {
    clave: "variacion",
    encabezado: "Variación",
    alineacion: "derecha",
    celda: (e) => porcentaje(e.variacion),
  },
];

/**
 * Los escenarios de provision sobre la utilidad de contribucion: cuatro de
 * referencia, fijos, y la fila resaltada con las tasas aplicadas.
 *
 * La comparten Cobranza y Estado de resultados, y por eso lee las tasas
 * directamente del store en lugar de recibirlas: si el usuario las mueve en
 * Cobranza, la fila aplicada cambia en este mismo componente donde sea que se
 * pinte. Dos copias de la tabla podrian desincronizarse; una sola no.
 */
export function TablaEscenarios({
  porBucket,
  utilidadContribucion,
}: {
  readonly porBucket: Readonly<Record<ClaveBucket, Centavos>>;
  readonly utilidadContribucion: Centavos;
}) {
  const pct91180 = useAppStore((s) => s.parametros.provision91180);
  const pctMas180 = useAppStore((s) => s.parametros.provisionMas180);

  return (
    <TablaCifras
      etiquetaTabla="Escenarios de provisión"
      // Tabla de RESUMEN: cuatro escenarios de referencia, cada uno con su
      // lectura propia. Ver `EstrategiaEstrecha`.
      enEstrecho="tarjetas"
      columnas={COLUMNAS_ESCENARIOS}
      filas={filasEscenarios(porBucket, utilidadContribucion, pct91180, pctMas180).map(
        (e) => ({
          id: e.clave,
          datos: e,
          enfasis: e.aplicada ? ("total" as const) : ("normal" as const),
          tono: e.utilidadAjustada < 0 ? ("riesgo" as const) : ("neutro" as const),
        }),
      )}
    />
  );
}
