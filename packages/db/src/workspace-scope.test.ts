import { describe, expect, test } from "bun:test";
import { currentWorkspaceId, withWorkspaceScope } from "./workspace-scope";

describe("workspace scope", () => {
	test("keeps concurrent workspaces isolated", async () => {
		const [first, second] = await Promise.all([
			withWorkspaceScope("alpha", async () => {
				await Promise.resolve();
				return currentWorkspaceId();
			}),
			withWorkspaceScope("beta", async () => {
				await Promise.resolve();
				return currentWorkspaceId();
			}),
		]);
		expect(first).toBe("alpha");
		expect(second).toBe("beta");
		expect(currentWorkspaceId()).toBeUndefined();
	});
});
