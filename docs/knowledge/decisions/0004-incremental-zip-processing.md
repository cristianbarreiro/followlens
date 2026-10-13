---
okf_version: '0.2'
type: Decision
title: ADR-0004 - Procesamiento Progresivo e Incremental de Exportaciones ZIP
description: Admisión de exportaciones oficiales de gran tamaño (>200 MB) mediante inspección del directorio central y extracción selectiva por rangos sin límites totales arbitrarios.
tags:
  - decision
  - adr
  - zip
  - central-directory
  - slice
  - importer
  - memory
timestamp: '2026-10-11T12:35:00-03:00'
lifecycle: active
---

# ADR-0004: Procesamiento Progresivo e Incremental de Exportaciones ZIP

## Estado

**Implementado, Endurecido y Validado con exportaciones JSON y HTML (Fases 4 a 6)**

---

## 1. Contexto Histórico y Problema Original

FollowLens procesa exportaciones oficiales descargadas por los usuarios desde Instagram. En las versiones iniciales (Fases 1 y 2), `lib/importer.ts` imponía dos restricciones rígidas de tamaño:

1. `MAX_ARCHIVE = 200 * 1024 * 1024` (200 MB): Rechazaba de plano cualquier lote de archivos cuyo tamaño acumulado superara 200 MB comprimidos.
2. `MAX_JSON = 30 * 1024 * 1024` (30 MB): Límite sobre el contenido descompreso acumulado.

Además, aquella implementación inicial leía el archivo ZIP completo en un búfer contiguo en el heap mediante `new Uint8Array(await zipped[0].arrayBuffer())` y acumulaba todas las entradas extraídas en un diccionario en memoria (`Record<string, Uint8Array>`) antes de deserializarlas secuencialmente.

En la práctica, una exportación oficial completa de Instagram que incluye fotografías, vídeos, historias y audios de la cuenta supera con frecuencia los 200 MB (por ejemplo, una exportación real de referencia pesa **232 MB** / 243 MB). Sin embargo, dentro de ese archivo, los archivos relevantes para el análisis (`followers_*.json`, `following.json`, o sus equivalentes en HTML) suelen ocupar apenas unos pocos cientos de kilobytes. Rechazar el archivo legítimo únicamente por su tamaño total comprimido degradaba la experiencia de usuario y contradecía el objetivo de procesar la exportación completa directamente descargada de la plataforma. La arquitectura implementada en las Fases 3 a 6 eliminó este bloqueo mediante lectura selectiva por rangos.

---

## 2. Diferenciación de Dimensiones de Tamaño y Recursos

Para evitar ambigüedades técnicas y falsas garantías, se diferencian estrictamente cuatro dimensiones de tamaño:

1. **Tamaño total del archivo ZIP (Total Archive Size):**
   El tamaño del archivo en disco seleccionado por el usuario (e.g. 232 MB o superior). En la arquitectura implementada no se utiliza como criterio de rechazo para exportaciones legítimas.
2. **Bytes leídos desde almacenamiento (I/O Read Bytes):**
   La cantidad real de bytes leídos del disco mediante `File.slice()`. Se limita a la ventana del EOCD (hasta 65.557 bytes), el bloque del Directorio Central (típicamente 50–200 KB) y exclusivamente los segmentos comprimidos de los archivos relacionales requeridos.
3. **Tamaño comprimido de cada entrada relevante (Compressed Entry Size):**
   El tamaño de cada segmento comprimido de `followers_*` y `following` dentro del archivo ZIP (generalmente decenas o cientos de kilobytes).
4. **Tamaño de datos descomprimidos (Decompressed Entry Size):**
   La memoria intermedia tras la descompresión DEFLATE o STORE de cada entrada individual. Este valor está sujeto a un tope de seguridad DoS de **30 MB por archivo individual y acumulado**.

> [!IMPORTANT]
> **Aclaración sobre métricas de rendimiento:**
> El consumo de memoria y tiempos de ejecución reales dependen del entorno de ejecución. El heap de JavaScript asigna memoria proporcional a la cantidad de objetos y cadenas de texto generadas durante `JSON.parse` o la construcción del árbol DOM de `DOMParser` y la normalización de identificadores. Las mediciones registradas en este documento diferencian explícitamente entre benchmarks en Node 24 / V8 y auditorías visuales en el navegador web local.

---

## 3. Evaluación Técnica de Alternativas (Fase 2)

Durante la auditoría técnica de la Fase 2 se evaluaron las siguientes vías de implementación:

1. **Lectura integral mediante `File.arrayBuffer()` (Implementación histórica de Fases 1–2):**
   - _Ventajas:_ Implementación simple y directa.
   - _Limitaciones:_ Requería cargar los 232 MB enteros en un búfer contiguo de memoria. Provocaba fallos por falta de memoria (`RangeError: Array buffer allocation failed`) en dispositivos móviles y descartaba exportaciones válidas por el límite fijo de 200 MB.
   - _Conclusión:_ Inviable para exportaciones completas con multimedia. Reemplazada en Fase 3.

2. **Lectura secuencial por bloques con `fflate.Unzip`:**
   - _Hallazgo crítico:_ La inspección del código fuente de `fflate.Unzip` reveló que acumula internamente en un arreglo de retención (`unzipper.k[0].push(toAdd)`) los fragmentos de todas las entradas donde no se haya invocado inmediatamente `file.start()`. En consecuencia, al procesar secuencialmente un ZIP de 232 MB que contiene 230 MB de vídeo/fotos, la memoria heap retiene todos los chunks de los archivos omitidos, anulando el beneficio del streaming.
   - _Conclusión:_ Inviable sin modificar internals de la biblioteca.

3. **Inspección de Directorio Central (EOCD + CD) vía `Blob.slice()` y descompresión selectiva:**
   - _Mecanismo:_
     1. `File.slice(start, end)` no lee el disco inmediatamente; proporciona descriptores de rango que realizan lecturas posicionales (_seek_) al invocar `.arrayBuffer()`.
     2. Se lee únicamente la ventana final para localizar el End of Central Directory (EOCD).
     3. Se lee e inspecciona el bloque completo del Directorio Central (CD) para catalogar los metadatos de todas las entradas sin leer su contenido.
     4. Se identifican exclusivamente las entradas relacionales que coinciden con `followers_*.json` y `following.json`.
     5. Para cada entrada coincidente, se lee su rango local exacto y se descomprime de forma aislada (STORE o streaming DEFLATE acotado).
     6. Los bytes de contenido de los archivos multimedia (fotos, vídeos, reels, historias) y mensajes privados **nunca se solicitan mediante rangos de `File.slice()`, no se leen del disco ni se descomprimen en el heap**.
   - _Conclusión:_ **Estrategia implementada y validada en Fase 3**.

4. **Parser JSON incremental vs. `JSON.parse`:**
   - Las exportaciones de Instagram dividen los seguidores en archivos secuenciales (`followers_1.json`, `followers_2.json`, etc.) de típicamente 10.000 usuarios cada uno (~1 a 2 MB por archivo).
   - `JSON.parse` nativo de V8 procesa estos tamaños en milisegundos.
   - Un parser incremental de JSON añadiría dependencias y complejidad innecesarias. Se mantiene `JSON.parse` con un límite estricto por entrada (≤ 30 MB) para protección DoS.

---

## 4. Especificación Técnica del Lector ZIP Selectivo (Fase 3)

La implementación actual de `lib/zip.ts` y `lib/importer.ts` cumple con los siguientes criterios:

### 4.1. Búsqueda y Validación del EOCD

- **Ventana de búsqueda:** Leer un búfer desde `Math.max(0, file.size - 65557)` hasta `file.size` (22 bytes de estructura EOCD fija + hasta 65.535 bytes de comentario ZIP máximo).
- **Firma EOCD:** Localizar hacia atrás la firma `0x06054b50`.
- **Validación de consistencia:** Comprobar que `eocdOffset + 22 + commentLength === bufferLength`. Si no coincide, continuar escaneando hacia atrás para evitar colisiones con secuencias idénticas dentro del comentario.

### 4.2. Validación de Límites y Offsets

- Comprobar que `cdOffset >= 0` y `cdOffset + cdSize <= eocdFileOffset`.
- Para cada entrada en el Directorio Central:
  - Verificar firma de cabecera central `0x02014b50`.
  - Comprobar que `localOffset >= 0` y `localOffset + 30 <= file.size`.
  - Comprobar que `dataOffset + compressedSize <= file.size`.
- Cualquier cálculo fuera de los límites físicos del archivo debe lanzar un error explícito de archivo truncado o malformado antes de intentar cualquier lectura.

### 4.3. Consistencia entre Directorio Central y Local File Header (LFH)

- Al posicionarse en `localOffset`, leer los primeros 30 bytes del LFH:
  - Verificar la firma `0x04034b50`.
  - Verificar que el método de compresión en LFH coincida con el registrado en el Directorio Central.
  - Calcular `dataOffset = localOffset + 30 + lfhNameLen + lfhExtraLen`.
  - Si la firma es inválida o los campos discrepan, abortar con error de integridad.

### 4.4. Métodos de Compresión y Cifrado

- **Método 0 (STORE):** Datos sin comprimir; se extraen directamente como `Uint8Array`.
- **Método 8 (DEFLATE):** Se descomprime con `decompressDeflate()` en `lib/zip.ts`, que utiliza `fflate.Inflate` y controla el tamaño de salida en cada fragmento.
- **Entradas Cifradas:** Si el bit 0 de las banderas de propósito general está activo (`flag & 0x0001`), abortar con error: _"El archivo ZIP contiene entradas protegidas por contraseña no soportadas."_
- **Métodos desconocidos:** Si `method !== 0 && method !== 8`, abortar con error: _"Método de compresión no soportado (${method})."_

### 4.5. Verificación de Integridad (CRC32)

- `fflate.Inflate` informa fallos de descompresión; `decompressDeflate()` los convierte en errores controlados, preservando el error de límite de salida.
- `lib/zip.ts` verifica longitud descomprimida y CRC32 tras extraer cada entrada, y `lib/importer.ts` valida el formato JSON o HTML antes de aceptar la importación.
- Si se detectan bytes corruptos o falla la descompresión, se emite un mensaje controlado al usuario.

### 4.6. Detección y Rechazo Seguro de ZIP64

- Las exportaciones oficiales de Instagram dentro del alcance de esta versión operan bajo la especificación ZIP estándar (32 bits).
- **Detección explícita:**
  - Si el número de entradas en el EOCD es `0xFFFF`.
  - Si el tamaño o el offset del Directorio Central en el EOCD es `0xFFFFFFFF`.
  - Si en los 20 bytes anteriores al EOCD se detecta la firma del _ZIP64 End of Central Directory Locator_ (`0x07064b50`).
- **Comportamiento:** Abortar de inmediato con error explícito:
  _"El archivo utiliza formato ZIP64 (más de 65.535 archivos o tamaño superior a 4 GB), no soportado en esta versión. Exportá solo seguidores y seguidos."_
- **Regla inquebrantable:** **Nunca interpretar silenciosamente valores 0xFFFFFFFF como offsets o tamaños numéricos válidos de 32 bits**, previniendo desbordamientos y lecturas incorrectas.

### 4.7. Anomalías de Seguridad

- **Resolución contextual y colisión de carpetas:** Si existe `connections/followers_and_following/`, solo se seleccionan desde esa carpeta los archivos relacionales y se ignoran homónimos de otras secciones (por ejemplo, `your_instagram_activity/threads/following.html`). Se rechazan varias carpetas conocidas y duplicados de nombre base dentro de la carpeta elegida. Si no existe la ruta conocida, solo se acepta una única carpeta con candidatos relacionales; varias carpetas se consideran ambiguas y abortan la importación.
- **Rutas ambiguas / Path Traversal:** Normalizar rutas ignorando separadores (`/` vs `\`). La lectura opera exclusivamente en memoria sin escribir al sistema de archivos local.
- **Protección Zip-Bomb:** Limitar el tamaño descompreso a un máximo de 30 MB por entrada JSON individual (`uncompressedSize > 30 MB` o buffer descomprimido excedido).

---

## 5. Casos de Prueba para la Fase 3

La suite en `lib/relationships.test.ts` deberá incorporar pruebas unitarias sintéticas para:

1. **EOCD válido con comentario cero y con comentario de tamaño variable** (hasta bordear el límite de búsqueda).
2. **ZIP truncado o sin firma EOCD válida:** Rechazo seguro con mensaje claro.
3. **Entradas STORE (método 0) y DEFLATE (método 8):** Extracción correcta de ambas variantes.
4. **Detección y rechazo de ZIP64:** Simular cabeceras con marcadores `0xFFFF` / `0xFFFFFFFF` y verificar el rechazo controlado.
5. **Entradas cifradas (bit 0) y métodos no soportados:** Verificación de mensaje explicativo.
6. **Offsets corruptos que exceden los límites del archivo:** Comprobación de que no se realicen lecturas fuera de rango.
7. **Multimedia irrelevante ignorada:** Archivo ZIP sintético que incluye entradas ficticias de vídeo/fotos junto con `followers_1.json` y `following.json`, verificando que los datos multimedia nunca se lean ni descompriman.
8. **Representación sintética de archivo grande (>200 MB):** Prueba que valide la ausencia de rechazo artificial por tamaño de archivo **sin requerir la instanciación de un buffer real de cientos de megabytes en la memoria de pruebas** (mediante simulación de objeto `File` o `Blob.slice`).
9. **Múltiples partes secuenciales de seguidores y detección de saltos** (`followers_1.json` y `followers_3.json` sin `followers_2.json`).
10. **Preservación del soporte existente para JSONs sueltos** seleccionados individualmente sin archivo ZIP.

_Nota:_ La validación con la exportación real del usuario (~232 MB) se reservará para verificación manual en navegador durante la Fase 4.

---

- **Implementación y Hardening completados (Fases 3 y 4):**
  - La arquitectura selectiva está completamente implementada en `lib/zip.ts` y `lib/importer.ts`, acompañada de 23 suites de pruebas unitarias exhaustivas con 100% de éxito.
  - **Hardening aplicado:**
    - Verificación estricta de rutas completas normalizadas entre LFH y Directorio Central (evita colisiones o discrepancias en subdirectorios).
    - Verificación bidireccional y estricta de coherencia en la bandera bit 3 (data descriptor); validación exacta de campos CRC32 y tamaños cuando bit 3 está inactivo.
    - Presupuesto de lectura acumulada comprimida para entradas relevantes (`MAX_COMPRESSED_TOTAL = 30 MB`), protegiendo ante abusos de I/O sin imponer un límite total al tamaño del archivo ZIP contenedor.
    - Corrección de la aserción de omisión multimedia mediante intersección estricta de intervalos (`Math.max(start, A) < Math.min(end, B)`).

- **Resultados de Validación con Exportación Real de ~232 MB (Fase 4):**
  - **Archivo probado:** Exportación oficial de Instagram en disco de 243.333.132 bytes (~232 MiB), conteniendo 819 entradas (207 vídeos MP4, 273 imágenes JPG/WEBP/PNG, audios y documentos).
  - **Aceptación sin rechazo por tamaño:** El archivo fue aceptado de inmediato sin activar ningún bloqueo por superar 200 MB.
  - **Rendimiento de inspección selectiva:** `readZipSelective` analizó el archivo en **15,09 ms** (en runtime Node 24 / motor V8), leyendo únicamente la ventana de 65.557 bytes para EOCD y 90.395 bytes para el Directorio Central.
  - **Consumo de memoria observado:** Delta de heap en memoria inferior a 1 MB durante la inspección y extracción de entradas.
  - **Omisión completa de contenido pesado:** El lector nunca solicitó rangos de bytes ni descomprimió fotos, vídeos ni audios (más de 240 MB de contenido no requerido).
  - **Diagnóstico de formato:** El archivo real suministrado correspondía a la variante en formato **HTML** oficial de Instagram (`followers_1.html` y `following.html`), motivando la implementación de la Fase 5.

- **Soporte de Exportaciones HTML y Benchmarks de Extremo a Extremo (Fase 5):**
  - **Parser seguro implementado:** `lib/html-parser.ts` procesa de forma pasiva mediante `DOMParser` las listas HTML oficiales (`followers_*.html`, `following.html`), decodifica entidades y resuelve enlaces de perfiles con prefijo `/_u/` y encabezados `<h2>`.
  - **Compatibilidad dual sin mezclas:** Reconocimiento simultáneo de JSON y HTML con salvaguarda que impide mezclar formatos de distintas exportaciones en un mismo lote.
  - **Benchmarks en entorno Node 24 / motor V8 con el archivo real de 243 MB (~232 MiB):**
    - **Tiempo de ejecución total:** **224,91 ms** (inspección ZIP selectiva + extracción + parsing HTML de ambas listas + set math).
    - **I/O selectivo:** Únicamente **282,49 KB** leídos del disco mediante `File.slice()` (apenas 0,11% del tamaño del archivo).
    - **Consumo de memoria:** Delta de heap de **2,03 MB** en el motor V8.
    - **Relaciones extraídas:** **84 seguidores**, **276 seguidos**, **37 mutuales**, **239 no devuelven seguimiento (`notBack`)**, **47 fans**.
    - **Consistencia matemática:** 100% verificada (`mutuals + notBack === 276`, `mutuals + fans === 84`).
    - **Privacidad comprobada:** 0 bytes transmitidos a la red; procesamiento 100% en el dispositivo cliente.

- **Hardening del Parser HTML y Auditoría de Interfaz (Fase 6):**
  - **Filtro riguroso de URLs:** Exclusión de rutas de contenido (`/p/`, `/reel/`, `/reels/`, `/stories/`, `/tv/`, `/explore/`), enlaces institucionales/legales (`/about/`, `/legal/terms/`, `/privacy/`), enlaces ajenos y verificación estricta de hostnames (`www.instagram.com`, `instagram.com`).
  - **Reconocimiento estructural:** Rechazo de documentos HTML ajenos que contengan `<main>` o enlaces no relacionales. Rechazo de documentos que contengan bloques de registro pero sin nombres de usuario extraíbles.
  - **Suite de pruebas:** Ampliada a **34 tests unitarios** con 100% de éxito en `node:test` (0 suites).
  - **Auditoría de la interfaz en navegador local:**
    - Modal de importación accesible con soporte explícito para `.zip`, `.json` y `.html`.
    - Validación y feedback inmediato ante envíos incompletos o sin confirmación.
    - Diseño responsive validado en resoluciones móviles (375x667) y de escritorio (1280x800).
    - Cero errores o excepciones no controladas en la consola del navegador.

## 7. Línea de Base de Rendimiento Sintética (Fase 9)

La línea de base reproducible opt-in está disponible con `npm run benchmark:importer` (Node.js 24+, `--expose-gc`). Genera fixtures en memoria y separa lectura EOCD/directorio central, rangos de extracción, parsing, cálculo de relaciones e importación total. También incluye un ZIP sintético con 32 MiB de contenido irrelevante, un payload JSON que alcanza exactamente el presupuesto descomprimido de 30 MiB y otro que lo excede por un byte.

En Windows con Node.js 24.16.0 / V8 13.6.233.17:

- JSON mediano de 10.000 seguidores y 8.000 seguidos (2.500 mutuos, 0,947 MiB descomprimidos): extracción/integridad observada en 29 ms, parsing en 27 ms, relaciones en 5 ms e importación total en 45 ms. Son timers separados; su suma no representa el tiempo total porque las fases fueron cronometradas en corridas separadas dentro del benchmark y hay variación de scheduler.
- ZIP de 32 MiB con contenido multimedia sintético irrelevante y solo 3.720 bytes relacionales: importación en ~1 ms. El lector solicitó la ventana EOCD de 65.557 bytes, 259 bytes del directorio central y 3.882 bytes de rangos relacionales; nunca pidió el rango de datos del medio. La prueba sintética unitaria existente mantiene la cobertura de un contenedor sparse superior a 200 MiB sin materializarlo.
- Presupuesto máximo sintético de exactamente 30 MiB: aceptado en 315 ms; 1 byte adicional: rechazado con error controlado.
- Se evaluó un prototipo de escritura DEFLATE al buffer declarado. Aunque el microbenchmark aislado fue más rápido, la importación completa del fixture exacto al límite no mostró mejora concluyente y los snapshots de memoria no acreditaron una reducción del pico. El prototipo se descartó; el código de producción permanece sin cambios.
- En Chromium real de Playwright 1.64.0 (Chromium 156.0.8078.4), dos importaciones UI JSON pequeñas sintéticas tomaron 114–162 ms; `performance.memory` mostró 37,3 MB antes/después (límite reportado 3.760 MB). Esta medida es específica de Chromium, aproximada y no representa un ZIP de 30 MiB.

Los datos anteriores son mediciones de una máquina local, descriptivas y no umbrales de CI. Node `heapUsed` no es memoria total del proceso ni del navegador; los snapshots por etapa no capturan necesariamente el máximo de una operación síncrona. Para el payload exacto, RSS se observó en ~77 MiB antes, ~138 MiB inmediatamente después y ~78 MiB tras ceder el event loop y forzar GC; `arrayBuffers` volvió a ~0,32 MiB y permaneció estable después de una segunda importación. La medición histórica de exportación real de 243.333.132 bytes (~232 MiB), 224,91 ms y delta de heap de 2,03 MB corresponde a otra validación anterior y no se repitió ni se mezcló con estos fixtures sintéticos.
