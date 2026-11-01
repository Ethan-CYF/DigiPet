import type { ModelRoute } from "./ai-router";
/** Future discovery, hardware checks and explicit download consent. No implementation. */
export interface ModelWizard {
  inspectHardware(): Promise<{ memoryBytes: number; accelerators: string[] }>;
  chooseModel(): Promise<ModelRoute>;
  downloadModel(modelId: string, signal?: AbortSignal): Promise<void>;
}
