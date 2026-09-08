import {
	canDecideGtmApprovals,
	canManageGtmPolicy,
	type VerbyticRole,
} from "@crm/auth";
import {
	currentWorkspaceId,
	type Db,
	GtmApprovalDecisionKind,
	GtmApprovalStatus,
	workspaceIdOrDefault,
} from "@crm/db";
import {
	ForbiddenException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import type { z } from "zod";
import { InjectDatabase } from "../database/database.constants";
import type {
	ApprovalQueueItem,
	accountStrategyInput,
	approvalDecisionInput,
	contactLifecycleInput,
} from "./gtm.contracts";

@Injectable()
export class GtmService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	list(status: GtmApprovalStatus): Promise<ApprovalQueueItem[]> {
		return this.db.gtmApproval.findMany({
			where: { status },
			orderBy: [
				{ company: { strategicAccount: "desc" } },
				{ createdAt: "asc" },
			],
			select: {
				id: true,
				kind: true,
				riskReason: true,
				confidence: true,
				originalContent: true,
				editedContent: true,
				createdAt: true,
				contact: { select: { id: true, firstName: true, lastName: true } },
				company: { select: { id: true, name: true, strategicAccount: true } },
			},
		});
	}

	async decide(
		input: z.infer<typeof approvalDecisionInput>,
		userId: string,
		role: VerbyticRole,
	) {
		if (!canDecideGtmApprovals(role))
			throw new ForbiddenException("Founder or Admin approval is required.");
		const current = await this.db.gtmApproval.findFirst({
			where: { id: input.id, status: GtmApprovalStatus.PENDING },
		});
		if (!current) throw new NotFoundException("Pending approval not found.");
		const organizationId = currentWorkspaceId();
		if (!organizationId)
			throw new ForbiddenException("Workspace scope is required.");
		const decision = GtmApprovalDecisionKind[input.decision];
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
					editedContent: input.editedContent,
					decidedById: userId,
					decidedAt: new Date(),
				},
				select: { id: true, status: true, decisionKind: true },
			});
			if (decision === GtmApprovalDecisionKind.MARKED_DO_NOT_CONTACT) {
				await tx.contact.update({
					where: { id: current.contactId },
					data: {
						doNotContact: true,
						automationPaused: true,
						gtmStatus: "DO_NOT_CONTACT",
					},
				});
			}
			await tx.gtmAuditEvent.create({
				data: {
					organizationId,
					actorUserId: userId,
					actorType: "USER",
					entityType: "GTM_APPROVAL",
					entityId: current.id,
					action: `DECISION_${decision}`,
					before: { status: current.status },
					after: { status, decision },
				},
			});
			return updated;
		});
	}

	async suppress(
		email: string,
		reason: string | undefined,
		userId: string,
		role: VerbyticRole,
	) {
		if (!canManageGtmPolicy(role))
			throw new ForbiddenException("Founder or Admin access is required.");
		return this.db.suppressedContact.upsert({
			where: {
				organizationId_email: {
					organizationId: workspaceIdOrDefault(),
					email,
				},
			},
			create: { email: email.toLowerCase(), reason, createdById: userId },
			update: { reason, createdById: userId },
			select: { id: true, email: true },
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
				knownInitiatives: input.knownInitiatives,
				verbyticUseCases: input.verbyticUseCases,
			},
			select: { id: true, strategicAccount: true },
		});
		await this.audit(userId, "COMPANY", updated.id, "STRATEGY_UPDATED", {
			strategicAccount: before.strategicAccount,
		});
		return updated;
	}

	async updateContactLifecycle(
		input: z.infer<typeof contactLifecycleInput>,
		userId: string,
	) {
		const before = await this.db.contact.findFirst({
			where: { id: input.contactId },
		});
		if (!before) throw new NotFoundException("Contact not found.");
		if (before.doNotContact)
			throw new ForbiddenException(
				"A suppressed contact cannot re-enter the lifecycle.",
			);
		const updated = await this.db.contact.update({
			where: { id: input.contactId },
			data: { gtmStatus: input.status },
			select: { id: true, gtmStatus: true },
		});
		await this.audit(userId, "CONTACT", updated.id, "LIFECYCLE_UPDATED", {
			gtmStatus: before.gtmStatus,
		});
		return updated;
	}

	private async audit(
		userId: string,
		entityType: string,
		entityId: string,
		action: string,
		before: object,
	): Promise<void> {
		const organizationId = currentWorkspaceId();
		if (!organizationId)
			throw new ForbiddenException("Workspace scope is required.");
		await this.db.gtmAuditEvent.create({
			data: {
				organizationId,
				actorUserId: userId,
				actorType: "USER",
				entityType,
				entityId,
				action,
				before,
			},
		});
	}
}
