#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, copyFile, lstat, mkdir, mkdtemp, readFile, rename, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/;
const SHA256 = /^[0-9a-f]{64}$/;
const REVISION = /^[0-9a-f]{40,64}$/;
const FORBIDDEN = /(^|\/)(auth\.json|settings\.json|sessions?|\.git|\.ssh|\.gnupg|node_modules|cache|tmp)(\/|$)|\.(log|key)$/i;

function fail(message) {
  throw new Error(message);
}

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function fileSha256(path) {
  return sha256(await readFile(path));
}

function parseArgs(argv) {
  const kind = argv.shift();
  if (!['assets', 'host'].includes(kind)) fail("usage: export-pi-release {assets|host} --version VERSION --output DIR [--compatibility FILE --asset-archive FILE] [--source DIR]");
  const options = { kind, source: SCRIPT_ROOT };
  while (argv.length) {
    const name = argv.shift();
    const value = argv.shift();
    if (!value || !["--version", "--output", "--source", "--compatibility", "--asset-archive"].includes(name)) fail(`unknown or incomplete argument: ${name ?? ""}`);
    options[name.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
  }
  if (!VERSION.test(options.version ?? "")) fail("--version must be a semantic version");
  if (!options.output) fail("--output is required");
  if (kind === "host" && (!options.compatibility || !options.assetArchive)) fail("host export requires --compatibility and --asset-archive");
  return options;
}

async function sourceFile(root, path) {
  const absolute = join(root, path);
  const info = await lstat(absolute);
  if (!info.isFile() || info.isSymbolicLink()) fail(`source member must be a regular non-symlink file: ${path}`);
  return absolute;
}

function safeArchivePath(path) {
  if (!path || path.startsWith("/") || path.includes("\\") || path.split("/").some((part) => part === "." || part === "..") || FORBIDDEN.test(path)) fail(`unsafe or forbidden archive path: ${path}`);
}

async function trackedResources(root) {
  const output = execFileSync("git", ["-C", root, "ls-files", "-z", "--", "agents", "extensions", "skills", "themes"]);
  return output.toString().split("\0").filter(Boolean).sort((a, b) => Buffer.from(a).compare(Buffer.from(b)));
}

async function assetMappings(root) {
  const paths = await trackedResources(root);
  for (const prefix of ["agents/", "extensions/", "skills/", "themes/"]) {
    if (!paths.some((path) => path.startsWith(prefix))) fail(`asset source has no committed ${prefix} member`);
  }
  return [
    { source: "APPEND_SYSTEM.md", path: "APPEND_SYSTEM.md", mode: "0644", target: "agent" },
    ...paths.map((path) => ({ source: path, path, mode: "0644", target: "agent" })),
    { source: "bin/pi-openshell-entrypoint", path: "image/pi-openshell-entrypoint", mode: "0755", target: "image" },
    { source: "bin/patch-pi-codex", path: "image/patch-pi-codex", mode: "0755", target: "image" },
  ];
}

function hostMappings(compatibility) {
  return [
    { source: "packaging/pi-openshell", path: "bin/pi", mode: "0755" },
    { source: "packaging/pi-openshell", path: "bin/pi-openshell", mode: "0755" },
    { source: "bin/pi-openshell-client", path: "bin/pi-openshell-hook", mode: "0755" },
    { source: "bin/pi-openshell-settings.mjs", path: "lib/pi-openshell-settings.mjs", mode: "0755" },
    { source: "bin/pi-openshell-sessions.mjs", path: "lib/pi-openshell-sessions.mjs", mode: "0755" },
    { source: "bin/pi-openshell-provider", path: "lib/pi-openshell-provider", mode: "0755" },
    { source: "providers/pi-codex.yaml", path: "providers/pi-codex.yaml", mode: "0644" },
    { absoluteSource: compatibility, path: "compatibility.json", mode: "0644" },
  ];
}

function exactKeys(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`);
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length) fail(`${label} contains unsupported fields: ${unexpected.join(", ")}`);
}

function validateCompatibility(value, version, assetChecksum, assetManifest) {
  exactKeys(value, ["schemaVersion", "environment", "image", "hostIntegration", "piAssets"], "compatibility");
  if (value.schemaVersion !== 1) fail("compatibility schemaVersion 1 is required");
  exactKeys(value.environment, ["version", "revision"], "compatibility.environment");
  exactKeys(value.image, ["reference", "digest", "platforms"], "compatibility.image");
  exactKeys(value.hostIntegration, ["version", "launcherApi", "hookApi"], "compatibility.hostIntegration");
  exactKeys(value.piAssets, ["version", "api", "sourceRevision", "sha256"], "compatibility.piAssets");
  if (!VERSION.test(value.environment?.version ?? "") || !REVISION.test(value.environment?.revision ?? "")) fail("compatibility environment is invalid");
  const imageVersion = value.image?.reference?.match(/^ghcr\.io\/enriqts\/openshell-environments\/pi:([0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?)$/)?.[1];
  if (!imageVersion || imageVersion !== value.environment.version || !/^sha256:[0-9a-f]{64}$/.test(value.image?.digest ?? "")) fail("compatibility image must be versioned and digest-pinned");
  if (!Array.isArray(value.image.platforms) || value.image.platforms.length === 0 || value.image.platforms.some((item) => !["linux/amd64", "linux/arm64"].includes(item)) || new Set(value.image.platforms).size !== value.image.platforms.length) fail("compatibility image platforms are invalid");
  if (value.hostIntegration?.version !== version || value.hostIntegration?.launcherApi !== 1 || value.hostIntegration?.hookApi !== 1) fail("compatibility host integration is incompatible");
  if (!VERSION.test(value.piAssets?.version ?? "") || value.piAssets?.api !== 1 || !REVISION.test(value.piAssets?.sourceRevision ?? "") || !SHA256.test(value.piAssets?.sha256 ?? "")) fail("compatibility Pi assets are invalid");
  if (value.piAssets.sha256 !== assetChecksum) fail("compatibility Pi asset checksum does not match --asset-archive");
  if (assetManifest?.name !== "pi-assets" || assetManifest.piAssetsApi !== 1 || assetManifest.version !== value.piAssets.version || assetManifest.source?.revision !== value.piAssets.sourceRevision) fail("compatibility Pi asset identity does not match --asset-archive manifest");
}

async function prepareMappings(root, mappings) {
  const seen = new Set();
  for (const mapping of mappings) {
    safeArchivePath(mapping.path);
    if (seen.has(mapping.path)) fail(`duplicate archive path: ${mapping.path}`);
    seen.add(mapping.path);
    mapping.absoluteSource = mapping.absoluteSource ? resolve(mapping.absoluteSource) : await sourceFile(root, mapping.source);
    const info = await lstat(mapping.absoluteSource);
    if (!info.isFile() || info.isSymbolicLink()) fail(`source member must be a regular non-symlink file: ${mapping.absoluteSource}`);
  }
  return mappings.sort((a, b) => Buffer.from(a.path).compare(Buffer.from(b.path)));
}

async function writeChecksums(outputDir, archivePath, checksum) {
  const checksumPath = join(outputDir, "SHA256SUMS");
  let lines = [];
  try { lines = (await readFile(checksumPath, "utf8")).split("\n").filter(Boolean); } catch (error) { if (error.code !== "ENOENT") throw error; }
  lines = lines.filter((line) => !line.endsWith(`  ${basename(archivePath)}`));
  lines.push(`${checksum}  ${basename(archivePath)}`);
  lines.sort((a, b) => Buffer.from(a).compare(Buffer.from(b)));
  const temporary = `${checksumPath}.tmp-${process.pid}`;
  await writeFile(temporary, `${lines.join("\n")}\n`, { mode: 0o644 });
  await rename(temporary, checksumPath);
}

async function verifyArchive(archivePath, expected, manifest) {
  const listing = execFileSync("tar", ["-tzf", archivePath], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
  assertEqual(listing, expected, "archive member list");
  const stage = await mkdtemp(join(tmpdir(), "pi-release-verify-"));
  try {
    execFileSync("tar", ["-xzf", archivePath, "-C", stage]);
    const parsed = JSON.parse(await readFile(join(stage, "manifest.json"), "utf8"));
    if (JSON.stringify(parsed) !== JSON.stringify(manifest)) fail("archived manifest differs from generated manifest");
    for (const file of manifest.files) {
      const info = await lstat(join(stage, file.path));
      if (!info.isFile() || info.isSymbolicLink()) fail(`invalid archived member: ${file.path}`);
      if (await fileSha256(join(stage, file.path)) !== file.sha256) fail(`archived checksum mismatch: ${file.path}`);
      if ((info.mode & 0o777).toString(8).padStart(4, "0") !== file.mode) fail(`archived mode mismatch: ${file.path}`);
    }
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

function assertEqual(actual, expected, label) {
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) fail(`${label} does not match the manifest`);
}

async function build(options) {
  const root = resolve(options.source);
  if (git(root, ["status", "--porcelain", "--untracked-files=normal"])) fail(`source repository must be clean: ${root}`);
  const revision = git(root, ["rev-parse", "HEAD"]);
  if (!REVISION.test(revision)) fail("source revision is invalid");
  const epochText = process.env.SOURCE_DATE_EPOCH || git(root, ["show", "-s", "--format=%ct", "HEAD"]);
  if (!/^[0-9]+$/.test(epochText)) fail("SOURCE_DATE_EPOCH must be a non-negative integer");
  const epoch = Number(epochText);
  if (!Number.isSafeInteger(epoch)) fail("SOURCE_DATE_EPOCH is out of range");

  let mappings;
  if (options.kind === "assets") {
    mappings = await assetMappings(root);
  } else {
    const assetArchive = resolve(options.assetArchive);
    const compatibility = JSON.parse(await readFile(resolve(options.compatibility), "utf8"));
    const assetManifest = JSON.parse(execFileSync("tar", ["-xOzf", assetArchive, "manifest.json"], { encoding: "utf8" }));
    validateCompatibility(compatibility, options.version, await fileSha256(assetArchive), assetManifest);
    mappings = hostMappings(options.compatibility);
  }
  await prepareMappings(root, mappings);

  const stage = await mkdtemp(join(tmpdir(), "pi-release-export-"));
  try {
    const files = [];
    for (const mapping of mappings) {
      const destination = join(stage, mapping.path);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(mapping.absoluteSource, destination);
      await chmod(destination, Number.parseInt(mapping.mode, 8));
      await utimes(destination, epoch, epoch);
      files.push({
        path: mapping.path,
        sha256: await fileSha256(destination),
        mode: mapping.mode,
        ...(mapping.target ? { target: mapping.target } : {}),
      });
    }
    const manifest = options.kind === "assets" ? {
      schemaVersion: 1, name: "pi-assets", version: options.version, piAssetsApi: 1,
      source: { repository: "https://github.com/enriqTS/pi-customizations", revision }, files,
    } : {
      schemaVersion: 1, name: "pi-openshell", version: options.version, launcherApi: 1, hookApi: 1,
      source: { repository: "https://github.com/enriqTS/pi-customizations", revision }, files,
    };
    const manifestPath = join(stage, "manifest.json");
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644 });
    await utimes(manifestPath, epoch, epoch);

    const members = ["manifest.json", ...files.map((file) => file.path)].sort((a, b) => Buffer.from(a).compare(Buffer.from(b)));
    const tar = spawnSync("tar", ["--sort=name", "--format=ustar", `--mtime=@${epoch}`, "--owner=0", "--group=0", "--numeric-owner", "--no-recursion", "-cf", "-", "-C", stage, ...members], { maxBuffer: 64 * 1024 * 1024 });
    if (tar.status !== 0) fail(`tar failed: ${tar.stderr.toString().trim()}`);
    const archive = gzipSync(tar.stdout, { level: 9, mtime: 0 });
    const outputDir = resolve(options.output);
    await mkdir(outputDir, { recursive: true });
    const archivePath = join(outputDir, `${options.kind === "assets" ? "pi-assets" : "pi-openshell"}-${options.version}.tar.gz`);
    const temporary = `${archivePath}.tmp-${process.pid}`;
    await writeFile(temporary, archive, { mode: 0o644 });
    try {
      await verifyArchive(temporary, members, manifest);
      await rename(temporary, archivePath);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
    const checksum = sha256(archive);
    await writeChecksums(outputDir, archivePath, checksum);
    console.log(`${checksum}  ${archivePath}`);
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

build(parseArgs(process.argv.slice(2))).catch((error) => {
  console.error(`export-pi-release: ${error.message}`);
  process.exit(1);
});
