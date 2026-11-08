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
    const request = indexedDB.open(DB, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("conversations"))
        request.result.createObjectStore("conversations", { keyPath: "id" });
      if (!request.result.objectStoreNames.contains("recovery"))
        request.result.createObjectStore("recovery", { autoIncrement: true });
    };
    request.onblocked = () => reject(Error("Close other DigiPet windows / 請關閉其他視窗"));
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
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
  list: async () => {
    const rows: unknown[] = await transaction("readonly", s => s.getAll());
    if (!rows.every(validConversation)) throw Error("History needs repair / 歷史需要修復");
    return rows.sort((a, b) => b.updated - a.updated);
  },
  repair: async () => {
    const db = await openHistory();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(["conversations", "recovery"], "readwrite");
        const store = tx.objectStore("conversations");
        const request = store.openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          if (!validConversation(cursor.value)) {
            tx.objectStore("recovery").add({ key: cursor.primaryKey, value: cursor.value });
            cursor.delete();
          }
          cursor.continue();
        };
        tx.oncomplete = () => resolve();
        tx.onabort = tx.onerror = () => reject(Error("Backup/repair failed / 備份或修復失敗"));
      });
    } finally { db.close(); }
  },
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
    const db = await openHistory();
    try { await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["conversations", "recovery"], "readwrite");
      tx.objectStore("conversations").clear(); tx.objectStore("recovery").clear();
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(Error("History deletion failed / 無法刪除歷史"));
    }); } finally { db.close(); }
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

function validConversation(row: unknown): row is Conversation {
  if (!row || typeof row !== "object") return false;
  const c = row as Conversation;
  return typeof c.id === "string" && typeof c.title === "string" &&
    Number.isFinite(c.updated) && Array.isArray(c.messages) && c.messages.length <= 500 &&
    c.messages.every(m => m && ["user", "assistant"].includes(m.role) &&
      typeof m.content === "string" &&
      (m.status === undefined || ["complete", "stopped", "error"].includes(m.status)));
}

/** Explicit export allowlist, also redacted by native keychain before download. */
export function exportHistory(rows: Conversation[]): string {
  return JSON.stringify(rows.map(c => ({ id: c.id, title: redact(c.title), updated: c.updated,
    messages: c.messages.map(m => ({ role: m.role, content: redact(m.content), ...(m.status ? {status:m.status} : {}) })) })), null, 2);
}
