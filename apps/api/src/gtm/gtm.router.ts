import { Inject } from "@nestjs/common";
import {
	Ctx,
	Input,
	Mutation,
	Query,
	Router,
	UseMiddlewares,
} from "nestjs-trpc";
import type { z } from "zod";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import {
	type ApprovalQueueItem,
	accountStrategyInput,
	accountStrategyOutput,
	approvalDecisionInput,
	approvalListInput,
	approvalListOutput,
	approvalOutput,
	archiveContactInput,
	contactLifecycleInput,
	contactLifecycleOutput,
	conversationStateInput,
	conversationStateOutput,
	createDraftInput,
	draftOutput,
	inboxOutput,
	prospectDetailInput,
	prospectDetailOutput,
	researchBriefInput,
	researchBriefOutput,
	reviseDraftInput,
	suppressContactInput,
	suppressionOutput,
} from "./gtm.contracts";
import { GtmService } from "./gtm.service";

@Router({ alias: "gtm" })
@UseMiddlewares(AuthMiddleware)
export class GtmRouter {
	constructor(@Inject(GtmService) private readonly gtm: GtmService) {}

	@Query({ input: approvalListInput, output: approvalListOutput })
	listApprovals(
		@Input() input: z.infer<typeof approvalListInput>,
	): Promise<ApprovalQueueItem[]> {
		return this.gtm.list(input.status);
	}

	@Query({ output: inboxOutput })
	inbox() {
		return this.gtm.inbox();
	}

	@Query({ input: prospectDetailInput, output: prospectDetailOutput })
	prospect(@Input() input: z.infer<typeof prospectDetailInput>) {
		return this.gtm.prospect(input.contactId);
	}

	@Mutation({ input: approvalDecisionInput, output: approvalOutput })
	decideApproval(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof approvalDecisionInput>,
	) {
		return this.gtm.decide(input, ctx.user.id, ctx.workspace.role);
	}

	@Mutation({ input: suppressContactInput, output: suppressionOutput })
	suppressContact(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof suppressContactInput>,
	) {
		return this.gtm.suppress(
			input.contactId,
			input.reason,
			ctx.user.id,
			ctx.workspace.role,
		);
	}

	@Mutation({ input: accountStrategyInput, output: accountStrategyOutput })
	updateAccountStrategy(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof accountStrategyInput>,
	) {
		return this.gtm.updateAccountStrategy(
			input,
			ctx.user.id,
			ctx.workspace.role,
		);
	}

	@Mutation({ input: contactLifecycleInput, output: contactLifecycleOutput })
	updateContactLifecycle(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof contactLifecycleInput>,
	) {
		return this.gtm.updateContactLifecycle(
			input.contactId,
			input.status,
			ctx.user.id,
		);
	}

	@Mutation({ input: archiveContactInput, output: contactLifecycleOutput })
	archiveContact(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof archiveContactInput>,
	) {
		return this.gtm.archive(input, ctx.user.id);
	}

	@Mutation({ input: prospectDetailInput, output: contactLifecycleOutput })
	restoreContact(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof prospectDetailInput>,
	) {
		return this.gtm.restore(input.contactId, ctx.user.id);
	}

	@Mutation({ input: researchBriefInput, output: researchBriefOutput })
	createResearchBrief(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof researchBriefInput>,
	) {
		return this.gtm.createResearchBrief(input, ctx.user.id);
	}

	@Mutation({ input: createDraftInput, output: draftOutput })
	createDraft(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof createDraftInput>,
	) {
		return this.gtm.createDraft(input, ctx.user.id);
	}

	@Mutation({ input: reviseDraftInput, output: draftOutput })
	reviseDraft(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof reviseDraftInput>,
	) {
		return this.gtm.reviseDraft(input, ctx.user.id);
	}

	@Mutation({ input: conversationStateInput, output: conversationStateOutput })
	updateConversationState(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof conversationStateInput>,
	) {
		return this.gtm.updateConversation(input, ctx.user.id);
	}
}
