import { useState } from "react";

import { nombreArchivoExcel } from "../../lib/exportar";
import { periodoDelReporte } from "../../modules/resumen/selectores";
import { useAppStore } from "../../store/useAppStore";
import { Boton } from "../ui/primitivas";

/**
 * "Descargar Excel": el dataset actual (archivo + capturas) con la estructura
 * de la plantilla, listo para volver a cargarse. Lo usan la barra superior y la
 * pantalla de captura, que es donde mas importa: sin persistencia, descargar el
 * Excel es la unica forma de conservar lo capturado.
 */
export function BotonExcel() {
  const dataset = useAppStore((s) => s.dataset);
  const fechaCorte = useAppStore((s) => s.parametros.fechaCorte);
  const exportarExcel = useAppStore((s) => s.exportarExcel);
  const [estado, setEstado] = useState<"listo" | "generando" | "error">("listo");

  const descargar = async () => {
    if (dataset === null) return;
    setEstado("generando");
    try {
      await exportarExcel(nombreArchivoExcel(periodoDelReporte(dataset), fechaCorte));
      setEstado("listo");
    } catch {
      setEstado("error");
    }
  };

  return (
    <span className="flex items-center gap-2">
      <Boton onClick={() => void descargar()} disabled={dataset === null || estado === "generando"}>
        {estado === "generando" ? "Generando…" : "Descargar Excel"}
      </Boton>
      {estado === "error" && (
        <span role="alert" className="text-[11px] text-riesgo">
          No se pudo generar el Excel. Intente de nuevo.
        </span>
      )}
    </span>
  );
}
