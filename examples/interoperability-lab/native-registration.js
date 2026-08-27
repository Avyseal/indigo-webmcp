export async function registerNativeStatusTool(getStatus) {
	if (!document.modelContext?.registerTool) return null;

	const controller = new AbortController();
	await document.modelContext.registerTool(
		{
			name: "indigo.lab.status",
			title: "Inspect WebMCP lab status",
			description:
				"Return the current view and product count for the Indigo WebMCP interoperability lab.",
			inputSchema: {
				type: "object",
				properties: {},
				additionalProperties: false,
			},
			annotations: { readOnlyHint: true, untrustedContentHint: false },
			execute: async () => getStatus(),
		},
		{ signal: controller.signal },
	);
	return controller;
}
