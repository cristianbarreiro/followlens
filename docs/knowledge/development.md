---
okf_version: "0.2"
type: Development Guide
title: Guía de Desarrollo y Validación
description: Requisitos del entorno, herramientas, scripts de compilación, suite de pruebas, estado de linter y flujo de trabajo.
tags:
  - development
  - testing
  - node24
  - vinext
  - oxlint
  - verification
timestamp: "2026-10-11T02:00:00-03:00"
lifecycle: stable
---

# Guía de Desarrollo y Validación de FollowLens

## 1. Requisitos de Entorno

- **Node.js:** Versión 24 o superior (`>=24` definida en `package.json` engines).
- **Gestor de paquetes:** `npm` (o `npm.cmd` en entornos Windows PowerShell donde las políticas de ejecución restrinjan scripts).

---

## 2. Scripts Disponibles

Todos los comandos se ejecutan desde la raíz del proyecto:

| Comando | Acción | Herramienta | Notas |
|---|---|---|---|
| `npm run dev` | Inicia el servidor de desarrollo local con HMR. | `vinext dev` | Entorno Vite 8 con Vinext. |
| `npm run build` | Compila la aplicación completa para producción. | `vinext build` | Compila bundles cliente y SSR. |
| `npm test` | Ejecuta la suite completa de pruebas unitarias. | `node --test lib/relationships.test.ts` | 14 tests unitarios nativos. |
| `npm run typecheck` | Verifica tipos TypeScript sin emitir archivos. | `tsc --noEmit` | Validación estricta con TypeScript 5.9. |
| `npm run format` | Formatea el código fuente del proyecto. | `oxfmt` | Formateador ultrarrápido basado en Rust. |
| `npm run lint` | Ejecuta el análisis estático de código. | `oxlint` | Véase Sección 4 para diagnóstico de linter. |
| `npm run start` | Arranca el runtime local de Cloudflare Worker / Wrangler. | `wrangler dev --config dist/server/wrangler.json` | Emulación local. |

---

## 3. Pruebas Unitarias Actuales (`lib/relationships.test.ts`)

La suite actual de pruebas se ejecuta mediante el runner nativo de Node.js (`node --test`) y utiliza aserciones estrictas (`node:assert/strict`).

### Cobertura Actual Comprobada (14 tests activos):
1. Normalización de usernames (descarte de fórmulas de planilla `@`, `=`, `<script>`).
2. Parsing de formatos planos, envueltos y resolución por `title` / URL.
3. Rechazo de registros incompletos y soporte de listas vacías legítimas.
4. Cálculo matemático de relaciones actuales (`mutuals`, `notBack`, `fans`).
5. Comparación precisa entre snapshots (`lost`, `new`, `unfollowed`, `followed`, `lostMutuals`, `newMutuals`).
6. Bloqueo de comparaciones entre cuentas distintas o con fechas no decrecientes.
7. Manejo de snapshots vacíos completos y conjuntos disjuntos.
8. Reconstrucción cronológica de historial (`timeline`) con colapso de estados idénticos.
9. Exportación CSV sanitizada con UTF-8 BOM y exclusión de cuentas ajenas o fechas futuras.
10. Importación de archivos multipartes sueltos (`followers_1.json`, `followers_2.json`, `following.json`).
11. Importación de ZIP anidado ignorando mensajes privados y archivos corruptos no relacionados.
12. Rechazo de partes intermedias faltantes en seguidores (ej. saltos 1 → 3).
13. Rechazo de carpetas de cuentas duplicadas o múltiples archivos ZIP simultáneos.
14. Rechazo de ZIP dañado y aceptación de archivos legítimos vacíos.

> [!NOTE]
> **Datos de prueba:** Todos los tests operan sobre datos sintéticos generados en memoria con `zipSync` y `new File()`. No se leen ni requieren archivos reales del disco.

### Pruebas Pendientes para la Evolución Incremental (Fases 2–4):
Cuando se implemente el nuevo importador, deberán añadirse pruebas específicas para:
- Archivos ZIP que contengan archivos de gran tamaño no relacionados (simulando fotos/vídeos sin cargarlos en memoria).
- Descompresión progresiva por chunks y verificación de liberación de memoria.
- Comportamiento ante interrupción o cancelación de lectura.
- Ausencia de rechazo arbitrario para archivos superiores a 200 MB.

*(No declarar que existen pruebas de navegador o E2E hasta que hayan sido implementadas en el repositorio).*

---

## 4. Estado del Linter (`oxlint`)

- `npm run lint` ejecuta `oxlint` con `typeAware: true`.
- Actualmente, reporta observaciones preexistentes derivadas de componentes autogenerados de UI (`components/ui/chart.tsx`) y promesas no envueltas en el bloque `test(...)` de `node:test`.
- **Regla del repositorio:** No alterar código funcional de la UI ni de componentes de visualización solo para silenciar advertencias externas del linter, salvo requerimiento explícito.
- Para el cierre de tareas regulares, el criterio de validación obligatoria se enfoca en la suite de pruebas, TypeScript y compilación de producción.

---

## 5. Flujo Obligatorio de Verificación (Definition of Done)

Antes de finalizar cualquier tarea de desarrollo o mantenimiento, ejecutar:
```sh
# 1. Pruebas unitarias obligatorias (100% éxito)
npm test

# 2. Verificación estricta de TypeScript (0 errores)
npm run typecheck

# 3. Compilación de producción exitosa
npm run build
```

Para procedimientos detallados, consultar la Skill [.agents/skills/change-verification/SKILL.md](../../.agents/skills/change-verification/SKILL.md).
