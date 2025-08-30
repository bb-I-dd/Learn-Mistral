/**
 * Align current items (with {data}) to symbols emitted by another node
 * named EXACTLY: Code - Dedupe and Sorting
 *
 * INPUT (this node):  [{json:{data:"..."}} , ...]
 * UPSTREAM node:      [{json:{symbol:"ABCD"}}, ...]
 * OUTPUT:             [{json:{symbol:"ABCD", data:"..."}} , ...]
 */

const SYMBOLS_NODE = 'Code - Dedupe and Sorting';  // <-- must match the node's label exactly
const CYCLE_IF_SHORT = false; // set true if you want to wrap symbols when data items > symbols

// Grab ALL items from the symbols node (runIndex 0)
const symItems = $items(SYMBOLS_NODE, 0) || [];
const nSym = symItems.length;

if (!nSym) {
  throw new Error(`No items from node "${SYMBOLS_NODE}". 
- Check the node name (must match exactly, including spaces and case).
- Ensure this node is executed BEFORE the current one (connect the flow).
- Open Executions → select "${SYMBOLS_NODE}" → confirm it produced items.`);
}

const out = [];
for (let i = 0; i < items.length; i++) {
  // Choose which symbol item to use
  let idx = i;
  if (idx >= nSym) {
    if (!CYCLE_IF_SHORT) break;            // stop if we don't want to cycle
    idx = i % nSym;                         // or cycle
  }
  const sym = symItems[idx]?.json?.symbol ?? null;

  // Accept either {data: "..."} or any json payload
  const dataPayload = (items[i].json && 'data' in items[i].json)
    ? items[i].json.data
    : items[i].json;

  out.push({
    json: {
      symbol: sym,
      data: dataPayload
    }
  });
}

return out;
