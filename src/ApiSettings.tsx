import { useState, type FormEvent } from "react";
import {
  configureApi,
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
  const [baseUrl, setBaseUrl] = useState(settings.route?.baseUrl || "");
  const [model, setModel] = useState(settings.route?.model || "");
  const [apiKey, setApiKey] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function finish(skip: boolean) {
    setBusy(true);
    setError("");
    try {
      let next: Settings;
      if (skip) {
        next = { completed: true, cloudConsent: false };
        saveSettings(next);
      } else next = await configureApi(baseUrl, model, apiKey, consent);
      setApiKey("");
      if (settings.route)
        await credentialStore
          .remove(settings.route.credentialRef)
          .catch(() => {});
      done(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Settings failed / 設定失敗");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="api-settings" aria-label="API setup">
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
          When you send a message, its text and model ID go to the provider at
          the URL above. The API key authenticates the request. Provider fees
          and privacy policies apply. Saving sends no network request. /
          傳送訊息時，文字、模型 ID
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
        <button disabled={busy} type="button" onClick={() => void finish(true)}>
          Skip for now / 暫時略過
        </button>
      </form>
      <p>
        Keys stay in the OS keychain. Re-enter a key to replace settings. Skip
        disables API and removes the saved key where available. /
        金鑰存於系統金鑰庫；修改時請重新輸入。略過會停用 API
        並嘗試刪除已存金鑰。
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
