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
timestamp: '2026-10-13T16:58:20-03:00'
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
     * Filtrado de nombres relacionales vía fileKind() y selección contextual de rutas
     * Prioridad a `connections/followers_and_following/`; descarta homónimos en otras secciones
     * Sin esa ruta conocida, exige que todas las candidatas estén en una única carpeta
     * Conserva el rechazo de colisiones dentro de la carpeta elegida y de varias carpetas ambiguas
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
   - Resolución contextual de carpetas relacionales ZIP antes de extraer sus bytes
   - Rechazo de colisiones de nombres dentro de la carpeta elegida y de carpetas ambiguas
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
   - Identificación del prefijo __deleted__; se devuelve la lista aparte sin quitar los marcadores del snapshot
                │
                ▼
6. Verificaciones Finales de Integridad
   - Presencia obligatoria de ambas listas (followers y following)
   - Verificación de partes continuas de followers (sin saltos 1 → 3)
                │
                ▼
[Retorno de followers, following, fileCount y detectedUnavailableProfiles]
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
> La arquitectura de extracción selectiva por rangos e inspección de directorio central está implementada en `lib/zip.ts` y conectada en `lib/importer.ts`, con soporte dual JSON/HTML y parser pasivo en `lib/html-parser.ts` plenamente validado.

---

## 3. Compatibilidad con Esquemas de Instagram

Instagram ha variado la estructura de sus archivos a lo largo de las versiones. FollowLens soporta de forma nativa:

### Formato Plano JSON (Array directo)

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

### Formato Envuelto JSON (Objeto raíz con clave)

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

### Formato HTML Oficial (DOMParser pasivo)

Común en exportaciones HTML de Instagram (`followers_*.html`, `following.html`):
- Si hay bloques `._a6-p`, se priorizan sobre envoltorios `.uiBoxWhite`; se inspeccionan todos los enlaces de perfil válidos dentro de cada registro para no perder usuarios anidados.
- Los `href` de JSON y HTML usan el mismo validador: acepta perfiles directos (`/{usuario}`) y slugs de exportación (`/_u/{usuario}`), y rechaza hostnames ajenos, rutas de contenido y rutas reservadas.
- En listas de seguidos, se admite la extracción desde encabezados de registro (`<h2>`) si el enlace no provee directamente el usuario.
- Decodificación automática de entidades HTML (`&commat;`, `&amp;`) mediante `textContent`.

### Cuentas sin `value` explícito

En algunas versiones JSON, `value` está vacío pero el nombre figura en `title` o dentro de una URL de perfil válida en `href` (`instagram.com/_u/{usuario}`). Un `href` que apunta a una publicación, ruta reservada o hostname ajeno no se convierte en nombre de usuario.

---

## 4. Manejo de Casos Extremos

- **Listas vacías legítimas:** Cuentas nuevas o sin seguidos (`[]`, `{"relationships_following": []}` o documentos HTML con encabezados relacionales reconocidos pero 0 registros) son aceptadas como snapshots válidos de longitud cero.
- **Registros incompletos o documentos ajenos:** Si un objeto o documento HTML no contiene ninguna vía válida para identificar al usuario o proviene de una página ajena, se lanza una excepción controlada para evitar que una lista parcial o vacía falsee las comparaciones de seguidores perdidos.
- **Partes faltantes:** Si un usuario con muchos seguidores recibe `followers_1` y `followers_2`, e intenta importar solo `followers_1`, FollowLens rechaza la importación para evitar falsos positivos de unfollow.
- **Prohibición de formatos mezclados:** Se rechaza cualquier lote que intente combinar archivos JSON y HTML en la misma importación.
