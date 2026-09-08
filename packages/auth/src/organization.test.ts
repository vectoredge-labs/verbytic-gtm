import { describe, expect, test } from "bun:test";
import {
	canDecideGtmApprovals,
	canManageGtmPolicy,
	toVerbyticRole,
} from "./organization";

describe("Verbytic roles", () => {
	test("maps Better Auth roles without changing stored values", () => {
		expect(toVerbyticRole("owner")).toBe("founder");
		expect(toVerbyticRole("admin")).toBe("admin");
		expect(toVerbyticRole("member")).toBe("operator");
	});

	test("limits policy and approval decisions", () => {
		expect(canDecideGtmApprovals("founder")).toBeTrue();
		expect(canDecideGtmApprovals("admin")).toBeTrue();
		expect(canDecideGtmApprovals("operator")).toBeFalse();
		expect(canManageGtmPolicy("operator")).toBeFalse();
	});
});
