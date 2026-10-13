import {
  extractInstagramUsernameFromUrl,
  normalize,
} from './relationships.ts';

export {
  extractInstagramUsernameFromUrl as extractUsernameFromUrl,
} from './relationships.ts';

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
  const specificRecords = container.querySelectorAll('._a6-p');
  const recordBlocks =
    specificRecords.length > 0
      ? specificRecords
      : container.querySelectorAll('.uiBoxWhite').length > 0
        ? container.querySelectorAll('.uiBoxWhite')
        : container.querySelectorAll('[role="main"] > div');

  // Buscar todos los enlaces en el contenedor
  const allAnchors = container.querySelectorAll('a');

  let validProfileFound = false;
  for (const a of allAnchors) {
    const href = a.getAttribute('href');
    if (href && extractInstagramUsernameFromUrl(href)) {
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
      let foundProfile = false;
      for (const anchor of block.querySelectorAll('a[href]')) {
        const href = anchor.getAttribute('href');
        const username = href
          ? extractInstagramUsernameFromUrl(href)
          : null;
        if (username) {
          names.add(username);
          foundProfile = true;
        }
      }
      if (!foundProfile && kind === 'following') {
        const heading =
          block.querySelector('h2') ??
          block.closest('.uiBoxWhite')?.querySelector('h2');
        if (heading) {
          const headingUser = normalize(heading.textContent);
          if (
            headingUser &&
            extractInstagramUsernameFromUrl(`/${headingUser}`)
          ) {
            names.add(headingUser);
          }
        }
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
        ? extractInstagramUsernameFromUrl(href)
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
