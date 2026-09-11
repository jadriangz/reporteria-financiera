import clsx from "clsx";
import { type ReactNode, useEffect } from "react";

import { etiquetaOrigen, totalCapturas } from "../lib/captura";
import { fecha } from "../lib/format";
import { ListaAlcance } from "../modules/resumen";
import { alcanceDelReporte, periodoDelReporte, textoPeriodo } from "../modules/resumen/selectores";
import { type Calculos, type ModoImpresion, useAppStore } from "../store/useAppStore";
import { ETIQUETA_VERSION } from "../version";
import { ContenidoModulo } from "./ContenidoModulo";
import { NombreCliente } from "./NombreCliente";
import { type ModuloOmitido, nombreArchivoReporte, planImpresion, tituloModulo } from "./impresion";
import { Callout } from "./ui/Callout";
import { cargarGraficas } from "./ui/cargaGraficas";
import { ContextoImpresion } from "./ui/contextoImpresion";

/**
 * Vista imprimible. Se monta al pedir "Descargar PDF", invisible en pantalla
 * (`hidden print:block`), y llama a `window.print()` cuando ya se pinto.
 *
 * Es una vista aparte, y no la pantalla con CSS encima, por tres razones:
 * el reporte completo lleva los seis modulos a la vez, la grafica necesita
 * saber que imprime para fijar su ancho, y lo desplegable tiene que llegar
 * abierto. Las tres se resuelven con `ContextoImpresion`.
 *
 * Cada modulo va en una tabla con `thead` y `tfoot`: es la unica forma
 * portable de repetir encabezado y pie en cada hoja impresa sin que se encimen
 * con el contenido.
 */
export function VistaImpresion({ modo, calculos }: { modo: ModoImpresion; calculos: Calculos }) {
  const dataset = useAppStore((s) => s.dataset);
  const nombreArchivo = useAppStore((s) => s.nombreArchivo);
  const capturas = useAppStore((s) => s.capturas);
  const moduloActivo = useAppStore((s) => s.moduloActivo);
  const terminarImpresion = useAppStore((s) => s.terminarImpresion);

  const corte = calculos.cartera.fechaCorte;
  const periodo = dataset === null ? null : periodoDelReporte(dataset);
  const plan = planImpresion(modo, moduloActivo, calculos.capacidades);
  const titulo = nombreArchivoReporte(periodo, corte);

  useImprimirAlMontar(titulo, terminarImpresion);

  // Si hay filas capturadas a mano, el encabezado de cada hoja lo dice.
  const archivo = etiquetaOrigen(nombreArchivo, totalCapturas(capturas));
  const completo = modo === "completo";

  return (
    <ContextoImpresion value={true}>
      <div className="vista-impresion hidden bg-papel text-tinta print:block">
        {completo && (
          <Portada calculos={calculos} archivo={archivo} textoDePeriodo={textoPeriodo(periodo)} />
        )}

        {plan.imprimir.map((id, i) => (
          <PaginaImpresa
            key={id}
            titulo={tituloModulo(id)}
            corte={corte}
            archivo={archivo}
            salto={completo || i > 0}
            apaisada={id === "resultados"}
          >
            <ContenidoModulo id={id} calculos={calculos} />
          </PaginaImpresa>
        ))}

        {completo && plan.omitidos.length > 0 && (
          <PaginaImpresa titulo="Módulos no incluidos" corte={corte} archivo={archivo} salto>
            <NotaOmitidos omitidos={plan.omitidos} />
          </PaginaImpresa>
        )}
      </div>
    </ContextoImpresion>
  );
}

/**
 * Lanza el dialogo de impresion una vez montada la vista, con el nombre de
 * archivo sugerido, y restaura todo al cerrarlo.
 *
 * - Primero espera a que este cargado el chunk de las graficas (recharts se
 *   carga bajo demanda): si no, se imprimiria el espacio reservado. Luego dos
 *   cuadros de animacion: el primero pinta la vista y el segundo deja que
 *   recharts dibuje sus SVG de ancho fijo. Si el chunk no llega, se imprime de
 *   todos modos: cada grafica dice en su lugar que no pudo cargarse.
 * - `document.title` es lo que el navegador propone como nombre del PDF. Se
 *   cambia justo antes de imprimir y se restaura al terminar; si no, el
 *   cliente acaba con un archivo llamado como la pestaña.
 * - Solo `afterprint` desmonta la vista: en algunos navegadores
 *   `window.print()` regresa antes de que el usuario cierre el dialogo, y
 *   desmontar ahi imprimiria una pagina en blanco.
 */
function useImprimirAlMontar(titulo: string, alTerminar: () => void): void {
  useEffect(() => {
    const original = document.title;
    let cancelado = false;
    let segundo = 0;

    const restaurar = () => {
      document.title = original;
      alTerminar();
    };
    window.addEventListener("afterprint", restaurar);

    let primero = 0;
    void cargarGraficas()
      .catch(() => undefined)
      .then(() => {
        if (cancelado) return;
        primero = requestAnimationFrame(() => {
          segundo = requestAnimationFrame(() => {
            if (cancelado) return;
            document.title = titulo;
            window.print();
          });
        });
      });

    return () => {
      cancelado = true;
      cancelAnimationFrame(primero);
      cancelAnimationFrame(segundo);
      window.removeEventListener("afterprint", restaurar);
      document.title = original;
    };
  }, [titulo, alTerminar]);
}

/** Un modulo impreso: encabezado y pie que se repiten en cada hoja. */
function PaginaImpresa({
  titulo,
  corte,
  archivo,
  salto = false,
  apaisada = false,
  children,
}: {
  titulo: string;
  corte: Date;
  archivo: string;
  /** Empieza en hoja nueva. */
  salto?: boolean;
  /** Hoja horizontal: el estado de resultados mensual no cabe a lo alto. */
  apaisada?: boolean;
  children: ReactNode;
}) {
  return (
    <table className={clsx("imp-pagina w-full", salto && "imp-salto", apaisada && "imp-apaisada")}>
      <thead>
        <tr>
          <td className="pb-3">
            <div className="flex items-baseline justify-between gap-4 border-b-2 border-marino pb-1 text-[10px]">
              <span className="text-sm font-semibold text-marino">{titulo}</span>
              <span className="cifras">
                Corte al {fecha(corte)} · {archivo}
              </span>
            </div>
          </td>
        </tr>
      </thead>
      <tfoot>
        <tr>
          <td className="pt-3">
            {/*
              La version va en el pie de CADA hoja, no solo en la portada: las
              hojas de un PDF se separan, se fotocopian y se mandan sueltas. Sin
              version en la hoja, la cifra que alguien tiene en la mano no se
              puede rastrear hasta el codigo que la produjo (GOBERNANZA.md §3).
            */}
            <div className="flex justify-between gap-4 border-t border-slate-300 pt-1 text-[9px]">
              <span>
                Reporte preliminar · Confidencial · <span className="cifras">{ETIQUETA_VERSION}</span>
              </span>
              <span className="cifras">
                {titulo} · Corte al {fecha(corte)} · {archivo}
              </span>
            </div>
          </td>
        </tr>
      </tfoot>
      <tbody>
        <tr>
          <td>{children}</td>
        </tr>
      </tbody>
    </table>
  );
}

/**
 * Portada del reporte completo.
 *
 * El nombre del cliente sale de `parametros.nombre_cliente`. Si no se capturo,
 * la portada lo dice en lugar de dejar el renglon en blanco.
 */
function Portada({
  calculos,
  archivo,
  textoDePeriodo,
}: {
  calculos: Calculos;
  archivo: string;
  textoDePeriodo: string;
}) {
  const dataset = useAppStore((s) => s.dataset);
  const iva = calculos.insights.find((i) => i.id === "importes-iva");
  const cliente = dataset?.parametros.nombre_cliente ?? null;

  return (
    <section className="imp-portada text-xs">
      <div className="border-t-8 border-marino pt-10">
        {cliente !== null && <p className="mb-2 text-lg font-semibold text-tinta">{cliente}</p>}
        <h1 className="text-3xl font-bold leading-tight text-marino">
          Reporte financiero
          <br />y operativo
        </h1>
        <p className="mt-2 text-sm">Documento preliminar generado a partir del archivo capturado.</p>
      </div>

      <dl className="mt-10 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
        <dt className="font-semibold">Cliente</dt>
        <dd>
          <NombreCliente nombre={cliente} />
        </dd>
        <dt className="font-semibold">Periodo</dt>
        <dd className="cifras">{textoDePeriodo}</dd>
        <dt className="font-semibold">Fecha de corte</dt>
        <dd className="cifras">{fecha(calculos.cartera.fechaCorte)}</dd>
        <dt className="font-semibold">Archivo de origen</dt>
        <dd>{archivo}</dd>
        <dt className="font-semibold">Versión del generador</dt>
        <dd className="cifras">{ETIQUETA_VERSION}</dd>
      </dl>

      <div className="mt-8">
        <p className="text-sm font-semibold text-marino">Alcance</p>
        {dataset !== null && <ListaAlcance alcance={alcanceDelReporte(dataset, calculos)} />}
      </div>

      {iva !== undefined && (
        <div className="mt-6">
          <Callout titulo={iva.titulo} tono={iva.nivel}>
            {iva.detalle}
          </Callout>
        </div>
      )}

      <p className="mt-10 text-[10px]">
        Todo el procesamiento ocurrió en el navegador: ningún dato del archivo salió del equipo.
      </p>
    </section>
  );
}

function NotaOmitidos({ omitidos }: { omitidos: readonly ModuloOmitido[] }) {
  return (
    <div className="text-xs">
      <p>
        Estos módulos no se incluyen porque el archivo no trae la información que necesitan. Se
        habilitan en cuanto se capture:
      </p>
      <ul className="mt-2 space-y-1">
        {omitidos.map((o) => (
          <li key={o.id} className="flex gap-2">
            <span className="font-semibold">{o.titulo}:</span>
            <span className="text-advertencia">{o.motivo}.</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
