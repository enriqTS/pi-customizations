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
  const options = { source: SCRIPT_ROOT };
  while (argv.length) {
    const name = argv.shift();
    const value = argv.shift();
    if (!value || !["--version", "--output", "--source"].includes(name)) fail(`usage: export-pi-release --version VERSION --output DIR [--source DIR]`);
    options[name.slice(2)] = value;
  }
  if (!VERSION.test(options.version ?? "")) fail("--version must be a semantic version");
  if (!options.output) fail("--output is required");
  return options;
}

function safeArchivePath(path) {
  if (!path || path.startsWith("/") || path.includes("\\") || path.split("/").some((part) => part === "." || part === "..") || FORBIDDEN.test(path)) fail(`unsafe or forbidden archive path: ${path}`);
}

async function sourceFile(root, path) {
  const absolute = join(root, path);
  const info = await lstat(absolute);
  if (!info.isFile() || info.isSymbolicLink()) fail(`source member must be a regular non-symlink file: ${path}`);
  return absolute;
}

async function assetMappings(root) {
  const output = execFileSync("git", ["-C", root, "ls-files", "-z", "--", "agents", "extensions", "skills", "themes"]);
  const paths = output.toString().split("\0").filter(Boolean).sort((a, b) => Buffer.from(a).compare(Buffer.from(b)));
  for (const prefix of ["agents/", "extensions/", "skills/", "themes/"]) {
    if (!paths.some((path) => path.startsWith(prefix))) fail(`asset source has no committed ${prefix} member`);
  }
  return ["APPEND_SYSTEM.md", ...paths].map((path) => ({ path, mode: "0644", target: "agent" }));
}

async function prepareMappings(root, mappings) {
  const seen = new Set();
  for (const mapping of mappings) {
    safeArchivePath(mapping.path);
    if (seen.has(mapping.path)) fail(`duplicate archive path: ${mapping.path}`);
    seen.add(mapping.path);
    mapping.absoluteSource = await sourceFile(root, mapping.path);
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

function assertEqual(actual, expected, label) {
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) fail(`${label} does not match the manifest`);
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

async function build(options) {
  const root = resolve(options.source);
  if (git(root, ["status", "--porcelain", "--untracked-files=normal"])) fail(`source repository must be clean: ${root}`);
  const revision = git(root, ["rev-parse", "HEAD"]);
  if (!REVISION.test(revision)) fail("source revision is invalid");
  const epochText = process.env.SOURCE_DATE_EPOCH || git(root, ["show", "-s", "--format=%ct", "HEAD"]);
  if (!/^[0-9]+$/.test(epochText) || !Number.isSafeInteger(Number(epochText))) fail("SOURCE_DATE_EPOCH must be a non-negative safe integer");
  const epoch = Number(epochText);
  const mappings = await prepareMappings(root, await assetMappings(root));

  const stage = await mkdtemp(join(tmpdir(), "pi-release-export-"));
  try {
    const files = [];
    for (const mapping of mappings) {
      const destination = join(stage, mapping.path);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(mapping.absoluteSource, destination);
      await chmod(destination, Number.parseInt(mapping.mode, 8));
      await utimes(destination, epoch, epoch);
      files.push({ path: mapping.path, sha256: await fileSha256(destination), mode: mapping.mode, target: mapping.target });
    }
    const manifest = { schemaVersion: 1, name: "pi-assets", version: options.version, piAssetsApi: 1, source: { repository: "https://github.com/enriqTS/pi-customizations", revision }, files };
    await writeFile(join(stage, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644 });
    await utimes(join(stage, "manifest.json"), epoch, epoch);
    const members = ["manifest.json", ...files.map((file) => file.path)].sort((a, b) => Buffer.from(a).compare(Buffer.from(b)));
    const tar = spawnSync("tar", ["--sort=name", "--format=ustar", `--mtime=@${epoch}`, "--owner=0", "--group=0", "--numeric-owner", "--no-recursion", "-cf", "-", "-C", stage, ...members], { maxBuffer: 64 * 1024 * 1024 });
    if (tar.status !== 0) fail(`tar failed: ${tar.stderr.toString().trim()}`);
    const archive = gzipSync(tar.stdout, { level: 9, mtime: 0 });
    const outputDir = resolve(options.output);
    await mkdir(outputDir, { recursive: true });
    const archivePath = join(outputDir, `pi-assets-${options.version}.tar.gz`);
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
