// Repository hygiene check. Reports paths/codes only, never matched credentials.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const patterns = [
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["provider-key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/],
  ["github-token", /\bgh[pousr]_[A-Za-z0-9]{30,}/],
];
let failed = false;
for (const path of execFileSync("git", ["ls-files", "-z"], {encoding:"utf8"}).split("\0").filter(Boolean)) {
  if (/\.(png|ico|jpg|webp|lock)$/.test(path)) continue;
  const text = readFileSync(path, "utf8");
  for (const [code, pattern] of patterns) if (pattern.test(text)) {
    console.error(`${path}: ${code}`); failed = true;
  }
}
if (failed) process.exitCode = 1;
else console.log("Repository credential-pattern scan passed (no matched values logged).");
