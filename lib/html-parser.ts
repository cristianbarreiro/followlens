import { normalize } from './relationships.ts';

const IGNORED_PATH_SEGMENTS = new Set([
  'about',
  'legal',
  'terms',
  'privacy',
  'explore',
  'direct',
  'accounts',
  'developer',
  'help',
  'directory',
  'press',
  'api',
]);

/**
 * Extrae y normaliza un nombre de usuario de Instagram a partir de un enlace URL.
 * Soporta URLs de perfiles directas (/username) y con prefijo de exportación (/_u/username).
 * Ignora enlaces a secciones institucionales, legales o de navegación interna.
 */
export function extractUsernameFromUrl(href: string): string | null {
  try {
    const url = new URL(href, 'https://www.instagram.com');
    if (!['www.instagram.com', 'instagram.com'].includes(url.hostname)) {
      return null;
    }
    const parts = url.pathname.split('/').filter(Boolean);
    if (!parts.length) return null;
    const candidate = parts[0] === '_u' ? parts[1] : parts[0];
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
  const isLikelyExport =
    title.includes('seguid') ||
    title.includes('follow') ||
    h1.includes('seguid') ||
    h1.includes('follow') ||
    doc.querySelector('main') !== null ||
    doc.querySelector('._a6-p') !== null ||
    doc.querySelector('.uiBoxWhite') !== null;

  if (!isLikelyExport) {
    throw new Error(
      `El archivo HTML no tiene una estructura compatible de ${kind === 'followers' ? 'seguidores' : 'seguidos'} de Instagram.`,
    );
  }

  // Ubicar el contenedor de contenido principal
  const container = doc.querySelector('main') || doc.body;

  // En exportaciones oficiales de Instagram, cada registro se agrupa en bloques uiBoxWhite / _a6-p
  const recordBlocks = container.querySelectorAll(
    '._a6-p, .uiBoxWhite, [role="main"] > div',
  );
  const names = new Set<string>();

  if (recordBlocks.length > 0) {
    for (const block of recordBlocks) {
      const anchor = block.querySelector('a[href*="instagram.com"]');
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
          username = normalize(heading.textContent);
        }
      }
      if (username) {
        names.add(username);
      }
    }
  } else {
    // Si la estructura no tiene bloques contenedores específicos, extraer enlaces directos
    const anchors = container.querySelectorAll('a[href*="instagram.com"]');
    for (const anchor of anchors) {
      const href = anchor.getAttribute('href');
      const username = href
        ? extractUsernameFromUrl(href)
        : normalize(anchor.textContent);
      if (username) {
        names.add(username);
      }
    }
  }

  return [...names].sort();
}
