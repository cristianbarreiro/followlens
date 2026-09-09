---
okf_version: "0.2"
type: Architecture
title: Flujo de Importación y Transformación de Datos
description: Pipeline detallado de descompresión, sanitización, compatibilidad de esquemas JSON y validaciones.
tags:
  - data-flow
  - importer
  - json
  - zip
  - fflate
timestamp: "2026-09-07T14:20:00-03:00"
lifecycle: stable
---

# Flujo de Importación y Transformación de Datos

Este documento describe la secuencia paso a paso implementada en `lib/importer.ts` y `lib/relationships.ts` para procesar archivos de exportación de Instagram.

---

## 1. Diagrama del Pipeline

```
[Usuario selecciona ZIP o JSONs]
                │
                ▼
1. Pre-validación de Archivos
   - ¿Array vacío? → Error
   - ¿Tamaño total > 200 MB? → Error
   - ¿Más de un archivo ZIP? → Error
                │
                ▼
2. Extracción / Lectura
   - CASO ZIP: fflate.unzip con filtro streaming (ignora mensajes/fotos)
     * Límite: ≤ 30 MB descompreso / ≤ 1.000 archivos
   - CASO JSON: Lectura individual con acumulación y límite de 30 MB
                │
                ▼
3. Clasificación y Validación Estructural
   - fileKind(): Identifica 'followers' o 'following' por nombre de archivo
   - Detección de duplicados de cuenta (mismo base name en diferentes carpetas)
   - Extracción de índices de partes: followers_1.json, followers_2.json...
                │
                ▼
4. Deserialización JSON y Limpieza
   - Limpieza de BOM UTF-8 (^\uFEFF)
   - JSON.parse() con captura de errores sintácticos
                │
                ▼
5. Normalización de Registros (parseRelationships)
   - Detección de esquema: Array plano o envuelto en { relationships_* }
   - Extracción de username prioritario:
     1) string_list_data[0].value
     2) row.title
     3) URL parse de string_list_data[0].href (e.g. instagram.com/_u/{username})
   - Validación y normalización regex: normalize()
   - Descarte de duplicados dentro de la misma lista
                │
                ▼
6. Verificaciones Finales de Integridad
   - ¿Se encontraron ambas listas (followers y following)? → Obligatorio
   - ¿Hay saltos en las partes de followers? (e.g. 1, 3 falta 2) → Error
                │
                ▼
[Retorno de { followers: string[], following: string[], fileCount: number }]
```

---

## 2. Compatibilidad con Esquemas de Instagram

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

## 3. Manejo de Casos Extremos

- **Listas vacías legítimas:** Cuentas nuevas o sin seguidos (`[]` o `{"relationships_following": []}`) son aceptadas como snapshots válidos de longitud cero.
- **Registros incompletos:** Si un objeto no contiene ninguna vía válida para identificar al usuario, se lanza una excepción para evitar que una lista parcial falsee las comparaciones de seguidores perdidos.
- **Partes faltantes:** Si un usuario con muchos seguidores recibe `followers_1.json` y `followers_2.json`, e intenta importar solo `followers_1.json`, FollowLens requiere confirmación expresa de que la lista está completa para evitar falsos positivos de unfollow.
