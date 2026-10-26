# Cobertura e2e

La suite prueba el bundle de `dist/` en Chromium mediante `fixture.html`, con
datos deterministas y sin depender de ejemplos ni servicios externos.

| Archivo                 | Cobertura                                                                                                                                                                                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `filtering.spec.js`     | Estado inicial, dibujo con y sin actualización continua, intersect/contains, AND/OR, grupos independientes, salida tidy/legacy y comando de inversión                                                                                                           |
| `groups.spec.js`        | Creación por botones/teclado/gráfico, renombrado, duplicación por UI/API, selección, habilitación, eliminación y visibilidad de no seleccionados                                                                                                                |
| `interactions.spec.js`  | Coordenadas, edición de los cuatro extremos, flechas, eliminación, arrastre, redimensionado, selección múltiple, snapping numérico, fechas, menú y tooltip editable                                                                                             |
| `boundaries.spec.js`    | Límites en cuatro direcciones, cuatro tiradores laterales, clic sin arrastre, snapping temporal, fecha inválida, cruce de extremos y teclado sin selección                                                                                                      |
| `rendering-api.spec.js` | Píxeles del canvas, dimensiones, ejes/etiquetas/ticks/rejilla, controles externos, categorías, detalles, accessors/escalas, valores ausentes/cero, límite de series, render/update/data, restauración, instancias, callbacks, referencias, mediana y benchmarks |
| `zoom.spec.js`          | Regresiones existentes de dominios, extent, zoom, referencias, mediana, clipping e instancias                                                                                                                                                                   |

Las comprobaciones de interacción usan ratón/teclado de Playwright. Las de API
llaman a la API pública y comprueban su salida y/o el DOM. El helper comprueba
errores no capturados del navegador, incluso cuando la selección final es correcta.

## Ejecución

```sh
npm ci
npx playwright install chromium
npm run test:all
```

En esta sesión el navegador se instaló dentro del workspace. Para reutilizarlo
en PowerShell:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) 'node_modules/.cache/ms-playwright'
npm run build
npm run test:e2e
```

No hay reintentos ni fallos marcados como esperados. Cada fallo conserva captura,
traza, contexto y, en las nuevas pruebas, estado exportado y errores de navegador.
Los informes HTML y JSON se guardan en `playwright-report/` y
`test-results/results.json`; son artefactos ignorados por git y se reemplazan en
la siguiente ejecución. Para revisar el HTML:

```sh
npx playwright show-report
```

## Estado actual de la suite

La suite incluye 114 pruebas e2e en Chromium tras integrar main. La última ejecución completa de
`npm run test:all` aprobó las 119 pruebas unitarias y la compilación, y obtuvo
**114 e2e aprobadas**, sin fallos, omitidas ni reintentos.
Los 24 tests de `rendering-api.spec.js` pasan. Los benchmarks internos verifican
el contrato actual de métricas CPU: `collisionMs`, `renderMs` y `totalCpuMs`.

El test `a blur during the run is recorded` sincroniza ahora el evento con
`beforeTrace` y el primer frame medido, después de registrar los listeners.
Comprueba que el evento sucede durante la medición y que `focusLost` queda
registrado. Ha pasado diez repeticiones consecutivas y la suite completa.

El test de dominio temporal en `zoom.spec.js` compara directamente las fechas
reales con las solicitadas, ambas creadas en la zona horaria del navegador.
Ya no convierte medianoche local a un día UTC mediante `toISOString()`.

`auto-update.spec.js` añade tres casos que verifican la geometría durante el
arrastre, el movimiento conjunto de TimeBoxes y la actualización diferida de
colisiones. Los tests corregidos comprueban fechas como Date, visibilidad de los
elementos reales, formatos numéricos, `negate`, inversión respecto al centro del
conjunto, detalles `.details`, estilos CSS de referencias y datos variables en
el benchmark. Los callbacks reciben el valor y el estado exportados.

Los resultados que siguen son históricos y preceden a estas correcciones.

## Resultado pendiente de revisión: 1 de octubre de 2026

42 pruebas unitarias aprobadas; compilación aprobada. En Chromium: **99 e2e,
85 aprobadas y 14 fallidas**, sin omitidas ni reintentos. No se ha modificado
`src/` ni corregido los tests que fallaron. La atribución a test o aplicación
queda pendiente de la revisión solicitada por el usuario.

| Caso                               | Esperado por el test                    | Observado                                                                                           |
| ---------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Snapping de fechas                 | Comparar días como strings              | `p[0].slice is not a function`: el valor recibido no es string                                      |
| Flechas sin TimeBox activa   | Ningún error de navegador               | Cuatro excepciones `Cannot read properties of undefined (reading '1')`                              |
| Dibujo con `autoUpdate=false`      | Selección correcta sin excepciones      | La selección pasa, pero se capturan ocho excepciones `Cannot read properties of null (reading '0')` |
| Inversión con `i`                  | Cambiar de `low` a `high`               | Sigue seleccionado `low`; revisar la semántica esperada de inversión                                |
| Deshabilitar grupo                 | Cero rectángulos de selección en el DOM | Permanece uno; revisar ocultación frente a eliminación del DOM                                      |
| Coordenadas de TimeBox restaurado  | Texto X `2`                             | Texto X `2.0`                                                                                       |
| Menú: contains/or/not              | Propiedad exportada `not: true`         | `mode`/`aggregation` y selección negada pasan; `not` es `undefined`                                 |
| Tooltip editable al pasar el ratón | Tooltip visible para editar             | Permanece oculto                                                                                    |
| Detalles con límite 2              | Dos `.detailsContainer`                 | Cero contenedores con ese selector                                                                  |
| `updateCallback`                   | Al menos una llamada tras dibujar       | Cero llamadas                                                                                       |
| `statusCallback`                   | Al menos una llamada tras dibujar       | Cero llamadas                                                                                       |
| Estilo de referencia               | Atributo SVG `stroke="red"`             | No hay atributo `stroke`; revisar estilo CSS frente a atributo SVG                                  |
| `performance.runBrush`             | Muestras de render mayores que cero     | Cero muestras de render                                                                             |
| Fecha en `zoom.spec.js` existente  | Días ISO 5 y 12 de enero                | Días ISO 4 y 11; revisar conversión de medianoche local a UTC                                       |

### Revisión del 13 de octubre de 2026

Por indicación del usuario, el test `date snapping rounds drawn coordinates to
whole days` compara ahora directamente los valores `Date` con `new Date(2023,
0, 3)` y `new Date(2023, 0, 9)`. La ejecución aislada en Chromium ha pasado
(**1/1**). Los demás fallos no se han corregido ni vuelto a ejecutar; la tabla
anterior conserva el resultado histórico de la suite completa.

La suite ofrece cobertura amplia de las funciones, no una garantía de todas
las combinaciones posibles. Esta ejecución solo verifica Chromium de escritorio.
No se prueban todavía otros motores, interacción táctil, todos los parámetros
cosméticos ni todas las combinaciones de escalas, datos y opciones. Las aserciones
posteriores al primer fallo de un caso tampoco han llegado a ejecutarse.
