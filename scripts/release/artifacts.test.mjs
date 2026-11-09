import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collect, combine, verify, installers } from "./artifacts.mjs";

test("downloaded manifests require every installer and reject tampering, duplicates and extras", () => {
  const root = mkdtempSync(join(tmpdir(), "digipet-checksums-"));
  try {
    const bundle = join(root, "bundle");
    for (const [folder, file] of [["nsis", "setup.exe"], ["deb", "pet.deb"], ["appimage", "pet.AppImage"]]) {
      mkdirSync(join(bundle, folder), { recursive: true });
      writeFileSync(join(bundle, folder, file), `CI fixture ${folder}`);
    }
    for (const platform of Object.keys(installers)) collect(platform, bundle, join(root, `DigiPet-${platform}-x64-unsigned`));
    const output = join(root, "all");
    combine(root, output);
    const sums = readFileSync(join(output, "SHA256SUMS"), "utf8");
    assert.equal(sums.trim().split("\n").length, 3);
    writeFileSync(join(output, "SHA256SUMS"), sums.split("\n").slice(1).join("\n"));
    assert.throws(() => verify(output), /Incomplete/);
    writeFileSync(join(output, "SHA256SUMS"), sums + sums.split("\n")[0] + "\n");
    assert.throws(() => verify(output), /Invalid/);
    writeFileSync(join(output, "SHA256SUMS"), sums);
    writeFileSync(join(output, "extra.exe"), "unexpected");
    assert.throws(() => verify(output), /Unexpected/);
    rmSync(join(output, "extra.exe"));
    writeFileSync(join(output, installers.windows[0]), "tampered after download");
    assert.throws(() => verify(output), /Checksum mismatch/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
