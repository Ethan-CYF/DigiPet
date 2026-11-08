import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installers, verify } from "./artifacts.mjs";

// Only invoked by the tag-event job. All writes remain draft-only, including reruns.
export async function prepareDraft({ github, context, directory, sourceSha }) {
  if (context.eventName !== "push" || !context.ref.startsWith("refs/tags/v")) throw new Error("Existing tag push required");
  const tag = context.ref.slice("refs/tags/".length);
  const { version } = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
  if (tag !== `v${version}`) throw new Error("Tag must match the unchanged application version");
  verify(directory);
  const repo = context.repo;
  // Never ask GitHub to synthesize a tag: require an existing ref at the built source.
  let object = (await github.rest.git.getRef({ ...repo, ref: `tags/${tag}` })).data.object;
  for (let depth = 0; object.type === "tag" && depth < 5; depth++) {
    object = (await github.rest.git.getTag({ ...repo, tag_sha: object.sha })).data.object;
  }
  if (object.type !== "commit" || object.sha !== sourceSha) throw new Error("Existing tag does not identify the built commit");
  const releases = await github.paginate(github.rest.repos.listReleases, { ...repo, per_page: 100 });
  let release = releases.find((item) => item.tag_name === tag);
  if (release && !release.draft) throw new Error("Refusing to modify a published release");
  if (!release) {
    const body = readFileSync("docs/release-notes-template.md", "utf8")
      .replaceAll("{{VERSION}}", version).replaceAll("{{SOURCE_SHA}}", sourceSha);
    release = (await github.rest.repos.createRelease({ ...repo, tag_name: tag,
      name: `DigiPet ${version} — Unsigned / Unverified Publisher`, body,
      draft: true, prerelease: false, make_latest: "false" })).data;
  }
  const release_id = release.id;
  async function requireDraft() {
    if (!(await github.rest.repos.getRelease({ ...repo, release_id })).data.draft) throw new Error("Release is no longer a draft; stopping");
  }
  const files = [...Object.values(installers).flat(), "SHA256SUMS"].sort();
  const assets = await github.paginate(github.rest.repos.listReleaseAssets, { ...repo, release_id, per_page: 100 });
  const downloaded = mkdtempSync(join(tmpdir(), "digipet-release-verify-"));
  try {
    for (const name of files) {
      for (const old of assets.filter((item) => item.name === name)) {
        await requireDraft();
        await github.rest.repos.deleteReleaseAsset({ ...repo, asset_id: old.id });
      }
      await requireDraft();
      const data = readFileSync(join(directory, name));
      const asset = (await github.rest.repos.uploadReleaseAsset({ ...repo, release_id, name, data,
        headers: { "content-type": "application/octet-stream", "content-length": data.length } })).data;
      const response = await github.rest.repos.getReleaseAsset({ ...repo, asset_id: asset.id,
        headers: { accept: "application/octet-stream" } });
      writeFileSync(join(downloaded, name), Buffer.from(response.data));
    }
    verify(downloaded);
    await requireDraft();
    return release.html_url;
  } finally { rmSync(downloaded, { recursive: true, force: true }); }
}
