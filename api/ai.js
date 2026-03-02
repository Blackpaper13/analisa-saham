// api/ai.js — Vercel Serverless Function
// Ganti GROQ_API_KEY dengan environment variable di Vercel Dashboard

const GROQ_API_KEY = process.env.GROQ_API_KEY;

async function fetchYahooFinance(symbol) {
  const ticker = symbol.includes(".JK") ? symbol : `${symbol}.JK`;

  try {
    const [chartRes, summaryRes] = await Promise.all([
      fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1y`,
        { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } }
      ),
      fetch(
        `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=price,summaryDetail,defaultKeyStatistics`,
        { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } }
      ),
    ]);

    const chartJson   = await chartRes.json();
    const summaryJson = await summaryRes.json();

    const chart      = chartJson?.chart?.result?.[0];
    const meta       = chart?.meta;
    const quotes     = chart?.indicators?.quote?.[0];
    const timestamps = chart?.timestamp || [];

    if (!meta || !quotes) throw new Error("Data chart kosong dari Yahoo Finance");

    const closesRaw = quotes.close.map((v, i) => ({ v, i })).filter(x => x.v !== null);
    const highsRaw  = quotes.high.map((v, i) => ({ v, i })).filter(x => x.v !== null);
    const lowsRaw   = quotes.low.map((v, i) => ({ v, i })).filter(x => x.v !== null);
    const vols      = quotes.volume.filter(v => v !== null);

    const closeVals = closesRaw.map(x => x.v);
    const highVals  = highsRaw.map(x => x.v);
    const lowVals   = lowsRaw.map(x => x.v);

    function calcEMA(prices, period) {
      if (prices.length < period) return 0;
      const k = 2 / (period + 1);
      let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
      for (let i = period; i < prices.length; i++) ema = prices[i] * k + ema * (1 - k);
      return Math.round(ema);
    }

    function calcRSI(prices, period = 14) {
      if (prices.length < period + 1) return 50;
      let gains = 0, losses = 0;
      for (let i = 1; i <= period; i++) {
        const d = prices[i] - prices[i - 1];
        if (d > 0) gains += d; else losses += Math.abs(d);
      }
      let ag = gains / period, al = losses / period;
      for (let i = period + 1; i < prices.length; i++) {
        const d = prices[i] - prices[i - 1];
        ag = (ag * (period - 1) + (d > 0 ? d : 0)) / period;
        al = (al * (period - 1) + (d < 0 ? Math.abs(d) : 0)) / period;
      }
      if (al === 0) return 100;
      return parseFloat((100 - 100 / (1 + ag / al)).toFixed(2));
    }

    function calcATR(h, l, c, period = 14) {
      if (c.length < period + 1) return 0;
      const trs = [];
      for (let i = 1; i < c.length; i++) {
        trs.push(Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])));
      }
      return Math.round(trs.slice(-period).reduce((a, b) => a + b, 0) / period);
    }

    function calcBB(prices, period = 20) {
      const slice = prices.slice(-period);
      if (slice.length < period) return { upper: 0, mid: 0, lower: 0 };
      const mid = slice.reduce((a, b) => a + b, 0) / period;
      const std = Math.sqrt(slice.reduce((s, v) => s + Math.pow(v - mid, 2), 0) / period);
      return { upper: Math.round(mid + 2 * std), mid: Math.round(mid), lower: Math.round(mid - 2 * std) };
    }

    const currentPrice = meta.regularMarketPrice;
    const prevClose    = meta.chartPreviousClose || closeVals.at(-2);
    const open         = meta.regularMarketOpen  || closeVals.at(-2);
    const volume       = meta.regularMarketVolume || vols.at(-1);
    const avgVolume    = Math.round(vols.slice(-30).reduce((a, b) => a + b, 0) / Math.min(30, vols.length));
    const high52w      = Math.max(...highVals);
    const low52w       = Math.min(...lowVals);

    const ema50  = calcEMA(closeVals, 50);
    const ema200 = calcEMA(closeVals, 200);
    const rsi14  = calcRSI(closeVals);
    const atr14  = calcATR(highVals, lowVals, closeVals);
    const bb     = calcBB(closeVals);

    const athIdx  = highVals.indexOf(high52w);
    const athDate = timestamps[highsRaw[athIdx]?.i]
      ? new Date(timestamps[highsRaw[athIdx].i] * 1000).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
      : "-";
    const distToATH = high52w > 0
      ? parseFloat(((high52w - currentPrice) / high52w * 100).toFixed(2))
      : 0;

    const summaryResult = summaryJson?.quoteSummary?.result?.[0];
    const marketCap     = summaryResult?.summaryDetail?.marketCap?.raw || 0;
    const companyName   = summaryResult?.price?.longName || summaryResult?.price?.shortName || ticker;

    const stats = summaryResult?.defaultKeyStatistics || {};
    const eps   = stats?.trailingEps?.raw || 0;
    const bvps  = stats?.bookValue?.raw   || 0;

    let fairValue = 0;
    if (eps > 0 && bvps > 0) {
      fairValue = Math.round(Math.sqrt(22.5 * eps * bvps));
    } else {
      fairValue = Math.round((bvps > 0 ? bvps : ema200) * 0.8);
    }

    let valuationStatus = "FAIR";
    if (currentPrice < fairValue * 0.9)  valuationStatus = "UNDERVALUED";
    else if (currentPrice > fairValue * 1.1) valuationStatus = "OVERVALUED";

    const marginOfSafety = fairValue > 0
      ? parseFloat(((fairValue - currentPrice) / fairValue * 100).toFixed(2))
      : 0;

    return {
      ticker, companyName, currentPrice, prevClose, open, volume, avgVolume,
      high52w, low52w, marketCap, ema50, ema200, rsi14,
      bbUpper: bb.upper, bbMid: bb.mid, bbLower: bb.lower,
      atr14, allTimeHigh: high52w, allTimeHighDate: athDate, distToATH,
      volRatio: parseFloat((volume / avgVolume).toFixed(2)),
      fairValue, valuationStatus, marginOfSafety,
    };
  } catch (err) {
    console.error("Yahoo Finance error:", err.message);
    return null;
  }
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { messages, systemPrompt } = req.body;
    const userMessage = messages[0].content;

    const symbolMatch = userMessage.match(/\b([A-Z]{2,5})\b/);
    const symbol      = symbolMatch ? symbolMatch[1] : "BBCA";

    const realData = await fetchYahooFinance(symbol);

    let enrichedPrompt = userMessage;

    if (realData) {
      enrichedPrompt = `${userMessage}

=== DATA REAL-TIME YAHOO FINANCE (GUNAKAN PERSIS, JANGAN UBAH ANGKA) ===
Nama Perusahaan : ${realData.companyName}
Symbol          : ${realData.ticker}
Harga Sekarang  : ${realData.currentPrice}
Prev Close      : ${realData.prevClose}
Open            : ${realData.open}
Volume Hari Ini : ${realData.volume}
Rata-rata Volume: ${realData.avgVolume}
Market Cap      : ${realData.marketCap}
52W High        : ${realData.high52w}
52W Low         : ${realData.low52w}
EMA 50          : ${realData.ema50}
EMA 200         : ${realData.ema200}
RSI 14          : ${realData.rsi14}
BB Upper        : ${realData.bbUpper}
BB Mid          : ${realData.bbMid}
BB Lower        : ${realData.bbLower}
ATR 14          : ${realData.atr14}
ATH (52w)       : ${realData.allTimeHigh} pada ${realData.allTimeHighDate}
Jarak ke ATH    : ${realData.distToATH}%
Volume Ratio    : ${realData.volRatio}x
Fair Value      : ${realData.fairValue}
Valuasi Status  : ${realData.valuationStatus}
Margin of Safety: ${realData.marginOfSafety}%
=========================================================================

Tugas kamu:
- Isi JSON dengan semua nilai di atas (JANGAN ubah angka-angka tersebut)
- stopLoss   = ${realData.currentPrice - 2 * realData.atr14}
- takeProfit = ${realData.currentPrice + 3 * realData.atr14}
- Tentukan trend berdasarkan posisi harga vs EMA50/EMA200
- Tentukan keyLevel support/resistance dari range 52w
- Buat 4-7 sinyal aktif berdasarkan indikator di atas
- Tulis summary analisis 2-3 kalimat bahasa Indonesia. Bahas juga soal valuasinya (Undervalued/Overvalued).`;
    }

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: enrichedPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      }),
    });

    const groqData = await groqRes.json();
    if (groqData.error) throw new Error(groqData.error.message);

    let aiText = groqData.choices[0].message.content;

    if (realData) {
      try {
        const parsed = JSON.parse(aiText);
        Object.assign(parsed, {
          currentPrice:    realData.currentPrice,
          prevClose:       realData.prevClose,
          open:            realData.open,
          high52w:         realData.high52w,
          low52w:          realData.low52w,
          volume:          realData.volume,
          avgVolume:       realData.avgVolume,
          marketCap:       realData.marketCap    || parsed.marketCap,
          ema50:           realData.ema50         || parsed.ema50,
          ema200:          realData.ema200        || parsed.ema200,
          rsi14:           realData.rsi14,
          bbUpper:         realData.bbUpper,
          bbMid:           realData.bbMid,
          bbLower:         realData.bbLower,
          atr14:           realData.atr14,
          allTimeHigh:     realData.allTimeHigh,
          allTimeHighDate: realData.allTimeHighDate,
          distToATH:       realData.distToATH,
          volRatio:        realData.volRatio,
          fairValue:       realData.fairValue,
          valuationStatus: realData.valuationStatus,
          marginOfSafety:  realData.marginOfSafety,
          stopLoss:        Math.round(realData.currentPrice - 2 * realData.atr14),
          takeProfit:      Math.round(realData.currentPrice + 3 * realData.atr14),
          riskReward:      1.5,
        });
        aiText = JSON.stringify(parsed);
      } catch (_) { /* biarkan respons AI asli */ }
    }

    res.status(200).json({ content: aiText });

  } catch (err) {
    console.error("API Error:", err.message);
    res.status(500).json({ error: err.message });
  }
}
