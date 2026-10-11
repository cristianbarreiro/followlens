---
okf_version: "0.2"
type: Architecture
title: Arquitectura del Sistema FollowLens
description: Especificación técnica integral de componentes, responsabilidades, límites de diseño, estado actual y evolución incremental.
tags:
  - architecture
  - react19
  - vinext
  - vite
  - client-side
  - incremental-importer
timestamp: "2026-10-11T02:00:00-03:00"
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
├── importer.ts                  ── Orquestación de importación, integración de zip.ts, validación de partes
├── zip.ts                       ── Lector ZIP selectivo por rangos (EOCD, CD, CRC32, streaming DEFLATE acotado)
├── relationships.ts             ── Lógica pura de conjuntos, normalización de usernames, timeline y CSV
├── storage.ts                   ── Adaptador de persistencia local en IndexedDB (base 'followlens-local')
├── demo.ts                      ── Generador de snapshots sintéticos para exploración sin archivos
├── utils.ts                     ── Utilidades de concatenación de clases Tailwind (cn)
└── relationships.test.ts        ── Pruebas unitarias de parsing, normalización, análisis e importación
```

---

## 4. HOW — Flujo Actual vs. Arquitectura Objetivo

### Estado de la Implementación (`lib/zip.ts` y `lib/importer.ts`)

En la Fase 3, el pipeline de importación fue desacoplado mediante lectura selectiva por rangos:
1. Recibe los archivos seleccionados por el usuario (`File[]`), admitiendo exportaciones completas sin rechazo por tamaño de archivo.
2. Para archivos ZIP, localiza el registro EOCD en los últimos 65.557 bytes sin leer el archivo entero.
3. Detecta y rechaza de forma controlada formatos ZIP64 y multidisco.
4. Inspecciona el Directorio Central en un búfer acotado (≤ 16 MB), identificando únicamente las entradas relacionales (`followers_*.json`, `following.json`).
5. Extrae selectivamente mediante `File.slice()` los encabezados locales y rangos de datos de las entradas seleccionadas; **los archivos multimedia y mensajes nunca se solicitan ni se leen de almacenamiento**.
6. Descomprime mediante passthrough (STORE) o streaming DEFLATE acotado con límite de seguridad (≤ 30 MB por entrada y acumulado), verificando CRC32 e integridad.
7. Deserializa mediante `JSON.parse` y valida la secuencia de partes antes de entregar los datos a React.

### Arquitectura Modular (Fases 2–4, ADR-0004)

La evolución arquitectónica separa el pipeline de importación en cuatro capas desacopladas:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        1. LECTURA DE ENTRADA                          │
│  Lectura por bloques (File slicing / ReadableStream) del archivo local  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     2. INSPECCIÓN DE ENTRADAS                          │
│  Lectura del directorio central / catálogo de entradas del ZIP          │
│  Identificación de followers_*.json y following.json sin descomprimir   │
│  Descarte total de fotografías, vídeos, audios y mensajes privados     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               3. EXTRACCIÓN PROGRESIVA Y CONTROLADA                    │
│  Descompresión por chunks de las entradas seleccionadas                 │
│  Límites dinámicos de descompresión por archivo JSON relevante          │
│  Gestión de memoria acotada y reporte de progreso verificable          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               4. ANALIZADORES MODULARES INDEPENDIENTES                 │
│  [Analizador 1 (Inicial): Seguidores y Seguidos (relationships.ts)]   │
│  - Limpieza BOM UTF-8 y deserialización segura                          │
│  - Normalización de usernames (normalize)                               │
│  - Verificación de partes secuenciales sin saltos                       │
│  - Cálculo de conjuntos (mutuals, notBack, fans, snapshots)             │
│  [Futuros Analizadores: Diseñados como módulos independientes]        │
└────────────────────────────────────────────────────────────────────────┘
```

> [!NOTE]
> Esta separación en capas y procesamiento incremental es el **diseño objetivo**. La implementación real en código se realizará en la Fase 3, previa validación técnica en la Fase 2.

---

## 5. CONSTRAINTS — Invariantes Arquitectónicas No Negociables

1. **PROHIBIDO añadir transmisión de datos:** No deben introducirse llamadas `fetch`, `axios`, WebSockets o analítica hacia servidores externos que envíen datos de seguidores, identificadores o metadatos de usuario.
2. **Frontera de Privacidad y Procesamiento en Cliente:** Todo el procesamiento ocurre en el navegador del usuario. Cero backends o microservicios para procesar datos personales.
3. **Exclusión estricta de archivos no relacionados:** El sistema nunca debe descomprimir ni acumular fotos, vídeos, audios, historias o conversaciones de chat contenidas en el archivo ZIP.
4. **Criterio de Tamaño de Archivo:** En la arquitectura objetivo (ADR-0004), el tamaño total comprimido de un ZIP legítimo (>200 MB) no es causal de rechazo. Se aplican salvaguardas proporcionales por archivo descompreso y límites de consumo de recursos.
5. **Validación de Partes Obligatoria:** Si un usuario tiene múltiples archivos de seguidores (`followers_1.json`, `followers_3.json`), la importación debe fallar de inmediato si falta alguna parte intermedia para evitar corromper el análisis de seguidores perdidos.
6. **Aislamiento Multicuenta:** Nunca comparar ni mezclar snapshots pertenecientes a cuentas distintas (`account`).

---

## 6. VALIDATION — Protocolo de Verificación

Cualquier cambio estructural debe validarse mediante:
- `npm test`: Ejecución de los 14 tests unitarios de `lib/relationships.test.ts`.
- `npm run typecheck`: Validación estricta de TypeScript (`tsc --noEmit`).
- `npm run build`: Empaquetado completo de producción con Vite y Vinext (`vinext build`).
