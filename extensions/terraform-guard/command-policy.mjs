/** Return true when a shell command contains a Terraform apply invocation. */
export function isTerraformApply(command) {
	// Treat a literal `terraform` executable followed by any ordinary Terraform
	// options and `apply` as forbidden. This intentionally favors false positives
	// over allowing a state-changing command.
	return /(?:^|[;&|\n(]\s*)(?:\S+\/)?terraform\b(?:\s+(?![;&|\n])[^\s;&|\n]+)*\s+apply(?=\s|[;&|]|$)/i.test(command);
}
