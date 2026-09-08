import "@crm/env/load";

import { PrismaPg } from "@prisma/adapter-pg";
import { type Prisma, PrismaClient } from "./generated/prisma/client";
import { currentWorkspaceId } from "./workspace-scope";

const scopedModels = new Set([
	"Company",
	"Contact",
	"Deal",
	"Activity",
	"AgentTask",
	"MailboxSync",
	"EmailThread",
	"CalendarEvent",
	"SuppressedDomain",
	"SuppressedContact",
	"GtmResearchBrief",
	"GtmApproval",
	"GtmAuditEvent",
]);

const readOperations = new Set([
	"findUnique",
	"findUniqueOrThrow",
	"findFirst",
	"findFirstOrThrow",
	"findMany",
	"count",
	"aggregate",
	"groupBy",
	"update",
	"updateMany",
	"delete",
	"deleteMany",
]);

function scopedPrismaClient(client: PrismaClient) {
	return client.$extends({
		name: "workspaceScope",
		query: {
			$allModels: {
				async $allOperations({ model, operation, args, query }) {
					const organizationId = currentWorkspaceId();
					if (!organizationId || !scopedModels.has(model)) return query(args);

					if (readOperations.has(operation)) {
						const where = Reflect.get(args, "where");
						Reflect.set(args, "where", { ...where, organizationId });
					}

					if (operation === "create") {
						const data = Reflect.get(args, "data");
						Reflect.set(args, "data", { ...data, organizationId });
					}

					if (operation === "createMany") {
						const data = Reflect.get(args, "data");
						Reflect.set(
							args,
							"data",
							Array.isArray(data)
								? data.map((row) => ({ ...row, organizationId }))
								: { ...data, organizationId },
						);
					}

					return query(args);
				},
			},
		},
	});
}

const connectionString =
	process.env.NODE_ENV === "test" ? testDatabase() : liveDatabase();

function liveDatabase(): string {
	const url = process.env.DATABASE_URL;

	if (!url) {
		throw new Error(
			"DATABASE_URL is not set. Copy .env.example to .env at the root of the repo and fill it in, or set DATABASE_URL in the environment.",
		);
	}

	return url;
}

function testDatabase(): string {
	const url = process.env.TEST_DATABASE_URL;

	if (!url) {
		throw new Error(
			[
				"TEST_DATABASE_URL is not set, and the suite will not fall back to DATABASE_URL.",
				"",
				"These are real integration tests. They delete every workspace member and the",
				"organization row and put them back when the run finishes — so a run that is",
				"interrupted leaves everybody locked out of whatever database it was pointed at.",
				"The pre-push hook runs them, so that is one `git push` away from a database you",
				"care about.",
				"",
				"Make a throwaway one and point TEST_DATABASE_URL at it:",
				"",
				"    bun run db:test",
				"",
			].join("\n"),
		);
	}

	if (!databaseName(url).endsWith("_test")) {
		throw new Error(
			`TEST_DATABASE_URL must name a database ending in _test, so it cannot be one somebody is using. It names "${databaseName(url)}".`,
		);
	}

	return url;
}

function databaseName(url: string): string {
	try {
		return new URL(url).pathname.replace(/^\//, "");
	} catch {
		return url;
	}
}

export interface PrismaLogRecord {
	level: Prisma.LogLevel;
	message: string;
	target: string;
	durationMs?: number;
}

export type PrismaLogSink = (record: PrismaLogRecord) => void;

const consoleSink: PrismaLogSink = ({ level, message, target, durationMs }) => {
	const suffix = durationMs === undefined ? "" : ` (+${durationMs}ms)`;
	const line = `[prisma:${level}] ${message}${suffix} [${target}]`;

	if (level === "error") {
		console.error(line);
	} else if (level === "warn") {
		console.warn(line);
	} else {
		console.log(line);
	}
};

let sink: PrismaLogSink = consoleSink;

export function setPrismaLogSink(next: PrismaLogSink | null): void {
	sink = next ?? consoleSink;
}

const logQueries = process.env.PRISMA_LOG_QUERIES === "true";

const logDefinitions: Prisma.LogDefinition[] = [
	{ level: "warn", emit: "event" },
	{ level: "error", emit: "event" },
	...(logQueries
		? ([
				{ level: "query", emit: "event" },
				{ level: "info", emit: "event" },
			] satisfies Prisma.LogDefinition[])
		: []),
];

const createPrismaClient = () => {
	const rawClient = new PrismaClient({
		adapter: new PrismaPg({ connectionString }),
		log: logDefinitions,
	});

	rawClient.$on("error", ({ message, target }) => {
		sink({ level: "error", message, target });
	});
	rawClient.$on("warn", ({ message, target }) => {
		sink({ level: "warn", message, target });
	});
	rawClient.$on("info", ({ message, target }) => {
		sink({ level: "info", message, target });
	});
	rawClient.$on("query", ({ query, duration, target }) => {
		sink({ level: "query", message: query, target, durationMs: duration });
	});

	return scopedPrismaClient(rawClient) as PrismaClient;
};

declare global {
	var prisma: ReturnType<typeof createPrismaClient> | undefined;
}

export const db = globalThis.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
	globalThis.prisma = db;
}

export type Db = typeof db;
