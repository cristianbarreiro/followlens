import { normalize } from './relationships.ts';

const IGNORED_PATH_SEGMENTS = new Set([
  // Contenido multimedia y navegación de contenido
  'p',
  'reel',
  'reels',
  'stories',
  'story',
  'tv',
  'share',
  'create',
  'explore',
  'tags',
  'locations',
  // Institucional, legal y corporativo
  'about',
  'legal',
  'terms',
  'privacy',
  'help',
  'support',
  'press',
  'developer',
  'api',
  'directory',
  'business',
  // Cuentas y sistema
  'accounts',
  'direct',
  'emails',
  'settings',
  'challenge',
  'consent',
  'your_activity',
  'graphql',
  '_u',
]);

/**
 * Extrae y normaliza un nombre de usuario de Instagram a partir de un enlace URL.
 * Soporta exclusivamente URLs de perfiles directas (/username) y con prefijo de exportación (/_u/username).
 * Rechaza hostnames ajenos, rutas de contenido (/p/, /reel/, /stories/, /explore/),
 * enlaces institucionales, legales o de navegación interna.
 */
export function extractUsernameFromUrl(href: string): string | null {
  if (typeof href !== 'string' || !href.trim()) {
    return null;
  }
  try {
    const url = new URL(href, 'https://www.instagram.com');
    // Validar protocolo y hostname estricto
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return null;
    }
    const hostname = url.hostname.toLowerCase();
    if (hostname !== 'www.instagram.com' && hostname !== 'instagram.com') {
      return null;
    }

    const parts = url.pathname.split('/').filter(Boolean);
    if (!parts.length) return null;

    let candidate: string | null = null;
    if (parts[0] === '_u') {
      // Formato de exportación: /_u/{username}
      if (parts.length !== 2) return null;
      candidate = parts[1];
    } else {
      // Formato directo de perfil: /{username}
      if (parts.length !== 1) return null;
      candidate = parts[0];
    }

    if (!candidate || IGNORED_PATH_SEGMENTS.has(candidate.toLowerCase())) {
      return null;
    }

    return normalize(candidate);
  } catch {
    return null;
  }
}

/**
 * Parser seguro y pasivo para extraer listas de relaciones (seguidores o seguidos)
 * a partir de documentos HTML oficiales descargados de Instagram.
 *
 * Emplea DOMParser para interpretar la jerarquía de etiquetas sin ejecutar código,
 * decodifica entidades HTML y valida rigurosamente los nombres de usuario con normalize().
 */
export function parseHtmlRelationships(
  html: string,
  kind: 'followers' | 'following',
): string[] {
  if (typeof html !== 'string' || !html.trim()) {
    throw new Error(
      `El archivo de ${kind === 'followers' ? 'seguidores' : 'seguidos'} está vacío o no es válido.`,
    );
  }

  if (typeof globalThis.DOMParser === 'undefined') {
    throw new Error(
      'DOMParser no está disponible en este entorno de ejecución.',
    );
  }

  const parser = new globalThis.DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  if (!doc || !doc.body) {
    throw new Error(
      `No se pudo interpretar el archivo HTML de ${kind === 'followers' ? 'seguidores' : 'seguidos'}.`,
    );
  }

  // Comprobar indicadores de exportación oficial de relaciones de Instagram
  const title =
    doc.querySelector('title')?.textContent?.trim().toLowerCase() ?? '';
  const h1 = doc.querySelector('h1')?.textContent?.trim().toLowerCase() ?? '';
  const titleOrH1 = `${title} ${h1}`;

  // 1. Títulos/encabezados relacionales conocidos (multilingüe)
  const hasRelationHeading =
    /follow|seguid|abonn|seguit|gefolgt/i.test(titleOrH1);

  // 2. Clases CSS o estructura distintiva de exportación Meta
  const hasMetaMarkers =
    doc.querySelector('._a6-p, ._a6-g, ._a706, ._a72d, .uiBoxWhite') !== null;

  // 3. Contenedor de contenido
  const container = doc.querySelector('main') || doc.body;

  // Encontrar bloques de registros de relaciones en el orden de especificidad
  const recordBlocks =
    container.querySelectorAll('.uiBoxWhite').length > 0
      ? container.querySelectorAll('.uiBoxWhite')
      : container.querySelectorAll('._a6-p').length > 0
        ? container.querySelectorAll('._a6-p')
        : container.querySelectorAll('[role="main"] > div');

  // Buscar todos los enlaces en el contenedor
  const allAnchors = container.querySelectorAll('a');

  let validProfileFound = false;
  for (const a of allAnchors) {
    const href = a.getAttribute('href');
    if (href && extractUsernameFromUrl(href)) {
      validProfileFound = true;
      break;
    }
  }

  // Documento reconocido si tiene encabezado o estilos Meta, y o bien contiene enlaces válidos
  // o bien es una lista legítimamente vacía (sin bloques ni enlaces ajenos).
  const isLikelyExport =
    (hasRelationHeading || hasMetaMarkers) &&
    (validProfileFound ||
      (recordBlocks.length === 0 && allAnchors.length === 0));

  if (!isLikelyExport) {
    throw new Error(
      `El archivo HTML no tiene una estructura compatible de ${kind === 'followers' ? 'seguidores' : 'seguidos'} de Instagram.`,
    );
  }

  const names = new Set<string>();

  if (recordBlocks.length > 0) {
    for (const block of recordBlocks) {
      const anchor = block.querySelector(
        'a[href*="instagram.com"], a[href^="/_u/"], a[href^="/"]',
      );
      let username: string | null = null;
      if (anchor) {
        const href = anchor.getAttribute('href');
        if (href) {
          username = extractUsernameFromUrl(href);
        } else {
          username = normalize(anchor.textContent);
        }
      }
      // En listas de seguidos, admitir encabezados de registro (h2) si el enlace no arrojó username
      if (!username && kind === 'following') {
        const heading = block.querySelector('h2');
        if (heading) {
          const headingUser = normalize(heading.textContent);
          if (
            headingUser &&
            !IGNORED_PATH_SEGMENTS.has(headingUser.toLowerCase())
          ) {
            username = headingUser;
          }
        }
      }
      if (username) {
        names.add(username);
      }
    }

    if (names.size === 0) {
      throw new Error(
        `No se pudieron extraer nombres de usuario válidos del archivo HTML de ${kind === 'followers' ? 'seguidores' : 'seguidos'}.`,
      );
    }
  } else {
    // Si la estructura no tiene bloques contenedores específicos, extraer enlaces directos
    for (const anchor of allAnchors) {
      const href = anchor.getAttribute('href');
      const username = href
        ? extractUsernameFromUrl(href)
        : normalize(anchor.textContent);
      if (username) {
        names.add(username);
      }
    }

    if (allAnchors.length > 0 && names.size === 0) {
      throw new Error(
        `No se pudieron extraer nombres de usuario válidos del archivo HTML de ${kind === 'followers' ? 'seguidores' : 'seguidos'}.`,
      );
    }
  }

  return [...names].sort();
}
