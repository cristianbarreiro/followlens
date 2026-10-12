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
timestamp: '2026-10-12T00:58:00-03:00'
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
| `npm test`          | Ejecuta la suite completa de pruebas unitarias.           | `node --test lib/relationships.test.ts`           | 34 tests unitarios nativos (0 suites).            |
| `npm run test:e2e`  | Ejecuta regresiones de importación en Chromium real.      | Playwright Test                                   | Inicia Vinext local; requiere Chromium instalado. |
| `npm run benchmark:importer` | Mide escenarios sintéticos del pipeline de importación. | Node.js 24 + `--expose-gc` | Opt-in; informa tiempos y snapshots aproximados de memoria, sin umbrales. |
| `npm run benchmark:importer:browser` | Mide importaciones sintéticas medianas, de alta cardinalidad y cercanas al límite en Chromium. | Playwright Test + Chromium | Ejecución independiente; incluye rechazo del límite y recuperación. |
| `npm run benchmark:importer:stages` | Compara ZIP DEFLATE/STORE y tiempos por etapa en Chromium. | Playwright Test + Chromium | Dos repeticiones de mediano y 30 MiB; diagnósticos opt-in, sin umbrales. |
| `npm run benchmark:importer:realistic` | Compara importaciones relacionales sintéticas de alta cardinalidad en Chromium. | Playwright Test + Chromium | Tres escalas, dos repeticiones y DEFLATE/STORE; opt-in, sin umbrales. |
| `npm run benchmark:importer:optimization` | Compara el importador actual con un parser alternativo benchmark-only. | Playwright Test + Chromium | Tres repeticiones por variante y escala tras calentamiento; no CI. |
| `npm run benchmark:importer:crc32` | Compara el CRC32 productivo con slicing-by-8 experimental. | Playwright Test + Chromium | Equivalencia previa, cinco corridas por entrada/escala; no CI. |
| `npm run profile:importer:browser` | Perfila el hot path ZIP en Chromium mediante CDP. | Playwright + Chrome DevTools Protocol | Opt-in, 2 repeticiones por carga; no guarda perfiles crudos. |
| `npm run typecheck` | Verifica tipos TypeScript sin emitir archivos.            | `tsc --noEmit`                                    | Validación estricta con TypeScript 5.9.           |
| `npm run format`    | Formatea el código fuente del proyecto.                   | `oxfmt`                                           | Formateador ultrarrápido basado en Rust.          |
| `npm run lint`      | Ejecuta el análisis estático de código.                   | `oxlint`                                          | Véase Sección 4 para diagnóstico de linter.       |
| `npm run start`     | Arranca el runtime local de Cloudflare Worker / Wrangler. | `wrangler dev --config dist/server/wrangler.json` | Emulación local.                                  |

---

## 3. Pruebas Unitarias Actuales (`lib/relationships.test.ts`)

La suite unitaria se ejecuta mediante el runner nativo de Node.js (`node --test`) y utiliza aserciones estrictas (`node:assert/strict`).

### Cobertura Actual Comprobada (34 tests unitarios activos):

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

> [!NOTE]
> **Datos de prueba y validación:** Las 34 pruebas unitarias automatizadas operan sobre datos sintéticos generados en memoria con `buildSyntheticZip`, `zipSync` y objetos `File`/`Blob` livianos. En la salida de `node:test`, se reportan 34 tests pasados y 0 suites (archivo único de ejecución). Las mediciones históricas con la exportación real de Instagram de ~232 MB (243 MB, 819 entradas) son una validación anterior en Node 24 / V8, no forman parte de esta línea de base sintética ni se volvieron a ejecutar.

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

---

## 4. Estado del Linter (`oxlint`)

- `npm run lint` ejecuta `oxlint` con `typeAware: true`.
- Actualmente, `npm run lint` termina con errores preexistentes en `components/ui/*` (accesibilidad y React Compiler), `app/page.tsx` (React Compiler, accesibilidad y navegación), `components/import-dialog.tsx` (asociación de labels y `FormEvent` obsoleto), `components/ui/chart.tsx` (interpolaciones de tipos) y promesas no envueltas de `node:test` en `lib/relationships.test.ts`.
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
