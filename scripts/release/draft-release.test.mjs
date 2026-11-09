import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareDraft } from "./draft-release.mjs";
import { installers, manifest } from "./artifacts.mjs";

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "digipet-draft-test-"));
  for (const name of Object.values(installers).flat()) writeFileSync(join(directory, name), `CI fixture ${name}`);
  manifest(directory);
  const state = { release: null, assets: [], nextId: 1, writes: [], tagSha: "source", publishedDuringUpload: false };
  const repos = {
    listReleases: async () => state.release ? [state.release] : [],
    listReleaseAssets: async () => state.assets,
    getRelease: async () => ({ data: state.release }),
    createRelease: async (args) => {
      assert.equal(args.draft, true);
      assert.equal(args.make_latest, "false");
      assert.equal(args.tag_name, "v0.1.0");
      assert.match(args.body, /Unsigned \/ Unverified Publisher/);
      state.writes.push("create draft");
      return { data: state.release = { id: 1, tag_name: args.tag_name, draft: true, html_url: "draft-url" } };
    },
    deleteReleaseAsset: async ({ asset_id }) => {
      assert.equal(state.release.draft, true);
      state.assets = state.assets.filter((item) => item.id !== asset_id);
      state.writes.push("delete asset");
    },
    uploadReleaseAsset: async ({ name, data }) => {
      assert.equal(state.release.draft, true);
      const asset = { id: state.nextId++, name, data };
      state.assets.push(asset);
      state.writes.push("upload asset");
      if (state.publishedDuringUpload) state.release.draft = false;
      return { data: asset };
    },
    getReleaseAsset: async ({ asset_id }) => ({ data: state.assets.find((item) => item.id === asset_id).data }),
  };
  const github = { rest: { repos, git: { getRef: async () => ({ data: { object: { type: "commit", sha: state.tagSha } } }) } }, paginate: async (method, args) => method(args) };
  const args = { github, directory, sourceSha: "source", context: { eventName: "push", ref: "refs/tags/v0.1.0", repo: { owner: "Ethan-CYF", repo: "DigiPet" } } };
  return { args, state, cleanup: () => rmSync(directory, { recursive: true, force: true }) };
}
test("existing tag produces a draft, verifies downloaded assets, and reruns without duplicate assets", async () => {
  const f = fixture();
  try {
    assert.equal(await prepareDraft(f.args), "draft-url");
    await prepareDraft(f.args);
    assert.equal(f.state.release.draft, true);
    assert.equal(f.state.assets.length, 4);
    assert.equal(f.state.writes.filter((item) => item === "create draft").length, 1);
  } finally { f.cleanup(); }
});
test("manual dispatch, mismatched tags, and published releases cannot be written", async () => {
  for (const mode of ["manual", "tag mismatch", "source mismatch", "published"]) {
    const f = fixture();
    try {
      if (mode === "manual") f.args.context.eventName = "workflow_dispatch";
      if (mode === "tag mismatch") f.args.context.ref = "refs/tags/v9.0.0";
      if (mode === "source mismatch") f.state.tagSha = "different";
      if (mode === "published") f.state.release = { tag_name: "v0.1.0", draft: false };
      await assert.rejects(prepareDraft(f.args));
      assert.deepEqual(f.state.writes, []);
    } finally { f.cleanup(); }
  }
});
test("a draft published externally during a run stops further mutation", async () => {
  const f = fixture();
  try {
    f.state.publishedDuringUpload = true;
    await assert.rejects(prepareDraft(f.args), /no longer a draft/);
    assert.equal(f.state.assets.length, 1);
  } finally { f.cleanup(); }
});
