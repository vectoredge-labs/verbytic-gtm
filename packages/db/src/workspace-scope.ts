import { AsyncLocalStorage } from "node:async_hooks";

const workspaceScope = new AsyncLocalStorage<string>();

export function currentWorkspaceId(): string | undefined {
	return workspaceScope.getStore();
}

export function workspaceIdOrDefault(): string {
	return currentWorkspaceId() ?? "workspace";
}

export function withWorkspaceScope<Result>(
	organizationId: string,
	work: () => Result,
): Result {
	return workspaceScope.run(organizationId, work);
}
