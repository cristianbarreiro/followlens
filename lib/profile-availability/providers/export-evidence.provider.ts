import { normalizeDeletedAccountMarker } from '../../relationships.ts';
import type {
  ProfileVerificationProvider,
  ProfileVerificationRecord,
  VerificationBatchResult,
  VerificationOptions,
  VerificationProgress,
  ProfileVerificationStatus,
} from '../types.ts';

export const EXPORT_EVIDENCE_PROVIDER_ID = 'export-evidence';

export class ExportEvidenceProvider implements ProfileVerificationProvider {
  readonly id = EXPORT_EVIDENCE_PROVIDER_ID;
  readonly name = 'Evidencia oficial de exportación';
  readonly description =
    'Audita el 100 % de los perfiles analizando las marcas estructurales presentes en los archivos de exportación oficiales de Instagram.';

  isAvailable(): boolean {
    return true; // 100% client-side, always available offline without network
  }

  canVerify(username: string): boolean {
    return typeof username === 'string' && username.trim().length > 0;
  }

  async verify(
    usernames: string[],
    options?: VerificationOptions,
  ): Promise<VerificationBatchResult> {
    const records: ProfileVerificationRecord[] = [];
    const batchSize = Math.max(1, options?.batchSize ?? 100);
    const nowIso = new Date().toISOString();
    const nextCheckIso = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const statusCounts: Record<ProfileVerificationStatus, number> = {
      available: 0,
      deleted_confirmed: 0,
      deactivated_confirmed: 0,
      suspended_confirmed: 0,
      private: 0,
      renamed: 0,
      unavailable_unconfirmed: 0,
      unknown: 0,
      verification_error: 0,
    };

    const total = usernames.length;

    for (let i = 0; i < total; i++) {
      if (options?.signal?.aborted) {
        break;
      }

      const rawUsername = usernames[i];
      const deletedMarker = normalizeDeletedAccountMarker(rawUsername);

      let record: ProfileVerificationRecord;

      if (deletedMarker) {
        record = {
          username: deletedMarker,
          status: 'deleted_confirmed',
          verifiedAt: nowIso,
          providerId: this.id,
          reason: 'Marcador explícito de cuenta eliminada en el archivo de exportación',
          confidence: 'high',
          evidence: `Export marker: ${rawUsername}`,
          isExcluded: true,
        };
        statusCounts.deleted_confirmed++;
      } else {
        record = {
          username: rawUsername,
          status: 'unavailable_unconfirmed',
          verifiedAt: nowIso,
          providerId: this.id,
          reason:
            'Identificado en la exportación oficial sin marcadores de eliminación. Requiere verificación externa autorizada para confirmar disponibilidad en vivo.',
          confidence: 'low',
          evidence: 'Present in official export without deletion markers',
          nextCheckAfter: nextCheckIso,
          isExcluded: false,
        };
        statusCounts.unavailable_unconfirmed++;
      }

      records.push(record);

      // Periodically yield to event loop and report progress
      if ((i + 1) % batchSize === 0 || i === total - 1) {
        if (options?.onProgress) {
          const progress: VerificationProgress = {
            total,
            completed: i + 1,
            currentUsername: rawUsername,
            percent: Math.round(((i + 1) / total) * 100),
            statusCounts: { ...statusCounts },
          };
          options.onProgress(progress);
        }
        // Yield to browser event loop
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    return { records };
  }
}

