import { invoke } from "@tauri-apps/api/core";
import type { ModelRoute } from "./ai-router";
export type ApiRoute = Extract<ModelRoute, { kind: "openai-compatible" }>;
export interface Settings {
  completed: boolean;
  route?: ApiRoute;
  cloudConsent: boolean;
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
): Promise<Settings> {
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
  const next: Settings = {
    completed: true,
    cloudConsent: true,
    route: { kind: "openai-compatible", ...config, credentialRef },
  };
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
