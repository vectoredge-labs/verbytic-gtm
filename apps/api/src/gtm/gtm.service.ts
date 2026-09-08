import { canManageGtmPolicy, type VerbyticRole } from "@crm/auth";
import {
	currentWorkspaceId,
	type Db,
	GtmApprovalDecisionKind,
	GtmApprovalStatus,
	type GtmLifecycleStatus,
	type GtmRiskCategory,
	type Prisma,
} from "@crm/db";
import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { z } from "zod";
import { InjectDatabase } from "../database/database.constants";
import type {
	ApprovalQueueItem,
	accountStrategyInput,
	approvalDecisionInput,
	archiveContactInput,
	conversationStateInput,
	createDraftInput,
	InboxItem,
	ProspectDetail,
	researchBriefInput,
	reviseDraftInput,
} from "./gtm.contracts";
import { evidenceList } from "./gtm.contracts";

const lifecycleTransitions = {
	NEW: ["RESEARCHED", "ARCHIVED"],
	RESEARCHED: ["DRAFT_READY", "ARCHIVED"],
	DRAFT_READY: ["OUTREACH_PENDING_APPROVAL", "RESEARCHED", "ARCHIVED"],
	OUTREACH_PENDING_APPROVAL: ["DRAFT_READY", "CONTACTED", "ARCHIVED"],
	CONTACTED: ["REPLIED", "NOT_NOW", "MEETING_PROPOSED", "CLOSED", "ARCHIVED"],
	REPLIED: [
		"INTERESTED",
		"OBJECTION",
		"NOT_NOW",
		"MEETING_PROPOSED",
		"CLOSED",
		"ARCHIVED",
	],
	INTERESTED: [
		"MEETING_PROPOSED",
		"MEETING_BOOKED",
		"NOT_NOW",
		"CLOSED",
		"ARCHIVED",
	],
	OBJECTION: ["INTERESTED", "NOT_NOW", "CLOSED", "ARCHIVED"],
	NOT_NOW: ["RESEARCHED", "CONTACTED", "CLOSED", "ARCHIVED"],
	MEETING_PROPOSED: [
		"MEETING_BOOKED",
		"INTERESTED",
		"NOT_NOW",
		"CLOSED",
		"ARCHIVED",
	],
	MEETING_BOOKED: ["CLOSED", "ARCHIVED"],
	CLOSED: ["ARCHIVED"],
	SUPPRESSED: [],
	ARCHIVED: [],
} satisfies Record<GtmLifecycleStatus, readonly GtmLifecycleStatus[]>;

const restrictedRisks = new Set<GtmRiskCategory>([
	"STRATEGIC_ACCOUNT",
	"PRICING_COMMERCIAL",
	"NUMERIC_ROI",
	"LEGAL_SECURITY",
	"EXTERNAL_SEND",
]);
const riskPriority = {
	EXTERNAL_SEND: 6,
	LEGAL_SECURITY: 5,
	NUMERIC_ROI: 4,
	PRICING_COMMERCIAL: 3,
	STRATEGIC_ACCOUNT: 2,
	STANDARD: 1,
} satisfies Record<GtmRiskCategory, number>;
const storedStringList = z.array(z.string());

@Injectable()
export class GtmService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	list(status: GtmApprovalStatus): Promise<ApprovalQueueItem[]> {
		return this.db.gtmApproval
			.findMany({
				where: { status, draftRevisionId: { not: null } },
				orderBy: [
					{ company: { strategicAccount: "desc" } },
					{ draftRevision: { riskCategory: "desc" } },
					{ createdAt: "asc" },
				],
				select: {
					id: true,
					kind: true,
					riskReason: true,
					confidence: true,
					createdAt: true,
					contact: { select: { id: true, firstName: true, lastName: true } },
					company: { select: { id: true, name: true, strategicAccount: true } },
					draftRevision: {
						select: {
							id: true,
							revision: true,
							subject: true,
							content: true,
							riskCategory: true,
							evidenceReferences: true,
							draft: { select: { draftType: true } },
						},
					},
				},
			})
			.then((rows) =>
				rows
					.flatMap((row) =>
						row.draftRevision
							? [
									{
										...row,
										draftRevision: {
											...row.draftRevision,
											draftType: row.draftRevision.draft.draftType,
											evidenceReferences: evidenceList.parse(
												row.draftRevision.evidenceReferences,
											),
										},
									},
								]
							: [],
					)
					.sort((left, right) => {
						const strategic =
							Number(right.company?.strategicAccount ?? false) -
							Number(left.company?.strategicAccount ?? false);
						if (strategic !== 0) return strategic;
						return (
							riskPriority[right.draftRevision.riskCategory] -
							riskPriority[left.draftRevision.riskCategory]
						);
					}),
			);
	}

	async decide(
		input: z.infer<typeof approvalDecisionInput>,
		userId: string,
		role: VerbyticRole,
	) {
		const current = await this.db.gtmApproval.findFirst({
			where: { id: input.id, status: GtmApprovalStatus.PENDING },
			include: {
				company: { select: { strategicAccount: true } },
				draftRevision: { include: { draft: true } },
			},
		});
		if (!current?.draftRevision)
			throw new NotFoundException("Pending draft approval not found.");
		const draftRevision = current.draftRevision;
		this.assertApprovalPermission(
			role,
			current.company?.strategicAccount === true,
			draftRevision.riskCategory,
		);

		const organizationId = this.workspaceId();
		const decision = GtmApprovalDecisionKind[input.decision];
		if (
			decision === GtmApprovalDecisionKind.EDITED_LIGHTLY ||
			decision === GtmApprovalDecisionKind.REWROTE_HEAVILY
		) {
			return this.db.$transaction(async (tx) => {
				const revision = await tx.gtmOutboundDraftRevision.create({
					data: {
						draftId: draftRevision.draftId,
						revision: draftRevision.revision + 1,
						subject: input.editedSubject ?? draftRevision.subject,
						content: input.editedContent ?? draftRevision.content,
						senderIdentity: draftRevision.senderIdentity,
						riskCategory: draftRevision.riskCategory,
						evidenceReferences: evidenceList.parse(
							draftRevision.evidenceReferences,
						),
						authorUserId: userId,
					},
				});
				const now = new Date();
				await tx.gtmApproval.update({
					where: { id: current.id },
					data: {
						status: GtmApprovalStatus.REJECTED,
						decisionKind: decision,
						decisionNote: input.note,
						editedContent: input.editedContent,
						decidedById: userId,
						decidedAt: now,
						invalidatedAt: now,
						invalidatedByRevisionId: revision.id,
					},
				});
				const approved = await tx.gtmApproval.create({
					data: {
						organizationId,
						contactId: current.contactId,
						companyId: current.companyId,
						threadId: current.threadId,
						draftRevisionId: revision.id,
						kind: current.kind,
						riskReason: current.riskReason,
						evidence: evidenceList.parse(current.evidence),
						confidence: current.confidence,
						originalContent: revision.content,
						status: GtmApprovalStatus.APPROVED,
						decisionKind: decision,
						decidedById: userId,
						decidedAt: new Date(),
					},
					select: { id: true, status: true, decisionKind: true },
				});
				await this.auditTx(
					tx,
					userId,
					"GTM_DRAFT_REVISION",
					revision.id,
					"DRAFT_EDITED",
					{
						previousRevisionId: current.draftRevisionId,
						approvalId: approved.id,
					},
				);
				await this.auditTx(
					tx,
					userId,
					"GTM_APPROVAL",
					current.id,
					"APPROVAL_INVALIDATED",
					{
						status: GtmApprovalStatus.REJECTED,
						decision,
						replacementRevisionId: revision.id,
						replacementApprovalId: approved.id,
					},
				);
				await this.auditTx(
					tx,
					userId,
					"GTM_APPROVAL",
					approved.id,
					"APPROVAL_DECIDED",
					{
						status: GtmApprovalStatus.APPROVED,
						decision,
						draftRevisionId: revision.id,
					},
				);
				return approved;
			});
		}

		const status =
			decision === GtmApprovalDecisionKind.REJECTED ||
			decision === GtmApprovalDecisionKind.MARKED_DO_NOT_CONTACT
				? GtmApprovalStatus.REJECTED
				: decision === GtmApprovalDecisionKind.ESCALATED
					? GtmApprovalStatus.ESCALATED
					: GtmApprovalStatus.APPROVED;

		return this.db.$transaction(async (tx) => {
			const updated = await tx.gtmApproval.update({
				where: { id: current.id },
				data: {
					status,
					decisionKind: decision,
					decisionNote: input.note,
					decidedById: userId,
					decidedAt: new Date(),
				},
				select: { id: true, status: true, decisionKind: true },
			});
			await this.auditTx(
				tx,
				userId,
				"GTM_APPROVAL",
				current.id,
				"APPROVAL_DECIDED",
				{
					status,
					decision,
					draftRevisionId: current.draftRevisionId,
				},
			);
			return updated;
		});
	}

	async createDraft(input: z.infer<typeof createDraftInput>, userId: string) {
		const contact = await this.contactForOutbound(input.contactId);
		if (contact.gtmStatus !== "DRAFT_READY") {
			throw new BadRequestException(
				"A prospect must be draft ready before requesting approval.",
			);
		}
		if (input.threadId) {
			const thread = await this.db.emailThread.findFirst({
				where: { id: input.threadId, contactId: contact.id },
				select: { id: true },
			});
			if (!thread) throw new NotFoundException("Conversation not found.");
		}
		return this.db.$transaction(async (tx) => {
			const draft = await tx.gtmOutboundDraft.create({
				data: {
					organizationId: this.workspaceId(),
					contactId: contact.id,
					companyId: contact.companyId,
					threadId: input.threadId,
					draftType: input.draftType,
				},
			});
			const revision = await tx.gtmOutboundDraftRevision.create({
				data: {
					draftId: draft.id,
					revision: 1,
					subject: input.subject,
					content: input.content,
					senderIdentity: input.senderIdentity,
					riskCategory: contact.company?.strategicAccount
						? "STRATEGIC_ACCOUNT"
						: input.riskCategory,
					evidenceReferences: input.evidenceReferences,
					authorUserId: userId,
				},
			});
			const approval = await tx.gtmApproval.create({
				data: {
					organizationId: this.workspaceId(),
					contactId: contact.id,
					companyId: contact.companyId,
					threadId: input.threadId,
					draftRevisionId: revision.id,
					kind: input.draftType,
					riskReason: this.riskReason(
						contact.company?.strategicAccount === true,
						revision.riskCategory,
					),
					evidence: input.evidenceReferences,
					originalContent: input.content,
				},
			});
			await tx.contact.update({
				where: { id: contact.id },
				data: { gtmStatus: "OUTREACH_PENDING_APPROVAL" },
			});
			await this.auditTx(
				tx,
				userId,
				"CONTACT",
				contact.id,
				"LIFECYCLE_CHANGED",
				{ from: "DRAFT_READY", to: "OUTREACH_PENDING_APPROVAL" },
			);
			await this.auditTx(
				tx,
				userId,
				"GTM_DRAFT_REVISION",
				revision.id,
				"DRAFT_CREATED",
				{
					draftId: draft.id,
					revision: revision.revision,
					approvalId: approval.id,
				},
			);
			return {
				id: draft.id,
				revisionId: revision.id,
				revision: revision.revision,
				approvalId: approval.id,
			};
		});
	}

	async reviseDraft(input: z.infer<typeof reviseDraftInput>, userId: string) {
		const draft = await this.db.gtmOutboundDraft.findFirst({
			where: { id: input.draftId, status: "ACTIVE" },
			include: {
				contact: {
					include: { company: { select: { strategicAccount: true } } },
				},
				revisions: {
					orderBy: { revision: "desc" },
					take: 1,
					include: { approval: true },
				},
			},
		});
		const previous = draft?.revisions[0];
		if (!draft || !previous) throw new NotFoundException("Draft not found.");
		await this.contactForOutbound(draft.contactId);
		return this.db.$transaction(async (tx) => {
			const revision = await tx.gtmOutboundDraftRevision.create({
				data: {
					draftId: draft.id,
					revision: previous.revision + 1,
					subject: input.subject,
					content: input.content,
					senderIdentity: input.senderIdentity,
					riskCategory: draft.contact.company?.strategicAccount
						? "STRATEGIC_ACCOUNT"
						: input.riskCategory,
					evidenceReferences: input.evidenceReferences,
					authorUserId: userId,
				},
			});
			if (previous.approval) {
				const now = new Date();
				await tx.gtmApproval.update({
					where: { id: previous.approval.id },
					data:
						previous.approval.status === "PENDING"
							? {
									status: "REJECTED",
									decisionKind: "REJECTED",
									decisionNote: "Invalidated by a newer draft revision.",
									decidedById: userId,
									decidedAt: now,
									invalidatedAt: now,
									invalidatedByRevisionId: revision.id,
								}
							: {
									invalidatedAt: now,
									invalidatedByRevisionId: revision.id,
								},
				});
				await this.auditTx(
					tx,
					userId,
					"GTM_APPROVAL",
					previous.approval.id,
					"APPROVAL_INVALIDATED",
					{
						previousStatus: previous.approval.status,
						replacementRevisionId: revision.id,
					},
				);
			}
			const approval = await tx.gtmApproval.create({
				data: {
					organizationId: draft.organizationId,
					contactId: draft.contactId,
					companyId: draft.companyId,
					threadId: draft.threadId,
					draftRevisionId: revision.id,
					kind: draft.draftType,
					riskReason: this.riskReason(
						draft.contact.company?.strategicAccount === true,
						revision.riskCategory,
					),
					evidence: input.evidenceReferences,
					originalContent: input.content,
				},
			});
			await this.auditTx(
				tx,
				userId,
				"GTM_DRAFT_REVISION",
				revision.id,
				"DRAFT_REVISED",
				{
					previousRevisionId: previous.id,
					approvalId: approval.id,
				},
			);
			return {
				id: draft.id,
				revisionId: revision.id,
				revision: revision.revision,
				approvalId: approval.id,
			};
		});
	}

	async createResearchBrief(
		input: z.infer<typeof researchBriefInput>,
		userId: string,
	) {
		const contact = await this.db.contact.findFirst({
			where: { id: input.contactId },
			select: { id: true, companyId: true },
		});
		if (!contact) throw new NotFoundException("Contact not found.");
		const previous = await this.db.gtmResearchBrief.findFirst({
			where: { contactId: contact.id },
			orderBy: { version: "desc" },
			select: { id: true, version: true },
		});
		return this.db.$transaction(async (tx) => {
			const brief = await tx.gtmResearchBrief.create({
				data: {
					organizationId: this.workspaceId(),
					contactId: contact.id,
					companyId: contact.companyId,
					version: (previous?.version ?? 0) + 1,
					accountSummary: input.companySummary,
					companySignals: input.observedFacts,
					likelyPainPoints: input.inferredPainPoints,
					relevantUseCases: [input.likelyUseCase],
					bestOutreachAngle: input.outreachAngle,
					personalizationPoints: input.personalizationPoints,
					confidence: input.confidence,
					sources: input.evidenceReferences,
				},
			});
			if (previous) {
				await tx.gtmResearchBrief.update({
					where: { id: previous.id },
					data: { supersededById: brief.id },
				});
			}
			await this.auditTx(
				tx,
				userId,
				"GTM_RESEARCH_BRIEF",
				brief.id,
				"RESEARCH_BRIEF_CREATED",
				{
					version: brief.version,
					supersedes: previous?.id ?? null,
				},
			);
			return { id: brief.id, version: brief.version };
		});
	}

	async updateConversation(
		input: z.infer<typeof conversationStateInput>,
		userId: string,
	) {
		const before = await this.db.emailThread.findFirst({
			where: { id: input.threadId },
		});
		if (!before) throw new NotFoundException("Conversation not found.");
		const updated = await this.db.emailThread.update({
			where: { id: before.id },
			data: {
				replyClass: input.replyClass,
				needs: input.needs,
				objections: input.objections,
				commitments: input.commitments,
				nextAction: input.nextAction,
				nextActionDueAt: input.nextActionDueAt,
				currentOwnerId: input.currentOwnerId,
				summary: input.summary,
				summaryVersion: { increment: 1 },
				summaryFreshAt: input.summary ? new Date() : null,
			},
			select: { id: true, summaryVersion: true },
		});
		await this.audit(
			userId,
			"EMAIL_THREAD",
			updated.id,
			"CONVERSATION_STATE_UPDATED",
			{
				summaryVersion: before.summaryVersion,
			},
		);
		return updated;
	}

	async suppress(
		contactId: string,
		reason: string,
		userId: string,
		role: VerbyticRole,
	) {
		if (!canManageGtmPolicy(role))
			throw new ForbiddenException("Founder or Admin access is required.");
		const contact = await this.db.contact.findFirst({
			where: { id: contactId },
			select: { id: true, email: true, gtmStatus: true },
		});
		if (!contact?.email)
			throw new NotFoundException("Contact email not found.");
		const email = contact.email.toLowerCase();
		const [queuedSalesTasks, activeDrafts] = await Promise.all([
			this.db.agentTask.count({
				where: {
					contactId: contact.id,
					finishedAt: null,
					OR: [
						{ kind: { contains: "outreach", mode: "insensitive" } },
						{ kind: { contains: "follow", mode: "insensitive" } },
						{ kind: { contains: "sales", mode: "insensitive" } },
					],
				},
			}),
			this.db.gtmOutboundDraft.count({
				where: { contactId: contact.id, status: "ACTIVE" },
			}),
		]);
		return this.db.$transaction(async (tx) => {
			const now = new Date();
			const suppressed = await tx.suppressedContact.upsert({
				where: {
					organizationId_email: {
						organizationId: this.workspaceId(),
						email,
					},
				},
				create: {
					email,
					reason,
					createdById: userId,
				},
				update: { reason, createdById: userId },
				select: { id: true, email: true },
			});
			await tx.contact.update({
				where: { id: contact.id },
				data: {
					doNotContact: true,
					automationPaused: true,
					gtmStatus: "SUPPRESSED",
				},
			});
			await tx.agentTask.updateMany({
				where: {
					contactId: contact.id,
					finishedAt: null,
					OR: [
						{ kind: { contains: "outreach", mode: "insensitive" } },
						{ kind: { contains: "follow", mode: "insensitive" } },
						{ kind: { contains: "sales", mode: "insensitive" } },
					],
				},
				data: { finishedAt: now, outcome: "cancelled: contact suppressed" },
			});
			await tx.gtmOutboundDraft.updateMany({
				where: { contactId: contact.id, status: "ACTIVE" },
				data: {
					status: "CANCELLED",
					cancelledAt: now,
					cancelReason: "contact suppressed",
				},
			});
			await this.auditTx(
				tx,
				userId,
				"CONTACT",
				contact.id,
				"CONTACT_SUPPRESSED",
				{
					gtmStatus: contact.gtmStatus,
					reason,
				},
			);
			if (queuedSalesTasks > 0 || activeDrafts > 0) {
				await this.auditTx(
					tx,
					userId,
					"CONTACT",
					contact.id,
					"OUTBOUND_WORK_CANCELLED",
					{
						reason: "contact suppressed",
						queuedSalesTasks,
						activeDrafts,
					},
				);
			}
			return suppressed;
		});
	}

	async archive(input: z.infer<typeof archiveContactInput>, userId: string) {
		const contact = await this.db.contact.findFirst({
			where: { id: input.contactId },
			select: { id: true, gtmStatus: true, archivedAt: true },
		});
		if (!contact) throw new NotFoundException("Contact not found.");
		if (contact.gtmStatus === "SUPPRESSED")
			throw new BadRequestException("A suppressed contact stays suppressed.");
		return this.db.$transaction(async (tx) => {
			const now = new Date();
			const updated = await tx.contact.update({
				where: { id: contact.id },
				data: {
					gtmStatus: "ARCHIVED",
					archivedAt: now,
					automationPaused: true,
				},
				select: { id: true, gtmStatus: true },
			});
			const cancelledTasks = await tx.agentTask.updateMany({
				where: {
					contactId: contact.id,
					finishedAt: null,
					OR: [
						{ kind: { contains: "outreach", mode: "insensitive" } },
						{ kind: { contains: "follow", mode: "insensitive" } },
						{ kind: { contains: "sales", mode: "insensitive" } },
					],
				},
				data: { finishedAt: now, outcome: "cancelled: contact archived" },
			});
			const cancelledDrafts = await tx.gtmOutboundDraft.updateMany({
				where: { contactId: contact.id, status: "ACTIVE" },
				data: {
					status: "CANCELLED",
					cancelledAt: now,
					cancelReason: "contact archived",
				},
			});
			await this.auditTx(
				tx,
				userId,
				"CONTACT",
				contact.id,
				"CONTACT_ARCHIVED",
				{
					previousStatus: contact.gtmStatus,
					reason: input.reason,
				},
			);
			if (cancelledTasks.count > 0 || cancelledDrafts.count > 0) {
				await this.auditTx(
					tx,
					userId,
					"CONTACT",
					contact.id,
					"OUTBOUND_WORK_CANCELLED",
					{
						reason: "contact archived",
						queuedSalesTasks: cancelledTasks.count,
						activeDrafts: cancelledDrafts.count,
					},
				);
			}
			return updated;
		});
	}

	async restore(contactId: string, userId: string) {
		const contact = await this.db.contact.findFirst({
			where: { id: contactId, gtmStatus: "ARCHIVED" },
			select: { id: true },
		});
		if (!contact) throw new NotFoundException("Archived contact not found.");
		return this.db.$transaction(async (tx) => {
			const updated = await tx.contact.update({
				where: { id: contact.id },
				data: { gtmStatus: "NEW", archivedAt: null, automationPaused: false },
				select: { id: true, gtmStatus: true },
			});
			await this.auditTx(
				tx,
				userId,
				"CONTACT",
				contact.id,
				"CONTACT_RESTORED",
				{
					previousStatus: "ARCHIVED",
				},
			);
			return updated;
		});
	}

	async updateAccountStrategy(
		input: z.infer<typeof accountStrategyInput>,
		userId: string,
		role: VerbyticRole,
	) {
		if (!canManageGtmPolicy(role))
			throw new ForbiddenException("Founder or Admin access is required.");
		const before = await this.db.company.findFirst({
			where: { id: input.companyId },
		});
		if (!before) throw new NotFoundException("Company not found.");
		const updated = await this.db.company.update({
			where: { id: input.companyId },
			data: {
				strategicAccount: input.strategicAccount,
				segment: input.segment,
				icpTier: input.icpTier,
				primaryUseCase: input.primaryUseCase,
				accountStrategyNotes: input.accountStrategyNotes,
				ownerId: input.ownerId,
				knownInitiatives: input.knownInitiatives,
				verbyticUseCases: input.verbyticUseCases,
			},
			select: { id: true, strategicAccount: true },
		});
		await this.audit(
			userId,
			"COMPANY",
			updated.id,
			"ACCOUNT_STRATEGY_UPDATED",
			{
				strategicAccount: before.strategicAccount,
			},
		);
		if (before.strategicAccount !== updated.strategicAccount) {
			await this.audit(
				userId,
				"COMPANY",
				updated.id,
				"STRATEGIC_FLAG_CHANGED",
				{
					from: before.strategicAccount,
					to: updated.strategicAccount,
				},
			);
		}
		return updated;
	}

	async updateContactLifecycle(
		contactId: string,
		status: GtmLifecycleStatus,
		userId: string,
	) {
		const before = await this.db.contact.findFirst({
			where: { id: contactId },
		});
		if (!before) throw new NotFoundException("Contact not found.");
		if (status === "SUPPRESSED" || status === "ARCHIVED")
			throw new BadRequestException(
				"Use the protected suppression or archive action.",
			);
		if (!allowedLifecycleTransition(before.gtmStatus, status)) {
			throw new BadRequestException(
				`Cannot move from ${before.gtmStatus} to ${status}.`,
			);
		}
		const updated = await this.db.contact.update({
			where: { id: before.id },
			data: { gtmStatus: status },
			select: { id: true, gtmStatus: true },
		});
		await this.audit(userId, "CONTACT", updated.id, "LIFECYCLE_CHANGED", {
			from: before.gtmStatus,
			to: status,
		});
		return updated;
	}

	async inbox(): Promise<InboxItem[]> {
		const rows = await this.db.emailThread.findMany({
			where: { contact: { archivedAt: null } },
			orderBy: { lastMessageAt: "desc" },
			select: {
				id: true,
				subject: true,
				lastMessageAt: true,
				replyClass: true,
				nextAction: true,
				nextActionDueAt: true,
				summary: true,
				contact: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						gtmStatus: true,
					},
				},
				company: {
					select: { id: true, name: true, strategicAccount: true },
				},
				outboundDrafts: {
					where: { status: "ACTIVE" },
					orderBy: { createdAt: "desc" },
					take: 1,
					select: {
						revisions: {
							orderBy: { revision: "desc" },
							take: 1,
							select: {
								id: true,
								subject: true,
								content: true,
								approval: { select: { status: true } },
							},
						},
					},
				},
			},
		});
		return rows.flatMap(({ outboundDrafts, contact, ...thread }) => {
			if (!contact) return [];
			const revision = outboundDrafts[0]?.revisions[0];
			return [
				{
					...thread,
					contact,
					latestDraft: revision
						? {
								id: revision.id,
								subject: revision.subject,
								content: revision.content,
								approvalStatus: revision.approval?.status ?? null,
							}
						: null,
				},
			];
		});
	}

	async prospect(contactId: string): Promise<ProspectDetail> {
		const contact = await this.db.contact.findFirst({
			where: { id: contactId },
			select: {
				id: true,
				firstName: true,
				lastName: true,
				email: true,
				title: true,
				gtmStatus: true,
				doNotContact: true,
				archivedAt: true,
				owner: { select: { id: true, name: true } },
				company: {
					select: {
						id: true,
						name: true,
						strategicAccount: true,
						icpTier: true,
						primaryUseCase: true,
						accountStrategyNotes: true,
						owner: { select: { id: true, name: true } },
					},
				},
				researchBriefs: {
					orderBy: { version: "desc" },
					select: {
						id: true,
						version: true,
						accountSummary: true,
						companySignals: true,
						likelyPainPoints: true,
						relevantUseCases: true,
						bestOutreachAngle: true,
						personalizationPoints: true,
						confidence: true,
						sources: true,
						createdAt: true,
					},
				},
				emailThreads: {
					orderBy: { lastMessageAt: "desc" },
					select: {
						id: true,
						subject: true,
						replyClass: true,
						needs: true,
						objections: true,
						commitments: true,
						nextAction: true,
						nextActionDueAt: true,
						lastInboundAt: true,
						lastOutboundAt: true,
						currentOwner: { select: { id: true, name: true } },
						summary: true,
						summaryVersion: true,
						summaryFreshAt: true,
						messages: {
							orderBy: { sentAt: "asc" },
							select: {
								id: true,
								direction: true,
								fromEmail: true,
								body: true,
								sentAt: true,
							},
						},
					},
				},
				outboundDrafts: {
					orderBy: { createdAt: "desc" },
					select: {
						id: true,
						draftType: true,
						status: true,
						revisions: {
							orderBy: { revision: "desc" },
							select: {
								id: true,
								revision: true,
								subject: true,
								content: true,
								riskCategory: true,
								createdAt: true,
								approval: {
									select: {
										id: true,
										status: true,
										decisionKind: true,
										invalidatedAt: true,
										invalidatedByRevisionId: true,
									},
								},
							},
						},
					},
				},
				activities: {
					orderBy: { createdAt: "desc" },
					select: {
						id: true,
						type: true,
						subject: true,
						body: true,
						createdAt: true,
					},
				},
			},
		});
		if (!contact) throw new NotFoundException("Contact not found.");
		const relatedEntityIds = [
			contact.id,
			contact.company?.id,
			...contact.researchBriefs.map((brief) => brief.id),
			...contact.emailThreads.map((thread) => thread.id),
			...contact.outboundDrafts.flatMap((draft) => [
				draft.id,
				...draft.revisions.flatMap((revision) => [
					revision.id,
					revision.approval?.id,
				]),
			]),
		].filter((id): id is string => Boolean(id));
		const [auditEvents, tasks] = await Promise.all([
			this.db.gtmAuditEvent.findMany({
				where: { entityId: { in: relatedEntityIds } },
				orderBy: { createdAt: "desc" },
				select: { id: true, action: true, actorType: true, createdAt: true },
			}),
			this.db.agentTask.findMany({
				where: { contactId: contact.id },
				orderBy: { dueAt: "desc" },
				select: {
					id: true,
					kind: true,
					reason: true,
					dueAt: true,
					finishedAt: true,
					outcome: true,
				},
			}),
		]);
		return {
			...contact,
			researchBriefs: contact.researchBriefs.map((brief) => ({
				...brief,
				companySignals: this.stringList(brief.companySignals),
				likelyPainPoints: this.stringList(brief.likelyPainPoints),
				relevantUseCases: this.stringList(brief.relevantUseCases),
				personalizationPoints: this.stringList(brief.personalizationPoints),
				sources: evidenceList.parse(brief.sources),
			})),
			emailThreads: contact.emailThreads.map((thread) => ({
				...thread,
				needs: this.stringList(thread.needs),
				objections: this.stringList(thread.objections),
				commitments: this.stringList(thread.commitments),
			})),
			tasks,
			auditEvents,
		};
	}

	private async contactForOutbound(contactId: string) {
		const contact = await this.db.contact.findFirst({
			where: { id: contactId },
			include: { company: { select: { strategicAccount: true } } },
		});
		if (!contact) throw new NotFoundException("Contact not found.");
		if (contact.doNotContact || contact.gtmStatus === "SUPPRESSED")
			throw new ForbiddenException("Suppression blocks outbound drafts.");
		if (contact.archivedAt || contact.gtmStatus === "ARCHIVED")
			throw new ForbiddenException(
				"Archived contacts cannot receive outbound drafts.",
			);
		return contact;
	}

	private assertApprovalPermission(
		role: VerbyticRole,
		strategic: boolean,
		risk: GtmRiskCategory,
	): void {
		if (
			(strategic || restrictedRisks.has(risk)) &&
			role !== "founder" &&
			role !== "admin"
		) {
			throw new ForbiddenException("Founder or Admin approval is required.");
		}
	}

	private riskReason(strategic: boolean, risk: GtmRiskCategory): string {
		if (strategic)
			return "Strategic account requires Founder or Admin approval.";
		const reasons = {
			STANDARD: "Human review is required before any future send.",
			STRATEGIC_ACCOUNT:
				"Strategic account requires Founder or Admin approval.",
			PRICING_COMMERCIAL:
				"Pricing or commercial claim requires Founder or Admin approval.",
			NUMERIC_ROI: "Numeric or ROI claim requires Founder or Admin approval.",
			LEGAL_SECURITY:
				"Legal or security claim requires Founder or Admin approval.",
			EXTERNAL_SEND:
				"External send authorization requires Founder or Admin approval.",
		} satisfies Record<GtmRiskCategory, string>;
		return reasons[risk];
	}

	private workspaceId(): string {
		const organizationId = currentWorkspaceId();
		if (!organizationId)
			throw new ForbiddenException("Workspace scope is required.");
		return organizationId;
	}

	private stringList(value: Prisma.JsonValue): string[] {
		return storedStringList.parse(value);
	}

	private audit(
		userId: string,
		entityType: string,
		entityId: string,
		action: string,
		after: Prisma.InputJsonObject,
	): Promise<void> {
		return this.auditTx(this.db, userId, entityType, entityId, action, after);
	}

	private async auditTx(
		tx: Prisma.TransactionClient | Db,
		userId: string,
		entityType: string,
		entityId: string,
		action: string,
		after: Prisma.InputJsonObject,
	): Promise<void> {
		await tx.gtmAuditEvent.create({
			data: {
				organizationId: this.workspaceId(),
				actorUserId: userId,
				actorType: "USER",
				entityType,
				entityId,
				action,
				after,
			},
		});
	}
}

function allowedLifecycleTransition(
	from: GtmLifecycleStatus,
	to: GtmLifecycleStatus,
): boolean {
	const allowed: readonly GtmLifecycleStatus[] = lifecycleTransitions[from];
	return allowed.includes(to);
}
