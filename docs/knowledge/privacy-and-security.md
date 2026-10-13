---
okf_version: "0.2"
type: Privacy Model
title: Modelo de Privacidad y Seguridad
description: Garantías de privacidad en cliente, contención de datos, gestión de memoria y mitigaciones de seguridad.
tags:
  - privacy
  - security
  - client-side
  - indexeddb
  - sanitization
  - resource-limits
timestamp: "2026-10-11T02:00:00-03:00"
lifecycle: stable
---

# Modelo de Privacidad y Seguridad de FollowLens

Este documento establece formalmente el modelo de confianza, los límites de contención de datos personales y las mitigaciones de seguridad implementadas y planificadas en FollowLens.

---

## 1. Principio Rector: Soberanía de Datos en Cliente

FollowLens opera bajo el principio no negociable de **cero transmisión de datos personales**.
- Los archivos exportados de Instagram se leen directamente desde el sistema de archivos del usuario mediante la File API del navegador.
- El análisis, cruce de conjuntos y renderizado de resultados ocurre de forma exclusiva en el contexto de ejecución local de JavaScript.
- No existen servidores de backend, funciones serverless, buckets de almacenamiento ni bases de datos remotas intermediarias.

> [!CAUTION]
> **Regla Inquebrantable:**
> Queda estrictamente prohibido introducir llamadas de red (`fetch`, `axios`, beacons, SDKs de telemetría o logs remotos) que transmitan listas de usuarios, nombres, identificadores o metadatos de las exportaciones.

---

## 2. Superficie de Exposición y Filtrado Selectivo

Cuando un usuario descarga su archivo de Instagram, el archivo ZIP completo suele incluir fotos, historias, vídeos, audios y mensajes directos privados (DMs).

FollowLens implementa **filtrado selectivo estricto**:
- El sistema inspecciona los nombres de archivo para identificar únicamente los archivos relacionales (`followers_*.json`, `followers_*.html`, `following.json` y `following.html`).
- **Mensajes privados, fotografías, vídeos, audios y otros archivos no relacionados nunca deben extraerse, acumularse ni retenerse en memoria.**
- Aceptar el archivo ZIP completo de la exportación significa facilitar la experiencia del usuario sin forzarlo a manipular el archivo externamente; **no significa descomprimir indiscriminadamente todo su contenido**.

---

## 3. Gestión de Recursos y Protección DoS: Estado Actual vs. Objetivo

### Límites en el Código Actual (`lib/importer.ts` y `lib/zip.ts`)
Para evitar bloqueos o consumos de memoria incontrolados, el código aplica límites al contenido inspeccionado y procesado:
- **Tamaño total del ZIP:** No hay un límite fijo de tamaño para el archivo contenedor. El EOCD y el Directorio Central se leen por rangos; el Directorio Central tiene un presupuesto máximo de 16 MiB.
- **Entradas relacionales ZIP:** Se procesan hasta 1.000 entradas relevantes; cada entrada y el total de datos comprimidos y descomprimidos relevantes están limitados a 30 MiB.
- **Archivos individuales:** Los archivos JSON/HTML seleccionados por separado tienen un límite acumulado de 30 MiB.
- **Lectura selectiva:** Los bytes de archivos no relacionales (medios, mensajes y otros datos) no se leen desde el ZIP ni se descomprimen.
- **Descompresión:** DEFLATE se procesa en fragmentos con límite de salida; JSON y HTML se analizan por archivo (`JSON.parse` / `DOMParser`), no mediante parsers de documentos en streaming.
- **Un solo ZIP por importación:** Se rechaza la selección simultánea de varios ZIP para evitar mezclar exportaciones.

### Evolución y límites del procesamiento local (ADR-0004)
- No se rechaza un ZIP por el mero tamaño total del archivo; los topes se aplican al Directorio Central y a las entradas relacionales procesadas.
- La lectura selectiva por rangos y la descompresión acotada reducen lecturas y buffers innecesarios, pero no implican consumo constante de memoria: el contenido relevante y los objetos creados por `JSON.parse` o `DOMParser` usan memoria local.
- Si el navegador o el dispositivo móvil no dispone de recursos suficientes para completar el análisis, la aplicación debe comunicar el fallo sin dejar la interfaz en un estado irrecuperable.
- **Sin falsas promesas:** Todo procesamiento en cliente está sujeto a los límites de memoria física del dispositivo y a los topes de asignación del navegador.

---

## 4. Persistencia Local en IndexedDB

- **En memoria por defecto:** Cada importación procesada reside en el estado React (`app/page.tsx`) y se descarta al recargar la página.
- **Persistencia explícita:** El usuario debe marcar voluntariamente el checkbox `Guardar en este navegador para futuras comparaciones`.
- **Almacenamiento:** Base de datos IndexedDB nombrada `followlens-local`, almacén `snapshots`.
- **Aislamiento de Origen:** Los datos guardados pertenecen exclusivamente al origen web (`origin`) del navegador y no se comparten entre navegadores ni perfiles.
- **Eliminación:** La interfaz permite al usuario eliminar snapshots individuales en cualquier momento mediante `deleteSnapshot(id)`. Borrar los datos de navegación elimina la base por completo.

---

## 5. Sanitización y Prevención de Inyecciones

1. **Normalización de Nombres de Usuario (`lib/relationships.ts`):**
   - Se valida contra una expresión regular estricta:
     ```ts
     /^[a-z0-9._]{1,30}$/.test(name)
     ```
   - Nombres que contengan etiquetas HTML (`<script>`), caracteres de control o intentos de inyección de fórmulas de hoja de cálculo (`=SUM(...)`, `@`, `+`, `-`) son automáticamente rechazados o normalizados.
2. **Exportación CSV Segura:**
   - Todos los campos de texto se entrecomillan escapando comillas internas: `"${s.replaceAll('"', '""')}"`.
   - Se inyecta la marca de orden de bytes UTF-8 (`\uFEFF`) al inicio del archivo para garantizar que Excel y editores de texto interpreten correctamente los caracteres sin alterar las cadenas.

---

## 6. Integridad de los Datos y Riesgos Inherentes

- **Cuentas Desactivadas o Renombradas:** Si un usuario cambia de username o desactiva su cuenta entre dos exportaciones, el análisis matemático lo detectará como una "cuenta perdida" y una "cuenta nueva".
- **Exportaciones Incompletas:** Si faltan partes de `followers_*.json`, la importación se rechaza para evitar generar falsos positivos de unfollow.
- **Observación Discreta:** Las fechas corresponden al día de la exportación, no al momento exacto en que ocurrió la acción en la red social.
