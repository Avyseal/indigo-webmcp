import type { IndigoWebMcpProjection } from "./projection.js";
import {
	createIndigoWebMcpSurface,
	type IndigoWebMcpExecutor,
	type IndigoWebMcpSurface,
} from "./surface.js";
import type { WebMcpJsonObject } from "./tool-contract.js";
import { WebMcpRegistrationError } from "./tool-contract.js";
import { registerWebMcpToolSet } from "./tool-set.js";

export const INDIGO_WEBMCP_DISCOVERY_TOOL_NAME = "indigo.capabilities.discover";

export type IndigoWebMcpDiscoveryContext = WebMcpJsonObject;

export interface IndigoWebMcpProjectionLoadRequest {
	readonly context: IndigoWebMcpDiscoveryContext;
	readonly input: WebMcpJsonObject;
	readonly signal: AbortSignal;
}

export type IndigoWebMcpProjectionLoader = (
	request: IndigoWebMcpProjectionLoadRequest,
) => Promise<IndigoWebMcpProjection>;

export interface CreateIndigoWebMcpDiscoverySurfaceOptions {
	readonly document: unknown;
	readonly getContext: () => IndigoWebMcpDiscoveryContext;
	readonly loadProjection: IndigoWebMcpProjectionLoader;
	readonly execute: IndigoWebMcpExecutor;
	readonly exposedTo?: readonly string[];
}

export type IndigoWebMcpDiscoveryStatus = "registered" | "unsupported";

export interface IndigoWebMcpDiscoverySurface {
	readonly status: IndigoWebMcpDiscoveryStatus;
	invalidate(reason?: unknown): void;
	dispose(reason?: unknown): void;
}

function createUnsupportedDiscoverySurface(): IndigoWebMcpDiscoverySurface {
	return { status: "unsupported", invalidate() {}, dispose() {} };
}

function parseDiscoveryInput(input: unknown): WebMcpJsonObject {
	if (input === undefined || input === null) return {};
	if (typeof input !== "object" || Array.isArray(input)) {
		throw new Error("indigo_webmcp_discovery_input_invalid");
	}
	const query = Reflect.get(input, "query");
	if (query !== undefined && typeof query !== "string") {
		throw new Error("indigo_webmcp_discovery_query_invalid");
	}
	return typeof query === "string" && query.trim().length > 0
		? { query: query.trim() }
		: {};
}

export async function createIndigoWebMcpDiscoverySurface(
	options: CreateIndigoWebMcpDiscoverySurfaceOptions,
): Promise<IndigoWebMcpDiscoverySurface> {
	const businessSurface: IndigoWebMcpSurface = createIndigoWebMcpSurface({
		document: options.document,
		execute: options.execute,
		...(options.exposedTo !== undefined ? { exposedTo: options.exposedTo } : {}),
	});
	const lifecycle = new AbortController();

	try {
		const discoveryRegistration = await registerWebMcpToolSet({
			document: options.document,
			tools: [
				{
					name: INDIGO_WEBMCP_DISCOVERY_TOOL_NAME,
					title: "Discover Indigo capabilities",
					description:
						"Discover and register the Indigo capabilities relevant to the current page and agent intent. Invoke this before using contextual Indigo tools.",
					inputSchema: {
						type: "object",
						properties: {
							query: {
								type: "string",
								description:
									"Optional natural-language description of the capability needed.",
							},
						},
						additionalProperties: false,
					},
					annotations: { readOnlyHint: true, untrustedContentHint: false },
				},
			],
			...(options.exposedTo !== undefined
				? { exposedTo: options.exposedTo }
				: {}),
			signal: lifecycle.signal,
			execute: async (request) => {
				const projection = await options.loadProjection({
					context: options.getContext(),
					input: parseDiscoveryInput(request.input),
					signal: request.signal,
				});
				const result = await businessSurface.sync(projection);
				return {
					status: result.status,
					revision: result.revision,
					toolNames: [...result.toolNames],
				};
			},
		});

		return {
			status: "registered",
			invalidate(reason) {
				businessSurface.clear(reason ?? "discovery-context-invalidated");
			},
			dispose(reason) {
				const disposalReason = reason ?? "discovery-surface-disposed";
				businessSurface.dispose(disposalReason);
				discoveryRegistration.dispose(disposalReason);
				if (!lifecycle.signal.aborted) lifecycle.abort(disposalReason);
			},
		};
	} catch (error) {
		businessSurface.dispose("discovery-registration-failed");
		if (
			error instanceof WebMcpRegistrationError &&
			error.code === "webmcp_unavailable"
		) {
			return createUnsupportedDiscoverySurface();
		}
		throw error;
	}
}
