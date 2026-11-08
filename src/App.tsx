import {
  backend,
  runTask,
  routedToolModel,
  type Preview,
} from "./modules/tools";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";
import { isTauri, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import Sprite, { alphaRegions } from "./Sprite";
import AppearanceManager from "./AppearanceManager";
import { loadLibrary, saveLibrary, type Library } from "./modules/pet-upload";
import {
  STATES,
  transition,
  type AnimationState,
  type PetState,
} from "./animation";
import { routedReply, stubReply } from "./modules/ai-router";
import ApiSettings from "./ApiSettings";
import { loadSettings, providerRoutes } from "./modules/model-wizard";

import {
  history,
  contextMessages,
  type Conversation,
} from "./modules/chat-history";
import { redact, withAbort } from "./modules/redaction";
export default function App() {
  const desktop = isTauri();
  const [toolsEnabled, setToolsEnabled] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const approval = useRef<((approved: boolean) => void) | null>(null);
  const [reminder, setReminder] = useState("");
  function approveWrite(value: Preview, signal: AbortSignal): Promise<boolean> {
    return new Promise((resolve) => {
      const finish = (approved: boolean) => {
        signal.removeEventListener("abort", abort);
        approval.current = null;
        setPreview(null);
        resolve(approved);
      };
      const abort = () => finish(false);
      approval.current = finish;
      setPreview(value);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    });
  }
  useEffect(() => {
    if (!desktop) return;
    const poll = () => {
      void invoke<{ title: string; date: string }[]>("tool_reminders")
        .then((events) => {
          if (events.length) {
            setReminder(
              events.map((e) => `${e.title} (${e.date})`).join(" · "),
            );
            setOpen(true);
          }
        })
        .catch(() => {});
    };
    poll();
    const timer = window.setInterval(poll, 30000);
    return () => window.clearInterval(timer);
  }, [desktop]);
  const [settings, setSettings] = useState(loadSettings);
  const [settingUp, setSettingUp] = useState(!settings.completed);
  const [open, setOpen] = useState(!settings.completed);
  const pending = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [current, setCurrent] = useState<Conversation | null>(null);
  const currentRef = useRef<Conversation | null>(null);
  const [historyError, setHistoryError] = useState("");
  useEffect(() => {
    void history
      .list()
      .then(setConversations)
      .catch(() => setHistoryError("History unavailable / 歷史不可用"));
  }, []);
  async function persist(next: Conversation) {
    currentRef.current = next;
    setCurrent(next);
    try {
      await history.save(next);
      setConversations(await history.list());
      setHistoryError("");
    } catch {
      setHistoryError("History could not be saved / 無法儲存歷史");
    }
  }
  function selectConversation(next: Conversation | null) {
    currentRef.current = next;
    setCurrent(next);
    const last = next?.messages.filter((m) => m.role === "assistant").at(-1);
    setReply(
      last
        ? last.content + (last.status === "stopped" ? "\nStopped / 已停止" : "")
        : "你好！我是 DigiPet。",
    );
    setError("");
  }
  const [managing, setManaging] = useState(false);
  const [library, setLibrary] = useState(loadLibrary);
  const [animation, setAnimation] = useState<AnimationState>({
    state: "idle",
    since: performance.now(),
  });
  const timers = useRef<number[]>([]);
  function changeState(state: PetState) {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setAnimation((current) => transition(current, state, performance.now()));
  }
  function commit(next: Library) {
    try {
      saveLibrary(next);
      setLibrary(next);
      setError("");
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    }
  }
  function invalid(message: string) {
    setError(message);
    const next = { ...library, selected: "default" };
    setLibrary(next);
    try {
      saveLibrary(next);
    } catch {
      /* In-memory default still recovers interaction. */
    }
  }
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      pending.current?.abort();
    },
    [],
  );
  const [text, setText] = useState("");
  const [reply, setReply] = useState("你好！我是 DigiPet。");
  const [error, setError] = useState("");
  const bubble = useRef<HTMLElement>(null);
  const pet = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const gesture = useRef<{ x: number; y: number; dragged: boolean } | null>(
    null,
  );
  const toggle = () => setOpen((value) => !value);

  useEffect(() => {
    if (!desktop) return;
    const subscriptions = [
      listen("pet-click", toggle),
      listen<string>("pet-warning", (e) => setError(e.payload)),
      listen<boolean>("pet-moving", (e) =>
        changeState(e.payload ? "walk" : "idle"),
      ),
    ];
    return () => {
      void Promise.all(subscriptions).then((stops) =>
        stops.forEach((stop) => stop()),
      );
    };
  }, []);

  useEffect(() => {
    if (open) {
      if (settingUp) {
        bubble.current
          ?.querySelector<HTMLInputElement>('[aria-label="API base URL"]')
          ?.focus({ preventScroll: true });
        if (bubble.current) bubble.current.scrollTop = 0;
      } else if (managing) {
        bubble.current
          ?.querySelector<HTMLSelectElement>(
            '[aria-label="Current appearance"]',
          )
          ?.focus({ preventScroll: true });
        if (bubble.current) bubble.current.scrollTop = 0;
      } else input.current?.focus();
    }
    if (!desktop) return;
    // Keep the pet anchored at the same screen location when the bubble expands upward.
    let disposed = false;
    const publish = async () => {
      const canvas = pet.current?.querySelector("canvas");
      const bounds = canvas?.getBoundingClientRect();
      const ctx = canvas?.getContext("2d");
      const rectangles =
        ctx && bounds
          ? alphaRegions(
              ctx.getImageData(0, 0, 128, 128).data,
              128,
              128,
              bounds,
            )
          : [];
      if (bubble.current) {
        const r = bubble.current.getBoundingClientRect();
        rectangles.push({
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height + 10,
        });
      }
      await invoke("set_hit_regions", { rectangles });
    };
    void (async () => {
      await invoke("resize_pet", {
        expanded: open,
        managing: open && (managing || settingUp || toolsEnabled),
      });
      if (!disposed) await publish();
    })().catch((e) => setError(String(e)));
    const timer = window.setInterval(() => {
      void publish().catch((e) => setError(String(e)));
    }, 100);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [open, managing, settingUp, toolsEnabled]);

  async function mouseDown(event: MouseEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    gesture.current = { x: event.screenX, y: event.screenY, dragged: false };
    if (!desktop) return;
    try {
      // Native monitoring survives the OS move loop consuming the DOM mouseup.
      const monitored = await invoke<boolean>("begin_pet_gesture");
      if (monitored) {
        gesture.current = null;
        try {
          await getCurrentWindow().startDragging();
        } catch (e) {
          await invoke("cancel_pet_gesture");
          throw e;
        }
      }
      // Wayland: no global button query; use the DOM threshold path below.
    } catch (e) {
      setError(String(e));
    }
  }
  async function mouseMove(event: MouseEvent<HTMLButtonElement>) {
    const start = gesture.current;
    if (!start || !event.buttons || start.dragged) return;
    if (Math.hypot(event.screenX - start.x, event.screenY - start.y) > 5) {
      start.dragged = true;
      changeState("walk");
      if (desktop)
        await getCurrentWindow()
          .startDragging()
          .catch((e) => setError(String(e)));
    }
  }
  function mouseUp(event: MouseEvent<HTMLButtonElement>) {
    const start = gesture.current;
    gesture.current = null;
    if (start?.dragged) changeState("idle");
    if (
      start &&
      !start.dragged &&
      Math.hypot(event.screenX - start.x, event.screenY - start.y) <= 5
    )
      toggle();
  }
  function stop() {
    pending.current?.abort();
    changeState("idle");
  }
  async function send(event: FormEvent) {
    event.preventDefault();
    const message = text.trim();
    if (!message || pending.current || busy || settingUp) return;
    changeState("thinking");
    setError("");
    setText("");
    if (providerRoutes(settings).length) {
      const controller = new AbortController();
      pending.current = controller;
      setBusy(true);
      setReply("");
      let next: Conversation | null = null;
      let partial = "";
      try {
        // Keychain-side redaction also covers configured keys after an app restart.
        const clean = await withAbort(
          invoke<string>("redact_chat_text", {
            text: message,
            credentialRefs: providerRoutes(settings).map(
              (p) => p.route.credentialRef,
            ),
          }),
          controller.signal,
        );
        if (controller.signal.aborted)
          throw new DOMException("Stopped", "AbortError");
        const userText = redact(clean);
        const previous = currentRef.current;
        next = {
          id: previous?.id ?? crypto.randomUUID(),
          title: previous?.title ?? userText.slice(0, 80),
          updated: Date.now(),
          messages: [
            ...(previous?.messages ?? []),
            { role: "user", content: userText },
          ],
        };
        await persist(next);
        const policy = {
          routes: providerRoutes(settings),
          activeRouteId: settings.activeRouteId,
          fallbackEnabled: settings.fallbackEnabled,
          timeoutMs: settings.timeoutMs,
          retries: settings.retries,
        };
        const result = toolsEnabled
          ? await runTask(
              contextMessages(
                next.messages,
                settings.contextWindow,
                settings.systemPrompt,
              ),
              routedToolModel(policy),
              backend,
              controller.signal,
              (value) => setReply(value),
              approveWrite,
            )
          : await routedReply(
              contextMessages(
                next.messages,
                settings.contextWindow,
                settings.systemPrompt,
              ),
              {
                routes: providerRoutes(settings),
                activeRouteId: settings.activeRouteId,
                fallbackEnabled: settings.fallbackEnabled,
                timeoutMs: settings.timeoutMs,
                retries: settings.retries,
              },
              controller.signal,
              (value) => {
                if (!value) return;
                partial = value;
                setReply(value);
                changeState("talking");
              },
            );
        partial = result;
        setReply(result);
        await persist({
          ...next,
          messages: [
            ...next.messages,
            { role: "assistant", content: result, status: "complete" },
          ],
        });
        changeState("talking");
      } catch (e) {
        const stopped = controller.signal.aborted;
        if (stopped)
          setReply(partial + (partial ? "\n" : "") + "Stopped / 已停止");
        else
          setError(
            e instanceof Error && "code" in e
              ? e.message
              : "API request failed. Check settings, keychain and provider. / API 請求失敗，請檢查設定、金鑰庫及供應商。",
          );
        if (next)
          await persist({
            ...next,
            messages: [
              ...next.messages,
              {
                role: "assistant",
                content: partial,
                status: stopped ? "stopped" : "error",
              },
            ],
          });
        changeState(stopped ? "idle" : "sad");
      } finally {
        if (pending.current === controller) {
          pending.current = null;
          setBusy(false);
          timers.current.push(
            window.setTimeout(() => changeState("idle"), 1200),
          );
        }
      }
    } else {
      timers.current.push(
        window.setTimeout(() => {
          setReply(stubReply(message));
          changeState("talking");
          timers.current.push(
            window.setTimeout(() => changeState("idle"), 1200),
          );
        }, 300),
      );
    }
    input.current?.focus();
  }
  return (
    <main
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
      className={
        open
          ? `stage expanded${managing || settingUp || toolsEnabled ? " managing" : ""}`
          : "stage"
      }
    >
      {open && (
        <section ref={bubble} className="bubble" aria-label="DigiPet chat">
          <header>
            <span>
              DigiPet <small>M4</small>
            </span>
            <button aria-label="Close chat" onClick={() => setOpen(false)}>
              ×
            </button>
          </header>
          <div className="actions">
            <button
              onClick={() => {
                setSettingUp(false);
                setManaging((value) => !value);
              }}
            >
              {managing ? "Chat / 聊天" : "Appearance / 外觀"}
            </button>
            <button
              disabled={busy}
              onClick={() => {
                setManaging(false);
                setSettingUp((value) => !value);
              }}
            >
              Settings / 設定
            </button>
          </div>
          {settingUp && (
            <ApiSettings
              settings={settings}
              done={(next) => {
                setSettings(next);
                setSettingUp(false);
              }}
            />
          )}
          <label className="state-control">
            狀態 / State
            <select
              aria-label="Animation state"
              value={animation.state}
              onChange={(e) => changeState(e.target.value as PetState)}
            >
              {STATES.map((state) => (
                <option key={state}>{state}</option>
              ))}
            </select>
          </label>
          {managing && (
            <AppearanceManager
              library={library}
              commit={commit}
              invalid={invalid}
              animation={animation}
            />
          )}
          {!settingUp && !managing && (
            <section aria-label="Chat history">
              <select
                aria-label="Conversation"
                disabled={busy}
                value={current?.id ?? ""}
                onChange={(e) =>
                  selectConversation(
                    conversations.find((c) => c.id === e.target.value) ?? null,
                  )
                }
              >
                <option value="">New conversation / 新對話</option>
                {conversations.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
              <button disabled={busy} onClick={() => selectConversation(null)}>
                New / 新增
              </button>
              <button
                disabled={busy || !current}
                onClick={() => {
                  if (current)
                    void history
                      .remove(current.id)
                      .then(async () => {
                        selectConversation(null);
                        setConversations(await history.list());
                      })
                      .catch(() =>
                        setHistoryError(
                          "Could not delete history / 無法刪除歷史",
                        ),
                      );
                }}
              >
                Delete / 刪除
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  void history
                    .clear()
                    .then(() => {
                      selectConversation(null);
                      setConversations([]);
                    })
                    .catch(() =>
                      setHistoryError("Could not clear history / 無法清空歷史"),
                    );
                }}
              >
                Clear all / 全部清除
              </button>
              {current && (
                <details>
                  <summary>Messages / 訊息</summary>
                  {current.messages.map((m, i) => (
                    <p key={i}>
                      {m.role}: {m.content}{" "}
                      {m.status === "stopped"
                        ? "(Stopped / 已停止)"
                        : m.status === "error"
                          ? "(Incomplete / 未完成)"
                          : ""}
                    </p>
                  ))}
                </details>
              )}
            </section>
          )}
          {historyError && <p className="error">{historyError}</p>}
          {desktop && (
            <label>
              <input
                type="checkbox"
                checked={toolsEnabled}
                disabled={busy}
                onChange={(e) => setToolsEnabled(e.target.checked)}
              />
              AI tools / AI 工具
            </label>
          )}
          {reminder && (
            <p role="alert">
              Reminder / 提醒：{reminder}
              <button onClick={() => setReminder("")}>Dismiss / 關閉</button>
            </p>
          )}
          {preview && (
            <section role="dialog" aria-label="Confirm tool write">
              <p>
                {preview.tool}: {preview.target}
              </p>
              <p>
                Review the complete before/after change. / 確認完整變更內容。
              </p>
              <h3>Before / 原內容</h3>
              <pre>{preview.before || "(new / 新增)"}</pre>
              <h3>After / 新內容</h3>
              <pre>{preview.after}</pre>
              <button onClick={() => approval.current?.(true)}>
                Confirm write / 確認寫入
              </button>
              <button onClick={() => approval.current?.(false)}>
                Reject / 拒絕
              </button>
            </section>
          )}
          <p role="status">{reply}</p>
          <form onSubmit={send}>
            <input
              ref={input}
              aria-label="Message"
              placeholder="說點什麼…"
              value={text}
              maxLength={500}
              onChange={(e) => setText(e.target.value)}
            />
            <button
              disabled={busy || settingUp}
              type="submit"
              aria-label="Send message"
            >
              ↑
            </button>
          </form>
          {busy && <button onClick={stop}>Stop / 停止</button>}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </section>
      )}
      <button
        ref={pet}
        className="pet"
        aria-label="DigiPet: click to chat, drag to move"
        aria-expanded={open}
        onMouseDown={mouseDown}
        onMouseMove={mouseMove}
        onMouseUp={mouseUp}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
      >
        <Sprite
          appearance={library.appearances.find(
            (a) => a.id === library.selected,
          )}
          animation={animation}
          onError={() =>
            invalid("Bad image — restored default / 圖片失效，已還原預設")
          }
        />
      </button>
    </main>
  );
}
