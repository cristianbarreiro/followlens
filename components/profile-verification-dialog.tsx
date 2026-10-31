'use client';

import { useState, useMemo } from 'react';
import {
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  UserX,
  Lock,
  UserRoundCheck,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import type {
  ProfileVerificationRecord,
  VerificationSummary,
  ProfileVerificationStatus,
} from '@/lib/profile-availability/types';
import { ProfileVerificationEngine } from '@/lib/profile-availability/engine';

interface ProfileVerificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  records: ProfileVerificationRecord[];
  summary: VerificationSummary;
  busy: boolean;
  onToggleExclusion: (username: string) => Promise<void> | void;
  onReverify: () => Promise<void> | void;
  lastCheckDate?: string;
}

const count = (n: number) => n.toLocaleString('es-UY');

const STATUS_LABELS: Record<
  ProfileVerificationStatus,
  { label: string; badgeClass: string; icon: typeof CheckCircle2 }
> = {
  available: {
    label: 'Disponible confirmado',
    badgeClass: 'badge-available',
    icon: CheckCircle2,
  },
  deleted_confirmed: {
    label: 'Eliminado confirmado',
    badgeClass: 'badge-deleted',
    icon: UserX,
  },
  deactivated_confirmed: {
    label: 'Desactivado confirmado',
    badgeClass: 'badge-deactivated',
    icon: UserX,
  },
  suspended_confirmed: {
    label: 'Suspendido confirmado',
    badgeClass: 'badge-suspended',
    icon: AlertCircle,
  },
  private: {
    label: 'Privado confirmado',
    badgeClass: 'badge-private',
    icon: Lock,
  },
  renamed: {
    label: 'Renombrado confirmado',
    badgeClass: 'badge-renamed',
    icon: UserRoundCheck,
  },
  unavailable_unconfirmed: {
    label: 'Sin confirmar (conservado)',
    badgeClass: 'badge-unconfirmed',
    icon: HelpCircle,
  },
  unknown: {
    label: 'Desconocido (conservado)',
    badgeClass: 'badge-unknown',
    icon: HelpCircle,
  },
  verification_error: {
    label: 'Error de verificación',
    badgeClass: 'badge-error',
    icon: AlertCircle,
  },
};

export function ProfileVerificationDialog({
  open,
  onOpenChange,
  records,
  summary,
  busy,
  onToggleExclusion,
  onReverify,
  lastCheckDate,
}: ProfileVerificationDialogProps) {
  const [filterTab, setFilterTab] = useState<
    'all' | 'excluded' | 'deleted' | 'unconfirmed'
  >('excluded');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      // Search match
      if (
        searchQuery.trim() &&
        !record.username.toLowerCase().includes(searchQuery.trim().toLowerCase())
      ) {
        return false;
      }

      // Tab match
      if (filterTab === 'excluded') {
        return ProfileVerificationEngine.isRecordExcluded(record);
      }
      if (filterTab === 'deleted') {
        return record.status === 'deleted_confirmed';
      }
      if (filterTab === 'unconfirmed') {
        return (
          record.status === 'unavailable_unconfirmed' ||
          record.status === 'unknown'
        );
      }
      return true;
    });
  }, [records, filterTab, searchQuery]);

  const excludedCount = useMemo(() => {
    return records.filter((r) => ProfileVerificationEngine.isRecordExcluded(r))
      .length;
  }, [records]);

  const confirmationPercent =
    summary.totalIdentified > 0
      ? (
          ((summary.deletedConfirmedCount +
            summary.availableCount +
            summary.privateCount) /
            summary.totalIdentified) *
          100
        ).toFixed(1)
      : '0.0';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="modal" showCloseButton={false}>
        <div className="modal-header">
          <div>
            <DialogTitle className="modal-title">
              Verificación de disponibilidad de perfiles
            </DialogTitle>
            <DialogDescription className="modal-description">
              Auditoría exhaustiva sobre el 100 % de los seguidores y seguidos
              identificados en tus exportaciones oficiales.
            </DialogDescription>
          </div>
        </div>

        <div className="verification-info-banner">
          <p>
            <strong>Reglas de privacidad y límites técnicos oficiales:</strong>{' '}
            Meta no ofrece una API autorizada para consultar cuentas personales
            arbitrarias. FollowLens audita todas las cuentas de tus archivos y
            excluye de las métricas únicamente aquellas con eliminación
            confirmada (como marcadores <code>__deleted__...</code>). Las cuentas
            privadas, no confirmadas o con errores temporales se conservan en las
            estadísticas para no distorsionar tus relaciones.
          </p>
        </div>

        {/* Structured summary statistics grid */}
        <div
          className="verification-stats-summary"
          aria-label="Resumen de verificación"
        >
          <div className="stat-summary-row">
            <span className="stat-label">Total perfiles identificados</span>
            <strong className="stat-value">{count(summary.totalIdentified)}</strong>
          </div>
          <div className="stat-summary-row">
            <span className="stat-label">Auditados por el motor (cobertura)</span>
            <strong className="stat-value text-primary">
              {count(summary.auditedCount)} (100 %)
            </strong>
          </div>
          <div className="stat-summary-row">
            <span className="stat-label">Disponibles confirmados</span>
            <strong className="stat-value">{count(summary.availableCount)}</strong>
          </div>
          <div className="stat-summary-row">
            <span className="stat-label">Eliminados confirmados</span>
            <strong className="stat-value text-destructive">
              {count(summary.deletedConfirmedCount)}
            </strong>
          </div>
          <div className="stat-summary-row">
            <span className="stat-label">Desactivados confirmados</span>
            <strong className="stat-value">
              {count(summary.deactivatedConfirmedCount)}
            </strong>
          </div>
          <div className="stat-summary-row">
            <span className="stat-label">Privados confirmados</span>
            <strong className="stat-value">{count(summary.privateCount)}</strong>
          </div>
          <div className="stat-summary-row">
            <span className="stat-label">Sin confirmar (conservados)</span>
            <strong className="stat-value text-muted-foreground">
              {count(summary.unconfirmedCount)}
            </strong>
          </div>
          <div className="stat-summary-row">
            <span className="stat-label">Errores de consulta</span>
            <strong className="stat-value">{count(summary.errorCount)}</strong>
          </div>
        </div>

        {/* Progress representation */}
        <div className="verification-progress-section">
          <div className="progress-labels">
            <span>Confirmación objetiva con certeza</span>
            <strong>{confirmationPercent} %</strong>
          </div>
          <div
            className="progress-track"
            aria-label="Confirmación objetiva con certeza"
          >
            <div
              className="progress-fill"
              style={{ width: `${Math.min(100, Math.max(2, parseFloat(confirmationPercent)))}%` }}
            />
          </div>
          <small className="subtle">
            {lastCheckDate
              ? `Última verificación: ${lastCheckDate}`
              : 'Verificación realizada en la importación'}
          </small>
        </div>

        {/* Filter controls and search */}
        <div className="verification-controls">
          <div className="filter-pill-group" role="tablist">
            <button
              className={`filter-pill ${filterTab === 'excluded' ? 'active' : ''}`}
              onClick={() => setFilterTab('excluded')}
            >
              Excluidos ({excludedCount})
            </button>
            <button
              className={`filter-pill ${filterTab === 'deleted' ? 'active' : ''}`}
              onClick={() => setFilterTab('deleted')}
            >
              Eliminados ({summary.deletedConfirmedCount})
            </button>
            <button
              className={`filter-pill ${filterTab === 'unconfirmed' ? 'active' : ''}`}
              onClick={() => setFilterTab('unconfirmed')}
            >
              Sin confirmar ({summary.unconfirmedCount})
            </button>
            <button
              className={`filter-pill ${filterTab === 'all' ? 'active' : ''}`}
              onClick={() => setFilterTab('all')}
            >
              Todos ({records.length})
            </button>
          </div>

          <div className="search-box">
            <Search size={14} className="search-icon" aria-hidden="true" />
            <input
              type="text"
              placeholder="Buscar @usuario..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Buscar usuario en la lista de verificación"
            />
          </div>
        </div>

        {/* List of profiles */}
        <div className="availability-list" aria-label="Lista de perfiles verificados">
          {filteredRecords.length > 0 ? (
            filteredRecords.map((record) => {
              const isExcluded = ProfileVerificationEngine.isRecordExcluded(record);
              const statusMeta =
                STATUS_LABELS[record.status] ?? STATUS_LABELS.unknown;
              const StatusIcon = statusMeta.icon;

              return (
                <div className="availability-row" key={record.username}>
                  <div className="profile-info-cell">
                    <div className="profile-name-row">
                      <strong>@{record.username}</strong>
                      <span className={`status-badge ${statusMeta.badgeClass}`}>
                        <StatusIcon size={12} aria-hidden="true" />
                        {statusMeta.label}
                      </span>
                    </div>
                    <small className="subtle">
                      {record.reason} · {record.providerId}
                    </small>
                  </div>
                  <button
                    className="btn btn-sm"
                    aria-label={
                      isExcluded
                        ? `Conservar @${record.username} en el análisis`
                        : `Excluir @${record.username} del análisis`
                    }
                    disabled={busy}
                    onClick={() => onToggleExclusion(record.username)}
                  >
                    {isExcluded ? 'Conservar en análisis' : 'Aplicar exclusión'}
                  </button>
                </div>
              );
            })
          ) : (
            <p className="subtle empty-list-notice">
              No se encontraron perfiles en esta vista.
            </p>
          )}
        </div>

        <div className="modal-actions">
          <button
            className="btn"
            disabled={busy}
            onClick={() => void onReverify()}
          >
            <RefreshCw
              size={15}
              className={busy ? 'animate-spin' : ''}
              aria-hidden="true"
            />
            {busy ? 'Verificando perfiles...' : 'Volver a auditar perfiles'}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => onOpenChange(false)}
          >
            Cerrar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
