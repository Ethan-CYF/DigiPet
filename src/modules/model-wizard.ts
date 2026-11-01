import type { ModelRoute } from "./ai-router";
/** Historical unwired contract, not an M1 feature. Later API setup supersedes downloads (ADR 0003). */
export interface ModelWizard {
  inspectHardware(): Promise<{ memoryBytes: number; accelerators: string[] }>;
  chooseModel(): Promise<ModelRoute>;
  downloadModel(modelId: string, signal?: AbortSignal): Promise<void>;
}
