// Robust flattener + dedupe + top-25 for Yahoo screener outputs (and mixed rows)

// ---- config
const LIMIT = 5;

// ---- helpers
function normNum(v) {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (v == null) return 0;
  const n = parseFloat(String(v).replace('%','').trim());
  return isFinite(n) ? n : 0;
}

function cleanSymbol(s) {
  return (s || '').toString().trim().toUpperCase();
}

function isLikelyEquity(sym, quoteType) {
  if (!sym) return false;
  if (sym.startsWith('^')) return false;          // indexes (^GSPC)
  if (sym.includes('=')) return false;            // FX pairs, etc.
  if (quoteType && quoteType !== 'EQUITY') return false;
  return true;
}

// Extract array of quote-like rows from any incoming item
function extractRowsFromItem(it) {
  const row = it?.json ?? it ?? {};
  // Yahoo predefined screener shape:
  // { finance: { result: [ { quotes: [...] } ] } }
  const quotes = row.finance?.result?.[0]?.quotes;
  if (Array.isArray(quotes) && quotes.length) {
    return quotes.map(q => ({
      symbol: q.symbol,
      changePct: normNum(q.regularMarketChangePercent),
      quoteType: q.quoteType
    }));
  }
  // Already a flat row
  return [{
    symbol: row.symbol || row.ticker,
    changePct: normNum(
      row.changePct ??
      row.regularMarketChangePercent ??
      row.changesPercentage ??
      row.percentchange
    ),
    quoteType: row.quoteType
  }];
}

// ---- main
const bucket = [];
for (const it of items) {
  const rows = extractRowsFromItem(it);
  for (const r of rows) bucket.push(r);
}

// Deduplicate & filter
const seen = new Set();
const flat = [];
for (const r of bucket) {
  const sym = cleanSymbol(r.symbol);
  if (!isLikelyEquity(sym, r.quoteType)) continue;
  if (seen.has(sym)) continue;
  seen.add(sym);
  flat.push({ symbol: sym, changePct: normNum(r.changePct) });
}

// Sort by absolute % move desc and take top N
flat.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
const top = flat.slice(0, LIMIT);

// Output as one item per ticker
return top.map(x => ({ json: { symbol: x.symbol, changePct: x.changePct } }));
