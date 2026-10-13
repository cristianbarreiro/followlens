import { strFromU8 } from 'fflate';
import {
  fileInfo,
  fileKind,
  parseRelationships,
  selectZipRelationshipPaths,
  type FileFormat,
} from './relationships.ts';
import { parseHtmlRelationships } from './html-parser.ts';
import {
  readZipSelective,
  MAX_JSON_TOTAL,
  type ImportDiagnostics,
} from './zip.ts';

export async function importFiles(
  files: File[],
  diagnostics?: ImportDiagnostics,
): Promise<{ followers: string[]; following: string[]; fileCount: number }> {
  const importStartedAt = diagnostics ? performance.now() : 0;
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
      diagnostics,
      selectZipRelationshipPaths,
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
      const decodeStart = diagnostics ? performance.now() : 0;
      const html = strFromU8(bytes);
      if (diagnostics)
        diagnostics({
          stage: 'utf8-decode',
          durationMs: performance.now() - decodeStart,
          counters: { inputBytes: bytes.byteLength },
        });
      const parseStart = diagnostics ? performance.now() : 0;
      const parsedNames = parseHtmlRelationships(html, kind);
      if (diagnostics)
        diagnostics({
          stage: 'html-parse-and-normalize',
          durationMs: performance.now() - parseStart,
          counters: { parsedNames: parsedNames.length },
        });
      for (const name of parsedNames)
        names[kind].add(name);
    } else {
      let data: unknown;
      let jsonText: string;
      const decodeStart = diagnostics ? performance.now() : 0;
      try {
        jsonText = strFromU8(bytes).replace(/^\uFEFF/, '');
      } catch {
        throw new Error(`El archivo ${base} no contiene JSON válido.`);
      }
      if (diagnostics)
        diagnostics({
          stage: 'utf8-decode',
          durationMs: performance.now() - decodeStart,
          counters: { inputBytes: bytes.byteLength },
        });
      const jsonParseStart = diagnostics ? performance.now() : 0;
      try {
        data = JSON.parse(jsonText);
      } catch {
        throw new Error(`El archivo ${base} no contiene JSON válido.`);
      }
      if (diagnostics)
        diagnostics({
          stage: 'json-parse',
          durationMs: performance.now() - jsonParseStart,
          counters: { inputBytes: bytes.byteLength },
        });
      const relationshipStart = diagnostics ? performance.now() : 0;
      const parsedNames = parseRelationships(data, kind);
      if (diagnostics)
        diagnostics({
          stage: 'relationship-parse-normalize-deduplicate-sort',
          durationMs: performance.now() - relationshipStart,
          counters: { parsedNames: parsedNames.length },
        });
      for (const name of parsedNames) names[kind].add(name);
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
  const finalizeStart = diagnostics ? performance.now() : 0;
  const result = {
    followers: [...names.followers].sort(),
    following: [...names.following].sort(),
    fileCount: Object.keys(entries).length,
  };
  if (diagnostics) {
    diagnostics({
      stage: 'import-result-finalization',
      durationMs: performance.now() - finalizeStart,
      counters: {
        followers: result.followers.length,
        following: result.following.length,
        fileCount: result.fileCount,
      },
    });
    diagnostics({
      stage: 'import-total',
      durationMs: performance.now() - importStartedAt,
      counters: {
        followers: result.followers.length,
        following: result.following.length,
        fileCount: result.fileCount,
      },
    });
  }
  return result;
}
