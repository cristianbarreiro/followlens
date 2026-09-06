# FollowLens

Analizador de relaciones de Instagram. React + TypeScript sobre Vite/Vinext. Interfaz en español, sin API de Instagram ni backend para datos personales.

## Desarrollo

Requiere Node.js 24 o superior.

```sh
npm install
npm run dev
```

En Windows, si PowerShell restringe los scripts, usar `npm.cmd` en lugar de `npm`.

```sh
npm run build
npx tsc --noEmit
node --test lib/relationships.test.ts
```

## Uso

1. Exportar seguidores y seguidos en JSON con período **Todo el tiempo** desde Instagram.
2. Importar un ZIP, o seleccionar juntos `followers_1.json`, todas las partes adicionales y `following.json`.
3. Indicar el usuario propietario y la fecha de exportación. El propietario no siempre aparece en esos archivos: el usuario debe asignarlo correctamente.
4. Elegir si conservar la importación en IndexedDB. Por defecto solo se mantiene en memoria.
5. Importar otra fecha de la misma cuenta para comparar cambios. Hay un ejemplo ficticio de tres fechas que nunca se guarda.

## Capacidades

- Seguidores, seguidos, mutuos, relaciones sin reciprocidad.
- Seguidores nuevos/perdidos, seguimientos nuevos/perdidos y cambios en mutuos entre fechas.
- Filtro de seguidores perdidos a quienes todavía seguís.
- Búsqueda, paginación, evolución, historial por cuenta y exportación CSV del filtro activo.
- Historial local opcional, separado por cuenta, con eliminación individual.
- Manejo de JSON vacíos legítimos, formatos planos o envueltos, partes múltiples y nombres normalizados.

## Privacidad y límites

Los archivos se leen localmente. Solo se extraen los JSON de seguidores y seguidos; mensajes y medios no se analizan. La aplicación no envía datos importados a servidores ni utiliza analítica o fuentes externas. El sitio hospedado sirve los recursos de la interfaz; no recibe los archivos. El acceso a la edición privada hospedada puede requerir la sesión de Sites, nunca la de Instagram.

El historial guardado pertenece al navegador y origen del sitio. No se sincroniza y desaparece al borrar los datos del navegador. Conservar las exportaciones originales.

Máximo 200 MB de archivos de entrada y 30 MB de JSON de relaciones descomprimidos. Importar un ZIP por vez. Rechaza listas faltantes, formatos no compatibles, duplicados ambiguos y saltos detectables en las partes. No puede detectar una última parte omitida: se pide confirmar que el archivo está completo.

Los cambios son observaciones entre exportaciones, no fechas exactas ni motivos de unfollow. Renombres, desactivaciones y exports incompletos pueden parecer pérdidas. Las métricas no se actualizan en vivo. No se infieren relaciones entre terceros ni intenciones personales.

## Organización

- `app/page.tsx`: experiencia y estado de sesión.
- `components/import-dialog.tsx`: importación y consentimiento de persistencia.
- `lib/importer.ts`: ZIP/JSON, formatos y límites.
- `lib/relationships.ts`: comparaciones, historial y CSV.
- `lib/storage.ts`: IndexedDB.
- `lib/relationships.test.ts`: pruebas de cálculos e importación.

La compilación y las pruebas se verifican por separado. No se ha completado una prueba interactiva en navegador en este entorno.
