---
okf_version: '0.2'
type: Architecture
title: Flujo de Importación y Transformación de Datos
description: Pipeline actual vs. pipeline objetivo de importación incremental, compatibilidad de esquemas JSON y validaciones.
tags:
  - data-flow
  - importer
  - json
  - zip
  - incremental-pipeline
timestamp: '2026-10-11T02:00:00-03:00'
lifecycle: stable
---

# Flujo de Importación y Transformación de Datos

Este documento describe la secuencia técnica del procesamiento de exportaciones oficiales de Instagram, comparando el flujo implementado actualmente en el código con el flujo objetivo diseñado bajo el [ADR-0004](decisions/0004-incremental-zip-processing.md).

---

## 1. Flujo Implementado (`lib/zip.ts` y `lib/importer.ts`)

```
[Usuario selecciona ZIP, JSONs o HTMLs]
                │
                ▼
1. Pre-validación
   - ¿Array vacío? → Error
   - ¿Más de un archivo ZIP? → Error
   - (Sin límite arbitrario de 200 MB para el archivo ZIP)
                │
                ▼
2. Extracción Selectiva / Lectura por Rangos
   - CASO ZIP: Lectura selectiva por rangos (File.slice) vía `readZipSelective`
     * Búsqueda de EOCD en los últimos 65.557 bytes
     * Detección y rechazo controlado de ZIP64 y multidisco
     * Lectura e inspección del Directorio Central (presupuesto ≤ 16 MB)
     * Filtrado de entradas relacionales vía fileKind() (máx. 1.000 entradas)
     * Descarte completo de medios (fotos, vídeos, reels) y DMs sin leer sus bytes
     * Validación de cabeceras locales (LFH), offsets y descriptor de datos (bit 3)
     * Descompresión STORE / streaming DEFLATE acotada (≤ 30 MB por entrada y total)
     * Verificación estricta de CRC32 (IEEE 802.3) y longitud real descomprimida
   - CASO ARCHIVOS SUELTOS: Lectura secuencial en memoria con límite acumulado de 30 MB
                │
                ▼
3. Clasificación y Validación Estructural
   - fileInfo(): Identifica 'followers'/'following' y formato 'json'/'html'
   - Rechazo de formatos mezclados (no mezclar JSON y HTML en una misma exportación)
   - Detección de colisiones de carpetas (mismo nombre base en diferentes rutas)
   - Extracción de índices de partes: followers_1, followers_2...
                │
                ▼
4. Parsing según Formato de Entrada
   - RAMA JSON: Limpieza BOM UTF-8 y JSON.parse()
     * parseRelationships(): Formato plano vs. envuelto, title/href
   - RAMA HTML: Decodificación de texto y DOMParser
     * parseHtmlRelationships(): Extracción desde enlaces de perfil /_u/, entidades, h2
                │
                ▼
5. Normalización y Deduplicación
   - normalize(): validación estricta de username (1..30 caracteres, a-z0-9._)
   - Descarte de duplicados por Set
                │
                ▼
6. Verificaciones Finales de Integridad
   - Presencia obligatoria de ambas listas (followers y following)
   - Verificación de partes continuas de followers (sin saltos 1 → 3)
                │
                ▼
[Retorno de { followers: string[], following: string[], fileCount: number }]
```

---

## 2. Flujo Objetivo (Diseño Incremental — Fases 2 a 4)

El nuevo flujo resuelve el cuello de botella de memoria y el límite artificial de 200 MB mediante procesamiento progresivo:

```
1. Selección del ZIP Oficial
   - Usuario arrastra o selecciona el archivo descargado de Instagram (sin rechazo por peso total > 200 MB).
                │
                ▼
2. Inspección de Estructura y Metadatos
   - Lectura de la tabla central de entradas del ZIP sin descomprimir los contenidos.
   - Detección de cuentas, rutas internas y nombres de archivo.
                │
                ▼
3. Identificación de Entradas Compatibles
   - Reconocimiento de followers_*.json y following.json según patrones conocidos.
   - Descarte formal de medios (fotos, vídeos, reels) y mensajes sin cargarlos en memoria.
                │
                ▼
4. Descompresión Progresiva
   - Extracción incremental (chunked / streaming) de las entradas seleccionadas.
   - Control de límites de descompresión por archivo JSON individual (protección zip-bomb).
                │
                ▼
5. Validación y Lectura de los JSON Relevantes
   - Limpieza de BOM UTF-8.
   - Deserialización segura y eficiente del contenido de cada parte.
                │
                ▼
6. Normalización de Usuarios
   - Ejecución de normalize() para cada entrada encontrada.
   - Eliminación de duplicados y descarte de intentos de inyección.
                │
                ▼
7. Validación de la Integridad de las Listas
   - Comprobación de que no falten partes intermedias en followers_*.json.
   - Validación de que followers y following pertenezcan a la misma exportación.
                │
                ▼
8. Cálculo de Relaciones
   - Cálculo de conjuntos (mutuos, no recíprocos, fans) en lib/relationships.ts.
   - Cálculo diferencial contra snapshot anterior si existe.
                │
                ▼
9. Devolución de Resultados Verificables a la Interfaz
   - Presentación de métricas y tablas en React.
   - Opción de persistencia voluntaria en IndexedDB.
```

> [!NOTE]
> La arquitectura de extracción selectiva por rangos e inspección de directorio central está implementada en `lib/zip.ts` y conectada en `lib/importer.ts` (Fase 3). La validación y medición formal de rendimiento en navegadores reales con exportaciones completas (~232 MB) se completará en la Fase 4.

---

## 3. Compatibilidad con Esquemas de Instagram

Instagram ha variado la estructura de sus archivos JSON a lo largo de las versiones. FollowLens soporta de forma nativa:

### Formato Plano (Array directo)

Común en `followers_*.json`:

```json
[
  {
    "title": "",
    "string_list_data": [
      {
        "href": "https://www.instagram.com/_u/ejemplo",
        "value": "ejemplo",
        "timestamp": 1700000000
      }
    ]
  }
]
```

### Formato Envuelto (Objeto raíz con clave)

Común en `following.json`:

```json
{
  "relationships_following": [
    {
      "title": "otro_usuario",
      "string_list_data": [
        {
          "href": "https://www.instagram.com/_u/otro_usuario",
          "value": "otro_usuario",
          "timestamp": 1700000000
        }
      ]
    }
  ]
}
```

### Cuentas sin `value` explícito

En algunas versiones, `value` está vacío pero el nombre figura en `title` o dentro de la URL `href` (`instagram.com/_u/{usuario}`). El parser extrae y normaliza el identificador de forma segura en cualquiera de estas variantes.

---

## 4. Manejo de Casos Extremos

- **Listas vacías legítimas:** Cuentas nuevas o sin seguidos (`[]` o `{"relationships_following": []}`) son aceptadas como snapshots válidos de longitud cero.
- **Registros incompletos:** Si un objeto no contiene ninguna vía válida para identificar al usuario, se lanza una excepción para evitar que una lista parcial falsee las comparaciones de seguidores perdidos.
- **Partes faltantes:** Si un usuario con muchos seguidores recibe `followers_1.json` y `followers_2.json`, e intenta importar solo `followers_1.json`, FollowLens rechaza la importación para evitar falsos positivos de unfollow.
