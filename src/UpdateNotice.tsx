import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface ReleaseNotice { version: string; tag: string; url: string }

export function useUpdateNotice(desktop: boolean) {
  const [release, setRelease] = useState<ReleaseNotice | null>(null);
  const [checking, setChecking] = useState(false);
  async function check() {
    if (!desktop || checking) return;
    setChecking(true);
    try {
      setRelease(await invoke<ReleaseNotice | null>("check_for_update") ?? null);
    } catch {
      // Offline and metadata failures stay silent; never retry automatically.
    } finally {
      setChecking(false);
    }
  }
  return { release, check, checking, dismiss: () => setRelease(null) };
}

export default function UpdateNotice({ release, dismiss }: ReturnType<typeof useUpdateNotice>) {
  if (!release) return null;
  return (
    <aside aria-label="Update notice">
      <p>DigiPet {release.version} — Update available / 有新版本</p>
      <p>Unsigned / Unverified Publisher · 未簽署／未驗證發行者</p>
      <a href={release.url} onClick={(event) => {
        event.preventDefault();
        void invoke("open_release_page", { tag: release.tag }).catch(() => {});
      }}>View release &amp; download manually / 查看版本並手動下載</a>
      <p>Verify SHA256SUMS before installing. / 安裝前請核對 SHA256SUMS。</p>
      <button onClick={dismiss}>Dismiss update / 關閉更新提示</button>
    </aside>
  );
}
