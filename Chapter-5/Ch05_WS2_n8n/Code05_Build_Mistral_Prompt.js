// Build Mistral chat bodies: one output item per input ticker,
// asking for a Telegram-ready MarkdownV2 message (no JSON).

const MAX_NEWS = 5;        // cap headlines
const MAX_LINE = 300;      // trim long lines

function fmt(n, d = 2) {
  if (n === null || n === undefined) return "n/a";
  const v = Number(n);
  return Number.isFinite(v) ? v.toFixed(d) : "n/a";
}

const out = [];

for (const itWrap of items) {
  const it = itWrap.json || {};

  // news lines
  const newsLines = Array.isArray(it.news) ? it.news : [];
  const newsBlock = newsLines
    .filter(Boolean)
    .slice(0, MAX_NEWS)
    .map(s => String(s).slice(0, MAX_LINE))
    .map(s => `- ${s}`)
    .join('\n') || '— no notable news —';

  // prompt: TASK first, then details, news last; use """ multiline
  const userContent = `"""
Task:
Provide a concise stock recommendation for Telegram.
Output must be a single MarkdownV2 message, no JSON, no code blocks.

Format:
*${it.symbol || 'SYM'}*
Score: *X/10*
Recommendation: *BUY/SELL/HOLD*
Projection (1w): *N.NN%*
Rationale: <one sentence>
Uncertainty: <one sentence>

Details:
Symbol: ${it.symbol || 'n/a'}
Timestamp: ${it.timestamp || 'n/a'}
Last price: ${fmt(it.price)}
Day change: ${fmt(it.change)} (${fmt(it.changePercent)}%)
Risk: z1=${fmt(it.z1)}, zH=${fmt(it.zH)}, moveVsATR=${fmt(it.moveVsATR)}, volSpike=${Boolean(it.volSpike)}, volatilityFlag=${Boolean(it.volatilityFlag)}

News (last 2 days):
${newsBlock}
"""`;

  out.push({
    json: {
      model: "mistral-small-latest",
      temperature: 0.3,
      // IMPORTANT: no response_format here; we want plain text MarkdownV2
      messages: [
        {
          role: "system",
          content:
            "You are a financial analytics assistant. Return one concise Telegram-ready MarkdownV2 message only. Do not return JSON. Do not use code blocks. Properly escape MarkdownV2 special characters."
        },
        { role: "user", content: userContent }
      ]
    }
  });
}

return out;
