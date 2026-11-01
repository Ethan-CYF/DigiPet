/** M1 contract only. No network requests, credentials, or model loading in M0. */
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
