// Function Item node — returns ONE plain object

function round(x, d = 2) { return Number((x ?? 0).toFixed(d)); }

function computeSeriesMetricsEnhanced(series) {
  const cfg = { window: 50, H: 6, z1Thresh: 1.5, zHThresh: 1.8, pctThresh: 0.75, atrPeriod: 14, atrMult: 1.0, volSpikeMult: 1.8 };

  const ts = Array.isArray(series.timestamp) ? series.timestamp.filter(Number.isFinite) : [];
  const close = (Array.isArray(series.close) ? series.close : []).filter(Number.isFinite);
  const high  = (Array.isArray(series.high)  ? series.high  : []).filter(Number.isFinite);
  const low   = (Array.isArray(series.low)   ? series.low   : []).filter(Number.isFinite);
  const vol   = (Array.isArray(series.volume)? series.volume: []).filter(x => Number.isFinite(x) && x >= 0);

  const n = close.length;
  const latestTs = ts.length ? new Date(ts[ts.length - 1] * 1000).toISOString() : new Date().toISOString();

  if (n < 3) {
    return { symbol: series.symbol ?? null, note: "insufficient_bars", volatilityFlag: false, timestamp: latestTs };
  }

  const last = close[n - 1], prev = close[n - 2];
  const change = last - prev;
  const changePct = prev ? (change / prev) * 100 : 0;

  // 1-bar log-return z-score
  const rets = [];
  for (let i = 1; i < n; i++) if (close[i-1] > 0 && close[i] > 0) rets.push(Math.log(close[i] / close[i-1]));
  const W = Math.min(cfg.window, rets.length);
  const R1 = rets.slice(-W);
  const mean1 = R1.reduce((a, b) => a + b, 0) / (R1.length || 1);
  const std1  = Math.sqrt(R1.reduce((a, b) => a + (b - mean1) ** 2, 0) / Math.max(R1.length - 1, 1)) || 1e-9;
  const z1 = (rets[rets.length - 1] - mean1) / std1;

  // H-bar z-score (drift)
  let zH = 0;
  if (n > cfg.H) {
    const retH = Math.log(close[n - 1] / close[n - 1 - cfg.H]);
    const RH = [];
    for (let i = cfg.H; i < n; i++) if (close[i-cfg.H] > 0 && close[i] > 0) RH.push(Math.log(close[i] / close[i-cfg.H]));
    const WH = Math.min(cfg.window, RH.length);
    const RHw = RH.slice(-WH);
    const meanH = RHw.reduce((a,b)=>a+b,0) / (RHw.length || 1);
    const stdH  = Math.sqrt(RHw.reduce((a,b)=>a+(b-meanH)**2,0) / Math.max(RHw.length-1,1)) || 1e-9;
    zH = (retH - meanH) / stdH;
  }

  // ATR-based move (if highs/lows available)
  let moveVsATR = 0;
  if (high.length === n && low.length === n) {
    const tr = [];
    for (let i = 1; i < n; i++) {
      const hl = high[i] - low[i];
      const hc = Math.abs(high[i] - close[i - 1]);
      const lc = Math.abs(low[i] - close[i - 1]);
      tr.push(Math.max(hl, hc, lc));
    }
    const atr = tr.slice(-cfg.atrPeriod).reduce((a,b)=>a+b,0) / Math.max(cfg.atrPeriod, 1);
    moveVsATR = atr ? Math.abs(change) / atr : 0;
  }

  // Volume spike (if volume)
  let volSpike = false;
  if (vol.length === n && n > 21) {
    const avgVol = vol.slice(-21, -1).reduce((a,b)=>a+b,0) / 20;
    volSpike = avgVol ? (vol[n - 1] > cfg.volSpikeMult * avgVol) : false;
  }

  const flag = Math.abs(z1) >= cfg.z1Thresh ||
               Math.abs(zH) >= cfg.zHThresh ||
               Math.abs(changePct) >= cfg.pctThresh ||
               moveVsATR >= cfg.atrMult ||
               volSpike;

  return {
    symbol: series.symbol ?? null,
    price: round(last),
    change: round(change),
    changePercent: round(changePct),
    z1: round(z1, 2),
    zH: round(zH, 2),
    moveVsATR: round(moveVsATR, 2),
    volSpike,
    volatilityFlag: !!flag,
    timestamp: latestTs
  };
}

// ---- detect current item shape and ALWAYS return ONE object ----
const j = $json;

try {
  // A) /v8/finance/chart  (single symbol)
  if (j?.chart?.result?.[0]) {
    const r0 = j.chart.result[0];
    const q  = r0.indicators?.quote?.[0] || {};
    const series = {
      symbol: r0.meta?.symbol ?? null,
      timestamp: r0.timestamp || [],
      close: q.close || [],
      high: q.high || [],
      low: q.low || [],
      volume: q.volume || []
    };
    return computeSeriesMetricsEnhanced(series);
  }

  // B) spark single series: { symbol, timestamp[], close[] }
  if (j?.symbol && Array.isArray(j?.close)) {
    const series = { symbol: j.symbol, timestamp: j.timestamp || [], close: j.close || [], high: [], low: [], volume: [] };
    return computeSeriesMetricsEnhanced(series);
  }

  // C) quote snapshot (first element only if multiple)
  if (Array.isArray(j?.quoteResponse?.result) && j.quoteResponse.result.length) {
    const r = j.quoteResponse.result[0];
    const cp = r.regularMarketChangePercent ?? null;
    return {
      symbol: r.symbol ?? null,
      price: r.regularMarketPrice ?? null,
      changePercent: cp,
      z1: null, zH: null, moveVsATR: null, volSpike: null,
      volatilityFlag: Math.abs(cp ?? 0) >= 2.0,
      timestamp: new Date().toISOString()
    };
  }

  // D) fallback — unknown shape, but still return an object
  return { symbol: j.symbol ?? null, note: "unrecognized_shape", volatilityFlag: false, timestamp: new Date().toISOString(), keys: Object.keys(j || {}) };

} catch (e) {
  // Never throw: always return an object
  return { error: "parse_failed", message: e.message, volatilityFlag: false, timestamp: new Date().toISOString() };
}
