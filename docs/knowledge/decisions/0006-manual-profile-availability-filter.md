---
okf_version: "0.2"
type: Decision
title: ADR-0006 - Registro híbrido de perfiles no disponibles
description: Detección local de marcadores explícitos, decisiones manuales y filtro estadístico derivado sin alterar snapshots ni consultar servicios externos.
tags: [decision, adr, availability, privacy, snapshots, importer]
timestamp: "2026-10-21T23:00:00-03:00"
lifecycle: stable
---

# ADR-0006: Registro híbrido local de perfiles no disponibles

## Estado

Aceptado e implementado.

## Contexto

Las exportaciones oficiales describen relaciones observadas en una fecha; no informan de manera fiable si otra cuenta fue desactivada, suspendida, eliminada, renombrada o dejó de ser visible. FollowLens tampoco consulta perfiles, usa scraping ni recibe datos de una API de Instagram. Una desaparición de una exportación no demuestra una causa.

## Decisión

1. Durante una importación, FollowLens identifica los valores normalizados con el prefijo explícito __deleted__ en las listas JSON y HTML. Solo se usa esta señal comprobable del archivo; no se deduce el estado de cuentas que no tengan un marcador.
2. El registro se guarda en IndexedDB local, separado de `snapshots`, y organizado por la cuenta analizada. La base `followlens-local` se actualiza de forma aditiva a la versión 2; las capturas existentes permanecen intactas.
3. Las detecciones automáticas se agregan con origen FollowLens y motivo «Marcador de cuenta eliminada en la exportación». El usuario puede agregar perfiles, cambiar motivos, incluir una detección corregida o quitar una clasificación. Una corrección manual prevalece en futuras importaciones.
4. El checkbox global comienza desactivado. Al activarlo, se aplica el mismo conjunto de exclusión a seguidores y seguidos de cada snapshot y se recalculan las relaciones históricas, métricas, tendencia, listas, detalle y CSV. La importación y su snapshot original no se modifican.
5. El registro, parsing, cálculos y persistencia permanecen en el navegador. No se llama a Instagram, Unavatar ni a otro proveedor; no se incorpora scraping ni fotografía de perfil.

## Privacidad

Las detecciones y decisiones del usuario se guardan únicamente en IndexedDB local por cuenta y nunca se transmiten. La etiqueta Detectado por FollowLens describe la presencia literal del marcador en la exportación; no confirma la condición actual de una cuenta.

## Limitaciones

- FollowLens solo reconoce el patrón explícito __deleted__ implementado en el importador. El formato puede variar entre exportaciones.
- Un marcador no prueba por sí solo si el perfil continúa eliminado. Sin un identificador explícito en el ZIP, no se puede determinar si una cuenta está suspendida, temporalmente desactivada, restringida, privada o renombrada.
- El filtro es específico de la cuenta de Instagram analizada y no cambia las exportaciones originales.
- Una detección puede quedar desactualizada; el usuario puede corregirla. Las correcciones manuales se conservan al reimportar el mismo username.

## Consecuencias

- El usuario puede revisar métricas sin cuentas que haya identificado como no disponibles y volver a la vista original desmarcando una opción.
- Las métricas excluidas son reproducibles a partir de snapshots sin modificar y del registro local vigente.
- Cambiar de navegador o borrar sus datos locales elimina las marcas persistidas.
