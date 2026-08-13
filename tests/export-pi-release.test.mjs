import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, cp, mkdtemp, mkdir, readFile, utimes, writeFile } from "node:fs/promises";
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
  const copied = [
    "APPEND_SYSTEM.md",
    "agents/planner.md",
    "extensions/subagent/index.ts",
    "skills/.gitkeep",
    "themes/.gitkeep",
    "bin/pi-openshell-entrypoint",
    "bin/patch-pi-codex",
    "bin/pi-openshell-client",
    "bin/pi-openshell-settings.mjs",
    "bin/pi-openshell-sessions.mjs",
    "bin/pi-openshell-provider",
    "providers/pi-codex.yaml",
    "packaging/pi-openshell",
  ];
  for (const path of copied) {
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
  await run(exporter, ["assets", "--source", source, "--version", version, "--output", output], { env: fixedEnv });
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

async function compatibility(assetArchive, hostVersion = version) {
  const path = join(dirname(assetArchive), "compatibility.json");
  const assetManifest = JSON.parse((await run("tar", ["-xOzf", assetArchive, "manifest.json"])).stdout);
  const value = {
    schemaVersion: 1,
    environment: { version: "9.8.7", revision: "a".repeat(40) },
    image: {
      reference: "ghcr.io/enriqts/openshell-environments/pi:9.8.7",
      digest: `sha256:${"b".repeat(64)}`,
      platforms: ["linux/amd64"],
    },
    hostIntegration: { version: hostVersion, launcherApi: 1, hookApi: 1 },
    piAssets: { version: assetManifest.version, api: assetManifest.piAssetsApi, sourceRevision: assetManifest.source.revision, sha256: hash(await readFile(assetArchive)) },
  };
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
  return path;
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
  assert.deepEqual(list, [...list].sort((a, b) => Buffer.from(a).compare(Buffer.from(b))));
  assert.deepEqual(list, [
    "APPEND_SYSTEM.md",
    "agents/planner.md",
    "extensions/subagent/index.ts",
    "image/patch-pi-codex",
    "image/pi-openshell-entrypoint",
    "manifest.json",
    "skills/.gitkeep",
    "themes/.gitkeep",
  ]);
  const extracted = await extract(first);
  const manifest = JSON.parse(await readFile(join(extracted, "manifest.json"), "utf8"));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.piAssetsApi, 1);
  assert.match(manifest.source.revision, /^[0-9a-f]{40}$/);
  for (const file of manifest.files) assert.equal(file.sha256, hash(await readFile(join(extracted, file.path))));
  const checksumLines = await readFile(join(firstOutput, "SHA256SUMS"), "utf8");
  assert.equal(checksumLines, `${hash(await readFile(first))}  pi-assets-${version}.tar.gz\n`);
  assert.doesNotMatch(list.join("\n"), /auth|settings|sessions|(^|\/)\.git(\/|$)|pi-openshell-provider/);
});

test("host export contains only package-relative integration and valid metadata", async () => {
  const source = await fixture();
  const output = await mkdtemp(join(tmpdir(), "pi-host-export-"));
  const assets = await exportAssets(source, output);
  const metadata = await compatibility(assets);
  await run(exporter, ["host", "--source", source, "--version", version, "--output", output, "--compatibility", metadata, "--asset-archive", assets], { env: fixedEnv });
  const archive = join(output, `pi-openshell-${version}.tar.gz`);
  assert.deepEqual(await members(archive), [
    "bin/pi",
    "bin/pi-openshell",
    "bin/pi-openshell-hook",
    "compatibility.json",
    "lib/pi-openshell-provider",
    "lib/pi-openshell-sessions.mjs",
    "lib/pi-openshell-settings.mjs",
    "manifest.json",
    "providers/pi-codex.yaml",
  ]);
  const extracted = await extract(archive);
  const launcher = await readFile(join(extracted, "bin/pi-openshell"), "utf8");
  const hook = await readFile(join(extracted, "bin/pi-openshell-hook"), "utf8");
  assert.doesNotMatch(`${launcher}\n${hook}`, /Projetos|\.\.\/openshell-environments|CUSTOMIZATIONS_DIR/);
  assert.match(launcher, /PACKAGE_DIR/);
  assert.match(hook, /ROOT\/lib|\$ROOT\/lib/);

  const dependency = join(output, "openshell-environments");
  await mkdir(join(dependency, "bin"), { recursive: true });
  await mkdir(join(dependency, "clients/pi"), { recursive: true });
  await writeFile(join(dependency, "VERSION"), "9.8.7\n");
  await writeFile(join(dependency, "API_VERSION"), "1\n");
  await writeFile(join(dependency, "clients/pi/policy.yaml"), "version: 1\n");
  const log = join(output, "launcher.log");
  await writeFile(join(dependency, "bin/openshell-workspace"), `#!/usr/bin/env bash\nprintf '%s\\n' "$@" >"$FAKE_LOG"\n`);
  await chmod(join(dependency, "bin/openshell-workspace"), 0o755);
  await run(join(extracted, "bin/pi"), ["--recover-download", "pi-test"], {
    cwd: output,
    env: { ...process.env, PI_OPENSHELL_ENVIRONMENTS_DIR: dependency, PI_OPENSHELL_PROVIDER: "none", FAKE_LOG: log },
  });
  const args = await readFile(log, "utf8");
  assert.match(args, new RegExp(`ghcr.io/enriqts/openshell-environments/pi:9\\.8\\.7@sha256:${"b".repeat(64)}`));
  assert.match(args, new RegExp(join(extracted, "bin/pi-openshell-hook").replaceAll("/", "\\/")));
});

test("export fails closed for dirty, symlinked, forbidden, and mismatched inputs", async () => {
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

  const clean = await fixture();
  const assets = await exportAssets(clean, output);
  const metadata = await compatibility(assets, "7.7.7");
  await assert.rejects(run(exporter, ["host", "--source", clean, "--version", version, "--output", output, "--compatibility", metadata, "--asset-archive", assets], { env: fixedEnv }), /host integration is incompatible/);
});
