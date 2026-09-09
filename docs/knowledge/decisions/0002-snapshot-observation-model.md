---
okf_version: "0.2"
type: Decision
title: ADR-0002 - Modelo de Observación Discreta Basado en Snapshots
description: Comparación diferencial entre exportaciones fechadas en lugar de monitoreo en tiempo real o uso de APIs.
tags:
  - decision
  - adr
  - snapshots
  - data-model
timestamp: "2026-09-07T14:20:00-03:00"
lifecycle: stable
---

# ADR-0002: Modelo de Observación Discreta Basado en Snapshots

## Estado
Aceptado

## Contexto
Los usuarios suelen buscar herramientas que les avisen "al instante" cuando alguien deja de seguirlos. Sin embargo, Instagram no provee webhooks de unfollow para cuentas personales, y los métodos que intentan simular monitoreo en vivo recurren a scraping automatizado periódico con proxies, lo cual desencadena desafíos de seguridad, checkpoints de verificación facial/SMS y suspensiones de cuenta permanentes.

## Decisión
1. FollowLens modela el seguimiento de relaciones mediante el concepto de **Snapshots Discretos**.
2. Cada snapshot representa una observación fija en el tiempo, identificada por la fecha de exportación indicada por el usuario (`date`).
3. Los cambios (`lost`, `new`, `unfollowed`, `followed`, `lostMutuals`, `newMutuals`) se calculan únicamente cuando existen dos snapshots distintos de la misma cuenta ordenados cronológicamente ($fecha_{anterior} < fecha_{actual}$).
4. Se comunica transparentemente en la interfaz que los cambios son observaciones entre exportaciones y no eventos en tiempo real.

## Consecuencias
- **Positivas:** Seguridad absoluta para la cuenta de Instagram del usuario; cero riesgo de baneo; precisión matemática determinista sobre los datos provistos por la plataforma.
- **Negativas:** La granularidad temporal depende de la frecuencia con la que el usuario solicite y descargue sus exportaciones oficiales.
