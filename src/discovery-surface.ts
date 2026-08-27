import type { IndigoWebMcpProjection } from "./projection.js";
import {
	createIndigoWebMcpSurface,
	type IndigoWebMcpExecutor,
	type IndigoWebMcpSurface,
} from "./surface.js";
import { WebMcpRegistrationError } from "./tool-contract.js";
import { registerWebMcpToolSet } from "./tool-set.js";

export const INDIGO_WEBMCP_DISCOVERY_TOOL_NAME = "indigo.capabilities.discover";
export const INDIGO_WEBMCP_CONFIRM_TOOL_NAME = "indigo.action.confirm";

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

export interface IndigoWebMcpApprovalConfirmationRequest {
	readonly proposalId: string;
	readonly signal: AbortSignal;
}

export type IndigoWebMcpApprovalConfirmer = (
	request: IndigoWebMcpApprovalConfirmationRequest,
) => unknown | Promise<unknown>;

export interface CreateIndigoWebMcpDiscoverySurfaceOptions {
	readonly document: unknown;
	readonly getContext: () => IndigoWebMcpDiscoveryContext;
	readonly loadProjection: IndigoWebMcpProjectionLoader;
	readonly execute: IndigoWebMcpExecutor;
	readonly confirmApproval?: IndigoWebMcpApprovalConfirmer;
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

function readProposalId(input: unknown): string {
	if (typeof input !== "object" || input === null || Array.isArray(input)) {
		throw new Error("indigo_webmcp_confirmation_input_invalid");
	}
	const proposalId = Reflect.get(input, "proposal_id");
	if (typeof proposalId !== "string" || proposalId.trim().length === 0) {
		throw new Error("indigo_webmcp_confirmation_proposal_id_required");
	}
	return proposalId.trim();
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
	const fixedTools = [
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
		...(options.confirmApproval === undefined
			? []
			: [
					{
						name: INDIGO_WEBMCP_CONFIRM_TOOL_NAME,
						title: "Confirm Indigo action",
						description:
							"Confirm and execute an Indigo proposal only after the user explicitly approves the proposal returned by a previous Indigo tool call.",
						inputSchema: {
							type: "object",
							properties: {
								proposal_id: { type: "string" },
							},
							required: ["proposal_id"],
							additionalProperties: false,
						},
						annotations: {
							readOnlyHint: false,
							untrustedContentHint: false,
						},
					},
				]),
	] as const;

	try {
		const discoveryRegistration = await registerWebMcpToolSet({
			document: options.document,
			tools: fixedTools,
			...(options.exposedTo !== undefined
				? { exposedTo: options.exposedTo }
				: {}),
			signal: lifecycle.signal,
			execute: async (request) => {
				if (request.toolName === INDIGO_WEBMCP_CONFIRM_TOOL_NAME) {
					if (options.confirmApproval === undefined) {
						throw new Error("indigo_webmcp_confirmation_unavailable");
					}
					return options.confirmApproval({
						proposalId: readProposalId(request.input),
						signal: request.signal,
					});
				}

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
