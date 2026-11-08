// Stable filenames and strict manifests: every installer is included, extras/missing files fail.
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
export const installers = {
  windows: ["DigiPet-Setup-windows-x64.exe"],
  linux: ["DigiPet-linux-x64.AppImage", "DigiPet-linux-x64.deb"],
};
const hash = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const allNames = () => Object.values(installers).flat().sort();
export function manifest(directory, names = allNames()) {
  writeFileSync(join(directory, "SHA256SUMS"), [...names].sort().map((name) => `${hash(join(directory, name))}  ${name}\n`).join(""));
}
export function verify(directory, platform) {
  const expected = (platform ? installers[platform] : allNames())?.slice().sort();
  if (!expected) throw new Error("Unknown platform");
  const entries = readFileSync(join(directory, "SHA256SUMS"), "utf8").trimEnd().split("\n");
  const names = [];
  for (const entry of entries) {
    const match = /^([a-f0-9]{64})  (DigiPet-[A-Za-z0-9.-]+)$/.exec(entry);
    if (!match || !expected.includes(match[2]) || names.includes(match[2])) throw new Error("Invalid checksum manifest");
    if (hash(join(directory, match[2])) !== match[1]) throw new Error(`Checksum mismatch: ${match[2]}`);
    names.push(match[2]);
  }
  if (JSON.stringify(names.sort()) !== JSON.stringify(expected)) throw new Error("Incomplete checksum manifest");
  const files = readdirSync(directory).sort();
  if (JSON.stringify(files) !== JSON.stringify([...expected, "SHA256SUMS"].sort())) throw new Error("Unexpected artifact files");
  console.log(`SHA256SUMS verified: ${names.join(", ")}`);
}
export function collect(platform, bundle, destination) {
  const kinds = platform === "windows" ? [["nsis", ".exe"]] : platform === "linux" ? [["appimage", ".AppImage"], ["deb", ".deb"]] : [];
  if (!kinds.length) throw new Error("Unknown platform");
  mkdirSync(destination, { recursive: true });
  for (const [index, [folder, extension]] of kinds.entries()) {
    const candidates = readdirSync(join(bundle, folder)).filter((file) => file.endsWith(extension));
    if (candidates.length !== 1) throw new Error(`Expected exactly one ${extension} installer`);
    copyFileSync(join(bundle, folder, candidates[0]), join(destination, installers[platform][index]));
  }
  manifest(destination, installers[platform]);
  verify(destination, platform);
}
export function combine(source, destination) {
  mkdirSync(destination, { recursive: true });
  for (const platform of Object.keys(installers)) {
    const directory = join(source, `DigiPet-${platform}-x64-unsigned`);
    verify(directory, platform);
    for (const name of installers[platform]) copyFileSync(join(directory, name), join(destination, name));
  }
  manifest(destination);
  verify(destination);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2);
  if (command === "collect") collect(...args);
  else if (command === "verify") verify(...args);
  else if (command === "combine") combine(...args);
  else throw new Error(`Unknown artifact command: ${basename(command ?? "")}`);
}
