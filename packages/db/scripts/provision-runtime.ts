import "@crm/env/load";

import pg from "pg";

const adminUrl = process.env.MIGRATION_DATABASE_URL;
const runtimeUrl = process.env.DATABASE_URL;
if (!adminUrl || !runtimeUrl) {
	throw new Error("MIGRATION_DATABASE_URL and DATABASE_URL are required.");
}

const admin = new URL(adminUrl);
const runtime = new URL(runtimeUrl);
if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(runtime.username)) {
	throw new Error("DATABASE_URL has an invalid runtime user name.");
}
if (admin.username === runtime.username) {
	throw new Error("Runtime and migration database users must differ.");
}

const client = new pg.Client({ connectionString: admin.toString() });
await client.connect();
try {
	const exists = await client.query(
		"SELECT 1 FROM pg_roles WHERE rolname = $1",
		[runtime.username],
	);
	const password = runtime.password.replaceAll("'", "''");
	if (!exists.rowCount) {
		await client.query(
			`CREATE ROLE "${runtime.username}" LOGIN PASSWORD '${password}' IN ROLE crm_runtime`,
		);
	} else {
		await client.query(
			`ALTER ROLE "${runtime.username}" LOGIN PASSWORD '${password}'`,
		);
		await client.query(`GRANT crm_runtime TO "${runtime.username}"`);
	}
} finally {
	await client.end();
}
