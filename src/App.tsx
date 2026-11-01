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
import { stubReply } from "./modules/ai-router";

export default function App() {
  const desktop = isTauri();
  const [open, setOpen] = useState(false);
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
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
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
      if (managing) {
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
        managing: open && managing,
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
  }, [open, managing]);

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
  function send(event: FormEvent) {
    event.preventDefault();
    const message = text.trim();
    if (!message) return;
    changeState("thinking");
    timers.current.push(
      window.setTimeout(() => {
        setReply(stubReply(message));
        setAnimation((current) =>
          transition(current, "talking", performance.now()),
        );
        timers.current.push(
          window.setTimeout(
            () =>
              setAnimation((current) =>
                transition(current, "idle", performance.now()),
              ),
            1200,
          ),
        );
      }, 300),
    );
    setText("");
    input.current?.focus();
  }
  return (
    <main
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
      className={
        open ? `stage expanded${managing ? " managing" : ""}` : "stage"
      }
    >
      {open && (
        <section ref={bubble} className="bubble" aria-label="DigiPet chat">
          <header>
            <span>
              DigiPet <small>M1</small>
            </span>
            <button aria-label="Close chat" onClick={() => setOpen(false)}>
              ×
            </button>
          </header>
          <div className="actions">
            <button onClick={() => setManaging((value) => !value)}>
              {managing ? "Chat / 聊天" : "Appearance / 外觀"}
            </button>
          </div>
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
            <button type="submit" aria-label="Send message">
              ↑
            </button>
          </form>
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
