import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
	defaultSessionDirectory,
	sessionDirectoryName,
	translateSessions,
} from "../bin/pi-openshell-sessions.mjs";

async function sessionHeader(file) {
	const [line] = (await readFile(file, "utf8")).split("\n");
	return JSON.parse(line);
}

test("matches Pi's cwd-based default session directory encoding", () => {
	assert.equal(sessionDirectoryName("/home/pi/workspace/app"), "--home-pi-workspace-app--");
	assert.equal(
		defaultSessionDirectory("/home/pi/.pi/agent", "/workspace/app"),
		"/home/pi/.pi/agent/sessions/--workspace-app--",
	);
});

test("translates only current-project sessions in both directions", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "pi-session-sync-"));
	const hostDir = path.join(root, "host");
	const sandboxDir = path.join(root, "sandbox");
	const restoredDir = path.join(root, "restored");
	const hostCwd = "/home/user/project";
	const sandboxCwd = "/workspace/project";
	await translateSessions(path.join(root, "missing"), hostDir, hostCwd, sandboxCwd);

	const hostSession = path.join(hostDir, "current.jsonl");
	await writeFile(
		hostSession,
		`${JSON.stringify({ type: "session", version: 3, cwd: hostCwd, parentSession: path.join(hostDir, "parent.jsonl") })}\n` +
			'{"type":"message","id":"abc"}\n',
	);
	await writeFile(
		path.join(hostDir, "foreign.jsonl"),
		`${JSON.stringify({ type: "session", version: 3, cwd: "/other/project" })}\n`,
	);

	const sandboxLogicalDir = "/home/pi/.pi/agent/sessions/--workspace-project--";
	assert.equal(
		await translateSessions(hostDir, sandboxDir, hostCwd, sandboxCwd, hostDir, sandboxLogicalDir),
		1,
	);
	const staged = await sessionHeader(path.join(sandboxDir, "current.jsonl"));
	assert.equal(staged.cwd, sandboxCwd);
	assert.equal(staged.parentSession, path.join(sandboxLogicalDir, "parent.jsonl"));

	assert.equal(
		await translateSessions(sandboxDir, restoredDir, sandboxCwd, hostCwd, sandboxLogicalDir, restoredDir),
		1,
	);
	const restored = await sessionHeader(path.join(restoredDir, "current.jsonl"));
	assert.equal(restored.cwd, hostCwd);
	assert.equal(restored.parentSession, path.join(restoredDir, "parent.jsonl"));
	await assert.rejects(readFile(path.join(restoredDir, "foreign.jsonl")), { code: "ENOENT" });
});
