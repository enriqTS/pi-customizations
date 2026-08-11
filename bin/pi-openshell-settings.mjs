#!/usr/bin/env node

import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const boolean = (value) => typeof value === "boolean";
const string = (value) => typeof value === "string";
const finiteNumber = (value) => typeof value === "number" && Number.isFinite(value);
const stringArray = (value) => Array.isArray(value) && value.every(string);
const oneOf = (...values) => (value) => values.includes(value);
const object = (schema) => ({ schema });

// Deliberately omit settings that can execute commands, redirect traffic,
// reference arbitrary host paths, load packages, or weaken project trust.
const SAFE_SETTINGS = {
  lastChangelogVersion: string,
  theme: string,
  defaultProvider: string,
  defaultModel: string,
  defaultThinkingLevel: oneOf("off", "minimal", "low", "medium", "high", "xhigh", "max"),
  hideThinkingBlock: boolean,
  showCacheMissNotices: boolean,
  thinkingBudgets: object({
    minimal: finiteNumber,
    low: finiteNumber,
    medium: finiteNumber,
    high: finiteNumber,
    xhigh: finiteNumber,
    max: finiteNumber,
  }),
  quietStartup: boolean,
  collapseChangelog: boolean,
  enableInstallTelemetry: boolean,
  enableAnalytics: boolean,
  doubleEscapeAction: oneOf("tree", "fork", "none"),
  treeFilterMode: oneOf("default", "no-tools", "user-only", "labeled-only", "all"),
  editorPaddingX: finiteNumber,
  outputPad: finiteNumber,
  autocompleteMaxVisible: finiteNumber,
  showHardwareCursor: boolean,
  tuiMode: oneOf("regular", "fullscreen"),
  fullscreenScrollbar: oneOf("auto", "always", "hidden"),
  warnings: object({ anthropicExtraUsage: boolean }),
  compaction: object({
    enabled: boolean,
    reserveTokens: finiteNumber,
    keepRecentTokens: finiteNumber,
  }),
  branchSummary: object({
    reserveTokens: finiteNumber,
    skipPrompt: boolean,
  }),
  retry: object({
    enabled: boolean,
    maxRetries: finiteNumber,
    baseDelayMs: finiteNumber,
    provider: object({
      timeoutMs: finiteNumber,
      maxRetries: finiteNumber,
      maxRetryDelayMs: finiteNumber,
    }),
  }),
  steeringMode: oneOf("all", "one-at-a-time"),
  followUpMode: oneOf("all", "one-at-a-time"),
  transport: oneOf("sse", "websocket", "websocket-cached", "auto"),
  httpIdleTimeoutMs: finiteNumber,
  websocketConnectTimeoutMs: finiteNumber,
  terminal: object({
    showImages: boolean,
    imageWidthCells: finiteNumber,
    clearOnShrink: boolean,
  }),
  images: object({
    autoResize: boolean,
    blockImages: boolean,
  }),
  enabledModels: stringArray,
  markdown: object({
    codeBlockIndent: string,
    mermaid: oneOf("off", "final", "streaming"),
  }),
  enableSkillCommands: boolean,
};

function sanitizeObject(source, schema) {
  const result = {};
  if (!source || typeof source !== "object" || Array.isArray(source)) return result;

  for (const [key, validator] of Object.entries(schema)) {
    const value = source[key];
    if (typeof validator === "function") {
      if (validator(value)) result[key] = value;
    } else {
      const nested = sanitizeObject(value, validator.schema);
      if (Object.keys(nested).length > 0) result[key] = nested;
    }
  }
  return result;
}

export function sanitizeSettings(source) {
  return {
    ...sanitizeObject(source, SAFE_SETTINGS),
    extensions: ["/opt/pi-customizations/extensions"],
    skills: ["/opt/pi-customizations/skills"],
    prompts: ["/opt/pi-customizations/prompts"],
    themes: ["/opt/pi-customizations/themes"],
  };
}

export async function writeSanitizedSettings(sourcePath, destinationPath) {
  let source = {};
  try {
    source = JSON.parse(await readFile(sourcePath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw new Error(`cannot read host Pi settings at ${sourcePath}: ${error.message}`);
    }
  }

  const settings = sanitizeSettings(source);
  await mkdir(dirname(destinationPath), { recursive: true });
  await writeFile(destinationPath, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
  await chmod(destinationPath, 0o600);
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  if (process.argv.length !== 4) {
    console.error("usage: pi-openshell-settings.mjs HOST_SETTINGS OUTPUT_SETTINGS");
    process.exit(2);
  }
  await writeSanitizedSettings(process.argv[2], process.argv[3]);
}
