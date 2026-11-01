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
import { hitRegions, palette, pixels } from "./pet";
import { stubReply } from "./modules/ai-router";

export default function App() {
  const desktop = isTauri();
  const [open, setOpen] = useState(false);
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
    ];
    return () => {
      void Promise.all(subscriptions).then((stops) =>
        stops.forEach((stop) => stop()),
      );
    };
  }, []);

  useEffect(() => {
    if (open) input.current?.focus();
    if (!desktop) return;
    // Keep the pet anchored at the same screen location when the bubble expands upward.
    const win = getCurrentWindow();
    let disposed = false;
    const publish = async () => {
      const sprite = pet.current?.querySelector("svg")?.getBoundingClientRect();
      const rectangles = sprite ? hitRegions(sprite) : [];
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
      await invoke("resize_pet", { expanded: open });
      if (!disposed) await publish();
    })().catch((e) => setError(String(e)));
    const timer = window.setInterval(() => {
      void publish().catch((e) => setError(String(e)));
    }, 100);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [open]);

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
      if (desktop)
        await getCurrentWindow()
          .startDragging()
          .catch((e) => setError(String(e)));
    }
  }
  function mouseUp(event: MouseEvent<HTMLButtonElement>) {
    const start = gesture.current;
    gesture.current = null;
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
    setReply(stubReply(message));
    setText("");
    input.current?.focus();
  }
  return (
    <main
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
      className={open ? "stage expanded" : "stage"}
    >
      {open && (
        <section ref={bubble} className="bubble" aria-label="DigiPet chat">
          <header>
            <span>
              DigiPet <small>M0</small>
            </span>
            <button aria-label="Close chat" onClick={() => setOpen(false)}>
              ×
            </button>
          </header>
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
        <svg viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden="true">
          {pixels.flatMap((row, y) =>
            [...row].flatMap((color, x) =>
              color === "." ? (
                []
              ) : (
                <rect
                  key={`${x}-${y}`}
                  x={x}
                  y={y}
                  width="1"
                  height="1"
                  fill={palette[color]}
                />
              ),
            ),
          )}
        </svg>
      </button>
    </main>
  );
}
