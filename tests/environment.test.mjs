import assert from "node:assert/strict";
import test from "node:test";

import { hasWebMcpModelContext } from "../dist/index.js";

test("detects a callable WebMCP registerTool surface", () => {
	const candidate = {
		modelContext: {
			registerTool() {},
		},
	};

	assert.equal(hasWebMcpModelContext(candidate), true);
});

test("rejects an object without modelContext", () => {
	assert.equal(hasWebMcpModelContext({}), false);
});

test("rejects a non-callable registerTool member", () => {
	assert.equal(
		hasWebMcpModelContext({
			modelContext: {
				registerTool: "not-a-function",
			},
		}),
		false,
	);
});

test("rejects null and primitive inputs", () => {
	assert.equal(hasWebMcpModelContext(null), false);
	assert.equal(hasWebMcpModelContext("document"), false);
	assert.equal(hasWebMcpModelContext(42), false);
});
