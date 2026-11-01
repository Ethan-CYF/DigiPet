import { useEffect, useMemo, useRef, useState } from "react";
import {
  cropPng,
  readPng,
  validateSheet,
  type Appearance,
  type CropRegion,
  type Library,
} from "./modules/pet-upload";
import Sprite from "./Sprite";
import type { AnimationState } from "./animation";
const example = JSON.stringify(
  { version: 1, columns: 1, rows: 1, fps: 8, states: { idle: [0] } },
  null,
  2,
);
export default function AppearanceManager({
  library,
  commit,
  invalid,
  animation,
}: {
  library: Library;
  commit: (library: Library) => boolean;
  invalid: (error: string) => void;
  animation: AnimationState;
}) {
  const [image, setImage] = useState<HTMLImageElement>();
  const [name, setName] = useState("My pet");
  const [crop, setCrop] = useState<CropRegion>({
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  });
  const [mode, setMode] = useState("single");
  const [config, setConfig] = useState(example);
  const [error, setError] = useState("");
  const request = useRef(0);
  const configRequest = useRef(0);
  useEffect(
    () => () => {
      request.current++;
      configRequest.current++;
    },
    [],
  );
  const preview = useMemo(() => {
    try {
      if (!image) return {};
      if (config.length > 32768) throw Error("JSON ≤ 32 KiB");
      const sheet =
        mode === "sheet"
          ? validateSheet(
              JSON.parse(config),
              image.naturalWidth,
              image.naturalHeight,
            )
          : undefined;
      const png = cropPng(
        image,
        sheet
          ? {
              x: 0,
              y: 0,
              width: image.naturalWidth,
              height: image.naturalHeight,
            }
          : crop,
        !!sheet,
      );
      return { png, sheet };
    } catch (e) {
      return { error: String(e) };
    }
  }, [image, mode, config, crop]);
  const candidate: Appearance | undefined = useMemo(
    () =>
      preview.png
        ? {
            id: "preview",
            name: name.trim() || "My pet",
            png: preview.png,
            ...(preview.sheet ? { sheet: preview.sheet } : {}),
          }
        : undefined,
    [preview, name],
  );
  const validationError = preview.error;
  async function upload(file?: File) {
    const ticket = ++request.current;
    setImage(undefined);
    setError("");
    if (!file) return;
    try {
      const img = await readPng(file);
      if (ticket !== request.current) return;
      setCrop({
        x: 0,
        y: 0,
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
      setName(file.name.replace(/\.png$/i, "").slice(0, 60) || "My pet");
      setImage(img);
    } catch (e) {
      if (ticket === request.current) {
        setError(String(e));
        invalid(String(e));
      }
    }
  }
  return (
    <div className="appearance-manager" aria-label="Appearance Manager">
      <h2>外觀 / Appearance</h2>
      <p>本機限定 / Local only · 最多 8 個 / Up to 8</p>
      <label>
        目前外觀 / Current
        <select
          aria-label="Current appearance"
          value={library.selected}
          onChange={(e) => commit({ ...library, selected: e.target.value })}
        >
          <option value="default">DigiPet default / 預設</option>
          {library.appearances.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <div className="actions">
        <button onClick={() => commit({ ...library, selected: "default" })}>
          Restore default / 還原
        </button>
        <button
          disabled={library.selected === "default"}
          onClick={() =>
            commit({
              appearances: library.appearances.filter(
                (a) => a.id !== library.selected,
              ),
              selected: "default",
            })
          }
        >
          Delete / 刪除
        </button>
      </div>
      <p>
        上傳提示 / Prompt tips: 單一角色、透明背景、四周留白、無文字。One
        centered character, transparent background, padding, no text. PNG ≤ 2
        MiB, ≤ 2048×2048. 不產生圖片 / No image generation.
      </p>
      <label>
        PNG
        <input
          aria-label="Import PNG"
          type="file"
          accept="image/png,.png"
          onChange={(e) => void upload(e.target.files?.[0])}
        />
      </label>
      <label>
        類型 / Type
        <select
          aria-label="Import type"
          value={mode}
          onChange={(e) => setMode(e.target.value)}
        >
          <option value="single">Single image / 單圖動作</option>
          <option value="sheet">Sprite sheet / 等格影格</option>
        </select>
      </label>
      {image && (
        <>
          <label>
            名稱 / Name
            <input
              aria-label="Appearance name"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          {mode === "single" ? (
            <>
              <img
                className="source-preview"
                src={image.src}
                alt="Original PNG / 原圖"
              />
              <fieldset>
                <legend>裁切 / Crop (source pixels)</legend>
                {(["x", "y", "width", "height"] as const).map((key) => (
                  <label key={key}>
                    {key}
                    <input
                      aria-label={`Crop ${key}`}
                      type="number"
                      min={key === "x" || key === "y" ? 0 : 1}
                      max={
                        key === "x" || key === "width"
                          ? image.naturalWidth
                          : image.naturalHeight
                      }
                      value={crop[key]}
                      onChange={(e) =>
                        setCrop({ ...crop, [key]: Number(e.target.value) })
                      }
                    />
                  </label>
                ))}
              </fieldset>
            </>
          ) : (
            <>
              <p>
                選擇 PNG + JSON；影格從 0 起由左至右、上至下。Select PNG + JSON;
                row-major, zero-based frames. Missing states → idle.
              </p>
              <label>
                JSON
                <input
                  aria-label="Import sheet JSON"
                  type="file"
                  accept="application/json,.json"
                  onChange={async (e) => {
                    const ticket = ++configRequest.current;
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setConfig("");
                    if (f.size > 32768) {
                      setError("JSON ≤ 32 KiB");
                      return;
                    }
                    try {
                      const text = await f.text();
                      if (ticket === configRequest.current) {
                        setConfig(text);
                        setError("");
                      }
                    } catch (e) {
                      if (ticket === configRequest.current) setError(String(e));
                    }
                  }}
                />
              </label>
              <textarea
                aria-label="Sheet configuration"
                maxLength={32768}
                value={config}
                onChange={(e) => {
                  configRequest.current++;
                  setConfig(e.target.value);
                  setError("");
                }}
              />
            </>
          )}
          {candidate && (
            <div className="preview">
              <Sprite
                appearance={candidate}
                animation={animation}
                onError={() => {
                  setImage(undefined);
                  invalid("Preview decode failed");
                }}
              />
              <span>預覽 / Preview · {animation.state}</span>
            </div>
          )}
          <button
            disabled={!candidate || !name.trim()}
            onClick={() => {
              const id = crypto.randomUUID();
              if (
                candidate &&
                commit({
                  appearances: [...library.appearances, { ...candidate, id }],
                  selected: id,
                })
              ) {
                setImage(undefined);
                setError("Saved and selected / 已儲存並套用");
              }
            }}
          >
            Save appearance / 儲存外觀
          </button>
        </>
      )}
      {(error || validationError) && (
        <p role="alert" className="error">
          {error || validationError}
        </p>
      )}
    </div>
  );
}
