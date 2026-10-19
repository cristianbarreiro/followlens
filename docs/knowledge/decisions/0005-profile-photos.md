---
okf_version: "0.2"
type: Decision
title: ADR-0005 - Evaluación y Restricción Arquitectónica sobre Fotografías de Perfil
description: Decisión NO-GO para la recuperación automática universal de fotografías de perfil de Instagram basada en auditoría documental de proveedores y APIs.
tags:
  - decision
  - adr
  - profile-photos
  - privacy
  - client-side
timestamp: "2026-10-18T22:30:00-03:00"
lifecycle: stable
---

# ADR-0005: Evaluación y Restricción Arquitectónica sobre Fotografías de Perfil

## Estado

**Aceptado como restricción arquitectónica actual** (octubre 2026).

---

## 1. Contexto

En FollowLens, las cuentas listadas en las tablas de relaciones (seguidores, seguidos, mutuos, no recíprocos y fans) se representan visualmente mediante el componente `Avatar` en [app/page.tsx](../../../app/page.tsx), el cual calcula las iniciales del nombre de usuario (`name.slice(0, 2)`) y asigna una tonalidad cromática determinista (`tone-0` a `tone-4`).

Con el objetivo de determinar si es factible enriquecer visualmente la interfaz incorporando fotografías de perfil oficiales de las cuentas analizadas, se llevó a cabo una investigación de viabilidad técnica, contractual y de privacidad (Fases 0 y 0.2). La investigación evaluó si existe algún mecanismo que permita resolver de manera automatizada y universal las imágenes de perfil a partir exclusivamente de los nombres de usuario presentes en las exportaciones oficiales, sin vulnerar las garantías de privacidad y contención en cliente de la aplicación.

---

## 2. Auditoría Documental de Alternativas y Clasificación de Evidencias

Para fundamentar la decisión con rigor técnico y honestidad documental, se auditaron las fuentes originales disponibles, distinguiendo explícitamente entre:
- **Datos confirmados por documentación oficial.**
- **Información declarada por proveedores de terceros.**
- **Inferencias y riesgos técnicos no probados experimentalmente.**
- **Cuestiones no verificadas.**

### A. Instagram Graph API — Business Discovery (`business_discovery.username`)
- **Fuentes oficiales:**
  - [Meta for Developers · Instagram Graph API: IG User Business Discovery](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/business_discovery)
  - [Meta Instagram Postman Collection Workspace](https://www.postman.com/meta/instagram/)
- **Confirmado por documentación oficial:**
  - El campo `business_discovery.username({username}){profile_picture_url}` permite consultar la imagen de perfil pública de otras cuentas, pero está restringido exclusivamente a cuentas de tipo **Business o Creator** (`IG User`). Meta documenta expresamente que si se intenta consultar una cuenta personal, la API devuelve un error.
  - La consulta exige autenticación OAuth: un identificador de cuenta profesional de la app, token de acceso con permisos concedidos vía Facebook Login (`instagram_basic`, `pages_read_engagement`), y está sujeta a límites de plataforma por usuario/hora.
  - No devuelve datos de cuentas privadas ni de cuentas profesionales con restricción de edad (*age-gated*).
- **Limitación arquitectónica para FollowLens:**
  - La gran mayoría de seguidores y seguidos en un perfil típico son cuentas personales, por lo que la cobertura es parcial e insuficiente para un análisis universal.
  - Exigiría al usuario vincular una app en Meta for Developers o introducir credenciales y un backend intermediario para gestionar tokens, violando la regla de procesamiento 100% en cliente sin credenciales ([ADR-0001](0001-client-side-privacy-boundary.md)).
  - Cada petición transmite el nombre de usuario a Meta en tiempo de ejecución.

### B. Instagram Basic Display API
- **Fuente oficial:** [Meta for Developers: Update on Instagram Basic Display API (04/09/2024)](https://developers.facebook.com/blog/post/2024/09/04/update-on-instagram-basic-display-api/)
- **Confirmado por documentación oficial:**
  - Meta anunció y ejecutó la retirada y apagado definitivo de la Instagram Basic Display API el **4 de diciembre de 2024** (*«Starting on December 4th, 2024, Instagram Basic Display API will no longer be available»*).
  - Meta declaró formalmente que a partir de esa fecha no ofrecería APIs para aplicaciones orientadas al consumidor final.
- **Conclusión:** Viabilidad nula (fuente extinta).

### C. Proveedores de Terceros (caso analizado: unavatar.io)
- **Fuentes auditadas:**
  - [Documentación oficial de Unavatar](https://unavatar.io/docs)
  - [Política de privacidad de Unavatar](https://unavatar.io/privacy)
- **Información declarada por el proveedor:**
  - Unavatar expone un endpoint funcional `unavatar.io/instagram/{username}` que técnicamente resuelve la imagen de perfil a partir del nombre de usuario sin requerir tokens de Instagram por parte del cliente.
  - En su documentación, Unavatar declara estar impulsado por `microlink.io`, definiéndolo como *«the headless browser API that handles all the heavy lifting behind the scenes»*.
  - El uso gratuito anónimo está restringido a 25 peticiones/día por dirección IP y exige como contrapartida contractual incluir un enlace de atribución público y rastreable en producción (`<a href="https://unavatar.io">Avatars provided by Unavatar</a>`), prohibiendo expresamente atributos `rel="nofollow"`, redirecciones u ofuscaciones.
  - Los planes sin atribución o de mayor volumen son comerciales (PRO) y exigen claves de autenticación secretas o publicables.
  - En su política de privacidad, Unavatar declara que procesa y retiene metadatos de las peticiones, contadores de uso y autenticación para operar el servicio y prevenir abusos, apoyándose en proveedores externos de infraestructura, analítica y pagos.
- **Evaluación frente a los requisitos de FollowLens:**
  - **Transmisión de identificadores personales:** Invocar el endpoint transmite cada nombre de usuario consultado fuera del navegador local hacia la infraestructura de Unavatar y sus subprocesadores, lo que constituye una transmisión no autorizada de las relaciones del usuario a un tercero, vulnerando la garantía fundamental de privacidad en cliente ([ADR-0001](0001-client-side-privacy-boundary.md)).
  - **Límites operativos y comerciales:** El límite anónimo de 25 peticiones/día por IP es inviable para listas que contienen cientos o miles de seguidores, y la exigencia de atribución rastreable no indexada es incompatible con una herramienta privada.
  - **Riesgo de estabilidad y dependencia:** La existencia de un endpoint funcional de terceros no acredita que sea legítimo frente a Instagram, universalmente estable en el tiempo ni contractualmente compatible con los principios de privacidad de este producto.

### D. URLs directas de CDN de Meta (`scontent*.cdninstagram.com` / `fbcdn.net`)
- **Evidencia verificada:** Las URLs de recursos multimedia de Meta observadas en respuestas contienen parámetros firmados y temporales (`oh`, `oe`).
- **Limitación técnica:** No existe un algoritmo público ni derivación matemática que permita resolver la URL de la imagen a partir únicamente del nombre de usuario sin consultar previamente una API o una página web.
- **Cuestiones no verificadas:** La duración exacta de los tokens de firma y si los servidores CDN de Meta proporcionan cabeceras CORS (`Access-Control-Allow-Origin`) consistentes para su lectura o conversión en `Blob` en el cliente no están documentadas públicamente por Meta.

### E. Extracción automatizada (Scraping) de instagram.com
- **Fuente:** [Condiciones de uso de Instagram](https://help.instagram.com/581066165581870)
- **Confirmado en términos contractuales:** Las condiciones de uso de Instagram prohíben expresamente el acceso o recopilación automatizada de información de sus servicios sin consentimiento previo por escrito de la plataforma.
- **Riesgos técnicos y operativos:** La extracción directa desde el navegador colisiona con políticas de origen cruzado (CORS), sistemas de detección anti-bot (desafíos CAPTCHA, pantallas de inicio de sesión forzadas) y riesgo de bloqueo de direcciones IP.

---

## 3. Decisión Arquitectónica

### Resultado de viabilidad
**`NO-GO` para la recuperación automática de fotografías de perfil de Instagram bajo los requisitos actuales de FollowLens.**

### Fundamento
Existen servicios y mecanismos técnicos que resuelven fotografías de perfil utilizando nombres de usuario (como el endpoint de Unavatar o la API para cuentas profesionales de Meta). Sin embargo, **la auditoría técnica y de privacidad concluye que no se ha identificado ninguna fuente que cumpla simultáneamente con la totalidad de los requisitos y restricciones de FollowLens**:

1. **Cobertura universal:** Capacidad de resolver de forma homogénea cuentas personales de terceros (que constituyen la gran mayoría de una exportación de relaciones) y cuentas profesionales.
2. **Soberanía y privacidad radical:** Ausencia total de transmisión de identificadores, nombres de usuario o listas relacionales a servidores remotos o proveedores externos.
3. **Ausencia de credenciales:** Operación 100% en cliente sin requerir tokens corporativos de Meta, cuentas de desarrollador de terceros ni gestión de claves de API en el navegador.
4. **Legitimidad y cumplimiento normativo:** Operación respaldada por términos de uso oficiales sin recurrir a scraping no autorizado ni elusión de medidas técnicas de protección.

La existencia de un endpoint funcional de terceros no demuestra por sí sola que sea legítimo, universal, estable o compatible con la privacidad del producto. Por tanto, mientras no exista una fuente que satisfaga de manera simultánea estos cuatro criterios, la recuperación automática permanece descartada.

### Comportamiento ratificado
- Los avatares con iniciales deterministas y paleta cromática calculada (`tone-0` a `tone-4`) continúan siendo el comportamiento predeterminado, autosuficiente y permanente de la aplicación.
- Esta decisión no prejuzga la aparición de futuras soluciones oficiales o mecanismos locales independientes, pero fija una restricción arquitectónica vinculante para el repositorio.

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

1. **Fuente legítima documentada:** Existe una fuente de imágenes identificada y respaldada por documentación oficial verificable.
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
