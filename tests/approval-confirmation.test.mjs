import assert from "node:assert/strict";
import test from "node:test";

import {
	createIndigoWebMcpDiscoverySurface,
	INDIGO_WEBMCP_CONFIRM_TOOL_NAME,
} from "../dist/index.js";

function createDocumentHarness() {
	const registrations = [];
	return {
		document: {
			modelContext: {
				async registerTool(tool, options) {
					registrations.push({ tool, options });
				},
			},
		},
		registrations,
	};
}

test("registers a confirmation tool only when the host provides a confirmer", async () => {
	const harness = createDocumentHarness();
	let loads = 0;
	const confirmations = [];
	await createIndigoWebMcpDiscoverySurface({
		document: harness.document,
		getContext: () => ({}),
		loadProjection: async () => {
			loads += 1;
			throw new Error("projection-not-expected");
		},
		execute: async () => null,
		confirmApproval: async (request) => {
			confirmations.push(request);
			return { status: "executed" };
		},
	});

	assert.equal(loads, 0);
	assert.equal(harness.registrations.length, 2);
	assert.equal(harness.registrations[1].tool.name, INDIGO_WEBMCP_CONFIRM_TOOL_NAME);

	const execution = new AbortController();
	const result = await harness.registrations[1].tool.execute(
		{ proposal_id: "proposal-1" },
		{ signal: execution.signal },
	);

	assert.deepEqual(result, { status: "executed" });
	assert.equal(confirmations.length, 1);
	assert.equal(confirmations[0].proposalId, "proposal-1");
	assert.equal(confirmations[0].signal, execution.signal);
});

test("confirmation rejects missing proposal ids before reaching the host", async () => {
	const harness = createDocumentHarness();
	let confirmations = 0;
	await createIndigoWebMcpDiscoverySurface({
		document: harness.document,
		getContext: () => ({}),
		loadProjection: async () => {
			throw new Error("projection-not-expected");
		},
		execute: async () => null,
		confirmApproval: async () => {
			confirmations += 1;
			return null;
		},
	});

	await assert.rejects(
		harness.registrations[1].tool.execute(
			{},
			{ signal: new AbortController().signal },
		),
		/indigo_webmcp_confirmation_proposal_id_required/,
	);
	assert.equal(confirmations, 0);
});
