---
okf_version: "0.2"
type: Decision
title: ADR-0003 - Persistencia Local Opcional en IndexedDB con Consentimiento Explícito
description: Modelo en memoria por defecto y almacenamiento voluntario en el navegador mediante IndexedDB.
tags:
  - decision
  - adr
  - indexeddb
  - storage
  - consent
timestamp: "2026-09-07T14:20:00-03:00"
lifecycle: stable
---

# ADR-0003: Persistencia Local Opcional en IndexedDB con Consentimiento Explícito

## Estado
Aceptado

## Contexto
Analizar relaciones y cambios temporales requiere que la aplicación pueda recordar exportaciones anteriores. Si la aplicación nunca guardase nada, el usuario tendría que volver a importar todas sus exportaciones pasadas en cada visita. Por otro lado, persistir silenciosamente listas completas de seguidores en el almacenamiento del navegador sin consentimiento podría comprometer la privacidad si el dispositivo es compartido o público.

## Decisión
1. Por defecto, toda importación reside únicamente en la memoria volátil del estado React (`app/page.tsx`).
2. En el diálogo de importación (`components/import-dialog.tsx`) se incluye un control explícito no seleccionado por defecto:  
   *Conservar esta importación en este navegador para futuras comparaciones.*
3. Si el usuario lo activa, el snapshot se almacena localmente en la base de datos IndexedDB `followlens-local` (almacén `snapshots`).
4. Cada snapshot queda vinculado a su identificador de cuenta (`account`). La interfaz permite listar y eliminar snapshots de forma individual con confirmación.
5. El modo de demostración (`lib/demo.ts`) opera puramente en memoria y jamás escribe en IndexedDB.

## Consecuencias
- **Positivas:** El usuario mantiene control total sobre qué información persiste en su dispositivo; compatibilidad con equipos compartidos; persistencia estructurada mediante IndexedDB (sin límites restrictivos de 5MB como en `localStorage`).
- **Negativas:** Si el usuario limpia el historial o las cookies de su navegador, los snapshots guardados se borran automáticamente.
