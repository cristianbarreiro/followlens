---
okf_version: "0.2"
type: Decision
title: ADR-0006 - Exclusión local de perfiles identificados manualmente
description: Registro local por cuenta y filtro derivado para excluir perfiles marcados por el usuario sin alterar snapshots ni consultar servicios externos.
tags: [decision, adr, availability, privacy, snapshots]
timestamp: "2026-10-21T23:00:00-03:00"
lifecycle: stable
---

# ADR-0006: Exclusión local de perfiles identificados manualmente

## Estado

Aceptado e implementado.

## Contexto

Las exportaciones oficiales describen relaciones observadas en una fecha; no informan de manera fiable si otra cuenta fue desactivada, suspendida, eliminada, renombrada o dejó de ser visible. FollowLens tampoco consulta perfiles, usa scraping ni recibe datos de una API de Instagram. Una desaparición de una exportación no demuestra una causa.

## Decisión

1. El usuario puede marcar o desmarcar nombres desde una relación, y agregar una lista pegada de usernames normalizados para la cuenta analizada. La marca y el motivo opcional describen una identificación manual del usuario; no son una comprobación de Instagram.
2. El registro se guarda en IndexedDB local, separado de `snapshots`, y organizado por la cuenta analizada. La base `followlens-local` se actualiza de forma aditiva a la versión 2; las capturas existentes permanecen intactas.
3. El checkbox global comienza desactivado. Al activarlo, la interfaz deriva vistas filtradas de todas las capturas de esa cuenta: aplica el mismo conjunto de nombres excluidos a seguidores y seguidos de cada fecha y recalcula las relaciones y diferencias históricas con esos conjuntos.
4. Las estadísticas, la tendencia, las listas, los detalles, la vista de importaciones y el CSV utilizan los conjuntos filtrados mientras el checkbox está activo. La importación y su snapshot original no se modifican.
5. El registro, la normalización de listas, los cálculos y la persistencia permanecen en el navegador. No se llama a Instagram, Unavatar ni a otro proveedor; no se incorpora scraping, fotografías ni verificación automática.

## Privacidad

Los usernames y motivos se guardan únicamente en IndexedDB del navegador y nunca se transmiten. El usuario controla las marcas y puede quitarlas desde la gestión de perfiles. Esta persistencia local es resultado de una acción explícita de marcado o agregado.

## Limitaciones

- FollowLens no puede confirmar si una cuenta está activa, privada, suspendida, desactivada o renombrada.
- Una marca puede quedar desactualizada; es una decisión local del usuario, no una fuente de verdad de Instagram.
- El filtro es específico de la cuenta de Instagram analizada y no cambia las exportaciones originales.
- El filtrado histórico excluye el mismo username en ambas fechas. Esto evita mostrar como cambio una relación cuya diferencia se explica únicamente por la exclusión manual.

## Consecuencias

- El usuario puede revisar métricas sin cuentas que haya identificado como no disponibles y volver a la vista original desmarcando una opción.
- Las métricas excluidas son reproducibles a partir de snapshots sin modificar y del registro local vigente.
- Cambiar de navegador o borrar sus datos locales elimina las marcas persistidas.
