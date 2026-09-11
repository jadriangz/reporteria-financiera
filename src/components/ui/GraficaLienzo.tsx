import type { ReactElement } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { moneda, monedaCompacta } from "../../lib/format";
import {
  type FilaRecharts,
  type SerieGrafica,
  type TipoGrafica,
  VARIABLE_COLOR,
  dataKeyDe,
} from "./datosGrafica";

/**
 * El dibujo de la grafica. UNICO archivo del proyecto que importa recharts, y
 * se carga bajo demanda (ver `cargaGraficas.ts`): recharts pesa y no hace falta
 * para arrancar la app ni para la pantalla de carga. `Grafica.tsx` es el
 * envoltorio que los modulos usan; este archivo no se importa directamente.
 *
 * Aqui se deciden ejes, margenes, colores y formato, para que todas las
 * graficas se lean igual:
 *
 * - Eje Y con `monedaCompacta` (no cabe la cifra entera). Eje X con la
 *   etiqueta que ya trae cada punto. El tooltip muestra la cifra completa con
 *   `moneda`: es donde se lee el numero exacto.
 * - En un eje de categorias se pintan TODAS las etiquetas: saltarse un modelo
 *   deja una barra sin nombre. En un eje de tiempo se permite espaciarlas.
 * - Sin animaciones de entrada: quien compara cifras no debe esperar a que las
 *   barras terminen de crecer, ni ver alturas que todavia no son las reales.
 * - Lineas rectas entre puntos: una curva suavizada inventa valores entre meses.
 */

const MARGEN = { top: 8, right: 12, bottom: 0, left: 4 } as const;
const TICK = { fontSize: 11, fill: "var(--color-slate-500)" } as const;
/** En papel las etiquetas bajan de tamaño, igual que el resto del reporte. */
const TICK_IMPRESION = { fontSize: 9, fill: "var(--color-slate-500)" } as const;
/**
 * Espacio para etiquetas de categoria inclinadas al imprimir: en 680px, nueve
 * nombres de modelo horizontales se enciman.
 */
const ALTO_EJE_INCLINADO = 48;
const COLOR_EJE = "var(--color-slate-300)";
const COLOR_REJILLA = "var(--color-slate-200)";
const ANCHO_EJE_Y = 60;

/**
 * Ancho de la grafica al imprimir, en pixeles CSS. Cabe en una hoja carta con
 * los margenes de `@page` y la escala de impresion de `index.css`.
 *
 * TRAMPA DE window.print(): `ResponsiveContainer` mide su caja con un
 * ResizeObserver. La vista de impresion esta oculta en pantalla, asi que mide
 * cero y el SVG sale vacio; y aunque midiera, el observador no se dispara en el
 * contexto de impresion. Por eso, imprimiendo, no hay contenedor responsivo:
 * el grafico recibe ancho y alto fijos.
 */
const ANCHO_IMPRESION = 680;

const formatoEjeY = (centavos: number): string => monedaCompacta(centavos);

export function GraficaLienzo({
  tipo,
  series,
  filas,
  etiquetas,
  categorica,
  imprimiendo,
  alto,
}: {
  readonly tipo: TipoGrafica;
  readonly series: readonly SerieGrafica[];
  readonly filas: readonly FilaRecharts[];
  readonly etiquetas: readonly string[];
  readonly categorica: boolean;
  readonly imprimiendo: boolean;
  readonly alto: number;
}) {
  const esLinea = tipo === "linea";

  return (
    <Contenedor imprimiendo={imprimiendo} alto={alto}>
      <ComposedChart
        data={[...filas]}
        margin={MARGEN}
        barGap={2}
        barCategoryGap="22%"
        {...(imprimiendo ? { width: ANCHO_IMPRESION, height: alto } : {})}
      >
        <CartesianGrid vertical={false} stroke={COLOR_REJILLA} />
        <XAxis
          dataKey="x"
          tickFormatter={(indice: number) => etiquetas[indice] ?? ""}
          tick={imprimiendo ? TICK_IMPRESION : TICK}
          tickLine={false}
          axisLine={{ stroke: COLOR_EJE }}
          {...(categorica ? { interval: 0 } : { minTickGap: 8 })}
          {...(categorica && imprimiendo
            ? { angle: -30, textAnchor: "end", height: ALTO_EJE_INCLINADO }
            : {})}
        />
        <YAxis
          tickFormatter={formatoEjeY}
          tick={imprimiendo ? TICK_IMPRESION : TICK}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
          width={ANCHO_EJE_Y}
        />
        {/* En papel no hay cursor: el tooltip solo estorbaria. */}
        {!imprimiendo && (
          <Tooltip
            isAnimationActive={false}
            cursor={
              esLinea
                ? { stroke: COLOR_EJE, strokeWidth: 1 }
                : { fill: "var(--color-slate-100)" }
            }
            content={({ active, label }) => (
              <ContenidoTooltip
                active={active}
                indice={label}
                filas={filas}
                etiquetas={etiquetas}
                series={series}
              />
            )}
          />
        )}
        {series.map((s, i) =>
          esLinea ? (
            <Line
              key={s.clave}
              dataKey={dataKeyDe(i)}
              name={s.etiqueta}
              type="linear"
              stroke={VARIABLE_COLOR[s.color]}
              strokeWidth={2}
              dot={{ r: 2.5, fill: VARIABLE_COLOR[s.color], strokeWidth: 0 }}
              activeDot={{ r: 4, strokeWidth: 0 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          ) : (
            <Bar
              key={s.clave}
              dataKey={dataKeyDe(i)}
              name={s.etiqueta}
              fill={VARIABLE_COLOR[s.color]}
              maxBarSize={32}
              isAnimationActive={false}
              {...(tipo === "barras-apiladas" ? { stackId: "pila" } : {})}
            />
          ),
        )}
      </ComposedChart>
    </Contenedor>
  );
}

/** Responsivo en pantalla; imprimiendo, el grafico ya trae su ancho fijo. */
function Contenedor({
  imprimiendo,
  alto,
  children,
}: {
  imprimiendo: boolean;
  alto: number;
  children: ReactElement;
}) {
  if (imprimiendo) return children;
  return (
    <ResponsiveContainer width="100%" height={alto}>
      {children}
    </ResponsiveContainer>
  );
}

/**
 * Tooltip sobrio: el mes o la categoria, y la cifra completa de cada serie.
 *
 * Lee de las filas propias por posicion, no del `payload` de recharts, que
 * viene tipado como `any` y omite series en hueco. Asi un `null` se pinta como
 * raya en lugar de desaparecer.
 */
function ContenidoTooltip({
  active,
  indice,
  filas,
  etiquetas,
  series,
}: {
  active: boolean;
  indice: string | number | undefined;
  filas: readonly FilaRecharts[];
  etiquetas: readonly string[];
  series: readonly SerieGrafica[];
}) {
  if (!active || typeof indice !== "number") return null;
  const fila = filas[indice];
  if (fila === undefined) return null;

  return (
    <div className="border border-slate-300 bg-white px-2 py-1.5 text-xs shadow-sm">
      <p className="mb-1 font-semibold text-slate-700">{etiquetas[indice]}</p>
      <table className="border-collapse">
        <tbody>
          {series.map((s, i) => (
            <tr key={s.clave}>
              <td className="pr-3 text-slate-600">
                <span
                  aria-hidden="true"
                  className="mr-1.5 inline-block h-2 w-2"
                  style={{ backgroundColor: VARIABLE_COLOR[s.color] }}
                />
                {s.etiqueta}
              </td>
              <td className="cifras text-right font-medium tabular-nums text-slate-900">
                {moneda(fila[dataKeyDe(i)] ?? null)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
