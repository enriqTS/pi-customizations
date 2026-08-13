import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const installer = join(root, "bin", "install-pi-openshell");
const exporter = join(root, "bin", "export-pi-release.mjs");
const fixedGitEnv = { GIT_AUTHOR_DATE: "@1700000000", GIT_COMMITTER_DATE: "@1700000000" };
const fixedEnv = { ...process.env, SOURCE_DATE_EPOCH: "1700000000" };

async function run(command, args, options = {}) {
  return execFileAsync(command, args, { ...options, maxBuffer: 32 * 1024 * 1024 });
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function symlinkTarget(path) {
  return realpath(path);
}

async function gitInit(dir) {
  await run("git", ["init", "-q", dir]);
  await run("git", ["-C", dir, "config", "user.name", "Install Test"]);
  await run("git", ["-C", dir, "config", "user.email", "install@example.invalid"]);
}

async function commit(dir, message) {
  await run("git", ["-C", dir, "add", "."]);
  await run("git", ["-C", dir, "commit", "-qm", message], { env: { ...fixedEnv, ...fixedGitEnv } });
}

// Build a fake pi-customizations source tree, export real assets + host
// archives from it (the exact code under test elsewhere), and lay the host
// archive out at the relative path GitHub Releases would serve it at, so
// the installer's download logic runs unmodified against a file:// fixture.
async function buildReleaseFixture(releaseDir, { hostVersion, envVersion, envRevision = "a".repeat(40), imageDigest = "b".repeat(64) }) {
  const source = await mkdtemp(join(tmpdir(), "install-pi-openshell-source-"));
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
    await mkdir(dirname(join(source, path)), { recursive: true });
    await cp(join(root, path), join(source, path));
  }
  await gitInit(source);
  await commit(source, "fixture");

  const assetsVersion = hostVersion;
  const assetsOutput = await mkdtemp(join(tmpdir(), "install-pi-openshell-assets-"));
  await run(exporter, ["assets", "--source", source, "--version", assetsVersion, "--output", assetsOutput], { env: fixedEnv });
  const assetArchive = join(assetsOutput, `pi-assets-${assetsVersion}.tar.gz`);
  const assetManifest = JSON.parse((await run("tar", ["-xOzf", assetArchive, "manifest.json"])).stdout);
  const assetChecksum = createHash("sha256").update(await readFile(assetArchive)).digest("hex");

  const compatibilityPath = join(assetsOutput, "compatibility.json");
  await writeFile(
    compatibilityPath,
    JSON.stringify(
      {
        schemaVersion: 1,
        environment: { version: envVersion, revision: envRevision },
        image: { reference: `ghcr.io/enriqts/openshell-environments/pi:${envVersion}`, digest: `sha256:${imageDigest}`, platforms: ["linux/amd64"] },
        hostIntegration: { version: hostVersion, launcherApi: 1, hookApi: 1 },
        piAssets: { version: assetManifest.version, api: assetManifest.piAssetsApi, sourceRevision: assetManifest.source.revision, sha256: assetChecksum },
      },
      null,
      2,
    ),
  );

  const hostOutput = await mkdtemp(join(tmpdir(), "install-pi-openshell-host-"));
  await run(exporter, ["host", "--source", source, "--version", hostVersion, "--output", hostOutput, "--compatibility", compatibilityPath, "--asset-archive", assetArchive], { env: fixedEnv });

  const releaseTagDir = join(releaseDir, `pi-openshell-v${hostVersion}`);
  await mkdir(releaseTagDir, { recursive: true });
  await cp(join(hostOutput, `pi-openshell-${hostVersion}.tar.gz`), join(releaseTagDir, `pi-openshell-${hostVersion}.tar.gz`));
  await cp(join(hostOutput, "SHA256SUMS"), join(releaseTagDir, "SHA256SUMS"));
  return { releaseTagDir, archive: join(releaseTagDir, `pi-openshell-${hostVersion}.tar.gz`) };
}

async function environmentFixture(version) {
  const dir = await mkdtemp(join(tmpdir(), "install-pi-openshell-env-"));
  await writeFile(join(dir, "VERSION"), `${version}\n`);
  await writeFile(join(dir, "API_VERSION"), "1\n");
  await gitInit(dir);
  await commit(dir, "fixture");
  await run("git", ["-C", dir, "tag", `v${version}`]);
  return dir;
}

async function sandbox() {
  const home = await mkdtemp(join(tmpdir(), "install-pi-openshell-home-"));
  const dataHome = join(home, "data");
  const binHome = join(home, "bin");
  await mkdir(dataHome, { recursive: true });
  await mkdir(binHome, { recursive: true });
  return { dataHome, binHome };
}

test("installs, activates, lists, upgrades, downgrades without network, and uninstalls", async () => {
  const releaseDir = await mkdtemp(join(tmpdir(), "install-pi-openshell-release-"));
  await buildReleaseFixture(releaseDir, { hostVersion: "1.0.0", envVersion: "9.9.1" });
  const envDir1 = await environmentFixture("9.9.1");
  await buildReleaseFixture(releaseDir, { hostVersion: "1.1.0", envVersion: "9.9.2" });
  const envDir2 = await environmentFixture("9.9.2");

  const { dataHome, binHome } = await sandbox();
  const baseEnv = { ...process.env, XDG_DATA_HOME: dataHome, XDG_BIN_HOME: binHome, PI_OPENSHELL_INSTALL_BASE_URL: `file://${releaseDir}` };

  await run(installer, ["install", "1.0.0"], { env: { ...baseEnv, PI_OPENSHELL_ENVIRONMENTS_SOURCE: envDir1 } });
  assert.equal(await symlinkTarget(join(binHome, "pi")), await realpath(join(dataHome, "pi-openshell", "1.0.0", "bin", "pi")));
  assert.ok(await exists(join(dataHome, "openshell-environments", "9.9.1", "VERSION")));

  let listing = (await run(installer, ["list"], { env: baseEnv })).stdout;
  assert.match(listing, /1\.0\.0 \(active\)/);

  await run(installer, ["upgrade", "1.1.0"], { env: { ...baseEnv, PI_OPENSHELL_ENVIRONMENTS_SOURCE: envDir2 } });
  listing = (await run(installer, ["list"], { env: baseEnv })).stdout;
  assert.match(listing, /1\.0\.0\n/);
  assert.match(listing, /1\.1\.0 \(active\)/);

  // No PI_OPENSHELL_ENVIRONMENTS_SOURCE and no PI_OPENSHELL_INSTALL_BASE_URL reachable here:
  // downgrading to an already-installed version must need neither the network nor a source override.
  const offlineEnv = { ...process.env, XDG_DATA_HOME: dataHome, XDG_BIN_HOME: binHome, PI_OPENSHELL_INSTALL_BASE_URL: "file:///nonexistent" };
  await run(installer, ["downgrade", "1.0.0"], { env: offlineEnv });
  assert.equal(await symlinkTarget(join(binHome, "pi")), await realpath(join(dataHome, "pi-openshell", "1.0.0", "bin", "pi")));

  await assert.rejects(run(installer, ["uninstall", "1.0.0"], { env: baseEnv }), /is active; pass --force/);
  await run(installer, ["uninstall", "1.1.0"], { env: baseEnv });
  listing = (await run(installer, ["list"], { env: baseEnv })).stdout;
  assert.doesNotMatch(listing, /1\.1\.0/);

  await run(installer, ["uninstall", "1.0.0", "--force"], { env: baseEnv });
  assert.equal(await exists(join(binHome, "pi")), false);
});

test("rejects a checksum-mismatched archive before installing anything", async () => {
  const releaseDir = await mkdtemp(join(tmpdir(), "install-pi-openshell-release-"));
  const { archive } = await buildReleaseFixture(releaseDir, { hostVersion: "2.0.0", envVersion: "9.9.3" });
  const bytes = await readFile(archive);
  bytes[bytes.length - 1] ^= 0xff;
  await writeFile(archive, bytes);

  const { dataHome, binHome } = await sandbox();
  const env = { ...process.env, XDG_DATA_HOME: dataHome, XDG_BIN_HOME: binHome, PI_OPENSHELL_INSTALL_BASE_URL: `file://${releaseDir}` };
  await assert.rejects(run(installer, ["install", "2.0.0"], { env }));
  assert.equal(await exists(join(dataHome, "pi-openshell", "2.0.0")), false);
  assert.equal(await exists(join(binHome, "pi")), false);
});

test("rejects an archive whose internal manifest checksum does not match its contents", async () => {
  const releaseDir = await mkdtemp(join(tmpdir(), "install-pi-openshell-release-"));
  const { releaseTagDir, archive } = await buildReleaseFixture(releaseDir, { hostVersion: "3.0.0", envVersion: "9.9.4" });

  const extracted = await mkdtemp(join(tmpdir(), "install-pi-openshell-retamper-"));
  await run("tar", ["-xzf", archive, "-C", extracted]);
  await writeFile(join(extracted, "providers", "pi-codex.yaml"), "tampered: true\n");
  const members = (await run("tar", ["-tzf", archive])).stdout.trim().split("\n").sort((a, b) => Buffer.from(a).compare(Buffer.from(b)));
  await run("tar", ["--sort=name", "--owner=0", "--group=0", "--numeric-owner", "-czf", archive, "-C", extracted, ...members]);

  // Recompute SHA256SUMS for the re-packed archive so the outer checksum
  // check alone would pass; only the inner manifest.json is now wrong.
  const checksum = createHash("sha256").update(await readFile(archive)).digest("hex");
  await writeFile(join(releaseTagDir, "SHA256SUMS"), `${checksum}  pi-openshell-3.0.0.tar.gz\n`);

  const { dataHome, binHome } = await sandbox();
  const env = { ...process.env, XDG_DATA_HOME: dataHome, XDG_BIN_HOME: binHome, PI_OPENSHELL_INSTALL_BASE_URL: `file://${releaseDir}` };
  await assert.rejects(run(installer, ["install", "3.0.0"], { env }), /checksum mismatch/);
  assert.equal(await exists(join(dataHome, "pi-openshell", "3.0.0")), false);
});

test("rejects unknown commands and a missing version argument", async () => {
  await assert.rejects(run(installer, ["bogus"], { env: process.env }), /usage: install-pi-openshell/);
  await assert.rejects(run(installer, ["install"], { env: process.env }), /a version is required/);
});
