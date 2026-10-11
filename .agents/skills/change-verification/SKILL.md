---
name: change-verification
description: Protocolo riguroso y sistemático de verificación de cambios técnicos, compilación, tipos, pruebas unitarias y linters en FollowLens.
---

# Skill: change-verification

Esta Skill define el procedimiento estándar para verificar cualquier modificación técnica antes de dar por concluida una tarea o fase de desarrollo en FollowLens.

---

## 1. Protocolo de Verificación Obligatorio

Todo agente o desarrollador debe ejecutar y reportar de manera secuencial los siguientes pasos:

### Paso 1: Inspección de Cambios
- Revisar `git status --short --branch` para confirmar que no se han creado o modificado archivos ajenos al alcance autorizado.
- Ejecutar `git diff --stat` y revisar las líneas modificadas (`git diff`).
- Confirmar que ningún archivo funcional fue alterado si la tarea era exclusivamente documental.

### Paso 2: Suite de Pruebas Unitarias
```sh
npm test
```
- Valida la lógica de relaciones, normalización, cálculo diferencial y parsing en `lib/relationships.test.ts`.
- **Criterio:** Debe finalizar con código de salida 0 y el 100% de los tests pasando (14/14 activos).
- **Regla:** Queda prohibido deshabilitar, saltar (`test.skip`) o comentar pruebas para ocultar errores.

### Paso 3: Verificación Estricta de Tipos
```sh
npm run typecheck
```
- Ejecuta `tsc --noEmit` utilizando la configuración estricta de TypeScript.
- **Criterio:** Debe reportar 0 errores de tipado y código de salida 0.

### Paso 4: Compilación de Producción
```sh
npm run build
```
- Ejecuta `vinext build` (Vite 8.2.2).
- Compila tanto los bundles de cliente como de renderizado SSR/RSC.
- **Criterio:** Debe completar la compilación con código de salida 0.

### Paso 5: Análisis Estático (`oxlint`)
```sh
npm run lint
```
- Evalúa el código con `oxlint`.
- **Criterio de análisis:** Distinguir claramente entre:
  1. *Regresiones nuevas introducidas por el cambio:* Deben corregirse de inmediato.
  2. *Advertencias preexistentes conocidas:* Como se documenta en [docs/knowledge/development.md](../../../docs/knowledge/development.md), existen observaciones previas en `components/ui/chart.tsx` (componentes autogenerados) y promesas no envueltas de `node:test`. No alterar código ajeno solo para silenciar estos avisos.

---

## 2. Reglas de Honestidad y Calidad

1. **Transparencia en el Reporte:**
   Reportar con exactitud el resultado de cada comando (código de salida, tiempo de ejecución, advertencias y fallos). No declarar que un comando pasó si no se ejecutó.
2. **Distinción entre Realidad y Suposición:**
   No afirmar que una funcionalidad compleja (como el soporte de archivos grandes de 232 MB) está verificada si solo se ejecutaron pruebas con archivos pequeños en memoria.
3. **Revisión de Documentación:**
   Verificar que los documentos técnicos y adaptadores no afirmen que funcionalidades pendientes ya están implementadas.
4. **Criterios de Cierre:**
   No declarar una fase como completada si queda algún criterio de aceptación obligatorio sin verificar.
