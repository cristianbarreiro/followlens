import type {
  ProfileVerificationProvider,
  ProfileVerificationRecord,
  VerificationBatchResult,
  VerificationOptions,
  ProfileVerificationStatus,
} from '../types.ts';

export const OFFICIAL_API_PROVIDER_ID = 'official-api';

export interface MetaGraphApiConfig {
  /** User-provided Meta Graph API User or Page Access Token */
  accessToken?: string;
  /** Instagram Business or Creator Account ID from which to execute Business Discovery queries */
  instagramBusinessAccountId?: string;
  /** Request timeout in milliseconds (default 5000ms) */
  timeoutMs?: number;
}

interface MetaGraphApiResponse {
  business_discovery?: {
    id: string;
    username?: string;
    name?: string;
    website?: string;
  };
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
  };
}

/**
 * Meta Graph API Provider (Business Discovery)
 *
 * Technical Limits and Privacy Guardrails:
 * 1. Meta Graph API only supports discovery of public Instagram Business/Creator accounts.
 * 2. Personal accounts return an error (#100) and cannot be checked via any official Meta API.
 * 3. Private accounts cannot be queried.
 * 4. Meta rate limits apply (standard 200 queries per hour).
 * 5. Invariant: Calls are made directly from the user's browser to Meta's graph.facebook.com.
 *    No relationship data is ever transmitted to FollowLens or third-party servers.
 */
export class OfficialApiProvider implements ProfileVerificationProvider {
  readonly id = OFFICIAL_API_PROVIDER_ID;
  readonly name = 'API Oficial de Instagram (Meta Graph API)';
  readonly description =
    'Consulta la API oficial de Meta (Business Discovery). Limitada por especificación de Meta exclusivamente a perfiles públicos profesionales o de creadores.';
  readonly sourceOfEvidence =
    'Respuestas HTTP JSON oficiales desde graph.facebook.com mediante la llamada business_discovery.';
  readonly limitations =
    'Meta restringe esta API a cuentas profesionales y de creadores públicas. No permite consultar cuentas personales ni privadas (error #100). No considera fallos de red o de consulta como eliminaciones.';

  private config: MetaGraphApiConfig;

  constructor(config: MetaGraphApiConfig = {}) {
    this.config = config;
  }

  setConfig(config: MetaGraphApiConfig) {
    this.config = { ...this.config, ...config };
  }

  isAvailable(): boolean {
    return Boolean(
      this.config.accessToken?.trim() &&
        this.config.instagramBusinessAccountId?.trim(),
    );
  }

  canVerify(username: string): boolean {
    // Cannot query synthetic deleted markers or empty strings
    return (
      typeof username === 'string' &&
      username.trim().length > 0 &&
      !username.startsWith('__deleted__')
    );
  }

  async verify(
    usernames: string[],
    options?: VerificationOptions,
  ): Promise<VerificationBatchResult> {
    const records: ProfileVerificationRecord[] = [];
    const errors: Array<{ username: string; error: string }> = [];
    const nowIso = new Date().toISOString();
    const total = usernames.length;

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

    if (!this.isAvailable()) {
      // API credentials are not configured. Explain honestly and without simulated results.
      const unconfiguredReason =
        'Meta Graph API no está configurada. Requiere un Access Token de Meta y un ID de cuenta profesional. Recuerde que Meta no permite consultar perfiles personales.';
      for (const username of usernames) {
        records.push({
          username,
          status: 'verification_error',
          verifiedAt: nowIso,
          providerId: this.id,
          reason: unconfiguredReason,
          confidence: 'none',
          evidence: 'MISSING_API_CREDENTIALS',
          isExcluded: false,
        });
        statusCounts.verification_error++;
      }
      return { records };
    }

    const { accessToken, instagramBusinessAccountId, timeoutMs = 5000 } =
      this.config;

    for (let i = 0; i < total; i++) {
      if (options?.signal?.aborted) {
        break;
      }

      const username = usernames[i];

      if (!this.canVerify(username)) {
        records.push({
          username,
          status: 'unknown',
          verifiedAt: nowIso,
          providerId: this.id,
          reason: 'Nombre de usuario incompatible con consultas de la API oficial',
          confidence: 'none',
          isExcluded: false,
        });
        statusCounts.unknown++;
        continue;
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        // Chain with user's abort signal if present
        const onUserAbort = () => controller.abort();
        if (options?.signal) {
          options.signal.addEventListener('abort', onUserAbort, { once: true });
        }

        const endpoint = `https://graph.facebook.com/v21.0/${encodeURIComponent(
          instagramBusinessAccountId!,
        )}?fields=business_discovery.username(${encodeURIComponent(
          username,
        )}){id,username,name,website}&access_token=${encodeURIComponent(
          accessToken!,
        )}`;

        const response = await fetch(endpoint, {
          method: 'GET',
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        if (options?.signal) {
          options.signal.removeEventListener('abort', onUserAbort);
        }

        const data = (await response.json()) as MetaGraphApiResponse;

        if (response.ok && data?.business_discovery?.id) {
          records.push({
            username,
            status: 'available',
            verifiedAt: nowIso,
            providerId: this.id,
            reason:
              'Perfil profesional identificado y accesible mediante Meta Business Discovery API',
            confidence: 'high',
            evidence: `Meta ID: ${data.business_discovery.id}`,
            metadata: {
              id: data.business_discovery.id,
              name: data.business_discovery.name,
            },
            isExcluded: false,
          });
          statusCounts.available++;
        } else {
          // Meta error response. Parse error code and subcode
          const errMessage =
            data?.error?.message ?? `HTTP ${response.status} ${response.statusText}`;
          const errCode = data?.error?.code;

          // Note: In Meta Graph API, querying a personal profile or private profile returns error code 100
          // "The user is not a business account" or unsupported operation.
          // This does NOT mean the user is deleted!
          records.push({
            username,
            status: 'unavailable_unconfirmed',
            verifiedAt: nowIso,
            providerId: this.id,
            reason: `No se pudo verificar como cuenta profesional en Meta API: ${errMessage}. Los perfiles personales no pueden consultarse en esta API.`,
            confidence: 'low',
            evidence: `API_ERROR_${errCode ?? response.status}`,
            isExcluded: false,
          });
          statusCounts.unavailable_unconfirmed++;
        }
      } catch (err: unknown) {
        const errorMsg =
          err instanceof Error
            ? err.name === 'AbortError'
              ? 'Tiempo de espera agotado o solicitud cancelada'
              : err.message
            : 'Error desconocido de conexión';

        records.push({
          username,
          status: 'verification_error',
          verifiedAt: nowIso,
          providerId: this.id,
          reason: `Error de red al consultar Meta Graph API: ${errorMsg}`,
          confidence: 'none',
          evidence: errorMsg,
          isExcluded: false,
        });
        statusCounts.verification_error++;
        errors.push({ username, error: errorMsg });
      }

      if (options?.onProgress) {
        options.onProgress({
          total,
          completed: i + 1,
          currentUsername: username,
          percent: Math.round(((i + 1) / total) * 100),
          statusCounts: { ...statusCounts },
        });
      }

      // Small delay between live API calls to respect Meta rate limits
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    return { records, errors: errors.length ? errors : undefined };
  }
}
