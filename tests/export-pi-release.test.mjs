import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdtemp, mkdir, readFile, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const exporter = join(root, "bin", "export-pi-release.mjs");
const version = "1.2.3";
const fixedEnv = { ...process.env, SOURCE_DATE_EPOCH: "1700000000" };

async function run(command, args, options = {}) {
  return execFileAsync(command, args, { ...options, maxBuffer: 16 * 1024 * 1024 });
}

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "pi-export-source-"));
  for (const path of ["APPEND_SYSTEM.md", "agents/planner.md", "extensions/subagent/index.ts", "skills/.gitkeep", "themes/.gitkeep"]) {
    await mkdir(dirname(join(directory, path)), { recursive: true });
    await cp(join(root, path), join(directory, path));
  }
  await run("git", ["init", "-q", directory]);
  await run("git", ["-C", directory, "config", "user.name", "Export Test"]);
  await run("git", ["-C", directory, "config", "user.email", "export@example.invalid"]);
  await run("git", ["-C", directory, "add", "."]);
  await run("git", ["-C", directory, "commit", "-qm", "fixture"], { env: { ...fixedEnv, GIT_AUTHOR_DATE: "@1700000000", GIT_COMMITTER_DATE: "@1700000000" } });
  return directory;
}

async function exportAssets(source, output) {
  await run(exporter, ["--source", source, "--version", version, "--output", output], { env: fixedEnv });
  return join(output, `pi-assets-${version}.tar.gz`);
}

async function members(archive) {
  return (await run("tar", ["-tzf", archive])).stdout.trim().split("\n");
}

async function extract(archive) {
  const directory = await mkdtemp(join(tmpdir(), "pi-export-extract-"));
  await run("tar", ["-xzf", archive, "-C", directory]);
  return directory;
}

function hash(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

test("asset export is deterministic, normalized, and exactly allowlisted", async () => {
  const source = await fixture();
  const firstOutput = await mkdtemp(join(tmpdir(), "pi-assets-first-"));
  const secondOutput = await mkdtemp(join(tmpdir(), "pi-assets-second-"));
  const first = await exportAssets(source, firstOutput);
  await utimes(join(source, "agents/planner.md"), new Date(), new Date());
  const second = await exportAssets(source, secondOutput);
  assert.deepEqual(await readFile(first), await readFile(second));

  const list = await members(first);
  assert.deepEqual(list, [
    "APPEND_SYSTEM.md",
    "agents/planner.md",
    "extensions/subagent/index.ts",
    "manifest.json",
    "skills/.gitkeep",
    "themes/.gitkeep",
  ]);
  const extracted = await extract(first);
  const manifest = JSON.parse(await readFile(join(extracted, "manifest.json"), "utf8"));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.piAssetsApi, 1);
  assert.match(manifest.source.revision, /^[0-9a-f]{40}$/);
  for (const file of manifest.files) {
    assert.equal(file.target, "agent");
    assert.equal(file.sha256, hash(await readFile(join(extracted, file.path))));
  }
  assert.equal(await readFile(join(firstOutput, "SHA256SUMS"), "utf8"), `${hash(await readFile(first))}  pi-assets-${version}.tar.gz\n`);
  assert.doesNotMatch(list.join("\n"), /(^|\/)(bin|image|providers|release|packaging|auth|settings|sessions)(\/|$)/i);
});

test("export fails closed for dirty, symlinked, forbidden, and invalid commands", async () => {
  const dirty = await fixture();
  await writeFile(join(dirty, "untracked.txt"), "not reviewed\n");
  const output = await mkdtemp(join(tmpdir(), "pi-export-invalid-"));
  await assert.rejects(exportAssets(dirty, output), /source repository must be clean/);

  const forbidden = await fixture();
  await writeFile(join(forbidden, "agents/auth.json"), "secret\n");
  await run("git", ["-C", forbidden, "add", "agents/auth.json"]);
  await run("git", ["-C", forbidden, "commit", "-qm", "forbidden"], { env: fixedEnv });
  await assert.rejects(exportAssets(forbidden, output), /unsafe or forbidden archive path/);

  const symlink = await fixture();
  await run("ln", ["-s", "planner.md", join(symlink, "agents/link.md")]);
  await run("git", ["-C", symlink, "add", "agents/link.md"]);
  await run("git", ["-C", symlink, "commit", "-qm", "symlink"], { env: fixedEnv });
  await assert.rejects(exportAssets(symlink, output), /regular non-symlink/);

  await assert.rejects(run(exporter, ["assets", "--version", version, "--output", output], { env: fixedEnv }), /usage: export-pi-release/);
});
