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
timestamp: "2026-10-11T02:00:00-03:00"
lifecycle: stable
---

# FollowLens Knowledge Index

> Catálogo de conocimiento estructurado bajo la especificación **Open Knowledge Format (OKF v0.2)**.  
> Diseñado para **progressive disclosure**: permite a agentes de programación y desarrolladores localizar y cargar exclusivamente el documento relevante para su tarea sin saturar la ventana de contexto.

---

## 🧭 Mapa de Enrutamiento Técnico

| Documento | Tipo OKF | Contenido y Propósito | Cuándo Consultar |
|---|---|---|---|
| [architecture.md](architecture.md) | `Architecture` | Arquitectura del sistema, stack Vite/Vinext, responsabilidades de módulos, límites actuales y arquitectura objetivo. | Antes de modificar rutas, componentes estructurales o estructura de archivos. |
| [privacy-and-security.md](privacy-and-security.md) | `Privacy Model` | Modelo de privacidad estricto: procesamiento local en navegador, exclusión de medios, IndexedDB voluntario y contención DoS. | **Obligatorio** antes de tocar importación, persistencia o comunicación de red. |
| [domain-model.md](domain-model.md) | `Reference` | Tipos TypeScript (`Snapshot`, `Group`), reglas de normalización de usuarios y álgebra de conjuntos. | Al añadir métricas, cambiar etiquetas o lógica de relaciones. |
| [data-flow.md](data-flow.md) | `Architecture` | Ciclo de vida de datos: flujo actual vs. flujo objetivo de importación incremental, esquemas JSON y validaciones. | Al trabajar en `lib/importer.ts`, detección de formatos o descompresión. |
| [development.md](development.md) | `Development Guide` | Guía de entorno (Node 24+), scripts de `package.json`, suite de pruebas, linter y protocolo de verificación. | Al preparar cambios, depurar tests o validar compilación. |
| [decisions/0001-client-side-privacy-boundary.md](decisions/0001-client-side-privacy-boundary.md) | `Decision` | ADR: Procesamiento 100% en cliente sin servidores para datos personales. | Al evaluar integraciones con servicios externos o APIs. |
| [decisions/0002-snapshot-observation-model.md](decisions/0002-snapshot-observation-model.md) | `Decision` | ADR: Snapshots discretos entre exportaciones en vez de scraping en vivo o credenciales. | Al diseñar nuevas comparaciones temporales o métricas. |
| [decisions/0003-optional-local-persistence.md](decisions/0003-optional-local-persistence.md) | `Decision` | ADR: Almacenamiento en memoria por defecto y persistencia voluntaria en IndexedDB. | Al modificar `lib/storage.ts` o la experiencia de guardado. |
| [decisions/0004-incremental-zip-processing.md](decisions/0004-incremental-zip-processing.md) | `Decision` | ADR: Admisión de ZIPs legítimos sin umbral fijo arbitrario y migración a procesamiento incremental. | Antes de diseñar o implementar la Fase 2 del importador. |

---

## 🛠️ Procedimientos y Skills Especializadas (`.agents/skills/`)

| Skill | Ubicación | Propósito |
|---|---|---|
| `instagram-zip-import` | [.agents/skills/instagram-zip-import/SKILL.md](../../.agents/skills/instagram-zip-import/SKILL.md) | Guía técnica para diseñar, modificar y validar la descompresión y lectura de exportaciones ZIP/JSON de Instagram. |
| `change-verification` | [.agents/skills/change-verification/SKILL.md](../../.agents/skills/change-verification/SKILL.md) | Protocolo estricto de verificación y pruebas (`npm test`, `typecheck`, `build`, `lint`) antes de cerrar tareas. |
| `okf-documentation-sync` | [.agents/skills/okf-documentation-sync/SKILL.md](../../.agents/skills/okf-documentation-sync/SKILL.md) | Procedimiento para mantener sincronizados el código, las directivas de agentes y la base de conocimiento OKF. |

> [!NOTE]
> **Protocolo de Detección de Skills:**
> - **Estándar:** Todas las skills bajo `.agents/skills/` siguen el formato abierto de Agent Skills (`SKILL.md` con metadatos YAML).
> - **Antigravity IDE & Gemini CLI:** Reconocen nativamente `.agents/skills/` (en Gemini CLI, `.agents/skills` es un alias estándar de `.gemini/skills`) con descubrimiento progresivo.
> - **GitHub Copilot:** En entornos con soporte de Agent Skills (como Copilot Agent Mode), `.agents/skills/` se descubre automáticamente junto a `.github/skills/`. En modos clásicos de autocompletado o chat, Copilot se guía mediante `.github/copilot-instructions.md`.
> - **Claude Code:** Compatible con Agent Skills; admite descubrimiento en directorios estándar o acceso directo mediante los enlaces en `CLAUDE.md`.

---

## 🔒 Invariantes Fundamentales del Repositorio

1. **Cero Transmisión de Datos Personales:** No existen endpoints backend receptores ni APIs remotas para los archivos importados. Todo el parsing ocurre localmente en el motor JS del navegador.
2. **Sin Scraping ni API de Instagram:** La aplicación opera exclusivamente sobre exportaciones oficiales descargadas por el usuario en formato JSON.
3. **Persistencia Estrictamente Local y Opcional:** Los datos viven en memoria por defecto; el usuario decide si persistirlos en IndexedDB (`followlens-local`).
4. **Aislamiento Multicuenta:** Cada snapshot pertenece a una cuenta (`account`). Las comparaciones cronológicas entre cuentas distintas están bloqueadas a nivel de motor.
5. **Observación Discreta vs. Tiempo Real:** Los cambios reflejan diferencias matemáticas entre fechas de exportación, no marcas de tiempo en vivo de unfollow.
6. **Extracción Selectiva y Alcance Acotado:** La primera versión funcional analiza exclusivamente relaciones de seguidores y seguidos (`followers_*.json`, `following.json`). Nunca se extraen ni procesan fotos, vídeos ni mensajes. El tamaño total del ZIP legítimo (>200 MB) no es motivo de rechazo en la arquitectura objetivo (ADR-0004).
