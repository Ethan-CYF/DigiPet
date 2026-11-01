import { invoke } from "@tauri-apps/api/core";
export type ModelRoute =
  | { kind: "local"; modelId: string }
  | { kind: "openai-compatible"; baseUrl: string; model: string; credentialRef: string };
export interface AiRouter { reply(text: string, route: ModelRoute, signal?: AbortSignal): Promise<string> }
export function stubReply(text: string): string { return `(M0 stub) 收到：${text}`; }
export async function apiReply(text: string, route: ModelRoute, consent: boolean, signal?: AbortSignal): Promise<string> {
  if (!consent || route.kind !== "openai-compatible") throw new Error("Cloud consent required");
  if (signal?.aborted) throw new DOMException("Stopped", "AbortError");
  const requestId = crypto.randomUUID();
  const stop = () => { void invoke("stop_api_reply", { requestId }).catch(() => {}); };
  signal?.addEventListener("abort", stop, { once: true });
  try {
    const result = await invoke<string>("api_reply", { requestId, route, text, consent });
    if (signal?.aborted) throw new DOMException("Stopped", "AbortError");
    return result;
  } catch {
    if (signal?.aborted) throw new DOMException("Stopped", "AbortError");
    throw new Error("API request failed. Check settings, keychain and provider. / API 請求失敗，請檢查設定、金鑰庫及供應商。");
  } finally { signal?.removeEventListener("abort", stop); }
}
