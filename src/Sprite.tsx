import { useEffect, useRef } from "react";
import { frameAt, motion, type AnimationState } from "./animation";
import { decodePng, type Appearance } from "./modules/pet-upload";
import { palette, pixels, type HitRect } from "./pet";

export function alphaRegions(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  bounds: HitRect,
): HitRect[] {
  const result: HitRect[] = [];
  for (let y = 0; y < height; y++) {
    let start = -1;
    for (let x = 0; x <= width; x++) {
      const hit = x < width && data[(y * width + x) * 4 + 3] > 8;
      if (hit && start < 0) start = x;
      if (!hit && start >= 0) {
        result.push({
          x: bounds.x + (start * bounds.width) / width,
          y: bounds.y + (y * bounds.height) / height,
          width: ((x - start) * bounds.width) / width,
          height: bounds.height / height,
        });
        start = -1;
      }
    }
  }
  return result;
}
export default function Sprite({
  appearance,
  animation,
  onError,
}: {
  appearance?: Appearance;
  animation: AnimationState;
  onError: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const fail = useRef(onError);
  fail.current = onError;
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    let disposed = false,
      timer = 0;
    const reduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    async function start() {
      let source: CanvasImageSource;
      let width = 16,
        height = 16;
      if (appearance) {
        const image = await decodePng(appearance.png);
        width = image.naturalWidth;
        height = image.naturalHeight;
        source = image;
      } else {
        const image = document.createElement("canvas");
        image.width = 16;
        image.height = 16;
        const brush = image.getContext("2d")!;
        pixels.forEach((row, y) =>
          [...row].forEach((c, x) => {
            if (c !== ".") {
              brush.fillStyle = palette[c];
              brush.fillRect(x, y, 1, 1);
            }
          }),
        );
        source = image;
      }
      if (disposed) return;
      const draw = () => {
        const elapsed = performance.now() - animation.since;
        const m = motion(animation.state, reduced ? 0 : elapsed);
        const sheet = appearance?.sheet;
        const columns = sheet?.columns ?? 1,
          rows = sheet?.rows ?? 1;
        const frame = sheet
          ? frameAt(sheet.states, animation.state, elapsed, sheet.fps)
          : 0;
        const sw = width / columns,
          sh = height / rows;
        const size = 104 / Math.max(sw, sh);
        // Sheet animation comes only from frames; single images use procedural motion.
        const transform = sheet ? { x: 0, y: 0, sx: 1, sy: 1 } : m;
        const dw = sw * size * transform.sx,
          dh = sh * size * transform.sy;
        ctx!.clearRect(0, 0, 128, 128);
        ctx!.imageSmoothingEnabled = !!appearance;
        ctx!.drawImage(
          source,
          (frame % columns) * sw,
          Math.floor(frame / columns) * sh,
          sw,
          sh,
          (128 - dw) / 2 + transform.x,
          116 - dh + transform.y,
          dw,
          dh,
        );
        timer = window.setTimeout(draw, 1000 / 30);
      };
      draw();
    }
    void start().catch(() => {
      if (!disposed) fail.current();
    });
    return () => {
      disposed = true;
      clearTimeout(timer);
      ctx.clearRect(0, 0, 128, 128);
    };
  }, [appearance, animation]);
  return (
    <canvas
      ref={canvas}
      width={128}
      height={128}
      aria-hidden="true"
      data-state={animation.state}
    />
  );
}
