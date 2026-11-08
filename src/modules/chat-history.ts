import type { ChatMessage } from "./ai-router";
import { redact } from "./redaction";
export interface HistoryMessage extends ChatMessage {
  status?: "complete" | "stopped" | "error";
}
export interface Conversation {
  id: string;
  title: string;
  updated: number;
  messages: HistoryMessage[];
}
const DB = "digipet.chat.v1";
/** IndexedDB provides transactional, device-local storage in both supported WebViews. */
export function openHistory(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("conversations", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("History unavailable / 無法開啟歷史"));
  });
}
async function transaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openHistory();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction("conversations", mode);
      const request = action(tx.objectStore("conversations"));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = tx.onerror = () =>
        reject(new Error("History could not be saved / 無法儲存歷史"));
    });
  } finally {
    db.close();
  }
}
export const history = {
  list: async () =>
    ((await transaction("readonly", (s) => s.getAll())) as Conversation[]).sort(
      (a, b) => b.updated - a.updated,
    ),
  save: async (conversation: Conversation) => {
    // Explicit allowlist: no route, credential, or arbitrary object fields reach storage.
    const safe: Conversation = {
      id: conversation.id,
      title: redact(conversation.title).slice(0, 80),
      updated: Date.now(),
      messages: conversation.messages
        .slice(-500)
        .map((m) => ({
          role: m.role,
          content: redact(m.content),
          ...(m.status ? { status: m.status } : {}),
        })),
    };
    if (JSON.stringify(safe).length > 2 * 1024 * 1024)
      throw new Error("Conversation too large / 對話過大");
    await transaction("readwrite", (s) => s.put(safe));
  },
  remove: async (id: string) => {
    await transaction("readwrite", (s) => s.delete(id));
  },
  clear: async () => {
    await transaction("readwrite", (s) => s.clear());
  },
};
export function contextMessages(
  messages: HistoryMessage[],
  count = 20,
  prompt = "",
): ChatMessage[] {
  return [
    ...(prompt.trim()
      ? [{ role: "system" as const, content: redact(prompt) }]
      : []),
    ...messages
      .slice(-Math.max(1, Math.min(100, count)))
      .filter((m) => m.content.trim())
      .map((m) => ({ role: m.role, content: redact(m.content) })),
  ];
}
