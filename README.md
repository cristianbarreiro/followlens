# FollowLens

Analizador de relaciones de Instagram. React 19 + TypeScript sobre Vite y Vinext. Interfaz en español, procesamiento 100% en el navegador, sin credenciales, sin API de Instagram y sin servidores para datos personales.

---

## Capacidades

- **Mapeo de Relaciones:** Seguidores, seguidos, mutuos y relaciones no recíprocas (quién no te sigue y a quién no seguís).
- **Análisis Temporal entre Exportaciones:** Seguidores nuevos/perdidos, seguimientos nuevos/perdidos y cambios en mutuos entre fechas.
- **Filtros Específicos:** Filtro para seguidores perdidos a quienes todavía seguís.
- **Exploración y Exportación:** Búsqueda, paginación, timeline por cuenta y exportación a CSV con codificación UTF-8 segura.
- **Historial Local Opcional:** Persistencia voluntaria en IndexedDB por cuenta, con eliminación individual.
- **Compatibilidad Amplia:** Soporte para formatos planos o envueltos de Instagram, múltiples archivos (`followers_1.json`, `followers_2.json`, etc.) y normalización de nombres de usuario.
- **Modo Demostración:** Datos sintéticos interactivos precargados para explorar las funciones sin requerir archivos reales.

---

## Privacidad y Límites de Seguridad

- **Procesamiento 100% Local:** Los archivos se analizan íntegramente en la memoria del navegador. Ningún dato personal o lista de seguidores se envía a servidores externos.
- **Filtrado Selectivo de Archivos:** Al importar un ZIP, el descompresor solo extrae los JSON de seguidores y seguidos; fotos, videos, historias y mensajes privados se ignoran y descartan automáticamente.
- **Sin Analítica:** La aplicación no incluye rastreadores, telemetría ni fuentes externas que capturen datos del usuario.
- **Persistencia Voluntaria:** El historial se conserva únicamente si el usuario lo solicita explícitamente en IndexedDB (`followlens-local`). Los datos residen en el navegador y desaparecen al limpiar los datos de navegación.
- **Límites DoS:** Máximo 200 MB por lote de entrada y 30 MB de JSON descompreso (hasta 1.000 archivos).
- **Modelo Observacional:** Los cambios reflejan observaciones matemáticas entre exportaciones fechadas, no eventos en vivo ni notificaciones instantáneas de unfollow.

---

## Uso

1. Solicitar la descarga de datos desde Instagram seleccionando formato **JSON** y período **Todo el tiempo**.
2. Importar el archivo ZIP completo, o seleccionar juntos `followers_1.json` (y todas sus partes) junto con `following.json`.
3. Indicar el usuario propietario de la cuenta y la fecha de exportación.
4. *(Opcional)* Activar la casilla para conservar la importación en IndexedDB si se desean realizar comparaciones históricas futuras.
5. Importar una segunda exportación más reciente de la misma cuenta para visualizar y analizar los cambios.

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

### Comandos de Validación

```sh
# Pruebas unitarias (14 tests con runner nativo de Node.js)
npm test

# Verificación de tipos TypeScript
npm run typecheck

# Compilación de producción
npm run build
```

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
