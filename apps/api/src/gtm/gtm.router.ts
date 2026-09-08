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
	contactLifecycleInput,
	contactLifecycleOutput,
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
			input.email,
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
		return this.gtm.updateContactLifecycle(input, ctx.user.id);
	}
}
