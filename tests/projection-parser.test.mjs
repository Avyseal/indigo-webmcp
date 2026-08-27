import assert from "node:assert/strict";
import test from "node:test";

import {
	IndigoWebMcpProjectionParseError,
	parseIndigoWebMcpProjection,
} from "../dist/index.js";

const projection = {
	revision: "rev-1",
	context: { surface: "admin", route: "/products", tenant: "tenant-1" },
	capabilities: [
		{
			name: "catalog.search",
			title: "Search catalog",
			description: "Search products",
			inputSchema: {
				type: "object",
				properties: { query: { type: "string" } },
			},
			annotations: { readOnlyHint: true, untrustedContentHint: false },
			metadata: { owner: "catalog", version: "1" },
		},
	],
};

test("parses the neutral public projection wire format", () => {
	assert.deepEqual(parseIndigoWebMcpProjection(projection), projection);
});

test("rejects private snake_case fields instead of silently coupling to them", () => {
	const invalid = structuredClone(projection);
	delete invalid.capabilities[0].inputSchema;
	invalid.capabilities[0].input_schema = { type: "object" };
	assert.throws(
		() => parseIndigoWebMcpProjection(invalid),
		(error) =>
			error instanceof IndigoWebMcpProjectionParseError &&
			error.path === "capabilities[0].input_schema",
	);
});

test("rejects invalid JSON values in schemas", () => {
	const invalid = structuredClone(projection);
	invalid.capabilities[0].inputSchema = {
		minimum: Number.POSITIVE_INFINITY,
	};
	assert.throws(
		() => parseIndigoWebMcpProjection(invalid),
		(error) =>
			error instanceof IndigoWebMcpProjectionParseError &&
			error.path === "capabilities[0].inputSchema.minimum",
	);
});

test("rejects non-JSON context values", () => {
	assert.throws(
		() =>
			parseIndigoWebMcpProjection({
				revision: "r",
				context: { bad: 1n },
				capabilities: [],
			}),
		(error) =>
			error instanceof IndigoWebMcpProjectionParseError &&
			error.path === "context.bad",
	);
});

test("rejects unknown annotation fields", () => {
	const invalid = structuredClone(projection);
	invalid.capabilities[0].annotations = { destructiveHint: true };
	assert.throws(
		() => parseIndigoWebMcpProjection(invalid),
		(error) =>
			error instanceof IndigoWebMcpProjectionParseError &&
			error.path === "capabilities[0].annotations.destructiveHint",
	);
});
