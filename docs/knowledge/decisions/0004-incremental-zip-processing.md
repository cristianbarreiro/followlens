---
okf_version: "0.2"
type: Decision
title: ADR-0004 - Procesamiento Progresivo e Incremental de Exportaciones ZIP
description: Admisión de exportaciones oficiales de gran tamaño (>200 MB) mediante inspección y descompresión selectiva incremental sin límites totales arbitrarios.
tags:
  - decision
  - adr
  - zip
  - streaming
  - importer
  - memory
timestamp: "2026-10-11T02:00:00-03:00"
lifecycle: pending
---

# ADR-0004: Procesamiento Progresivo e Incremental de Exportaciones ZIP

## Estado
**Propuesto / Pendiente de Implementación** (Objetivo técnico para Fases 2, 3 y 4)

---

## Contexto

FollowLens procesa exportaciones oficiales descargadas por los usuarios desde Instagram. Actualmente, `lib/importer.ts` impone dos restricciones rígidas de tamaño:
1. `MAX_ARCHIVE = 200 * 1024 * 1024` (200 MB): Rechaza de plano cualquier archivo o conjunto de archivos que supere este tamaño comprimido.
2. `MAX_JSON = 30 * 1024 * 1024` (30 MB): Límite sobre el contenido descompreso acumulado.

Además, la implementación actual lee el archivo ZIP completo en un búfer contiguo mediante `new Uint8Array(await zipped[0].arrayBuffer())` y acumula todas las entradas extraídas en un diccionario en memoria (`Record<string, Uint8Array>`) antes de deserializarlas secuencialmente.

En la práctica, una exportación oficial completa de Instagram que incluye fotografías, vídeos, historias y audios de la cuenta supera con frecuencia los 200 MB (por ejemplo, una exportación real de referencia pesa **232 MB**). Sin embargo, dentro de ese archivo de 232 MB, los archivos relevantes para el análisis (`followers_*.json` y `following.json`) suelen ocupar apenas unos pocos cientos de kilobytes o unos pocos megabytes. Rechazar el archivo legítimo únicamente por su tamaño total comprimido degrada la experiencia de usuario y contradice el objetivo de procesar la exportación completa directamente descargada de la plataforma.

---

## Decisión Objetivo

1. **Eliminación del umbral arbitrario de tamaño total:**
   No rechazar una exportación legítima de Instagram únicamente porque el archivo ZIP supere los 200 MB.
2. **Inspección de estructura sin descompresión ciega:**
   Leer la tabla central / encabezados del ZIP para catalogar las entradas disponibles sin descomprimir datos no solicitados.
3. **Descompresión progresiva y selectiva:**
   Extraer de forma incremental únicamente las entradas que coincidan con los patrones de seguidores (`followers_*.json`) y seguidos (`following.json`).
4. **Descarte estricto de contenido ajeno:**
   No extraer, acumular ni almacenar en memoria imágenes, vídeos, audios, historias ni mensajes directos.
5. **Alcance inicial acotado:**
   La primera versión funcional analizará exclusivamente relaciones de seguidores y seguidos (mutuos, no recíprocos, fans y comparaciones temporales). Futuros analizadores de otras categorías se añadirán como módulos independientes en fases posteriores.
6. **Mantenimiento de protecciones de seguridad (DoS / Zip-bomb):**
   Conservar salvaguardas proporcionales contra entradas malformadas, descompresión expansiva maliciosa (zip bombs) y límites razonables por entrada JSON individual, sin aplicar un límite ciego al ZIP original.
7. **Procesamiento resiliente en navegador:**
   Diseñar el procesamiento para que la memoria se libere progresivamente y, si el dispositivo móvil o de bajos recursos agota su capacidad, se notifique el fallo de manera clara y controlada sin congelar indefinidamente la pestaña.

---

## Privacidad y Seguridad

- **100% Local:** Todo el procesamiento incremental se mantendrá estrictamente dentro del navegador del usuario. Cero subidas a servidores o endpoints externos.
- **Minimización de Superficie:** Al no descomprimir ni almacenar archivos multimedia ni conversaciones privadas en memoria, se reduce el riesgo de exposición o retención accidental en el runtime.
- **Protección contra descompresión infinita:** Se limitará el tamaño descompreso admitido por cada archivo JSON individual relevante.

---

## Limitaciones Reconocidas

- El tamaño comprimido del archivo no determina por sí solo si el dispositivo dispone de recursos para procesarlo. Dispositivos con poca memoria disponible pueden tener dificultades si los JSON individuales son extremadamente voluminosos.
- La librería `fflate` (versión 0.8.3 instalada) dispone de capacidades asíncronas y por bloques que deben evaluarse técnicamente en la Fase 2 para garantizar compatibilidad con Web Workers o Streams del navegador.

---

## Consecuencias

- **Positivas:** Los usuarios podrán importar sus exportaciones completas descargadas directamente de Instagram (incluyendo archivos de 232 MB o mayores) sin necesidad de abrir, filtrar o reempaquetar manualmente el archivo en su sistema operativo.
- **Arquitectónicas:** `lib/importer.ts` requerirá una reestructuración técnica modular, separando la inspección de entradas, la extracción progresiva y el parseo de registros.
- **Validación:** Se necesitarán nuevas pruebas unitarias y de integración con fixtures sintéticos que simulen archivos grandes con contenido multimedia dummy ignorado.
