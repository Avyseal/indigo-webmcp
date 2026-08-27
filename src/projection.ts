import type {
	WebMcpJsonValue,
	WebMcpToolDefinition,
} from "./tool-contract.js";

export type IndigoWebMcpSurfaceName = "admin" | "public";

export interface IndigoWebMcpContext {
	readonly surface: IndigoWebMcpSurfaceName;
	readonly tenantId: string | null;
	readonly branchId: string | null;
	readonly route?: string | null;
	readonly module?: string | null;
}

export interface IndigoWebMcpCapability {
	readonly name: string;
	readonly title?: string;
	readonly description: string;
	readonly inputSchema?: WebMcpJsonValue;
	readonly toolVersion: string;
	readonly ownerDomain: string;
	readonly riskLevel: string;
	readonly requiresConfirmation: boolean;
	readonly requiresOwner: boolean;
	readonly requiresLock: boolean;
	readonly sideEffect: boolean;
	readonly untrustedContentHint?: boolean;
}

export interface IndigoWebMcpProjection {
	readonly revision: string;
	readonly context: IndigoWebMcpContext;
	readonly capabilities: readonly IndigoWebMcpCapability[];
}

export function toWebMcpToolDefinition(
	capability: IndigoWebMcpCapability,
): WebMcpToolDefinition {
	return {
		name: capability.name,
		...(capability.title !== undefined ? { title: capability.title } : {}),
		description: capability.description,
		...(capability.inputSchema !== undefined
			? { inputSchema: capability.inputSchema }
			: {}),
		annotations: {
			readOnlyHint: !capability.sideEffect,
			...(capability.untrustedContentHint !== undefined
				? { untrustedContentHint: capability.untrustedContentHint }
				: {}),
		},
	};
}
