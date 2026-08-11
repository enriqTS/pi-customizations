import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wrapper = join(root, "bin", "pi-openshell");

test("thin adapter pins and configures the shared launcher", async () => {
  const temp = await mkdtemp(join(tmpdir(), "pi-shared-adapter-"));
  const dependency = join(temp, "openshell-environments");
  const bin = join(dependency, "bin");
  const policy = join(dependency, "clients", "pi", "policy.yaml");
  const log = join(temp, "args.log");
  await mkdir(bin, { recursive: true });
  await mkdir(dirname(policy), { recursive: true });
  await writeFile(join(dependency, "VERSION"), "0.1.0\n");
  await writeFile(join(dependency, "API_VERSION"), "1\n");
  await writeFile(policy, "version: 1\n");
  await writeFile(join(bin, "openshell-workspace"), `#!/usr/bin/env bash\nprintf '%s\\n' "$@" >"$FAKE_LOG"\n`);
  await chmod(join(bin, "openshell-workspace"), 0o755);

  await execFileAsync(wrapper, ["--recover-download", "pi-test-123"], {
    cwd: temp,
    env: { ...process.env, PI_OPENSHELL_ENVIRONMENTS_DIR: dependency, PI_OPENSHELL_PROVIDER: "none", FAKE_LOG: log },
  });
  const args = await readFile(log, "utf8");
  assert.match(args, /localhost\/openshell-environments\/pi:0\.1\.0/);
  assert.match(args, new RegExp(policy.replaceAll("/", "\\/")));
  assert.match(args, /pi-openshell-client/);
  assert.match(args, /--recover-download\npi-test-123/);
});

test("adapter fails clearly when the pinned dependency is absent", async () => {
  const temp = await mkdtemp(join(tmpdir(), "pi-missing-shared-"));
  await assert.rejects(execFileAsync(wrapper, [], {
    cwd: temp,
    env: { ...process.env, PI_OPENSHELL_ENVIRONMENTS_DIR: join(temp, "missing") },
  }), /openshell-environments 0\.1\.0.*is required/s);
});
