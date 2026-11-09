import {
  useEffect,
  useLayoutEffect,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { invoke } from "@tauri-apps/api/core";

type Limits = { width: number; height: number };
function browserLimits(desktop: boolean): Limits {
  // Browser previews use their viewport; native windows query the pet's monitor.
  const width = desktop
    ? Math.min(screen.availWidth || 1280, Math.max(innerWidth, 1040))
    : innerWidth;
  const height = desktop
    ? Math.min(screen.availHeight || 960, Math.max(innerHeight, 960))
    : innerHeight;
  return {
    width: Math.max(200, width - 16),
    height: Math.max(160, Math.min(960, height - 232)),
  };
}

export function useSecondaryLayout(
  visible: boolean,
  desktop: boolean,
  preferredWidth: number,
  panel: RefObject<HTMLElement | null>,
) {
  const [limits, setLimits] = useState(() => browserLimits(desktop));
  const [measurement, setMeasurement] = useState({ height: 240, header: 96 });
  useEffect(() => {
    if (!visible) return;
    let disposed = false;
    const update = async () => {
      let next = browserLimits(desktop);
      if (desktop) {
        try {
          const native = await invoke<Limits>("get_pet_surface_limits");
          if (
            native &&
            Number.isFinite(native.width) &&
            Number.isFinite(native.height)
          )
            next = native;
        } catch {
          /* Keep the screen-based fallback on unsupported compositors. */
        }
      }
      if (!disposed)
        setLimits((old) =>
          old.width === next.width && old.height === next.height ? old : next,
        );
    };
    void update();
    window.addEventListener("resize", update);
    return () => {
      disposed = true;
      window.removeEventListener("resize", update);
    };
  }, [visible, desktop]);
  useLayoutEffect(() => {
    if (!visible || !panel.current) return;
    const measure = () => {
      const next = Math.ceil(
        panel.current?.getBoundingClientRect().height ?? 0,
      );
      const header = Math.ceil(
        panel.current
          ?.querySelector(".secondary-header")
          ?.getBoundingClientRect().height ?? 96,
      );
      if (next > 0)
        setMeasurement((old) =>
          old.height === next && old.header === header
            ? old
            : { height: next, header },
        );
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(panel.current);
    const header = panel.current.querySelector(".secondary-header");
    if (header) observer.observe(header);
    return () => observer.disconnect();
  }, [visible, panel, preferredWidth, limits.width, limits.height]);
  const width = Math.min(preferredWidth, limits.width);
  return {
    width: width + 16,
    height: measurement.height + 224,
    style: {
      "--surface-width": `${width}px`,
      "--surface-max-height": `${limits.height}px`,
      "--surface-header-height": `${measurement.header}px`,
      "--surface-window-width": `${width + 16}px`,
      "--surface-window-height": `${measurement.height + 224}px`,
    } as CSSProperties,
  };
}
