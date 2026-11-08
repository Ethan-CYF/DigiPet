import { repairLibrary } from "./modules/pet-upload";
import { useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { history, prepareHistoryExport } from "./modules/chat-history";
import { providerRoutes, type Settings } from "./modules/model-wizard";
import { redact } from "./modules/redaction";
import { recoveryComponents, resetStorageComponent } from "./modules/recovery";
export default function DataSettings({
  settings,
  changed,
}: {
  settings: Settings;
  changed: () => void;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  async function act(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
      setMessage("Done / 完成");
    } catch {
      setMessage(
        "Could not complete; original data preserved where repair failed. / 操作失敗；修復失敗時保留原資料。",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Data and recovery">
      <h2>History & recovery / 歷史與復原</h2>
      <button
        disabled={busy}
        onClick={() =>
          void act(async () => {
            const text = await prepareHistoryExport(
              await history.list(),
              (text) =>
                isTauri()
                  ? invoke<string>("redact_chat_text", {
                      text,
                      credentialRefs: providerRoutes(settings).map(
                        (p) => p.route.credentialRef,
                      ),
                    })
                  : Promise.resolve(redact(text)),
            );
            const url = URL.createObjectURL(
              new Blob([redact(text)], { type: "application/json" }),
            );
            const a = document.createElement("a");
            a.href = url;
            a.download = "digipet-history.json";
            a.click();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
          })
        }
      >
        Export history / 匯出歷史
      </button>
      <button disabled={busy} onClick={() => setConfirm(true)}>
        Delete all chat history / 刪除全部聊天歷史
      </button>
      {confirm && (
        <div role="alertdialog" aria-label="Delete history confirmation">
          <p>
            Delete every conversation? Calendar, journal and grants are
            preserved. / 刪除所有對話？行事曆、日記及授權保留。
          </p>
          <button
            disabled={busy}
            onClick={() =>
              void act(async () => {
                await history.clear();
                changed();
                setConfirm(false);
              })
            }
          >
            Confirm deletion / 確認刪除
          </button>
          <button onClick={() => setConfirm(false)}>Cancel / 取消</button>
        </div>
      )}
      <p>
        Repair backs up damaged records locally before resetting them. Healthy
        components are preserved. Backups may contain private data and are never
        exported. /
        修復前先在本機備份損壞資料，保留正常元件；備份可能含私人資料，不會匯出。
      </p>
      <button
        disabled={busy}
        onClick={() =>
          void act(async () => {
            await history.repair();
            changed();
          })
        }
      >
        Backup & repair history / 備份並修復歷史
      </button>
      {recoveryComponents().map((key) => (
        <button
          key={key}
          disabled={busy}
          onClick={() =>
            void act(async () => {
              if (key === "digipet.appearances.v1") await repairLibrary();
              else resetStorageComponent(key);
              changed();
            })
          }
        >
          Backup & reset {key} / 備份並重設
        </button>
      ))}
      {isTauri() && (
        <button
          disabled={busy}
          onClick={() =>
            void act(async () => {
              await invoke("tool_repair");
            })
          }
        >
          Backup & repair local tools / 備份並修復本機工具
        </button>
      )}
      <p role="status">{message}</p>
    </section>
  );
}
