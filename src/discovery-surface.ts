import type { IndigoWebMcpProjection } from "./projection.js";
import {
	createIndigoWebMcpSurface,
	type IndigoWebMcpExecutor,
	type IndigoWebMcpSurface,
} from "./surface.js";
import { WebMcpRegistrationError } from "./tool-contract.js";
import { registerWebMcpToolSet } from "./tool-set.js";

export const INDIGO_WEBMCP_DISCOVERY_TOOL_NAME = "indigo.capabilities.discover";

export interface IndigoWebMcpDiscoveryContext {
	readonly route?: string | null;
	readonly module?: string | null;
	readonly toolPrefixes?: readonly string[];
}

export interface IndigoWebMcpProjectionLoadRequest {
	readonly context: IndigoWebMcpDiscoveryContext;
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
	return {
		status: "unsupported",
		invalidate() {},
		dispose() {},
	};
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
						"Load the Indigo tools currently available for the active page and authenticated business context.",
					inputSchema: {
						type: "object",
						properties: {},
						additionalProperties: false,
					},
					annotations: {
						readOnlyHint: true,
						untrustedContentHint: false,
					},
				},
			],
			...(options.exposedTo !== undefined
				? { exposedTo: options.exposedTo }
				: {}),
			signal: lifecycle.signal,
			execute: async (request) => {
				const projection = await options.loadProjection({
					context: options.getContext(),
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
				discoveryRegistration.dispose();
				if (!lifecycle.signal.aborted) {
					lifecycle.abort(disposalReason);
				}
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
