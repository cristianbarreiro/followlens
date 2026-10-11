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
timestamp: "2026-10-11T10:45:00-03:00"
lifecycle: pending
---

# ADR-0004: Procesamiento Progresivo e Incremental de Exportaciones ZIP

## Estado
**Validado técnicamente en Fase 2 — Pendiente de Implementación en Fase 3**

---

## Contexto

FollowLens procesa exportaciones oficiales descargadas por los usuarios desde Instagram. Actualmente, `lib/importer.ts` impone dos restricciones rígidas de tamaño:
1. `MAX_ARCHIVE = 200 * 1024 * 1024` (200 MB): Rechaza de plano cualquier archivo o conjunto de archivos que supere este tamaño comprimido.
2. `MAX_JSON = 30 * 1024 * 1024` (30 MB): Límite sobre el contenido descompreso acumulado.

Además, la implementación actual lee el archivo ZIP completo en un búfer contiguo mediante `new Uint8Array(await zipped[0].arrayBuffer())` y acumula todas las entradas extraídas en un diccionario en memoria (`Record<string, Uint8Array>`) antes de deserializarlas secuencialmente.

En la práctica, una exportación oficial completa de Instagram que incluye fotografías, vídeos, historias y audios de la cuenta supera con frecuencia los 200 MB (por ejemplo, una exportación real de referencia pesa **232 MB**). Sin embargo, dentro de ese archivo de 232 MB, los archivos relevantes para el análisis (`followers_*.json` y `following.json`) suelen ocupar apenas unos pocos cientos de kilobytes o unos pocos megabytes. Rechazar el archivo legítimo únicamente por su tamaño total comprimido degrada la experiencia de usuario y contradice el objetivo de procesar la exportación completa directamente descargada de la plataforma.

---

## Evaluación Técnica de Alternativas (Fase 2)

Durante la auditoría de la Fase 2 se evaluaron las siguientes vías de implementación:

1. **Lectura secuencial con `fflate.Unzip` por bloques:**
   - *Hallazgo crítico:* El descompresor secuencial `fflate.Unzip` acumula internamente los chunks de todas las entradas no iniciadas en un arreglo de retención (`unzipper.k`) para permitir llamadas tardías a `file.start()`. En consecuencia, al procesar secuencialmente un ZIP de 232 MB con 230 MB de vídeo/fotos, la memoria heap acumula todos los chunks comprimidos de los archivos multimedia omitidos, provocando saturación de memoria.
   - *Conclusión:* No resuelve el consumo de memoria para archivos grandes con contenido multimedia extenso.

2. **Inspección de Directorio Central (EOCD + Central Directory) con `Blob.slice()` y descompresión selectiva:**
   - *Mecanismo:*
     1. Los objetos `File` del navegador implementan `Blob.prototype.slice(start, end)`, que representa punteros de rango sin cargar el archivo a memoria.
     2. Se leen únicamente los últimos 64 KB del archivo para localizar la firma del registro de fin de directorio central (EOCD: `0x06054b50`).
     3. A partir del EOCD, se localiza y lee el bloque de Directorio Central (típicamente 50–200 KB).
     4. Se catalogan todas las entradas del ZIP al instante sin tocar ningún archivo multimedia.
     5. Se identifican las entradas que coinciden con `followers_*.json` y `following.json`.
     6. Para cada entrada coincidente, se lee exclusivamente su rango de bytes comprimidos mediante `file.slice()` y se descomprime de forma aislada utilizando `fflate.inflate()` / `inflateSync()`.
     7. Los cientos de megabytes de multimedia (fotos/vídeos) **nunca se leen del disco ni ingresan al heap de JavaScript**.
   - *Conclusión:* Estrategia recomendada. Reduce el uso de memoria a menos de 5 MB de RAM independientemente del tamaño total del ZIP (232 MB, 500 MB o 2 GB).

3. **Parser JSON incremental vs. `JSON.parse`:**
   - Las exportaciones de Instagram dividen a los seguidores en partes secuenciales de aproximadamente 10.000 usuarios cada una (`followers_1.json`, `followers_2.json`), ocupando entre 1 y 2 MB por archivo descompreso.
   - `JSON.parse` nativo de V8 procesa archivos de este tamaño en ~10 ms por archivo.
   - Un parser JSON en streaming de caracteres en JS no es necesario para esta escala y añadiría dependencias o complejidad excesiva. Se mantiene `JSON.parse` con un límite estricto por entrada JSON individual (e.g. 30 MB) para protección DoS.

---

## Decisión Objetivo

1. **Eliminación del umbral arbitrario de tamaño total:**
   No rechazar una exportación legítima de Instagram únicamente porque el archivo ZIP supere los 200 MB.
2. **Inspección de estructura vía Directorio Central:**
   Leer el EOCD y Directorio Central del ZIP mediante `File.slice()` para catalogar las entradas sin leer datos multimedia.
3. **Extracción selectiva y quirúrgica:**
   Extraer mediante `file.slice()` únicamente los segmentos de bytes correspondientes a `followers_*.json` y `following.json`.
4. **Descompresión aislada con `fflate.inflate`:**
   Descomprimir exclusivamente los streams de las entradas identificadas, descartando de inmediato los búferes tras extraer los nombres normalizados.
5. **Alcance inicial estricto:**
   La primera versión funcional analizará exclusivamente seguidores y seguidos (mutuos, no recíprocos, fans y comparaciones temporales).
6. **Mantenimiento de protecciones de seguridad (DoS / Zip-bomb):**
   Conservar salvaguardas sobre el tamaño descompreso admitido por cada archivo JSON individual relevante (≤ 30 MB), validación de firmas ZIP y control de partes secuenciales obligatorias.
7. **Procesamiento resiliente en navegador:**
   Procesar cada parte de followers de manera secuencial liberando la memoria intermedia antes de la siguiente, informando el progreso en la UI.

---

## Privacidad y Seguridad

- **100% Local:** Todo el procesamiento ocurre en el navegador del usuario. Cero subidas a servidores o endpoints externos.
- **Minimización de Superficie:** Al no leer ni transferir archivos multimedia o conversaciones privadas, se garantiza que datos sensibles fuera del alcance nunca residan en memoria ni en logs.
- **Protección contra descompresión infinita:** Se mantiene un límite estricto de descompresión por entrada JSON individual.

---

## Consecuencias y Plan para Fase 3

- **Positivas:** Los usuarios podrán importar sus exportaciones completas descargadas de Instagram (incluyendo archivos de 232 MB o más) en menos de 100 ms y con consumo mínimo de RAM (< 5 MB).
- **Código a modificar en Fase 3:**
  - `lib/importer.ts`: Implementar el parser liviano de EOCD/Central Directory y extracción selectiva con `File.slice()` + `fflate.inflate()`.
  - `lib/relationships.test.ts`: Añadir pruebas sintéticas con ZIPs que contengan entradas multimedia ficticias de gran tamaño.
  - `components/import-dialog.tsx`: Actualizar mensajes informativos de la UI (eliminar la indicación obsoleta de "ZIP hasta 200 MB").
