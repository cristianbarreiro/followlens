---
okf_version: "0.2"
type: Decision
title: ADR-0005 - Evaluación y Restricción Arquitectónica sobre Fotografías de Perfil
description: Decisión NO-GO para la recuperación automática universal de fotografías de perfil de Instagram y condiciones para su reconsideración futura.
tags:
  - decision
  - adr
  - profile-photos
  - privacy
  - client-side
timestamp: "2026-10-18T22:00:00-03:00"
lifecycle: stable
---

# ADR-0005: Evaluación y Restricción Arquitectónica sobre Fotografías de Perfil

## Estado

**Aceptado como restricción arquitectónica actual** (octubre 2026).

---

## 1. Contexto

En FollowLens, las cuentas listadas en las tablas de relaciones (seguidores, seguidos, mutuos, no recíprocos y fans) se representan visualmente mediante el componente `Avatar` en [app/page.tsx](../../../app/page.tsx), el cual calcula las iniciales del nombre de usuario (`name.slice(0, 2)`) y asigna una tonalidad cromática determinista (`tone-0` a `tone-4`).

Con el objetivo de determinar si es factible enriquecer visualmente la interfaz incorporando fotografías de perfil oficiales de las cuentas analizadas, se llevó a cabo una investigación de viabilidad técnica, legal y de privacidad (Fase 0). La investigación evaluó si existe algún mecanismo que permita resolver de manera automatizada y universal las imágenes de perfil a partir exclusivamente de los nombres de usuario presentes en las exportaciones oficiales.

---

## 2. Alternativas Investigadas y Limitaciones Técnicas y Legales

La investigación de Fase 0 analizó cinco categorías de fuentes potenciales:

### A. Instagram Graph API — Business Discovery (`business_discovery.username`)
- **Restricción de alcance:** La documentación oficial de Meta restringe este endpoint a cuentas profesionales (*Business* o *Creator*). No permite consultar cuentas personales, que representan la inmensa mayoría de seguidores y seguidos en un perfil estándar.
- **Barrera de autenticación:** Requiere tokens OAuth corporativos con permisos elevados (`instagram_basic`, `pages_read_engagement`), lo que obligaría al usuario a registrar una aplicación en Meta for Developers o requeriría un backend intermediario. Ambas opciones violan los principios de FollowLens ([ADR-0001](0001-client-side-privacy-boundary.md) y regla de ausencia de credenciales).
- **Privacidad:** Exige enviar los nombres de usuario consultados a la infraestructura de Meta en tiempo de ejecución.

### B. Instagram Basic Display API
- **Estado de ciclo de vida:** Meta retiró y apagó definitivamente la Basic Display API el **4 de diciembre de 2024**. Meta no ofrece actualmente ninguna API pública orientada a aplicaciones de consumo general. Viabilidad nula.

### C. Proveedores de terceros no oficiales (p. ej. unavatar.io)
- **Mecanismo real:** No son proveedores autorizados por Meta; operan navegadores headless (`microlink.io`) que extraen datos mediante scraping de la web pública de Instagram.
- **Violación de privacidad:** Cada consulta transmite el nombre de usuario de los contactos a servidores de terceros, infringiendo directamente el principio de cero telemetría e inviolabilidad de datos personales.
- **Riesgo operativo:** Servicios sujetos a bloqueos de tasa, interrupciones frecuentes por contramedidas anti-bot de Instagram y dependencia de infraestructura externa ajena.

### D. URLs directas de CDN de Meta (`scontent*.cdninstagram.com` / `fbcdn.net`)
- **Firmas temporales:** Las URLs de recursos multimedia de Meta utilizan parámetros firmados y temporales (`oh`, `oe`).
- **Imposibilidad de resolución:** No existe un algoritmo, derivación criptográfica ni mecanismo público fiable para deducir la URL firmada del avatar a partir únicamente del nombre de usuario.

### E. Extracción automatizada (Scraping) de instagram.com
- **Condiciones de uso:** Las Condiciones de uso de Instagram prohíben explícitamente recopilar información de forma automatizada sin permiso expreso por escrito.
- **Impedimentos técnicos:** Políticas de CORS en el navegador del cliente, desafíos de autenticación (checkpoints, login walls) y riesgo de bloqueo de direcciones IP.

---

## 3. Decisión Arquitectónica

### Resultado de viabilidad
**`NO-GO` para la recuperación automática universal de fotografías de perfil de Instagram bajo los requisitos actuales de FollowLens.**

### Fundamento
La investigación no identificó ninguna fuente universal que permita obtener fotografías de perfiles de terceros de forma fiable, legítima, con permisos suficientes y respetando simultáneamente las garantías fundamentales de FollowLens:
1. Procesamiento 100% en cliente sin servidores intermediarios.
2. Cero transmisión de nombres de usuario o listas personales a terceros.
3. Ausencia absoluta de credenciales, cuentas de desarrollador de Meta o tokens.
4. Cumplimiento de términos contractuales y legales (sin scraping no autorizado).

### Comportamiento ratificado
- Los avatares con iniciales deterministas y paleta cromática calculada (`tone-0` a `tone-4`) continúan siendo el comportamiento predeterminado, autosuficiente y permanente de la aplicación.
- Esta decisión refleja la evidencia técnica y legal disponible al momento de la evaluación. No constituye una afirmación absoluta sobre hipotéticas herramientas futuras, pero fija una restricción arquitectónica vinculante para el repositorio.

---

## 4. Invariantes Protegidos por la Decisión

Cualquier futura evolución o reconsideración de fotografías de perfil deberá cumplir obligatoriamente con los siguientes invariantes:

1. **Independencia del análisis relacional:** La carga de imágenes debe ser asíncrona y no bloquear, retrasar ni alterar los cálculos de relaciones, la normalización ni la renderización del dashboard.
2. **Cero transmisión de datos personales:** No se podrán enviar listas de contactos, nombres de usuario ni metadatos relacionales a servidores remotos ni proveedores externos.
3. **Sin credenciales ni scraping:** No se solicitarán contraseñas, cookies de sesión, tokens de acceso ni se implementará scraping automatizado no autorizado.
4. **No esencialidad:** FollowLens debe funcionar íntegramente y sin degradación funcional en ausencia de fotografías de perfil.
5. **Fallback permanente:** El avatar de iniciales deterministas se mantendrá siempre como render inicial inmediato y como fallback permanente ante fallos, ausencias de imagen o revocación de permisos.

---

## 5. Alcance Actual y Estado del Código

Esta decisión es **exclusivamente documental y de diseño restrictivo**:

- **No se modificó código de producción.**
- **No se implementan** contratos de proveedores (`ProfilePhotoProvider`), orquestadores (`loader.ts`), sistemas de caché en memoria ni componentes alternativos (`ProfileAvatar`).
- **No se migra IndexedDB:** La base de datos `followlens-local` permanece en la **versión 1** con el almacén único `snapshots` ([ADR-0003](0003-optional-local-persistence.md)). No se crea ningún almacén de imágenes (`profilePhotos`) mientras no exista una fuente aprobada que genere datos legítimos que guardar.
- Los módulos de importación (`lib/importer.ts`, `lib/zip.ts`, `lib/html-parser.ts`) y cálculo matemático (`lib/relationships.ts`) permanecen estrictamente inalterados.

---

## 6. Condiciones para Reconsiderar el NO-GO

Para que el estado de esta decisión pueda cambiar a `GO` o `GO WITH CONDITIONS`, deberá presentarse una propuesta técnica y formalizarse una actualización de este ADR que demuestre el cumplimiento de la totalidad de los siguientes criterios:

1. **Fuente legítima documentada:** Existe una fuente de imágenes explícitamente identificada y respaldada por documentación oficial verificable.
2. **Marco legal y contractual transparente:** Los términos de servicio y condiciones de uso de la fuente admiten de forma inequívoca el mecanismo de consulta propuesto sin requerir scraping no autorizado.
3. **Alcance y tipología de cuentas delimitados:** Se conocen con precisión qué tipos de cuentas pueden resolverse y cuáles no (por ejemplo, si existiese soporte exclusivo para perfiles públicos verificados o del propio titular del archivo exportado).
4. **Respeto a la soberanía de datos (Privacidad):** Se acredita fehacientemente que el mecanismo de consulta no transmite listas personales ni nombres de usuario a servidores de terceros, o se demuestra cómo mantener la contención en cliente.
5. **Evaluación de red y navegador:** Se han verificado las cabeceras CORS, tiempos de respuesta, límites de cuota (*rate limiting*), ciclo de vida de URLs firmadas y la capacidad de decodificar y almacenar imágenes como `Blob` de forma segura.
6. **Mecanismo de consentimiento explícito:** Si la solución llegase a requerir alguna llamada de red, se requiere un diálogo de consentimiento previo, claro y desmarcado por defecto, notificando exactamente al usuario qué petición se emitiría.
7. **Arquitectura desacoplada validada:** Se cuenta con una arquitectura de carga diferida en segundo plano (`requestIdleCallback` / `useEffect`), con deduplicación de peticiones, cancelación de tareas obsoletas y garantía de que el análisis de relaciones concluye con independencia del resultado de las fotos.

> [!NOTE]
> Una alternativa consistente en la carga manual y voluntaria de imágenes o avatares por parte del propio usuario (por ejemplo, seleccionando archivos locales desde su dispositivo) no constituye una recuperación automática y, de contemplarse en el futuro, deberá evaluarse en una decisión arquitectónica independiente.

---

## 7. Consecuencias

- **Positivas:**
  - Preservación íntegra del modelo de privacidad y seguridad ([ADR-0001](0001-client-side-privacy-boundary.md)).
  - Eliminación de dependencias externas, costos de infraestructura y puntos únicos de fallo.
  - Cero riesgo de bloqueos de IP, captchas o infracciones de términos de servicio de la plataforma.
  - El rendimiento de renderizado del dashboard y la importación de datos se mantiene óptimo y predecible.
- **Negativas:**
  - La representación visual de los perfiles continúa limitada a las iniciales estilizadas con tonalidades automáticas en lugar de fotografías reales.
