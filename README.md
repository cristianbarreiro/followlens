# FollowLens

Analizador de relaciones de Instagram. React 19 + TypeScript sobre Vite y Vinext. Interfaz en español, procesamiento 100% en el navegador, sin credenciales, sin API de Instagram y sin servidores para datos personales.

---

## Capacidades

- **Mapeo de Relaciones:** Seguidores, seguidos, mutuos y relaciones no recíprocas (cuentas que no te siguen y cuentas a las que no seguís de vuelta).
- **Análisis Temporal entre Exportaciones:** Seguidores ganados o perdidos, seguimientos nuevos o descartados y evolución de conexiones mutuas entre snapshots fechados de una misma cuenta.
- **Filtros Específicos:** Exploración focalizada en no reciprocidad, seguidores perdidos que todavía seguís, mutuos perdidos y nuevas conexiones.
- **Exploración y Exportación:** Búsqueda interactiva, filtros por grupo, paginación, línea temporal (*timeline*) por cuenta y exportación a CSV con codificación UTF-8 segura (BOM).
- **Historial Local Opcional:** Persistencia voluntaria en IndexedDB (`followlens-local`) por cuenta, con eliminación granular de snapshots y control total por parte del usuario.
- **Compatibilidad con Exportaciones Oficiales (HTML y JSON):** Admite exportaciones oficiales de Instagram descargadas tanto en formato **HTML** como en formato **JSON**. Es compatible con el archivo ZIP completo oficial o con la selección conjunta de archivos individuales (`followers_1.html` / `followers_1.json`, partes secuenciales adicionales y `following.html` / `following.json`).
- **Integridad y Normalización:** Limpieza y normalización rigurosa de nombres de usuario (descarte de scripts, fórmulas de hojas de cálculo y enlaces ajenos), control de secuencia completa en multipartes y verificación de estructura.
- **Modo Demostración:** Datos sintéticos interactivos precargados para explorar las funciones de la aplicación sin requerir archivos reales.

---

## Privacidad y Límites de Seguridad

- **Procesamiento 100% Local en Cliente:** Todo el análisis y cálculo matemático ocurren íntegramente en el motor JavaScript del navegador. Ningún dato personal, archivo ni lista de usuarios se envía a servidores externos ni plataformas de telemetría.
- **Lectura Selectiva por Rangos en ZIP:** Al importar un archivo ZIP completo (incluidas exportaciones oficiales que superen 200 MB por contener fotos, vídeos, historias o audios), el lector inspecciona únicamente el Directorio Central mediante lecturas por rangos (`File.slice()`). Extrae de forma selectiva exclusivamente las entradas relacionales requeridas; fotos, vídeos, historias y mensajes privados nunca se leen ni se descomprimen en memoria.
- **Límites de Seguridad sobre Datos Relevantes:** El sistema no impone un rechazo arbitrario por el tamaño total comprimido del ZIP, sino salvaguardas estrictas sobre los datos relevantes procesados para prevenir consumos excesivos y ataques DoS:
  - Máximo 30 MiB por entrada relacional individual y 30 MiB acumulados para archivos relacionales descomprimidos (o en archivos sueltos no comprimidos).
  - Presupuesto máximo de 16 MiB para el Directorio Central del ZIP.
  - Límite de hasta 1.000 entradas relacionales analizadas.
  - Protección activa contra bombas de descompresión (*Zip Bombs*) mediante streaming DEFLATE acotado con detención anticipada y verificación estricta de CRC32 (IEEE 802.3).
- **Sin Analítica ni Rastreo:** Sin dependencias externas de telemetría, sin cookies de seguimiento, sin integración con la API de Instagram y sin solicitud de credenciales o tokens de sesión.
- **Persistencia Opcional:** Los datos residen en la memoria volátil de React por defecto. Solo se guardan localmente en el dispositivo si el usuario activa explícitamente la casilla de almacenamiento en IndexedDB.
- **Modelo Observacional Discreto:** Las diferencias reflejan observaciones matemáticas entre fechas discretas de exportación, no eventos en tiempo real ni notificaciones instantáneas de unfollow.

---

## Uso

1. **Solicitar la descarga de datos en Instagram:** Desde el *Centro de cuentas de Meta > Tu información y permisos > Descargar tu información*, solicitar una exportación seleccionando formato **HTML** o **JSON**, y el intervalo deseado (recomendado: *Todo el tiempo*).
2. **Seleccionar los archivos en FollowLens:**
   - **Opción recomendada (ZIP completo):** Seleccionar directamente el archivo `.zip` oficial tal como se descargó de Instagram, sin necesidad de descomprimirlo manualmente ni preocuparse por el tamaño total si contiene medios.
   - **Opción por archivos individuales:** Si se descomprimió el archivo previamente, seleccionar conjuntamente todos los archivos relacionales de la exportación: `followers_1.html` (y partes consecutivas `followers_2.html`, etc.) junto con `following.html`, o bien `followers_1.json` (y sus partes) junto con `following.json`.
   > **Nota:** No mezclar archivos de formatos distintos (JSON y HTML) en una misma importación.
3. **Completar datos de la cuenta:** Indicar el nombre de usuario de la cuenta y la fecha correspondiente a la exportación para identificar el snapshot.
4. *(Opcional)* **Guardar en historial local:** Activar la casilla para conservar la importación en IndexedDB si se desean realizar comparaciones históricas futuras con nuevas exportaciones.
5. **Explorar y comparar:** Analizar los grupos de relaciones, filtrar y buscar usuarios o exportar a CSV. Al importar una segunda exportación más reciente de la misma cuenta, la aplicación mostrará automáticamente la evolución y los cambios temporales.

---

## Desarrollo y Validación

Requiere **Node.js 24** o superior.

```sh
# Instalar dependencias
npm install

# Servidor de desarrollo (Vite / Vinext con HMR)
npm run dev
```

En entornos Windows PowerShell con restricciones de ejecución, usar `npm.cmd` en lugar de `npm`.

### Despliegue de producción

El proyecto mantiene Cloudflare como target local predeterminado y admite Vercel mediante Nitro. En Vercel, configura Node.js `24.x`, Install Command `npm ci`, Build Command `npm run build`, Framework Preset `Nitro` y Output Directory `.vercel/output`; define `FOLLOWLENS_DEPLOY_TARGET=vercel`. Los pasos completos y la validación local están en la [guía de targets de producción](docs/knowledge/development.md#targets-de-producción). El adaptador Nitro sirve el runtime de la aplicación, pero no procesa ni recibe exportaciones personales.

### Comandos de Validación

```sh
# Pruebas unitarias (39 tests con runner nativo de Node.js)
npm test

# Verificación estricta de tipos TypeScript
npm run typecheck

# Compilación de producción
npm run build

# Línea de base de rendimiento local (datos sintéticos, Node.js 24+)
npm run benchmark:importer

# Línea de base de escala en Chromium (instalar navegador con Playwright)
npm run benchmark:importer:browser

# Comparación DEFLATE/STORE y etapas instrumentadas (dos repeticiones)
npm run benchmark:importer:stages
npm run benchmark:importer:realistic
npm run benchmark:importer:optimization
npm run benchmark:importer:crc32

# Perfil opcional de CPU en Chromium (dos corridas por tamaño, resumen sin archivos)
npm run profile:importer:browser
```

- **Pruebas (`npm test`):** 39 tests unitarios nativos (`node:test`) que validan la suite completa: parsing HTML y JSON, extracción selectiva ZIP, defensas contra bombas de compresión, multipartes y álgebra relacional.
- **Tipos (`npm run typecheck`):** Validación TypeScript sin errores (`tsc --noEmit`).
- **Compilación (`npm run build`):** Generación limpia de bundles para producción con Vinext (Vite 8).
- **Rendimiento (`npm run benchmark:importer`):** Escenarios sintéticos opt-in; informa tiempos y snapshots aproximados sin umbrales de CI.
- **Escala en navegador (`npm run benchmark:importer:browser`):** Ejecución Playwright independiente para importar relaciones medianas, los tres tamaños relacionales de alta cardinalidad, un payload JSON válido de 30 MiB y el caso de límite excedido con recuperación; usa solo datos sintéticos y no forma parte de `npm run test:e2e`.
- **Etapas de importación (`npm run benchmark:importer:stages`):** Dos repeticiones opt-in de importación mediana y al límite en Chromium, comparando ZIP DEFLATE con STORE tras verificar el método del directorio central; imprime timings instrumentados y no instrumentados, sin umbrales.
- **Relaciones realistas de alta cardinalidad (`npm run benchmark:importer:realistic`):** Dos repeticiones opt-in de tres escalas de JSON sintético válido, comparando DEFLATE/STORE en Chromium y verificando conteos del dashboard, tamaños, límites y método ZIP. No usa padding ni forma parte de CI o `npm run test:e2e`.
- **Experimento de optimización del importador (`npm run benchmark:importer:optimization`):** Tres repeticiones tras calentamiento, para comparar el importador actual con un parser experimental que agrega directamente a los conjuntos globales. Se ejecuta en Chromium con fixtures DEFLATE medianos, de alta cardinalidad y próximos al límite; no altera la ruta de producto ni se ejecuta en CI.
- **Alternativa CRC32 (`npm run benchmark:importer:crc32`):** Verifica equivalencia con el algoritmo productivo y los CRC del directorio central, y compara cinco corridas por entrada JSON en tres escalas Chromium. Slicing-by-8 es solo un candidato en `tests/perf`; no modifica el importador ni forma parte de CI.
- **Profiling de CPU (`npm run profile:importer:browser`):** Captura CDP opcional del flujo UI mediano y cercano al límite; imprime un resumen de funciones sin guardar perfiles crudos ni datos importados.
- **Linter (`npm run lint`):** Análisis con `oxlint` (el núcleo del importador en `lib/` cuenta con 0 errores; las advertencias preexistentes se encuentran acotadas a componentes generados de UI y `node:test`, documentadas en [development.md](docs/knowledge/development.md)).

---

## Documentación Técnica y Agentes de IA

Para desarrolladores, colaboradores y agentes de codificación automatizados (AI Agents):
- **Guía Operativa para Agentes:** [AGENTS.md](AGENTS.md)
- **Base de Conocimiento Estructurada (OKF v0.2):** [docs/knowledge/index.md](docs/knowledge/index.md)
- **Adaptadores de Modelos:** [CLAUDE.md](CLAUDE.md) y [GEMINI.md](GEMINI.md)

---

## Licencia / License

El código fuente de FollowLens está disponible públicamente bajo los términos de la licencia **PolyForm Noncommercial License 1.0.0** (*source-available*).

- **Usos Permitidos:** Se permite el uso personal, estudio, investigación, modificación y experimentación sin fines comerciales bajo los términos de la licencia.
- **Restricción Comercial:** Queda expresamente prohibida la explotación comercial, venta o distribución como parte de un servicio o producto comercial sin autorización previa y por escrito del titular de los derechos de autor.
- Consulta el archivo [LICENSE](LICENSE) para conocer los términos legales completos y [NOTICE](NOTICE) para la atribución oficial de copyright.
