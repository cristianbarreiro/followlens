---
okf_version: "0.2"
type: Decision
title: ADR-0006 - Auditoría automática local de disponibilidad
description: Auditoría de todos los perfiles importados, exclusión conservadora de marcadores explícitos y conservación de estados no confirmados.
tags: [decision, adr, availability, privacy, snapshots, importer]
timestamp: "2026-10-21T23:00:00-03:00"
lifecycle: stable
---

# ADR-0006: Auditoría automática local de disponibilidad

## Estado

Aceptado e implementado. Reemplaza el flujo manual introducido inicialmente.

## Contexto

Las exportaciones oficiales describen relaciones observadas en una fecha; fuera de los marcadores explícitos, no informan de manera fiable si otra cuenta fue desactivada, suspendida, eliminada, renombrada o dejó de ser visible. Los fallos de carga de una página tampoco distinguen estas causas de una restricción temporal, privacidad, bloqueo o cambio de usuario.

## Decisión

1. Durante cada importación, `auditProfileAvailability()` recorre cada username único de seguidores y seguidos, y clasifica como confirmado exclusivamente el marcador explícito `__deleted__`. El resto queda como no confirmado.
2. FollowLens excluye automáticamente esos marcadores de estadísticas y comparaciones históricas. No exige seleccionar perfiles; una corrección opcional solo puede volver a incluir una detección explícita.
3. El registro de marcadores y correcciones de inclusión se guarda en IndexedDB local, separado de `snapshots`, y organizado por la cuenta analizada. Las importaciones históricas se filtran sin modificar los snapshots originales.
4. Los marcadores manuales antiguos de perfiles ordinarios dejan de participar en exclusiones. Los datos de snapshots y el esquema IndexedDB se mantienen intactos.
5. El análisis, la persistencia y los estados permanecen en el navegador. No se consulta Instagram, no se usa scraping, no se recopilan credenciales y no se transmiten listas.
6. No se implementa una cuenta de Instagram de FollowLens: la [API oficial](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api) sirve a cuentas profesionales autorizadas y no permite confirmar universalmente perfiles personales de seguidores o seguidos. Business Discovery también se limita a perfiles profesionales. [Meta indica](https://about.fb.com/news/2021/04/how-we-combat-scraping/) que la recopilación automatizada requiere su permiso; automatizar solicitudes web desde una cuenta propia no es una alternativa autorizada ni fiable.

## Privacidad

El conteo de auditoría, las detecciones y las correcciones se procesan y guardan únicamente en IndexedDB local por cuenta y nunca se transmiten. `__deleted__` confirma la señal de eliminación presente en el archivo, no que el estado siga vigente al día de hoy.

## Limitaciones

- FollowLens solo reconoce el patrón explícito `__deleted__`; si Instagram cambia el formato de exportación, la señal podría no aparecer.
- No hay confirmación en vivo de cuentas desactivadas o suspendidas si la exportación no trae el marcador. Esas cuentas permanecen en el análisis como no confirmadas.
- Los fallos transitorios de Instagram no se solicitan ni se interpretan; como no se hacen consultas de red, no hay errores remotos que clasificar.
- La corrección de un marcador se limita a incluirlo otra vez y se conserva al reimportar el mismo valor.

## Consecuencias

- El usuario ve un resumen del total revisado, las señales explícitas y los perfiles que permanecen sin confirmar.
- Las métricas se recalculan automáticamente a partir de los snapshots sin modificar y del registro local por cuenta.
- Cambiar de navegador o borrar sus datos locales elimina las marcas persistidas.
