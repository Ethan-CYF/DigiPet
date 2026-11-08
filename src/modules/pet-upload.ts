import { reportRecovery, resetStorageComponent } from "./recovery";
/** Local, data-only appearance pipeline. No paths, URLs, scripts or native FS access. */
import type { PetState } from "../animation";
import { STATES } from "../animation";
export interface CropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface SheetConfig {
  version: 1;
  columns: number;
  rows: number;
  fps: number;
  states: Partial<Record<PetState, number[]>> & { idle: number[] };
}
export interface Appearance {
  id: string;
  name: string;
  png: string;
  sheet?: SheetConfig;
}
export const MAX_BYTES = 2 * 1024 * 1024;
export const MAX_SIDE = 2048;
const KEY = "digipet.appearances.v1";
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Expected an object / 需要物件");
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some((k) => !allowed.includes(k)))
    throw Error("Unknown pack fields / 不支援的素材欄位");
}
function integer(value: unknown, min: number, max: number): value is number {
  return (
    Number.isInteger(value) &&
    (value as number) >= min &&
    (value as number) <= max
  );
}
export function validateSheet(
  value: unknown,
  width: number,
  height: number,
): SheetConfig {
  const c = object(value);
  keys(c, ["version", "columns", "rows", "fps", "states"]);
  if (
    !integer(width, 1, MAX_SIDE) ||
    !integer(height, 1, MAX_SIDE) ||
    c.version !== 1 ||
    !integer(c.columns, 1, 32) ||
    !integer(c.rows, 1, 32) ||
    typeof c.fps !== "number" ||
    !Number.isFinite(c.fps) ||
    c.fps < 1 ||
    c.fps > 30 ||
    width % c.columns ||
    height % c.rows ||
    c.columns * c.rows > 256
  )
    throw Error("Invalid equal-cell grid / 無效等格設定");
  const states = object(c.states);
  keys(states, [...STATES]);
  if (!Object.hasOwn(states, "idle"))
    throw Error("idle frames required / 需要 idle 影格");
  const result: SheetConfig["states"] = { idle: [] };
  for (const state of STATES) {
    if (!Object.hasOwn(states, state)) continue;
    const frames = states[state];
    if (
      !Array.isArray(frames) ||
      (state === "idle" && !frames.length) ||
      frames.length > 256 ||
      !frames.every((f) =>
        integer(f, 0, (c.columns as number) * (c.rows as number) - 1),
      )
    )
      throw Error("Invalid frames / 無效影格");
    if (frames.length) result[state] = [...frames];
  }
  return {
    version: 1,
    columns: c.columns,
    rows: c.rows,
    fps: c.fps,
    states: result,
  };
}
export function inspectPng(bytes: Uint8Array): {
  width: number;
  height: number;
} {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (
    bytes.length > MAX_BYTES ||
    bytes.length < 33 ||
    !signature.every((v, i) => bytes[i] === v) ||
    String.fromCharCode(...bytes.slice(12, 16)) !== "IHDR"
  )
    throw Error("Use a PNG ≤ 2 MiB / 請選擇 2 MiB 以下 PNG");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16),
    height = view.getUint32(20);
  if (!integer(width, 1, MAX_SIDE) || !integer(height, 1, MAX_SIDE))
    throw Error("PNG dimensions must be 1–2048 / PNG 邊長需為 1–2048");
  // Animated PNGs are outside this format; each animation is controlled by our state machine.
  if (
    view.getUint32(8) !== 13 ||
    bytes[26] !== 0 ||
    bytes[27] !== 0 ||
    bytes[28] > 1
  )
    throw Error("Invalid PNG header / 無效 PNG 標頭");
  const validDepths: Record<number, number[]> = {
    0: [1, 2, 4, 8, 16],
    2: [8, 16],
    3: [1, 2, 4, 8],
    4: [8, 16],
    6: [8, 16],
  };
  if (!validDepths[bytes[25]]?.includes(bytes[24]))
    throw Error("Invalid PNG pixels / 無效像素格式");
  let offset = 8,
    chunks = 0,
    data = false,
    endedData = false,
    palette = false;
  while (offset + 12 <= bytes.length) {
    const size = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
    if (size > bytes.length - offset - 12 || type === "acTL")
      throw Error("Invalid or animated PNG / 無效或動態 PNG");
    if (++chunks > 4096 || !/^[A-Za-z]{4}$/.test(type))
      throw Error("Invalid PNG chunks / 無效 PNG 區塊");
    let crc = 0xffffffff;
    for (let i = offset + 4; i < offset + 8 + size; i++) {
      crc ^= bytes[i];
      for (let bit = 0; bit < 8; bit++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    if ((crc ^ 0xffffffff) >>> 0 !== view.getUint32(offset + 8 + size))
      throw Error("PNG checksum failed / PNG 校驗失敗");
    if (
      (type === "IHDR" && offset !== 8) ||
      (!["IHDR", "PLTE", "IDAT", "IEND"].includes(type) &&
        type[0] === type[0].toUpperCase()) ||
      ["iCCP", "zTXt", "iTXt"].includes(type)
    )
      throw Error("Unsupported PNG chunk / 不支援的 PNG 區塊");
    if (type === "PLTE") {
      if (palette || data || !size || size > 768 || size % 3)
        throw Error("Invalid PNG palette");
      palette = true;
    }
    if (type === "IDAT") {
      if (endedData || (bytes[25] === 3 && !palette))
        throw Error("Invalid PNG data order");
      data = true;
    } else if (data) endedData = true;
    offset += size + 12;
    if (type === "IEND") {
      if (!data || size !== 0 || offset !== bytes.length)
        throw Error("Unexpected PNG trailing data");
      return { width, height };
    }
  }
  throw Error("Incomplete PNG / 不完整 PNG");
}
export function decodePng(png: string): Promise<HTMLImageElement> {
  try {
    if (
      !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(png) ||
      png.length > MAX_BYTES * 1.4
    )
      throw Error("Invalid PNG / 無效 PNG");
    inspectPng(Uint8Array.from(atob(png.slice(22)), (c) => c.charCodeAt(0)));
  } catch {
    return Promise.reject(Error("Invalid PNG / 無效 PNG"));
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = async () => {
      try {
        if (typeof img.decode === "function") await img.decode();
        if (
          img.naturalWidth < 1 ||
          img.naturalHeight < 1 ||
          img.naturalWidth > MAX_SIDE ||
          img.naturalHeight > MAX_SIDE
        )
          throw Error("PNG dimensions exceeded / PNG 尺寸超限");
        // A nominally loaded but empty/corrupted bitmap must not hide the pet.
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw Error("Canvas unavailable");
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let visible = false;
        for (let i = 3; i < data.length; i += 4)
          if (data[i] > 8) {
            visible = true;
            break;
          }
        if (!visible)
          throw Error("PNG has no visible pixels / PNG 沒有可見像素");
        resolve(img);
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(Error("PNG decode failed / PNG 解碼失敗"));
    img.src = png;
  });
}
export async function readPng(file: File): Promise<HTMLImageElement> {
  if (file.size > MAX_BYTES) throw Error("PNG exceeds 2 MiB / PNG 超過 2 MiB");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const dimensions = inspectPng(bytes);
  const png = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(Error("Cannot read PNG"));
    reader.readAsDataURL(new Blob([bytes], { type: "image/png" }));
  });
  const img = await decodePng(png);
  if (
    img.naturalWidth !== dimensions.width ||
    img.naturalHeight !== dimensions.height
  )
    throw Error("PNG size mismatch");
  return img;
}
export function cropPng(
  img: HTMLImageElement,
  crop: CropRegion,
  sheet = false,
): string {
  const { x, y, width, height } = crop;
  if (
    ![x, y, width, height].every(Number.isInteger) ||
    x < 0 ||
    y < 0 ||
    width < 1 ||
    height < 1 ||
    x + width > img.naturalWidth ||
    y + height > img.naturalHeight
  )
    throw Error("Crop outside image / 裁切超出圖片");
  const canvas = document.createElement("canvas");
  const scale = sheet ? 1 : Math.min(1, 256 / Math.max(width, height));
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw Error("Canvas unavailable");
  ctx.drawImage(img, x, y, width, height, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let visible = false;
  for (let i = 3; i < data.length; i += 4)
    if (data[i] > 8) {
      visible = true;
      break;
    }
  if (!visible) throw Error("Crop has no visible pixels / 裁切內沒有可見像素");
  const png = canvas.toDataURL("image/png");
  if (png.length > 22 + 4 * Math.ceil(MAX_BYTES / 3))
    throw Error("Normalized PNG exceeds 2 MiB / 轉存 PNG 超過 2 MiB");
  return png;
}
export function validateAppearance(value: unknown): Appearance {
  const a = object(value);
  keys(a, ["id", "name", "png", "sheet"]);
  if (
    typeof a.id !== "string" ||
    !/^[a-zA-Z0-9-]{1,80}$/.test(a.id) ||
    a.id === "default" ||
    typeof a.name !== "string" ||
    !a.name.trim() ||
    a.name.length > 60 ||
    typeof a.png !== "string" ||
    !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(a.png) ||
    a.png.length > MAX_BYTES * 1.4
  )
    throw Error("Invalid saved appearance");
  const bytes = Uint8Array.from(atob(a.png.slice(22)), (c) => c.charCodeAt(0));
  const { width, height } = inspectPng(bytes);
  return {
    id: a.id,
    name: a.name,
    png: a.png,
    ...(a.sheet ? { sheet: validateSheet(a.sheet, width, height) } : {}),
  };
}
export interface Library {
  appearances: Appearance[];
  selected: string;
}
export function loadLibrary(): Library {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { appearances: [], selected: "default" };
    if (raw.length > 4_500_000) throw Error("Library too large");
    const data = object(JSON.parse(raw));
    if (!Array.isArray(data.appearances) || data.appearances.length > 8)
      throw Error("Invalid library");
    const appearances = data.appearances.map(validateAppearance);
    if (new Set(appearances.map((a) => a.id)).size !== appearances.length)
      throw Error("Duplicate appearance");
    return {
      appearances,
      selected: appearances.some((a) => a.id === data.selected)
        ? String(data.selected)
        : "default",
    };
  } catch {
    reportRecovery(KEY);
    return { appearances: [], selected: "default" };
  }
}
export function saveLibrary(library: Library) {
  if (library.appearances.length > 8)
    throw Error("Maximum 8 appearances / 最多 8 個外觀");
  library.appearances.forEach(validateAppearance);
  const json = JSON.stringify(library);
  if (json.length > 4_500_000)
    throw Error("Local library full / 本機外觀庫已滿");
  localStorage.setItem(KEY, json); // Caller keeps old state if storage is full or denied.
}

export async function repairLibrary() {
  let appearances: Appearance[] = [];
  let selected = "default";
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (Array.isArray(value?.appearances)) {
      for (const row of value.appearances.slice(0, 8)) {
        try {
          const valid = validateAppearance(row);
          await decodePng(valid.png);
          if (!appearances.some((a) => a.id === valid.id))
            appearances.push(valid);
        } catch {
          /* Only malformed entries are removed after backup. */
        }
      }
      if (appearances.some((a) => a.id === value.selected))
        selected = value.selected;
    }
  } catch {
    /* Unparseable library is preserved in the backup. */
  }
  resetStorageComponent(KEY, JSON.stringify({ appearances, selected }));
}
