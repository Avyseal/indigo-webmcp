import type {
	IndigoWebMcpCapability,
	IndigoWebMcpProjection,
} from "./projection.js";
import type {
	WebMcpJsonObject,
	WebMcpJsonValue,
	WebMcpToolAnnotations,
} from "./tool-contract.js";

export class IndigoWebMcpProjectionParseError extends Error {
	readonly path: string;

	constructor(path: string) {
		super(`indigo_webmcp_projection_invalid:${path}`);
		this.name = "IndigoWebMcpProjectionParseError";
		this.path = path;
	}
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new IndigoWebMcpProjectionParseError(path);
	}
	return value as Record<string, unknown>;
}

function assertAllowedKeys(
	record: Record<string, unknown>,
	allowed: readonly string[],
	path: string,
): void {
	const allowedSet = new Set(allowed);
	for (const key of Object.keys(record)) {
		if (!allowedSet.has(key)) {
			throw new IndigoWebMcpProjectionParseError(`${path}.${key}`);
		}
	}
}

function requireString(value: unknown, path: string): string {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new IndigoWebMcpProjectionParseError(path);
	}
	return value.trim();
}

function optionalString(value: unknown, path: string): string | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "string") throw new IndigoWebMcpProjectionParseError(path);
	const normalized = value.trim();
	return normalized.length > 0 ? normalized : undefined;
}

function requireJsonValue(value: unknown, path: string): WebMcpJsonValue {
	if (
		value === null ||
		typeof value === "string" ||
		typeof value === "boolean" ||
		(typeof value === "number" && Number.isFinite(value))
	) {
		return value;
	}
	if (Array.isArray(value)) {
		return value.map((item, index) =>
			requireJsonValue(item, `${path}[${index}]`),
		);
	}
	if (typeof value === "object") {
		const parsed: Record<string, WebMcpJsonValue> = {};
		for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
			parsed[key] = requireJsonValue(item, `${path}.${key}`);
		}
		return parsed;
	}
	throw new IndigoWebMcpProjectionParseError(path);
}

function requireJsonObject(value: unknown, path: string): WebMcpJsonObject {
	const parsed = requireJsonValue(value, path);
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw new IndigoWebMcpProjectionParseError(path);
	}
	return parsed as WebMcpJsonObject;
}

function parseAnnotations(
	value: unknown,
	path: string,
): WebMcpToolAnnotations | undefined {
	if (value === undefined) return undefined;
	const annotations = asRecord(value, path);
	assertAllowedKeys(annotations, ["readOnlyHint", "untrustedContentHint"], path);
	const readOnlyHint = annotations["readOnlyHint"];
	const untrustedContentHint = annotations["untrustedContentHint"];
	if (readOnlyHint !== undefined && typeof readOnlyHint !== "boolean") {
		throw new IndigoWebMcpProjectionParseError(`${path}.readOnlyHint`);
	}
	if (
		untrustedContentHint !== undefined &&
		typeof untrustedContentHint !== "boolean"
	) {
		throw new IndigoWebMcpProjectionParseError(`${path}.untrustedContentHint`);
	}
	return {
		...(typeof readOnlyHint === "boolean" ? { readOnlyHint } : {}),
		...(typeof untrustedContentHint === "boolean"
			? { untrustedContentHint }
			: {}),
	};
}

function parseCapability(value: unknown, index: number): IndigoWebMcpCapability {
	const path = `capabilities[${index}]`;
	const capability = asRecord(value, path);
	assertAllowedKeys(
		capability,
		["name", "title", "description", "inputSchema", "annotations", "metadata"],
		path,
	);
	const title = optionalString(capability["title"], `${path}.title`);
	const inputSchema = capability["inputSchema"];
	const annotations = parseAnnotations(
		capability["annotations"],
		`${path}.annotations`,
	);
	const metadata = capability["metadata"];

	return {
		name: requireString(capability["name"], `${path}.name`),
		...(title !== undefined ? { title } : {}),
		description: requireString(capability["description"], `${path}.description`),
		...(inputSchema !== undefined
			? { inputSchema: requireJsonObject(inputSchema, `${path}.inputSchema`) }
			: {}),
		...(annotations !== undefined ? { annotations } : {}),
		...(metadata !== undefined
			? { metadata: requireJsonObject(metadata, `${path}.metadata`) }
			: {}),
	};
}

export function parseIndigoWebMcpProjection(
	value: unknown,
): IndigoWebMcpProjection {
	const projection = asRecord(value, "projection");
	assertAllowedKeys(
		projection,
		["revision", "context", "capabilities"],
		"projection",
	);
	const capabilities = projection["capabilities"];
	if (!Array.isArray(capabilities)) {
		throw new IndigoWebMcpProjectionParseError("capabilities");
	}

	return {
		revision: requireString(projection["revision"], "revision"),
		context: requireJsonObject(projection["context"], "context"),
		capabilities: capabilities.map(parseCapability),
	};
}
