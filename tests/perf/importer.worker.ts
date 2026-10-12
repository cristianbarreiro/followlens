import { importFiles } from '../../lib/importer.ts';

type ImportRequest = {
  operationId: string;
  file: File;
};

type ImportResponse =
  | {
      operationId: string;
      ok: true;
      result: Awaited<ReturnType<typeof importFiles>>;
      importMs: number;
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
    const { operationId, file } = event.data;
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
      const response: ImportResponse = {
        operationId,
        ok: true,
        result,
        importMs: performance.now() - startedAt,
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
