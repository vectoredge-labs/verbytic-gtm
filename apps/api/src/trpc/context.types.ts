import type { Session, SessionUser, VerbyticRole } from "@crm/auth";
import type { Request } from "express";

export type BaseTrpcContext = {
	req?: Request;
	session: Session | null;
};

export type AuthedTrpcContext = BaseTrpcContext & {
	user: SessionUser;
	workspace: {
		id: string;
		role: VerbyticRole;
	};
};
