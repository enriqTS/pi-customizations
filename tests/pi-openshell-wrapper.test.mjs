import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  chmod,
  cp,
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const wrapper = join(repositoryRoot, "bin", "pi-openshell");

test("recover-download prunes ignored artifacts and synchronizes the retained sandbox", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-openshell-wrapper-"));
  const host = join(root, "project");
  const sandbox = join(root, "sandbox-project");
  const fakeBin = join(root, "bin");
  const sessions = join(root, "sessions");
  const log = join(root, "openshell.log");
  await mkdir(host);
  await mkdir(fakeBin);
  await mkdir(sessions);
  await writeFile(join(host, ".gitignore"), "target/\n");
  await writeFile(join(host, "source.txt"), "host\n");
  await mkdir(join(host, "target"));
  await writeFile(join(host, "target", "host-cache"), "keep\n");
  await execFileAsync("git", ["init", "-q"], { cwd: host });
  await execFileAsync("git", ["add", ".gitignore", "source.txt"], { cwd: host });
  await cp(host, sandbox, { recursive: true, force: true });
  await writeFile(join(sandbox, "source.txt"), "sandbox\n");
  await writeFile(join(sandbox, "target", "large-build-output"), "generated\n");

  const fakeOpenShell = join(fakeBin, "openshell");
  await writeFile(
    fakeOpenShell,
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >>"$FAKE_LOG"
case "$1 $2" in
  "sandbox get") exit 0 ;;
  "sandbox exec")
    if [[ " $* " == *" git clean -fdX "* ]]; then
      git -C "$FAKE_SANDBOX" clean -fdX >/dev/null
    fi
    ;;
  "sandbox download")
    destination="$5"
    mkdir -p "$destination"
    if [[ "$4" == /workspace/.pi-openshell-sessions/* ]]; then
      exit 0
    fi
    cp -a "$FAKE_SANDBOX/." "$destination/"
    ;;
  "sandbox delete") exit 0 ;;
  *) printf 'unexpected openshell invocation: %s\\n' "$*" >&2; exit 1 ;;
esac
`,
  );
  await chmod(fakeOpenShell, 0o755);

  const { stderr } = await execFileAsync(
    wrapper,
    ["--recover-download", "pi-project-123"],
    {
      cwd: host,
      env: {
        ...process.env,
        HOME: root,
        PATH: `${fakeBin}:${process.env.PATH}`,
        PI_OPENSHELL_SESSION_DIR: sessions,
        FAKE_LOG: log,
        FAKE_SANDBOX: sandbox,
      },
    },
  );

  assert.match(stderr, /recovering retained sandbox pi-project-123/);
  assert.equal(await readFile(join(host, "source.txt"), "utf8"), "sandbox\n");
  assert.equal(await readFile(join(host, "target", "host-cache"), "utf8"), "keep\n");
  const calls = await readFile(log, "utf8");
  const cleanIndex = calls.indexOf("git clean -fdX");
  const workspaceDownloadIndex = calls.indexOf("sandbox download pi-project-123 /workspace/project");
  assert.ok(cleanIndex >= 0, "ignored sandbox files should be pruned");
  assert.ok(workspaceDownloadIndex > cleanIndex, "cleanup should precede download");
  assert.match(calls, /sandbox delete pi-project-123/);
});
