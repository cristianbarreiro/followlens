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

## 2. Diagnóstico: Estado Actual vs. Estado Objetivo

| Dimensión | Estado Actual en Código | Estado Objetivo (Fases 2–4) |
|---|---|---|
| **Lectura ZIP** | `new Uint8Array(await file.arrayBuffer())` carga todo el archivo en memoria. | Lectura incremental por bloques (streams / slices). |
| **Límite de Archivo** | Límite rígido de 200 MB (`MAX_ARCHIVE`). | No rechazar ZIP legítimo por peso total; procesar incrementalmente. |
| **Descompresión** | `fflate.unzip` con filtro, pero acumulando en `Record<string, Uint8Array>`. | Extracción progresiva y selectiva de las entradas necesarias. |
| **Filtro de Contenido** | Ignora archivos no coincidentes con `fileKind()`. | Mantener descarte estricto de multimedia (fotos/vídeos) y DMs. |
| **Validación de Partes** | Exige secuencia estricta (`followers_1.json`, `followers_2.json` sin saltos). | **Invariante:** Preservar intacta la detección de partes faltantes. |

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
4. **Compatibilidad Estricta de Esquemas:**
   Mantener total soporte para los esquemas soportados:
   - Formato plano: `[ { "string_list_data": [ { "value": "user" } ] } ]`
   - Formato envuelto: `{ "relationships_following": [ ... ] }`
   - Resolución de nombres vía `title` o extracción de username desde URL `href` (`instagram.com/_u/{user}`).
   - Listas vacías legítimas (`[]`).
5. **Detección de Partes Faltantes:**
   Preservar el rechazo categórico si faltan partes secuenciales de seguidores (e.g. presencia de `followers_1.json` y `followers_3.json` pero falta `followers_2.json`).
6. **Aislamiento Multicuenta:**
   Rechazar importaciones que contengan múltiples directorios de cuentas en colisión o más de un archivo ZIP simultáneo.
7. **Prohibición de Datos Reales en Fixtures:**
   **Nunca** utilizar exportaciones reales ni datos personales de usuarios para fixtures de prueba, logs ni commits. Utilizar exclusivamente generadores sintéticos en memoria (`fflate.zipSync`).
8. **Validación antes de Declarar Soporte:**
   No afirmar que el sistema soporta exportaciones de 232 MB hasta que la implementación haya sido codificada y validada con pruebas reproducibles.
