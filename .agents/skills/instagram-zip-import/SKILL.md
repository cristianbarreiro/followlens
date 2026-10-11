---
name: instagram-zip-import
description: Guía especializada para diseñar, modificar, depurar y validar la importación y descompresión de exportaciones oficiales de Instagram (ZIP y JSON) en FollowLens.
---

# Skill: instagram-zip-import

Esta Skill establece el procedimiento técnico para trabajar sobre el pipeline de importación de FollowLens (`lib/importer.ts`, `lib/relationships.ts`, `components/import-dialog.tsx`).

---

## 1. Principios y Lectura Previa Obligatoria

Antes de proponer o aplicar cambios al importador:

1. Consultar [AGENTS.md](../../../AGENTS.md) para verificar las invariantes no negociables.
2. Leer [docs/knowledge/data-flow.md](../../../docs/knowledge/data-flow.md) (flujo actual vs. objetivo).
3. Leer [docs/knowledge/privacy-and-security.md](../../../docs/knowledge/privacy-and-security.md) (contención local y límites de recursos).
4. Leer [docs/knowledge/decisions/0004-incremental-zip-processing.md](../../../docs/knowledge/decisions/0004-incremental-zip-processing.md).

---

## 2. Diagnóstico: Estado Anterior vs. Estado Implementado

| Dimensión                | Estado Anterior (Fases 1–2)                                                   | Estado Implementado (Fase 3 / ADR-0004)                                         |
| ------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Lectura ZIP**          | `new Uint8Array(await file.arrayBuffer())` cargaba todo el archivo.           | Lectura selectiva por rangos vía `File.slice()` (`lib/zip.ts`).                 |
| **Límite de Archivo**    | Límite rígido de 200 MB (`MAX_ARCHIVE`).                                      | Sin límite arbitrario de peso total; admite exportaciones oficiales completas.  |
| **Descompresión**        | `fflate.unzip` monolítico en memoria.                                         | Extracción selectiva LFH/data y streaming DEFLATE acotado (≤ 30 MB).            |
| **Filtro de Contenido**  | Ignoraba archivos no coincidentes con `fileKind()`.                           | Inspección de Directorio Central; cero I/O o descompresión de multimedia y DMs. |
| **Validación de Partes** | Exige secuencia estricta (`followers_1.json`, `followers_2.json` sin saltos). | **Invariante:** Preservada intacta la detección de partes faltantes.            |

---

## 3. Reglas Técnicas de Ejecución

1. **Inspeccionar Dependencias Reales:**
   Consultar `package.json` para verificar la versión exacta instalada de `fflate` (`0.8.3`). Analizar las APIs realmente disponibles en esa versión (`fflate.Unzip`, streams, callbacks) antes de proponer una arquitectura de descompresión.
2. **Realismo sobre el Consumo de Memoria:**
   No asumir que procesar por bloques elimina mágicamente todo el uso de memoria. Aunque no se retenga el ZIP completo en un búfer, los objetos JavaScript generados al deserializar JSONs masivos consumen memoria en el heap del motor V8.
3. **Diseño Riguroso de Pruebas:**
   Diseñar pruebas sintéticas que diferencien con claridad:
   - Tamaño del archivo comprimido (e.g. archivo grande por contener binarios ignorados).
   - Tamaño descompreso acumulado.
   - Cantidad total de entradas en el archivo.
   - Tamaño de los JSONs individuales relevantes.
4. **Compatibilidad Estricta de Esquemas (JSON y HTML):**
   Mantener total soporte para los esquemas soportados:
   - Formato JSON plano: `[ { "string_list_data": [ { "value": "user" } ] } ]`
   - Formato JSON envuelto: `{ "relationships_following": [ ... ] }`
   - Formato HTML oficial: documentos `followers_*.html` y `following.html` con extracción pasiva vía `DOMParser`, resolución de URLs `/user` y `/_u/user`, encabezados `<h2>` y decodificación de entidades.
   - Listas vacías legítimas (`[]` o HTML con 0 registros).
   - Prohibición de formatos mezclados: rechazar lotes que mezclen archivos JSON y HTML.
5. **Detección de Partes Faltantes:**
   Preservar el rechazo categórico si faltan partes secuenciales de seguidores en JSON o HTML (e.g. presencia de `followers_1` y `followers_3` pero falta `followers_2`).
6. **Aislamiento Multicuenta:**
   Rechazar importaciones que contengan múltiples directorios de cuentas en colisión o más de un archivo ZIP simultáneo.
7. **Prohibición de Datos Reales en Fixtures:**
   **Nunca** utilizar exportaciones reales ni datos personales de usuarios para fixtures de prueba, logs ni commits. Utilizar exclusivamente generadores sintéticos en memoria (`fflate.zipSync`).
8. **Validación con Exportación Real:**
   En la Fase 5 quedó empíricamente validada la importación completa con un archivo físico de ~232 MB (243 MB) en formato HTML, completando el análisis de 84 seguidores y 276 seguidos en 224 ms con solo 282 KB leídos del disco y 2 MB de memoria heap.
