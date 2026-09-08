import { currentWorkspaceId, type Db, db } from "@crm/db";
import { WORKSPACE_ID, workspaceSlug } from "@crm/db/workspace";

export { WORKSPACE_ID };

export const DEFAULT_WORKSPACE_NAME = "CRM";

export const WORKSPACE_ROLES = ["owner", "admin", "member"] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];
export const VERBYTIC_ROLES = ["founder", "admin", "operator"] as const;
export type VerbyticRole = (typeof VERBYTIC_ROLES)[number];

export function toVerbyticRole(role: WorkspaceRole): VerbyticRole {
	if (role === "owner") return "founder";
	if (role === "admin") return "admin";
	return "operator";
}

export function canDecideGtmApprovals(role: VerbyticRole): boolean {
	return role === "founder" || role === "admin";
}

export function canManageGtmPolicy(role: VerbyticRole): boolean {
	return role === "founder" || role === "admin";
}

export function isWorkspaceRole(value: string): value is WorkspaceRole {
	return (WORKSPACE_ROLES as readonly string[]).includes(value);
}

export function isWorkspaceAdmin(role: WorkspaceRole | null): boolean {
	return role === "owner" || role === "admin";
}

export function canRenameWorkspace(role: WorkspaceRole | null): boolean {
	return isWorkspaceAdmin(role);
}

export function canChangeRole(role: WorkspaceRole | null): boolean {
	return isWorkspaceAdmin(role);
}

export function canManageCurrency(role: WorkspaceRole | null): boolean {
	return isWorkspaceAdmin(role);
}

export function canManageConnections(role: WorkspaceRole | null): boolean {
	return isWorkspaceAdmin(role);
}

export function canManageTracking(role: WorkspaceRole | null): boolean {
	return isWorkspaceAdmin(role);
}

export async function ensureWorkspaceMembership(
	userId: string,
): Promise<string | undefined> {
	try {
		return await db.$transaction(async (tx) => {
			const membership = await tx.member.findFirst({
				where: { userId },
				orderBy: { createdAt: "asc" },
				select: { organizationId: true },
			});
			if (membership) return membership.organizationId;

			const memberCount = await tx.member.count();
			if (memberCount > 0) return undefined;

			const workspace = await tx.organization.upsert({
				where: { id: WORKSPACE_ID },
				create: {
					id: WORKSPACE_ID,
					name: DEFAULT_WORKSPACE_NAME,
					slug: workspaceSlug(DEFAULT_WORKSPACE_NAME),
					createdAt: new Date(),
				},
				update: {},
				select: { id: true, name: true, slug: true },
			});

			const slug = workspaceSlug(workspace.name);

			if (workspace.slug !== slug) {
				await tx.organization.update({
					where: { id: workspace.id },
					data: { slug },
				});
			}

			await tx.member.create({
				data: {
					id: crypto.randomUUID(),
					organizationId: workspace.id,
					userId,
					role: "owner",
					createdAt: new Date(),
				},
			});

			return workspace.id;
		});
	} catch (error) {
		console.error(
			`[auth] could not enrol user ${userId} in workspace ${WORKSPACE_ID}; the next sign-in will retry`,
			error,
		);
		return undefined;
	}
}

export function toWorkspaceRole(value: string): WorkspaceRole {
	return isWorkspaceRole(value) ? value : "member";
}

export type WorkspaceMemberReader = Pick<Db, "member">;

export async function workspaceRoleOf(
	userId: string,
	client: WorkspaceMemberReader = db,
): Promise<WorkspaceRole | null> {
	const member = await client.member.findUnique({
		where: {
			organizationId_userId: {
				organizationId: currentWorkspaceId() ?? WORKSPACE_ID,
				userId,
			},
		},
		select: { role: true },
	});

	return member ? toWorkspaceRole(member.role) : null;
}

export async function organizationRoleOf(
	organizationId: string,
	userId: string,
	client: WorkspaceMemberReader = db,
): Promise<WorkspaceRole | null> {
	const member = await client.member.findUnique({
		where: { organizationId_userId: { organizationId, userId } },
		select: { role: true },
	});

	return member ? toWorkspaceRole(member.role) : null;
}
