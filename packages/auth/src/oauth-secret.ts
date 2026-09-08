import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes,
} from "node:crypto";

const ENVELOPE_VERSION = "v1";

function encryptionKey(): Buffer {
	const secret = process.env.BETTER_AUTH_SECRET;
	if (!secret)
		throw new Error(
			"BETTER_AUTH_SECRET is required for OAuth token encryption.",
		);
	return createHash("sha256").update(secret, "utf8").digest();
}

export function encryptOAuthSecret(value: string): string {
	const nonce = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", encryptionKey(), nonce);
	const ciphertext = Buffer.concat([
		cipher.update(value, "utf8"),
		cipher.final(),
	]);
	return [
		ENVELOPE_VERSION,
		nonce.toString("base64url"),
		cipher.getAuthTag().toString("base64url"),
		ciphertext.toString("base64url"),
	].join(".");
}

export function decryptOAuthSecret(value: string): string | null {
	const [version, nonce, tag, ciphertext] = value.split(".");
	if (version !== ENVELOPE_VERSION || !nonce || !tag || !ciphertext)
		return null;
	const decipher = createDecipheriv(
		"aes-256-gcm",
		encryptionKey(),
		Buffer.from(nonce, "base64url"),
	);
	decipher.setAuthTag(Buffer.from(tag, "base64url"));
	return Buffer.concat([
		decipher.update(Buffer.from(ciphertext, "base64url")),
		decipher.final(),
	]).toString("utf8");
}
