---
okf_version: "0.2"
type: Decision
title: ADR-0007 - Motor integral de verificación de disponibilidad de perfiles (ProfileVerificationEngine)
description: Arquitectura desacoplada en dos capas (cobertura total de auditoría y confirmación objetiva de estados), evaluación de viabilidad de Meta APIs y exclusión conservadora.
tags: [decision, adr, availability, verification-engine, privacy, meta-api, providers]
timestamp: "2026-10-31T15:15:00-03:00"
lifecycle: stable
---

# ADR-0007: Motor integral de verificación de disponibilidad de perfiles

## Estado

Aceptado e implementado. Evoluciona y complementa el [ADR-0006](0006-manual-profile-availability-filter.md) estableciendo una arquitectura modular formal mediante `ProfileVerificationEngine`.

## Contexto

En importaciones con cientos o miles de relaciones (por ejemplo, 797 perfiles únicos con 581 seguidores y 280 seguidos), la implementación inicial limitaba su análisis a la detección sincrónica de marcadores explícitos `__deleted__...` en los archivos descargados. Aunque la interfaz indicaba «Revisión automática en cada importación», existía una ambigüedad fundamental:

1. **Confusión entre cobertura y confirmación:** Auditar el 100 % de los perfiles en el archivo no equivale a haber confirmado la disponibilidad en tiempo real de cada uno.
2. **Ausencia de un modelo de estados formal:** Los perfiles quedaban reducidos a un binario implícito (marcador explícito vs. conservado sin confirmar).
3. **Rigidez de proveedores:** No existía una abstracción que permitiera conectar fuentes autorizadas futuras o registrar el origen, fecha, nivel de confianza y evidencia de cada dictamen.

## Investigación de Viabilidad Técnica: Meta & Instagram Platform

Antes del diseño se realizó una rigurosa auditoría de las capacidades, límites y términos oficiales de Meta:

1. **Meta Graph API (Business Discovery):**
   - **Alcance estricto:** Meta restringe Business Discovery exclusivamente a cuentas de empresa (`Business`) y creadores (`Creator`) públicas.
   - **Imposibilidad en cuentas personales:** Consultar un perfil personal o privado retorna el error `#100 OAuthException: The user is not a business account`. Meta **no ofrece ninguna API oficial para consultar perfiles personales de terceros**.
   - **Cuotas de consulta:** El rate limit estándar es de 200 solicitudes por hora por usuario. Auditar 797 perfiles agotaría de inmediato la cuota de la aplicación.
2. **Evaluación de una cuenta propia de FollowLens (`@followlens.app`):**
   - Disponer de una cuenta dedicada en Instagram **no otorga privilegios** para consultar cuentas personales o privadas arbitrarias mediante la API oficial.
   - Intentar automatizar sesiones web (scraping, emulación de navegador o ingeniería inversa de endpoints móviles) viola la Sección 4.2 de los Términos de Meta y activa bloqueos por IP, desafíos SMS/CAPTCHA y acciones legales.
   - Centralizar las consultas en una cuenta o servidor de FollowLens violaría los Invariantes 1 y 2 del proyecto (100 % procesamiento en cliente y cero telemetría de relaciones personales).
3. **Restricciones de red en el navegador (CORS):**
   - Cualquier petición `fetch()` desde el cliente hacia `www.instagram.com` es bloqueada por el navegador por falta de encabezados CORS permisivos. El modo `no-cors` produce respuestas opacas (`status: 0`), incapaces de distinguir HTTP 200 de 404 o 302.

**Conclusión de viabilidad:** No existe ningún mecanismo universal y autorizado para consultar en vivo perfiles personales de Instagram sin violar términos, comprometer credenciales o romper la privacidad del usuario. La solución debe basarse en fuentes verificables y transparentes, sin simulaciones engañosas.

## Decisión Arquitectónica

### 1. Desacoplamiento de Cobertura vs. Confirmación
El motor distingue dos métricas complementarias:
- **Cobertura de auditoría (100 %):** El motor examina la totalidad de los perfiles únicos encontrados entre seguidores y seguidos, deduplicando cuentas mutuas.
- **Confirmación objetiva de estado:** Solo se clasifica un perfil con certeza cuando existe evidencia técnica real (evidencia documental de exportación o respuesta oficial).

### 2. Módulo Independiente: `ProfileVerificationEngine`
Se implementa una arquitectura desacoplada bajo `lib/profile-availability/`:
- `types.ts`: Contratos, estados y telemetría de progreso.
- `engine.ts`: Coordinador por lotes con soporte para `AbortSignal`, timeouts y retoma de estados.
- `registry.ts`: Registro dinámico de proveedores (`ProviderRegistry`).
- `scheduler.ts`: Evaluación de caducidad y planificación de reintentos.
- `persistence.ts`: Almacenamiento local en IndexedDB (`followlens-local` v3).
- `providers/export-evidence.provider.ts`: Proveedor primario fuera de línea que audita el 100 % de los perfiles basándose en marcadores estructurales de Instagram.
- `providers/official-api.provider.ts`: Proveedor para Meta Graph API, documentando sus limitaciones y respondiendo con precisión a perfiles profesionales cuando esté configurado.

### 3. Modelo de Estados Explícito
Se implementan 9 estados granulares:
- `available`: Perfil verificado y accesible mediante fuente autorizada.
- `deleted_confirmed`: Evidencia fehaciente de eliminación (ej. marcador `__deleted__`).
- `deactivated_confirmed`: Evidencia demostrable de desactivación temporal.
- `suspended_confirmed`: Evidencia verificable de suspensión.
- `private`: Perfil identificado como privado y activo.
- `renamed`: Evidencia de cambio de nombre de usuario.
- `unavailable_unconfirmed`: Cuenta presente en la exportación sin marcadores explícitos; estado en vivo no confirmado externamente.
- `unknown`: Evidencia insuficiente para clasificar.
- `verification_error`: Fallo técnico de conexión, timeout o credenciales.

### 4. Reglas de Exclusión Conservadoras
Para garantizar la integridad de las métricas relacionales:
- **Solo se excluyen** de las estadísticas las cuentas con estado `deleted_confirmed` o `deactivated_confirmed`.
- **Se conservan** las cuentas `available`, `private`, `unavailable_unconfirmed`, `unknown`, `suspended_confirmed` y `verification_error`. Un fallo de red o la falta de confirmación externa nunca debe distorsionar las métricas de seguidores o seguidos.
- **Inmutabilidad:** Los snapshots originales nunca se alteran; el filtrado se aplica como proyección en memoria.
- **Recuperación y anulación por el usuario:** El usuario puede alternar la inclusión de cualquier perfil mediante `isExcluded`, revirtiendo cualquier clasificación automática.

## Privacidad y Seguridad

- **100 % Local-first:** Todo el motor corre en el motor JavaScript del navegador.
- **Sin credenciales personales:** FollowLens no almacena ni solicita contraseñas o cookies de sesión de Instagram.
- **Persistencia en IndexedDB:** Los registros de verificación se almacenan en el object store `verificationRecords` aislado por cuenta analizada (`account`).
- **Retrocompatibilidad:** Si existen registros en el store heredado `unavailableProfiles`, se migran de manera transparente al nuevo esquema.

## Limitaciones Permanentes

- Las cuentas personales no comerciales no pueden verificarse en tiempo real sin métodos de evasión prohibidos. Esos perfiles permanecen clasificados como `unavailable_unconfirmed` con baja confianza y conservados en las métricas.
- Si Instagram altera el formato o sintaxis de sus marcadores en futuras versiones de exportación, se requerirá actualizar los extractores de evidencia.

## Consecuencias

- La interfaz de usuario refleja fielmente la realidad: muestra una cobertura del 100 % de perfiles auditados y desglosa con exactitud el conteo de confirmados vs. perfiles sin confirmación conservados.
- Las comparaciones históricas y los cálculos diferenciales respetan el mismo criterio conservador en ambas fechas de observación.
