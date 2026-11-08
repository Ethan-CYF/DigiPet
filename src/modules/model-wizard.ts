import { invoke } from "@tauri-apps/api/core";
import { rememberSecret, redact } from "./redaction";
import type { ProviderRoute, ModelRoute } from "./ai-router";
export type ApiRoute = Extract<ModelRoute, { kind: "openai-compatible" }>;
export interface Settings {
  completed: boolean;
  route?: ApiRoute;
  cloudConsent: boolean;
  routes?: ProviderRoute[];
  activeRouteId?: string;
  fallbackEnabled?: boolean;
  contextWindow?: number;
  systemPrompt?: string;
  timeoutMs?: number;
  retries?: number;
}
export const SETTINGS_KEY = "digipet.api.v1";
export const emptySettings = (): Settings => ({
  completed: false,
  cloudConsent: false,
});
const fail = () => {
  throw new Error("Check HTTPS base URL and model / 請檢查 HTTPS 網址及模型");
};
export function validateConfig(baseUrl: string, model: string) {
  let url: URL;
  try {
    url = new URL(baseUrl.trim());
  } catch {
    return fail();
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    baseUrl.length > 2048 ||
    !model.trim() ||
    model.length > 200 ||
    /[\x00-\x1f\x7f]/.test(model)
  )
    return fail();
  return { baseUrl: url.toString().replace(/\/+$/, ""), model: model.trim() };
}
export function safeSettings(value: Settings): Settings {
  if (value.routes) {
    if (!Array.isArray(value.routes) || value.routes.length > 8) return fail();
    const routes = value.routes.map((p) => {
      const safe = safeSettings({
        completed: true,
        route: p.route,
        cloudConsent: p.consent,
      });
      if (!safe.route) return fail();
      return { route: safe.route, consent: safe.cloudConsent };
    });
    if (
      new Set(routes.map((p) => p.route.credentialRef)).size !== routes.length
    )
      return fail();
    const active =
      routes.find((p) => p.route.credentialRef === value.activeRouteId) ??
      routes[0];
    const integer = (
      n: number | undefined,
      d: number,
      min: number,
      max: number,
    ) => (Number.isInteger(n) ? Math.max(min, Math.min(max, n!)) : d);
    return {
      completed: value.completed === true,
      route: active?.route,
      cloudConsent: active?.consent ?? false,
      routes,
      activeRouteId: active?.route.credentialRef,
      fallbackEnabled: value.fallbackEnabled === true,
      contextWindow: integer(value.contextWindow, 20, 1, 100),
      systemPrompt: redact(
        typeof value.systemPrompt === "string"
          ? value.systemPrompt.slice(0, 4000)
          : "",
      ),
      timeoutMs: integer(value.timeoutMs, 60000, 1000, 120000),
      retries: integer(value.retries, 0, 0, 2),
    };
  }
  if (!value.route)
    return { completed: value.completed === true, cloudConsent: false };
  const route = value.route;
  if (
    route.kind !== "openai-compatible" ||
    !/^[a-f0-9-]{36}$/.test(route.credentialRef)
  )
    return fail();
  return {
    completed: value.completed === true,
    cloudConsent: value.cloudConsent === true,
    route: {
      kind: "openai-compatible",
      ...validateConfig(route.baseUrl, route.model),
      credentialRef: route.credentialRef,
    },
  };
}
export function loadSettings(): Settings {
  try {
    return safeSettings(
      JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null"),
    );
  } catch {
    return emptySettings();
  }
}
export function saveSettings(settings: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(safeSettings(settings)));
}
export const credentialStore = {
  save: (baseUrl: string, model: string, apiKey: string) =>
    invoke<string>("save_api_credential", { baseUrl, model, apiKey }),
  remove: (credentialRef: string) =>
    invoke<void>("remove_api_credential", { credentialRef }),
};
export async function configureApi(
  baseUrl: string,
  model: string,
  apiKey: string,
  consent: boolean,
  existing?: Settings,
): Promise<Settings> {
  if (existing && providerRoutes(existing).length >= 8)
    throw new Error("Maximum 8 providers / 最多 8 個供應商");
  const config = validateConfig(baseUrl, model);
  if (!consent) throw new Error("Cloud consent required / 需要同意雲端傳送");
  if (!apiKey.trim() || apiKey.length > 4096 || /[\x00-\x20\x7f]/.test(apiKey))
    throw new Error("Invalid API key / API key 格式錯誤");
  let credentialRef: string;
  try {
    credentialRef = await credentialStore.save(
      config.baseUrl,
      config.model,
      apiKey,
    );
  } catch {
    throw new Error(
      "Secure keychain unavailable. Unlock it or skip for now. / 請解鎖系統金鑰庫，或暫時略過。",
    );
  }
  rememberSecret(apiKey);
  const configured: Settings = {
    completed: true,
    cloudConsent: true,
    route: { kind: "openai-compatible", ...config, credentialRef },
  };
  const next = existing
    ? safeSettings({
        ...existing,
        completed: true,
        routes: [
          ...providerRoutes(existing),
          { route: configured.route!, consent: true },
        ],
      })
    : configured;
  try {
    saveSettings(next);
  } catch {
    await credentialStore.remove(credentialRef).catch(() => {});
    throw new Error("Settings could not be saved / 無法儲存設定");
  }
  return next;
}
/** API-only compatibility stubs; never inspect hardware or download models. */
export const inspectHardware = async () => ({
  memoryBytes: 0,
  accelerators: [],
  explanation: "API-only build",
});
export const downloadModel = async (
  _modelId: string,
  _signal?: AbortSignal,
): Promise<void> => {
  throw new Error("API-only build: model downloads are unavailable");
};

export function providerRoutes(settings: Settings): ProviderRoute[] {
  return (
    settings.routes ??
    (settings.route
      ? [{ route: settings.route, consent: settings.cloudConsent }]
      : [])
  );
}
