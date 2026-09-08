import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { ensureWorkspaceMembership, WORKSPACE_ID } from "../src/organization";

const suffix = process.env.TEST_RUN_ID ?? "organization-spec";

const emailOf = (label: string) => `${label}.${suffix}@example.test`;

let firstId: string;
let secondId: string;

const seedUser = async (label: string, createdAt: Date): Promise<string> => {
	const user = await db.user.create({
		data: {
			id: `${suffix}-${label}`,
			name: label,
			email: emailOf(label),
			createdAt,
			updatedAt: createdAt,
		},
		select: { id: true },
	});

	return user.id;
};

const roleOf = async (userId: string): Promise<string | null> => {
	const member = await db.member.findUnique({
		where: { organizationId_userId: { organizationId: WORKSPACE_ID, userId } },
		select: { role: true },
	});

	return member?.role ?? null;
};

const clear = async () => {
	await db.member.deleteMany({
		where: { userId: { startsWith: `${suffix}-` } },
	});
	await db.user.deleteMany({
		where: { email: { endsWith: `.${suffix}@example.test` } },
	});

	const strangers = await db.member.count({
		where: { organizationId: WORKSPACE_ID },
	});

	if (strangers > 0) {
		throw new Error(
			`${strangers} member row(s) this spec did not create are in the workspace, and it needs an empty one to test the owner backfill. It will not delete them: that is somebody's access. Point TEST_DATABASE_URL at a database of your own, or find the spec that leaked them.`,
		);
	}
};

beforeEach(async () => {
	await clear();

	firstId = await seedUser("first", new Date("2020-01-01T00:00:00Z"));
	secondId = await seedUser("second", new Date("2021-01-01T00:00:00Z"));
});

afterAll(clear);

describe("ensureWorkspaceMembership", () => {
	it("bootstraps only the first signer when no membership exists", async () => {
		const workspaceId = await ensureWorkspaceMembership(secondId);

		expect(workspaceId).toBe(WORKSPACE_ID);
		expect(await roleOf(firstId)).toBeNull();
		expect(await roleOf(secondId)).toBe("owner");
	});

	it("is idempotent, so signing in again neither duplicates nor re-roles", async () => {
		await ensureWorkspaceMembership(secondId);

		await db.member.update({
			where: {
				organizationId_userId: {
					organizationId: WORKSPACE_ID,
					userId: secondId,
				},
			},
			data: { role: "admin" },
		});

		await ensureWorkspaceMembership(secondId);
		await ensureWorkspaceMembership(secondId);

		const rows = await db.member.findMany({
			where: { organizationId: WORKSPACE_ID, userId: secondId },
		});

		expect(rows).toHaveLength(1);
		expect(rows[0]?.role).toBe("admin");
	});

	it("does not auto-enrol someone who signs up later", async () => {
		await ensureWorkspaceMembership(secondId);

		const laterId = await seedUser("later", new Date("2026-01-01T00:00:00Z"));

		const workspaceId = await ensureWorkspaceMembership(laterId);

		expect(workspaceId).toBeUndefined();
		expect(await roleOf(laterId)).toBeNull();
	});

	it("leaves the existing owner alone when a later arrival signs in", async () => {
		await ensureWorkspaceMembership(secondId);

		const laterId = await seedUser("later", new Date("2026-01-01T00:00:00Z"));

		await ensureWorkspaceMembership(laterId);

		expect(await roleOf(firstId)).toBeNull();
		expect(await roleOf(secondId)).toBe("owner");
		expect(await roleOf(laterId)).toBeNull();

		const owners = await db.member.count({
			where: { organizationId: WORKSPACE_ID, role: "owner" },
		});

		expect(owners).toBe(1);
	});
});
