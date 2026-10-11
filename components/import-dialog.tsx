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
import { normalize, type Snapshot } from '@/lib/relationships';

export function ImportDialog({
  open,
  onOpenChange,
  onImport,
  account,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImport: (s: Snapshot, persist: boolean) => Promise<void>;
  account: string;
}) {
  const [files, setFiles] = useState<File[]>([]),
    [handle, setHandle] = useState(account),
    [date, setDate] = useState(''),
    [persist, setPersist] = useState(false),
    [complete, setComplete] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const choose = (items: File[]) => {
    setFiles(items);
    setError('');
  };
  async function submit(e: React.FormEvent) {
    e.preventDefault();
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
    setBusy(true);
    try {
      const result = await importFiles(files);
      await onImport(
        {
          id: crypto.randomUUID(),
          account: normalized,
          date,
          importedAt: new Date().toISOString(),
          followers: result.followers,
          following: result.following,
        },
        persist,
      );
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo importar. Intentá otra vez.',
      );
    } finally {
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
                : 'Arrastrá tu ZIP, tus JSON o tus HTML'}
            </strong>
            <p>
              {files.length
                ? files.map((f) => f.name).join(', ')
                : 'Exportación ZIP completa (JSON o HTML de seguidores y seguidos) · Archivos individuales hasta 30 MB'}
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
