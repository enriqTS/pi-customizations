import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const policy = await readFile(new URL("../openshell-policy.yaml", import.meta.url), "utf8");

test("explicitly authorizes Pi Codex network traffic", () => {
	assert.match(policy, /^network_policies:/m);
	for (const binary of ["/usr/local/bin/node", "/usr/local/bin/pi"]) {
		assert.match(policy, new RegExp(`- path: ${binary.replaceAll("/", "\\/")}`));
	}
	for (const host of ["auth.openai.com", "api.openai.com", "chatgpt.com", "ab.chatgpt.com"]) {
		assert.match(policy, new RegExp(`- host: ${host.replaceAll(".", "\\.")}`));
	}
});
