import { reportRecovery } from "./modules/recovery";
import UpdateNotice, { useUpdateNotice } from "./UpdateNotice";
import DataSettings from "./DataSettings";
import LocalTools from "./LocalTools";
import ToolPermissions from "./ToolPermissions";
import { useSecondaryLayout } from "./useSecondaryLayout";
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
  const page = section === "settings" ? settingsPage : section;
  const pages = [
    { id: "api", label: "Providers / 供應商", section: "settings", width: 960 },
    {
      id: "access",
      label: "Local tool access / 本機工具授權",
      section: "settings",
      width: 920,
    },
    {
      id: "tools",
      label: "Tools & state / 工具與狀態",
      section: "tools",
      width: 960,
    },
    {
      id: "appearance",
      label: "Appearance / 外觀",
      section: "appearance",
      width: 960,
    },
    {
      id: "conversations",
      label: "Conversations / 對話",
      section: "conversations",
      width: 880,
    },
    {
      id: "data",
      label: "Data & recovery / 資料與復原",
      section: "settings",
      width: 900,
    },
    { id: "updates", label: "Updates / 更新", section: "settings", width: 760 },
  ];
  const activePage = pages.find((item) => item.id === page) ?? pages[0];
  const surface = useSecondaryLayout(
    secondaryOpen,
    desktop,
    preview ? 1040 : activePage.width,
    secondary,
  );
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
      const content =
        secondary.current?.querySelector<HTMLElement>(".secondary-body");
      if (content) content.scrollTop = 0;
      const target = preview
        ? secondary.current?.querySelector<HTMLElement>("[data-write-review]")
        : settingUp
          ? (secondary.current?.querySelector<HTMLElement>(
              '[aria-label="API base URL"]',
            ) ??
            secondary.current?.querySelector<HTMLElement>(
              '[aria-label="Provider router"] input',
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
      // Scroll only the panel body; never scroll the transparent window/root.
      if (content && focusTarget && content.contains(focusTarget)) {
        const bounds = content.getBoundingClientRect();
        const targetBounds = focusTarget.getBoundingClientRect();
        const padding =
          parseFloat(getComputedStyle(content).scrollPaddingTop) || 0;
        if (targetBounds.top < bounds.top + padding)
          content.scrollTop -= bounds.top + padding - targetBounds.top;
        else if (targetBounds.bottom > bounds.bottom)
          content.scrollTop += targetBounds.bottom - bounds.bottom;
      }
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
        surface: secondaryOpen
          ? { width: surface.width, height: surface.height }
          : null,
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
  }, [open, secondaryOpen, desktop, surface.width, surface.height]);

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
    if (!message || pending.current || busy || settingUp || localWritePending)
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
      style={surface.style}
      className={`stage${open || secondaryOpen ? " expanded" : ""}${secondaryOpen ? " managing" : ""}`}
    >
      <section
        ref={secondary}
        className="secondary"
        aria-label="DigiPet controls / 管理面板"
        hidden={!secondaryOpen}
      >
        <header className="secondary-header">
          <div>
            <span className="app-name">DigiPet</span>
            <h1>{activePage.label}</h1>
          </div>
          <div className="actions">
            <button onClick={returnToChat}>Chat / 聊天</button>
            {secondaryOpen && busy && (
              <button onClick={stop}>Stop / 停止</button>
            )}
            <button
              aria-label="Close controls / 關閉管理面板"
              onClick={closeSurfaces}
            >
              ×
            </button>
          </div>
        </header>
        <div className="secondary-body">
          <nav
            className="secondary-nav"
            aria-label="Settings sections / 設定分類"
          >
            {pages.map((item) => (
              <button
                key={item.id}
                aria-current={page === item.id ? "page" : undefined}
                aria-pressed={page === item.id}
                disabled={
                  item.section === "settings" && (busy || localWritePending)
                }
                onClick={() => {
                  openControls(item.section);
                  if (item.section === "settings") setSettingsPage(item.id);
                }}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div className="secondary-content">
            {preview && (
              <section role="dialog" aria-label="Confirm tool write">
                <h2 tabIndex={-1} data-write-review>
                  Review write / 檢視寫入
                </h2>
                <p>
                  {preview.tool}: {preview.target}
                </p>
                <p>
                  Review the complete before/after change. / 確認完整變更內容。
                </p>
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
                <div className="actions">
                  <button
                    aria-label="Confirm write / 確認寫入"
                    onClick={() => approval.current?.(true)}
                  >
                    Confirm write / 確認寫入
                  </button>
                  <button onClick={() => approval.current?.(false)}>
                    Reject / 拒絕
                  </button>
                </div>
              </section>
            )}
            {secondaryOpen && busy && <p role="status">{reply}</p>}
            {secondaryOpen && settingUp && (
              <>
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
                  <section
                    className="settings-card"
                    aria-label="Local tool access / 本機工具授權"
                  >
                    <h2>Local tool access / 本機工具授權</h2>
                    <p>
                      Calendar and Journal use DigiPet's own local data. They do
                      not access the OS calendar, so Windows/Linux have no
                      system calendar permission prompt for these tools. /
                      行事曆及日記只使用 DigiPet
                      本機資料，不存取系統日曆，因此沒有對應的系統日曆權限提示。
                    </p>
                    <p>
                      Calendar and Journal are enabled by default on fresh
                      install and upgrade, without a prompt. Turn either off
                      below; your choice persists. File tools stay denied until
                      you choose an allowed folder with the OS picker. Every
                      write still needs preview and confirmation. /
                      首次安裝及升級預設啟用行事曆與日記，不顯示授權提示；可在下方關閉並保存選擇。檔案工具需使用系統選擇器指定允許資料夾；每次寫入仍須預覽確認。
                    </p>
                    {!settings.completed && (
                      <button onClick={() => setSettingsPage("api")}>
                        Continue API setup / 繼續 API 設定
                      </button>
                    )}
                    <ToolPermissions
                      expanded
                      disabled={busy || localWritePending}
                    />
                  </section>
                )}
                {settingsPage === "updates" && (
                  <section
                    className="settings-card"
                    aria-label="Manual updates / 手動更新"
                  >
                    <h2>Manual updates / 手動更新</h2>
                    <p>
                      Check for a newer version, then choose whether to download
                      it. / 手動檢查新版本，再選擇是否下載。
                    </p>
                    <UpdateNotice {...updateNotice} />
                    {desktop && (
                      <button
                        disabled={updateNotice.checking}
                        onClick={() => void updateNotice.check()}
                      >
                        Check for updates / 檢查更新
                      </button>
                    )}
                  </section>
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
                      conversations.find((c) => c.id === e.target.value) ??
                        null,
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
                <div className="actions">
                  <button
                    disabled={busy}
                    onClick={() => selectConversation(null)}
                  >
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
                          setHistoryError(
                            "Could not clear history / 無法清空歷史",
                          ),
                        );
                    }}
                  >
                    Clear all / 全部清除
                  </button>
                </div>
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
            <div className="settings-stack" hidden={section !== "tools"}>
              <h2>Local tools / 本機工具</h2>
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
                disabled={busy}
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
          </div>
        </div>
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
              disabled={busy || settingUp || localWritePending}
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
