'use client';

import { ShieldCheck, RefreshCw, UserRoundX, XCircle } from 'lucide-react';
import type { VerificationSummary, VerificationProgress } from '@/lib/profile-availability/types';
import { providerRegistry } from '@/lib/profile-availability/registry';

interface ProfileVerificationCardProps {
  summary: VerificationSummary | null;
  busy: boolean;
  progress: VerificationProgress | null;
  disabled: boolean;
  onOpenDetails: () => void;
  onReverify: () => Promise<void> | void;
  onCancel?: () => void;
}

const count = (n: number) => n.toLocaleString('es-UY');

export function ProfileVerificationCard({
  summary,
  busy,
  progress,
  disabled,
  onOpenDetails,
  onReverify,
  onCancel,
}: ProfileVerificationCardProps) {
  if (!summary) {
    return (
      <section
        className="availability-control"
        aria-label="Verificación de disponibilidad de perfiles"
      >
        <div className="check-row">
          <ShieldCheck size={18} aria-hidden="true" />
          <span>
            Verificación de perfiles de Instagram
            <small>
              Solo las señales y marcadores confirmados se excluyen de las
              métricas relacionales.
            </small>
          </span>
        </div>
      </section>
    );
  }

  const {
    totalIdentified,
    auditedCount,
    deletedConfirmedCount,
    unconfirmedCount,
    excludedCount,
    activeProviderId,
  } = summary;

  const activeProvider = providerRegistry.get(
    activeProviderId ?? 'export-evidence',
  ) ?? providerRegistry.getDefault();

  const effectiveExcluded = excludedCount ?? deletedConfirmedCount;

  return (
    <section
      className="availability-control verification-card-container"
      aria-label="Verificación de disponibilidad de perfiles"
    >
      <div className="check-row">
        <ShieldCheck size={18} className="text-primary" aria-hidden="true" />
        <div>
          <span className="font-medium">
            Verificación de perfiles · {activeProvider.name}
          </span>
          <small className="block text-muted-foreground mt-0.5">
            {count(totalIdentified)} perfiles procesados ({totalIdentified > 0
              ? `${Math.round((auditedCount / totalIdentified) * 100)} % cobertura local`
              : '0 %'}) · {count(effectiveExcluded)} excluidos de métricas ({count(deletedConfirmedCount)} confirmados con marcador) ·{' '}
            {count(unconfirmedCount)} sin confirmar conservados
          </small>

          {busy && progress && (
            <div className="card-progress-indicator mt-2">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>
                  Auditando {progress.currentUsername ? `@${progress.currentUsername}` : 'perfiles'}...
                </span>
                <span>
                  {progress.completed} / {progress.total} ({progress.percent} %)
                </span>
              </div>
              <div
                className="progress-track-small"
                aria-label="Progreso de auditoría"
              >
                <div
                  className="progress-fill"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card-actions flex items-center gap-2">
        {busy && onCancel ? (
          <button
            className="btn btn-outline"
            onClick={onCancel}
            title="Cancelar verificación en curso"
          >
            <XCircle size={15} /> Cancelar
          </button>
        ) : (
          <button
            className="btn"
            disabled={disabled || busy}
            onClick={() => void onReverify()}
            title="Audita de nuevo todos los perfiles de esta importación"
          >
            <RefreshCw
              size={15}
              className={busy ? 'animate-spin' : ''}
              aria-hidden="true"
            />
            {busy ? 'Auditando...' : 'Volver a auditar'}
          </button>
        )}

        <button
          className="btn"
          disabled={disabled || busy || totalIdentified === 0}
          onClick={onOpenDetails}
        >
          <UserRoundX size={15} /> Revisar perfiles
        </button>
      </div>
    </section>
  );
}
