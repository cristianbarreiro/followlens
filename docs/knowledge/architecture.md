---
okf_version: '0.2'
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
timestamp: '2026-10-18T22:00:00-03:00'
lifecycle: stable
---

# Arquitectura del Sistema FollowLens

## 1. WHAT — ¿Qué es FollowLens?

FollowLens es una aplicación web SPA construida con React 19 y TypeScript sobre Vite y Vinext. Permite a los usuarios analizar relaciones de cuentas de Instagram (seguidores, seguidos, mutuos, no recíprocos y cambios históricos) procesando directamente las exportaciones oficiales de datos de Instagram en formato JSON o ZIP.

---

## 2. WHY — Fundamentos de Diseño

- **Privacidad Radical:** Las listas de seguidores y relaciones sociales son datos personales sensibles. Procesarlas íntegramente en el motor JavaScript local del navegador elimina el riesgo de fuga en tránsito o almacenamiento en servidores terceros.
- **Sin Credenciales ni API de Instagram:** Usar la API oficial requiere permisos corporativos inaccesibles y tokens de usuario; el scraping automatizado viola los términos de servicio de la plataforma y pone en riesgo la cuenta del usuario. Las exportaciones oficiales de Instagram (_Data Download_) son el método legítimo y seguro otorgado por Meta al usuario.
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
├── html-parser.ts               ── Parser seguro y pasivo de exportaciones HTML de Instagram (DOMParser)
├── zip.ts                       ── Lector ZIP selectivo por rangos (EOCD, CD, CRC32, streaming DEFLATE acotado)
├── relationships.ts             ── Lógica pura de conjuntos, normalización de usernames, timeline y CSV
├── storage.ts                   ── Adaptador de persistencia local en IndexedDB (base 'followlens-local')
├── profile-availability.ts      ── Registro híbrido de marcadores detectados y marcas manuales; filtrado inmutable de snapshots
├── demo.ts                      ── Generador de snapshots sintéticos para exploración sin archivos
├── utils.ts                     ── Utilidades de concatenación de clases Tailwind (cn)
└── relationships.test.ts        ── Pruebas unitarias de parsing (JSON/HTML), normalización, análisis e importación
```

---

## 4. HOW — Flujo Actual vs. Arquitectura Objetivo

### Estado de la Implementación (`lib/zip.ts`, `lib/importer.ts` y `lib/html-parser.ts`)

El pipeline de importación opera mediante lectura selectiva por rangos y soporte dual JSON/HTML:

1. Recibe los archivos seleccionados por el usuario (`File[]`), admitiendo exportaciones completas sin rechazo por tamaño de archivo.
2. Para archivos ZIP, localiza el registro EOCD en los últimos 65.557 bytes sin leer el archivo entero.
3. Detecta y rechaza de forma controlada formatos ZIP64 y multidisco.
4. Inspecciona el Directorio Central en un búfer acotado (≤ 16 MB), identificando únicamente las entradas relacionales (`followers_*.json`, `following.json`, `followers_*.html`, `following.html`).
5. Extrae selectivamente mediante `File.slice()` los encabezados locales y rangos de datos de las entradas seleccionadas; **los archivos multimedia y mensajes nunca se solicitan ni se leen de almacenamiento**.
6. Descomprime mediante passthrough (STORE) o streaming DEFLATE acotado con límite de seguridad (≤ 30 MB por entrada y acumulado), verificando CRC32 e integridad.
7. Deserializa mediante `JSON.parse` (para exportaciones JSON) o `parseHtmlRelationships` (parser pasivo seguro con DOMParser para HTML), asegurando consistencia de formato (sin mezclas híbridas ambiguas) y validando la secuencia de partes antes de entregar los datos a React.

### Arquitectura Modular (ADR-0004)

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
│  Identificación de followers y following (JSON / HTML) sin descomprimir │
│  Descarte total de fotografías, vídeos, audios y mensajes privados     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               3. EXTRACCIÓN PROGRESIVA Y CONTROLADA                    │
│  Descompresión por chunks de las entradas seleccionadas                 │
│  Límites dinámicos de descompresión por archivo relevante (≤ 30 MB)     │
│  Gestión de memoria acotada y reporte de progreso verificable          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               4. ANALIZADORES MODULARES INDEPENDIENTES                 │
│  [Analizador 1: Seguidores y Seguidos (JSON + HTML)]                   │
│  - Limpieza BOM UTF-8 y deserialización JSON segura                     │
│  - Parser pasivo DOMParser con decodificación de entidades para HTML    │
│  - Normalización de usernames (normalize) y filtrado de rutas no-perfil │
│  - Verificación de partes secuenciales sin saltos                       │
│  - Cálculo de conjuntos (mutuals, notBack, fans, snapshots)             │
│  [Futuros Analizadores: Diseñados como módulos independientes]        │
└────────────────────────────────────────────────────────────────────────┘
```

> [!NOTE]
> Esta arquitectura modular se encuentra completamente implementada en producción (Fases 3 a 6), admitiendo exportaciones oficiales completas en formatos JSON y HTML mediante lectura selectiva por rangos y descompresión acotada.

---

### Representación Visual de Cuentas y Estado de Fotografías (ADR-0005)

- **Componente actual:** La visualización de perfiles en las tablas y vistas de detalle opera exclusivamente mediante el componente `Avatar` en `app/page.tsx`, que renderiza iniciales (`name.slice(0, 2)`) con clases de tono deterministas (`tone-0` a `tone-4`).
- **Inexistencia de infraestructura de fotografías:** No existe actualmente una infraestructura productiva de imágenes de perfil (ni proveedores de red, ni orquestadores, ni componentes `ProfileAvatar`).
- **Desacoplamiento de análisis y visualización:** La lógica de análisis relacional (`lib/relationships.ts`) y la extracción de datos (`lib/importer.ts`) deben mantenerse estrictamente desacopladas de cualquier enriquecimiento fotográfico o visual futuro.
- **Persistencia sin caché fotográfica:** La base de IndexedDB incluye el almacén de snapshots y el registro local de disponibilidad definido en ADR-0006. No existe almacén de caché de fotografías.

### Disponibilidad identificada en la exportación y por el usuario (ADR-0006)

- El importador reconoce el prefijo explícito __deleted__ en listas JSON y HTML y devuelve esos valores en una lista de detecciones separada; los snapshots conservan sus listas originales.
- El registro combina detecciones explícitas con marcas manuales y correcciones; conserva origen, motivo y decisión de exclusión, y respeta las decisiones manuales en importaciones posteriores.
- El usuario puede agregar o quitar perfiles, cambiar motivos y corregir detecciones. El registro se conserva en IndexedDB, separado de las capturas y agrupado por cuenta.
- El checkbox global está desactivado de forma predeterminada y recalcula seguidores, seguidos, tendencias, comparaciones, detalle e informes CSV a partir de conjuntos filtrados. Solo se reconoce el marcador explícito; no se infieren estados sin esa señal ni se usan Instagram, scraping, proveedores o fotografías.

---

### Targets de compilación y despliegue

`vite.config.ts` selecciona un único adaptador por compilación:

- En Vercel, `FOLLOWLENS_DEPLOY_TARGET=vercel` (o `VERCEL=1`, definido por Vercel) habilita `nitro/vite` con el preset `vercel`. El plugin de Cloudflare no se carga en este modo; Nitro genera Build Output API en `.vercel/output`.
- En Cloudflare, `FOLLOWLENS_DEPLOY_TARGET=cloudflare` o la ausencia de ambas variables conserva el plugin `@cloudflare/vite-plugin`, sus bindings y la salida Vinext/Wrangler actuales.
- Un valor no reconocido de `FOLLOWLENS_DEPLOY_TARGET` detiene la carga de configuración.

Nitro es el adaptador de servidor/SSR para Vercel, no un receptor de exportaciones: la lectura y el análisis de relaciones siguen ejecutándose en el navegador, sin API de importación ni almacenamiento remoto.

## 5. CONSTRAINTS — Invariantes Arquitectónicas No Negociables

1. **PROHIBIDO añadir transmisión de datos:** No deben introducirse llamadas `fetch`, `axios`, WebSockets o analítica hacia servidores externos que envíen datos de seguidores, identificadores o metadatos de usuario.
2. **Frontera de Privacidad y Procesamiento en Cliente:** Todo el procesamiento ocurre en el navegador del usuario. Cero backends o microservicios para procesar datos personales.
3. **Exclusión estricta de archivos no relacionados:** El sistema nunca debe descomprimir ni acumular fotos, vídeos, audios, historias o conversaciones de chat contenidas en el archivo ZIP.
4. **Criterio de Tamaño de Archivo:** En la arquitectura implementada (ADR-0004), el tamaño total comprimido de un ZIP legítimo (>200 MB) no es causal de rechazo. Se aplican salvaguardas proporcionales por archivo descompreso (≤ 30 MB) y límites de consumo de recursos.
5. **Validación de Partes Obligatoria:** Si un usuario tiene múltiples archivos de seguidores (`followers_1.json`, `followers_3.json`), la importación debe fallar de inmediato si falta alguna parte intermedia para evitar corromper el análisis de seguidores perdidos.
6. **Aislamiento Multicuenta:** Nunca comparar ni mezclar snapshots pertenecientes a cuentas distintas (`account`).
7. **Restricción sobre Fotografías Remotas (ADR-0005):** No realizar peticiones a servicios externos ni scraping para obtener imágenes de perfiles; la resolución automática permanece en NO-GO.

---

## 6. VALIDATION — Protocolo de Verificación

Cualquier cambio estructural debe validarse mediante:

- `npm test`: Ejecución de los tests unitarios de `lib/relationships.test.ts` (0 suites).
- `npm run typecheck`: Validación estricta de TypeScript (`tsc --noEmit`).
- `npm run build`: Empaquetado completo de producción con Vite y Vinext (`vinext build`).
