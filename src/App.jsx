import { useState, useCallback, useEffect } from "react";

const POPULAR_STOCKS = [
  "BBCA", "BBRI", "TLKM", "ASII", "BMRI", "GOTO", "BYAN", "ADRO",
  "INDF", "KLBF", "UNVR", "ICBP", "PGAS", "PTBA", "TOWR", "MTEL"
];

const SYSTEM_PROMPT = `Kamu adalah analis saham Indonesia yang ahli analisis teknikal dan fundamental. 
Kamu akan diberikan DATA REAL yang sudah dihitung. Tugasmu HANYA mengisi JSON dengan data tersebut dan menambahkan analisis kualitatif (signals, trend, summary, keyLevel) serta menghitung estimasi Valuasi.

JANGAN mengubah angka harga, RSI, EMA, ATR, BB yang sudah diberikan.

Kembalikan HANYA JSON valid (tanpa markdown, tanpa backtick) dengan format persis ini:
{
  "name": "nama perusahaan",
  "symbol": "kode.JK",
  "currentPrice": 0,
  "prevClose": 0,
  "open": 0,
  "high52w": 0,
  "low52w": 0,
  "volume": 0,
  "avgVolume": 0,
  "marketCap": 0,
  "exchange": "IDX",
  "ema50": 0,
  "ema200": 0,
  "rsi14": 0,
  "bbUpper": 0,
  "bbLower": 0,
  "bbMid": 0,
  "atr14": 0,
  "vwap": 0,
  "allTimeHigh": 0,
  "allTimeHighDate": "tanggal ATH",
  "distToATH": 0,
  "isAtATH": false,
  "brokeATH": false,
  "stopLoss": 0,
  "takeProfit": 0,
  "riskReward": 1.5,
  "volRatio": 0,
  "trend": "UPTREND atau DOWNTREND atau SIDEWAYS",
  "recommendation": "teks rekomendasi singkat",
  "recLevel": "STRONG_BUY atau BUY atau NEUTRAL atau SELL atau STRONG_SELL",
  "bullScore": 0,
  "bearScore": 0,
  "fairValue": 0,
  "valuationStatus": "UNDERVALUED atau FAIR atau OVERVALUED",
  "marginOfSafety": 0,
  "signals": [
    {"type": "bull atau bear atau neutral", "label": "penjelasan sinyal", "strength": "high atau med atau low"}
  ],
  "summary": "ringkasan analisis 2-3 kalimat dalam bahasa Indonesia",
  "keyLevel": {
    "support1": 0,
    "support2": 0,
    "resistance1": 0,
    "resistance2": 0
  },
  "lastUpdated": "waktu data"
}

Aturan:
- distToATH: persentase jarak harga ke ATH
- isAtATH: true jika distToATH < 1
- brokeATH: true jika currentPrice >= allTimeHigh
- trend: UPTREND jika harga > EMA50 > EMA200, DOWNTREND jika sebaliknya, SIDEWAYS jika tidak jelas
- bullScore & bearScore: 0-10 berdasarkan kombinasi indikator
- signals: 4-7 sinyal aktif (RSI, EMA cross, BB position, volume, trend, momentum)
- keyLevel: support dari low-low terdekat, resistance dari high-high terdekat
- fairValue: estimasi nilai wajar saham. Jika data fundamental kurang, estimasi berdasarkan rata-rata historis (PBV/PE) atau support kuat jangka panjang.
- valuationStatus: UNDERVALUED jika currentPrice < fairValue, OVERVALUED jika currentPrice > fairValue, FAIR jika setara.
- marginOfSafety: Hitung dengan rumus ((fairValue - currentPrice) / fairValue) * 100
- WAJIB kembalikan JSON valid saja`;

const fmtRp = (n) => {
  if (!n || n === 0) return "-";
  return "Rp " + Math.round(n).toLocaleString("id-ID");
};
const fmtNum = (n) => {
  if (!n) return "-";
  if (n >= 1e12) return (n / 1e12).toFixed(2) + "T";
  if (n >= 1e9)  return (n / 1e9).toFixed(2)  + "B";
  if (n >= 1e6)  return (n / 1e6).toFixed(2)  + "M";
  return n.toLocaleString("id-ID");
};
const fmtPct = (n) => {
  if (n == null) return "-";
  return (n >= 0 ? "+" : "") + Number(n).toFixed(2) + "%";
};

const REC_CONFIG = {
  STRONG_BUY:  { color: "#00ff9d", bg: "#00ff9d15", label: "SANGAT BULLISH — Beli Kuat 🚀" },
  BUY:         { color: "#4ade80", bg: "#4ade8015", label: "BULLISH — Peluang Beli ✅" },
  NEUTRAL:     { color: "#facc15", bg: "#facc1515", label: "NETRAL — Tunggu Konfirmasi ⏳" },
  SELL:        { color: "#fb923c", bg: "#fb923c15", label: "BEARISH — Pertimbangkan Jual ⚠️" },
  STRONG_SELL: { color: "#f87171", bg: "#f8717115", label: "SANGAT BEARISH — Exit ❌" },
};

const StatCard = ({ label, value, accent = "#e2e8f0", sub }) => (
  <div style={{ background: "#0f1923", border: "1px solid #1e3a5f", borderRadius: 5, padding: "8px 10px" }}>
    <div style={{ fontSize: 9, color: "#475569", letterSpacing: "0.1em", marginBottom: 3 }}>{label}</div>
    <div style={{ fontSize: 14, fontWeight: 600, color: accent }}>{value}</div>
    {sub && <div style={{ fontSize: 9, color: "#475569", marginTop: 2 }}>{sub}</div>}
  </div>
);

const RSIGauge = ({ value }) => {
  if (!value) return null;
  const pct   = Math.min(Math.max(value, 0), 100);
  const color = value > 70 ? "#f87171" : value < 30 ? "#4ade80" : "#a78bfa";
  const label = value > 70 ? "Overbought" : value < 30 ? "Oversold" : "Normal";
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3, fontSize: 9, color: "#475569" }}>
        <span>0</span><span style={{ color }}>{label}</span><span>100</span>
      </div>
      <div style={{ height: 6, background: "#1e3a5f", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3 }} />
      </div>
      <div style={{ textAlign: "right", fontSize: 11, color, marginTop: 2, fontWeight: 600 }}>
        {Number(value).toFixed(1)}
      </div>
    </div>
  );
};

const VolBar = ({ ratio }) => {
  if (!ratio) return null;
  const w     = Math.min(ratio / 3 * 100, 100);
  const color = ratio > 2 ? "#00ff9d" : ratio > 1.2 ? "#facc15" : "#64748b";
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ height: 6, background: "#1e3a5f", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${w}%`, background: color, borderRadius: 3 }} />
      </div>
      <div style={{ textAlign: "right", fontSize: 11, color, marginTop: 2, fontWeight: 600 }}>
        {Number(ratio).toFixed(2)}×
      </div>
    </div>
  );
};

const ScoreMeter = ({ bull, bear }) => {
  const total = (bull + bear) || 1;
  const bullW = (bull / total) * 100;
  return (
    <div style={{ minWidth: 180 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#475569", marginBottom: 3 }}>
        <span style={{ color: "#4ade80" }}>BULL +{bull}</span>
        <span style={{ color: "#f87171" }}>BEAR -{bear}</span>
      </div>
      <div style={{ height: 8, background: "#f8717144", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${bullW}%`, background: "#4ade80", borderRadius: 4 }} />
      </div>
    </div>
  );
};

export default function IDXScanner() {
  const [inputVal,     setInputVal]    = useState("BBCA");
  const [activeTicker, setActiveTicker]= useState("");
  const [data,         setData]        = useState(null);
  const [loading,      setLoading]     = useState(false);
  const [error,        setError]       = useState(null);
  const [loadingMsg,   setLoadingMsg]  = useState("");
  
  // Auto Refresh States
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [countdown, setCountdown]     = useState(60);

  const fetchStock = useCallback(async (sym, isSilent = false) => {
    if (!isSilent) {
      setLoading(true);
      setError(null);
      setData(null);
    }
    
    setActiveTicker(sym.toUpperCase());

    const steps = [
      "📡 Mengambil data real-time dari Yahoo Finance...",
      "🧮 Menghitung Valuasi & Indikator Teknikal...",
      "📊 Menganalisis sentimen pasar...",
      "⚡ Menyusun rekomendasi AI...",
    ];
    
    let step = 0;
    if (!isSilent) setLoadingMsg(steps[0]);
    
    const interval = !isSilent ? setInterval(() => {
      step = (step + 1) % steps.length;
      setLoadingMsg(steps[step]);
    }, 2500) : null;

    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemPrompt: SYSTEM_PROMPT,
          messages: [{
            role: "user",
            content: `Analisis saham ${sym.toUpperCase()} (IDX). Berikan data harga terbaru, RSI, EMA, Volatilitas, Valuasi (Fair Value), dan status ATH.`
          }]
        })
      });

      if (!response.ok) throw new Error(`Server Error: ${response.status}`);

      const result = await response.json();

      try {
        const parsed = JSON.parse(result.content);
        // Reset waktu jika ditarik real-time
        parsed.lastUpdated = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setData(parsed);
        if (isSilent) setCountdown(60); // Reset countdown after silent fetch success
      } catch {
        console.error("Format JSON tidak valid:", result.content);
        throw new Error("AI memberikan format data yang salah. Coba SCAN lagi.");
      }

    } catch (e) {
      console.error("Fetch Error:", e);
      if (!isSilent) {
        setError(e.message || "Gagal memuat data. Pastikan proxy server sudah jalan.");
      } else {
        setAutoRefresh(false); // Matikan auto refresh jika gagal saat silent fetch
        alert("Koneksi terputus saat auto-refresh. Auto-refresh dimatikan.");
      }
    } finally {
      if (interval) clearInterval(interval);
      if (!isSilent) {
        setLoading(false);
        setLoadingMsg("");
      }
    }
  }, []);

  // Timer Effect untuk Auto Refresh
  useEffect(() => {
    let timerId;
    if (autoRefresh && activeTicker && !loading && !error) {
      timerId = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            fetchStock(activeTicker, true); // true = isSilent
            return 60;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timerId);
  }, [autoRefresh, activeTicker, loading, error, fetchStock]);

  const toggleAutoRefresh = () => {
    setAutoRefresh(!autoRefresh);
    setCountdown(60);
    if (!autoRefresh && activeTicker) {
      fetchStock(activeTicker, true); // trigger data baru ketika di-ON-kan
    }
  };

  const recCfg         = data ? (REC_CONFIG[data.recLevel] || REC_CONFIG.NEUTRAL) : null;
  const priceChange    = data ? (data.currentPrice - data.prevClose) : 0;
  const priceChangePct = data && data.prevClose ? (priceChange / data.prevClose) * 100 : 0;

  return (
    <div style={{ fontFamily: "'IBM Plex Mono','Courier New',monospace", background: "#080d14", minHeight: "100vh", color: "#e2e8f0" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600&family=Space+Grotesk:wght@400;600;700&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; background: #0f1923; }
        ::-webkit-scrollbar-thumb { background: #1e3a5f; border-radius: 2px; }
        .blink { animation: blink 1.2s infinite; }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.25} }
        .fade-in { animation: fadeIn 0.5s ease; }
        @keyframes fadeIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin { to { transform: rotate(360deg); } }
        .ticker-btn { transition: all 0.15s; cursor: pointer; }
        .ticker-btn:hover { background: #1e3a5f !important; color: #e2e8f0 !important; }
        .search-input:focus { outline: none; border-color: #00ff9d !important; box-shadow: 0 0 0 2px #00ff9d22; }
        .scan-btn { transition: background 0.2s; }
        .scan-btn:hover { background: #00cc7a !important; }
        .signal-row { transition: background 0.15s; border-radius: 4px; padding: 4px 6px; }
        .signal-row:hover { background: #ffffff08; }
      `}</style>

      {/* Header */}
      <div style={{ background: "#0a1520", borderBottom: "1px solid #1e3a5f", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#00ff9d" }} className="blink" />
          <span style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 18, letterSpacing: "-0.02em", color: "#f1f5f9" }}>
            IDX<span style={{ color: "#00ff9d" }}>Scanner</span>
          </span>
          <span style={{ fontSize: 10, color: "#334155", borderLeft: "1px solid #1e3a5f", paddingLeft: 10 }}>
            REAL-TIME · AI ANALYSIS
          </span>
        </div>
        
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* Auto Refresh Toggle */}
          {activeTicker && !loading && !error && (
            <button 
              onClick={toggleAutoRefresh}
              style={{ 
                background: autoRefresh ? "#00ff9d22" : "transparent", 
                border: `1px solid ${autoRefresh ? "#00ff9d" : "#1e3a5f"}`, 
                borderRadius: 4, padding: "6px 10px", 
                color: autoRefresh ? "#00ff9d" : "#64748b", 
                fontSize: 10, cursor: "pointer", fontFamily: "inherit",
                display: "flex", alignItems: "center", gap: 6,
                transition: "all 0.2s"
              }}
            >
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: autoRefresh ? "#00ff9d" : "#64748b", animation: autoRefresh ? "blink 1.2s infinite" : "none" }} />
              {autoRefresh ? `AUTO REFRESH (${countdown}s)` : "AUTO REFRESH: OFF"}
            </button>
          )}

          <div style={{ display: "flex", gap: 6 }}>
            <input
              className="search-input"
              value={inputVal}
              onChange={e => setInputVal(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === "Enter" && fetchStock(inputVal)}
              placeholder="KODE SAHAM..."
              style={{ background: "#0f1923", border: "1px solid #1e3a5f", borderRadius: 4, padding: "6px 12px", color: "#e2e8f0", fontSize: 12, fontFamily: "inherit", width: 140 }}
            />
            <button className="scan-btn" onClick={() => fetchStock(inputVal)}
              style={{ background: "#00ff9d", color: "#080d14", border: "none", borderRadius: 4, padding: "7px 18px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              SCAN
            </button>
          </div>
        </div>
      </div>

      {/* Popular tickers */}
      <div style={{ padding: "8px 20px", display: "flex", gap: 5, flexWrap: "wrap", borderBottom: "1px solid #0f1923" }}>
        {POPULAR_STOCKS.map(s => (
          <button key={s} className="ticker-btn"
            onClick={() => { setInputVal(s); fetchStock(s); }}
            style={{ background: activeTicker === s ? "#1e3a5f" : "#0f1923", border: `1px solid ${activeTicker === s ? "#00ff9d55" : "#1e3a5f"}`, borderRadius: 3, padding: "3px 8px", color: activeTicker === s ? "#00ff9d" : "#64748b", fontSize: 11, fontFamily: "inherit" }}>
            {s}
          </button>
        ))}
      </div>

      <div style={{ padding: "16px 20px", maxWidth: 900, margin: "0 auto" }}>

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <div style={{ display: "inline-block", width: 40, height: 40, border: "2px solid #1e3a5f", borderTop: "2px solid #00ff9d", borderRadius: "50%", animation: "spin 0.8s linear infinite", marginBottom: 16 }} />
            <div style={{ color: "#00ff9d", fontSize: 13, letterSpacing: "0.05em" }}>{loadingMsg}</div>
            <div style={{ color: "#334155", fontSize: 10, marginTop: 6 }}>Yahoo Finance + Groq AI</div>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div style={{ background: "#f8717115", border: "1px solid #f8717144", borderRadius: 6, padding: 20, textAlign: "center" }}>
            <div style={{ color: "#f87171", fontSize: 14, marginBottom: 6 }}>⚠ {error}</div>
            <div style={{ color: "#475569", fontSize: 11 }}>Coba lagi atau gunakan kode saham yang berbeda</div>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && !data && (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📈</div>
            <div style={{ fontFamily: "Space Grotesk", fontSize: 16, color: "#334155", marginBottom: 8 }}>Pilih saham untuk dianalisis</div>
            <div style={{ fontSize: 11, color: "#1e3a5f" }}>Klik shortcut di atas atau ketik kode saham lalu tekan SCAN</div>
          </div>
        )}

        {/* Results */}
        {!loading && !error && data && (
          <div className="fade-in">

            {/* Stock header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
              <div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <span style={{ fontFamily: "Space Grotesk", fontSize: 28, fontWeight: 700, color: "#f1f5f9" }}>
                    {(data.symbol || activeTicker).replace(".JK", "")}
                  </span>
                  <span style={{ fontSize: 11, color: "#475569" }}>.JK · IDX</span>
                </div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{data.name}</div>
                {data.lastUpdated && <div style={{ fontSize: 9, color: "#334155", marginTop: 2 }}>Terakhir Diperbarui: {data.lastUpdated}</div>}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "Space Grotesk", fontSize: 30, fontWeight: 700, color: "#f1f5f9" }}>
                  {fmtRp(data.currentPrice)}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: priceChange >= 0 ? "#4ade80" : "#f87171" }}>
                  {priceChange >= 0 ? "+" : ""}{fmtRp(Math.abs(priceChange))} ({fmtPct(priceChangePct)})
                </div>
                {data.marketCap > 0 && (
                  <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>Mkt Cap: {fmtNum(data.marketCap)}</div>
                )}
              </div>
            </div>

            {/* Recommendation */}
            {recCfg && (
              <div style={{ background: recCfg.bg, border: `1px solid ${recCfg.color}44`, borderRadius: 6, padding: "12px 16px", marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: recCfg.color }} className={data.brokeATH ? "blink" : ""} />
                  <span style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 15, color: recCfg.color }}>
                    {recCfg.label}
                  </span>
                </div>
                <ScoreMeter bull={data.bullScore || 0} bear={data.bearScore || 0} />
              </div>
            )}

            {/* Valuasi & Status ATH Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              
              {/* Valuasi Card */}
              <div style={{ background: "#0f1923", border: "1px solid #1e3a5f", borderRadius: 6, padding: "12px 16px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 9, color: "#475569", letterSpacing: "0.1em" }}>NILAI WAJAR (FAIR VALUE)</div>
                  <div style={{ fontFamily: "Space Grotesk", fontSize: 22, fontWeight: 700, color: "#facc15", marginTop: 2 }}>
                    {fmtRp(data.fairValue)}
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 8 }}>
                  <div>
                    <div style={{ fontSize: 9, color: "#475569", letterSpacing: "0.1em" }}>STATUS VALUASI</div>
                    <div style={{ 
                      fontSize: 12, fontWeight: 700, marginTop: 2, 
                      color: data.valuationStatus === "UNDERVALUED" ? "#4ade80" : data.valuationStatus === "OVERVALUED" ? "#f87171" : "#facc15" 
                    }}>
                      {data.valuationStatus}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 9, color: "#475569", letterSpacing: "0.1em" }}>MOS (MARGIN)</div>
                    <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2, color: (data.marginOfSafety || 0) > 0 ? "#4ade80" : "#f87171" }}>
                      {(data.marginOfSafety || 0) > 0 ? "+" : ""}{fmtPct(data.marginOfSafety)}
                    </div>
                  </div>
                </div>
              </div>

              {/* ATH Card */}
              <div style={{ background: data.isAtATH ? "#00ff9d0a" : "#0f1923", border: `1px solid ${data.isAtATH ? "#00ff9d33" : "#1e3a5f"}`, borderRadius: 6, padding: "12px 16px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                 <div>
                  <div style={{ fontSize: 9, color: "#475569", letterSpacing: "0.1em" }}>52W HIGH / ATH</div>
                  <div style={{ fontFamily: "Space Grotesk", fontSize: 22, fontWeight: 700, color: data.isAtATH ? "#00ff9d" : "#f1f5f9", marginTop: 2 }}>
                    {fmtRp(data.allTimeHigh)}
                  </div>
                  {data.allTimeHighDate && <div style={{ fontSize: 9, color: "#475569" }}>{data.allTimeHighDate}</div>}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 8 }}>
                  <div>
                    <div style={{ fontSize: 9, color: "#475569", letterSpacing: "0.1em" }}>JARAK KE ATH</div>
                    <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2, color: data.distToATH < 2 ? "#00ff9d" : data.distToATH < 10 ? "#facc15" : "#f87171" }}>
                      {Number(data.distToATH || 0).toFixed(2)}%
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 9, color: "#475569", letterSpacing: "0.1em" }}>TREN HARGA</div>
                    <div style={{ fontSize: 12, fontWeight: 700, marginTop: 2, color: data.trend === "UPTREND" ? "#4ade80" : data.trend === "DOWNTREND" ? "#f87171" : "#facc15" }}>
                      {data.trend === "UPTREND" ? "↑ UPTREND" : data.trend === "DOWNTREND" ? "↓ DOWNTREND" : "→ SIDEWAYS"}
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* Indicators grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))", gap: 8, marginBottom: 14 }}>
              <div style={{ background: "#0f1923", border: "1px solid #1e3a5f", borderRadius: 5, padding: "8px 10px" }}>
                <div style={{ fontSize: 9, color: "#475569", letterSpacing: "0.1em", marginBottom: 3 }}>RSI (14)</div>
                <RSIGauge value={data.rsi14} />
              </div>
              <div style={{ background: "#0f1923", border: "1px solid #1e3a5f", borderRadius: 5, padding: "8px 10px" }}>
                <div style={{ fontSize: 9, color: "#475569", letterSpacing: "0.1em", marginBottom: 3 }}>VOLUME RATIO</div>
                <VolBar ratio={data.volRatio} />
                <div style={{ fontSize: 9, color: "#475569", marginTop: 2 }}>{fmtNum(data.volume)} hari ini</div>
              </div>
              <StatCard label="EMA 50"   value={fmtRp(data.ema50)}   accent={data.currentPrice > data.ema50  ? "#4ade80" : "#f87171"} sub={data.currentPrice > data.ema50  ? "▲ di atas EMA" : "▼ di bawah EMA"} />
              <StatCard label="EMA 200"  value={fmtRp(data.ema200)}  accent={data.currentPrice > data.ema200 ? "#4ade80" : "#f87171"} sub={data.currentPrice > data.ema200 ? "▲ di atas EMA" : "▼ di bawah EMA"} />
              <StatCard label="BB UPPER" value={fmtRp(data.bbUpper)} accent="#60a5fa" sub={`Mid: ${fmtRp(data.bbMid)}`} />
              <StatCard label="BB LOWER" value={fmtRp(data.bbLower)} accent="#60a5fa" />
              <StatCard label="ATR (14)" value={fmtRp(data.atr14)}   accent="#a78bfa" sub="Volatilitas harian" />
              <StatCard label="VWAP"     value={fmtRp(data.vwap)}    accent={data.currentPrice > data.vwap   ? "#4ade80" : "#f87171"} />
            </div>

            {/* Signals + Risk */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div style={{ background: "#0f1923", border: "1px solid #1e3a5f", borderRadius: 6, padding: 12 }}>
                <div style={{ fontSize: 10, color: "#475569", letterSpacing: "0.1em", marginBottom: 10 }}>SINYAL AKTIF</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {(data.signals || []).map((s, i) => (
                    <div key={i} className="signal-row" style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 11 }}>
                      <div style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, marginTop: 3, background: s.type === "bull" ? "#4ade80" : s.type === "bear" ? "#f87171" : "#64748b" }} />
                      <span style={{ color: s.type === "bull" ? "#d1fae5" : s.type === "bear" ? "#fee2e2" : "#94a3b8", lineHeight: 1.5 }}>{s.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ background: "#0f1923", border: "1px solid #1e3a5f", borderRadius: 6, padding: 12 }}>
                <div style={{ fontSize: 10, color: "#475569", letterSpacing: "0.1em", marginBottom: 10 }}>MANAJEMEN RISIKO</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 9, color: "#475569" }}>HARGA ENTRY</div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: "#f1f5f9" }}>{fmtRp(data.currentPrice)}</div>
                  </div>
                  <div style={{ background: "#f8717108", border: "1px solid #f8717133", borderRadius: 4, padding: "7px 10px" }}>
                    <div style={{ fontSize: 9, color: "#f87171" }}>STOP LOSS (2×ATR)</div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "#f87171" }}>{fmtRp(data.stopLoss)}</div>
                    {data.stopLoss && data.currentPrice && (
                      <div style={{ fontSize: 9, color: "#7f1d1d" }}>Risiko: {fmtPct(((data.stopLoss - data.currentPrice) / data.currentPrice) * 100)}</div>
                    )}
                  </div>
                  <div style={{ background: "#4ade8008", border: "1px solid #4ade8033", borderRadius: 4, padding: "7px 10px" }}>
                    <div style={{ fontSize: 9, color: "#4ade80" }}>TAKE PROFIT (3×ATR)</div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "#4ade80" }}>{fmtRp(data.takeProfit)}</div>
                    {data.takeProfit && data.currentPrice && (
                      <div style={{ fontSize: 9, color: "#14532d" }}>Potensi: {fmtPct(((data.takeProfit - data.currentPrice) / data.currentPrice) * 100)}</div>
                    )}
                  </div>
                  <div style={{ borderTop: "1px solid #1e3a5f", paddingTop: 8, display: "flex", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontSize: 9, color: "#475569" }}>RISK/REWARD</div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: "#a78bfa" }}>1 : {Number(data.riskReward || 1.5).toFixed(2)}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 9, color: "#475569" }}>52W RANGE</div>
                      <div style={{ fontSize: 10, color: "#64748b" }}>{fmtRp(data.low52w)}</div>
                      <div style={{ fontSize: 10, color: "#64748b" }}>{fmtRp(data.high52w)}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Key Levels */}
            {data.keyLevel && (
              <div style={{ background: "#0f1923", border: "1px solid #1e3a5f", borderRadius: 6, padding: 12, marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: "#475569", letterSpacing: "0.1em", marginBottom: 10 }}>LEVEL KUNCI</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
                  {[
                    { label: "SUPPORT 2",    val: data.keyLevel.support2,    color: "#22c55e" },
                    { label: "SUPPORT 1",    val: data.keyLevel.support1,    color: "#4ade80" },
                    { label: "RESISTANCE 1", val: data.keyLevel.resistance1, color: "#fb923c" },
                    { label: "RESISTANCE 2", val: data.keyLevel.resistance2, color: "#f87171" },
                  ].map(({ label, val, color }) => (
                    <div key={label} style={{ textAlign: "center", borderRadius: 4, padding: "6px", background: `${color}08`, border: `1px solid ${color}22` }}>
                      <div style={{ fontSize: 8, color: "#475569", letterSpacing: "0.08em" }}>{label}</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color, marginTop: 2 }}>{fmtRp(val)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AI Summary */}
            {data.summary && (
              <div style={{ background: "#0a1520", border: "1px solid #1e3a5f", borderRadius: 6, padding: "12px 14px", marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: "#475569", letterSpacing: "0.1em", marginBottom: 6 }}>✦ RINGKASAN ANALISIS AI</div>
                <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.7 }}>{data.summary}</div>
              </div>
            )}

            {/* Disclaimer */}
            <div style={{ fontSize: 9, color: "#1e3a5f", lineHeight: 1.6, borderTop: "1px solid #0f1923", paddingTop: 10 }}>
              ⚠ Harga & indikator diambil real-time dari Yahoo Finance. Valuasi & Rekomendasi AI bersifat estimasi/informatif, BUKAN saran investasi. Selalu lakukan riset mandiri (DYOR).
            </div>
          </div>
        )}
      </div>
    </div>
  );
}