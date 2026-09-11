import clsx from "clsx";

import { BarraSuperior } from "./components/BarraSuperior";
import { CapturaManual } from "./components/captura/CapturaManual";
import { ContenidoModulo } from "./components/ContenidoModulo";
import { Navegacion } from "./components/Navegacion";
import { PieAplicacion } from "./components/PieAplicacion";
import { PanelValidacion } from "./components/PanelValidacion";
import { VistaImpresion } from "./components/VistaImpresion";
import { ZonaCarga } from "./components/ZonaCarga";
import { filasCapturadas } from "./lib/captura";
import { useAppStore } from "./store/useAppStore";

/**
 * Shell de la aplicacion.
 *
 * Sin react-router: el modulo activo es estado del store. La app tiene dos
 * pantallas -- sin archivo y con archivo -- y dentro de la segunda se cambia de
 * modulo sin navegar.
 *
 * Al pedir un PDF se monta ademas la vista imprimible, invisible en pantalla;
 * la pantalla normal se marca `print:hidden` para que solo esa vista llegue al
 * papel. Barra, navegacion y panel de validacion nunca se imprimen, ni siquiera
 * con Ctrl+P.
 */
export default function App() {
  const estado = useAppStore((s) => s.estado);
  const dataset = useAppStore((s) => s.dataset);
  const hallazgos = useAppStore((s) => s.hallazgos);
  const calculos = useAppStore((s) => s.calculos);
  const moduloActivo = useAppStore((s) => s.moduloActivo);
  const impresion = useAppStore((s) => s.impresion);
  const pantalla = useAppStore((s) => s.pantalla);
  const capturas = useAppStore((s) => s.capturas);

  if (estado === "vacio" || estado === "cargando" || estado === "error" || calculos === null) {
    return <ZonaCarga />;
  }

  const filasLeidas =
    (dataset?.ventas.length ?? 0) + (dataset?.cobranza.length ?? 0) + (dataset?.gastos.length ?? 0);

  return (
    <div className="min-h-screen bg-papel">
      <div className={clsx(impresion !== null && "print:hidden")}>
        <div className="print:hidden">
          <BarraSuperior />
          <Navegacion capacidades={calculos.capacidades} />
        </div>
        <main className="px-4 py-4">
          <div className="print:hidden">
            <PanelValidacion
              hallazgos={hallazgos}
              filasLeidas={filasLeidas}
              capturadas={filasCapturadas(capturas)}
            />
          </div>
          {pantalla === "captura" ? (
            <div className="print:hidden">
              <CapturaManual />
            </div>
          ) : (
            <ContenidoModulo id={moduloActivo} calculos={calculos} />
          )}
        </main>
        <PieAplicacion />
      </div>

      {impresion !== null && (
        <VistaImpresion key={impresion.id} modo={impresion.modo} calculos={calculos} />
      )}
    </div>
  );
}
