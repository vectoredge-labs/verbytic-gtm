import { organizationRoleOf, toVerbyticRole } from "@crm/auth";
import { withWorkspaceScope } from "@crm/db";
import { Injectable } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import type {
	MiddlewareOptions,
	MiddlewareResponse,
	TRPCMiddleware,
} from "nestjs-trpc";
import { setRequestUserId } from "../../logging/request-context";
import type { AuthedTrpcContext, BaseTrpcContext } from "../context.types";

@Injectable()
export class AuthMiddleware implements TRPCMiddleware {
	async use(opts: MiddlewareOptions): Promise<MiddlewareResponse> {
		const ctx = opts.ctx as BaseTrpcContext;
		const user = ctx.session?.user;

		if (!user) {
			throw new TRPCError({ code: "UNAUTHORIZED" });
		}

		setRequestUserId(user.id);
		const organizationId = ctx.session?.session.activeOrganizationId;
		if (!organizationId) {
			throw new TRPCError({
				code: "FORBIDDEN",
				message: "Select a workspace.",
			});
		}

		const storedRole = await organizationRoleOf(organizationId, user.id);
		if (!storedRole) {
			throw new TRPCError({
				code: "FORBIDDEN",
				message: "Workspace access is required.",
			});
		}

		const nextCtx: AuthedTrpcContext = {
			...ctx,
			user,
			workspace: { id: organizationId, role: toVerbyticRole(storedRole) },
		};
		return withWorkspaceScope(organizationId, () =>
			opts.next({ ctx: nextCtx }),
		);
	}
}
