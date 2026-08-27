import type {
	WebMcpJsonObject,
	WebMcpToolAnnotations,
	WebMcpToolDefinition,
} from "./tool-contract.js";

export type IndigoWebMcpContext = WebMcpJsonObject;

export interface IndigoWebMcpCapability {
	readonly name: string;
	readonly title?: string;
	readonly description: string;
	readonly inputSchema?: WebMcpJsonObject;
	readonly annotations?: WebMcpToolAnnotations;
	readonly metadata?: WebMcpJsonObject;
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
		...(capability.annotations !== undefined
			? { annotations: capability.annotations }
			: {}),
	};
}
