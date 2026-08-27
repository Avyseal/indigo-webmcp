export type WebMcpJsonPrimitive = string | number | boolean | null;
export type WebMcpJsonValue =
	| WebMcpJsonPrimitive
	| readonly WebMcpJsonValue[]
	| WebMcpJsonObject;

export interface WebMcpJsonObject {
	readonly [key: string]: WebMcpJsonValue;
}

export interface WebMcpToolAnnotations {
	readonly readOnlyHint?: boolean;
	readonly untrustedContentHint?: boolean;
}

export interface WebMcpToolDefinition {
	readonly name: string;
	readonly title?: string;
	readonly description: string;
	readonly inputSchema?: WebMcpJsonObject;
	readonly annotations?: WebMcpToolAnnotations;
}

export interface WebMcpToolExecutionRequest {
	readonly toolName: string;
	readonly input: unknown;
	readonly signal: AbortSignal;
}

export type WebMcpToolExecutor = (
	request: WebMcpToolExecutionRequest,
) => unknown | Promise<unknown>;

export interface RegisterWebMcpToolSetOptions {
	readonly document: unknown;
	readonly tools: readonly WebMcpToolDefinition[];
	readonly execute: WebMcpToolExecutor;
	readonly exposedTo?: readonly string[];
	readonly signal?: AbortSignal;
}

export interface WebMcpToolSetRegistration {
	readonly toolNames: readonly string[];
	readonly signal: AbortSignal;
	dispose(reason?: unknown): void;
}

export type WebMcpRegistrationErrorCode =
	| "webmcp_tool_name_invalid"
	| "webmcp_tool_name_duplicate"
	| "webmcp_tool_description_required"
	| "webmcp_tool_schema_not_serializable"
	| "webmcp_tool_result_not_serializable"
	| "webmcp_unavailable"
	| "webmcp_tool_registration_failed";

export class WebMcpRegistrationError extends Error {
	readonly code: WebMcpRegistrationErrorCode;
	readonly toolName: string | null;

	constructor(
		code: WebMcpRegistrationErrorCode,
		options: { readonly toolName?: string; readonly cause?: unknown } = {},
	) {
		super(code, options.cause === undefined ? undefined : { cause: options.cause });
		this.name = "WebMcpRegistrationError";
		this.code = code;
		this.toolName = options.toolName ?? null;
	}
}
