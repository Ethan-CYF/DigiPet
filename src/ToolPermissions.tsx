import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { TOOL_NAMES, type Grants, type ToolName } from "./modules/tools";
export default function ToolPermissions() {
  const [grants, setGrants] = useState<Grants>({ tools: [], folders: {} });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (isTauri())
      void invoke<Grants>("tool_grants")
        .then(setGrants)
        .catch(() => setError("Permissions unavailable / 權限不可用"));
  }, []);
  async function change(tool: ToolName, enabled: boolean, pickFolder: boolean) {
    setBusy(true);
    setError("");
    try {
      await invoke("tool_grant", { tool, enabled, pickFolder });
      setGrants(await invoke("tool_grants"));
    } catch {
      setError(
        "Folder selection cancelled, denied, or storage unavailable / 已取消、路徑拒絕或儲存失敗",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details>
      <summary>Tool permissions / 工具權限</summary>
      <p>
        Denied by default. Selected file contents may be sent to your consented
        API provider. Every write requires a preview and confirmation. /
        預設拒絕，選取檔案內容可能傳送至已同意的 API；每次寫入需預覽確認。
      </p>
      {TOOL_NAMES.map((tool) => (
        <div key={tool}>
          <label>
            <input
              type="checkbox"
              checked={grants.tools.includes(tool)}
              disabled={busy || !isTauri()}
              onChange={(e) => void change(tool, e.target.checked, false)}
            />
            {tool}
          </label>
          <button
            disabled={busy || !isTauri()}
            onClick={() => void change(tool, true, true)}
          >
            Choose allowed folder / 選擇允許資料夾
          </button>
          {(grants.folders[tool] ?? []).map((folder) => (
            <p key={folder}>{folder}</p>
          ))}
          {grants.tools.includes(tool) && (
            <button
              disabled={busy}
              onClick={() => void change(tool, false, false)}
            >
              Revoke tool and folders / 撤銷工具與資料夾
            </button>
          )}
        </div>
      ))}
      <p>
        Audit: application local data/tools/audit-v1.log (fixed codes only). /
        稽核僅記錄固定代碼。
      </p>
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
