/// <reference types="vite/client" />

import type { ImportPipeline } from '../../components/import-dialog.tsx';
import type { Group, Snapshot } from '../../lib/relationships.ts';

declare global {
  interface Window {
    __followLensWorkerE2E?: {
      mode: 'main-thread' | 'worker-warm' | 'worker-cold';
      processFiles: ImportPipeline;
      operationStartedAt: number | null;
      dashboardPresentedAt: number | null;
      dashboardFrameAt: number | null;
      dashboardSecondFrameAt: number | null;
      analysisMs: number | null;
      recordAnalysisDuration: (durationMs: number) => void;
      profileEnabled: boolean;
      reactProfiles: Array<{
        id: string;
        phase: 'mount' | 'update' | 'nested-update';
        actualDuration: number;
        baseDuration: number;
        startTime: number;
        commitTime: number;
      }>;
      importResultReceivedAt: number | null;
      stateUpdateStartedAt: number | null;
      stateUpdateEnqueuedAt: number | null;
      derivedListSamples: Array<{
        at: number;
        durationMs: number;
        group: Group;
        count: number;
      }>;
      interactionStartedAt: number | null;
      interactionTargetGroup: Group | null;
      interactionReactCommittedAt: number | null;
      interactionSecondFrameAt: number | null;
      memoryBeforeBytes: number | null;
      pipelineMetrics: {
        mode: 'main-thread' | 'worker-warm' | 'worker-cold';
        importMs: number;
        analysisMs: number | null;
        workerReadyMs: number | null;
        roundTripMs: number | null;
        postMessageCallMs: number | null;
      } | null;
      warmWorkerReadyMs: number | null;
      terminatedWorkers: number;
      closeWorkers: () => void;
      resetDashboard: (() => void) | null;
      interactionProbeAt: number | null;
      frameTimes: number[];
      lastDashboard: {
        snapshot: Snapshot;
        data: Record<Group, string[]>;
      } | null;
      referenceDashboard: {
        snapshot: Snapshot;
        data: Record<Group, string[]>;
      } | null;
    };
  }
}

export {};
