import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dockerfile = await readFile(new URL("../Dockerfile", import.meta.url), "utf8");

test("sources the complete Rust toolchain from the official image", () => {
	assert.match(dockerfile, /^FROM rust:latest AS rust$/m);
	assert.match(dockerfile, /^RUN rustup component add rustfmt clippy$/m);
	assert.match(dockerfile, /^COPY --from=rust \/usr\/local\/cargo \/usr\/local\/cargo$/m);
	assert.match(dockerfile, /^COPY --from=rust \/usr\/local\/rustup \/usr\/local\/rustup$/m);
	assert.match(dockerfile, /RUSTUP_HOME=\/usr\/local\/rustup/);
	assert.doesNotMatch(dockerfile, /^\s+(cargo|rustc|rustfmt) \\/m);
});
