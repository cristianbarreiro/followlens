import type { Snapshot } from '../relationships.ts';
import type {
  EngineVerificationReport,
  ProfileVerificationProvider,
  ProfileVerificationRecord,
  VerificationOptions,
  VerificationProgress,
  VerificationSummary,
} from './types.ts';
import { providerRegistry } from './registry.ts';
import { getStaleOrPendingProfiles } from './scheduler.ts';

export interface RunEngineOptions extends VerificationOptions {
  providerId?: string;
  provider?: ProfileVerificationProvider;
}

export class ProfileVerificationEngine {
  private activeController: AbortController | null = null;

  /**
   * Evaluates if a profile record should be excluded from relationship statistics.
   * Conservative rule:
   * Only 'deleted_confirmed' and 'deactivated_confirmed' are excluded (unless user explicitly toggled isExcluded === false).
   * All other statuses ('available', 'private', 'unavailable_unconfirmed', 'unknown', 'verification_error') are preserved.
   */
  static isRecordExcluded(record: ProfileVerificationRecord): boolean {
    if (record.isExcluded === false) {
      return false; // User explicitly preserved this account
    }
    return (
      record.status === 'deleted_confirmed' ||
      record.status === 'deactivated_confirmed'
    );
  }

  /**
   * Filters a snapshot's followers and following lists in an immutable way,
   * removing only confirmed deleted or deactivated profiles.
   */
  static filterSnapshot(
    snapshot: Snapshot,
    records: Map<string, ProfileVerificationRecord>,
  ): Snapshot {
    const excludedUsernames = new Set<string>();
    for (const [username, record] of records.entries()) {
      if (ProfileVerificationEngine.isRecordExcluded(record)) {
        excludedUsernames.add(username);
      }
    }

    if (excludedUsernames.size === 0) {
      return snapshot;
    }

    return {
      ...snapshot,
      followers: snapshot.followers.filter((name) => !excludedUsernames.has(name)),
      following: snapshot.following.filter((name) => !excludedUsernames.has(name)),
    };
  }

  /**
   * Calculates a structured statistical summary from a map or list of records.
   */
  static calculateSummary(
    allUsernames: string[],
    recordsMap: Map<string, ProfileVerificationRecord>,
    activeProviderId?: string,
  ): VerificationSummary {
    const totalIdentified = allUsernames.length;
    let availableCount = 0;
    let deletedConfirmedCount = 0;
    let deactivatedConfirmedCount = 0;
    let suspendedConfirmedCount = 0;
    let privateCount = 0;
    let renamedCount = 0;
    let unconfirmedCount = 0;
    let errorCount = 0;
    let pendingCount = 0;
    let verifiedCount = 0;
    let auditedCount = 0;
    let latestTimestamp: string | undefined;

    for (const username of allUsernames) {
      const record = recordsMap.get(username);
      if (!record) {
        pendingCount++;
        continue;
      }

      auditedCount++;
      if (
        !latestTimestamp ||
        new Date(record.verifiedAt).getTime() >
          new Date(latestTimestamp).getTime()
      ) {
        latestTimestamp = record.verifiedAt;
      }

      switch (record.status) {
        case 'available':
          availableCount++;
          verifiedCount++;
          break;
        case 'deleted_confirmed':
          deletedConfirmedCount++;
          verifiedCount++;
          break;
        case 'deactivated_confirmed':
          deactivatedConfirmedCount++;
          verifiedCount++;
          break;
        case 'suspended_confirmed':
          suspendedConfirmedCount++;
          verifiedCount++;
          break;
        case 'private':
          privateCount++;
          verifiedCount++;
          break;
        case 'renamed':
          renamedCount++;
          verifiedCount++;
          break;
        case 'unavailable_unconfirmed':
        case 'unknown':
          unconfirmedCount++;
          break;
        case 'verification_error':
          errorCount++;
          break;
      }
    }

    return {
      totalIdentified,
      auditedCount,
      verifiedCount,
      availableCount,
      deletedConfirmedCount,
      deactivatedConfirmedCount,
      suspendedConfirmedCount,
      privateCount,
      renamedCount,
      unconfirmedCount,
      errorCount,
      pendingCount,
      lastRunAt: latestTimestamp,
      activeProviderId,
    };
  }

  /**
   * Cancels the currently running verification process, if any.
   */
  cancel() {
    if (this.activeController) {
      this.activeController.abort();
      this.activeController = null;
    }
  }

  /**
   * Executes the verification process across all given usernames.
   */
  async verifyAll(
    allUsernames: string[],
    options: RunEngineOptions = {},
  ): Promise<EngineVerificationReport> {
    const startedAt = performance.now();
    const uniqueUsernames = Array.from(new Set(allUsernames));
    const existingRecords =
      options.existingRecords ?? new Map<string, ProfileVerificationRecord>();

    // Select provider
    const provider =
      options.provider ??
      (options.providerId
        ? providerRegistry.get(options.providerId)
        : providerRegistry.getDefault());

    if (!provider) {
      throw new Error(
        `Proveedor de verificación no encontrado: ${options.providerId ?? 'default'}`,
      );
    }

    // Determine profiles needing check
    const pendingUsernames = getStaleOrPendingProfiles(
      uniqueUsernames,
      existingRecords,
      { forceRecheck: options.forceRecheck },
    );

    // Setup abort controller
    this.activeController = new AbortController();
    const internalSignal = this.activeController.signal;

    if (options.signal) {
      options.signal.addEventListener('abort', () => this.cancel(), {
        once: true,
      });
    }

    const resultMap = new Map<string, ProfileVerificationRecord>(existingRecords);
    let interrupted = false;

    if (pendingUsernames.length > 0) {
      try {
        const batchResult = await provider.verify(pendingUsernames, {
          ...options,
          signal: internalSignal,
          onProgress: (progress: VerificationProgress) => {
            if (options.onProgress) {
              // Adjust progress to reflect global total
              const total = uniqueUsernames.length;
              const completedBefore =
                uniqueUsernames.length - pendingUsernames.length;
              const globalCompleted = completedBefore + progress.completed;
              options.onProgress({
                ...progress,
                total,
                completed: globalCompleted,
                percent: Math.round((globalCompleted / total) * 100),
              });
            }
          },
        });

        for (const record of batchResult.records) {
          // Preserve explicit user exclusion overrides if present in existing records
          const previous = existingRecords.get(record.username);
          if (previous && previous.isExcluded !== undefined) {
            record.isExcluded = previous.isExcluded;
          }
          resultMap.set(record.username, record);
        }
      } catch (err) {
        if (internalSignal.aborted) {
          interrupted = true;
        } else {
          throw err;
        }
      }
    }

    if (internalSignal.aborted) {
      interrupted = true;
    }

    this.activeController = null;

    const summary = ProfileVerificationEngine.calculateSummary(
      uniqueUsernames,
      resultMap,
      provider.id,
    );

    return {
      summary,
      records: Array.from(resultMap.values()),
      durationMs: performance.now() - startedAt,
      interrupted,
    };
  }
}
