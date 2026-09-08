import { z } from "zod";

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
		editedContent: z.string().trim().min(1).max(100_000).optional(),
		note: z.string().max(2_000).optional(),
	})
	.superRefine((value, context) => {
		if (
			(value.decision === "EDITED_LIGHTLY" ||
				value.decision === "REWROTE_HEAVILY") &&
			!value.editedContent
		) {
			context.addIssue({
				code: "custom",
				path: ["editedContent"],
				message: "Edited content is required for this decision.",
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
		originalContent: z.string(),
		editedContent: z.string().nullable(),
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
	}),
);
export type ApprovalQueueItem = z.infer<typeof approvalListOutput>[number];

export const suppressContactInput = z.object({
	email: z.string().email(),
	reason: z.string().max(2_000).optional(),
});

export const suppressionOutput = z.object({
	id: z.string(),
	email: z.string(),
});

export const accountStrategyInput = z.object({
	companyId: z.string().min(1),
	strategicAccount: z.boolean(),
	segment: z.string().trim().max(120).nullable().optional(),
	icpTier: z.string().trim().max(120).nullable().optional(),
	knownInitiatives: z.array(z.string().trim().min(1).max(500)).max(50),
	verbyticUseCases: z.array(z.string().trim().min(1).max(500)).max(50),
});

export const accountStrategyOutput = z.object({
	id: z.string(),
	strategicAccount: z.boolean(),
});

export const contactLifecycleInput = z.object({
	contactId: z.string().min(1),
	status: z.enum([
		"NEW",
		"RESEARCHED",
		"READY_FOR_OUTREACH",
		"CONTACTED",
		"ENGAGED",
		"MEETING_PROPOSED",
		"MEETING_BOOKED",
		"QUALIFIED",
		"NURTURE",
		"CLOSED_LOST",
	]),
});

export const contactLifecycleOutput = z.object({
	id: z.string(),
	gtmStatus: z.string(),
});
