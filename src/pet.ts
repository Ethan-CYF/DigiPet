// Original 16×16 placeholder sprite; '.' is transparent. Shared with alpha hit-testing.
export const pixels = [
  "................",
  "...OO......OO...",
  "...OPO....OPO...",
  "...OPPOOOOPPO...",
  "..OPPPPPPPPPPO..",
  "..OPPPPPPPPPPO..",
  "..OPPOPPPPOPPO..",
  "..OPPPPPPPPPPO..",
  "..OPPPRPPRPPPO..",
  "...OPPPPPPPPO...",
  "....OOOOOOOO....",
  "...OPPPPPPPPO...",
  "..OPPPPPPPPPPO..",
  "..OPPPPPPPPPPO..",
  "...OOO..OOO.....",
  "................",
];
export const palette: Record<string, string> = {
  O: "#29243d",
  P: "#c3b4fa",
  R: "#f58db2",
};
export function opaqueAt(x: number, y: number): boolean {
  return (pixels[Math.floor(y)]?.[Math.floor(x)] ?? ".") !== ".";
}

export interface HitRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
/** Opaque row runs follow the animated SVG's current CSS bounds. */
export function hitRegions(bounds: HitRect): HitRect[] {
  const regions: HitRect[] = [];
  pixels.forEach((row, y) => {
    let start = -1;
    for (let x = 0; x <= 16; x++) {
      const opaque = x < 16 && row[x] !== ".";
      if (opaque && start < 0) start = x;
      if (!opaque && start >= 0) {
        regions.push({
          x: bounds.x + (start * bounds.width) / 16,
          y: bounds.y + (y * bounds.height) / 16,
          width: ((x - start) * bounds.width) / 16,
          height: bounds.height / 16,
        });
        start = -1;
      }
    }
  });
  return regions;
}
