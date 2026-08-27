# Browser test procedure

## Automated gate

```bash
pnpm check
```

The gate covers formatting/linting, strict TypeScript, production compilation, registration lifecycle, rollback, cancellation, projection parsing, contextual replacement, discovery, and JSON result safety.

## Browser interoperability lab

Start the lab:

```bash
pnpm demo
```

Then open `http://127.0.0.1:4173/examples/interoperability-lab/` in ChatGPT's in-app browser or Chrome 149+ with WebMCP testing enabled.

### 1. Native API detection

The page should show `WebMCP registered`. A browser without WebMCP should instead show an unavailable message while the human UI continues to work.

### 2. Direct native registration

Discover `indigo.lab.status`. This tool is intentionally registered with a literal `document.modelContext.registerTool(...)` call in `native-registration.js` and verifies baseline browser support.

### 3. On-demand discovery

Invoke:

```json
{
  "query": "find low stock products"
}
```

on `indigo.capabilities.discover`.

The returned `toolNames` should include inventory capabilities. No contextual capability is loaded before discovery is invoked.

### 4. Read execution

Invoke `indigo.lab.inventory.low_stock`. It should return Oat Milk and Vanilla Syrup from the initial dataset.

### 5. Mutation shared with the human UI

Invoke `indigo.lab.inventory.restock` with:

```json
{
  "productId": "vanilla",
  "quantity": 8
}
```

The table should immediately show Vanilla Syrup stock increase from 3 to 11. This demonstrates that the agent and human operate on the same application state rather than on a detached tool mock.

### 6. Context invalidation

Switch between Catalog and Inventory using the human UI. The adapter invalidates the previous contextual registration while preserving the discovery tool. Invoke discovery again and verify the newly relevant tool set.

### 7. Teardown

Navigate away or close the page. The lab aborts both the direct native registration and the discovery surface, causing the browser to unregister their tools.
