import {
	createIndigoWebMcpDiscoverySurface,
	hasWebMcpModelContext,
} from "../../dist/index.js";
import { registerNativeStatusTool } from "./native-registration.js";

const INITIAL_PRODUCTS = [
	{ id: "espresso", name: "Espresso Beans", stock: 18, reorderLevel: 12 },
	{ id: "oat-milk", name: "Oat Milk", stock: 6, reorderLevel: 10 },
	{ id: "cups", name: "12 oz Cups", stock: 42, reorderLevel: 24 },
	{ id: "vanilla", name: "Vanilla Syrup", stock: 3, reorderLevel: 5 },
];

let products = structuredClone(INITIAL_PRODUCTS);
let view = "catalog";
let revision = 0;
let discoverySurface = null;
let nativeStatusController = null;

const body = document.querySelector("#inventory-body");
const webMcpStatus = document.querySelector("#webmcp-status");
const viewStatus = document.querySelector("#view-status");
const eventLog = document.querySelector("#event-log");

function log(message, payload) {
	const suffix =
		payload === undefined ? "" : `\n${JSON.stringify(payload, null, 2)}`;
	eventLog.textContent = `${new Date().toLocaleTimeString()} — ${message}${suffix}`;
}

function render() {
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

function searchProducts(query) {
	const normalized = String(query ?? "")
		.trim()
		.toLowerCase();
	return products.filter(
		(product) =>
			!normalized || product.name.toLowerCase().includes(normalized),
	);
}

function relevantCapabilities(query) {
	const intent = String(query ?? "").toLowerCase();
	const wantsCatalog =
		view === "catalog" || /search|catalog|product|find/.test(intent);
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
				description:
					"List products whose stock is at or below their reorder level.",
				inputSchema: {
					type: "object",
					properties: {},
					additionalProperties: false,
				},
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
			const items = searchProducts(args.query).map(
				({ id, name, stock, reorderLevel }) => ({
					id,
					name,
					stock,
					reorderLevel,
				}),
			);
			log("Agent searched the shared catalog", {
				query: args.query ?? "",
				count: items.length,
			});
			return { items };
		}
		case "indigo.lab.inventory.low_stock": {
			const items = products.filter(
				(product) => product.stock <= product.reorderLevel,
			);
			log("Agent inspected low stock", { count: items.length });
			return { items };
		}
		case "indigo.lab.inventory.restock": {
			const product = products.find((item) => item.id === args.productId);
			const quantity = Number(args.quantity);
			if (!product) throw new Error("lab_product_not_found");
			if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
				throw new Error("lab_restock_quantity_invalid");
			}
			product.stock += quantity;
			render();
			log("Agent restocked shared inventory", {
				productId: product.id,
				quantity,
				stock: product.stock,
			});
			return { product: { ...product } };
		}
		default:
			throw new Error(`lab_capability_unknown:${capability.name}`);
	}
}

async function initializeWebMcp() {
	if (!hasWebMcpModelContext(document)) {
		webMcpStatus.textContent = "WebMCP unavailable — human UI still works";
		return;
	}

	nativeStatusController = await registerNativeStatusTool(() => ({
		view,
		productCount: products.length,
		lowStockCount: products.filter(
			(product) => product.stock <= product.reorderLevel,
		).length,
	}));

	discoverySurface = await createIndigoWebMcpDiscoverySurface({
		document,
		getContext: () => ({ view }),
		loadProjection: async ({ context, input }) => ({
			revision: `lab-${++revision}`,
			context,
			capabilities: relevantCapabilities(input.query),
		}),
		execute: executeCapability,
	});
	webMcpStatus.textContent = `WebMCP ${discoverySurface.status}`;
	log("WebMCP discovery registered. Ask the agent to discover a capability first.");
}

document.addEventListener("click", (event) => {
	const target = event.target;
	if (!(target instanceof HTMLButtonElement)) return;

	if (target.dataset.view) {
		view = target.dataset.view;
		discoverySurface?.invalidate("lab-view-changed");
		render();
		log("Human changed view", { view });
		return;
	}

	if (target.dataset.restock) {
		const product = products.find((item) => item.id === target.dataset.restock);
		if (!product) return;
		product.stock += 5;
		render();
		log("Human restocked shared inventory", {
			productId: product.id,
			quantity: 5,
			stock: product.stock,
		});
	}
});

document.querySelector("#reset").addEventListener("click", () => {
	products = structuredClone(INITIAL_PRODUCTS);
	discoverySurface?.invalidate("lab-reset");
	render();
	log("Lab state reset");
});

window.addEventListener("pagehide", () => {
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
