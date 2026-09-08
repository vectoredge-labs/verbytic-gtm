import { z } from "zod";

export const lifecycleStatus = z.enum([
	"NEW",
	"RESEARCHED",
	"DRAFT_READY",
	"OUTREACH_PENDING_APPROVAL",
	"CONTACTED",
	"REPLIED",
	"INTERESTED",
	"OBJECTION",
	"NOT_NOW",
	"MEETING_PROPOSED",
	"MEETING_BOOKED",
	"CLOSED",
	"SUPPRESSED",
	"ARCHIVED",
]);

export const replyClass = z.enum([
	"INTERESTED",
	"QUESTION",
	"OBJECTION",
	"PRICING",
	"SECURITY_LEGAL",
	"REFERRAL",
	"NOT_NOW",
	"UNSUBSCRIBE",
	"BOOK_MEETING",
	"RESCHEDULE",
	"NEGATIVE",
	"OUT_OF_OFFICE",
	"UNKNOWN",
]);

export const riskCategory = z.enum([
	"STANDARD",
	"STRATEGIC_ACCOUNT",
	"PRICING_COMMERCIAL",
	"NUMERIC_ROI",
	"LEGAL_SECURITY",
	"EXTERNAL_SEND",
]);

export const draftType = z.enum([
	"INITIAL_OUTREACH",
	"FOLLOW_UP",
	"REPLY",
	"MEETING_PROPOSAL",
]);

const textList = z.array(z.string().trim().min(1).max(2_000)).max(100);
export const evidenceList = z.array(
	z.object({
		label: z.string().trim().min(1).max(300),
		url: z.string().url().max(2_000).optional(),
		note: z.string().trim().max(2_000).optional(),
	}),
);

export const approvalDecisionInput = z
	.object({
		id: z.string().min(1),
		decision: z.enum([
			"APPROVED_UNCHANGED",
			"EDITED_LIGHTLY",
			"REWROTE_HEAVILY",
			"REJECTED",
			"ESCALATED",
			"MARKED_DO_NOT_CONTACT",
		]),
		editedSubject: z.string().trim().min(1).max(500).optional(),
		editedContent: z.string().trim().min(1).max(100_000).optional(),
		note: z.string().max(2_000).optional(),
	})
	.superRefine((value, context) => {
		const edited =
			value.decision === "EDITED_LIGHTLY" ||
			value.decision === "REWROTE_HEAVILY";
		if (edited && (!value.editedSubject || !value.editedContent)) {
			context.addIssue({
				code: "custom",
				path: ["editedContent"],
				message: "An edited subject and message are required.",
			});
		}
	});

export const approvalListInput = z.object({
	status: z
		.enum(["PENDING", "APPROVED", "REJECTED", "ESCALATED"])
		.default("PENDING"),
});

export const approvalOutput = z.object({
	id: z.string(),
	status: z.string(),
	decisionKind: z.string().nullable(),
});

export const approvalListOutput = z.array(
	z.object({
		id: z.string(),
		kind: z.string(),
		riskReason: z.string(),
		confidence: z.number().nullable(),
		createdAt: z.date(),
		contact: z.object({
			id: z.string(),
			firstName: z.string(),
			lastName: z.string().nullable(),
		}),
		company: z
			.object({
				id: z.string(),
				name: z.string(),
				strategicAccount: z.boolean(),
			})
			.nullable(),
		draftRevision: z.object({
			id: z.string(),
			revision: z.number(),
			subject: z.string(),
			content: z.string(),
			draftType: z.string(),
			riskCategory: z.string(),
			evidenceReferences: evidenceList,
		}),
	}),
);
export type ApprovalQueueItem = z.infer<typeof approvalListOutput>[number];

export const suppressContactInput = z.object({
	contactId: z.string().min(1),
	reason: z.string().trim().min(1).max(2_000),
});
export const suppressionOutput = z.object({
	id: z.string(),
	email: z.string(),
});

export const archiveContactInput = z.object({
	contactId: z.string().min(1),
	reason: z.string().trim().min(1).max(2_000),
});
export const contactCommandOutput = z.object({
	id: z.string(),
	gtmStatus: lifecycleStatus,
});

export const accountStrategyInput = z.object({
	companyId: z.string().min(1),
	strategicAccount: z.boolean(),
	segment: z.string().trim().max(120).nullable().optional(),
	icpTier: z.string().trim().max(120).nullable().optional(),
	primaryUseCase: z.string().trim().max(500).nullable().optional(),
	accountStrategyNotes: z.string().trim().max(10_000).nullable().optional(),
	ownerId: z.string().min(1).nullable().optional(),
	knownInitiatives: textList.optional(),
	verbyticUseCases: textList.optional(),
});
export const accountStrategyOutput = z.object({
	id: z.string(),
	strategicAccount: z.boolean(),
});

export const contactLifecycleInput = z.object({
	contactId: z.string().min(1),
	status: lifecycleStatus,
});
export const contactLifecycleOutput = contactCommandOutput;

export const researchBriefInput = z.object({
	contactId: z.string().min(1),
	companySummary: z.string().trim().min(1).max(20_000),
	observedFacts: textList,
	inferredPainPoints: textList,
	likelyUseCase: z.string().trim().min(1).max(2_000),
	personalizationPoints: textList,
	outreachAngle: z.string().trim().min(1).max(5_000),
	evidenceReferences: evidenceList,
	confidence: z.number().min(0).max(1),
});
export const researchBriefOutput = z.object({
	id: z.string(),
	version: z.number(),
});

export const createDraftInput = z.object({
	contactId: z.string().min(1),
	threadId: z.string().min(1).optional(),
	draftType,
	subject: z.string().trim().min(1).max(500),
	content: z.string().trim().min(1).max(100_000),
	senderIdentity: z.string().trim().min(1).max(500),
	riskCategory,
	evidenceReferences: evidenceList,
});
export const reviseDraftInput = createDraftInput
	.omit({ contactId: true, threadId: true, draftType: true })
	.extend({ draftId: z.string().min(1) });
export const draftOutput = z.object({
	id: z.string(),
	revisionId: z.string(),
	revision: z.number(),
	approvalId: z.string(),
});

export const conversationStateInput = z.object({
	threadId: z.string().min(1),
	replyClass: replyClass.nullable(),
	needs: textList,
	objections: textList,
	commitments: textList,
	nextAction: z.string().trim().max(5_000).nullable(),
	nextActionDueAt: z.date().nullable(),
	currentOwnerId: z.string().min(1).nullable(),
	summary: z.string().trim().max(20_000).nullable(),
});
export const conversationStateOutput = z.object({
	id: z.string(),
	summaryVersion: z.number(),
});

const briefView = z.object({
	id: z.string(),
	version: z.number(),
	accountSummary: z.string().nullable(),
	companySignals: z.array(z.string()),
	likelyPainPoints: z.array(z.string()),
	relevantUseCases: z.array(z.string()),
	bestOutreachAngle: z.string().nullable(),
	personalizationPoints: z.array(z.string()),
	confidence: z.number().nullable(),
	sources: evidenceList,
	createdAt: z.date(),
});

const draftView = z.object({
	id: z.string(),
	draftType,
	status: z.enum(["ACTIVE", "CANCELLED"]),
	revisions: z.array(
		z.object({
			id: z.string(),
			revision: z.number(),
			subject: z.string(),
			content: z.string(),
			riskCategory,
			createdAt: z.date(),
			approval: z
				.object({
					id: z.string(),
					status: z.enum(["PENDING", "APPROVED", "REJECTED", "ESCALATED"]),
					decisionKind: z.string().nullable(),
					invalidatedAt: z.date().nullable(),
					invalidatedByRevisionId: z.string().nullable(),
				})
				.nullable(),
		}),
	),
});

export const prospectDetailInput = z.object({ contactId: z.string().min(1) });
export const prospectDetailOutput = z.object({
	id: z.string(),
	firstName: z.string(),
	lastName: z.string().nullable(),
	email: z.string().nullable(),
	title: z.string().nullable(),
	gtmStatus: lifecycleStatus,
	doNotContact: z.boolean(),
	archivedAt: z.date().nullable(),
	owner: z.object({ id: z.string(), name: z.string() }).nullable(),
	company: z
		.object({
			id: z.string(),
			name: z.string(),
			strategicAccount: z.boolean(),
			icpTier: z.string().nullable(),
			primaryUseCase: z.string().nullable(),
			accountStrategyNotes: z.string().nullable(),
			owner: z.object({ id: z.string(), name: z.string() }).nullable(),
		})
		.nullable(),
	researchBriefs: z.array(briefView),
	emailThreads: z.array(
		z.object({
			id: z.string(),
			subject: z.string().nullable(),
			replyClass: replyClass.nullable(),
			needs: z.array(z.string()),
			objections: z.array(z.string()),
			commitments: z.array(z.string()),
			nextAction: z.string().nullable(),
			nextActionDueAt: z.date().nullable(),
			lastInboundAt: z.date().nullable(),
			lastOutboundAt: z.date().nullable(),
			currentOwner: z.object({ id: z.string(), name: z.string() }).nullable(),
			summary: z.string().nullable(),
			summaryVersion: z.number(),
			summaryFreshAt: z.date().nullable(),
			messages: z.array(
				z.object({
					id: z.string(),
					direction: z.string(),
					fromEmail: z.string(),
					body: z.string().nullable(),
					sentAt: z.date(),
				}),
			),
		}),
	),
	outboundDrafts: z.array(draftView),
	activities: z.array(
		z.object({
			id: z.string(),
			type: z.string(),
			subject: z.string().nullable(),
			body: z.string().nullable(),
			createdAt: z.date(),
		}),
	),
	tasks: z.array(
		z.object({
			id: z.string(),
			kind: z.string(),
			reason: z.string(),
			dueAt: z.date(),
			finishedAt: z.date().nullable(),
			outcome: z.string().nullable(),
		}),
	),
	auditEvents: z.array(
		z.object({
			id: z.string(),
			action: z.string(),
			actorType: z.string(),
			createdAt: z.date(),
		}),
	),
});
export type ProspectDetail = z.infer<typeof prospectDetailOutput>;

export const inboxOutput = z.array(
	z.object({
		id: z.string(),
		subject: z.string().nullable(),
		lastMessageAt: z.date(),
		replyClass: replyClass.nullable(),
		nextAction: z.string().nullable(),
		nextActionDueAt: z.date().nullable(),
		summary: z.string().nullable(),
		contact: z.object({
			id: z.string(),
			firstName: z.string(),
			lastName: z.string().nullable(),
			gtmStatus: lifecycleStatus,
		}),
		company: z
			.object({
				id: z.string(),
				name: z.string(),
				strategicAccount: z.boolean(),
			})
			.nullable(),
		latestDraft: z
			.object({
				id: z.string(),
				subject: z.string(),
				content: z.string(),
				approvalStatus: z.string().nullable(),
			})
			.nullable(),
	}),
);
export type InboxItem = z.infer<typeof inboxOutput>[number];
