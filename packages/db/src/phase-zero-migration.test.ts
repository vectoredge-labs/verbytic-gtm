import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const database = new PGlite();

beforeAll(async () => {
	const root = join(import.meta.dir, "..", "prisma", "migrations");
	const entries = await readdir(root, { withFileTypes: true });
	for (const name of entries
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort()) {
		await database.exec(
			await readFile(join(root, name, "migration.sql"), "utf8"),
		);
	}
});

afterAll(async () => {
	await database.close();
});

describe("Phase 0 migration", () => {
	test("applies the complete migration lineage", async () => {
		const result = await database.query<{ tablename: string }>(
			"SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'gtm%'",
		);
		expect(result.rows.map((row) => row.tablename).sort()).toEqual([
			"gtmApproval",
			"gtmAuditEvent",
			"gtmResearchBrief",
		]);
	});

	test("denies migration and audit privileges to the runtime role", async () => {
		const result = await database.query<{
			audit_update: boolean;
			schema_create: boolean;
		}>(
			`SELECT has_schema_privilege('crm_runtime', 'public', 'CREATE') AS schema_create,
			 has_table_privilege('crm_runtime', '"gtmAuditEvent"', 'UPDATE') AS audit_update`,
		);
		expect(result.rows[0]).toEqual({
			schema_create: false,
			audit_update: false,
		});
	});

	test("rejects cross-workspace CRM links", async () => {
		await database.exec(`
			INSERT INTO "organization" ("id", "name", "slug", "createdAt")
			VALUES ('tenant-a', 'Tenant A', 'tenant-a', now()), ('tenant-b', 'Tenant B', 'tenant-b', now());
			INSERT INTO "company" ("id", "organizationId", "name", "domain", "createdAt", "updatedAt")
			VALUES ('company-a', 'tenant-a', 'Company A', 'shared.example', now(), now()),
			       ('company-b', 'tenant-b', 'Company B', 'shared.example', now(), now());
		`);
		await expect(
			database.exec(`
				INSERT INTO "contact" ("id", "organizationId", "firstName", "companyId", "createdAt", "updatedAt")
				VALUES ('contact-b', 'tenant-b', 'Contact B', 'company-a', now(), now());
			`),
		).rejects.toThrow("Cross-workspace company link is forbidden");
	});

	test("applies existing suppression policy to newly created contacts", async () => {
		await database.exec(`
			INSERT INTO "suppressedContact" ("id", "organizationId", "email", "createdAt")
			VALUES ('suppression-a', 'tenant-a', 'blocked@example.com', now());
			INSERT INTO "contact" ("id", "organizationId", "firstName", "email", "createdAt", "updatedAt")
			VALUES ('contact-suppressed', 'tenant-a', 'Blocked', 'blocked@example.com', now(), now());
		`);
		const result = await database.query<{
			automationPaused: boolean;
			doNotContact: boolean;
			gtmStatus: string;
		}>(
			`SELECT "doNotContact", "automationPaused", "gtmStatus"::text
			 FROM "contact" WHERE "id" = 'contact-suppressed'`,
		);
		expect(result.rows[0]).toEqual({
			automationPaused: true,
			doNotContact: true,
			gtmStatus: "DO_NOT_CONTACT",
		});
	});
});
