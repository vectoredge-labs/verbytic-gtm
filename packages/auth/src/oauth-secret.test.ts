import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { decryptOAuthSecret, encryptOAuthSecret } from "./oauth-secret";

const previousSecret = process.env.BETTER_AUTH_SECRET;

describe("OAuth secret encryption", () => {
	beforeEach(() => {
		process.env.BETTER_AUTH_SECRET =
			"phase-zero-test-secret-with-32-characters";
	});

	afterEach(() => {
		process.env.BETTER_AUTH_SECRET = previousSecret;
	});

	test("encrypts with unique authenticated envelopes", () => {
		const first = encryptOAuthSecret("token-value");
		const second = encryptOAuthSecret("token-value");
		expect(first).not.toContain("token-value");
		expect(first).not.toBe(second);
		expect(decryptOAuthSecret(first)).toBe("token-value");
	});

	test("rejects legacy plaintext", () => {
		expect(decryptOAuthSecret("legacy-token")).toBeNull();
	});
});
