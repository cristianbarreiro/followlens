---
okf_version: '0.2'
type: Development Guide
title: Guía de Desarrollo y Validación
description: Requisitos del entorno, herramientas, scripts de compilación, suite de pruebas, estado de linter y flujo de trabajo.
tags:
  - development
  - testing
  - node24
  - vinext
  - oxlint
  - verification
timestamp: '2026-10-13T22:15:00-03:00'
lifecycle: stable
---

# Guía de Desarrollo y Validación de FollowLens

## 1. Requisitos de Entorno

- **Node.js:** Versión 24 o superior (`>=24` definida en `package.json` engines).
- **Gestor de paquetes:** `npm` (o `npm.cmd` en entornos Windows PowerShell donde las políticas de ejecución restrinjan scripts).

---

## 2. Scripts Disponibles

Todos los comandos se ejecutan desde la raíz del proyecto:

| Comando             | Acción                                                    | Herramienta                                       | Notas                                             |
| ------------------- | --------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------- |
| `npm run dev`       | Inicia el servidor de desarrollo local con HMR.           | `vinext dev`                                      | Entorno Vite 8 con Vinext.                        |
| `npm run build`     | Compila la aplicación completa para producción.           | `vinext build`                                    | Compila bundles cliente y SSR.                    |
| `npm test`          | Ejecuta la suite completa de pruebas unitarias.           | `node --test lib/relationships.test.ts`           | 39 tests unitarios nativos (0 suites).            |
| `npm run test:e2e`  | Ejecuta regresiones de importación en Chromium real.      | Playwright Test                                   | Inicia Vinext local; requiere Chromium instalado. |
| `npm run benchmark:importer` | Mide escenarios sintéticos del pipeline de importación. | Node.js 24 + `--expose-gc` | Opt-in; informa tiempos y snapshots aproximados de memoria, sin umbrales. |
| `npm run benchmark:importer:browser` | Mide importaciones sintéticas medianas, de alta cardinalidad y cercanas al límite en Chromium. | Playwright Test + Chromium | Ejecución independiente; incluye rechazo del límite y recuperación. |
| `npm run benchmark:importer:stages` | Compara ZIP DEFLATE/STORE y tiempos por etapa en Chromium. | Playwright Test + Chromium | Dos repeticiones de mediano y 30 MiB; diagnósticos opt-in, sin umbrales. |
| `npm run benchmark:importer:realistic` | Compara importaciones relacionales sintéticas de alta cardinalidad en Chromium. | Playwright Test + Chromium | Tres escalas, dos repeticiones y DEFLATE/STORE; opt-in, sin umbrales. |
| `npm run benchmark:importer:optimization` | Compara el importador actual con un parser alternativo benchmark-only. | Playwright Test + Chromium | Tres repeticiones por variante y escala tras calentamiento; no CI. |
| `npm run benchmark:importer:crc32` | Compara el CRC32 productivo con slicing-by-8 experimental. | Playwright Test + Chromium | Equivalencia previa, cinco corridas por entrada/escala; no CI. |
| `npm run benchmark:importer:worker` | Compara importación principal con un Worker aislado que reutiliza `importFiles`. | Playwright Test + Chromium | Cinco corridas por variante/escala; opt-in, no CI ni flujo de producción. |
| `npm run benchmark:importer:worker-e2e` | Compara importación y análisis en hilo principal / Worker hasta el dashboard React real. | Playwright Test + Chromium | Cinco corridas por variante/escala; opt-in, no CI ni flujo de producción. |
| `npm run benchmark:importer:render` | Diagnostica perfiles React, actualización del dashboard e interacción real en el benchmark Worker end-to-end. | Playwright Test + Chromium | Cinco corridas por variante/escala; opt-in, solo servidor Vinext de desarrollo; no CI ni flujo de producción. |
| `npm run profile:importer:browser` | Perfila el hot path ZIP en Chromium mediante CDP. | Playwright + Chrome DevTools Protocol | Opt-in, 2 repeticiones por carga; no guarda perfiles crudos. |
| `npm run typecheck` | Verifica tipos TypeScript sin emitir archivos.            | `tsc --noEmit`                                    | Validación estricta con TypeScript 5.9.           |
| `npm run format`    | Formatea el código fuente del proyecto.                   | `oxfmt`                                           | Formateador ultrarrápido basado en Rust.          |
| `npm run lint`      | Ejecuta el análisis estático de código.                   | `oxlint`                                          | Véase Sección 4 para diagnóstico de linter.       |
| `npm run start`     | Arranca el runtime local de Cloudflare Worker / Wrangler. | `wrangler dev --config dist/server/wrangler.json` | Emulación local.                                  |

---

## Targets de producción

La configuración de Vite activa exactamente un adaptador por build. `npm run build` continúa siendo `vinext build`; Cloudflare conserva el plugin y los bindings existentes, y Vercel usa el plugin oficial `nitro/vite` con `NITRO_PRESET=vercel`. Vercel define `VERCEL=1` automáticamente; `FOLLOWLENS_DEPLOY_TARGET` fija explícitamente el destino (`vercel` o `cloudflare`). Sin ambas variables en local, Cloudflare sigue siendo el predeterminado. Un valor explícito inválido detiene la configuración.

### Ajustes del proyecto Vercel

En **Project Settings → Build and Deployment**, configurar:

| Ajuste | Valor |
|---|---|
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Framework Preset | `Nitro` (o detección automática de Nitro) |
| Output Directory | `.vercel/output` |
| Node.js Version | `24.x` |

Variable de entorno recomendada para todos los entornos del proyecto Vercel:

| Variable | Valor | Uso |
|---|---|---|
| `FOLLOWLENS_DEPLOY_TARGET` | `vercel` | Selecciona Nitro; Vite fija `NITRO_PRESET=vercel` durante la compilación. |

No se requieren secretos ni variables adicionales de aplicación. La salida debe incluir `.vercel/output/config.json` (Build Output API), `functions/` y `static/`; no se debe sustituir por el `dist/` de una aplicación Vite estática convencional.

Compilar localmente los destinos en PowerShell:

```powershell
$env:FOLLOWLENS_DEPLOY_TARGET = 'vercel'
npm run build

$env:FOLLOWLENS_DEPLOY_TARGET = 'cloudflare'
npm run build
```

`npm run start` y `dist/server/wrangler.json` siguen siendo propios de la emulación Cloudflare. Para validación adicional con Vercel, usar `vercel build` cuando la CLI esté autenticada y el proyecto vinculado; no ejecutar `vercel deploy` para esta verificación.

---

## 3. Pruebas Unitarias Actuales (`lib/relationships.test.ts`)

La suite unitaria se ejecuta mediante el runner nativo de Node.js (`node --test`) y utiliza aserciones estrictas (`node:assert/strict`).

### Cobertura Actual Comprobada (39 tests unitarios activos):

1. Normalización de usernames (descarte de fórmulas de planilla `@`, `=`, `<script>`).
2. Parsing de formatos planos, envueltos y resolución por `title` / URL.
3. Rechazo de registros incompletos y soporte de listas vacías legítimas.
4. Cálculo matemático de relaciones actuales (`mutuals`, `notBack`, `fans`).
5. Comparación precisa entre snapshots (`lost`, `new`, `unfollowed`, `followed`, `lostMutuals`, `newMutuals`).
6. Bloqueo de comparaciones entre cuentas distintas o con fechas no decrecientes.
7. Manejo de snapshots vacíos completos y conjuntos disjuntos.
8. Reconstrucción cronológica de historial (`timeline`) con colapso de estados idénticos.
9. Exportación CSV sanitizada con UTF-8 BOM y exclusión de cuentas ajenas o fechas futuras.
10. Importación de archivos multipartes sueltos (`followers_1.json`, `followers_2.json`, `following.json`).
11. Importación de ZIP anidado ignorando mensajes privados y archivos corruptos no relacionados.
12. Rechazo de partes intermedias faltantes en seguidores (ej. saltos 1 → 3).
13. Rechazo de carpetas de cuentas duplicadas o múltiples archivos ZIP simultáneos.
14. Rechazo de ZIP dañado y aceptación de archivos legítimos vacíos.
15. Búsqueda y validación de EOCD con comentarios variables hasta la ventana máxima de 65.557 bytes.
16. Detección de firma EOCD falsa dentro del comentario, ZIP truncado, cabeceras corruptas y ZIP multidisco.
17. Extracción de entradas STORE y DEFLATE con verificación de tabla CRC32 (IEEE 802.3).
18. Inconsistencia de encabezado local (LFH) y bit 3 con marcadores de datos legítimos.
19. Rechazo de métodos no soportados, entradas cifradas y formato ZIP64 (por campos EOCD y locator).
20. Rechazo preventivo de offsets corruptos, invasión del Directorio Central y discrepancias de tamaño.
21. Detención temprana de descompresión ante bombas ZIP altamente comprimibles (protección DoS).
22. Omisión comprobada de multimedia, verificando que los rangos binarios nunca se solicitan con `slice()`.
23. Admisión de archivo ZIP simulado superior a 200 MB mediante rangos selectivos sin buffer real masivo.
24. Importación de ZIP con listas HTML válidas de seguidores y seguidos, y análisis de relaciones.
25. Soporte de multipartes HTML de seguidores y detección de saltos secuenciales.
26. Extracción HTML desde rutas `/_u/`, decodificación de entidades, encabezados `<h2>` y descarte de enlaces ajenos.
27. Rechazo controlado de HTML vacío, malformado o sin estructura reconocible de Instagram.
28. Omisión comprobada de archivos HTML no relacionales dentro del ZIP (`start_here.html`, `chats.html`).
29. Rechazo controlado de importación con formatos mezclados JSON y HTML.
30. Admisión de archivos HTML sueltos sin archivo ZIP.
31. Admisión de lista HTML de seguidores legítimamente vacía.
32. Validación rigurosa de URL y username en HTML (rutas de contenido `/p/`, `/reel/`, `/stories/`, `/explore/`, hostnames institucionales y slugs `/_u/`).
33. Rechazo de documentos HTML ajenos que contengan `<main>` sin estructura ni encabezados de exportación de Instagram.
34. Rechazo de documentos HTML con bloques de registro pero sin nombres de usuario extraíbles.
35. Rechazo de URLs JSON de publicaciones al usar el fallback por `href`, con soporte para URLs válidas de perfil.
36. Prioridad de la carpeta relacional oficial del ZIP e ignorado del archivo homónimo de Threads.
37. Rechazo de exportaciones incompletas cuando solo hay archivos relacionales ajenos a la carpeta oficial.
38. Rechazo de carpetas relacionales oficiales ambiguas.
39. Extracción de todos los registros HTML anidados en envoltorios de exportación.

> [!NOTE]
> **Datos de prueba y validación:** Las pruebas unitarias automatizadas operan sobre datos sintéticos generados en memoria con `buildSyntheticZip`, `zipSync` y objetos `File`/`Blob` livianos. En la salida de `node:test`, se reportan los tests pasados y 0 suites (archivo único de ejecución). Las mediciones históricas con una exportación real grande son una validación anterior, no forman parte de la línea de base sintética ni se vuelven a ejecutar en cada cambio.

### Regresiones de importación en navegador

La suite `tests/e2e/import.spec.ts` usa Playwright Test con Chromium y archivos ZIP/HTML sintéticos creados durante la prueba. Recorre la selección real de archivos y el diálogo, valida los resultados visibles del dashboard, ejercita errores y recuperación y comprueba que no se produzcan errores de consola ni solicitudes externas durante la importación. No se usan exportaciones reales y no se persisten los datos de prueba.

Instalá el navegador una vez por entorno y ejecutá la suite desde la raíz:

```sh
npx playwright install chromium
npm run test:e2e
```

Playwright inicia automáticamente el servidor local de Vinext en `localhost:4173`. Los artefactos de prueba se escriben en `test-results/` (ignorado por Git), con capturas, video y trazas desactivados. El workflow `.github/workflows/e2e.yml` ejecuta la suite junto con las verificaciones unitarias, de tipos y de build en Node.js 24.

### Línea de base de rendimiento del importador (Fase 9)

Ejecutá `npm run benchmark:importer` desde la raíz en Node.js 24+. El script crea todos los ZIP, usernames y registros en memoria; no usa exportaciones ni datos personales. Mide lectura EOCD/directorio central, rangos relevantes, extracción con CRC, reproducción aislada de DEFLATE, parsing y álgebra de relaciones. Incluye JSON pequeño (40/30), HTML pequeño (40/30), JSON mediano (10.000/8.000), un ZIP almacenado de 32 MiB de contenido irrelevante y un JSON de exactamente 30 MiB seguido por un caso de 1 byte sobre el límite. La carga irrelevante solo se lee durante la creación sintética del ZIP; el lector selectivo no solicita su rango de datos. Las lecturas Node son desde un `File` construido en memoria, no mediciones de disco físico.

Corridas locales de referencia (Windows, Node.js 24.16.0, V8 13.6.233.17) registraron:

| Escenario | Entrada / resultado | Tiempos observados |
|---|---|---|
| JSON pequeño | 40 seguidores, 30 seguidos, 3.720 bytes descomprimidos | importación Node: 2,46–3,75 ms en las corridas registradas |
| HTML pequeño | 40 seguidores, 30 seguidos, 5.506 bytes descomprimidos | parsing Node/linkedom: 20,07 ms; importación: 11,06 ms |
| JSON mediano | 10.000 seguidores, 8.000 seguidos; 2.500 mutuos; 0,947 MiB descomprimidos | extracción/integridad: 29,00 ms; parsing: 26,52 ms; cálculo: 4,79 ms; importación: 44,64 ms |
| ZIP con contenido irrelevante | 32 MiB de medios sintéticos y 3.720 bytes relacionales | extracción/integridad: 0,59 ms; se leyeron 65.557 bytes EOCD, 259 del directorio central y 3.882 de rangos relacionales; 0 bytes del medio |
| Presupuesto máximo | 30 MiB exactos: aceptado; 30 MiB + 1 byte: error controlado | importación exacta: 315,05 ms |

Los tiempos son muestras locales orientativas, no garantías ni umbrales de CI. El benchmark informa snapshots de `heapUsed`, RSS, `external` y `arrayBuffers` antes/después de etapas; las operaciones síncronas pueden impedir el muestreo de su pico real. El ZIP de 32 MiB se materializa intencionalmente en el proceso Node (incluidas copias del fixture/File), así que su RSS no representa memoria de un navegador que opera con un `File` local; solo el registro de rangos verifica que no se soliciten bytes multimedia. Para el payload exacto, RSS pasó de ~77 MiB antes a ~138 MiB inmediatamente después; tras ceder el event loop y forzar GC, volvió a ~78 MiB y `arrayBuffers` a ~0,32 MiB, sin crecimiento acumulado tras una segunda importación. No interpretes `heapUsed` de Node como memoria total del navegador. En Chromium real (Playwright 1.64.0, Chromium 156.0.8078.4), dos corridas de importación UI JSON pequeña sintética midieron 114–162 ms; el cronómetro va desde liberar la lectura simulada del archivo hasta que Playwright observa el cierre del diálogo, por lo que incluye latencia del test harness. `performance.memory` informó 37,3 MB de heap JS antes y después y un límite de 3.760 MB. Esa API es específica de Chromium y aproximada; el caso de navegador no representa la carga cercana al límite.

Los escenarios medianos completan el import en decenas de milisegundos y el ZIP con 32 MiB irrelevantes en ~1 ms, por lo que no se retuvo ninguna optimización de producción. Se evaluó una escritura DEFLATE directa al buffer declarado; aunque el microbenchmark aislado fue más rápido, la importación completa exacta al límite no mejoró de forma significativa y las mediciones de memoria no justificaron cambiar el algoritmo existente. El stress test de 30 MiB es opt-in y no se agrega a `npm test`.

### Validación de escala en Chromium (Fase 10)

Ejecutá `npm run benchmark:importer:browser` con Node.js 24+ y Chromium instalado (`npx playwright install chromium`). Este comando usa un config Playwright separado y no agrega casos pesados a `npm run test:e2e`. Levanta el servidor Vinext local y recorre el diálogo de importación real; incluye el test de Fase 13 de alta cardinalidad una vez, además del mediano, el stress de límite con whitespace artificial, el exceso de 1 byte y la recuperación. Todos los usernames y ZIP son sintéticos, y el benchmark comprueba los límites de bytes comprimidos y descomprimidos desde los metadatos del ZIP.

En Windows, Node.js 24.16.0 y Chromium 156.0.8078.4, una corrida independiente registró:

| Escenario | ZIP / datos relacionales | Resultado UI y relaciones esperadas/reales | Tiempo Chromium de importación | Hilo principal |
|---|---|---|---:|---|
| JSON mediano | 23.792 B; 23.414 B comprimidos / 504.030 B descomprimidos | 5.000 seguidores, 4.000 seguidos, 2.500 mutuos y 1.500 no recíprocos; esperado = real | 251,6 ms | 1 tarea larga; máximo 133 ms; `JSON.parse`: 7,1 ms |
| Límite acumulado exacto | 31.183 B; 30.805 B comprimidos / 31.457.280 B descomprimidos (30 MiB) | Importación exitosa; 1 seguidor, 0 seguidos, 0 mutuos y 0 no recíprocos; esperado = real | 680,6 ms | 3 tareas largas; máximo 456 ms; `JSON.parse`: 22,1 ms |
| Límite + 1 byte | 31.183 B; 30.805 B comprimidos / 31.457.281 B descomprimidos | Error controlado, sin dashboard ni importación parcial | 88,0 ms hasta el alert | 0 tareas largas; no llegó a `JSON.parse` |
| Recuperación | ZIP sintético pequeño; 164 B descomprimidos | Tras el error, importación exitosa; 1 seguidor y 1 seguido; esperado = real | 200,9 ms | 1 tarea larga; máximo 160 ms |

El intervalo Chromium empieza en el evento real del botón de análisis y termina cuando un `MutationObserver` ve el resultado de éxito o el alert controlado. El tiempo del harness Playwright se registra aparte desde antes del click hasta que resuelven sus aserciones: en esa corrida fue 468,2 ms para el caso mediano, 804,2 ms para el límite exacto, 294,9 ms para el error y 337,4 ms para la recuperación. Esos intervalos no son equivalentes ni se usan como umbrales de CI. La instrumentación además mide por separado la suma de duración de `JSON.parse`, las tareas largas si `PerformanceObserver` soporta `longtask`, y `performance.memory.usedJSHeapSize` cuando existe. El heap Chromium informado fue 39.600.000 bytes antes y después de cada escenario de esta corrida; esta API aproximada no refleja necesariamente asignaciones transitorias ni la memoria total del proceso.

La corrida evidencia una tarea larga reproducible en el import válido de 30 MiB (la corrida final observó una de 456 ms; otra corrida previa registró 566 ms), aunque los datos relacionales son solo un registro y el parsing JSON instrumentado suma 22,1 ms. Por tanto, la cardinalidad de relaciones y el render de miles de filas no explican ese caso; el coste restante está en el procesamiento previo/alrededor del parseo (lectura selectiva, DEFLATE, CRC, decodificación y actualización de estado), que esta línea de base no separa por función. Es una pausa perceptible posible en el hilo principal al importar una entrada cerca del presupuesto, no un umbral universal. No se cambió producción: esta medición no identifica cuál subetapa del procesamiento debe optimizarse, y una intervención en descompresión o verificación sin perfilado de esa etapa arriesgaría las defensas de recursos e integridad. El exceso de 1 byte se rechaza antes de parsear y permite una importación válida posterior.

La comprobación de solicitudes del benchmark solo permite HTTP/WebSocket del origen local de la app; en los cuatro flujos no se detectaron solicitudes externas ni errores de consola/página. Las métricas son de Chromium real pero de una sola máquina/corrida final, no representan todos los dispositivos; para el proceso Node y sus etapas aisladas, usá por separado `npm run benchmark:importer`. Ninguna lectura o medición usa datos reales.

### Profiling CPU de importación ZIP en Chromium (Fase 11)

Ejecutá `npm run profile:importer:browser` con Node.js 24+ y Chromium instalado. El comando inicia un config Playwright independiente, usa el mismo generador de ZIP sintéticos y perfiles dos veces el caso mediano de Fase 10 y dos veces el ZIP JSON válido de 30 MiB acumulados. No incluye el exceso de 1 byte en el perfil (permanece cubierto como regresión funcional en `npm run benchmark:importer:browser`), y no altera `npm test` ni `npm run test:e2e`.

Playwright abre una sesión CDP por escenario y habilita `Profiler` con intervalo nominal de 1 ms justo antes del click real del botón; la captura se detiene al observar el resultado UI. El script solo imprime un resumen agregado de nodos muestreados (función, ruta fuente y línea, self/inclusive, caller y proporción); nunca escribe perfiles crudos ni contenido de archivos al disco. `selfMs` es tiempo exclusivo muestreado de la función. `inclusiveMs` agrega sus descendientes y se solapa entre ancestros/descendientes; **no se suma a los valores self**. Los porcentajes usan el total de `timeDeltas` observado durante la captura, que contiene tiempo inactivo y actividad adyacente del harness además del procesamiento; no es el tiempo total de importación. El intervalo `appElapsedMs` de Chromium y el tiempo del harness se reportan aparte. El profiling añade sobrecarga y no sustituye al benchmark no instrumentado.

En Windows, Node.js 24.16.0 / Chromium 156.0.8078.4, una ejecución final tras corregir la agregación de tiempos inclusivos registró:

| Escenario y corrida | `appElapsedMs` | Ventana perfil muestreada / muestras | Funciones con mayor self observado |
|---|---:|---:|---|
| Mediano, 1 | 207,4 ms | 489,33 ms / 276 | `Inflate.c` 11,58 ms (2,4%); `inflt` 5,52 ms (1,1%); `JSON.parse` 5,10 ms (1,0%); `crc32` 4,42 ms (0,9%) |
| Mediano, 2 | 200,2 ms | 462,40 ms / 255 | `JSON.parse` 8,16 ms (1,8%); `inflt` 7,75 ms (1,7%); `crc32` 5,56 ms (1,2%); `Inflate.c` 2,01 ms (0,4%) |
| 30 MiB, 1 | 852,4 ms | 1.237,46 ms / 584 | `inflt` 266,89 ms (21,6%); `crc32` 114,36 ms (9,2%); `Inflate.c` 94,89 ms (7,7%); `JSON.parse` 28,32 ms (2,3%) |
| 30 MiB, 2 | 593,8 ms | 847,05 ms / 429 | `inflt` 181,56 ms (21,4%); `crc32` 105,89 ms (12,5%); `Inflate.c` 45,49 ms (5,4%); `JSON.parse` 26,03 ms (3,1%) |

En el caso exacto al límite, `decompressDeflate` tuvo ~21–30 ms self y ~308–495 ms inclusive; `readZipSelective` tuvo 0–2 ms self y ~420–614 ms inclusive. Esas cifras inclusive incluyen descendientes (por ejemplo, inflater y CRC), no representan costes adicionales. Las rutinas `cbuf` (29–53 ms) y `slc` (21–30 ms) de `fflate` también aparecieron repetidamente, asociadas a bloques y cortes del inflater. La llamada nativa `decode` de V8 fue de ~28–39 ms y el árbol la atribuye a `strFromU8` en `fflate`; `crc32` se atribuye a `readZipSelective`. En el caso mediano, `parseRelationships` y `normalize` tuvieron pocos milisegundos self y `analyze` no tuvo muestras self suficientes para estimar su coste.

La asignación/copia al buffer final de descompresión no aparece como una función con muestras atribuibles en este perfil; no se infiere su coste a partir de `Uint8Array.set` ni de funciones inclusivas. La ruta EOCD/directorio central tampoco aparece como gran coste self. El perfil identifica un hot path concreto en DEFLATE de `fflate` y `crc32`, pero no separa con precisión todo el coste de gestión de buffers: el `timeDeltas` total de captura excedió el intervalo app medido (capturas de límite: 847–1.237 ms vs. 594–852 ms), y los perfiles tienen dispersión de muestreo. Los porcentajes listados son solo respecto de la ventana perfilada completa, con harness/inactividad incluidos. No sumes self e inclusive ni interpretes esas muestras como tiempos de pared exactos. Los valores inclusive ya están agregados desde muestras self de cada nodo hacia sus ancestros; no son mediciones directas ni benchmarks de pared.

La medición sin profiling de Fase 10 permanece como referencia independiente (251,6 ms mediano y 680,6 ms al límite); las corridas nuevas son instrumentadas y no deben reemplazarla. En estas capturas el caso límite siguió produciendo tres tareas largas (máximos observados 416–613 ms). Con dos repeticiones y una ventana CDP contaminada por actividad del harness, la evidencia atribuye muestras self repetidas a `inflt` (181,56–266,89 ms; 21,4–21,6% de la ventana), `crc32` (105,89–114,36 ms; 9,2–12,5%) y `Inflate.c` (45,49–94,89 ms; 5,4–7,7%). Es evidencia de coste muestreado en el hot path, no atribución exacta del tiempo de pared ni base suficiente para seleccionar una optimización segura o estimar ahorro end-to-end. Por eso no se modificó producción. El siguiente experimento mínimo es un perfil controlado por marcadores internos temporales (sin cambiar límites ni resultados) que separe: inflado, ensamblado de chunks, CRC y UTF-8; luego comparar con el mismo ZIP usando una entrada STORE sintética equivalente para aislar DEFLATE. Mantener ese experimento en una fase aparte antes de tocar algoritmos.

### Medición controlada de etapas y compresión ZIP (Fase 12)

Ejecutá `npm run benchmark:importer:stages` con Node.js 24+ y Chromium instalado. El comando inicia el config Playwright aislado y ejecuta dos repeticiones de los escenarios mediano (5.000 seguidores / 4.000 seguidos) y acumulado exacto de 30 MiB. Para cada método primero llama directamente a `importFiles` con un callback diagnóstico local y luego importa el mismo archivo seleccionado desde el diálogo UI sin callback. Son dos importaciones independientes: la primera entrega los tiempos de etapas instrumentadas; la segunda entrega el tiempo de pared del flujo de producto sin instrumentación. El harness Playwright reporta su propio intervalo por separado. No se agregan estos escenarios pesados a `npm test` ni a `npm run test:e2e`.

Los ZIP se generan en memoria a partir de los mismos JSON/registros sintéticos y difieren únicamente en la opción de compresión de las entradas relacionales. En `fflate@0.8.3`, `zipSync(..., { level: 0 })` genera método ZIP 0 (STORE) y `{ level: 6 }` método 8 (DEFLATE); el generador vuelve a leer el campo `method` del Directorio Central y falla si no coincide. Todos los métodos pasan por el mismo lector, límites y CRC32. El benchmark reporta por separado bytes del contenedor, comprimidos relacionales y descomprimidos acumulados. En el caso mediano ambos métodos importan 5.000 seguidores, 4.000 seguidos, 2.500 mutuos y 1.500 no recíprocos. En el caso límite ambos tienen exactamente 31.457.280 bytes descomprimidos y 1 seguidor / 0 seguidos. El ZIP STORE de límite mide 31.457.658 bytes, con exactamente 31.457.280 bytes relacionales almacenados; el tamaño del contenedor no es el presupuesto de datos de entrada.

El callback opcional de `importFiles` / `readZipSelective` solo recibe etiquetas de etapa, duraciones `performance.now()` y contadores numéricos; no usernames, rutas de archivos, bytes ni texto. Sin callback, no se consultan relojes para las nuevas métricas ni se almacena estado global. La instrumentación separa lecturas EOCD/directorio central/cabeceras/datos, el tiempo síncrono total dentro de `Inflate.push`, número de bloques y bytes emitidos, callback de acumulación de bloques, asignación y ensamblado del buffer final, CRC32, decodificación UTF-8, `JSON.parse`, parseo/normalización/deduplicación/orden de relaciones y duración total de `importFiles`. El cálculo final `analyze` se cronometra separadamente en el benchmark de navegador. Los timers `zip-read-*` incluyen solo el `Blob.arrayBuffer()` del rango; escaneo EOCD y análisis/validación CPU de CD/LFH no se miden por separado y quedan incluidos en `import-total`. El callback de recogida de bloques está contenido dentro del tiempo de DEFLATE; no se suman esas medidas. La asignación quedó por debajo de la resolución práctica del timer en estos casos (0–0,1 ms); el perfil CDP previo tampoco aisló esa copia. Para STORE no hay inflater ni buffer final/ensamblado: el lector conserva el mismo buffer leído como salida. La lectura de rangos no es I/O físico de disco.

En Windows, Node.js 24.16.0, Playwright 1.64.0 y Chromium 156.0.8078.4, las dos repeticiones de `npm run benchmark:importer:stages` registraron:

| Escenario / método | ZIP / comprimido / descomprimido | Import instrumentado; etapas seleccionadas | UI sin instrumentación / harness |
|---|---|---|---|
| Mediano DEFLATE (8) | 23.792 / 23.414 / 504.030 B | total 38,6–50,4 ms; DEFLATE 16,2–18,7 ms; ensamblado 0,4 ms; CRC 2,5–2,8 ms; UTF-8 0,6 ms; JSON 6,6–10,4 ms | 190,4–298,4 / 294,2–448,6 ms; tarea larga máxima 114–187 ms |
| Mediano STORE (0) | 504.408 / 504.030 / 504.030 B | total 18,7–23,0 ms; CRC 2,5–2,9 ms; UTF-8 0,0–0,4 ms; JSON 4,8–7,2 ms | 138,3–150,9 / 191,6–261,1 ms; tarea larga máxima 71–82 ms |
| 30 MiB DEFLATE (8) | 31.183 / 30.805 / 31.457.280 B | total 467,0–495,3 ms; DEFLATE 295,9–311,3 ms; 3 bloques / 31.457.280 B emitidos; ensamblado 18,0–18,2 ms; CRC 95,1–97,0 ms; UTF-8 27,8–32,6 ms; JSON 17,3–21,3 ms | 525,2–577,1 / 565,0–635,1 ms; 2 tareas largas, máximo 358–402 ms |
| 30 MiB STORE (0) | 31.457.658 / 31.457.280 / 31.457.280 B | total 191,9–192,2 ms; lectura de rangos de datos 38,6–39,5 ms; CRC 98,2–100,5 ms; UTF-8 27,8–29,0 ms; JSON 17,5–17,6 ms | 280,5–283,4 / 360,2–408,9 ms; 2–3 tareas largas, máximo 96–99 ms |

Los tiempos por etapa son mediciones instrumentadas de pared dentro de Chromium; el `import-total` es su propio intervalo y no debe compararse/sumarse como si todas las submediciones fueran no superpuestas. Las filas UI están en otra importación, sin callback ni CDP, y van desde el click real hasta la mutación que presenta éxito; el cronómetro de harness Playwright incluye esperas y round-trips adicionales. Ambas variantes produjeron los conteos esperados. En la ejecución completa `npm run benchmark:importer:browser`, el JSON de 30 MiB + 1 byte siguió mostrando error controlado sin dashboard parcial y la siguiente importación válida se completó. El detector de red del benchmark no observó orígenes externos y las aserciones de consola/página pasaron. Los reportes contienen solo nombres sintéticos de escenarios, tamaños, duraciones y conteos.

**Interpretación y límites:** la medición localiza un coste síncrono importante en DEFLATE (`296–311 ms`) y un coste CRC independiente del método (`95–101 ms`); concuerda con los perfiles CDP de Fase 11 (`inflt` y `crc32`), pero ahora la duración de pared se obtiene mediante instrumentación interna. Para este JSON de límite extremadamente compresible, STORE elimina el inflado pero hace leer ~30 MiB en vez de ~30 KB comprimidos; por ello la diferencia observada no predice el comportamiento de exportaciones reales. El ensamblado sí quedó medido por separado (18 ms en los 3 bloques DEFLATE); la recogida de bloques reportó 0 ms y la asignación 0,0–0,1 ms a la resolución práctica del timer. CRC permanece alrededor de 100 ms incluso con STORE. UTF-8 y JSON suman decenas de milisegundos; el parser/álgebra de relaciones y `analyze` son pequeños porque el payload de límite contiene un único usuario y padding JSON, no millones de registros. El tiempo restante entre la importación interna aislada y el resultado UI no se atribuye por resta, porque son ejecuciones separadas con scheduling distinto; el intervalo UI también contiene estado React y actualización/render del dashboard.

No se cambió el algoritmo de producción, sus límites, la extracción selectiva ni la verificación CRC. Las mediciones tienen dos repeticiones en una máquina, `performance.now()` resolución/práctica variable y sobrecarga de callback solo en la corrida instrumentada; no son garantías ni umbrales. Una siguiente fase que considere optimizar debería primero repetir con JSON sintético de cardinalidad alta y distribución de texto menos compresible, en más de un navegador/dispositivo, midiendo memoria de proceso/browser por separado; después validar cualquier cambio contra límites, CRC, casos STORE/DEFLATE y los perfiles previos. No se retienen perfiles crudos, fixtures persistentes ni exportaciones reales.

### Línea de base de relaciones JSON realistas de alta cardinalidad (Fase 13)

Ejecutá `npm run benchmark:importer:realistic` desde la raíz con Node.js 24+ y Chromium instalado. El config de Playwright y el servidor Vinext son los mismos que en otros benchmarks de navegador; el comando está fuera de `npm test`, `npm run test:e2e` y CI. Cada ejecución realiza dos repeticiones del test, que recorre tres escalas y genera variantes DEFLATE y STORE. La primera escala mediana sirve como referencia y calentamiento del runtime; se conservan sus medidas en la salida y no se presenta como una corrida descartada.

Los fixtures se generan en memoria con usernames deterministas con prefijos sintéticos, timestamps numéricos variables y el esquema oficial plano de `followers_1.json` y envuelto de `following.json`. Todos los registros tienen estructura JSON completa (incluye `title`, `string_list_data`, `href`, `value` y `timestamp`); no se agrega whitespace para aumentar el tamaño. Cada variante de compresión serializa el mismo contenido. Antes de importar, se comprueban JSON y esquema, conteos, método real desde el directorio central y límites comprimidos/descomprimidos por entrada y acumulados. Durante la ejecución se afirma que los conteos de followers, following, mutuals y no recíprocos coinciden tanto en el resultado de `importFiles` como en el dashboard.

| Escala | Conteos sintéticos esperados | Datos relacionales descomprimidos | Método/tamaño de entrada |
|---|---|---:|---|
| Mediana de referencia | 5.000 seguidores / 4.000 seguidos / 2.500 mutuos / 1.500 no recíprocos | 1.377.030 B | DEFLATE 8 y STORE 0 verificados en directorio central |
| Alta cardinalidad | 30.000 seguidores / 24.000 seguidos / 15.000 mutuos / 9.000 no recíprocos | 8.262.030 B | DEFLATE 8 y STORE 0 verificados en directorio central |
| Máxima práctica cercana al límite | 114.000 seguidores / 90.000 seguidos / 56.250 mutuos / 33.750 no recíprocos | 31.200.030 B (29,75 MiB) | STORE queda 257.250 B bajo el presupuesto comprimido de 30 MiB |

Cada línea JSON de salida incluye tamaños del ZIP completo, bytes comprimidos y descomprimidos acumulados y por entrada, ratio comprimido/descomprimido, método confirmado, versión Node/Chromium, conteos esperados/reales, duración Chromium y Playwright, etapas instrumentadas, tareas largas y memoria JS si `performance.memory` está disponible. La importación diagnóstica con callback y el flujo UI medido sin callback son importaciones distintas; los resultados instrumentados no se mezclan con los de pared sin instrumentación. Los reportes incluyen solo métricas técnicas y conteos, nunca los usernames ni el texto relacional. El detector de solicitudes solo permite el origen local de la app y la prueba falla ante errores de consola/página o tráfico externo.

En Windows con Node.js 24.16.0, Playwright 1.64.0 y Chromium 156.0.8078.4, las dos repeticiones registraron estos tamaños (en la columna comprimida y ZIP: corrida 1 / corrida 2; en cada variante las repeticiones fueron idénticas):

| Escala | ZIP DEFLATE / STORE (B) | Comprimido relevante DEFLATE / STORE (B) | Descomprimido por entrada (followers / following, B) | Ratio comprimido/descomprimido DEFLATE / STORE |
|---|---:|---:|---:|---:|
| Mediana | 119.931 / 1.377.408 | 119.553 / 1.377.030 | 725.001 / 652.029 | 0,0868 / 1 |
| Alta cardinalidad | 715.651 / 8.262.408 | 715.273 / 8.262.030 | 4.350.001 / 3.912.029 | 0,0866 / 1 |
| Máxima práctica | 2.699.378 / 31.200.408 | 2.699.000 / 31.200.030 | 16.530.001 / 14.670.029 | 0,0865 / 1 |

Resultados individuales en milisegundos; los pares separados por `/` son corrida 1 / corrida 2. Las etapas instrumentadas se ejecutan en una importación diagnóstica independiente; `UI Chromium / harness` corresponde a una segunda importación real sin callback diagnóstico. `DEFLATE` es el tiempo síncrono de inflater (no aplica a STORE), `JSON` es el tiempo agregado de parseo JSON y `relaciones` es parseo/normalización/deduplicación/ordenación:

| Escala / método | Import-total instrumentado | DEFLATE | CRC32 | JSON | Relaciones | `analyze` aparte | UI Chromium / harness | Tareas largas (cantidad; máxima) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Mediana / DEFLATE | 84,6 / 79,2 | 44,0 / 47,6 | 4,9 / 4,8 | 4,9 / 4,5 | 17,9 / 8,7 | 2,4 / 1,8 | 204,7 / 210,2 · 334,83 / 339,35 | 1 / 1; 122 / 126 |
| Mediana / STORE | 29,3 / 31,4 | — | 6,2 / 5,6 | 5,6 / 6,7 | 5,6 / 7,4 | 1,9 / 2,0 | 149,8 / 147,2 · 245,91 / 245,49 | 1 / 1; 68 / 74 |
| Alta cardinalidad / DEFLATE | 250,8 / 298,1 | 136,6 / 142,7 | 25,3 / 27,5 | 28,5 / 47,8 | 30,4 / 33,1 | 12,9 / 13,7 | 328,7 / 352,0 · 426,47 / 443,86 | 3 / 3; 142 / 158 |
| Alta cardinalidad / STORE | 115,4 / 117,0 | — | 25,6 / 26,0 | 28,7 / 29,3 | 28,0 / 30,0 | 11,2 / 9,8 | 251,8 / 283,6 · 383,44 / 409,53 | 2 / 2; 86 / 105 |
| Máxima práctica / DEFLATE | 871,6 / 859,9 | 421,0 / 374,2 | 94,4 / 95,5 | 130,6 / 126,7 | 120,9 / 148,4 | 62,7 / 75,4 | 1.074,5 / 1.056,5 · 1.123,89 / 1.103,89 | 3 / 3; 609 / 573 |
| Máxima práctica / STORE | 466,9 / 474,8 | — | 94,4 / 94,4 | 125,0 / 126,1 | 146,5 / 152,2 | 51,0 / 49,2 | 712,8 / 708,0 · 791,32 / 845,50 | 3 / 3; 414 / 378 |

Las seis combinaciones entregaron los conteos esperados tanto en `importFiles` como en el dashboard. DEFLATE near-limit emitió 166 bloques y 31.200.030 bytes en ambas corridas; los escenarios mediano y alto emitieron 8 y 45 bloques, respectivamente. En las lecturas de memoria disponibles, `performance.memory` mostró 39,6 MB antes/después en la primera repetición y 42,1 MB en la segunda; son snapshots aproximados del heap JS, no picos ni memoria del proceso. El benchmark registró cero errores de consola/página y cero solicitudes externas.

**Interpretación y límites:** los fixtures realistas no tienen relleno, pero siguen siendo muy compresibles por el esquema JSON compartido y los prefijos deterministas: DEFLATE produjo alrededor del 8,65% del tamaño descomprimido. En el caso near-limit, STORE redujo el tiempo UI observado frente a DEFLATE en estas corridas, mientras que el tiempo instrumentado de inflater fue 374–421 ms; ambos métodos mantuvieron CRC en ~94–96 ms y el parseo JSON en ~125–131 ms. La normalización/ordenación también creció hasta ~121–152 ms. Esto confirma que al aumentar relaciones dejan de ser despreciables el parseo y el trabajo de conjuntos, pero no permite extrapolar la diferencia STORE/DEFLATE a exportaciones reales. La interfaz no tiene un timer independiente para el trabajo React/render; no se atribuye el remanente por resta entre importaciones distintas. El perfil de CPU tampoco mide memoria transitoria.

El fixture near-limit se dimensiona desde registros completos, no whitespace, y queda 257.250 B por debajo de los presupuestos comprimido y descomprimido de 30 MiB. El test de 30 MiB exactos formado con un registro y whitespace sigue existiendo como estrés artificial, altamente compresible y diferenciado. El conteo grande crea muchas instancias/strings en `JSON.parse`, normalización y análisis en el heap del navegador; lectura ZIP selectiva no implica memoria constante. No hay umbrales rígidos y dos repeticiones en una sola configuración Chromium no son garantías ni permiten extrapolar a exportaciones reales. El siguiente experimento debería cambiar por separado la distribución/compresibilidad manteniendo idénticos registros y cardinalidad, y perfilar el intervalo UI con marcadores internos de React/estado antes de decidir una optimización o un Worker; no se cambió producción.

### Evaluación controlada de una hipótesis de optimización (Fase 14)

#### Puerta de entrada y diagnóstico

La puerta de entrada se volvió a comprobar antes de implementar el prototipo: el benchmark de Fase 13 existe en `tests/perf/import-browser.benchmark.ts`, su comando `npm run benchmark:importer:realistic` se ejecutó en Chromium y terminó con 2/2 pasadas. Verificó en ambas repeticiones los conteos en `importFiles` y el dashboard, los métodos ZIP 8/0, límites y tamaños: 1.377.030 B para 5.000/4.000 relaciones; 8.262.030 B para 30.000/24.000; y 31.200.030 B para 114.000/90.000. El máximo mide 29,75 MiB, con variante STORE a 31.200.030 B, aún 257.250 B por debajo del límite comprimido. Los resultados y métricas de Fase 13 están preservados arriba.

El siguiente diagnóstico combina esas mediciones repetidas con el perfil CDP de Fase 11. Los tiempos de pared por etapa vienen del callback interno de la Fase 12/13; el `import-total` es otro intervalo y no debe construirse sumando etapas. UI y parser instrumentado son ejecuciones distintas. Las muestras CDP self son tiempo de CPU muestreado y sus filas inclusivas incluyen descendientes; no se suman entre sí. El “porcentaje” solo aproxima la proporción dentro del `import-total` de la misma corrida, no es un desglose exacto del tiempo total.

| Etapa | Evidencia observada en Chromium | Impacto / hilo principal | Memoria y relevancia | Confianza |
|---|---|---|---|---|
| DEFLATE (`inflt` / `Inflate.push`) | Fase 13 near-limit: `deflate-sync` 374–421 ms en las repeticiones, con 166 bloques; mediano ~44–48 ms; 30.000/24.000 ~127–143 ms. CDP Fase 11: `inflt` self 181,56–266,89 ms en el stress de 30 MiB. | Near-limit, ~43–48% del total instrumentado de 830–893 ms; la suma incluye callback de bloques, que es submedición solapada. | Mismo JSON sintético, pero DEFLATE comprime a ~8,65%; el stress de 30 MiB de Fase 12 es aún más artificial. | Alta para coste en Chromium sintético; baja para exportaciones reales. |
| CRC32 | ~90–101 ms near-limit, ~94–101 ms en STORE/DEFLATE; ~24–27 ms a 8,26 MB. CDP Fase 11: self 105,89–114,36 ms en su fixture de padding. | ~10–12% del import instrumentado near-limit; aparece con ambos métodos ZIP. | Opera sobre los bytes JSON completamente descomprimidos; snapshots del heap no revelan picos. | Alta para coste y repetición en estos fixtures. |
| JSON UTF-8 y `JSON.parse` | Near-limit: decodificación ~25–33 ms y parsing ~108–153 ms; alta cardinalidad: parseo ~28–48 ms. | Parsing near-limit ~13–18% del import-total; es una etapa síncrona del hilo principal. | JSON válido oficial sintético, sin padding; muchas propiedades/cadenas, pero el contenido sigue siendo repetitivo y altamente compresible. | Alta para este fixture, media para extrapolar. |
| Normalización/deduplicación/orden por lista + set agregado | Fase 13 near-limit: 96–152 ms, más ordenación final ~5–6 ms; 30.000/24.000: ~28–41 ms; mediano ~5–18 ms. | Near-limit, aproximadamente 11–18% del import-total (sin añadir la ordenación final como doble conteo); etapa objetivo elegida para prototipo. | 204.000 filas procesadas, 114.000 seguidores y 90.000 seguidos; escala sintética relevante para presión por cardinalidad, no prueba de una exportación real. | Alta para costo en la carga generada. |
| Ensamblado DEFLATE / asignación final | Near-limit, ensamblado ~18–23 ms; asignación ≤0,1 ms a resolución del timer; mediano <2 ms y alta ~5–9 ms. | Cerca de 2–3% del import-total near-limit; la asignación es demasiado breve para una conclusión fina. | La medición no es perfil de asignaciones ni captura de pico. | Media para ensamblado; baja para asignación. |
| EOCD/directorio central y lectura de rangos | CDP no encontró tiempo self notable en recorrido EOCD/CD; los rangos de contenido near-limit comprimido rondaron ~8–10 ms por el agregado medido. | No aparece como candidato principal frente a DEFLATE, CRC, parsing y relaciones. | `File.slice()` no equivale a medir I/O físico. Se siguieron leyendo solo entradas relacionales. | Media en Chromium y ZIP sintéticos. |
| React/dashboard y tareas largas | UI near-limit de Fase 13: ~1.027–1.091 ms DEFLATE y ~672–713 ms STORE; máximo de tarea larga observado en el rango ~378–644 ms; 2–3 tareas según corrida. | La UI mide importación hasta observar el resultado, no una etapa React separada. El excedente no se atribuye restando tiempos de otras ejecuciones. | Heap `performance.memory` informó 39,6–42,1 MB antes/después en las corridas reportadas, no el máximo ni memoria de proceso. | Alta para las pausas observadas en Chromium local; baja para separar React/GC. |

**Hipótesis única:** el actual `parseRelationships` crea un `Set`, lo convierte en una lista ordenada y el importador vuelve a insertar esa lista en otro `Set` para finalmente ordenarla otra vez. Evitar el `Set`/sort intermedio por cada archivo y escribir las normalizaciones directamente al set agregado podría reducir el trabajo de la etapa de relaciones con cardinalidad alta. El riesgo principal es duplicar lógica de compatibilidad (`value`, `title`, URL, validación de filas y deduplicación), introducir divergencias de resultados o aumentar el tiempo/retención de memoria. La hipótesis se consideraría respaldada solo con salidas idénticas exactas, mejora de tiempo total consistente en las tres escalas, mejora en la etapa objetivo sin perjuicio claro en medianas, y sin nuevas tareas largas ni errores. Puede empeorar cuando listas pequeñas o duplicados hacen que una única estructura global sea menos eficiente, o si normalización directa impone más trabajo que ordenar conjuntos por archivo.

#### Prototipo aislado y procedimiento

Ejecutá `npm run benchmark:importer:optimization` con Chromium instalado. El test realiza un calentamiento no reportado de cada variante y tres mediciones por variante/escala. Cada par consume exactamente el mismo `File` ZIP DEFLATE sintético ya construido fuera de los intervalos cronometrados. La variante actual llama `importFiles` con diagnósticos; el prototipo benchmark-only comparte `readZipSelective`, sus límites comprimidos/descomprimidos, validaciones estructurales y CRC32, así como `strFromU8` y `JSON.parse`, pero agrega los usernames directamente a un set por tipo y hace una ordenación final. No se importa desde `app/`, no se usa en el diálogo ni se expone como funcionalidad. Compara ambos arrays ya ordenados elemento por elemento y valida los conteos esperados. La prueba comprueba también tráfico externo y errores de consola/página. Esta ruta experimental cubre únicamente los ZIP JSON válidos de los generadores controlados; los rechazos de entradas inválidas siguen cubiertos por el importador real, las pruebas unitarias y E2E.

Las duraciones reportadas son de pared dentro de Chromium con instrumentación de etapa habilitada por igual; no incluyen generar los fixtures. Cada variante se ejecuta 3 veces tras calentamiento por escala. “Tareas largas” cuenta entradas `longtask` observadas cuyo inicio cae dentro de la ventana de importación; `—` indicaría que la API no estaba disponible (en estas corridas sí lo estuvo). La fila de memoria es un snapshot `performance.memory` opcional, no memoria pico.

En Windows con Node.js 24.16.0, Playwright 1.64.0 y Chromium 156.0.8078.4, la primera ejecución válida registró:

| Escala / variante | Import total individual (ms; tres corridas) | Etapa de relaciones (ms; mediana) | JSON (ms; mediana) | DEFLATE / CRC32 (ms; mediana) | Tareas largas (corridas; máxima por corrida ms) |
|---|---:|---:|---:|---:|---:|
| Mediana actual | 70,4 / 34,0 / 35,0 | 4,0 | 4,8 | 13,5 / 4,1 | 0 / 0 / 0; 0 / 0 / 0 |
| Mediana prototipo | 44,4 / 37,8 / 33,9 | 3,5 | 4,9 | 15,3 / 4,1 | 0 / 0 / 0; 0 / 0 / 0 |
| Alta cardinalidad actual | 198,5 / 206,0 / 190,5 | 24,8 | 29,2 | 88,7 / 24,2 | 2 / 2 / 2; 131 / 129 / 122 |
| Alta cardinalidad prototipo | 199,2 / 192,5 / 189,4 | 24,1 | 29,1 | 90,1 / 23,8 | 2 / 2 / 2; 131 / 124 / 120 |
| Near-limit actual | 769,2 / 728,5 / 726,8 | 96,1 | 112,1 | 345,3 / 90,4 | 2 / 2 / 2; 526 / 484 / 483 |
| Near-limit prototipo | 738,2 / 731,8 / 754,8 | 99,3 | 137,6 | 343,0 / 90,5 | 2 / 2 / 2; 497 / 498 / 503 |

Los conteos reales fueron idénticos a los esperados en todas las corridas: mediano 5.000/4.000/2.500 mutuos, alta 30.000/24.000/15.000, near-limit 114.000/90.000/56.250; no recíprocos respectivos 1.500, 9.000 y 33.750. Los bytes comprimidos/descomprimidos fueron 119.553/1.377.030, 715.273/8.262.030 y 2.699.000/31.200.030. La tarea larga mayor por escenario fue prácticamente igual entre variantes: mediano ninguna, alta 120–131 ms y near-limit 483–526 ms. `performance.memory` informó 42,1 MB antes y después de cada trial en esta corrida; no mide transitorios ni RSS. No hubo errores de consola/página ni solicitudes externas.

**Decisión: B. Resultado inconcluso; hipótesis no respaldada para integrar.** Las medianas de import total fueron 35,0 ms actual vs. 37,8 ms prototipo en el escenario mediano, 198,5 vs. 192,5 ms en alta cardinalidad y 728,5 vs. 738,2 ms near-limit. Los rangos se solapan ampliamente y la variante directa empeoró el near-limit por mediana; la etapa objetivo no se redujo near-limit (96,1 vs. 99,3 ms) y JSON varió entre repeticiones, probablemente por scheduling/GC. Aun con arrays exactamente equivalentes y protecciones del ZIP compartidas, no hay mejora consistente, reducción observable de tareas largas ni beneficio que justifique duplicar el parser. El benchmark no demuestra regresiones funcionales, pero el resultado no satisface el criterio A. Se descarta integrar este prototipo y no se modificó la ruta productiva, límites ni CRC32.

La siguiente hipótesis mejor apoyada por evidencia es una alternativa aislada de CRC32: su tiempo near-limit (~90–101 ms) es repetible con ambos métodos de compresión. El experimento siguiente podría comparar un kernel CRC alternativo contra vectores conocidos y los mismos buffers descomprimidos, y medir memoria/costo de tablas; no debe alterar todavía la verificación de integridad de producción. Un Worker respondería a latencia perceptible del hilo principal, no necesariamente al tiempo total, y requeriría medir transferencia/inicialización/memoria aparte.

#### Verificación ejecutada

- `npm run benchmark:importer:optimization`: 1/1 test Playwright pasó; tres mediciones por variante en cada una de las tres escalas, con salidas y conteos idénticos. Solo se usaron ZIP y nombres sintéticos; el benchmark no reportó errores de consola/página ni tráfico externo.
- `npm test`: 34/34 pruebas pasaron. `npm run test:e2e`: 4/4 pruebas pasaron. `npm run typecheck`: pasó.
- `npm run build`: pasó; Vinext mostró avisos existentes sobre el import JSON en `vite.config.ts` y clasificación estática de rutas.
- `npx oxlint tests/perf/import-browser.benchmark.ts`: pasó sin hallazgos. `npm run lint` completo sigue fallando por hallazgos preexistentes documentados en la sección 4; no se encontraron hallazgos en el benchmark al ejecutarlo de forma aislada.
- `git diff --check`: pasó.

### Benchmark aislado de alternativas CRC32 (Fase 15)

#### Metodología y límites del experimento

Ejecutá `npm run benchmark:importer:crc32` con Chromium instalado. El comando selecciona únicamente la prueba de benchmark en `tests/perf/import-browser.benchmark.ts`; no está agregado a `npm test`, `npm run test:e2e` ni CI. Reutiliza el generador determinista de JSON relacional de la Fase 13 (mediano 5.000/4.000, alta cardinalidad 30.000/24.000, near-limit 114.000/90.000 seguidores/seguidos), crea ZIP DEFLATE sintéticos y extrae las mismas entradas mediante `readZipSelective` antes de iniciar los cronómetros. La extracción valida el CRC productivo contra el directorio central; el benchmark vuelve a contrastar cada implementación con el CRC central y con la implementación productiva.

El candidato slicing-by-8 está aislado en `tests/perf/crc32-slicing-by-8.ts`, no lo importa `app/` y no cambia `lib/zip.ts`. Usa ocho tablas de 256 entradas precalculadas al cargar el módulo. Se verifican, antes de medir, el vector vacío, `123456789` (`0xCBF43926`), los 256 valores de byte, un JSON compacto, ocho buffers deterministas con `byteOffset` 3 y todos los residuos posibles módulo ocho, además de cada entrada realista extraída. Cada variante se calienta por buffer; luego se miden cinco pasadas intercaladas en orden alternante. El resultado de cada pasada se compara con el CRC esperado y se incorpora a un acumulador para mantener observable el cálculo. Se informa el tiempo individual, la mediana, el rango, el tamaño y los ns/byte. La inicialización de las ocho tablas candidatas se mide durante evaluación del módulo; el tiempo de inicialización de la tabla productiva se encuentra embebido en la carga de `lib/zip.ts` y no se aísla sin alterar producción.

#### Resultados realmente medidos

En Windows, Node.js 24.16.0, Playwright 1.64.0 y Chromium 156.0.8078.4, la corrida final registró inicialización de tablas candidatas en 1,0 ms y 8.192 B de tablas, frente a 1.024 B en la tabla productiva (7.168 B adicionales). Cada resultado coincidió con el CRC del directorio central ZIP. Las columnas de corridas y rango son milisegundos; cada variante tiene cinco corridas:

| Escala / entrada | Bytes | CRC esperado | Producción (corridas; mediana; rango) | Slicing-by-8 (corridas; mediana; rango) |
|---|---:|---|---|---|
| Mediana `followers_1.json` | 725.001 | `0xA1891907` | 2,3 / 2,2 / 2,1 / 2,1 / 2,2; **2,2**; 0,2 | 2,1 / 2,2 / 4,0 / 2,2 / 2,4; **2,2**; 1,9 |
| Mediana `following.json` | 652.029 | `0xBAC9B290` | 2,3 / 2,0 / 1,9 / 2,4 / 2,0; **2,0**; 0,5 | 1,9 / 2,2 / 2,1 / 3,7 / 2,2; **2,2**; 1,8 |
| Alta `followers_1.json` | 4.350.001 | `0xF859C84D` | 13,6 / 12,8 / 12,6 / 12,6 / 13,0; **12,8**; 1,0 | 15,4 / 13,3 / 15,0 / 13,0 / 13,1; **13,3**; 2,4 |
| Alta `following.json` | 3.912.029 | `0x8FB26261` | 11,8 / 12,4 / 11,4 / 11,3 / 11,3; **11,4**; 1,1 | 11,9 / 11,8 / 11,7 / 12,1 / 13,6; **11,9**; 1,9 |
| Near-limit `followers_1.json` | 16.530.001 | `0x386A3D62` | 48,5 / 48,8 / 48,2 / 48,1 / 48,3; **48,3**; 0,7 | 56,3 / 54,2 / 52,4 / 54,0 / 52,8; **54,0**; 3,9 |
| Near-limit `following.json` | 14.670.029 | `0x21A4EB97` | 43,8 / 44,4 / 44,4 / 43,1 / 43,7; **43,8**; 1,3 | 53,1 / 48,1 / 51,9 / 47,9 / 50,2; **50,2**; 5,2 |

En near-limit, los bytes suman 31.200.030 (16.530.001 + 14.670.029). La suma de medianas del kernel fue 92,1 ms para producción y 104,2 ms para slicing-by-8; ambas entradas grandes dieron más tiempo para el candidato. La variación por entrada y orden/JIT fue mayor para el candidato en las cargas grandes. Por byte, las medianas near-limit fueron 2,92–2,99 ns/byte en producción y 3,27–3,42 ns/byte en slicing-by-8. En mediano y alta cardinalidad, los resultados fueron próximos y no favorables al candidato de forma consistente.

La fase previa midió aproximadamente 90–101 ms de etapa CRC32 en el importador near-limit completo; el intervalo incluye solo la implementación productiva. Aplicar el ratio de kernel medido aquí como una **estimación hipotética**, no como integración observada, proyectaría entre 11,82 y 13,27 ms adicionales (ahorro negativo) sobre ese intervalo. El importador no ejecuta slicing-by-8. Las mediciones del kernel no incluyen lectura ZIP, descompresión, asignación, UI ni import total; el costo CRC observado previamente no debe sumarse a los tiempos independientes para inferir un total nuevo.

**Decisión: C. Candidata descartada.** La equivalencia fue verificada, incluidos los checksums centrales de todos los fixtures, pero slicing-by-8 no mejoró consistentemente ni los buffers medianos ni los grandes; en near-limit sus medianas fueron aproximadamente 13% más lentas, agrega 7 KiB de tablas y presenta más variabilidad. No hay sustento para integrar la complejidad de ocho tablas. Se conserva `crc32` como única ruta de validación en producción; no se agregan otros algoritmos sin una hipótesis independiente y evidencia concreta.

La salida de la prueba no incluye JSON ni listas de relaciones, perfiles crudos o datos personales. Se monitorearon errores de consola/página y tráfico de red durante toda la medición; no se observaron errores ni orígenes externos. `npm run benchmark:importer:crc32` pasó 1/1 test y verificó 29 vectores deterministas antes de medir los seis buffers (cinco corridas por variante y buffer). `npm test` pasó 34/34; `npm run test:e2e` pasó 4/4; `npm run typecheck` y `npm run build` pasaron. El linter focalizado en los dos archivos TypeScript pasó; `npm run lint` completo mantiene los hallazgos preexistentes de `components/ui/*`, `app/page.tsx`, `components/import-dialog.tsx`, `hooks/use-mobile.ts`, `lib/relationships.test.ts` y `components/ui/chart.tsx`. `git diff --check` pasó. Limitaciones: una única máquina/configuración Chromium, cinco muestras por buffer, posible ruido de JIT/scheduling, carga de tablas productiva no aislada y fixtures sintéticos compactos; los resultados no constituyen garantías ni extrapolan a todas las exportaciones.

### Evaluación aislada de responsividad con Web Worker (Fase 16)

#### Protocolo y aislamiento

Ejecutá `npm run benchmark:importer:worker` en Node.js 24+ con Chromium instalado. Es un benchmark opt-in, fuera de `npm test`, `npm run test:e2e` y CI. El Worker de `tests/perf/importer.worker.ts` importa el `importFiles` de producción; el test de `tests/perf/import-browser.benchmark.ts` crea el módulo Worker servido localmente por Vite y no lo importa desde `app/`, componentes ni el bundle productivo. No hay un segundo lector ZIP, no se altera producción, no se cambian los topes ni se omite CRC32.

Cada escala se genera una vez con usernames deterministas sintéticos y ZIP DEFLATE en memoria. Se usa el mismo objeto `File` para el importador principal y el Worker; se verifica igualdad exacta de ambas listas ordenadas y `fileCount`, además de los conteos esperados de seguidores, seguidos, mutuos, `notBack` y fans en el análisis. En cada escala se ejecuta un calentamiento y cinco repeticiones útiles de importación principal, Worker ya inicializado y Worker frío (45 observaciones en total). La secuencia de las tres variantes alterna para reducir sesgo de orden. La prueba también verifica un mensaje sin respuesta y su timeout, ZIP inválido, rechazo por salida descomprimida acumulada mayor a 30 MiB sin resultado parcial y una importación válida posterior.

Se registran por corrida el tiempo `importFiles` dentro del contexto correspondiente, round-trip página↔Worker, dispatch síncrono `postMessage`, creación hasta mensaje `ready`, análisis posterior con `analyze`, heap JS disponible, tareas largas y un heartbeat de `setInterval` a 16 ms que informa su mayor intervalo observado durante importación y análisis. El heartbeat es una medición directa de retraso del event loop, no una medida de pintura ni una garantía de fluidez. En Worker frío, `observableMs` comprende creación e importación hasta respuesta; en Worker warm es el round-trip. `postMessageCallMs` mide solo el retorno síncrono de `postMessage`, **no** cuánto tardan structured clone/transferencia y respuesta; ese coste queda incluido en round-trip. Se pasa el `File` por structured clone, no un `ArrayBuffer` completo, y las listas resultantes vuelven clonadas.

#### Resultados de esta corrida

Windows, Node.js 24.16.0, Playwright 1.64.0 y Chromium 156.0.8078.4. Las listas entre corchetes son las cinco corridas útiles, en orden; los milisegundos se redondean a dos decimales. Los ZIP contienen únicamente las dos entradas relacionales y cabeceras, por eso su tamaño total difiere poco de los bytes comprimidos relevantes.

| Escala (ZIP / comprimido / descomprimido) | Relaciones esperadas |
|---|---|
| Mediana: 119.931 / 119.553 / 1.377.030 B | 5.000 seguidores, 4.000 seguidos, 2.500 mutuos, 1.500 `notBack`, 2.500 fans |
| Alta: 715.651 / 715.273 / 8.262.030 B | 30.000 seguidores, 24.000 seguidos, 15.000 mutuos, 9.000 `notBack`, 15.000 fans |
| Máxima práctica near-limit: 2.699.378 / 2.699.000 / 31.200.030 B | 114.000 seguidores, 90.000 seguidos, 56.250 mutuos, 33.750 `notBack`, 57.750 fans |

En las filas siguientes, `import` es `importFiles` interno, `observable` es el round-trip warm o creación-a-respuesta cold, `gap` es el mayor intervalo del heartbeat; `analyze/gap` son las cinco medidas de análisis/análisis-heartbeat. Para importación principal, `observable` coincide con `import`. `ready` solo aplica a Workers fríos.

| Escala / variante | Import interno (ms; 5 corridas) | Observable (ms; 5 corridas) | Gap import (ms; 5 corridas) | `analyze` / gap (ms; 5 corridas) | `ready` frío (ms) |
|---|---|---|---|---|---|
| Mediana / principal | 37,2 / 50,1 / 34,7 / 54,3 / 37,1 | Igual a import | 37,4 / 27,1 / 34,7 / 36,0 / 20,7 | 1,5 / 1,5 / 1,5 / 1,7 / 1,5; gap 16,5 / 17,4 / 17,2 / 16,7 / 17,7 | — |
| Mediana / Worker warm | 36,6 / 34,6 / 35,7 / 33,8 / 35,0 | 37,7 / 35,5 / 36,5 / 34,6 / 36,0 | 17,0 / 17,0 / 17,1 / 17,1 / 17,0 | 2,7 / 5,0 / 2,7 / 2,5 / 2,7; gap 17,0 / 16,6 / 16,8 / 16,4 / 17,2 | — |
| Mediana / Worker cold | 76,9 / 62,5 / 67,6 / 73,2 / 62,2 | 101,5 / 86,9 / 92,0 / 97,1 / 87,6 | 18,1 / 17,0 / 17,9 / 17,1 / 17,1 | 2,4 / 3,0 / 2,5 / 2,6 / 2,4; gap 16,7 / 17,8 / 16,7 / 16,8 / 16,6 | 23,1 / 23,2 / 23,1 / 22,7 / 24,2 |
| Alta / principal | 196,3 / 195,2 / 190,0 / 194,7 / 183,7 | Igual a import | 131,7 / 130,8 / 129,0 / 118,9 / 122,4 | 11,2 / 10,6 / 10,4 / 11,1 / 10,8; gap 17,7 / 16,7 / 16,6 / 17,5 / 17,5 | — |
| Alta / Worker warm | 219,6 / 186,8 / 177,7 / 179,9 / 180,3 | 227,1 / 192,7 / 182,7 / 185,0 / 185,2 | 17,4 / 17,1 / 17,0 / 17,1 / 17,8 | 27,4 / 19,6 / 31,6 / 17,6 / 17,5; gap 27,5 / 19,7 / 31,6 / 17,7 / 17,7 | — |
| Alta / Worker cold | 264,3 / 318,2 / 233,1 / 237,2 / 230,6 | 294,9 / 345,8 / 260,8 / 267,2 / 257,8 | 17,2 / 17,9 / 18,0 / 18,2 / 17,0 | 18,9 / 18,2 / 17,8 / 17,8 / 19,4; gap 19,0 / 18,3 / 17,9 / 17,8 / 19,4 | 23,9 / 21,9 / 21,8 / 24,2 / 21,4 |
| Near-limit / principal | 722,1 / 729,2 / 682,1 / 691,2 / 692,1 | Igual a import | 482,2 / 489,3 / 458,2 / 465,0 / 451,1 | 43,2 / 41,8 / 42,3 / 41,7 / 43,5; gap 43,3 / 41,9 / 42,3 / 41,8 / 43,5 | — |
| Near-limit / Worker warm | 734,1 / 730,3 / 701,3 / 707,5 / 702,8 | 749,7 / 746,0 / 716,9 / 723,4 / 718,5 | 19,6 / 17,5 / 19,4 / 18,1 / 17,8 | 75,1 / 79,9 / 86,9 / 89,1 / 72,2; gap 75,3 / 80,0 / 87,1 / 89,3 / 72,3 | — |
| Near-limit / Worker cold | 850,0 / 844,4 / 819,5 / 836,7 / 821,3 | 905,5 / 885,8 / 859,3 / 881,9 / 863,1 | 20,1 / 17,1 / 20,9 / 17,2 / 21,9 | 69,9 / 74,9 / 69,6 / 73,1 / 88,3; gap 70,1 / 75,1 / 69,8 / 73,2 / 88,4 | 38,5 / 23,8 / 22,2 / 24,5 / 24,3 |

En las tres variantes medianas se observaron 0 tareas largas de importación. En alta y near-limit, la importación principal produjo dos tareas largas en cada una de sus cinco corridas (alta: máximo 117–136 ms; near-limit: 446–481 ms); los Workers warm/cold produjeron 0 durante la importación. `postMessageCallMs` fue 0–0,1 ms y no mide structured clone completo. `performance.memory` informó 56,8 MB antes/después en el contexto principal en las muestras; la API de heap no estuvo disponible en el Worker (`null`). Esas lecturas no son pico, memoria del proceso ni prueba de igualdad de consumo.

La API Long Tasks reportó cero tareas durante cada `analyze`, incluso con heartbeat de hasta 89,3 ms en near-limit; por tanto, el cero no demuestra ausencia de retraso. En este benchmark `analyze` se invoca dentro de `page.evaluate`, no a través del flujo React/DOM de producción, y el intervalo de heartbeat se conserva como métrica separada del event loop. No se midió actualización React del dashboard.

**Decisión: B. Beneficio parcial; mantener el prototipo aislado.** En alta y near-limit, el Worker warm eliminó las tareas largas de importación observadas y redujo el mayor retraso del heartbeat desde 118,9–131,7 ms a 17,0–17,8 ms y desde 451,1–489,3 ms a 17,5–19,6 ms respectivamente. No redujo de forma consistente el tiempo total: en near-limit, mediana `importFiles` principal 692,1 ms frente a 707,5 ms interna en Worker, y 723,4 ms de round-trip warm; la variante fría tuvo 881,9 ms de creación-a-respuesta. Además, el análisis posterior siguió bloqueando el hilo principal (heartbeat 72,3–89,3 ms en Worker warm near-limit) y no se integró con React. Esto prueba una mejora de responsividad de la etapa de importación en estos fixtures sintéticos, no del flujo de UI completo ni de exportaciones reales. El siguiente experimento justificable sería integrar un prototipo end-to-end temporal de importación **y análisis** en Worker bajo una bandera exclusivamente de benchmark, medir actualización/pintura real del dashboard, latencia de interacción, transferencia, heap pico/memoria de proceso y recuperación, preservando ambos caminos y toda la validación; no hay evidencia para integrar ahora.

La salida incluye solamente tamaños, conteos, tiempos y errores controlados; no incluye usernames, JSON, archivos ZIP, perfiles crudos ni datos personales. La prueba monitoreó errores de consola/página y solicitudes externas, y terminó pasando sus aserciones. No se corrió una variante sin instrumentación para cuantificar la sobrecarga del heartbeat/observadores: los tiempos son de las variantes instrumentadas. Otras limitaciones: cinco repeticiones por variante/escala en una sola máquina Chromium, posible variación de JIT/GC/scheduler, heartbeat que no equivale a pintura, sin API de memoria en Worker, sin medir duración total de clonación aisladamente y sin dashboard React. Los resultados son descriptivos, no umbrales ni garantías.

La corrida de Fase 16 pasó `npm run benchmark:importer:worker` (1/1), `npm test` (34/34), `npm run test:e2e` (4/4), `npm run typecheck`, `npm run build`, `npx oxlint tests/perf/importer.worker.ts tests/perf/import-browser.benchmark.ts` y `git diff --check`. El build mostró la advertencia existente sobre importar JSON sin atributos en `vite.config.ts`; la compilación terminó correctamente. `npm run lint` global continúa fallando únicamente en rutas funcionales y pruebas no modificadas con deuda preexistente documentada en la sección 4; no hubo hallazgos en los dos archivos TypeScript del prototipo. GitHub Actions `Importer E2E` pasó para el commit `5716018f9350da5e7398c580434dc0bccb512320` (run `38271216596`, estado `completed`, conclusión `success`). Las verificaciones locales descritas son independientes de esta corrida remota de CI.

### Benchmark end-to-end de Worker hasta el dashboard React (Fase 17)

Ejecutá `npm run benchmark:importer:worker-e2e` con Node.js 24+ y Chromium instalado. Es un diagnóstico opt-in excluido de `npm test`, `npm run test:e2e` y CI rutinaria. El test reutiliza `tests/perf/importer.worker.ts`, `importFiles` y `analyze` productivos; el Worker solo es accesible mediante el puente de prueba que se instala al abrir la aplicación local de desarrollo. No se importa desde el flujo normal de `app/` ni queda habilitado en el build de producción. La variante principal hace importación y análisis en el hilo principal; la variante Worker hace ambas operaciones en el Worker y entrega al mismo `Home` real el snapshot y los grupos calculados. React actualiza y presenta el dashboard normal en ambas variantes.

Por escala se construye una vez un único ZIP DEFLATE sintético con los mismos registros deterministas para las tres variantes: mediana (5.000 seguidores / 4.000 seguidos), alta cardinalidad (30.000 / 24.000) y máxima práctica cercana al presupuesto (114.000 / 90.000). Los bytes de cada ZIP medido son idénticos entre hilo principal, Worker reutilizado y Worker frío; JSON válido sin padding artificial. La primera importación válida tras rechazos sirve de calentamiento del Worker reutilizado y las cinco repeticiones posteriores por variante son las mediciones útiles. Se alterna el orden para reducir sesgo. El test compara arrays de snapshot y grupos ordenados entre variantes, resultados esperados (mutuos, `notBack`, fans), conteos del dashboard y filas visibles reales.

| Escala | ZIP / bytes relacionales descomprimidos | Conteos esperados (seguidores / seguidos / mutuos / `notBack` / fans) |
|---|---:|---|
| Mediana | 119.931 / 1.377.030 B | 5.000 / 4.000 / 2.500 / 1.500 / 2.500 |
| Alta cardinalidad | 715.651 / 8.262.030 B | 30.000 / 24.000 / 15.000 / 9.000 / 15.000 |
| Near-limit realista | 2.699.378 / 31.200.030 B | 114.000 / 90.000 / 56.250 / 33.750 / 57.750 |

Se cronometran por separado `importFiles` dentro del contexto, `analyze` productivo (en hilo principal o Worker), inicio hasta un marcador de `useEffect` en `Home` posterior al commit React que presenta el snapshot y los datos, creación hasta `ready` para Worker frío, round-trip observable y llamada síncrona a `postMessage`. Playwright verifica los selectores, conteos y primeras filas del dashboard real por separado del timer interno. También se registran tareas largas, oportunidades de `requestAnimationFrame`, intervalo máximo entre frames, un click Playwright sobre un probe accesible temporal del harness, y snapshots de `performance.memory` si Chromium los expone. El probe es una acción de entrada automatizada montada temporalmente en el documento real; mide respuesta del browser al click, no una acción de negocio ni un handler de React. El marcador de commit no es una confirmación de pintura física; los frames tampoco prueban por sí solos pintura. El heap son snapshots aproximados, no pico ni memoria del proceso. El tiempo total de harness Node/Playwright se informa aparte y no se usa como medida interna del dashboard.

Los valores `Import interno` de todas las variantes se actualizaron con una repetición en Linux, Node.js 24.21.0, Playwright 1.64.0 y Chromium 156.0.8078.4; análisis, dashboard, interacción y tareas largas conservan la corrida original en Windows, Node.js 24.16.0. La tabla muestra medianas (rango entre cinco repeticiones útiles, ms); long task muestra mediana de duración máxima observada por operación y el rango de esa duración:

| Escala / variante | Import interno | Análisis | Hasta dashboard real | Click Playwright | Duración máxima de tarea larga |
|---|---:|---:|---:|---:|---:|
| Mediana / principal | 79,9 (59,0–109,1) | 2,4 (1,5–5,9) | 180,5 (148,1–196,7) | 180,4 (146,4–229,1) | 66 (57–85) |
| Mediana / Worker warm | 73,1 (64,7–107,3) | 1,8 (1,5–2,4) | 129,4 (111,9–134,0) | 122,5 (117,3–130,4) | 74 (67–78) |
| Mediana / Worker cold | 159,3 (143,2–269,1) | 2,3 (2,1–3,3) | 265,1 (200,7–296,2) | 130,3 (37,9–206,7) | 76 (68–87) |
| Alta / principal | 280,0 (203,2–698,0) | 14,0 (10,1–18,4) | 372,9 (350,3–488,7) | 356,4 (324,6–476,9) | 148 (133–201) |
| Alta / Worker warm | 288,8 (270,6–624,2) | 12,8 (11,8–13,2) | 355,9 (328,1–412,2) | 126,8 (32,2–155,8) | 110 (99–117) |
| Alta / Worker cold | 477,0 (394,4–940,2) | 16,1 (15,0–25,8) | 525,2 (488,6–557,7) | 131,2 (100,4–146,5) | 108 (97–132) |
| Near-limit / principal | 865,5 (789,8–1.020,1) | 58,0 (55,5–110,7) | 1.078,4 (1.062,8–1.276,5) | 1.072,0 (839,7–1.285,5) | 584 (548–669) |
| Near-limit / Worker warm | 864,8 (829,5–1.002,6) | 54,5 (52,2–61,2) | 1.175,9 (1.109,7–1.335,7) | 138,9 (85,7–188,7) | 238 (228–262) |
| Near-limit / Worker cold | 1.215,2 (1.194,8–1.335,7) | 80,7 (60,7–168,5) | 1.466,6 (1.361,4–1.623,2) | 96,9 (88,1–137,6) | 247 (222–322) |

Observaciones individuales en el orden de repetición 1–5; tiempos en ms. `tareas largas` expresa cantidad/duración máxima por repetición; `frames` expresa oportunidades observadas/intervalo máximo entre frames. Las variantes principales no tienen round-trip Worker ni tiempo de inicialización.

| Escala / variante | Import / análisis / round-trip / ready | Dashboard / click / tareas largas / frames |
|---|---|---|
| Mediana / principal | Import: 109,1; 66,7; 80,3; 59,0; 79,9 · análisis: 2,9; 2,4; 5,9; 2,1; 1,5 · round-trip / ready: — | Dashboard: 180,5; 196,7; 196,2; 150,5; 148,1 · click: 229,1; 222,6; 180,4; 180,4; 146,4 · long tasks: 1/57; 1/85; 1/85; 1/66; 1/65 · frames: 4/50,1; 2/82,6; 3/66,7; 2/58,6; 2/54,6 |
| Mediana / Worker warm | Import: 107,3; 82,4; 67,8; 73,1; 64,7 · análisis: 2,4; 1,8; 1,9; 1,7; 1,5 · round-trip: 62,3; 60,2; 56,1; 49,2; 48,0 · ready: — | Dashboard: 134,0; 129,4; 129,7; 117,7; 111,9 · click: 130,4; 122,5; 117,3; 122,8; 119,2 · long tasks: 1/78; 1/74; 1/77; 1/68; 1/67 · frames: 2/66,7; 3/50,0; 3/66,7; 2/49,9; 2/50,0 |
| Mediana / Worker cold | Import: 159,3; 153,2; 143,2; 179,8; 269,1 · análisis: 2,3; 2,1; 2,2; 2,3; 3,3 · round-trip: 91,2; 83,0; 125,8; 124,6; 161,2 · ready: 44,7; 53,1; 68,2; 56,2; 63,9 | Dashboard: 200,7; 208,3; 274,0; 265,1; 296,2 · click: 180,3; 206,7; 112,0; 37,9; 130,3 · long tasks: 1/68; 1/76; 1/85; 1/87; 1/75 · frames: 4/66,7; 4/66,7; 4/66,7; 5/66,7; 3/83,4 |
| Alta / principal | Import: 698,0; 304,1; 280,0; 225,7; 203,2 · análisis: 14,0; 10,1; 14,4; 18,4; 11,1 · round-trip / ready: — | Dashboard: 488,7; 378,3; 371,9; 372,9; 350,3 · click: 476,9; 356,4; 340,7; 363,7; 324,6 · long tasks: 3/201; 3/141; 3/158; 3/148; 3/133 · frames: 5/233,4; 5/116,7; 5/116,6; 6/116,7; 4/116,7 |
| Alta / Worker warm | Import: 624,2; 288,8; 291,5; 270,6; 278,3 · análisis: 13,0; 11,8; 12,5; 13,2; 12,8 · round-trip: 301,0; 249,4; 249,6; 278,4; 232,6 · ready: — | Dashboard: 412,2; 352,1; 355,9; 387,9; 328,1 · click: 155,8; 126,8; 126,3; 149,0; 32,2 · long tasks: 1/114; 1/105; 1/110; 1/117; 1/99 · frames: 6/116,3; 5/82,8; 7/66,8; 6/91,6; 6/74,1 |
| Alta / Worker cold | Import: 940,2; 479,7; 394,4; 477,0; 433,9 · análisis: 18,9; 15,8; 16,1; 25,8; 15,0 · round-trip: 369,3; 347,0; 397,9; 348,8; 344,5 · ready: 65,3; 53,1; 55,2; 51,8; 48,6 | Dashboard: 545,7; 494,3; 557,7; 525,2; 488,6 · click: 109,9; 131,2; 100,4; 146,5; 135,1 · long tasks: 1/114; 1/97; 1/108; 1/132; 1/98 · frames: 7/100,6; 7/87,5; 10/66,7; 8/89,0; 8/66,7 |
| Near-limit / principal | Import: 1.020,1; 865,5; 789,8; 848,1; 885,1 · análisis: 56,0; 58,0; 55,5; 110,7; 59,4 · round-trip / ready: — | Dashboard: 1.276,5; 1.071,9; 1.062,8; 1.189,5; 1.078,4 · click: 1.285,5; 1.054,0; 839,7; 1.178,2; 1.072,0 · long tasks: 3/669; 3/599; 3/548; 3/584; 3/580 · frames: 5/650,0; 4/600,1; 5/566,6; 5/550,1; 4/583,4 |
| Near-limit / Worker warm | Import: 1.002,6; 829,5; 862,5; 923,6; 864,8 · análisis: 52,2; 61,2; 54,5; 52,8; 55,0 · round-trip: 951,4; 1.077,4; 927,8; 886,5; 976,0 · ready: — | Dashboard: 1.175,9; 1.335,7; 1.162,5; 1.109,7; 1.212,5 · click: 138,9; 85,7; 179,4; 129,4; 188,7 · long tasks: 1/229; 1/262; 1/238; 1/228; 2/240 · frames: 18/203,9; 18/261,4; 17/227,5; 17/233,4; 17/221,8 |
| Near-limit / Worker cold | Import: 1.335,7; 1.207,2; 1.244,6; 1.194,8; 1.215,2 · análisis: 80,7; 84,1; 168,5; 67,2; 60,7 · round-trip: 1.192,5; 1.184,7; 1.310,3; 1.122,1; 1.065,8 · ready: 52,1; 59,5; 55,9; 53,3; 51,4 | Dashboard: 1.466,6; 1.535,9; 1.623,2; 1.394,7; 1.361,4 · click: 88,1; 95,5; 108,5; 96,9; 137,6 · long tasks: 1/225; 1/322; 1/260; 1/222; 1/247 · frames: 24/164,8; 22/245,5; 22/246,8; 22/216,7; 22/216,7 |

`workerReadyMs` para Workers fríos fue mediana/rango 56,2 (44,7–68,2) ms, 53,1 (48,6–65,3) ms y 53,3 (51,4–59,5) ms en mediana, alta y near-limit. El round-trip warm fue 56,1 (48,0–62,3), 249,6 (232,6–301,0) y 951,4 (886,5–1.077,4) ms; el round-trip cold, medido después de que el Worker indica `ready`, fue 124,6 (83,0–161,2), 348,8 (344,5–397,9) y 1.184,7 (1.065,8–1.310,3) ms. `workerReadyMs` mide por separado la inicialización; el tiempo hasta el commit del dashboard sí la incluye. El tiempo síncrono de `postMessage` fue 0–0,2 ms y no mide aisladamente structured clone; el resto de comunicación está dentro del round-trip. La mediana near-limit de tareas largas fue 3 (hilo principal), 1 (Worker warm) y 1 (cold); las oportunidades de frame medianas fueron 5, 17 y 22, con intervalo máximo 583,4, 227,5 y 216,7 ms respectivamente. Por tanto, el Worker reduce el bloqueo máximo observado, pero no lo elimina; el renderizado del resultado aún genera tareas largas.

El test también rechazó ZIP inválido y ZIP que supera en un byte el límite descomprimido, sin dashboard ni resultado parcial; una importación válida posterior funcionó, y los seis Workers (cinco fríos más el reutilizado) terminaron. Las salidas contienen solo tamaños, métricas, nombres de escenario y conteos sintéticos; no se imprimen usernames ni arrays. Los detectores compartidos de consola, errores de página y solicitudes HTTP/WebSocket a orígenes externos pasaron sin hallazgos.

La API opcional `performance.memory` informó 37,3 MB antes y después de las operaciones en estos snapshots; es heap JS aproximado del contexto principal, no memoria máxima ni del proceso. El harness reinicia el estado React de cada resultado entre muestras para evitar acumular snapshots previos; retiene en memoria solo la primera referencia necesaria para comparar arrays durante esa escala.

**Decisión: B. Beneficio parcial; mantener el experimento aislado.** En alta y near-limit, el click respondió mucho antes con Worker reutilizado y la duración máxima mediana de long task fue menor; near-limit, sin embargo, el commit del dashboard llegó en mediana 1.176 ms con Worker warm frente a 1.078 ms en principal. El Worker frío añade ~53 ms de inicialización en estas escalas, además del coste de análisis/round-trip. Persisten tareas largas en la interfaz y la medición del probe no representa una acción de negocio. No se demuestra mejora end-to-end del tiempo de presentación ni fluidez completa, por lo que no se recomienda integrar el Worker en producción. Una continuación justificable debería aislar el render React y su volumen visual como experimento independiente, conservando la medición directa de interacción y datos sintéticos.

La corrida final `npm run benchmark:importer:worker-e2e` pasó 1/1 en 1,6 minutos; reportó 48 observaciones en total (cinco repeticiones por variante y escala, más un calentamiento/recuperación por escala). La prueba no es parte de CI ni umbral automatizado. Una sola máquina Chromium, cinco repeticiones, carga de render completa y APIs aproximadas de long tasks/heap introducen variación; los intervalos no son garantías ni extrapolaciones a exportaciones reales.

### Diagnóstico de renderizado del dashboard (Fase 18)

#### Diseño y límites de la medición

Ejecutá `npm run benchmark:importer:render` con Chromium instalado. Es un diagnóstico optativo, separado de `npm test`, `npm run test:e2e` y CI. Amplía el harness Playwright de Fase 17 y conserva sus ZIP sintéticos realistas: 5.000/4.000, 30.000/24.000 y 114.000/90.000 seguidores/seguidos. Las variantes principal, Worker reutilizado y Worker frío reciben los mismos bytes por escala; hay cinco repeticiones medidas por variante. El orden alterna entre `main-thread → worker-warm → worker-cold` y el orden inverso. Antes de medir se comprueban el rechazo de ZIP inválido y excesivo sin resultado parcial, una importación válida de recuperación y la terminación de los Workers.

Los conteos esperados por escenario fueron, respectivamente, seguidores/seguidos/mutuos/no recíprocos/fans: `5.000/4.000/2.500/1.500/2.500`, `30.000/24.000/15.000/9.000/15.000` y `114.000/90.000/56.250/33.750/57.750`. Cada repetición verificó equivalencia del dashboard y sus filas visibles. La instrumentación React se activa solamente con el puente explícito del harness de desarrollo; perfila las regiones `relationship-summary`, `relationship-insights` y `relationship-list`, y mide el filtro derivado sobre toda la lista antes de paginar 12 filas. No se amplió el dashboard completo con un Profiler: los perfiles son de esos subárboles, no de todo `Home`.

Se distinguen estos relojes:

- `importMs` es la importación interna; `analysisMs` es la llamada medida a `analyze`. `resultReceivedMs` señala el retorno de la importación en la variante principal y la respuesta del Worker en las variantes Worker. El análisis Worker forma parte de esa respuesta; sus fases internas siguen medidas separadamente.
- `dashboardMs` termina en el `useEffect` que registra snapshot y datos correctos. `stateUpdateEnqueueToEffectMs` mide desde que se encolaron las actualizaciones hasta ese marcador; no es una duración pura de React ni una medida de pintura. El timestamp de `React.Profiler` informa inicio, commit, `actualDuration` y `baseDuration` para los tres subárboles.
- Se registran dos callbacks anidados de `requestAnimationFrame` como oportunidades de frame, y los frames/max gap observados por el probe auxiliar. Ninguno certifica que los píxeles hayan sido presentados físicamente.
- La interacción real abre el selector de relaciones, mide la selección de **Seguidores** hasta el commit de `relationship-list` y dos oportunidades RAF, y verifica el contador, las 12 filas y su contenido. `userInteractionMs` es el reloj Playwright desde el click hasta que se verifican esas condiciones; incluye round-trips del test runner y no equivale a latencia pura del navegador. Un botón de probe separado es solo diagnóstico auxiliar.
- `performance.memory.usedJSHeapSize` es un snapshot opcional del heap JavaScript, no memoria del proceso ni pico. La ventana temporal incluye el servidor de desarrollo Vinext: las cifras absolutas no representan producción.

#### Resultados

Los valores `Import` se actualizaron con la repetición descrita en Fase 17; el análisis, dashboard, interacción, perfiles y tareas largas conservan la corrida original en Windows, Node.js 24.16.0, Playwright 1.64.0 y Chromium 156.0.8078.4. Los valores son milisegundos, expresados como mediana (mínimo–máximo) de cinco repeticiones; `—` significa que la etapa no aplica.

| Escala / variante | Import / análisis | Respuesta recibida | Enqueue → efecto dashboard | Dashboard desde inicio | Lista `actual / base` | Filtro derivado inicial / interacción | Interacción `commit / 2 RAF / Playwright` | Tareas largas: cantidad / máxima | Inicio Worker |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Mediana / hilo principal | 79,9 (59,0–109,1) / 2,1 (1,7–3,6) | 92,2 (78,1–140,5) | 74,6 (57,8–157,7) | 171,0 (137,4–298,3) | 8,8 (8,3–39,6) / 6,0 (5,4–25,3) | 0,2 (0,1–0,2) / 0,5 (0,3–1,2) | 5,3 (4,5–51,7) / 40,9 (38,2–196,7) / 182,0 (150,0–217,9) | 1 / 79 (60–162) | — |
| Mediana / Worker reutilizado | 73,1 (64,7–107,3) / 1,8 (1,6–2,5) | 57,0 (44,1–137,4) | 76,1 (58,4–91,0) | 127,4 (104,1–218,9) | 9,1 (7,5–10,9) / 6,1 (5,2–7,6) | 0,2 (0,0–0,4) / 0,4 (0,3–0,8) | 4,9 (2,4–45,6) / 39,5 (37,2–128,7) / 153,6 (141,7–227,9) | 1 / 75 (61–86) | — |
| Mediana / Worker frío | 159,3 (143,2–269,1) / 2,4 (2,3–3,8) | 155,3 (137,7–211,3) | 68,1 (59,9–71,1) | 226,6 (197,6–279,7) | 8,3 (8,1–13,9) / 5,7 (5,6–10,0) | 0,1 (0,0–0,2) / 0,3 (0,3–1,1) | 5,5 (4,4–51,1) / 43,2 (39,3–189,5) / 181,7 (158,7–236,9) | 1 / 72 (63–74) | 56,1 (52,4–63,4) |
| Alta / hilo principal | 280,0 (203,2–698,0) / 18,1 (10,1–24,2) | 287,7 (263,7–420,9) | 106,1 (74,2–195,1) | 387,2 (352,3–616,4) | 9,2 (7,8–25,3) / 6,4 (5,4–16,0) | 1,1 (0,6–2,2) / 2,4 (1,9–2,5) | 5,0 (4,7–53,6) / 60,0 (38,3–185,6) / 201,7 (150,9–255,7) | 3 / 160 (138–248) | — |
| Alta / Worker reutilizado | 288,8 (270,6–624,2) / 13,7 (11,1–17,6) | 312,0 (262,5–514,5) | 114,3 (89,9–132,0) | 402,0 (377,3–631,5) | 11,4 (7,0–16,6) / 7,5 (4,3–10,8) | 0,6 (0,5–0,9) / 1,8 (1,7–2,6) | 5,0 (2,9–45,4) / 39,5 (38,2–114,7) / 159,8 (137,4–184,8) | 1 / 120 (94–138) | — |
| Alta / Worker frío | 477,0 (394,4–940,2) / 21,4 (16,9–45,4) | 480,0 (457,4–602,4) | 108,3 (98,8–154,3) | 633,6 (566,0–733,9) | 11,1 (7,6–15,0) / 7,5 (5,1–10,3) | 0,5 (0,5–1,0) / 2,0 (1,9–2,9) | 5,2 (1,9–59,2) / 40,6 (37,0–140,9) / 158,4 (131,7–175,6) | 1 / 111 (101–158) | 65,2 (48,0–76,4) |
| Máxima / hilo principal | 865,5 (789,8–1.020,1) / 48,9 (44,1–59,8) | 901,5 (834,5–1.044,1) | 147,7 (135,0–174,1) | 1.036,7 (975,3–1.208,3) | 7,4 (6,7–11,8) / 5,0 (4,4–7,6) | 2,7 (2,1–3,0) / 7,2 (6,9–9,4) | 5,9 (3,5–43,2) / 39,9 (37,7–157,0) / 167,6 (161,9–172,5) | 3 / 549 (534–634) | — |
| Máxima / Worker reutilizado | 864,8 (829,5–1.002,6) / 64,1 (47,9–75,7) | 987,8 (912,4–1.185,6) | 209,6 (194,1–257,3) | 1.190,2 (1.132,3–1.395,3) | 7,6 (6,7–13,0) / 5,5 (4,8–8,3) | 2,1 (2,0–2,1) / 7,0 (7,0–7,7) | 5,3 (3,1–5,7) / 39,5 (37,4–40,3) / 170,4 (168,8–178,2) | 1 / 213 (197–263) | — |
| Máxima / Worker frío | 1.215,2 (1.194,8–1.335,7) / 73,4 (64,0–91,4) | 1.317,3 (1.122,3–1.389,2) | 240,5 (204,0–297,1) | 1.532,2 (1.419,4–1.629,8) | 9,2 (7,1–10,6) / 5,7 (4,5–7,1) | 2,1 (2,0–4,7) / 11,4 (7,1–16,9) | 6,3 (3,5–38,1) / 42,4 (36,2–192,4) / 209,7 (155,7–288,6) | 1 / 240 (207–300) | 60,9 (45,8–68,3) |

`actual / base` corresponde a `relationship-list`. En cada caso, los tres subárboles produjeron exactamente un perfil `mount` por importación, sin commits repetidos observados durante esa fase. Los offsets medianos de inicio/commit de esos subárboles fueron 137,1/153,6, 354,5/367,9 y 1.011,1/1.019,5 ms en principal; 98,3/109,0, 377,2/385,9 y 1.164,0/1.174,4 ms reutilizado; 199,5/209,9, 583,4/600,1 y 1.507,7/1.516,2 ms frío.

Rangos completos de `actualDuration / baseDuration` para resumen e insights (ms):

| Escala / variante | Resumen: actual / base | Insights: actual / base |
|---|---:|---:|
| Mediana / principal | 1,2 (1,1–5,8) / 1,0 (0,7–4,7) | 1,0 (0,7–1,4) / 0,7 (0,4–1,0) |
| Mediana / reutilizado | 1,2 (1,0–1,4) / 0,9 (0,8–1,2) | 0,9 (0,8–0,9) / 0,7 (0,6–0,8) |
| Mediana / frío | 1,1 (1,0–1,8) / 0,7 (0,5–1,1) | 0,9 (0,9–1,6) / 0,7 (0,3–1,1) |
| Alta / principal | 1,4 (1,0–2,6) / 0,8 (0,5–1,8) | 0,9 (0,7–2,0) / 0,6 (0,5–1,4) |
| Alta / reutilizado | 1,3 (1,0–5,4) / 0,9 (0,6–3,0) | 0,8 (0,7–1,9) / 0,6 (0,5–1,2) |
| Alta / frío | 1,0 (0,9–1,4) / 0,8 (0,6–1,0) | 1,1 (0,8–1,6) / 0,7 (0,5–1,2) |
| Máxima / principal | 1,0 (0,9–1,5) / 0,8 (0,6–1,0) | 0,9 (0,7–1,3) / 0,5 (0,5–0,8) |
| Máxima / reutilizado | 1,0 (0,8–1,1) / 0,6 (0,4–0,7) | 0,8 (0,7–0,9) / 0,5 (0,4–0,6) |
| Máxima / frío | 1,1 (1,0–1,4) / 0,8 (0,6–0,9) | 0,8 (0,7–0,8) / 0,5 (0,4–0,6) |

Las mediciones del probe RAF durante cada operación tuvieron estas medianas (rango): mediana, principal `3 (3–4)` frames y gap máximo `100,0 (66,6–133,4)` ms; reutilizado `3 (3–5)` y `66,7 (66,6–100,0)` ms; frío `5 (4–5)` y `66,7 (66,6–83,4)` ms. Alta: principal `6 (5–6)` y `183,3 (99,9–233,3)` ms; reutilizado `7 (6–7)` y `116,7 (66,7–150,0)` ms; frío `10 (8–10)` y `116,7 (116,6–133,4)` ms. Máxima: principal `5 (5–6)` y `566,7 (516,6–616,7)` ms; reutilizado `20 (18–21)` y `216,6 (200,0–266,7)` ms; frío `23 (23–24)` y `250,0 (199,9–283,3)` ms. Las oportunidades RAF del dashboard desde el inicio fueron mediana/principal `176,8/191,6`, reutilizado `133,1/182,9`, frío `231,5/253,4` ms; alta `392,8/408,0`, `408,8/437,5`, `637,9/670,9` ms; máxima `1.045,4/1.093,3`, `1.194,9/1.220,9`, `1.536,6/1.565,7` ms (primer/segundo callback). Los callbacks RAF son oportunidades de ejecución; el gap y su conteo no certifican frames físicos presentados.

Las observaciones individuales siguientes conservan el orden de repetición 1–5. En cada celda, los vectores están separados por `/`; el tiempo de interacción se expresa como `commit / dos RAF / Playwright`, y las tareas como `cantidad: máxima duración`. `List actual/base` y filtro inicial/interacción completan las muestras por ejecución.

| Escala / variante | Import / análisis / efecto dashboard (ms) | Lista actual/base (ms) | Filtro inicial / interacción (ms) | Interacción commit / 2 RAF / Playwright (ms) | Tareas largas (#:ms) | Inicio frío Worker (ms) |
|---|---|---|---|---|---|---|
| Mediana / principal | 109,1/66,7/80,3/59,0/79,9 · 3,1/1,7/3,6/2,0/2,1 · 298,3/171,0/179,5/138,8/137,4 | 39,6/8,3/10,1/8,6/8,8 · 25,3/6,0/6,8/5,4/5,6 | 0,2/0,1/0,2/0,1/0,2 · 0,7/1,2/0,5/0,3/0,4 | 51,7/4,5/5,3/5,6/4,7 · 196,7/40,6/59,2/40,9/38,2 · 217,9/182,0/193,2/169,1/150,0 | 1:162/1:82/1:79/1:64/1:60 | — |
| Mediana / Worker reutilizado | 107,3/82,4/67,8/73,1/64,7 · 2,5/2,2/1,7/1,6/1,8 · 155,4/218,9/127,4/120,2/104,1 | 10,9/10,7/9,1/8,3/7,5 · 7,6/6,2/6,1/5,7/5,2 | 0,4/0,2/0,0/0,2/0,1 · 0,8/0,4/0,5/0,3/0,3 | 45,6/2,5/2,4/4,9/5,6 · 128,7/37,2/52,8/37,8/39,5 · 141,7/153,6/227,9/163,2/153,0 | 1:86/1:81/1:71/1:75/1:61 | — |
| Mediana / Worker frío | 159,3/153,2/143,2/179,8/269,1 · 2,3/3,2/2,3/2,4/3,8 · 197,6/271,8/215,7/226,6/279,7 | 8,2/13,9/8,1/8,3/10,6 · 5,7/10,0/5,6/5,6/7,0 | 0,2/0,1/0,1/0,2/0,0 · 1,1/0,6/0,3/0,3/0,3 | 51,1/4,9/4,4/5,5/5,8 · 189,5/61,9/43,2/39,3/41,4 · 207,1/236,9/181,7/158,7/167,7 | 1:63/1:73/1:72/1:74/1:70 | 52,4/63,4/56,1/55,9/57,6 |
| Alta / principal | 698,0/304,1/280,0/225,7/203,2 · 18,6/24,2/18,1/14,0/10,1 · 616,4/369,9/439,7/387,2/352,3 | 25,3/8,1/9,2/10,1/7,8 · 16,0/5,4/6,4/6,5/5,4 | 2,2/1,1/0,8/1,2/0,6 · 2,3/2,5/1,9/2,4/2,4 | 4,9/53,0/53,6/4,7/5,0 · 60,0/180,9/185,6/38,3/38,5 · 255,7/205,6/201,7/150,9/158,6 | 3:248/3:139/3:183/3:160/3:138 | — |
| Alta / Worker reutilizado | 624,2/288,8/291,5/270,6/278,3 · 17,6/13,7/12,8/11,1/17,4 · 486,2/631,5/383,5/402,0/377,3 | 16,6/11,4/7,0/7,3/12,1 · 10,8/7,5/4,3/4,9/7,9 | 0,7/0,9/0,5/0,6/0,5 · 1,7/1,8/1,8/2,6/1,8 | 4,7/2,9/5,2/5,0/45,4 · 39,5/38,5/46,8/38,2/114,7 · 156,5/159,8/184,8/174,8/137,4 | 1:138/1:122/1:95/1:94/1:120 | — |
| Alta / Worker frío | 940,2/479,7/394,4/477,0/433,9 · 16,9/45,4/18,4/24,1/21,4 · 566,0/633,6/582,3/634,1/733,9 | 7,9/7,6/11,1/14,8/15,0 · 5,1/5,1/7,5/9,5/10,3 | 1,0/0,5/1,3/0,5/0,9 · 1,9/2,3/2,9/2,0/2,0 | 1,9/5,1/59,2/47,5/5,2 · 40,6/37,0/140,9/121,6/39,5 · 175,6/158,4/155,3/131,7/160,0 | 1:111/1:101/1:106/1:158/1:135 | 64,4/48,0/76,4/65,6/65,2 |
| Máxima / principal | 1.020,1/865,5/789,8/848,1/885,1 · 59,8/46,1/48,9/55,8/44,1 · 1.208,3/975,3/1.011,2/1.155,0/1.036,7 | 7,8/6,7/7,4/11,8/7,1 · 5,0/4,4/4,5/7,6/5,1 | 2,7/2,2/2,9/3,0/2,1 · 7,0/6,9/7,2/9,4/7,5 | 5,4/6,8/3,5/43,2/5,9 · 39,9/43,4/37,7/157,0/39,1 · 161,9/163,7/167,6/172,5/169,4 | 3:634/3:534/3:544/3:549/3:581 | — |
| Máxima / Worker reutilizado | 1.002,6/829,5/862,5/923,6/864,8 · 67,1/64,1/47,9/61,2/75,7 · 1.174,4/1.132,3/1.190,2/1.395,3/1.294,1 | 7,6/7,1/9,0/6,7/13,0 · 5,5/4,8/6,3/5,2/8,3 | 2,1/2,0/2,1/2,1/2,0 · 7,0/7,0/7,0/7,7/7,3 | 3,1/5,3/5,7/5,1/5,4 · 37,4/39,5/39,2/40,3/39,9 · 170,2/178,2/170,4/168,8/177,0 | 1:197/1:223/1:205/1:213/1:263 | — |
| Máxima / Worker frío | 1.335,7/1.207,2/1.244,6/1.194,8/1.215,2 · 73,4/81,9/66,4/91,4/64,0 · 1.478,6/1.629,8/1.419,4/1.614,3/1.532,2 | 7,1/10,2/10,6/9,2/7,1 · 4,5/6,6/7,1/5,7/5,3 | 2,1/4,7/2,3/2,1/2,0 · 7,3/7,1/11,4/15,4/16,9 | 6,0/3,5/7,5/38,1/6,3 · 38,5/36,2/42,4/192,4/55,3 · 203,0/155,7/209,7/213,4/288,6 | 1:207/1:240/1:300/1:251/1:217 | 45,8/68,3/51,6/60,9/64,2 |

En cada variante, `analyze`/análisis de relaciones aparece en la columna separada y el commit React del dashboard coincide, dentro de la resolución del timer, entre los tres subárboles perfilados. El trabajo síncrono de agendar estado y el intervalo resultado→encolado tuvieron medianas inferiores a 0,1 ms (máximos observados 0,1 y 0,4 ms); `stateUpdateEnqueueToEffectMs` tuvo medianas de 68,1–240,5 ms según escala/variante. Ese intervalo no se explica por sí solo con las duraciones `actualDuration` observadas (la lista perfilada tuvo medianas de 7,4–11,4 ms en las cargas alta y máxima). El filtro derivado fue 2,1–2,7 ms en la primera lista máxima y 7,0–11,4 ms al seleccionar Seguidores. La interacción produjo 8–12 callbacks de Profiler para `relationship-list` por selección, con 0–1 para resumen/insights; no hubo commits repetidos de esos subárboles durante la importación. No hubo tarea larga observada entre el marcador del `useEffect` y la ventana de interacción en estas muestras; sí hubo tareas durante la operación principal, especialmente tres en alta/máxima en el hilo principal frente a una en Worker reutilizado.

#### Interpretación y decisión

**No se identifica una causa única del intervalo residual tras encolar el estado.** El diagnóstico muestra que las tres regiones perfiladas, la lista de 12 filas paginadas y el filtrado medido no explican cuantitativamente todo el intervalo entre el encolado de estado y el `useEffect`. No se perfiló el subárbol completo de `Home`; el marcador de efecto y los callbacks RAF no verifican pintura física. La acción real sí confirma que el control de grupo responde y presenta el conjunto correcto, pero el tiempo Playwright (~154–182 ms mediano en escala mediana y ~168–210 ms en máxima) incorpora comunicación con el navegador y espera de aserciones, y no debe tratarse como latencia pura del producto.

La lista filtra el array entero al renderizar, aunque solo renderiza 12 filas. El coste derivado mediano observado llega a 7,2 ms en la interacción máxima y el máximo medido fue 16,9 ms; es evidencia de un coste, pero no explica el mayor intervalo hasta la presentación ni justifica una optimización inmediata. **Decisión experimental: B — beneficio parcial**: el Worker reduce el máximo de tarea larga en alta/máxima, pero deja una tarea larga en ambas escalas y el tiempo hasta el dashboard no mejora de forma consistente. No se recomienda implementar virtualización, memoización general, transiciones ni nuevos Workers con esta evidencia. No se identifica una optimización React concreta; **cerrar por ahora la línea de optimización React**. Si una fase futura necesita aislar el intervalo residual, debe instrumentar el subárbol completo en una configuración que permita excluir con seguridad el profiling del flujo normal y correlacionar commits con presentación real.

La comparación confirma que Worker warm no mejora de forma consistente la presentación: `dashboardMs` fue 171/127/227 ms (principal/reutilizado/frío) en mediana; 387/402/634 ms en alta; y 1.037/1.190/1.532 ms en máxima. En alta/máxima bajó el máximo de tarea larga de 160/549 ms (principal) a 120/213 ms (reutilizado), mientras que el escenario mediano quedó en 79/75 ms. El Worker listo para la variante reutilizada tardó 57,9/55,2/46,6 ms por escala en la preparación inicial; la medida fría por repetición tuvo medianas 56,1/65,2/60,9 ms. El `postMessage` síncrono fue ≤0,1 ms en estas muestras. El round-trip del Worker warm fue 56,9/311,9/987,7 ms y el frío 99,4/413,8/1.252,8 ms (mediano/alto/máximo). No se infieren tiempos restando ejecuciones separadas ni se suman intervalos inclusivos. `performance.memory` informó 37,3 MB de heap JavaScript antes y después de cada muestra; no es una medida de pico ni memoria nativa.

La captura local detectó cero errores de consola/página y cero orígenes externos. La validación de rechazo/recuperación terminó con `invalidZipRejectedWithoutPartialResult`, `oversizedZipRejectedWithoutPartialResult`, `validRetrySucceeded` y `workersTerminated` verdaderos para las tres escalas. Solo se usaron nombres y relaciones sintéticos; el logger registra conteos y métricas, no arrays, perfiles crudos ni contenido importado. El benchmark corre con el servidor de desarrollo de Vinext y una única configuración local de Windows/Chromium: las cifras son comparativas dentro de esa sesión, no una garantía de rendimiento en producción.

#### Verificación de Fase 18

- `npm run benchmark:importer:render`: ejecución final local 1/1 pasada en 1,9 minutos; 15 repeticiones medidas por escenario (cinco por cada una de tres variantes), más la recuperación válida. Los registros incluyen tiempos individuales, medianas/rangos arriba, conteos equivalentes, tareas largas, interacción y perfil de los tres subárboles. No se añadió a CI.
- `npm test`: 34/34 pasaron. `npm run test:e2e`: 4/4 pasaron. `npm run typecheck`: pasó. `npm run build`: pasó con avisos existentes de import JSON en `vite.config.ts` y clasificación estática de rutas de Vinext. El bundle comprobado no incluye `recordReactProfile` ni el puente de desarrollo; el wrapper de perfil queda desactivado y retorna sus hijos en producción.
- `npx oxlint tests/perf/import-browser.benchmark.ts tests/perf/worker-e2e-bridge.d.ts`: pasó sin hallazgos. El lint focalizado incluyendo `app/page.tsx` y `components/import-dialog.tsx` y `npm run lint` completo fallaron por hallazgos preexistentes en esas rutas y otros archivos, detallados en la sección siguiente; al comparar sus ubicaciones con el diff, ninguno corresponde a las nuevas líneas de instrumentación. No se modificó código ajeno para silenciarlos. `git diff --check`: pasó.

---

## 4. Estado del Linter (`oxlint`)

- `npm run lint` ejecuta `oxlint` con `typeAware: true`.
- Actualmente, `npm run lint` termina con errores preexistentes en `components/ui/*` (accesibilidad y React Compiler), `app/page.tsx` (React Compiler, accesibilidad y navegación), `components/import-dialog.tsx` (asociación de labels y `FormEvent` obsoleto), `hooks/use-mobile.ts` (React Compiler), `components/ui/chart.tsx` (interpolaciones de tipos) y promesas no envueltas de `node:test` en `lib/relationships.test.ts`.
- Los archivos E2E añadidos se pueden comprobar de forma aislada con `npx oxlint playwright.config.ts tests/e2e/import.spec.ts`; esa comprobación no reporta hallazgos.
- **Regla del repositorio:** No alterar código funcional ajeno a la tarea solo para silenciar hallazgos preexistentes del linter, salvo requerimiento explícito.
- Para el cierre de tareas regulares, el criterio de validación obligatoria se enfoca en la suite de pruebas, TypeScript y compilación de producción.

---

## 5. Flujo Obligatorio de Verificación (Definition of Done)

Antes de finalizar cualquier tarea de desarrollo o mantenimiento, ejecutar:

```sh
# 1. Pruebas unitarias obligatorias (100% éxito)
npm test

# 2. Verificación estricta de TypeScript (0 errores)
npm run typecheck

# 3. Compilación de producción exitosa
npm run build
```

Para procedimientos detallados, consultar la Skill [.agents/skills/change-verification/SKILL.md](../../.agents/skills/change-verification/SKILL.md).
