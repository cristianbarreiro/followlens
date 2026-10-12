'use client';
import { useRef, useState } from 'react';
import {
  Upload,
  FileArchive,
  ShieldCheck,
  LoaderCircle,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { importFiles } from '@/lib/importer';
import { normalize, type Group, type Snapshot } from '@/lib/relationships';

export type ImportPipelineResult = {
  imported: Awaited<ReturnType<typeof importFiles>>;
  analysis?: Record<Group, string[]>;
  metrics: {
    mode: 'main-thread' | 'worker-warm' | 'worker-cold';
    importMs: number;
    analysisMs: number | null;
    workerReadyMs: number | null;
    roundTripMs: number | null;
    postMessageCallMs: number | null;
  };
};

export type ImportPipeline = (
  files: File[],
  snapshot: Pick<Snapshot, 'id' | 'account' | 'date' | 'importedAt'>,
) => Promise<ImportPipelineResult>;

type ProcessedImport = Pick<ImportPipelineResult, 'imported' | 'analysis'> & {
  metrics?: ImportPipelineResult['metrics'];
};

export function ImportDialog({
  open,
  onOpenChange,
  onImport,
  account,
  processFiles,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImport: (
    s: Snapshot,
    persist: boolean,
    analysis?: Record<Group, string[]>,
  ) => Promise<void>;
  account: string;
  processFiles?: ImportPipeline;
}) {
  const [files, setFiles] = useState<File[]>([]),
    [handle, setHandle] = useState(account),
    [date, setDate] = useState(''),
    [persist, setPersist] = useState(false),
    [complete, setComplete] = useState(false),
    [busy, setBusy] = useState(false),
    [processing, setProcessing] = useState(''),
    [error, setError] = useState(''),
    [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  const choose = (items: File[]) => {
    setFiles(items);
    setError('');
    setProcessing('');
  };
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting.current) return;
    setError('');
    const normalized = normalize(handle);
    if (!normalized) {
      setError('Escribí el usuario de Instagram al que pertenecen los datos.');
      return;
    }
    if (
      !date ||
      date > new Date().toLocaleDateString('en-CA') ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date)
    ) {
      setError('Elegí la fecha de la exportación, hasta hoy.');
      return;
    }
    if (!complete) {
      setError('Confirmá que incluís todos los seguidores y seguidos.');
      return;
    }
    submitting.current = true;
    setBusy(true);
    setProcessing('Leyendo y validando los archivos en este dispositivo…');
    try {
      const snapshot = {
        id: crypto.randomUUID(),
        account: normalized,
        date,
        importedAt: new Date().toISOString(),
      };
      const benchmark =
        import.meta.env.DEV && typeof window !== 'undefined'
          ? window.__followLensWorkerE2E
          : undefined;
      if (benchmark) {
        benchmark.operationStartedAt = performance.now();
        benchmark.dashboardPresentedAt = null;
        benchmark.analysisMs = null;
        benchmark.lastDashboard = null;
      }
      let processed: ProcessedImport;
      if (import.meta.env.DEV && processFiles) {
        processed = await processFiles(files, snapshot);
      } else {
        const imported = await importFiles(files);
        processed = { imported };
      }
      if (
        import.meta.env.DEV &&
        typeof window !== 'undefined' &&
        window.__followLensWorkerE2E?.profileEnabled
      )
        window.__followLensWorkerE2E.importResultReceivedAt = performance.now();
      if (benchmark) {
        if (!processed.metrics)
          throw new Error('Benchmark processing metrics are unavailable.');
        benchmark.pipelineMetrics = processed.metrics;
        benchmark.analysisMs = processed.metrics.analysisMs;
      }
      setProcessing(
        persist
          ? 'Guardando la importación y actualizando resultados…'
          : 'Actualizando resultados…',
      );
      await onImport(
        {
          ...snapshot,
          followers: processed.imported.followers,
          following: processed.imported.following,
        },
        persist,
        processed.analysis,
      );
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo importar. Intentá otra vez.',
      );
      setProcessing('');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!busy) onOpenChange(v);
      }}
    >
      <DialogContent className="modal" showCloseButton={false}>
        <DialogClose
          className="modal-close"
          aria-label="Cerrar"
          disabled={busy}
        >
          <X size={20} />
        </DialogClose>
        <DialogTitle className="modal-title">Una nueva perspectiva</DialogTitle>
        <DialogDescription>
          Importá los datos de una cuenta y una fecha. Se procesan en este
          dispositivo.
        </DialogDescription>
        <form onSubmit={submit} className="import-form">
          <div
            className={`dropzone ${dragging ? 'dragging' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (!busy) choose([...e.dataTransfer.files]);
            }}
          >
            <FileArchive size={30} />
            <strong>
              {files.length
                ? `${files.length} archivo${files.length === 1 ? '' : 's'} seleccionado${files.length === 1 ? '' : 's'}`
                : 'Arrastrá un ZIP o archivos JSON/HTML'}
            </strong>
            <p>
              {files.length
                ? files.map((f) => f.name).join(', ')
                : 'ZIP o archivos individuales JSON/HTML del mismo formato, con seguidores y seguidos · Hasta 30 MB por archivo individual'}
            </p>
            <button
              type="button"
              className="btn"
              onClick={() => input.current?.click()}
              disabled={busy}
            >
              Elegir archivos
            </button>
            <input
              ref={input}
              type="file"
              accept=".zip,.json,.html"
              multiple
              className="sr-only"
              aria-label="Archivos de Instagram"
              onChange={(e) => choose([...(e.target.files ?? [])])}
              disabled={busy}
            />
          </div>
          <div className="form-grid">
            <label>
              Tu usuario
              <input
                placeholder="@tu.usuario"
                autoComplete="off"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                required
                disabled={busy}
              />
            </label>
            <label>
              Fecha de la exportación
              <input
                type="date"
                value={date}
                max={new Date().toLocaleDateString('en-CA')}
                onChange={(e) => setDate(e.target.value)}
                required
                disabled={busy}
              />
            </label>
          </div>
          <label className="check-row">
            <Checkbox
              checked={complete}
              onCheckedChange={(v) => setComplete(v === true)}
              disabled={busy}
            />
            <span>
              Incluí todos los seguidores y seguidos de esta cuenta, con el
              período <strong>Todo el tiempo</strong>.
            </span>
          </label>
          <label className="check-row">
            <Checkbox
              checked={persist}
              onCheckedChange={(v) => setPersist(v === true)}
              disabled={busy}
            />
            <span>
              Guardar en este navegador para futuras comparaciones.
              <small>
                Si no lo marcás, se conserva solo durante esta sesión.
              </small>
            </span>
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {processing && (
            <output className="processing-note" aria-live="polite">
              {processing}
            </output>
          )}
          <button className="btn primary full" disabled={busy || !files.length}>
            {busy ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <Upload size={18} />
            )}{' '}
            {busy ? 'Analizando en tu dispositivo…' : 'Analizar importación'}
          </button>
          <small className="secure-note">
            <ShieldCheck size={14} /> Los archivos no se envían a ningún
            servidor.
          </small>
        </form>
      </DialogContent>
    </Dialog>
  );
}
