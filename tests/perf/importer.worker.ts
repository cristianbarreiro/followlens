import { importFiles } from '../../lib/importer.ts';
import { analyze, type Snapshot } from '../../lib/relationships.ts';

type ImportRequest = {
  operationId: string;
  file: File;
  snapshot?: Pick<Snapshot, 'id' | 'account' | 'date' | 'importedAt'>;
};

type ImportResponse =
  | {
      operationId: string;
      ok: true;
      result: Awaited<ReturnType<typeof importFiles>>;
      analysis?: ReturnType<typeof analyze>;
      importMs: number;
      analysisMs?: number;
      workerHeapBeforeBytes: number | null;
      workerHeapAfterBytes: number | null;
    }
  | {
      operationId: string;
      ok: false;
      error: string;
    };

const workerScope = self as unknown as {
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<ImportRequest>) => void,
  ): void;
  postMessage(message: ImportResponse | { type: 'ready' }): void;
};

workerScope.addEventListener(
  'message',
  async (event: MessageEvent<ImportRequest>) => {
    const { operationId, file, snapshot } = event.data;
    if (!operationId || !(file instanceof File)) return;

    const workerHeap = () =>
      (
        performance as Performance & {
          memory?: { usedJSHeapSize: number };
        }
      ).memory?.usedJSHeapSize ?? null;
    const workerHeapBeforeBytes = workerHeap();
    const startedAt = performance.now();

    try {
      const result = await importFiles([file]);
      let analysis: ReturnType<typeof analyze> | undefined;
      let analysisMs: number | undefined;
      if (snapshot) {
        const analysisStartedAt = performance.now();
        analysis = analyze({ ...snapshot, ...result });
        analysisMs = performance.now() - analysisStartedAt;
      }
      const response: ImportResponse = {
        operationId,
        ok: true,
        result,
        ...(analysis ? { analysis } : {}),
        importMs: performance.now() - startedAt,
        ...(analysisMs !== undefined ? { analysisMs } : {}),
        workerHeapBeforeBytes,
        workerHeapAfterBytes: workerHeap(),
      };
      workerScope.postMessage(response);
    } catch (error) {
      const response: ImportResponse = {
        operationId,
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'No se pudo importar. Intentá otra vez.',
      };
      workerScope.postMessage(response);
    }
  },
);

workerScope.postMessage({ type: 'ready' });
