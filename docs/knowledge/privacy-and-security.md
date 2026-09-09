---
okf_version: "0.2"
type: Privacy Model
title: Modelo de Privacidad y Seguridad
description: Garantías de privacidad en cliente, límites de contención de datos y mitigaciones de seguridad en FollowLens.
tags:
  - privacy
  - security
  - client-side
  - indexeddb
  - sanitization
timestamp: "2026-09-07T14:20:00-03:00"
lifecycle: stable
---

# Modelo de Privacidad y Seguridad de FollowLens

Este documento establece formalmente el modelo de confianza, los límites de contención de datos personales y las mitigaciones de seguridad implementadas en FollowLens.

---

## 1. Principio Rector: Soberanía de Datos en Cliente

FollowLens opera bajo el principio de **cero transmisión de datos personales**.
- Los archivos exportados de Instagram se leen directamente desde el sistema de archivos del usuario mediante la File API del navegador.
- El análisis, cruce de conjuntos y renderizado de resultados ocurre de forma exclusiva en el contexto de ejecución local de JavaScript.
- No existen servidores de backend, funciones serverless, buckets S3/R2 ni bases de datos remotas conectadas para procesar información de usuarios.

> [!CAUTION]
> **Regla de Oro para Desarrolladores y Agentes:**  
> Queda estrictamente prohibido introducir llamadas de red (`fetch`, `axios`, beacons, SDKs de analítica o logs remotos) que transmitan listas de usuarios, nombres o identificadores de Instagram.

---

## 2. Superficie de Exposición y Filtrado Selectivo

Cuando un usuario descarga su archivo de Instagram, el archivo ZIP completo suele incluir fotos, historias, mensajes directos (DMs) y metadatos sensibles.

FollowLens implementa **filtrado selectivo en streaming** a nivel de descompresor (`lib/importer.ts`):
- El descompresor (`fflate.unzip`) evalúa cada entrada mediante un callback de filtrado:
  ```ts
  filter: (file) => {
    if (!fileKind(file.name)) return false;
    ...
  }
  ```
- Solo las entradas cuyos nombres coinciden con `/^followers(?:_\d+)?\.json$/` o `/^following(?:_\d+)?\.json$/` son leídas y descomprimidas.
- **Mensajes, fotos, videos y otros JSONs (e.g. `messages/message_1.json`, `media/`) se descartan antes de descomprimirse en memoria.**

---

## 3. Límites de Contención y Protección DoS

Para prevenir bloqueos de pestaña, saturación de memoria RAM o ataques de descompresión maliciosa (*zip bombs*), se aplican límites estrictos:
- **Límite de archivo de entrada:** 200 MB combinados.
- **Límite de descompresión JSON:** Máximo 30 MB descompresos acumulados.
- **Límite de cantidad de archivos:** Máximo 1.000 archivos por ZIP.
- **Un solo ZIP por importación:** Para comparar fechas distintas se deben realizar importaciones separadas, evitando mezcla accidental de archivos.

---

## 4. Persistencia Local en IndexedDB

- **En memoria por defecto:** Cada importación procesada reside en el estado React (`app/page.tsx`) y se descarta al recargar la página.
- **Persistencia explícita:** El usuario debe marcar voluntariamente el checkbox `Conservar esta importación en este navegador para futuras comparaciones`.
- **Almacenamiento:** Base de datos IndexedDB nombrada `followlens-local`, almacén `snapshots`.
- **Aislamiento de Origen:** Los datos guardados pertenecen exclusivamente al origen web (`origin`) del navegador y no se comparten entre navegadores ni perfiles.
- **Eliminación:** La interfaz permite al usuario eliminar snapshots individuales en cualquier momento mediante `deleteSnapshot(id)`. Borrar los datos del navegador elimina la base por completo.

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

## 6. Riesgos Inherentes a las Exportaciones de Instagram

FollowLens informa claramente al usuario sobre las limitaciones intrínsecas de las exportaciones:
- **Cuentas Desactivadas o Renombradas:** Si un usuario cambia de username o desactiva su cuenta entre dos exportaciones, el análisis matemático lo detectará como una "cuenta perdida" y una "cuenta nueva".
- **Exportaciones Incompletas:** Si el usuario no descarga el rango "Todo el tiempo" o no incluye todas las partes de `followers_*.json`, los resultados pueden diferir de la realidad de su cuenta.
- **Observación Discreta:** Las fechas de "unfollow" corresponden a la fecha en que el usuario realizó la exportación de datos, no al momento exacto en que ocurrió la acción en la red social.
