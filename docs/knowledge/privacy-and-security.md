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
- El sistema inspecciona los nombres de archivo para identificar únicamente `followers_*.json` y `following.json`.
- **Mensajes privados, fotografías, vídeos, audios y otros JSONs no relacionados nunca deben extraerse, acumularse ni retenerse en memoria.**
- Aceptar el archivo ZIP completo de la exportación significa facilitar la experiencia del usuario sin forzarlo a manipular el archivo externamente; **no significa descomprimir indiscriminadamente todo su contenido**.

---

## 3. Gestión de Recursos y Protección DoS: Estado Actual vs. Objetivo

### Límites en el Código Actual (`lib/importer.ts`)
Para evitar bloqueos o consumos de memoria incontrolados, el código actual aplica umbrales rígidos:
- **Límite total de archivo:** 200 MB combinados (`MAX_ARCHIVE`).
- **Límite descompreso acumulado:** 30 MB / 1.000 archivos JSON (`MAX_JSON`).
- **Un solo ZIP por importación:** Bloquea múltiples archivos ZIP simultáneos para evitar mezcla accidental de snapshots.

*Diagnóstico de seguridad:* Si bien el límite de 200 MB previene la carga de archivos masivos, resulta contraproducente para exportaciones legítimas que contienen multimedia y pesan más de 200 MB (por ejemplo, 232 MB), aun cuando sus JSONs representen menos de 1 MB.

### Criterio Objetivo (ADR-0004)
En la arquitectura objetivo:
- **No se rechazará un archivo legítimo por el mero hecho de superar los 200 MB.**
- Las defensas se focalizan en el contenido real procesado:
  1. **Protección contra Zip Bombs:** Límites dinámicos sobre el tamaño descompreso admitido por cada archivo JSON individual relevante.
  2. **Consumo de memoria acotado:** Descompresión y lectura incremental por bloques, evitando cargar todo el ZIP en un único `ArrayBuffer`.
  3. **Control de fallos de memoria:** Si el navegador o el dispositivo móvil no dispone de suficiente memoria para completar el análisis, la aplicación debe capturar el error y comunicarlo claramente sin congelar la interfaz ni dejar la pestaña en un estado irrecuperable.
- **Sin falsas promesas:** No se promete capacidad infinita de procesamiento. Todo procesamiento en cliente está sujeto a los límites de memoria física del dispositivo y a los topes de asignación de memoria del navegador.

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
