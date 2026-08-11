#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile, chmod } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

export function sessionDirectoryName(cwd) {
	const resolved = path.resolve(cwd);
	return `--${resolved.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
}

export function defaultSessionDirectory(agentDir, cwd) {
	return path.join(agentDir, "sessions", sessionDirectoryName(cwd));
}

function translateSessionPath(value, fromDir, toDir) {
	if (typeof value !== "string") return value;
	const relative = path.relative(fromDir, value);
	if (relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) {
		return path.join(toDir, relative);
	}
	return value;
}

async function translatedSession(sourcePath, fromCwd, toCwd, fromDir, toDir) {
	const text = await readFile(sourcePath, "utf8");
	const newline = text.indexOf("\n");
	const firstLine = newline === -1 ? text : text.slice(0, newline);
	const remainder = newline === -1 ? "" : text.slice(newline + 1);
	let header;
	try {
		header = JSON.parse(firstLine);
	} catch (error) {
		throw new Error(`invalid session header in ${sourcePath}: ${error.message}`);
	}
	if (header?.type !== "session" || path.resolve(header.cwd ?? "") !== path.resolve(fromCwd)) {
		return undefined;
	}
	header.cwd = path.resolve(toCwd);
	if (header.parentSession) {
		header.parentSession = translateSessionPath(header.parentSession, fromDir, toDir);
	}
	return `${JSON.stringify(header)}\n${remainder}`;
}

export async function translateSessions(
	sourceDir,
	destinationDir,
	fromCwd,
	toCwd,
	fromSessionDir = sourceDir,
	toSessionDir = destinationDir,
) {
	await mkdir(destinationDir, { recursive: true, mode: 0o700 });
	let entries;
	try {
		entries = await readdir(sourceDir, { withFileTypes: true });
	} catch (error) {
		if (error.code === "ENOENT") return 0;
		throw error;
	}
	let copied = 0;
	for (const entry of entries) {
		if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
		const sourcePath = path.join(sourceDir, entry.name);
		const translated = await translatedSession(
			sourcePath,
			fromCwd,
			toCwd,
			fromSessionDir,
			toSessionDir,
		);
		if (translated === undefined) continue;
		const destinationPath = path.join(destinationDir, entry.name);
		await writeFile(destinationPath, translated, { mode: 0o600 });
		await chmod(destinationPath, 0o600);
		copied++;
	}
	return copied;
}

async function main() {
	const [command, sourceDir, destinationDir, fromCwd, toCwd, fromSessionDir, toSessionDir] = process.argv.slice(2);
	if (command !== "translate" || !sourceDir || !destinationDir || !fromCwd || !toCwd) {
		console.error("usage: pi-openshell-sessions translate SOURCE_DIR DESTINATION_DIR FROM_CWD TO_CWD [FROM_SESSION_DIR TO_SESSION_DIR]");
		process.exit(2);
	}
	if ((fromSessionDir && !toSessionDir) || (!fromSessionDir && toSessionDir)) {
		throw new Error("FROM_SESSION_DIR and TO_SESSION_DIR must be provided together");
	}
	const copied = await translateSessions(
		sourceDir,
		destinationDir,
		fromCwd,
		toCwd,
		fromSessionDir,
		toSessionDir,
	);
	console.error(`pi-openshell-sessions: synchronized ${copied} session(s)`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
	main().catch((error) => {
		console.error(`pi-openshell-sessions: ${error.message}`);
		process.exit(1);
	});
}
