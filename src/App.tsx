import { reportRecovery } from "./modules/recovery";
import UpdateNotice, { useUpdateNotice } from "./UpdateNotice";
import DataSettings from "./DataSettings";
import LocalTools from "./LocalTools";
import ToolPermissions from "./ToolPermissions";
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
  const updateNotice = useUpdateNotice(desktop);
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
      setSecondaryOpen(true);
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
  const [secondaryOpen, setSecondaryOpen] = useState(!settings.completed);
  const [section, setSection] = useState("settings");
  const [settingsPage, setSettingsPage] = useState("api");
  const [wheelOpen, setWheelOpen] = useState(false);
  const wheel = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(
    !settings.completed || settings.openOnStartup === true,
  );
  const pending = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [localWritePending, setLocalWritePending] = useState(false);
  const [accessBusy, setAccessBusy] = useState(desktop);
  const [accessStatus, setAccessStatus] = useState("");
  async function requestAccess(force: boolean) {
    setAccessBusy(true);
    try {
      const status = await invoke<string>("tool_access_setup", { force });
      setAccessStatus(status ?? "");
      if (status === "deferred") {
        openControls();
        setSettingsPage("access");
      }
    } catch {
      setAccessStatus("error");
      openControls();
      setSettingsPage("access");
    } finally {
      setAccessBusy(false);
    }
  }
  useEffect(() => {
    if (desktop) void requestAccess(false);
  }, [desktop]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [current, setCurrent] = useState<Conversation | null>(null);
  const currentRef = useRef<Conversation | null>(null);
  const [historyError, setHistoryError] = useState("");
  useEffect(() => {
    void history
      .list()
      .then((rows) => {
        setConversations(rows);
        if (settings.rememberConversation !== false && rows[0])
          selectConversation(rows[0]);
      })
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
  const managing = section === "appearance";
  const [library, setLibrary] = useState(loadLibrary);
  const [animation, setAnimation] = useState<AnimationState>({
    state: "idle",
    since: performance.now(),
  });
  const timers = useRef<number[]>([]);
  function changeState(state: PetState) {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setAnimation((current) =>
      current.state === state
        ? current
        : transition(current, state, performance.now()),
    );
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
    reportRecovery("digipet.appearances.v1");
    // Keep the original for explicit backup/repair; only the visible selection falls back.
  }
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      pending.current?.abort();
    },
    [],
  );
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine);
      if (!navigator.onLine) pending.current?.abort();
    };
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  const [text, setText] = useState("");
  const [reply, setReply] = useState("你好！我是 DigiPet。");
  const [error, setError] = useState("");
  const bubble = useRef<HTMLElement>(null);
  const secondary = useRef<HTMLElement>(null);
  const controls = useRef<HTMLButtonElement>(null);
  const pet = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  type PetGesture = {
    x: number;
    y: number;
    dragged: boolean;
    monitoring: boolean;
    released?: { x: number; y: number };
  };
  const gesture = useRef<PetGesture | null>(null);
  const toggle = () => {
    setWheelOpen(false);
    setSecondaryOpen(false);
    setSettingUp(false);
    setOpen((value) => !value);
  };
  function openControls(target = "settings") {
    setWheelOpen(false);
    if (target === "settings" && (busy || localWritePending)) target = "tools";
    setSection(target);
    setSettingUp(target === "settings");
    setSecondaryOpen(true);
  }
  function closeSurfaces() {
    setWheelOpen(false);
    setSecondaryOpen(false);
    setOpen(false);
    pet.current?.focus({ preventScroll: true });
  }
  function returnToChat() {
    setWheelOpen(false);
    setSecondaryOpen(false);
    setSettingUp(false);
    setOpen(true);
  }

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
    if (secondaryOpen) {
      if (secondary.current) secondary.current.scrollTop = 0;
      const target = preview
        ? secondary.current?.querySelector<HTMLElement>(
            '[aria-label="Confirm write / 確認寫入"]',
          )
        : settingUp
          ? (secondary.current?.querySelector<HTMLElement>(
              '[aria-label="API base URL"]',
            ) ??
            secondary.current?.querySelector<HTMLElement>(
              '[aria-label="System prompt"]',
            ))
          : secondary.current?.querySelector<HTMLElement>(
              managing
                ? '[aria-label="Current appearance"]'
                : '[aria-label="Close controls / 關閉管理面板"]',
            );
      const focusTarget =
        target ??
        secondary.current?.querySelector<HTMLElement>(
          '[aria-label="Close controls / 關閉管理面板"]',
        );
      focusTarget?.focus({ preventScroll: true });
      focusTarget?.scrollIntoView?.({ block: "nearest" });
    } else if (open) input.current?.focus({ preventScroll: true });
  }, [
    open,
    secondaryOpen,
    managing,
    settingUp,
    preview,
    section,
    settingsPage,
  ]);

  useEffect(() => {
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
      // Rectangles are CSS pixels; the native hit test applies the monitor scale.
      for (const element of [
        bubble.current,
        secondary.current,
        controls.current,
        wheel.current,
      ]) {
        if (!element || element.hidden) continue;
        if (
          element === controls.current &&
          getComputedStyle(element).opacity === "0"
        )
          continue;
        const r = element.getBoundingClientRect();
        rectangles.push({
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height + (element === bubble.current ? 14 : 0),
        });
      }
      await invoke("set_hit_regions", { rectangles });
    };
    void (async () => {
      await invoke("resize_pet", {
        expanded: open || secondaryOpen,
        managing: secondaryOpen,
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
  }, [open, secondaryOpen, desktop]);

  async function mouseDown(event: MouseEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    setWheelOpen(false);
    const start: PetGesture = {
      x: event.screenX,
      y: event.screenY,
      dragged: false,
      monitoring: desktop,
    };
    gesture.current = start;
    if (!desktop) return;
    try {
      // Native monitoring survives the OS move loop consuming the DOM mouseup.
      const monitored = await invoke<boolean>("begin_pet_gesture");
      if (monitored) {
        // React must not toggle while begin_pet_gesture is still in flight.
        if (gesture.current === start) gesture.current = null;
        try {
          await getCurrentWindow().startDragging();
        } catch (e) {
          await invoke("cancel_pet_gesture");
          throw e;
        }
      }
      // Wayland: no global button query; use the DOM threshold path below.
      else {
        start.monitoring = false;
        if (start.released)
          finishGesture(start, start.released.x, start.released.y);
        else if (start.dragged) await getCurrentWindow().startDragging();
      }
    } catch (e) {
      if (gesture.current === start) gesture.current = null;
      setError(String(e));
    }
  }
  async function mouseMove(event: MouseEvent<HTMLButtonElement>) {
    const start = gesture.current;
    if (!start || !event.buttons || start.dragged) return;
    if (Math.hypot(event.screenX - start.x, event.screenY - start.y) > 5) {
      start.dragged = true;
      changeState("walk");
      if (desktop && !start.monitoring)
        await getCurrentWindow()
          .startDragging()
          .catch((e) => setError(String(e)));
    }
  }
  function finishGesture(start: PetGesture, x: number, y: number) {
    if (gesture.current === start) gesture.current = null;
    if (start.dragged) changeState("idle");
    if (!start.dragged && Math.hypot(x - start.x, y - start.y) <= 5) toggle();
  }
  function mouseUp(event: MouseEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    const start = gesture.current;
    if (!start) return;
    if (start.monitoring) {
      start.released = { x: event.screenX, y: event.screenY };
      return;
    }
    finishGesture(start, event.screenX, event.screenY);
  }
  function stop() {
    pending.current?.abort();
    changeState("idle");
  }
  async function send(event: FormEvent) {
    event.preventDefault();
    const message = text.trim();
    if (
      !message ||
      pending.current ||
      busy ||
      settingUp ||
      accessBusy ||
      localWritePending
    )
      return;
    if (!online) {
      setError(
        "Offline: chat requires a network provider. Local tools remain available. / 離線：聊天需要網路供應商，本機工具仍可使用。",
      );
      return;
    }
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
        if (e.key === "Escape") {
          e.preventDefault();
          closeSurfaces();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === ",") {
          e.preventDefault();
          openControls();
        }
      }}
      onMouseLeave={() => setWheelOpen(false)}
      onMouseMove={(e) => {
        if (!wheelOpen) return;
        const inside = (el: HTMLElement | null) => {
          const r = el?.getBoundingClientRect();
          return (
            r &&
            e.clientX >= r.left &&
            e.clientX <= r.right &&
            e.clientY >= r.top &&
            e.clientY <= r.bottom
          );
        };
        if (!inside(pet.current) && !inside(wheel.current)) setWheelOpen(false);
      }}
      onPointerDownCapture={(e) => {
        if (
          !pet.current?.contains(e.target as Node) &&
          !wheel.current?.contains(e.target as Node)
        )
          setWheelOpen(false);
      }}
      className={`stage${open || secondaryOpen ? " expanded" : ""}${secondaryOpen ? " managing" : ""}`}
    >
      <section
        ref={secondary}
        className="secondary"
        aria-label="DigiPet controls / 管理面板"
        hidden={!secondaryOpen}
      >
        <header>
          <span>DigiPet</span>
          <button
            aria-label="Close controls / 關閉管理面板"
            onClick={closeSurfaces}
          >
            ×
          </button>
        </header>
        <nav className="actions" aria-label="Pet controls / 寵物管理">
          <button onClick={returnToChat}>Chat / 聊天</button>
          <button
            aria-pressed={section === "settings"}
            disabled={busy || localWritePending}
            onClick={() => openControls("settings")}
          >
            Settings / 設定
          </button>
          <button
            aria-pressed={managing}
            onClick={() => openControls("appearance")}
          >
            Appearance / 外觀
          </button>
          <button
            aria-pressed={section === "conversations"}
            onClick={() => openControls("conversations")}
          >
            Conversations / 對話
          </button>
          <button
            aria-pressed={section === "tools"}
            onClick={() => openControls("tools")}
          >
            Tools & state / 工具與狀態
          </button>
        </nav>
        {preview && (
          <section role="dialog" aria-label="Confirm tool write">
            <p>
              {preview.tool}: {preview.target}
            </p>
            <p>Review the complete before/after change. / 確認完整變更內容。</p>
            {preview.diff && (
              <>
                <h3>Patch / 差異</h3>
                <pre>{preview.diff}</pre>
              </>
            )}
            <h3>Before / 原內容</h3>
            <pre>{preview.before || "(new / 新增)"}</pre>
            <h3>After / 新內容</h3>
            <pre>{preview.after}</pre>
            <button
              aria-label="Confirm write / 確認寫入"
              onClick={() => approval.current?.(true)}
            >
              Confirm write / 確認寫入
            </button>
            <button onClick={() => approval.current?.(false)}>
              Reject / 拒絕
            </button>
          </section>
        )}
        {secondaryOpen && busy && (
          <>
            <p role="status">{reply}</p>
            <button onClick={stop}>Stop / 停止</button>
          </>
        )}
        {secondaryOpen && settingUp && (
          <>
            <nav className="actions" aria-label="Settings sections / 設定分類">
              <button onClick={() => setSettingsPage("api")}>
                API & preferences / API 與偏好
              </button>
              <button onClick={() => setSettingsPage("access")}>
                Local tool access / 本機工具授權
              </button>
              <button onClick={() => setSettingsPage("data")}>
                Data & recovery / 資料與復原
              </button>
              <button onClick={() => setSettingsPage("updates")}>
                Updates / 更新
              </button>
            </nav>
            {settingsPage === "api" && (
              <ApiSettings
                settings={settings}
                done={(next) => {
                  setSettings(next);
                  returnToChat();
                }}
              />
            )}
            {settingsPage === "data" && (
              <DataSettings
                settings={settings}
                changed={() => {
                  setSettings(loadSettings());
                  setLibrary(loadLibrary());
                  selectConversation(null);
                  void history
                    .list()
                    .then(setConversations)
                    .catch(() =>
                      setHistoryError("History unavailable / 歷史不可用"),
                    );
                }}
              />
            )}
            {settingsPage === "access" && (
              <section aria-label="Local tool access / 本機工具授權">
                <h2>Local tool access / 本機工具授權</h2>
                <p>
                  Calendar and Journal use DigiPet's own local data. They do not
                  access the OS calendar, so Windows/Linux have no system
                  calendar permission prompt for these tools. /
                  行事曆及日記只使用 DigiPet
                  本機資料，不存取系統日曆，因此沒有對應的系統日曆權限提示。
                </p>
                <p>
                  The native Allow dialog grants DigiPet tool access. File
                  access uses the system folder picker below. Every write still
                  requires approval. / 原生允許對話框授予 DigiPet
                  工具存取；檔案存取使用下方的系統資料夾選擇器。每次寫入仍須確認。
                </p>
                {accessStatus === "deferred" && (
                  <p role="status">
                    Not allowed yet — choose tools below or request access
                    again. / 尚未允許，可在下方授權或重新要求存取。
                  </p>
                )}
                {accessStatus === "allowed" && (
                  <p role="status">
                    Initial access reviewed. Current grants are listed below. /
                    已完成首次存取審閱，目前授權如下。
                  </p>
                )}
                {accessStatus === "error" && (
                  <p role="alert">
                    Access setup failed. Retry or use Data & recovery if local
                    storage is damaged. /
                    授權失敗，請重試；若本機儲存損壞可使用資料與復原。
                  </p>
                )}
                <button
                  disabled={!desktop || accessBusy || busy || localWritePending}
                  onClick={() => void requestAccess(true)}
                >
                  Request local access again / 重新要求本機存取
                </button>
                {!settings.completed && (
                  <button onClick={() => setSettingsPage("api")}>
                    Continue API setup / 繼續 API 設定
                  </button>
                )}
                <ToolPermissions
                  key={`${accessStatus}-${accessBusy}`}
                  expanded
                  disabled={accessBusy || busy || localWritePending}
                />
              </section>
            )}
            {settingsPage === "updates" && (
              <>
                <UpdateNotice {...updateNotice} />
                {desktop && (
                  <button
                    disabled={updateNotice.checking}
                    onClick={() => void updateNotice.check()}
                  >
                    Check for updates / 檢查更新
                  </button>
                )}
              </>
            )}
          </>
        )}
        {secondaryOpen && managing && (
          <AppearanceManager
            library={library}
            commit={commit}
            invalid={invalid}
            animation={animation}
          />
        )}
        {secondaryOpen && section === "conversations" && (
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
        {secondaryOpen && historyError && (
          <p className="error">
            {historyError} — Settings → Backup & repair history / 設定 →
            備份並修復歷史
          </p>
        )}
        <div hidden={section !== "tools"}>
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
          <LocalTools
            pendingChanged={setLocalWritePending}
            accessBusy={accessBusy || busy}
            openAccess={() => {
              openControls();
              setSettingsPage("access");
            }}
          />
        </div>
        {secondaryOpen && reminder && (
          <p role="alert">
            Reminder / 提醒：{reminder}
            <button onClick={() => setReminder("")}>Dismiss / 關閉</button>
          </p>
        )}
        {secondaryOpen && error && (
          <p className="error" role="alert">
            {error}
            <button
              onClick={() => {
                stop();
                setError("");
                changeState("idle");
              }}
            >
              Reset provider task / 重設供應商工作
            </button>
            <button onClick={() => openControls()}>
              Recovery settings / 復原設定
            </button>
          </p>
        )}
      </section>
      {open && !secondaryOpen && (
        <section
          id="digipet-chat"
          ref={bubble}
          className="bubble"
          aria-label="DigiPet chat"
        >
          <div className="reply-scroll">
            {localWritePending && (
              <p>
                Review the pending local tool action in Tools & state. /
                請在工具與狀態處理待核准的本機操作。
              </p>
            )}
            {!online && <p>Offline / 離線：聊天需連線，本機工具可用。</p>}
            {reminder && (
              <p role="alert">
                Reminder / 提醒：{reminder}
                <button onClick={() => setReminder("")}>Dismiss / 關閉</button>
              </p>
            )}
            {historyError && (
              <p className="error">
                {historyError} — Settings → Backup & repair history / 設定 →
                備份並修復歷史
              </p>
            )}
            <p role="status" aria-live="polite">
              {reply}
            </p>
            {error && (
              <p className="error" role="alert">
                {error}
                <button
                  onClick={() => {
                    stop();
                    setError("");
                    changeState("idle");
                  }}
                >
                  Reset provider task / 重設供應商工作
                </button>
                <button onClick={() => openControls()}>
                  Recovery settings / 復原設定
                </button>
              </p>
            )}
          </div>
          <form onSubmit={send}>
            <input
              ref={input}
              aria-label="Message"
              placeholder="Message / 說點什麼…"
              value={text}
              maxLength={500}
              onChange={(e) => setText(e.target.value)}
            />
            <button
              disabled={busy || settingUp || accessBusy || localWritePending}
              type="submit"
              aria-label="Send message"
            >
              ↑
            </button>
          </form>
          {busy && <button onClick={stop}>Stop / 停止</button>}
        </section>
      )}
      <nav
        ref={wheel}
        hidden={!wheelOpen}
        className="pet-wheel"
        aria-label="Pet action wheel / 寵物輪盤"
      >
        <button className="wheel-chat" onClick={returnToChat}>
          Chat
          <br />
          聊天
        </button>
        <button
          className="wheel-appearance"
          onClick={() => openControls("appearance")}
        >
          Appearance
          <br />
          外觀
        </button>
        <button className="wheel-settings" onClick={() => openControls()}>
          Settings
          <br />
          設定
        </button>
      </nav>
      <button
        ref={controls}
        className={`pet-controls${preview || reminder || localWritePending ? " attention" : ""}`}
        aria-label="Open controls / 開啟管理面板"
        title="Settings, appearance, conversations & tools / 設定、外觀、對話與工具 (Ctrl+,)"
        aria-expanded={secondaryOpen}
        aria-description={
          preview || localWritePending
            ? "Pending write approval / 有待核准寫入"
            : undefined
        }
        onClick={() => (secondaryOpen ? closeSurfaces() : openControls())}
      >
        ⚙
      </button>
      <button
        ref={pet}
        className="pet"
        aria-label="DigiPet: click to chat, drag to move"
        aria-expanded={open && !secondaryOpen}
        aria-controls="digipet-chat"
        aria-description="Settings: hover for gear, right-click, or Ctrl+comma / 設定：滑過顯示齒輪、右鍵或 Ctrl+逗號"
        onContextMenu={(e) => {
          e.preventDefault();
          openControls();
        }}
        onMouseEnter={(e) => {
          if (!e.buttons && !gesture.current) setWheelOpen(true);
        }}
        onMouseDown={mouseDown}
        onMouseMove={mouseMove}
        onMouseUp={mouseUp}
        onKeyDown={(e) => {
          if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
            e.preventDefault();
            openControls();
          }
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
