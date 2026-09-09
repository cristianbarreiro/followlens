---
okf_version: "0.2"
type: Architecture
title: Arquitectura del Sistema FollowLens
description: Especificación técnica integral de componentes, responsabilidades, límites de diseño y flujo operativo.
tags:
  - architecture
  - react19
  - vinext
  - vite
  - client-side
timestamp: "2026-09-07T14:20:00-03:00"
lifecycle: stable
---

# Arquitectura del Sistema FollowLens

## 1. WHAT — ¿Qué es FollowLens?
FollowLens es una aplicación web SPA construida con React 19 y TypeScript sobre Vite y Vinext. Permite a los usuarios analizar relaciones de cuentas de Instagram (seguidores, seguidos, mutuos, no recíprocos y cambios históricos) procesando directamente las exportaciones oficiales de datos de Instagram en formato JSON o ZIP.

---

## 2. WHY — Fundamentos de Diseño
- **Privacidad Radical:** Las listas de seguidores y relaciones sociales son datos personales sensibles. Procesarlas íntegramente en el motor JavaScript local del navegador elimina el riesgo de fuga en tránsito o almacenamiento en servidores terceros.
- **Sin Credenciales ni API de Instagram:** Usar la API oficial requiere permisos corporativos inaccesibles y tokens de usuario; el scraping automatizado viola los términos de servicio de la plataforma y pone en riesgo la cuenta del usuario. Las exportaciones oficiales de Instagram (*Data Download*) son el método legítimo y seguro otorgado por Meta al usuario.
- **Comparaciones Observacionales:** Instagram no provee un historial continuo de "quién te dejó de seguir y cuándo". FollowLens modela esto mediante **snapshots observacionales** fechados por el usuario, calculando diferencias matemáticas exactas entre puntos en el tiempo.

---

## 3. WHERE — Mapa de Responsabilidades y Código

```
app/
├── layout.tsx                   ── Shell principal HTML, metadata, fuentes y estilos globales
├── page.tsx                     ── Estado de sesión, filtros de grupos, tablas interactivas, CSV
└── globals.css                  ── Variables CSS de Tailwind v4 y estilos específicos de la UI

components/
├── import-dialog.tsx            ── Modal de carga, validación de inputs (cuenta/fecha) y consentimiento
├── hero-demo-video.tsx          ── Reproductor diferido de demo en video/iframe (sin autoplay)
└── ui/                          ── Primitives visuales basados en shadcn/ui (radix / base-ui)

lib/
├── importer.ts                  ── Descompresión streaming con fflate, validación de límites y partes
├── relationships.ts             ── Lógica pura de conjuntos, normalización de usernames, timeline y CSV
├── storage.ts                   ── Adaptador de persistencia local en IndexedDB (base 'followlens-local')
├── demo.ts                      ── Generador de snapshots sintéticos para exploración sin archivos
├── utils.ts                     ── Utilidades de concatenación de clases Tailwind (cn)
└── relationships.test.ts        ── Pruebas unitarias de parsing, normalización, análisis e importación
```

---

## 4. HOW — Flujo de Ejecución y Transformación

```
[Archivo ZIP o JSONs de Instagram]
              │
              ▼
    lib/importer.ts (importFiles)
      ├─ Validación de tamaño total (≤ 200 MB archivo)
      ├─ fflate streaming unzip (filtro selectivo: ignora fotos/mensajes)
      ├─ Verificación de tamaño JSON (≤ 30 MB descompreso / ≤ 1.000 archivos)
      ├─ Detección de partes secuenciales: followers_1.json, followers_2.json...
      ├─ Limpieza de BOM UTF-8 y deserialización JSON
      └─ Extracción con parseRelationships()
              │
              ▼
    Snapshot { id, account, date, importedAt, followers[], following[] }
              │
              ├──────────────────────────────────┐
              ▼                                  ▼
    Estado en Memoria (app/page.tsx)    Persistencia Opcional (lib/storage.ts)
              │                                  │
              ▼                                  ▼
    lib/relationships.ts (analyze)        IndexedDB: 'followlens-local'
      ├─ mutuals     = followers ∩ following
      ├─ notBack     = following \ followers
      ├─ fans        = followers \ following
      ├─ lost/new    = diferencias vs snapshot anterior
      └─ exportación CSV sanitizada
```

---

## 5. CONSTRAINTS — Invariantes Arquitectónicas No Negociables

1. **PROHIBIDO añadir transmisión de datos:** No deben introducirse llamadas `fetch`, `axios`, WebSockets o analítica hacia servidores externos que envíen datos de seguidores o nombres de usuario.
2. **Exclusión de archivos no relacionados:** El descompresor nunca debe cargar en memoria ni procesar carpetas de fotos, videos o mensajes privados incluidos en el ZIP de Instagram.
3. **Límites de Seguridad DoS:** Límite máximo de 200 MB por lote de archivos y 30 MB / 1.000 archivos JSON descompresos para proteger el hilo de renderizado del navegador.
4. **Validación de Partes:** Si un usuario tiene múltiples archivos de seguidores (`followers_1.json`, `followers_3.json`), la importación debe fallar de inmediato si falta alguna parte intermedia.
5. **Aislamiento Multicuenta:** Nunca comparar ni mezclar snapshots pertenecientes a cuentas distintas (`account`).

---

## 6. VALIDATION — Protocolo de Verificación

Cualquier cambio estructural debe validarse mediante:
- `npm test`: Ejecución de los 14 tests unitarios de `lib/relationships.test.ts`.
- `npm run typecheck`: Validación estricta de TypeScript (`tsc --noEmit`).
- `npm run build`: Empaquetado completo de producción con Vite y Vinext.
