import assert from "node:assert/strict";
import test from "node:test";
import { isTerraformApply } from "../extensions/terraform-guard/command-policy.mjs";

test("detects Terraform apply commands", () => {
	for (const command of [
		"terraform apply",
		"terraform -chdir=infra apply -auto-approve",
		"terraform plan && terraform apply",
		"/usr/local/bin/terraform apply",
	]) {
		assert.equal(isTerraformApply(command), true, command);
	}
});

test("allows non-mutating Terraform commands", () => {
	for (const command of [
		"terraform fmt -check",
		"terraform validate",
		"terraform plan",
		"terraform apply-safe",
	]) {
		assert.equal(isTerraformApply(command), false, command);
	}
});
