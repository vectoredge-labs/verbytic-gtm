import "reflect-metadata";
import { describe, expect, test } from "bun:test";
import { DeploymentEnvironment, validateEnv } from "./env.validation";

const base = {
	DATABASE_URL: "postgresql://runtime@localhost/crm",
	BETTER_AUTH_SECRET: "12345678901234567890123456789012",
	ALLOWED_SIGN_IN: "verbytic.ai",
};

describe("environment isolation", () => {
	test("rejects a preview application with production data", () => {
		expect(() =>
			validateEnv({
				...base,
				NODE_ENV: "production",
				DEPLOYMENT_ENVIRONMENT: "preview",
				DATABASE_ENVIRONMENT: "production",
			}),
		).toThrow("must match");
	});

	test("accepts an isolated preview database", () => {
		expect(
			validateEnv({
				...base,
				NODE_ENV: "production",
				DEPLOYMENT_ENVIRONMENT: "preview",
				DATABASE_ENVIRONMENT: "preview",
			}).DATABASE_ENVIRONMENT,
		).toBe(DeploymentEnvironment.Preview);
	});

	test("rejects shared runtime and migration users", () => {
		expect(() =>
			validateEnv({
				...base,
				MIGRATION_DATABASE_URL: "postgresql://runtime@localhost/crm",
			}),
		).toThrow("must differ");
	});
});
