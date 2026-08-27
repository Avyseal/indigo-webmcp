import {
	type WebMcpJsonValue,
	WebMcpRegistrationError,
	type WebMcpToolDefinition,
} from "./tool-contract.js";

const WEBMCP_TOOL_NAME = /^[A-Za-z0-9_.-]{1,128}$/;

function assertJsonSerializable(
	schema: WebMcpJsonValue,
	toolName: string,
): void {
	try {
		if (JSON.stringify(schema) === undefined) {
			throw new TypeError("schema_serialized_to_undefined");
		}
	} catch (error) {
		throw new WebMcpRegistrationError("webmcp_tool_schema_not_serializable", {
			toolName,
			cause: error,
		});
	}
}

export function preflightWebMcpTools(
	tools: readonly WebMcpToolDefinition[],
): void {
	const names = new Set<string>();

	for (const tool of tools) {
		if (!WEBMCP_TOOL_NAME.test(tool.name)) {
			throw new WebMcpRegistrationError("webmcp_tool_name_invalid", {
				toolName: tool.name,
			});
		}
		if (names.has(tool.name)) {
			throw new WebMcpRegistrationError("webmcp_tool_name_duplicate", {
				toolName: tool.name,
			});
		}
		names.add(tool.name);

		if (!tool.description.trim()) {
			throw new WebMcpRegistrationError("webmcp_tool_description_required", {
				toolName: tool.name,
			});
		}

		if (tool.inputSchema !== undefined) {
			assertJsonSerializable(tool.inputSchema, tool.name);
		}
	}
}
