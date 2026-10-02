// Loads the mock data files, checks they are consistent, and prints a summary.
// Run from anywhere:  node data/verify-data.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const load = file => JSON.parse(readFileSync(join(here, file), "utf8"));

const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };
const round = n => Math.round(n * 100) / 100;

// --- Catalog ---
const { products } = load("products.json");
const byId = new Map();
for (const p of products) {
  check(!byId.has(p.id), `duplicate product id ${p.id}`);
  byId.set(p.id, p);
  for (const f of ["id", "name", "category", "unit"]) check(typeof p[f] === "string" && p[f], `${p.id}: missing ${f}`);
  check(typeof p.price === "number" && p.price > 0, `${p.id}: bad price`);
  check(typeof p.isVegetarian === "boolean", `${p.id}: isVegetarian must be true/false`);
  check(typeof p.onDeal === "boolean", `${p.id}: onDeal must be true/false`);
  check(typeof p.inStock === "boolean", `${p.id}: inStock must be true/false`);
  if (p.onDeal) check(typeof p.dealPrice === "number" && p.dealPrice < p.price, `${p.id}: deal price must be below the normal price`);
  else check(p.dealPrice === null, `${p.id}: dealPrice should be null when not on deal`);
}

// --- Purchase history ---
const { shopper, orders } = load("purchase-history.json");
for (const o of orders) {
  for (const line of o.items) {
    check(byId.has(line.productId), `${o.orderId}: unknown product ${line.productId}`);
    check(round(line.unitPrice * line.quantity) === line.lineTotal, `${o.orderId}/${line.productId}: lineTotal doesn't match`);
  }
  check(round(o.items.reduce((s, l) => s + l.lineTotal, 0)) === o.total, `${o.orderId}: total doesn't match its items`);
}

if (errors.length) {
  console.error(`FAILED - ${errors.length} problem(s):\n  ` + errors.join("\n  "));
  process.exit(1);
}

// --- Summary ---
const count = (list, key) => list.reduce((m, x) => m.set(key(x), (m.get(key(x)) ?? 0) + 1), new Map());

console.log(`Catalog: ${products.length} products`);
for (const [cat, n] of count(products, p => p.category)) {
  const deals = products.filter(p => p.category === cat && p.onDeal).length;
  console.log(`  ${cat.padEnd(16)} ${String(n).padStart(2)} items  (${deals} on deal)`);
}
console.log(`  On deal: ${products.filter(p => p.onDeal).length}   Out of stock: ${products.filter(p => !p.inStock).length}   Vegetarian: ${products.filter(p => p.isVegetarian).length}   Non-veg: ${products.filter(p => !p.isVegetarian).length}`);

console.log(`\nPurchase history for ${shopper.name} (${shopper.id}): ${orders.length} past orders`);
for (const o of orders) console.log(`  ${o.orderId}  ${o.date}  ${String(o.items.length).padStart(2)} items  $${o.total.toFixed(2)}`);

const staples = [...count(orders.flatMap(o => o.items), l => l.productId)]
  .filter(([, n]) => n >= orders.length - 2)
  .map(([id, n]) => `${byId.get(id).name} (${n}/${orders.length})`);
console.log(`  Staples (bought in most orders): ${staples.join(", ")}`);

console.log("\nOK - both files loaded and passed all checks.");
