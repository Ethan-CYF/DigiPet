import { Channel, invoke } from "@tauri-apps/api/core";
import { redact } from "./redaction";
export type ModelRoute =
  | { kind: "local"; modelId: string }
  | {
      kind: "openai-compatible";
      baseUrl: string;
      model: string;
      credentialRef: string;
    };
export type ApiRoute = Extract<ModelRoute, { kind: "openai-compatible" }>;
export interface ProviderRoute {
  route: ApiRoute;
  consent: boolean;
}
export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}
export interface RouterPolicy {
  routes: ProviderRoute[];
  activeRouteId?: string;
  fallbackEnabled?: boolean;
  timeoutMs?: number;
  retries?: number;
}
export type Transport = (
  route: ApiRoute,
  messages: ChatMessage[],
  signal: AbortSignal,
  update: (text: string) => void,
  timeoutMs: number,
) => Promise<string>;
export interface AiRouter {
  reply(text: string, route: ModelRoute, signal?: AbortSignal): Promise<string>;
}
export function stubReply(text: string): string {
  return `(M0 stub) 收到：${redact(text)}`;
}
export class ChatError extends Error {
  constructor(public code: string) {
    super(friendlyError(code));
  }
}
export function friendlyError(code: string): string {
  if (/401|403/.test(code))
    return "Authentication failed. Check your API key. / 驗證失敗，請檢查金鑰。";
  if (/429/.test(code))
    return "Rate limit reached. Try again later. / 請求過於頻繁，請稍後重試。";
  if (/400|404|422/.test(code))
    return "Model or request unsupported. Check model settings. / 模型或請求不支援，請檢查設定。";
  if (/consent/i.test(code))
    return "Cloud consent required. Enable this provider in Settings. / 請在設定同意此供應商。";
  if (/timeout/i.test(code))
    return "Provider timed out. Try again. / 供應商逾時，請重試。";
  return "API request failed. Check settings, keychain and provider. / API 請求失敗，請檢查設定、金鑰庫及供應商。";
}
const aborted = () => new DOMException("Stopped", "AbortError");
export const nativeTransport: Transport = async (
  route,
  messages,
  signal,
  update,
  timeoutMs,
) => {
  if (signal.aborted) throw aborted();
  const requestId = crypto.randomUUID();
  const onUpdate = new Channel<{ text?: string; ready?: boolean }>();
  onUpdate.onmessage = (event) => {
    if (event.ready && signal.aborted) stop();
    if (!signal.aborted && typeof event.text === "string")
      update(redact(event.text));
  };
  // Wait for registration before acknowledging Stop, including the IPC start race.
  const stop = () => {
    void invoke("stop_api_reply", { requestId }).catch(() => {});
  };
  signal.addEventListener("abort", stop, { once: true });
  try {
    const result = await invoke<string>("api_reply", {
      requestId,
      route,
      text: messages.at(-1)?.content ?? "",
      messages,
      consent: true,
      timeoutMs,
      onUpdate,
    });
    if (signal.aborted) throw aborted();
    return redact(result);
  } catch (e) {
    if (signal.aborted) throw aborted();
    throw new ChatError(
      typeof e === "string" &&
        /^(API HTTP \d{3}|API timeout|API connection failed|API response failed|Cloud consent required)$/.test(
          e,
        )
        ? e
        : "API failed",
    );
  } finally {
    signal.removeEventListener("abort", stop);
  }
};
/** No fallback after visible output, cancellation, auth or model errors. */
export async function routedReply(
  messages: ChatMessage[],
  policy: RouterPolicy,
  signal: AbortSignal,
  update: (text: string) => void,
  transport: Transport = nativeTransport,
): Promise<string> {
  if (signal.aborted) throw aborted();
  const index = policy.routes.findIndex(
    (p) => p.route.credentialRef === policy.activeRouteId,
  );
  const active = policy.routes[index < 0 ? 0 : index];
  if (!active?.consent) throw new ChatError("Cloud consent required");
  const candidates = policy.fallbackEnabled
    ? [active, ...policy.routes.filter((p) => p !== active)]
    : [active];
  let last: unknown = new ChatError("API failed");
  for (const provider of candidates) {
    if (!provider.consent) continue;
    for (
      let attempt = 0;
      attempt <= Math.min(2, Math.max(0, policy.retries ?? 0));
      attempt++
    ) {
      if (signal.aborted) throw aborted();
      // Re-check the current consent immediately before every attempt.
      if (!provider.consent) throw new ChatError("Cloud consent required");
      let output = false;
      try {
        return await transport(
          provider.route,
          messages.map((m) => ({ role: m.role, content: redact(m.content) })),
          signal,
          (value) => {
            output ||= value.length > 0;
            update(value);
          },
          Math.min(120000, Math.max(1000, policy.timeoutMs ?? 60000)),
        );
      } catch (e) {
        if (
          signal.aborted ||
          (e instanceof DOMException && e.name === "AbortError")
        )
          throw aborted();
        last = e instanceof ChatError ? e : new ChatError("API failed");
        if (
          output ||
          !(
            last instanceof ChatError &&
            /^(API (timeout|connection failed|response failed)|API HTTP (408|429|5\d\d))$/.test(
              last.code,
            )
          )
        )
          throw last;
      }
    }
  }
  throw last;
}
export async function apiReply(
  text: string,
  route: ModelRoute,
  consent: boolean,
  signal = new AbortController().signal,
): Promise<string> {
  if (route.kind !== "openai-compatible")
    throw new ChatError("Cloud consent required");
  return routedReply(
    [{ role: "user", content: text }],
    { routes: [{ route, consent }] },
    signal,
    () => {},
  );
}
