import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isTerraformApply } from "./command-policy.mjs";

export default function (pi: ExtensionAPI) {
	pi.on("tool_call", (event) => {
		if (event.toolName !== "bash" || typeof event.input.command !== "string") return;
		if (!isTerraformApply(event.input.command)) return;

		return {
			block: true,
			terminate: true,
			reason: "terraform apply is forbidden in this sandbox; use terraform fmt, validate, or plan instead.",
		};
	});

	pi.on("user_bash", (event) => {
		if (!isTerraformApply(event.command)) return;
		return {
			result: {
				output: "terraform apply is forbidden in this sandbox; use terraform fmt, validate, or plan instead.",
				exitCode: 126,
				cancelled: false,
				truncated: false,
			},
		};
	});
}
