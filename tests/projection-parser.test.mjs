import assert from "node:assert/strict";
import test from "node:test";

import {
	IndigoWebMcpProjectionParseError,
	parseIndigoWebMcpProjection,
} from "../dist/index.js";

const serverProjection = {
	revision: "a".repeat(64),
	context: {
		surface: "admin",
		tenant_id: "tenant-1",
		branch_id: "branch-1",
		route: "/indigo/products",
		module: "products",
	},
	capabilities: [
		{
			name: "admin.catalog.search.read",
			description: "Search the authorized Indigo catalog.",
			input_schema: {
				type: "object",
				properties: { query: { type: "string" } },
			},
			tool_version: "1.0.0",
			owner_domain: "catalog",
			risk_level: "low",
			requires_confirmation: false,
			requires_owner: true,
			requires_lock: false,
			side_effect: false,
		},
	],
};

test("parses Indigo server projection into the browser contract", () => {
	const parsed = parseIndigoWebMcpProjection(serverProjection);

	assert.equal(parsed.context.tenantId, "tenant-1");
	assert.equal(parsed.context.branchId, "branch-1");
	assert.equal(parsed.capabilities[0].toolVersion, "1.0.0");
	assert.equal(parsed.capabilities[0].ownerDomain, "catalog");
	assert.equal(parsed.capabilities[0].requiresOwner, true);
	assert.deepEqual(parsed.capabilities[0].inputSchema, {
		type: "object",
		properties: { query: { type: "string" } },
	});
});

test("rejects projections missing security metadata", () => {
	const invalid = structuredClone(serverProjection);
	delete invalid.capabilities[0].requires_confirmation;

	assert.throws(
		() => parseIndigoWebMcpProjection(invalid),
		(error) =>
			error instanceof IndigoWebMcpProjectionParseError &&
			error.path === "capabilities[0].requires_confirmation",
	);
});

test("rejects invalid JSON schema values", () => {
	const invalid = structuredClone(serverProjection);
	invalid.capabilities[0].input_schema = { minimum: Number.POSITIVE_INFINITY };

	assert.throws(
		() => parseIndigoWebMcpProjection(invalid),
		(error) =>
			error instanceof IndigoWebMcpProjectionParseError &&
			error.path === "capabilities[0].input_schema.minimum",
	);
});

test("rejects unknown projection surfaces", () => {
	const invalid = structuredClone(serverProjection);
	invalid.context.surface = "internal";

	assert.throws(
		() => parseIndigoWebMcpProjection(invalid),
		(error) =>
			error instanceof IndigoWebMcpProjectionParseError &&
			error.path === "context.surface",
	);
});
