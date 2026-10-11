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
timestamp: '2026-10-11T18:40:00-03:00'
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
| `npm run benchmark:importer:browser` | Mide importaciones sintéticas medianas y cercanas al límite en Chromium. | Playwright Test + Chromium | Ejecución independiente; no forma parte de `test:e2e`. |
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

Ejecutá `npm run benchmark:importer:browser` con Node.js 24+ y Chromium instalado (`npx playwright install chromium`). Este comando usa un config Playwright separado y no agrega casos pesados a `npm run test:e2e`. Levanta el servidor Vinext local y recorre el diálogo de importación real. Todos los usernames y ZIP son sintéticos; el payload de límite se crea con una lista pequeña JSON válida más espacios JSON en blanco, sin datos personales. El benchmark comprueba el tamaño sin comprimir acumulado de las entradas relacionales y el comprimido declarado por el directorio central; no confunde el tamaño del contenedor ZIP con esos presupuestos.

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
