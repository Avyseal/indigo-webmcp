import {
	createIndigoWebMcpDiscoverySurface,
	hasWebMcpModelContext,
} from "../../dist/index.js";
import { registerNativeStatusTool } from "./native-registration.js";
import { createLabState } from "./state.js";

function resolveStorage() {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

const lab = createLabState(resolveStorage());
let view = "catalog";
let revision = 0;
let discoverySurface = null;
let nativeStatusController = null;
let removeToolChangeListener = null;

const body = document.querySelector("#inventory-body");
const webMcpStatus = document.querySelector("#webmcp-status");
const toolStatus = document.querySelector("#tool-status");
const viewStatus = document.querySelector("#view-status");
const eventLog = document.querySelector("#event-log");

function log(message, payload) {
	const suffix = payload === undefined ? "" : `\n${JSON.stringify(payload, null, 2)}`;
	eventLog.textContent = `${new Date().toLocaleTimeString()} — ${message}${suffix}`;
}

function render(products = lab.snapshot()) {
	body.replaceChildren(
		...products.map((product) => {
			const row = document.createElement("tr");
			const low = product.stock <= product.reorderLevel;
			row.innerHTML = `
				<td><strong>${product.name}</strong></td>
				<td class="${low ? "low" : ""}">${product.stock}</td>
				<td>${product.reorderLevel}</td>
				<td><button type="button" data-restock="${product.id}">+5 stock</button></td>
			`;
			return row;
		}),
	);
	viewStatus.textContent = `View: ${view}`;
	document.querySelectorAll("[data-view]").forEach((button) => {
		button.classList.toggle("active", button.dataset.view === view);
	});
}

function relevantCapabilities(query) {
	const intent = String(query ?? "").toLowerCase();
	const wantsCatalog = view === "catalog" || /search|catalog|product|find/.test(intent);
	const wantsInventory =
		view === "inventory" || /stock|inventory|reorder|restock|low/.test(intent);
	const capabilities = [];

	if (wantsCatalog) {
		capabilities.push({
			name: "indigo.lab.catalog.search",
			title: "Search lab catalog",
			description: "Search products in the interoperability lab catalog by name.",
			inputSchema: {
				type: "object",
				properties: { query: { type: "string" } },
				additionalProperties: false,
			},
			annotations: { readOnlyHint: true, untrustedContentHint: false },
			metadata: { domain: "catalog" },
		});
	}

	if (wantsInventory) {
		capabilities.push(
			{
				name: "indigo.lab.inventory.low_stock",
				title: "List low-stock items",
				description: "List products whose stock is at or below their reorder level.",
				inputSchema: { type: "object", properties: {}, additionalProperties: false },
				annotations: { readOnlyHint: true, untrustedContentHint: false },
				metadata: { domain: "inventory" },
			},
			{
				name: "indigo.lab.inventory.restock",
				title: "Restock a lab product",
				description:
					"Increase stock for one product in the shared interoperability lab state.",
				inputSchema: {
					type: "object",
					properties: {
						productId: { type: "string" },
						quantity: { type: "integer", minimum: 1, maximum: 100 },
					},
					required: ["productId", "quantity"],
					additionalProperties: false,
				},
				annotations: { readOnlyHint: false, untrustedContentHint: false },
				metadata: { domain: "inventory", sideEffect: true },
			},
		);
	}
	return capabilities;
}

async function executeCapability({ capability, input, signal }) {
	if (signal.aborted) throw signal.reason;
	const args = input && typeof input === "object" ? input : {};

	switch (capability.name) {
		case "indigo.lab.catalog.search": {
			const items = lab.search(args.query);
			log("Agent searched the shared catalog", { query: args.query ?? "", count: items.length });
			return { items };
		}
		case "indigo.lab.inventory.low_stock": {
			const items = lab.lowStock();
			log("Agent inspected low stock", { count: items.length });
			return { items };
		}
		case "indigo.lab.inventory.restock": {
			const product = lab.restock(String(args.productId ?? ""), Number(args.quantity));
			log("Agent restocked shared inventory", {
				productId: product.id,
				quantity: Number(args.quantity),
				stock: product.stock,
			});
			return { product };
		}
		default:
			throw new Error(`lab_capability_unknown:${capability.name}`);
	}
}

async function refreshToolDiagnostics() {
	const modelContext = document.modelContext;
	if (!modelContext || typeof modelContext.getTools !== "function") {
		toolStatus.textContent = "Tool diagnostics unavailable";
		return;
	}
	try {
		const tools = await modelContext.getTools();
		const names = tools.map((tool) => tool.name);
		toolStatus.textContent = `${names.length} tool${names.length === 1 ? "" : "s"} registered`;
		toolStatus.title = names.join("\n");
	} catch (error) {
		toolStatus.textContent = "Tool diagnostics failed";
		toolStatus.title = error instanceof Error ? error.message : String(error);
	}
}

async function initializeWebMcp() {
	if (!hasWebMcpModelContext(document)) {
		webMcpStatus.textContent = "WebMCP unavailable — human UI still works";
		toolStatus.textContent = "0 tools registered";
		return;
	}

	nativeStatusController = await registerNativeStatusTool(() => ({
		view,
		productCount: lab.snapshot().length,
		lowStockCount: lab.lowStock().length,
	}));

	discoverySurface = await createIndigoWebMcpDiscoverySurface({
		document,
		getContext: () => ({ view }),
		loadProjection: async ({ context, input, signal }) => {
			if (signal.aborted) throw signal.reason;
			return {
				revision: `lab-${++revision}`,
				context,
				capabilities: relevantCapabilities(input.query),
			};
		},
		execute: executeCapability,
	});
	webMcpStatus.textContent = `WebMCP ${discoverySurface.status}`;

	const modelContext = document.modelContext;
	if (typeof modelContext.addEventListener === "function") {
		const onToolChange = () => void refreshToolDiagnostics();
		modelContext.addEventListener("toolchange", onToolChange);
		removeToolChangeListener = () => modelContext.removeEventListener("toolchange", onToolChange);
	}
	await refreshToolDiagnostics();
	log("WebMCP discovery registered. Ask the agent to discover a capability first.");
}

lab.subscribe((products) => render(products));

document.addEventListener("click", (event) => {
	const target = event.target;
	if (!(target instanceof HTMLButtonElement)) return;

	if (target.dataset.view) {
		view = target.dataset.view;
		discoverySurface?.invalidate("lab-view-changed");
		render();
		void refreshToolDiagnostics();
		log("Human changed view", { view });
		return;
	}

	if (target.dataset.restock) {
		const product = lab.restock(target.dataset.restock, 5);
		log("Human restocked shared inventory", {
			productId: product.id,
			quantity: 5,
			stock: product.stock,
		});
	}
});

document.querySelector("#reset").addEventListener("click", () => {
	lab.reset();
	discoverySurface?.invalidate("lab-reset");
	void refreshToolDiagnostics();
	log("Lab state reset");
});

window.addEventListener("pagehide", () => {
	removeToolChangeListener?.();
	discoverySurface?.dispose("lab-page-hidden");
	nativeStatusController?.abort("lab-page-hidden");
});

render();
void initializeWebMcp().catch((error) => {
	webMcpStatus.textContent = "WebMCP initialization failed";
	log("WebMCP initialization failed", {
		message: error instanceof Error ? error.message : String(error),
	});
});
