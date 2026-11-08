import { useState, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  configureApi,
  providerRoutes,
  loadSettings,
  credentialStore,
  saveSettings,
  type Settings,
} from "./modules/model-wizard";
export default function ApiSettings({
  settings,
  done,
}: {
  settings: Settings;
  done: (next: Settings) => void;
}) {
  const [draft, setDraft] = useState(settings);
  const [adding, setAdding] = useState(false);
  const [baseUrl, setBaseUrl] = useState(settings.route?.baseUrl || "");
  const [model, setModel] = useState(settings.route?.model || "");
  const [apiKey, setApiKey] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function saveRouter() {
    setBusy(true);
    setError("");
    try {
      const prompt = draft.systemPrompt ?? "";
      const systemPrompt =
        !prompt || prompt === (settings.systemPrompt ?? "")
          ? prompt
          : await invoke<string>("redact_chat_text", {
              text: draft.systemPrompt ?? "",
              credentialRefs: providerRoutes(draft).map(
                (p) => p.route.credentialRef,
              ),
            });
      saveSettings({ ...draft, routes: providerRoutes(draft), systemPrompt });
      done(loadSettings());
    } catch {
      setError(
        "Settings could not be saved. Check keychain. / 無法儲存設定，請檢查金鑰庫。",
      );
    } finally {
      setBusy(false);
    }
  }
  async function finish(skip: boolean) {
    setBusy(true);
    setError("");
    try {
      let next: Settings;
      if (skip) {
        next = { completed: true, cloudConsent: false };
        saveSettings(next);
      } else {
        next = await configureApi(
          baseUrl,
          model,
          apiKey,
          consent,
          adding ? draft : undefined,
        );
      }
      setApiKey("");
      if (skip)
        for (const p of providerRoutes(settings))
          await credentialStore.remove(p.route.credentialRef).catch(() => {});
      done(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Settings failed / 設定失敗");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="api-settings" aria-label="API setup">
      {providerRoutes(draft).length > 0 && !adding && (
        <section aria-label="Provider router">
          <h2>Providers / 供應商</h2>
          <p>
            Only opted-in providers receive recent messages and persona.
            Fallback is off by default. /
            僅同意的供應商會收到近期訊息及角色提示；預設不自動切換。
          </p>
          {providerRoutes(draft).map((p) => (
            <div key={p.route.credentialRef}>
              <label>
                <input
                  type="radio"
                  name="active"
                  aria-label={`Active ${p.route.baseUrl} ${p.route.model}`}
                  checked={
                    (draft.activeRouteId ?? draft.route?.credentialRef) ===
                    p.route.credentialRef
                  }
                  onChange={() =>
                    setDraft({ ...draft, activeRouteId: p.route.credentialRef })
                  }
                />
                {p.route.baseUrl} · {p.route.model}
              </label>
              <label>
                <input
                  type="checkbox"
                  aria-label={`Consent ${p.route.baseUrl} ${p.route.model}`}
                  checked={p.consent}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      routes: providerRoutes(draft).map((q) =>
                        q.route.credentialRef === p.route.credentialRef
                          ? { ...q, consent: e.target.checked }
                          : q,
                      ),
                    })
                  }
                />
                Allow cloud requests / 同意雲端傳送
              </label>
              <button
                disabled={busy}
                onClick={() => {
                  void (async () => {
                    setBusy(true);
                    try {
                      saveSettings({
                        ...draft,
                        routes: providerRoutes(draft).filter(
                          (q) =>
                            q.route.credentialRef !== p.route.credentialRef,
                        ),
                      });
                      setDraft(loadSettings());
                      done(loadSettings());
                      await credentialStore
                        .remove(p.route.credentialRef)
                        .catch(() =>
                          setError(
                            "Unlock keychain to remove old credential / 請解鎖金鑰庫以刪除舊憑證",
                          ),
                        );
                    } catch {
                      setError("Settings could not be saved / 無法儲存設定");
                    } finally {
                      setBusy(false);
                    }
                  })();
                }}
              >
                Remove provider / 移除供應商
              </button>
            </div>
          ))}
          <label>
            <input
              type="checkbox"
              aria-label="Enable fallback"
              checked={draft.fallbackEnabled ?? false}
              onChange={(e) =>
                setDraft({ ...draft, fallbackEnabled: e.target.checked })
              }
            />
            Enable fallback to other consented providers /
            允許切換至其他已同意的供應商
          </label>
          <label>
            Context: last N messages / 近期訊息數
            <input
              type="number"
              aria-label="Context window"
              min="1"
              max="100"
              value={draft.contextWindow ?? 20}
              onChange={(e) =>
                setDraft({ ...draft, contextWindow: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Timeout (ms) / 逾時
            <input
              type="number"
              aria-label="Provider timeout"
              min="1000"
              max="120000"
              value={draft.timeoutMs ?? 60000}
              onChange={(e) =>
                setDraft({ ...draft, timeoutMs: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Retries / 重試
            <select
              aria-label="Provider retries"
              value={draft.retries ?? 0}
              onChange={(e) =>
                setDraft({ ...draft, retries: Number(e.target.value) })
              }
            >
              {[0, 1, 2].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <label>
            Persona / 角色提示
            <textarea
              aria-label="System prompt"
              maxLength={4000}
              value={draft.systemPrompt ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, systemPrompt: e.target.value })
              }
            />
          </label>
          <button disabled={busy} onClick={() => void saveRouter()}>
            Save router / 儲存路由
          </button>
          <button
            disabled={providerRoutes(draft).length >= 8}
            onClick={() => {
              setAdding(true);
              setBaseUrl("");
              setModel("");
              setConsent(false);
            }}
          >
            Add provider / 新增供應商
          </button>
        </section>
      )}
      {(providerRoutes(draft).length === 0 || adding) && (
        <>
          <h2>API setup / API 設定精靈</h2>
          <p>
            API-only · OpenAI-compatible (e.g. DeepSeek). No model downloads. /
            僅支援 API，不下載模型。
          </p>
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void finish(false);
            }}
          >
            <label>
              Base URL
              <input
                aria-label="API base URL"
                type="url"
                placeholder="https://api.deepseek.com/v1"
                value={baseUrl}
                maxLength={2048}
                onChange={(e) => {
                  setBaseUrl(e.target.value);
                  setConsent(false);
                }}
                required
              />
            </label>
            <label>
              Model / 模型
              <input
                aria-label="API model"
                placeholder="deepseek-chat"
                value={model}
                maxLength={200}
                onChange={(e) => setModel(e.target.value)}
                required
              />
            </label>
            <label>
              API key
              <input
                aria-label="API key"
                type="password"
                autoComplete="off"
                value={apiKey}
                maxLength={4096}
                onChange={(e) => setApiKey(e.target.value)}
                required
              />
            </label>
            <p>
              When you send a message, its text and model ID go to the provider
              at the URL above. The API key authenticates the request. Provider
              fees and privacy policies apply. Saving sends no network request.
              / 傳送訊息時，近期對話、可選角色提示、模型 ID
              及驗證金鑰會傳至上述供應商，可能收費並適用其隱私政策。儲存設定不會連線。
            </p>
            <label>
              <input
                aria-label="Cloud consent"
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />{" "}
              I agree to cloud requests to this endpoint /
              我同意向此端點傳送雲端請求
            </label>
            <button disabled={busy || !consent} type="submit">
              Save / 儲存
            </button>
            <button
              disabled={busy}
              type="button"
              onClick={() => {
                if (adding) {
                  setAdding(false);
                  setApiKey("");
                  setConsent(false);
                } else void finish(true);
              }}
            >
              {adding ? "Cancel / 取消" : "Skip for now / 暫時略過"}
            </button>
          </form>
          <p>
            Keys stay in the OS keychain. Re-enter a key to replace settings.
            Skip disables API and removes the saved key where available. /
            金鑰存於系統金鑰庫；修改時請重新輸入。略過會停用 API
            並嘗試刪除已存金鑰。
          </p>
        </>
      )}
      {providerRoutes(draft).length > 0 && !adding && (
        <button onClick={() => void finish(true)}>
          Disable API / 停用 API
        </button>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
