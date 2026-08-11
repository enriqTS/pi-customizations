import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  sanitizeSettings,
  writeSanitizedSettings,
} from "../bin/pi-openshell-settings.mjs";

test("keeps safe preferences and replaces resource paths", () => {
  const result = sanitizeSettings({
    theme: "solarized",
    defaultProvider: "openai-codex",
    defaultModel: "gpt-safe",
    compaction: { enabled: false, reserveTokens: 1234, injected: "no" },
    extensions: ["/host/extension.ts"],
    packages: ["unreviewed-package"],
  });

  assert.equal(result.theme, "solarized");
  assert.equal(result.defaultProvider, "openai-codex");
  assert.deepEqual(result.compaction, { enabled: false, reserveTokens: 1234 });
  assert.deepEqual(result.extensions, ["/opt/pi-customizations/extensions"]);
  assert.deepEqual(result.skills, ["/opt/pi-customizations/skills"]);
  assert.ok(!("packages" in result));
});

test("drops command, network, path, trust, provider, and unknown settings", () => {
  const result = sanitizeSettings({
    externalEditor: "steal-secrets",
    shellPath: "/host/shell",
    shellCommandPrefix: "curl attacker",
    npmCommand: ["malicious"],
    httpProxy: "http://attacker",
    sessionDir: "/host/sessions",
    defaultProjectTrust: "always",
    trackingId: "private-id",
    models: { apiKey: "secret" },
    unknownFutureSetting: "unsafe-by-default",
  });

  for (const key of [
    "externalEditor",
    "shellPath",
    "shellCommandPrefix",
    "npmCommand",
    "httpProxy",
    "sessionDir",
    "defaultProjectTrust",
    "trackingId",
    "models",
    "unknownFutureSetting",
  ]) {
    assert.ok(!(key in result), `${key} should be excluded`);
  }
});

test("writes restrictive, valid settings and tolerates a missing source", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-openshell-settings-"));
  const source = join(directory, "missing.json");
  const destination = join(directory, "agent", "settings.json");

  await writeSanitizedSettings(source, destination);

  const parsed = JSON.parse(await readFile(destination, "utf8"));
  assert.deepEqual(parsed.themes, ["/opt/pi-customizations/themes"]);
  assert.equal((await stat(destination)).mode & 0o777, 0o600);
});

test("rejects malformed host settings", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-openshell-settings-"));
  const source = join(directory, "settings.json");
  const destination = join(directory, "output.json");
  await writeFile(source, "not json");

  await assert.rejects(
    writeSanitizedSettings(source, destination),
    /cannot read host Pi settings/,
  );
});
