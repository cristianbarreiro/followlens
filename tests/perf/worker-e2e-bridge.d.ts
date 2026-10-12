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
      analysisMs: number | null;
      recordAnalysisDuration: (durationMs: number) => void;
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
