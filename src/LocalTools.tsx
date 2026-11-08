import { useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { backend, type Preview, type ToolArgs } from "./modules/tools";
/** Existing local features through the exact same backend grants and write previews. No provider involved. */
export default function LocalTools() {
  const [tool, setTool] = useState<"calendar" | "journal" | "file_search">(
    "calendar",
  );
  const [action, setAction] = useState("list");
  const [args, setArgs] = useState({ title: "", date: "", text: "", path: "" });
  const [result, setResult] = useState("");
  const [preview, setPreview] = useState<Preview>();
  const [busy, setBusy] = useState(false);
  async function run(approved?: boolean) {
    setBusy(true);
    try {
      const value =
        approved !== undefined && preview
          ? await backend.confirm(preview.token, approved)
          : await backend.run(
              tool,
              Object.fromEntries(
                Object.entries({ action, ...args }).filter(([, v]) => v),
              ) as unknown as ToolArgs,
            );
      setPreview(value.preview);
      setResult(
        JSON.stringify(value.untrusted_data ?? value.status ?? "", null, 2),
      );
    } catch {
      setResult(
        "Unavailable or denied. Check grants or repair local tools in Settings. / 不可用或權限拒絕，請檢查授權或在設定修復工具。",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details>
      <summary>Local tools (offline) / 本機工具（離線）</summary>
      <select
        aria-label="Local tool"
        disabled={busy || !!preview}
        value={tool}
        onChange={(e) => {
          const t = e.target.value as typeof tool;
          setTool(t);
          setAction(t === "file_search" ? "search" : "list");
        }}
      >
        <option value="calendar">Calendar / 行事曆</option>
        <option value="journal">Journal / 日記</option>
        <option value="file_search">File search / 檔案搜尋</option>
      </select>
      <select
        aria-label="Local action"
        disabled={busy || !!preview}
        value={action}
        onChange={(e) => setAction(e.target.value)}
      >
        {(tool === "file_search"
          ? ["search"]
          : ["list", "create", ...(tool === "journal" ? ["search"] : [])]
        ).map((a) => (
          <option key={a}>{a}</option>
        ))}
      </select>
      {(action === "create"
        ? ["title", "date", "text"]
        : tool === "file_search"
          ? ["path", "text"]
          : action === "search"
            ? ["text"]
            : []
      ).map((k) => (
        <label key={k}>
          {k}
          {k === "date"
            ? tool === "calendar"
              ? " (UTC YYYYMMDDTHHMMSSZ)"
              : " (YYYY-MM-DD)"
            : ""}
          <input
            aria-label={`Local ${k}`}
            maxLength={4096}
            value={args[k as keyof typeof args]}
            onChange={(e) => setArgs({ ...args, [k]: e.target.value })}
          />
        </label>
      ))}
      <button
        disabled={busy || !!preview || !isTauri()}
        onClick={() => void run()}
      >
        Run locally / 本機執行
      </button>
      {preview && (
        <section role="dialog" aria-label="Confirm local write">
          <pre>{preview.diff}</pre>
          <pre>{preview.before}</pre>
          <pre>{preview.after}</pre>
          <button disabled={busy} onClick={() => void run(true)}>
            Confirm local write / 確認本機寫入
          </button>
          <button disabled={busy} onClick={() => void run(false)}>
            Reject / 拒絕
          </button>
        </section>
      )}
      <pre aria-label="Local tool result">{result}</pre>
    </details>
  );
}
