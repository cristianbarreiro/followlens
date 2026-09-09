---
okf_version: "0.2"
type: Index
title: FollowLens Knowledge Index
description: Mapa maestro y catálogo de conocimiento estructurado (OKF v0.2) para el proyecto FollowLens.
tags:
  - index
  - okf
  - followlens
  - architecture
  - privacy
timestamp: "2026-09-07T14:20:00-03:00"
lifecycle: stable
---

# FollowLens Knowledge Index

> Catálogo de conocimiento estructurado bajo la especificación **Open Knowledge Format (OKF v0.2)**.  
> Diseñado para **progressive disclosure**: permite a agentes de programación y desarrolladores localizar y cargar exclusivamente el documento relevante para su tarea.

---

## 🧭 Mapa de Enrutamiento Técnico

| Documento | Tipo OKF | Contenido y Propósito | Cuándo Consultar |
|---|---|---|---|
| [architecture.md](architecture.md) | `Architecture` | Arquitectura del sistema, stack Vite/Vinext, responsabilidades de archivos, límites e invariantes del sistema. | Antes de modificar rutas, componentes estructurales o estructura de archivos. |
| [privacy-and-security.md](privacy-and-security.md) | `Privacy Model` | Modelo de privacidad estricto: procesamiento en navegador, exclusión de medios, IndexedDB local y restricciones de red. | **Obligatorio** antes de tocar importación, persistencia o comunicación externa. |
| [domain-model.md](domain-model.md) | `Reference` | Tipos TypeScript (`Snapshot`, `Group`), reglas de normalización de usuarios y clasificación de estados. | Al añadir métricas, cambiar etiquetas o lógica de agrupamiento. |
| [data-flow.md](data-flow.md) | `Architecture` | Ciclo de vida completo: descompresión streaming ZIP/JSON, validación de partes, sanitización y ordenamiento. | Al trabajar en `lib/importer.ts` o detección de formatos de exportación. |
| [development.md](development.md) | `Development Guide` | Guía de entorno (Node 24+), scripts de `package.json`, ejecución de pruebas unitarias y validación. | Al preparar cambios, depurar tests o validar compilación. |
| [decisions/0001-client-side-privacy-boundary.md](decisions/0001-client-side-privacy-boundary.md) | `Decision` | ADR: Por qué el procesamiento es 100% en cliente sin servidores para datos personales. | Al evaluar integraciones con servicios externos o APIs. |
| [decisions/0002-snapshot-observation-model.md](decisions/0002-snapshot-observation-model.md) | `Decision` | ADR: Por qué se usan snapshots discretos entre exportaciones en vez de scraping en vivo o credenciales. | Al diseñar nuevas comparaciones temporales o métricas. |
| [decisions/0003-optional-local-persistence.md](decisions/0003-optional-local-persistence.md) | `Decision` | ADR: Por qué el almacenamiento por defecto es en memoria y la persistencia en IndexedDB requiere consentimiento. | Al modificar `lib/storage.ts` o la experiencia de guardado. |

---

## 🔒 Invariantes Fundamentales del Repositorio

1. **Cero Transmisión de Datos Personales:** No existen endpoints backend receptores ni APIs remotas para los archivos importados. Todo el parsing ocurre localmente en el motor JS del navegador.
2. **Sin Scraping ni API de Instagram:** La aplicación opera exclusivamente sobre exportaciones oficiales descargadas por el usuario en formato JSON.
3. **Persistencia Estrictamente Local y Opcional:** Los datos viven en memoria por defecto; el usuario decide si persistirlos en IndexedDB (`followlens-local`).
4. **Aislamiento por Cuenta:** Cada snapshot pertenece a una cuenta (`account`). Las comparaciones cronológicas entre cuentas distintas están bloqueadas a nivel de motor.
5. **Observación Discreta vs. Tiempo Real:** Los cambios reflejan diferencias entre fechas de exportación, no marcas de tiempo en vivo de unfollow ni motivos del usuario.
