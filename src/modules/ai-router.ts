/** Historical unwired contract. M1 makes no requests; later routing is API-only (ADR 0003). */
export type ModelRoute =
  | { kind: "local"; modelId: string }
  | {
      kind: "openai-compatible";
      baseUrl: string;
      model: string;
      credentialRef: string;
    };
export interface AiRouter {
  reply(text: string, route: ModelRoute, signal?: AbortSignal): Promise<string>;
}
export function stubReply(text: string): string {
  return `(M0 stub) 收到：${text}`;
}
