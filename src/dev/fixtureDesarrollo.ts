import URL_FIXTURE from "../../docs/DEMO_Agrodrones_Bajio_FICTICIO.xlsx?url";

import { useAppStore } from "../store/useAppStore";

/**
 * Carga automatica del archivo de demostracion. EXCLUSIVA DE DESARROLLO.
 *
 * Existe para que `/verificar` recorra los seis modulos sin que una persona
 * arrastre el archivo en cada uno de los ocho estados de la matriz (cuatro
 * anchos por dos temas). Es herramienta de verificacion, no funcionalidad del
 * producto: el usuario carga su archivo por `ZonaCarga`, como siempre.
 *
 * Tres cosas de este modulo NO son decoracion (CLAUDE.md, "Restricciones
 * aprendidas"):
 *
 * 1. `main.tsx` lo importa dentro de `if (import.meta.env.DEV)`. En `build`,
 *    Vite sustituye esa expresion por `false`, Rollup elimina la rama y el
 *    chunk dinamico nunca se emite: en produccion el modulo no queda inerte,
 *    queda AUSENTE. Quitar la guarda lo publicaria.
 * 2. La ruta del archivo es `URL_FIXTURE`, un import estatico que Vite
 *    resuelve en tiempo de build. NUNCA sale de la query. Por eso el
 *    parametro no puede cargar una ruta arbitraria: no hay ruta que darle.
 *    Lo que viaja en la query es una bandera que se compara contra un literal.
 * 3. El corte se fija DESPUES de cargar, porque `cargarArchivo` reemplaza los
 *    parametros con los del archivo. Y se fija a `2026-09-09` porque es el
 *    corte de la tabla de cifras de CLAUDE.md: con "hoy", el aging no
 *    coincidiria y `/verificar` reportaria discrepancias que no existen.
 *
 * La prueba guardian (`__tests__/fixtureDesarrollo.test.ts`) recorre `src/` y
 * exige las tres. Si alguien las "simplifica", la suite se pone roja.
 */

/**
 * La bandera que activa la carga: `?fixture=demo`.
 *
 * Cualquier otro valor —y cualquier intento de pasar una ruta— no hace nada.
 */
const PARAMETRO = "fixture";
const VALOR = "demo";

/** Nombre y tipo del `File` que recibe el store: los del archivo real. */
const NOMBRE = "DEMO_Agrodrones_Bajio_FICTICIO.xlsx";
const TIPO = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * El corte de las cifras de referencia (CLAUDE.md, "Pruebas").
 *
 * En UTC y escrito a mano, no con `hoyUTC()`: tiene que ser el mismo valor en
 * cada corrida, en cualquier zona horaria y cualquier dia. Los meses de
 * `Date.UTC` empiezan en cero, asi que el 8 es septiembre.
 */
const CORTE = new Date(Date.UTC(2026, 8, 9));

/**
 * Carga el fixture y fija el corte si la bandera esta puesta. Si no, no hace
 * nada y la aplicacion arranca en su pantalla de carga normal.
 *
 * Nunca lanza: un fallo deja la pantalla de carga intacta y escribe el motivo
 * en la consola. Que `/verificar` reporte "no verificado" es lo correcto
 * (GOBERNANZA.md, seccion 6); que la aplicacion se caiga, no.
 */
export async function activarFixtureDesarrollo(
  busqueda: string = window.location.search,
): Promise<void> {
  if (new URLSearchParams(busqueda).get(PARAMETRO) !== VALOR) return;

  try {
    const respuesta = await fetch(URL_FIXTURE);
    if (!respuesta.ok) throw new Error(`el servidor de desarrollo respondio ${String(respuesta.status)}`);

    const contenido = await respuesta.arrayBuffer();
    const { cargarArchivo, actualizarParametro } = useAppStore.getState();

    await cargarArchivo(new File([contenido], NOMBRE, { type: TIPO }));
    actualizarParametro("fechaCorte", CORTE);

    console.info(`[dev] fixture cargado, corte ${CORTE.toISOString().slice(0, 10)}`);
  } catch (error) {
    console.error("[dev] no se pudo cargar el fixture de desarrollo", error);
  }
}
