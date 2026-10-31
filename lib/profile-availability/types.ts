/**
 * FollowLens — Profile Verification Types
 *
 * Defines domain states, record models, provider contracts, and progress telemetry
 * for the Profile Verification Engine.
 */

export type ProfileVerificationStatus =
  | 'available'
  | 'deleted_confirmed'
  | 'deactivated_confirmed'
  | 'suspended_confirmed'
  | 'private'
  | 'renamed'
  | 'unavailable_unconfirmed'
  | 'unknown'
  | 'verification_error';

export type VerificationConfidence = 'high' | 'medium' | 'low' | 'none';

export interface ProfileVerificationRecord {
  /** Normalized Instagram username (e.g. "john_doe" or "__deleted__123") */
  username: string;
  /** Verification classification status */
  status: ProfileVerificationStatus;
  /** ISO 8601 timestamp when this verification was performed */
  verifiedAt: string;
  /** Unique identifier of the provider that performed the verification */
  providerId: string;
  /** Human-readable explanation of why this status was assigned */
  reason: string;
  /** Confidence level of the verification */
  confidence: VerificationConfidence;
  /** Technical evidence or raw signal (e.g. export marker, API response code) */
  evidence?: string;
  /** Optional metadata associated with the verification (e.g. original marker, new username) */
  metadata?: Record<string, unknown>;
  /** Recommended timestamp for the next review */
  nextCheckAfter?: string;
  /** User-driven explicit toggle to keep/exclude from metrics (defaults to true for deleted_confirmed) */
  isExcluded?: boolean;
}

export interface VerificationOptions {
  /** Abort signal to cancel ongoing batch execution */
  signal?: AbortSignal;
  /** Number of usernames processed per batch/tick */
  batchSize?: number;
  /** Account being analyzed, for scoping */
  account?: string;
  /** Existing records in cache or storage to avoid redundant checks */
  existingRecords?: Map<string, ProfileVerificationRecord>;
  /** Force re-verification even if a cached record exists and is fresh */
  forceRecheck?: boolean;
  /** Callback for real-time progress telemetry */
  onProgress?: (progress: VerificationProgress) => void;
}

export interface VerificationBatchResult {
  records: ProfileVerificationRecord[];
  errors?: Array<{ username: string; error: string }>;
}

export interface VerificationProgress {
  total: number;
  completed: number;
  currentUsername?: string;
  percent: number;
  statusCounts: Record<ProfileVerificationStatus, number>;
}

export interface ProfileVerificationProvider {
  /** Unique identifier of the provider (e.g. 'export-evidence', 'official-api') */
  readonly id: string;
  /** Human-readable name of the provider */
  readonly name: string;
  /** Description of what this provider checks and its limitations */
  readonly description: string;
  /** Whether the provider has required credentials or environment to run */
  isAvailable(): boolean;
  /** Whether the provider can inspect the given username */
  canVerify(username: string): boolean;
  /** Executes verification on a list of usernames */
  verify(
    usernames: string[],
    options?: VerificationOptions,
  ): Promise<VerificationBatchResult>;
}

export interface VerificationSummary {
  /** Total unique profiles identified across followers and following */
  totalIdentified: number;
  /** Profiles audited by the engine (coverage) */
  auditedCount: number;
  /** Profiles with high or medium confidence confirmed status */
  verifiedCount: number;
  /** Confirmed available profiles */
  availableCount: number;
  /** Confirmed deleted profiles */
  deletedConfirmedCount: number;
  /** Confirmed deactivated profiles */
  deactivatedConfirmedCount: number;
  /** Confirmed suspended profiles */
  suspendedConfirmedCount: number;
  /** Confirmed private profiles */
  privateCount: number;
  /** Confirmed renamed profiles */
  renamedCount: number;
  /** Unconfirmed profiles (standard accounts without external confirmation) */
  unconfirmedCount: number;
  /** Errors encountered during verification */
  errorCount: number;
  /** Profiles pending initial or scheduled verification */
  pendingCount: number;
  /** Timestamp of the last verification run */
  lastRunAt?: string;
  /** Active provider identifier used */
  activeProviderId?: string;
}

export interface EngineVerificationReport {
  summary: VerificationSummary;
  records: ProfileVerificationRecord[];
  durationMs: number;
  interrupted: boolean;
}

