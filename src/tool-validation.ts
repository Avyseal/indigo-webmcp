import {
	type WebMcpJsonObject,
	WebMcpRegistrationError,
	type WebMcpToolDefinition,
} from "./tool-contract.js";

const WEBMCP_TOOL_NAME = /^[A-Za-z0-9_.-]{1,128}$/;

function assertJsonSerializable(
	value: unknown,
	code:
		| "webmcp_tool_schema_not_serializable"
		| "webmcp_tool_result_not_serializable",
	toolName: string,
): void {
	try {
		if (JSON.stringify(value) === undefined) {
			throw new TypeError("webmcp_json_serialized_to_undefined");
		}
	} catch (error) {
		throw new WebMcpRegistrationError(code, { toolName, cause: error });
	}
}

export function assertWebMcpToolResultSerializable(
	result: unknown,
	toolName: string,
): void {
	assertJsonSerializable(result, "webmcp_tool_result_not_serializable", toolName);
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
			assertJsonSerializable(
				tool.inputSchema satisfies WebMcpJsonObject,
				"webmcp_tool_schema_not_serializable",
				tool.name,
			);
		}
	}
}
