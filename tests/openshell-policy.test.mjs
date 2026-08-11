import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const policy = await readFile(new URL("../openshell-policy.yaml", import.meta.url), "utf8");
const codexProfile = await readFile(new URL("../providers/pi-codex.yaml", import.meta.url), "utf8");

test("authorizes general HTTP and HTTPS egress", () => {
	assert.match(policy, /^  allow_general_web:$/m);
	assert.match(policy, /^      - path: \/\*\*$/m);
	assert.match(policy, /^      - ports: \[80, 443\]$/m);
	assert.match(policy, /^        allowed_ips:$/m);
	assert.match(policy, /^          - "2000::\/3"$/m);
	assert.match(policy, /^          - "104\.0\.0\.0\/5"$/m);
	for (const blocked of ["0.0.0.0/0", "10.0.0.0/8", "127.0.0.0/8", "169.254.0.0/16", "192.168.0.0/16"]) {
		assert.doesNotMatch(policy, new RegExp(`- "${blocked.replaceAll(".", "\\.").replaceAll("/", "\\/")}"`));
	}
});

test("keeps Codex credential routing scoped to Pi and OpenAI", () => {
	for (const binary of ["/usr/local/bin/node", "/usr/local/bin/pi"]) {
		assert.match(codexProfile, new RegExp(`- ${binary.replaceAll("/", "\\/")}`));
	}
	for (const host of ["auth.openai.com", "api.openai.com", "chatgpt.com", "ab.chatgpt.com"]) {
		assert.match(codexProfile, new RegExp(`- host: ${host.replaceAll(".", "\\.")}`));
	}
});
