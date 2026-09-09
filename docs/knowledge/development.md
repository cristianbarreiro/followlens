---
okf_version: "0.2"
type: Development Guide
title: Guía de Desarrollo y Validación
description: Requisitos del entorno, herramientas, scripts de compilación, suite de pruebas y flujo de trabajo.
tags:
  - development
  - testing
  - node24
  - vinext
  - oxlint
timestamp: "2026-09-07T14:20:00-03:00"
lifecycle: stable
---

# Guía de Desarrollo y Validación de FollowLens

## 1. Requisitos de Entorno

- **Node.js:** Versión 24 o superior (`>=24` definida en `package.json` engines).
- **Gestor de paquetes:** `npm` (o `npm.cmd` en entornos Windows PowerShell donde las políticas de ejecución restrinjan scripts).

---

## 2. Scripts Disponibles

Todos los comandos se ejecutan desde la raíz del proyecto:

| Comando | Acción | Herramienta |
|---|---|---|
| `npm run dev` | Inicia el servidor de desarrollo local con HMR. | `vinext dev` |
| `npm run build` | Compila la aplicación completa para producción. | `vinext build` |
| `npm test` | Ejecuta la suite completa de pruebas unitarias. | `node --test lib/relationships.test.ts` |
| `npm run typecheck` | Verifica tipos TypeScript sin emitir archivos. | `tsc --noEmit` |
| `npm run format` | Formatea el código fuente del proyecto. | `oxfmt` |
| `npm run lint` | Ejecuta el análisis estático de código. | `oxlint` |
| `npm run start` | Arranca el runtime local de Cloudflare Worker / Wrangler. | `wrangler dev --config dist/server/wrangler.json` |

---

## 3. Pruebas Unitarias (`lib/relationships.test.ts`)

La suite de pruebas se ejecuta mediante el runner nativo de Node.js (`node --test`) y utiliza aserciones estrictas (`node:assert/strict`).

### Cobertura Comprobada (14 tests activos):
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

---

## 4. Estado del Linter (`oxlint`)

- `npm run lint` ejecuta `oxlint` con `typeAware: true` y reglas de categoría `correctness: "error"`.
- Actualmente, `oxlint` reporta observaciones de tipado en componentes autogenerados de la biblioteca `components/ui/*` (shadcn) y sobre llamadas de retorno no esperadas de `node:test`.
- **Regla del repositorio:** No alterar código funcional de la UI ni de los componentes solo para silenciar linter warnings externos, a menos que el usuario lo solicite explícitamente.

---

## 5. Flujo Obligatorio de Verificación (Definition of Done)

Antes de finalizar cualquier tarea de desarrollo o mantenimiento:
```sh
# 1. Pruebas unitarias obligatorias
npm test

# 2. Verificación estricta de TypeScript
npm run typecheck

# 3. Compilación de producción
npm run build
```
Los tres comandos deben completarse con código de salida 0.
