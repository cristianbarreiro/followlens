---
name: okf-documentation-sync
description: Procedimiento para auditar y sincronizar la documentación técnica bajo Open Knowledge Format (OKF v0.2), adaptadores de agentes y decisiones arquitectónicas en FollowLens.
---

# Skill: okf-documentation-sync

Esta Skill define el procedimiento para garantizar que la base de conocimiento estructurada de FollowLens se mantenga coherente, actualizada y libre de contradicciones respecto al código real.

---

## 1. Arquitectura de Fuente Única de Verdad

FollowLens sigue una jerarquía estricta de documentación técnica:

```
                  ┌───────────────────────────────┐
                  │           AGENTS.md           │ ◄── Guía Operativa Principal
                  └───────────────┬───────────────┘
                                  │
          ┌───────────────────────┼───────────────────────┐
          ▼                       ▼                       ▼
   ┌─────────────┐         ┌─────────────┐         ┌─────────────┐
   │  GEMINI.md  │         │  CLAUDE.md  │         │   Copilot   │ ◄── Adaptadores Ligeros
   └──────┬──────┘         └──────┬──────┘         └──────┬──────┘
          │                       │                       │
          └───────────────────────┼───────────────────────┘
                                  ▼
                  ┌───────────────────────────────┐
                  │    docs/knowledge/index.md    │ ◄── Catálogo OKF v0.2
                  └───────────────┬───────────────┘
                                  ▼
            Documentos Especializados y Decisiones (ADRs)
```

---

## 2. Procedimiento de Sincronización

### Paso 1: Auditoría de Coherencia
- Comparar lo que afirma la documentación con lo que realmente implementa el código fuente (`lib/importer.ts`, `lib/relationships.ts`, `components/import-dialog.tsx`, etc.).
- Identificar cualquier afirmación que describa una característica futura como si ya estuviese implementada.
- Verificar que los adaptadores (`GEMINI.md`, `CLAUDE.md`, `.github/copilot-instructions.md`) no dupliquen contenido extenso ni contradigan a `AGENTS.md`.

### Paso 2: Actualización de Documentos OKF
Al modificar o crear documentos bajo `docs/knowledge/`:
1. Asegurar el encabezado YAML conforme a OKF v0.2:
   ```yaml
   ---
   okf_version: "0.2"
   type: Architecture | Privacy Model | Reference | Development Guide | Decision | Index
   title: <Título descriptivo>
   description: <Resumen de 1-2 líneas>
   tags: [tag1, tag2]
   timestamp: "YYYY-MM-DDTHH:MM:SS-03:00"
   lifecycle: stable | draft | pending | deprecated
   ---
   ```
2. Mantener la organización por **progressive disclosure** (explicar al inicio de cada archivo cuándo debe ser consultado).

### Paso 3: Registro de Decisiones Arquitectónicas (ADR)
- Antes de crear un ADR en `docs/knowledge/decisions/`, listar los archivos existentes para determinar el siguiente número secuencial (e.g. `0004-...`).
- Estructurar el ADR en: Estado, Contexto, Decisión Objetivo, Privacidad, Limitaciones y Consecuencias.
- Marcar claramente como `pending` o `Propuesto` si se trata de un objetivo futuro.

### Paso 4: Actualización del Índice Maestro
- Cada nuevo documento o ADR debe agregarse a la tabla de enrutamiento técnico de `docs/knowledge/index.md`.
- Cada nueva Skill debe enlazarse en la sección correspondiente.

### Paso 5: Verificación de Enlaces y Rutas
- Comprobar que todas las rutas relativas (`docs/knowledge/...`, `.agents/skills/...`, `lib/...`) apunten a archivos reales existentes.
- Confirmar que ningún archivo funcional fue editado si la tarea asignada era estrictamente documental.
