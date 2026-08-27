import { hasWebMcpModelContext } from "./environment.js";
import {
	type RegisterWebMcpToolSetOptions,
	WebMcpRegistrationError,
	type WebMcpToolSetRegistration,
} from "./tool-contract.js";
import {
	assertWebMcpToolResultSerializable,
	preflightWebMcpTools,
} from "./tool-validation.js";

function isObjectLike(value: unknown): value is object {
	return (
		(typeof value === "object" && value !== null) || typeof value === "function"
	);
}

function resolveExecutionSignal(executionOptions: unknown): AbortSignal {
	if (isObjectLike(executionOptions)) {
		const candidate = Reflect.get(executionOptions, "signal");
		if (
			isObjectLike(candidate) &&
			typeof Reflect.get(candidate, "aborted") === "boolean" &&
			typeof Reflect.get(candidate, "addEventListener") === "function"
		) {
			return candidate as AbortSignal;
		}
	}

	return new AbortController().signal;
}

function connectExternalLifecycle(
	controller: AbortController,
	externalSignal: AbortSignal | undefined,
): void {
	if (!externalSignal) return;

	if (externalSignal.aborted) {
		controller.abort(externalSignal.reason);
		return;
	}

	const abortFromExternal = () => controller.abort(externalSignal.reason);
	externalSignal.addEventListener("abort", abortFromExternal, { once: true });
	controller.signal.addEventListener(
		"abort",
		() => externalSignal.removeEventListener("abort", abortFromExternal),
		{ once: true },
	);
}

function createRegistration(
	controller: AbortController,
	toolNames: readonly string[],
): WebMcpToolSetRegistration {
	let disposed = false;
	return {
		toolNames: Object.freeze([...toolNames]),
		signal: controller.signal,
		dispose(reason) {
			if (disposed) return;
			disposed = true;
			controller.abort(reason);
		},
	};
}

export async function registerWebMcpToolSet(
	options: RegisterWebMcpToolSetOptions,
): Promise<WebMcpToolSetRegistration> {
	preflightWebMcpTools(options.tools);

	const controller = new AbortController();
	connectExternalLifecycle(controller, options.signal);
	const registration = createRegistration(
		controller,
		options.tools.map((tool) => tool.name),
	);

	if (controller.signal.aborted) throw controller.signal.reason;
	if (options.tools.length === 0) return registration;

	if (!hasWebMcpModelContext(options.document)) {
		throw new WebMcpRegistrationError("webmcp_unavailable");
	}

	const registrationOptions = {
		signal: controller.signal,
		...(options.exposedTo && options.exposedTo.length > 0
			? { exposedTo: [...options.exposedTo] }
			: {}),
	};

	for (const tool of options.tools) {
		try {
			await options.document.modelContext.registerTool(
				{
					name: tool.name,
					...(tool.title !== undefined ? { title: tool.title } : {}),
					description: tool.description,
					...(tool.inputSchema !== undefined
						? { inputSchema: tool.inputSchema }
						: {}),
					...(tool.annotations !== undefined
						? { annotations: { ...tool.annotations } }
						: {}),
					execute: async (input: unknown, executionOptions?: unknown) => {
						const result = await options.execute({
							toolName: tool.name,
							input,
							signal: resolveExecutionSignal(executionOptions),
						});
						assertWebMcpToolResultSerializable(result, tool.name);
						return result;
					},
				},
				registrationOptions,
			);
		} catch (error) {
			if (controller.signal.aborted) throw controller.signal.reason;
			controller.abort(error);
			throw new WebMcpRegistrationError("webmcp_tool_registration_failed", {
				toolName: tool.name,
				cause: error,
			});
		}
	}

	return registration;
}
