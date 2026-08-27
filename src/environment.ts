export type WebMcpRegisterToolLike = (...args: readonly unknown[]) => unknown;

export interface WebMcpModelContextLike {
	readonly registerTool: WebMcpRegisterToolLike;
}

export interface WebMcpDocumentLike {
	readonly modelContext: WebMcpModelContextLike;
}

function isObjectLike(value: unknown): value is object {
	return (
		(typeof value === "object" && value !== null) || typeof value === "function"
	);
}

export function hasWebMcpModelContext(value: unknown): value is WebMcpDocumentLike {
	if (!isObjectLike(value)) return false;

	const modelContext = Reflect.get(value, "modelContext");
	if (!isObjectLike(modelContext)) return false;

	return typeof Reflect.get(modelContext, "registerTool") === "function";
}
