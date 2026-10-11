import { strFromU8 } from 'fflate';
import {
  fileInfo,
  fileKind,
  parseRelationships,
  type FileFormat,
} from './relationships.ts';
import { parseHtmlRelationships } from './html-parser.ts';
import { readZipSelective, MAX_JSON_TOTAL } from './zip.ts';

export async function importFiles(
  files: File[],
): Promise<{ followers: string[]; following: string[]; fileCount: number }> {
  if (!files.length)
    throw new Error('Elegí el ZIP o los archivos JSON / HTML.');
  const zipped = files.filter((f) => f.name.toLowerCase().endsWith('.zip'));
  if (zipped.length && files.length > 1)
    throw new Error(
      'Importá un ZIP por vez. Para comparar fechas, hacé dos importaciones separadas.',
    );
  const entries: Record<string, Uint8Array> = {};
  if (zipped.length) {
    const extracted = await readZipSelective(
      zipped[0],
      (path) => fileKind(path) !== null,
    );
    Object.assign(entries, extracted);
  } else {
    let total = 0;
    for (const file of files) {
      if (!fileKind(file.name)) continue;
      total += file.size;
      if (total > MAX_JSON_TOTAL)
        throw new Error('Los archivos superan el límite de 30 MB.');
      if (entries[file.name])
        throw new Error('Hay archivos repetidos. Elegí una única exportación.');
      entries[file.name] = new Uint8Array(await file.arrayBuffer());
    }
  }

  // Comprobar consistencia de formato (no mezclar JSON y HTML)
  const formats = new Set<FileFormat>();
  for (const path of Object.keys(entries)) {
    const info = fileInfo(path);
    if (info) formats.add(info.format);
  }
  if (formats.size > 1) {
    throw new Error(
      'No mezcles archivos JSON y HTML. Elegí una exportación en un único formato.',
    );
  }
  const activeFormat = formats.values().next().value as FileFormat | undefined;

  const found = { followers: false, following: false };
  const names = { followers: new Set<string>(), following: new Set<string>() };
  const basenames = new Set<string>();
  const parts: number[] = [];
  for (const [path, bytes] of Object.entries(entries)) {
    const info = fileInfo(path);
    if (!info) continue;
    const { kind, format } = info;
    const base = path.replaceAll('\\', '/').split('/').pop()!.toLowerCase();
    if (basenames.has(base))
      throw new Error(
        'Hay varias carpetas de seguidores. Importá los datos de una sola cuenta.',
      );
    basenames.add(base);
    if (kind === 'followers') {
      const match = /^followers_(\d+)\.(json|html)$/.exec(base);
      if (match) parts.push(Number(match[1]));
    }
    if (format === 'html') {
      const html = strFromU8(bytes);
      for (const name of parseHtmlRelationships(html, kind))
        names[kind].add(name);
    } else {
      let data: unknown;
      try {
        data = JSON.parse(strFromU8(bytes).replace(/^\uFEFF/, ''));
      } catch {
        throw new Error(`El archivo ${base} no contiene JSON válido.`);
      }
      for (const name of parseRelationships(data, kind)) names[kind].add(name);
    }
    found[kind] = true;
  }
  if (!found.followers || !found.following) {
    if (activeFormat === 'html') {
      throw new Error(
        'Necesitamos followers_1.html (y todas sus partes) y following.html de la misma exportación. Seleccionalos juntos o elegí el ZIP completo.',
      );
    }
    throw new Error(
      'Necesitamos followers_1.json (y todas sus partes) y following.json de la misma exportación. Seleccionalos juntos o elegí el ZIP completo.',
    );
  }
  parts.sort((a, b) => a - b);
  if (parts.some((n, i) => n !== i + 1))
    throw new Error(
      'Falta una parte de followers. Seleccioná todos los archivos de seguidores.',
    );
  return {
    followers: [...names.followers].sort(),
    following: [...names.following].sort(),
    fileCount: Object.keys(entries).length,
  };
}
