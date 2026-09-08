import { beforeAll, describe, expect, it } from "bun:test";
import { db, withWorkspaceScope } from "@crm/db";
import { ForbiddenException } from "@nestjs/common";
import { GtmService } from "../src/gtm/gtm.service";

const organizationId = "gtm-phase-one-workspace";
const otherOrganizationId = "gtm-phase-one-other";
const userId = "gtm-phase-one-founder";
const service = new GtmService(db);

beforeAll(async () => {
	await db.organization.upsert({
		where: { id: organizationId },
		create: {
			id: organizationId,
			name: "GTM Phase One",
			slug: organizationId,
			createdAt: new Date(),
		},
		update: {},
	});
	await db.organization.upsert({
		where: { id: otherOrganizationId },
		create: {
			id: otherOrganizationId,
			name: "Other GTM Workspace",
			slug: otherOrganizationId,
			createdAt: new Date(),
		},
		update: {},
	});
	await db.user.upsert({
		where: { id: userId },
		create: {
			id: userId,
			name: "Phase One Founder",
			email: "phase-one-founder@verbytic.test",
		},
		update: {},
	});
});

async function fixture(label: string, strategic = false) {
	return withWorkspaceScope(organizationId, async () => {
		const company = await db.company.create({
			data: {
				name: `Company ${label}`,
				domain: `${label}.phase-one.test`,
				strategicAccount: strategic,
			},
		});
		const contact = await db.contact.create({
			data: {
				firstName: "Prospect",
				lastName: label,
				email: `${label}@phase-one.test`,
				companyId: company.id,
			},
		});
		return { company, contact };
	});
}

async function prepareForDraft(contactId: string) {
	await service.updateContactLifecycle(contactId, "RESEARCHED", userId);
	await service.updateContactLifecycle(contactId, "DRAFT_READY", userId);
}

describe("Phase 1 GTM controls", () => {
	it("enforces lifecycle transitions and writes attribution", async () => {
		const { contact } = await fixture("lifecycle");
		await withWorkspaceScope(organizationId, async () => {
			await expect(
				service.updateContactLifecycle(contact.id, "CONTACTED", userId),
			).rejects.toThrow("Cannot move from NEW to CONTACTED");
			await service.updateContactLifecycle(contact.id, "RESEARCHED", userId);
			const audit = await db.gtmAuditEvent.findFirst({
				where: { entityId: contact.id, action: "LIFECYCLE_CHANGED" },
			});
			expect(audit?.actorUserId).toBe(userId);
			expect(audit?.actorType).toBe("USER");
		});
	});

	it("binds approval to an immutable revision and invalidates edited approval", async () => {
		const { contact } = await fixture("draft");
		await withWorkspaceScope(organizationId, async () => {
			await prepareForDraft(contact.id);
			const created = await service.createDraft(
				{
					contactId: contact.id,
					draftType: "INITIAL_OUTREACH",
					subject: "Original subject",
					content: "Original exact content",
					senderIdentity: "founder@verbytic.ai",
					riskCategory: "STANDARD",
					evidenceReferences: [],
				},
				userId,
			);
			const approved = await service.decide(
				{
					id: created.approvalId,
					decision: "EDITED_LIGHTLY",
					editedSubject: "Edited subject",
					editedContent: "Edited exact content",
				},
				userId,
				"operator",
			);
			const original = await db.gtmApproval.findUnique({
				where: { id: created.approvalId },
			});
			const revision = await db.gtmOutboundDraftRevision.findUnique({
				where: { id: created.revisionId },
			});
			const edited = await db.gtmApproval.findUnique({
				where: { id: approved.id },
				include: { draftRevision: true },
			});
			expect(original?.status).toBe("REJECTED");
			expect(original?.invalidatedAt).not.toBeNull();
			expect(original?.invalidatedByRevisionId).toBe(edited?.draftRevision?.id);
			expect(edited?.status).toBe("APPROVED");
			expect(edited?.draftRevision?.revision).toBe(2);
			expect(edited?.draftRevision?.content).toBe("Edited exact content");
			await expect(
				Promise.resolve(
					db.gtmOutboundDraftRevision.update({
						where: { id: revision?.id },
						data: { content: "Mutated" },
					}),
				),
			).rejects.toThrow(/immutable|permission denied/);
			const revised = await service.reviseDraft(
				{
					draftId: created.id,
					subject: "Third subject",
					content: "Third exact content",
					senderIdentity: "founder@verbytic.ai",
					riskCategory: "STANDARD",
					evidenceReferences: [],
				},
				userId,
			);
			const [invalidatedApproval, pendingApproval] = await Promise.all([
				db.gtmApproval.findUnique({ where: { id: approved.id } }),
				db.gtmApproval.findUnique({ where: { id: revised.approvalId } }),
			]);
			expect(invalidatedApproval?.status).toBe("APPROVED");
			expect(invalidatedApproval?.invalidatedAt).not.toBeNull();
			expect(invalidatedApproval?.invalidatedByRevisionId).toBe(
				revised.revisionId,
			);
			expect(pendingApproval?.status).toBe("PENDING");
		});
	});

	it("requires Founder or Admin approval for strategic accounts", async () => {
		const { contact } = await fixture("strategic", true);
		await withWorkspaceScope(organizationId, async () => {
			await prepareForDraft(contact.id);
			const created = await service.createDraft(
				{
					contactId: contact.id,
					draftType: "INITIAL_OUTREACH",
					subject: "Strategic subject",
					content: "Strategic content",
					senderIdentity: "founder@verbytic.ai",
					riskCategory: "STANDARD",
					evidenceReferences: [],
				},
				userId,
			);
			await expect(
				service.decide(
					{ id: created.approvalId, decision: "APPROVED_UNCHANGED" },
					userId,
					"operator",
				),
			).rejects.toBeInstanceOf(ForbiddenException);
			const approved = await service.decide(
				{ id: created.approvalId, decision: "APPROVED_UNCHANGED" },
				userId,
				"founder",
			);
			expect(approved.status).toBe("APPROVED");
		});
	});

	it("suppression blocks drafts and cancels only queued sales work", async () => {
		const { contact } = await fixture("suppression");
		await withWorkspaceScope(organizationId, async () => {
			await prepareForDraft(contact.id);
			const draft = await service.createDraft(
				{
					contactId: contact.id,
					draftType: "FOLLOW_UP",
					subject: "Follow up",
					content: "Follow-up content",
					senderIdentity: "founder@verbytic.ai",
					riskCategory: "STANDARD",
					evidenceReferences: [],
				},
				userId,
			);
			const salesTask = await db.agentTask.create({
				data: {
					contactId: contact.id,
					kind: "sales-follow-up",
					reason: "Follow up",
					dueAt: new Date(),
				},
			});
			const researchTask = await db.agentTask.create({
				data: {
					contactId: contact.id,
					kind: "research-refresh",
					reason: "Refresh",
					dueAt: new Date(),
				},
			});
			await service.suppress(
				contact.id,
				"Prospect opted out.",
				userId,
				"admin",
			);
			const [storedContact, storedDraft, storedSalesTask, storedResearchTask] =
				await Promise.all([
					db.contact.findUnique({ where: { id: contact.id } }),
					db.gtmOutboundDraft.findUnique({ where: { id: draft.id } }),
					db.agentTask.findUnique({ where: { id: salesTask.id } }),
					db.agentTask.findUnique({ where: { id: researchTask.id } }),
				]);
			expect(storedContact?.gtmStatus).toBe("SUPPRESSED");
			expect(storedDraft?.status).toBe("CANCELLED");
			expect(storedSalesTask?.finishedAt).not.toBeNull();
			expect(storedResearchTask?.finishedAt).toBeNull();
			await expect(
				service.createDraft(
					{
						contactId: contact.id,
						draftType: "FOLLOW_UP",
						subject: "Blocked",
						content: "Blocked",
						senderIdentity: "founder@verbytic.ai",
						riskCategory: "STANDARD",
						evidenceReferences: [],
					},
					userId,
				),
			).rejects.toThrow("Suppression blocks");
		});
	});

	it("archives, cancels future sales work, and restores history", async () => {
		const { contact } = await fixture("archive");
		await withWorkspaceScope(organizationId, async () => {
			const task = await db.agentTask.create({
				data: {
					contactId: contact.id,
					kind: "outreach-reminder",
					reason: "Contact prospect",
					dueAt: new Date(),
				},
			});
			await service.archive(
				{ contactId: contact.id, reason: "No longer active." },
				userId,
			);
			expect(
				(await db.agentTask.findUnique({ where: { id: task.id } }))?.finishedAt,
			).not.toBeNull();
			expect(
				(await db.contact.findUnique({ where: { id: contact.id } }))?.gtmStatus,
			).toBe("ARCHIVED");
			await service.restore(contact.id, userId);
			const restored = await db.contact.findUnique({
				where: { id: contact.id },
			});
			expect(restored?.gtmStatus).toBe("NEW");
			expect(restored?.archivedAt).toBeNull();
		});
	});

	it("versions research and keeps observed facts separate from inference", async () => {
		const { contact } = await fixture("research");
		await withWorkspaceScope(organizationId, async () => {
			const input = {
				contactId: contact.id,
				companySummary: "A verified company summary.",
				observedFacts: ["Published a new product page."],
				inferredPainPoints: ["Likely needs consistent product language."],
				likelyUseCase: "Product messaging governance",
				personalizationPoints: ["Reference the product page."],
				outreachAngle: "Connect launch velocity with language quality.",
				evidenceReferences: [
					{ label: "Product page", url: "https://example.com/product" },
				],
				confidence: 0.8,
			};
			const first = await service.createResearchBrief(input, userId);
			const second = await service.createResearchBrief(
				{ ...input, companySummary: "Updated verified summary." },
				userId,
			);
			const stored = await db.gtmResearchBrief.findUnique({
				where: { id: first.id },
			});
			expect(first.version).toBe(1);
			expect(second.version).toBe(2);
			expect(stored?.supersededById).toBe(second.id);
			expect(stored?.companySignals).toEqual(input.observedFacts);
			expect(stored?.likelyPainPoints).toEqual(input.inferredPainPoints);
		});
	});

	it("does not expose another workspace's prospect", async () => {
		const other = await withWorkspaceScope(otherOrganizationId, () =>
			db.contact.create({
				data: {
					firstName: "Other",
					email: "other-workspace@phase-one.test",
				},
			}),
		);
		await withWorkspaceScope(organizationId, async () => {
			await expect(service.prospect(other.id)).rejects.toThrow(
				"Contact not found",
			);
		});
	});
});
