/**
 * n8n Code (Function) node
 * INPUT items:  [{ json: { symbol: "NVDA", data: "<rss>...</rss>" } }, ...]
 * OUTPUT items: [{ json: { symbol: "NVDA", news: ["title — snippet", ...] } }, ...]
 */

const TOP_N = 5;        // max headlines per symbol
const SNIP = 240;       // snippet length
const REQUIRED_MATCH = false; // if true: keep only items that mention the ticker

function stripHtml(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tickerRegex(sym) {
  const esc = String(sym || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9])(?:\\$|NASDAQ:|NYSE:|AMEX:)?\\s*${esc}(?=$|[^A-Za-z0-9])`, 'i');
}

function getXmlFromJson(j) {
  if (typeof j === 'string') return j;
  if (typeof j?.data === 'string') return j.data;
  if (typeof j?.body === 'string') return j.body;
  // try any first string field as last resort
  for (const k of Object.keys(j || {})) {
    if (typeof j[k] === 'string') return j[k];
  }
  return '';
}

function parseRss(xml, symbol) {
  const reItem = /<item\b[\s\S]*?<\/item>/gi;
  const blocks = Array.from(xml.matchAll(reItem)).map(m => m[0]);
  if (!blocks.length) return [];

  const reTitle = /<title>([\s\S]*?)<\/title>/i;
  const reDesc  = /<description>([\s\S]*?)<\/description>/i;
  const reTick  = tickerRegex(symbol);

  const seen = new Set();
  const out = [];

  for (const block of blocks) {
    const t = stripHtml((block.match(reTitle)?.[1]) || '');
    const d = stripHtml((block.match(reDesc)?.[1]) || '');
    if (!t) continue;

    if (REQUIRED_MATCH && symbol && !reTick.test(`${t} ${d}`)) continue;

    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    out.push(d ? `${t} — ${d.slice(0, SNIP)}` : t);
    if (out.length >= TOP_N) break;
  }
  return out;
}

// ---- process all incoming items
const out = [];
for (let i = 0; i < items.length; i++) {
  const input = items[i].json || {};
  const symbol = String(input.symbol || '').trim();
  const xml = getXmlFromJson(input);
  const news = xml ? parseRss(xml, symbol) : [];
  out.push({ json: { symbol, news } });
}

return out;
