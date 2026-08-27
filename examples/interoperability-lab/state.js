const STORAGE_KEY = "indigo-webmcp-lab-state-v1";

export const INITIAL_PRODUCTS = Object.freeze([
	Object.freeze({ id: "espresso", name: "Espresso Beans", stock: 18, reorderLevel: 12 }),
	Object.freeze({ id: "oat-milk", name: "Oat Milk", stock: 6, reorderLevel: 10 }),
	Object.freeze({ id: "cups", name: "12 oz Cups", stock: 42, reorderLevel: 24 }),
	Object.freeze({ id: "vanilla", name: "Vanilla Syrup", stock: 3, reorderLevel: 5 }),
]);

function cloneInitialProducts() {
	return INITIAL_PRODUCTS.map((product) => ({ ...product }));
}

function isProduct(value) {
	return (
		value !== null &&
		typeof value === "object" &&
		typeof value.id === "string" &&
		typeof value.name === "string" &&
		Number.isInteger(value.stock) &&
		value.stock >= 0 &&
		Number.isInteger(value.reorderLevel) &&
		value.reorderLevel >= 0
	);
}

function readStoredProducts(storage) {
	if (!storage) return cloneInitialProducts();
	try {
		const raw = storage.getItem(STORAGE_KEY);
		if (!raw) return cloneInitialProducts();
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every(isProduct)) {
			return cloneInitialProducts();
		}
		return parsed.map((product) => ({ ...product }));
	} catch {
		return cloneInitialProducts();
	}
}

export function createLabState(storage = null) {
	let products = readStoredProducts(storage);
	const listeners = new Set();

	function snapshot() {
		return products.map((product) => ({ ...product }));
	}

	function persist() {
		if (!storage) return;
		try {
			storage.setItem(STORAGE_KEY, JSON.stringify(products));
		} catch {
			// Persistence is best-effort; the in-memory lab remains operational.
		}
	}

	function notify() {
		const current = snapshot();
		for (const listener of listeners) listener(current);
	}

	function commit(nextProducts) {
		products = nextProducts;
		persist();
		notify();
		return snapshot();
	}

	return {
		snapshot,
		search(query = "") {
			const normalized = String(query).trim().toLowerCase();
			return snapshot().filter(
				(product) => !normalized || product.name.toLowerCase().includes(normalized),
			);
		},
		lowStock() {
			return snapshot().filter((product) => product.stock <= product.reorderLevel);
		},
		restock(productId, quantity) {
			if (typeof productId !== "string" || !productId.trim()) {
				throw new Error("lab_product_id_required");
			}
			if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
				throw new Error("lab_restock_quantity_invalid");
			}
			const index = products.findIndex((product) => product.id === productId);
			if (index < 0) throw new Error("lab_product_not_found");
			const next = snapshot();
			next[index].stock += quantity;
			commit(next);
			return { ...next[index] };
		},
		reset() {
			return commit(cloneInitialProducts());
		},
		subscribe(listener) {
			if (typeof listener !== "function") throw new TypeError("lab_listener_required");
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
}
