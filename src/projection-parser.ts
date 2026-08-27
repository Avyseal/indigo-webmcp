import type {
	IndigoWebMcpCapability,
	IndigoWebMcpContext,
	IndigoWebMcpProjection,
	IndigoWebMcpSurfaceName,
} from "./projection.js";
import type { WebMcpJsonValue } from "./tool-contract.js";

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

function requireString(value: unknown, path: string): string {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new IndigoWebMcpProjectionParseError(path);
	}
	return value.trim();
}

function optionalString(
	value: unknown,
	path: string,
): string | null | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (value === null) {
		return null;
	}
	if (typeof value !== "string") {
		throw new IndigoWebMcpProjectionParseError(path);
	}
	const normalized = value.trim();
	return normalized.length === 0 ? null : normalized;
}

function requireBoolean(value: unknown, path: string): boolean {
	if (typeof value !== "boolean") {
		throw new IndigoWebMcpProjectionParseError(path);
	}
	return value;
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
		const record = value as Record<string, unknown>;
		const parsed: Record<string, WebMcpJsonValue> = {};
		for (const [key, item] of Object.entries(record)) {
			parsed[key] = requireJsonValue(item, `${path}.${key}`);
		}
		return parsed;
	}
	throw new IndigoWebMcpProjectionParseError(path);
}

function parseSurface(value: unknown): IndigoWebMcpSurfaceName {
	if (value === "admin" || value === "public") {
		return value;
	}
	throw new IndigoWebMcpProjectionParseError("context.surface");
}

function parseContext(value: unknown): IndigoWebMcpContext {
	const context = asRecord(value, "context");
	const tenantId = optionalString(context["tenant_id"], "context.tenant_id");
	const branchId = optionalString(context["branch_id"], "context.branch_id");
	const route = optionalString(context["route"], "context.route");
	const module = optionalString(context["module"], "context.module");

	return {
		surface: parseSurface(context["surface"]),
		tenantId: tenantId ?? null,
		branchId: branchId ?? null,
		...(route !== undefined ? { route } : {}),
		...(module !== undefined ? { module } : {}),
	};
}

function parseCapability(
	value: unknown,
	index: number,
): IndigoWebMcpCapability {
	const path = `capabilities[${index}]`;
	const capability = asRecord(value, path);
	const title = optionalString(capability["title"], `${path}.title`);
	const untrustedContentHint = capability["untrusted_content_hint"];

	if (
		untrustedContentHint !== undefined &&
		typeof untrustedContentHint !== "boolean"
	) {
		throw new IndigoWebMcpProjectionParseError(
			`${path}.untrusted_content_hint`,
		);
	}

	return {
		name: requireString(capability["name"], `${path}.name`),
		...(title !== undefined && title !== null ? { title } : {}),
		description: requireString(
			capability["description"],
			`${path}.description`,
		),
		inputSchema: requireJsonValue(
			capability["input_schema"],
			`${path}.input_schema`,
		),
		toolVersion: requireString(
			capability["tool_version"],
			`${path}.tool_version`,
		),
		ownerDomain: requireString(
			capability["owner_domain"],
			`${path}.owner_domain`,
		),
		riskLevel: requireString(
			capability["risk_level"],
			`${path}.risk_level`,
		),
		requiresConfirmation: requireBoolean(
			capability["requires_confirmation"],
			`${path}.requires_confirmation`,
		),
		requiresOwner: requireBoolean(
			capability["requires_owner"],
			`${path}.requires_owner`,
		),
		requiresLock: requireBoolean(
			capability["requires_lock"],
			`${path}.requires_lock`,
		),
		sideEffect: requireBoolean(
			capability["side_effect"],
			`${path}.side_effect`,
		),
		...(typeof untrustedContentHint === "boolean"
			? { untrustedContentHint }
			: {}),
	};
}

export function parseIndigoWebMcpProjection(
	value: unknown,
): IndigoWebMcpProjection {
	const projection = asRecord(value, "projection");
	const capabilities = projection["capabilities"];
	if (!Array.isArray(capabilities)) {
		throw new IndigoWebMcpProjectionParseError("capabilities");
	}

	return {
		revision: requireString(projection["revision"], "revision"),
		context: parseContext(projection["context"]),
		capabilities: capabilities.map(parseCapability),
	};
}
