import {
	type IndigoWebMcpCapability,
	type IndigoWebMcpContext,
	type IndigoWebMcpProjection,
	toWebMcpToolDefinition,
} from "./projection.js";
import { WebMcpRegistrationError } from "./tool-contract.js";
import { registerWebMcpToolSet } from "./tool-set.js";

export interface IndigoWebMcpExecutionRequest {
	readonly capability: IndigoWebMcpCapability;
	readonly context: IndigoWebMcpContext;
	readonly projectionRevision: string;
	readonly input: unknown;
	readonly signal: AbortSignal;
}

export type IndigoWebMcpExecutor = (
	request: IndigoWebMcpExecutionRequest,
) => unknown | Promise<unknown>;

export interface CreateIndigoWebMcpSurfaceOptions {
	readonly document: unknown;
	readonly execute: IndigoWebMcpExecutor;
	readonly exposedTo?: readonly string[];
}

export type IndigoWebMcpSyncStatus =
	| "registered"
	| "empty"
	| "unsupported"
	| "superseded";

export interface IndigoWebMcpSyncResult {
	readonly status: IndigoWebMcpSyncStatus;
	readonly revision: string;
	readonly toolNames: readonly string[];
}

export interface IndigoWebMcpSurface {
	sync(projection: IndigoWebMcpProjection): Promise<IndigoWebMcpSyncResult>;
	clear(reason?: unknown): void;
	dispose(reason?: unknown): void;
}

function combineAbortSignals(
	primary: AbortSignal,
	lifecycle: AbortSignal,
): { readonly signal: AbortSignal; cleanup(): void } {
	const controller = new AbortController();
	const abortFromPrimary = () => controller.abort(primary.reason);
	const abortFromLifecycle = () => controller.abort(lifecycle.reason);

	if (primary.aborted) controller.abort(primary.reason);
	else if (lifecycle.aborted) controller.abort(lifecycle.reason);
	else {
		primary.addEventListener("abort", abortFromPrimary, { once: true });
		lifecycle.addEventListener("abort", abortFromLifecycle, { once: true });
	}

	return {
		signal: controller.signal,
		cleanup() {
			primary.removeEventListener("abort", abortFromPrimary);
			lifecycle.removeEventListener("abort", abortFromLifecycle);
		},
	};
}

export function createIndigoWebMcpSurface(
	options: CreateIndigoWebMcpSurfaceOptions,
): IndigoWebMcpSurface {
	let generation = 0;
	let lifecycle: AbortController | null = null;
	let disposed = false;

	const clear = (reason?: unknown): void => {
		generation += 1;
		if (lifecycle !== null && !lifecycle.signal.aborted) lifecycle.abort(reason);
		lifecycle = null;
	};

	return {
		async sync(projection) {
			if (disposed) throw new Error("indigo_webmcp_surface_disposed");

			clear("projection-replaced");
			const syncGeneration = generation;
			const nextLifecycle = new AbortController();
			lifecycle = nextLifecycle;
			const capabilitiesByName = new Map(
				projection.capabilities.map((capability) => [capability.name, capability]),
			);

			try {
				const registration = await registerWebMcpToolSet({
					document: options.document,
					tools: projection.capabilities.map(toWebMcpToolDefinition),
					...(options.exposedTo !== undefined
						? { exposedTo: options.exposedTo }
						: {}),
					signal: nextLifecycle.signal,
					execute: async (request) => {
						const capability = capabilitiesByName.get(request.toolName);
						if (capability === undefined) {
							throw new Error(
								`indigo_webmcp_capability_missing:${request.toolName}`,
							);
						}
						const combined = combineAbortSignals(
							request.signal,
							nextLifecycle.signal,
						);
						try {
							return await options.execute({
								capability,
								context: projection.context,
								projectionRevision: projection.revision,
								input: request.input,
								signal: combined.signal,
							});
						} finally {
							combined.cleanup();
						}
					},
				});

				if (
					disposed ||
					syncGeneration !== generation ||
					lifecycle !== nextLifecycle
				) {
					registration.dispose("projection-superseded");
					return {
						status: "superseded",
						revision: projection.revision,
						toolNames: [],
					};
				}

				return {
					status:
						projection.capabilities.length === 0 ? "empty" : "registered",
					revision: projection.revision,
					toolNames: registration.toolNames,
				};
			} catch (error) {
				if (
					nextLifecycle.signal.aborted &&
					(disposed ||
						syncGeneration !== generation ||
						lifecycle !== nextLifecycle)
				) {
					return {
						status: "superseded",
						revision: projection.revision,
						toolNames: [],
					};
				}
				if (
					error instanceof WebMcpRegistrationError &&
					error.code === "webmcp_unavailable"
				) {
					if (lifecycle === nextLifecycle) lifecycle = null;
					return {
						status: "unsupported",
						revision: projection.revision,
						toolNames: [],
					};
				}
				throw error;
			}
		},
		clear,
		dispose(reason) {
			if (disposed) return;
			disposed = true;
			clear(reason ?? "surface-disposed");
		},
	};
}
