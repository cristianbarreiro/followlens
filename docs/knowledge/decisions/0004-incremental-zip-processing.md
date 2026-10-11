---
okf_version: "0.2"
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
timestamp: "2026-10-11T11:45:00-03:00"
lifecycle: pending
---

# ADR-0004: Procesamiento Progresivo e Incremental de Exportaciones ZIP

## Estado
**Especificación Técnica Cerrada — Pendiente de Implementación en Fase 3 y Medición en Fase 4**

---

## 1. Contexto

FollowLens procesa exportaciones oficiales descargadas por los usuarios desde Instagram. Actualmente, `lib/importer.ts` impone dos restricciones rígidas de tamaño:
1. `MAX_ARCHIVE = 200 * 1024 * 1024` (200 MB): Rechaza de plano cualquier lote de archivos cuyo tamaño acumulado supere 200 MB comprimidos.
2. `MAX_JSON = 30 * 1024 * 1024` (30 MB): Límite sobre el contenido descompreso acumulado.

Además, la implementación actual lee el archivo ZIP completo en un búfer contiguo en el heap mediante `new Uint8Array(await zipped[0].arrayBuffer())` y acumula todas las entradas extraídas en un diccionario en memoria (`Record<string, Uint8Array>`) antes de deserializarlas secuencialmente.

En la práctica, una exportación oficial completa de Instagram que incluye fotografías, vídeos, historias y audios de la cuenta supera con frecuencia los 200 MB (por ejemplo, una exportación real de referencia pesa **232 MB**). Sin embargo, dentro de ese archivo de 232 MB, los archivos relevantes para el análisis (`followers_*.json` y `following.json`) suelen ocupar apenas unos pocos cientos de kilobytes o unos pocos megabytes. Rechazar el archivo legítimo únicamente por su tamaño total comprimido degrada la experiencia de usuario y contradice el objetivo de procesar la exportación completa directamente descargada de la plataforma.

---

## 2. Diferenciación de Dimensiones de Tamaño y Recursos

Para evitar ambigüedades técnicas y falsas garantías, se diferencian estrictamente cuatro dimensiones de tamaño:

1. **Tamaño total del archivo ZIP (Total Archive Size):**
   El tamaño del archivo en disco seleccionado por el usuario (e.g. 232 MB o superior). No debe usarse como criterio de rechazo para exportaciones legítimas.
2. **Bytes leídos desde almacenamiento (I/O Read Bytes):**
   La cantidad real de bytes leídos del disco mediante `File.slice()`. En la arquitectura objetivo se limita a la ventana del EOCD (hasta 65.557 bytes), el bloque del Directorio Central (típicamente 50–200 KB) y exclusivamente los segmentos comprimidos de los archivos JSON requeridos.
3. **Tamaño comprimido de cada entrada relevante (Compressed Entry Size):**
   El tamaño de cada segmento comprimido de `followers_*.json` y `following.json` dentro del archivo ZIP (generalmente decenas o cientos de kilobytes).
4. **Tamaño JSON descomprimido (Decompressed JSON Size):**
   La memoria intermedia tras la descompresión DEFLATE o STORE de cada entrada individual. Este valor está sujeto a un tope de seguridad DoS de **30 MB por archivo JSON individual**.

> [!IMPORTANT]
> **Aclaración sobre métricas de rendimiento:**
> Las estimaciones previas de consumo de memoria y tiempos de ejecución (e.g. memoria mínima en heap o tiempos sub-100 ms) se consideran **hipótesis de diseño deseables pendientes de medición formal en la Fase 4**. No se garantiza consumo de memoria estrictamente constante, ya que el heap de JavaScript asigna memoria proporcional a la cantidad de objetos y cadenas de texto generadas durante `JSON.parse` y la normalización de identificadores.

---

## 3. Evaluación Técnica de Alternativas (Fase 2)

Durante la auditoría técnica de la Fase 2 se evaluaron las siguientes vías de implementación:

1. **Lectura integral mediante `File.arrayBuffer()` (Implementación actual):**
   - *Ventajas:* Implementación simple y directa.
   - *Limitaciones:* Requiere cargar los 232 MB enteros en un búfer contiguo de memoria. Provoca fallos por falta de memoria (`RangeError: Array buffer allocation failed`) en dispositivos móviles y descarta exportaciones válidas por el límite fijo de 200 MB.
   - *Conclusión:* Inviable para exportaciones completas con multimedia.

2. **Lectura secuencial por bloques con `fflate.Unzip`:**
   - *Hallazgo crítico:* La inspección del código fuente de `fflate.Unzip` reveló que acumula internamente en un arreglo de retención (`unzipper.k[0].push(toAdd)`) los fragmentos de todas las entradas donde no se haya invocado inmediatamente `file.start()`. En consecuencia, al procesar secuencialmente un ZIP de 232 MB que contiene 230 MB de vídeo/fotos, la memoria heap retiene todos los chunks de los archivos omitidos, anulando el beneficio del streaming.
   - *Conclusión:* Inviable sin modificar internals de la biblioteca.

3. **Inspección de Directorio Central (EOCD + CD) vía `Blob.slice()` y descompresión selectiva:**
   - *Mecanismo:*
     1. `File.slice(start, end)` no lee el disco inmediatamente; proporciona descriptores de rango que realizan lecturas posicionales (*seek*) al invocar `.arrayBuffer()`.
     2. Se lee únicamente la ventana final para localizar el End of Central Directory (EOCD).
     3. Se lee y cataloga el bloque del Directorio Central (CD).
     4. Se identifican las entradas que coinciden con `followers_*.json` y `following.json`.
     5. Para cada entrada coincidente, se lee su rango comprimido exacto y se descomprime de forma aislada utilizando `fflate.inflate()` o passthrough (STORE).
     6. Los cientos de megabytes de multimedia (fotos, vídeos, mensajes) **nunca se leen del disco ni se asignan en el heap**.
   - *Conclusión:* **Estrategia seleccionada y aprobada para Fase 3**.

4. **Parser JSON incremental vs. `JSON.parse`:**
   - Las exportaciones de Instagram dividen los seguidores en archivos secuenciales (`followers_1.json`, `followers_2.json`, etc.) de típicamente 10.000 usuarios cada uno (~1 a 2 MB por archivo).
   - `JSON.parse` nativo de V8 procesa estos tamaños en milisegundos.
   - Un parser incremental de JSON añadiría dependencias y complejidad innecesarias. Se mantiene `JSON.parse` con un límite estricto por entrada (≤ 30 MB) para protección DoS.

---

## 4. Especificación Técnica del Lector ZIP Selectivo (Fase 3)

La implementación en `lib/importer.ts` deberá cumplir con los siguientes criterios rigurosos:

### 4.1. Búsqueda y Validación del EOCD
- **Ventana de búsqueda:** Leer un búfer desde `Math.max(0, file.size - 65557)` hasta `file.size` (22 bytes de estructura EOCD fija + hasta 65.535 bytes de comentario ZIP máximo).
- **Firma EOCD:** Localizar hacia atrás la firma `0x06054b50`.
- **Validación de consistencia:** Comprobar que `eocdOffset + 22 + commentLength === bufferLength`. Si no coincide, continuar escaneando hacia atrás para evitar colisiones con secuencias idénticas dentro del comentario.

### 4.2. Validación de Límites y Offsets
- Comprobar que `cdOffset >= 0` y `cdOffset + cdSize <= eocdFileOffset`.
- Para cada entrada en el Directorio Central:
  * Verificar firma de cabecera central `0x02014b50`.
  * Comprobar que `localOffset >= 0` y `localOffset + 30 <= file.size`.
  * Comprobar que `dataOffset + compressedSize <= file.size`.
- Cualquier cálculo fuera de los límites físicos del archivo debe lanzar un error explícito de archivo truncado o malformado antes de intentar cualquier lectura.

### 4.3. Consistencia entre Directorio Central y Local File Header (LFH)
- Al posicionarse en `localOffset`, leer los primeros 30 bytes del LFH:
  * Verificar la firma `0x04034b50`.
  * Verificar que el método de compresión en LFH coincida con el registrado en el Directorio Central.
  * Calcular `dataOffset = localOffset + 30 + lfhNameLen + lfhExtraLen`.
  * Si la firma es inválida o los campos discrepan, abortar con error de integridad.

### 4.4. Métodos de Compresión y Cifrado
- **Método 0 (STORE):** Datos sin comprimir; se extraen directamente como `Uint8Array`.
- **Método 8 (DEFLATE):** Se descomprimen mediante `fflate.inflate()` o `fflate.inflateSync()`.
- **Entradas Cifradas:** Si el bit 0 de las banderas de propósito general está activo (`flag & 0x0001`), abortar con error: *"El archivo ZIP contiene entradas protegidas por contraseña no soportadas."*
- **Métodos desconocidos:** Si `method !== 0 && method !== 8`, abortar con error: *"Método de compresión no soportado (${method})."*

### 4.5. Verificación de Integridad (CRC32)
- `fflate.inflate()` valida internamente la integridad del stream DEFLATE y lanza errores si los bloques están corruptos.
- La validación sintáctica de `JSON.parse()` garantiza que el contenido descomprimido no contenga datos truncados.
- Si se detectan bytes corruptos o el decompressor falla, se captura el error y se emite un mensaje amigable al usuario.

### 4.6. Detección y Rechazo Seguro de ZIP64
- Las exportaciones oficiales de Instagram dentro del alcance de esta versión operan bajo la especificación ZIP estándar (32 bits).
- **Detección explícita:**
  * Si el número de entradas en el EOCD es `0xFFFF`.
  * Si el tamaño o el offset del Directorio Central en el EOCD es `0xFFFFFFFF`.
  * Si en los 20 bytes anteriores al EOCD se detecta la firma del *ZIP64 End of Central Directory Locator* (`0x07064b50`).
- **Comportamiento:** Abortar de inmediato con error explícito:
  *"El archivo utiliza formato ZIP64 (más de 65.535 archivos o tamaño superior a 4 GB), no soportado en esta versión. Exportá solo seguidores y seguidos."*
- **Regla inquebrantable:** **Nunca interpretar silenciosamente valores 0xFFFFFFFF como offsets o tamaños numéricos válidos de 32 bits**, previniendo desbordamientos y lecturas incorrectas.

### 4.7. Anomalías de Seguridad
- **Nombres duplicados / colisión de carpetas:** Si se encuentran entradas que colisionan en su nombre base (e.g. `followers_1.json` en dos directorios internos diferentes), abortar con error de cuentas múltiples.
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

*Nota:* La validación con la exportación real del usuario (~232 MB) se reservará para verificación manual en navegador durante la Fase 4.

---

## 6. Consecuencias y Próximos Pasos

- **Aprobación técnica:** Queda definida una arquitectura viable, robusta y compatible con la versión actual de `fflate` (0.8.3) y las APIs estándar del navegador.
- **Transición a Fase 3:** Una vez revisada y aprobada esta especificación, la Fase 3 implementará el lector en `lib/importer.ts`, añadirá las pruebas sintéticas en `lib/relationships.test.ts` y actualizará la UI en `components/import-dialog.tsx`.
