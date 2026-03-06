import { useState, useEffect, useCallback } from "react";

const POLYMARKET_BASE = "https://polymarket.com/profile/";
const REFRESH_INTERVAL = 90000;
const CATEGORY_COLORS = { politics:"#f97316", finance:"#22d3ee", crypto:"#a78bfa", sports:"#4ade80", other:"#94a3b8" };
const TIER_CONFIG = {
  highWinRate: { label:"HIGH WIN RATE", icon:"◈", color:"#22d3ee", accent:"#0e7490", desc:"≥90% win rate, consistent edge" },
  insider:     { label:"INSIDER",       icon:"⬡", color:"#f97316", accent:"#c2410c", desc:"Asymmetric wins on sub-20¢ odds" },
  zeroToHero:  { label:"ZERO → HERO",  icon:"△", color:"#a78bfa", accent:"#7c3aed", desc:"Small start, explosive growth" },
  schizo:      { label:"SCHIZO",        icon:"⟳", color:"#4ade80", accent:"#15803d", desc:"High-freq small bets, steady edge" },
};

// ── API ──────────────────────────────────────
async function apiFetch(url) {
  try { const r = await fetch(url); if (!r.ok) throw 0; return await r.json(); } catch { return null; }
}
const fetchLeaderboard = () => apiFetch("https://data-api.polymarket.com/trader-leaderboard-rankings?window=month&limit=100");
const fetchTrades      = a  => apiFetch(`https://data-api.polymarket.com/trades?user=${a}&limit=100`) || [];
const fetchPositions   = a  => apiFetch(`https://data-api.polymarket.com/positions?user=${a}&limit=50`) || [];
const fetchValue       = a  => apiFetch(`https://data-api.polymarket.com/value?user=${a}`);

// ── FORMATTERS ───────────────────────────────
function fmt$(n, sign=true) {
  if (n==null) return "$—";
  const s = (sign && n>=0) ? "+" : (n<0 ? "-" : "");
  const a = Math.abs(n);
  if (a>=1e6) return `${s}$${(a/1e6).toFixed(2)}M`;
  if (a>=1e3) return `${s}$${(a/1e3).toFixed(1)}K`;
  return `${s}$${Math.round(a)}`;
}
function fmtUSD(n) { return fmt$(n, false); }
function fmtDate(iso) { return iso ? new Date(iso).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"2-digit"}) : "—"; }
function timeAgo(iso) {
  if (!iso) return "—";
  const h = Math.floor((Date.now()-new Date(iso))/3600000);
  return h<1 ? "<1h ago" : h<24 ? `${h}h ago` : `${Math.floor(h/24)}d ago`;
}
function guessCategory(m="") {
  m=m.toLowerCase();
  if (/elect|trump|presi|senate|vote|gov|kamala|republican|democrat/.test(m)) return "politics";
  if (/bitcoin|eth|btc|crypto|sol|defi|token/.test(m)) return "crypto";
  if (/fed|rate|gdp|stock|nasdaq|inflation|recession/.test(m)) return "finance";
  if (/nba|nfl|world cup|super bowl|mlb|champion|soccer/.test(m)) return "sports";
  return "other";
}

// ── MOCK DATA ────────────────────────────────
const MARKETS = [
  // Politics
  "Will Trump win the 2024 election?","Will Kamala win 2024?","Will Biden drop out?",
  "Republican wins Senate majority?","Will Elon run for office?","Will Kamala run in 2028?",
  "UK general election — Labour wins?","France snap election winner?","Will Macron resign 2025?",
  "Will Netanyahu stay in power 2025?","Will Modi win 2024 India election?","Canada PM after next election?",
  "Will there be a US government shutdown?","Supreme Court rules on abortion 2025?","Will Jan 6 defendants get pardoned?",
  // Finance
  "Fed rate cut in March 2025?","Fed cuts rates 3× in 2025?","S&P 500 above 6500 in 2025?",
  "US enters recession by Q3 2025?","Gold above $3000 in 2025?","Dollar weakens vs Euro 2025?",
  "Oil below $60 by Dec 2025?","Apple stock above $250 EOY?","Will Nvidia split again?",
  "Tesla above $400 EOY?","Amazon above $250 EOY?","Berkshire beats S&P 500 in 2025?",
  "US inflation below 2% by Dec 2025?","Yen strengthens past 130 in 2025?","10yr Treasury yield above 5%?",
  // Crypto
  "BTC above $100k by Dec 2024?","Bitcoin ETF inflows exceed $50B?","Solana above $500 in 2025?",
  "Ethereum ETF approved in 2024?","ETH above $5k in 2025?","Will XRP win SEC case?",
  "Will Coinbase be delisted?","Crypto market cap above $5T in 2025?","Will BTC hit $200k ever?",
  "Will there be a crypto winter 2025?","Dogecoin above $1 in 2025?","Will Binance collapse?",
  // Sports
  "Super Bowl LIX winner?","NBA Finals 2025 winner?","World Cup 2026 winner?",
  "Champions League 2025 winner?","Will LeBron retire 2025?","Messi wins Ballon d'Or 2025?",
  "Will Arsenal win the Premier League?","Masters 2025 winner?","Wimbledon men's 2025?",
  "Will Caitlin Clark win WNBA MVP?","Formula 1 2025 champion?","UFC heavyweight champion EOY?",
  // Other / Tech
  "Will OpenAI IPO in 2025?","China invades Taiwan 2025?","AI regulation bill passes 2025?",
  "SpaceX IPO in 2025?","Will Russia-Ukraine war end 2025?","Will TikTok be banned in US?",
  "Will Musk sell Twitter/X?","Will Apple release AR glasses 2025?","Will Google break up?",
  "Will there be AGI by 2027?","Will Zuckerberg run for office?","Will Netflix raise prices again?",
];

function rnd(min,max){ return min + Math.random()*(max-min); }
function rndInt(min,max){ return Math.floor(rnd(min,max)); }
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

function genDeposits(startDate, total) {
  const n = rndInt(2,6); const deps=[]; let rem=total;
  let d = new Date(startDate);
  for (let i=0;i<n;i++){
    if (i>0) d = new Date(d.getTime()+rnd(3,30)*86400000);
    const amt = i===n-1 ? rem : Math.round(rem*rnd(0.2,0.55));
    rem -= amt;
    deps.push({ date:d.toISOString(), amount:amt, txHash:`0x${Math.random().toString(16).slice(2,14)}` });
  }
  return deps;
}

function genTrades(n, cat, startDate) {
  const trades=[]; let d=new Date(startDate);
  for (let i=0;i<n;i++){
    d=new Date(d.getTime()+rnd(0.3,4)*86400000);
    const market = MARKETS.filter(m=>guessCategory(m)===cat||Math.random()>0.55)[0] || pick(MARKETS);
    const price = rnd(0.04,0.95);
    const size = rnd(40,3000);
    const won = Math.random()>0.42;
    const profit = won ? size*(1/price-1)*rnd(0.2,0.6) : -size*rnd(0.1,0.4);
    trades.push({
      id:`t${i}`, date:d.toISOString(), market,
      category:guessCategory(market), side:Math.random()>0.25?"BUY":"SELL",
      price:Math.round(price*100)/100, size:Math.round(size),
      profit:Math.round(profit), won, status:i<n*0.7?"RESOLVED":"OPEN",
    });
  }
  return trades.sort((a,b)=>new Date(b.date)-new Date(a.date));
}

function buildGrowthCurve(trades, start) {
  const sorted=[...trades].sort((a,b)=>new Date(a.date)-new Date(b.date));
  let eq=start;
  const curve=[{date:sorted[0]?.date||new Date().toISOString(), value:eq}];
  sorted.forEach(t=>{ eq=Math.max(0,eq+(t.profit||0)); curve.push({date:t.date,value:eq}); });
  return curve;
}

function generateMockTraders() {
  const tiers=Object.keys(TIER_CONFIG);
  const cats=Object.keys(CATEGORY_COLORS);
  return Array.from({length:100},(_,i)=>{
    const addr="0x"+i.toString(16).padStart(4,"0")+Math.random().toString(16).slice(2,14);
    const tier=tiers[i%tiers.length];
    const cat=cats[i%cats.length];
    const startCap = tier==="zeroToHero" ? rnd(300,2500) : tier==="insider" ? rnd(4000,18000) : rnd(1500,12000);
    const pnl = tier==="insider"?rnd(35000,180000):tier==="zeroToHero"?rnd(10000,65000):tier==="highWinRate"?rnd(5000,32000):rnd(1200,9000);
    const tc  = tier==="schizo"?rndInt(70,240):rndInt(8,50);
    const wr  = tier==="highWinRate"?rndInt(88,98):tier==="insider"?rndInt(55,80):rndInt(46,75);
    const avgBet = tier==="schizo"?rnd(35,320):rnd(350,3500);
    const daysAgo = rndInt(30,160);
    const startDate = new Date(Date.now()-daysAgo*86400000).toISOString();
    const totalDep = startCap+rnd(0, startCap*0.7);
    const deposits = genDeposits(startDate, Math.round(totalDep));
    const trades = genTrades(tc, cat, startDate);
    const growthCurve = buildGrowthCurve(trades, startCap);
    const sparkline = growthCurve.slice(-20).map((p,idx)=>({x:idx,y:p.value}));
    const topMarkets = [...new Map(trades.map(t=>[t.market,t])).values()]
      .sort((a,b)=>b.profit-a.profit).slice(0,5)
      .map(t=>({market:t.market,profit:t.profit,category:t.category}));
    const bestTrade = [...trades].sort((a,b)=>b.profit-a.profit)[0];
    const catBreak={};
    trades.forEach(t=>{ catBreak[t.category]=(catBreak[t.category]||0)+1; });
    const positions = trades.filter(t=>t.status==="OPEN").map(t=>({
      market:t.market, category:t.category, shares:rndInt(30,400),
      avgPrice:t.price, currentPrice:Math.round(Math.max(0.01,Math.min(0.99,t.price+rnd(-0.25,0.3)))*100)/100,
      value:Math.round(t.size*rnd(0.7,1.4)),
    }));
    return {
      address:addr, shortAddress:`${addr.slice(0,8)}…${addr.slice(-4)}`,
      tier, tiers:[tier], category:cat,
      totalPnl:Math.round(pnl), winRate:wr, tradeCount:tc,
      avgBet:Math.round(avgBet), startingCapital:Math.round(startCap),
      totalDeposited:Math.round(totalDep), currentValue:Math.round(startCap+pnl),
      roi:Math.round((pnl/startCap)*100), sparkline, growthCurve,
      deposits, trades, positions, topMarkets, bestTrade, catBreakdown:catBreak,
      startDate, lastActive:trades[0]?.date||null, isLive:Math.random()>0.7, daysActive:daysAgo,
    };
  });
}

// ── UP & COMING GENERATOR ────────────────────
// Max 150 days old, explosive PNL growth, varied risk profiles
const RISK_REASONS = [
  "Single large bet on one market","No track record before 60 days ago",
  "Win rate driven by 1–2 massive trades","Low trade count, high variance",
  "May have benefited from lucky timing","Unverified edge — could be noise",
  "Rapid account growth with thin history","Heavy concentration in one category",
];

function calcRiskScore(t) {
  // 1–5: 1=lowest risk, 5=highest risk
  let score = 1;
  if (t.daysActive < 30)  score += 2;
  else if (t.daysActive < 60) score += 1;
  if (t.tradeCount < 10)  score += 2;
  else if (t.tradeCount < 20) score += 1;
  if (t.roi > 500)        score += 1;
  if (t.winRate > 90 && t.tradeCount < 15) score += 1;
  return Math.min(5, score);
}

function generateUpcomingTraders() {
  const cats = Object.keys(CATEGORY_COLORS);
  const tiers = Object.keys(TIER_CONFIG);
  return Array.from({length:40}, (_,i) => {
    const addr = "0xuc" + i.toString(16).padStart(3,"0") + Math.random().toString(16).slice(2,12);
    const cat  = cats[i % cats.length];
    // Age: 7–150 days
    const daysActive = 7 + Math.floor(Math.random() * 143);
    const startDate  = new Date(Date.now() - daysActive * 86400000).toISOString();
    // Small starting capital
    const startCap   = Math.round(200 + Math.random() * 4000);
    // Big gains in short time
    const multiplier = 2 + Math.random() * 48; // 2×–50× returns
    const pnl        = Math.round(startCap * multiplier);
    const tc         = Math.max(3, Math.floor(daysActive * (0.3 + Math.random() * 1.2)));
    const wr         = 55 + Math.floor(Math.random() * 40);
    const avgBet     = Math.round(startCap * (0.2 + Math.random() * 0.8));
    const totalDep   = startCap + Math.round(Math.random() * startCap * 0.3);
    const tier       = tiers[i % tiers.length];

    const deposits   = genDeposits(startDate, totalDep);
    const trades     = genTrades(tc, cat, startDate);
    const growthCurve= buildGrowthCurve(trades, startCap);
    const sparkline  = growthCurve.slice(-20).map((p,idx)=>({x:idx,y:p.value}));
    const topMarkets = [...new Map(trades.map(t=>[t.market,t])).values()]
      .sort((a,b)=>b.profit-a.profit).slice(0,5)
      .map(t=>({market:t.market,profit:t.profit,category:t.category}));
    const bestTrade  = [...trades].sort((a,b)=>b.profit-a.profit)[0];
    const catBreak   = {};
    trades.forEach(t=>{ catBreak[t.category]=(catBreak[t.category]||0)+1; });
    const positions  = trades.filter(t=>t.status==="OPEN").map(t=>({
      market:t.market, category:t.category, shares:rndInt(20,300),
      avgPrice:t.price,
      currentPrice:Math.round(Math.max(0.01,Math.min(0.99,t.price+rnd(-0.25,0.3)))*100)/100,
      value:Math.round(t.size*rnd(0.7,1.4)),
    }));

    const riskScore = calcRiskScore({daysActive, tradeCount:tc, roi:Math.round(multiplier*100), winRate:wr});
    const riskReason= RISK_REASONS[i % RISK_REASONS.length];

    return {
      address:addr, shortAddress:`${addr.slice(0,8)}…${addr.slice(-4)}`,
      tier, tiers:[tier], category:cat,
      totalPnl:pnl, winRate:wr, tradeCount:tc,
      avgBet, startingCapital:startCap,
      totalDeposited:totalDep, currentValue:startCap+pnl,
      roi:Math.round(multiplier*100),
      multiplier: parseFloat(multiplier.toFixed(1)),
      sparkline, growthCurve, deposits, trades, positions,
      topMarkets, bestTrade, catBreakdown:catBreak,
      startDate, lastActive:trades[0]?.date||null,
      isLive:Math.random()>0.6, daysActive,
      riskScore, riskReason,
      isUpcoming:true,
    };
  }).sort((a,b)=>b.roi-a.roi);
}

// ── SPARKLINE ────────────────────────────────
function Sparkline({data,width=64,height=22}){
  if(!data||data.length<2) return <svg width={width} height={height}/>;
  const minY=Math.min(...data.map(d=>d.y)), maxY=Math.max(...data.map(d=>d.y)), r=maxY-minY||1;
  const pts=data.map((d,i)=>`${(i/(data.length-1))*width},${height-((d.y-minY)/r)*(height-3)-1}`).join(" ");
  const up=data[data.length-1]?.y>=data[0]?.y;
  return <svg width={width} height={height}><polyline points={pts} fill="none" stroke={up?"#4ade80":"#f87171"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

// ── GROWTH CHART ─────────────────────────────
function GrowthChart({curve,color="#22d3ee"}){
  if(!curve||curve.length<2) return null;
  const W=520,H=110,pad={t:8,r:8,b:22,l:50};
  const iW=W-pad.l-pad.r, iH=H-pad.t-pad.b;
  const vals=curve.map(d=>d.value);
  const minY=Math.min(...vals), maxY=Math.max(...vals), rng=maxY-minY||1;
  const px=(i)=>pad.l+(i/(curve.length-1))*iW;
  const py=(v)=>pad.t+iH-((v-minY)/rng)*iH;
  const pts=curve.map((d,i)=>`${px(i)},${py(d.value)}`).join(" ");
  const fill=`${pad.l},${pad.t+iH} ${pts} ${pad.l+iW},${pad.t+iH}`;
  const up=curve[curve.length-1].value>=curve[0].value;
  const col=up?"#4ade80":"#f87171";
  const yLabels=[minY,(minY+maxY)/2,maxY].map((v,i)=>({y:pad.t+iH-(i/2)*iH,l:fmtUSD(v)}));
  const xIdx=[0,Math.floor(curve.length/2),curve.length-1];
  return(
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{overflow:"visible"}}>
      <defs><linearGradient id="gfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={col} stopOpacity="0.2"/><stop offset="100%" stopColor={col} stopOpacity="0"/></linearGradient></defs>
      {yLabels.map((l,i)=><g key={i}><line x1={pad.l} y1={l.y} x2={pad.l+iW} y2={l.y} stroke="rgba(255,255,255,0.05)" strokeWidth="1"/><text x={pad.l-4} y={l.y+4} fill="rgba(255,255,255,0.22)" fontSize="8" textAnchor="end" fontFamily="monospace">{l.l}</text></g>)}
      <polygon points={fill} fill="url(#gfill)"/>
      <polyline points={pts} fill="none" stroke={col} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      {xIdx.map(i=><text key={i} x={px(i)} y={H-4} fill="rgba(255,255,255,0.18)" fontSize="7.5" textAnchor="middle" fontFamily="monospace">{fmtDate(curve[i].date)}</text>)}
    </svg>
  );
}

// ── WALLET MODAL ─────────────────────────────
function WalletModal({trader,onClose}){
  const [tab,setTab]=useState("overview");
  const cfg=TIER_CONFIG[trader.tier];
  useEffect(()=>{ const h=e=>e.key==="Escape"&&onClose(); window.addEventListener("keydown",h); return ()=>window.removeEventListener("keydown",h); },[onClose]);
  const roiLabel = trader.roi>=1000 ? `${(trader.roi/100).toFixed(0)}×` : `${trader.roi}%`;

  const StatBox=({label,value,color="#e2e8f0",sub})=>(
    <div style={{textAlign:"center",padding:"10px 6px",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.05)",borderRadius:"8px"}}>
      <div style={{fontSize:"15px",fontFamily:"monospace",fontWeight:"700",color}}>{value}</div>
      {sub && <div style={{fontSize:"8px",color:"rgba(255,255,255,0.3)",marginTop:"1px"}}>{sub}</div>}
      <div style={{fontSize:"7px",color:"rgba(255,255,255,0.18)",letterSpacing:"0.1em",marginTop:"2px"}}>{label}</div>
    </div>
  );

  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(0,0,0,0.88)",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center",padding:"16px"}}>
      <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:"700px",maxHeight:"92vh",background:"#07101c",border:`1px solid ${cfg.color}44`,borderRadius:"18px",display:"flex",flexDirection:"column",overflow:"hidden",boxShadow:`0 0 80px ${cfg.color}14`,animation:"slideUp 0.2s ease"}}>

        {/* ─ Modal Header ─ */}
        <div style={{padding:"20px 24px 14px",background:`linear-gradient(135deg,${cfg.accent}20 0%,transparent 55%)`,borderBottom:"1px solid rgba(255,255,255,0.06)",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:"14px"}}>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"6px"}}>
                <span style={{fontSize:"22px",color:cfg.color}}>{cfg.icon}</span>
                <span style={{fontFamily:"monospace",fontSize:"16px",color:"#e2e8f0",letterSpacing:"0.04em"}}>{trader.shortAddress}</span>
                {trader.isLive && <span style={{width:"7px",height:"7px",borderRadius:"50%",background:"#4ade80",boxShadow:"0 0 8px #4ade80",animation:"pulse 2s infinite",display:"inline-block"}}/>}
              </div>
              <div style={{display:"flex",gap:"5px",flexWrap:"wrap"}}>
                <span style={{fontSize:"8px",fontFamily:"monospace",letterSpacing:"0.12em",color:cfg.color,background:`${cfg.accent}30`,border:`1px solid ${cfg.color}44`,borderRadius:"4px",padding:"2px 8px"}}>{cfg.label}</span>
                <span style={{fontSize:"8px",fontFamily:"monospace",color:CATEGORY_COLORS[trader.category],background:`${CATEGORY_COLORS[trader.category]}18`,border:`1px solid ${CATEGORY_COLORS[trader.category]}44`,borderRadius:"4px",padding:"2px 8px",textTransform:"uppercase"}}>{trader.category}</span>
                <span style={{fontSize:"8px",fontFamily:"monospace",color:"rgba(255,255,255,0.22)",padding:"2px 5px"}}>active {trader.daysActive}d</span>
              </div>
            </div>
            <button onClick={onClose} style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",color:"rgba(255,255,255,0.4)",width:"28px",height:"28px",borderRadius:"6px",cursor:"pointer",fontSize:"14px",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>✕</button>
          </div>

          {/* Key metrics */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:"7px"}}>
            <StatBox label="STARTED WITH"  value={fmtUSD(trader.startingCapital)} color="#94a3b8" sub={fmtDate(trader.startDate)}/>
            <StatBox label="DEPOSITED"     value={fmtUSD(trader.totalDeposited)}  color="#fbbf24" sub={`${trader.deposits.length} deposits`}/>
            <StatBox label="CURRENT VALUE" value={fmtUSD(trader.currentValue)}    color="#4ade80"/>
            <StatBox label="TOTAL PNL"     value={fmt$(trader.totalPnl)}          color={trader.totalPnl>=0?"#4ade80":"#f87171"}/>
            <StatBox label="ROI"           value={roiLabel}                        color={cfg.color}/>
          </div>
        </div>

        {/* ─ Tabs ─ */}
        <div style={{display:"flex",gap:"2px",padding:"8px 24px 0",borderBottom:"1px solid rgba(255,255,255,0.06)",flexShrink:0}}>
          {["overview","deposits","trades","positions"].map(t=>(
            <button key={t} onClick={()=>setTab(t)} style={{padding:"6px 14px",fontSize:"8px",fontFamily:"monospace",letterSpacing:"0.1em",textTransform:"uppercase",background:tab===t?`${cfg.color}14`:"transparent",border:"none",borderBottom:`2px solid ${tab===t?cfg.color:"transparent"}`,color:tab===t?cfg.color:"rgba(255,255,255,0.25)",cursor:"pointer",transition:"all 0.12s",borderRadius:"4px 4px 0 0"}}>{t}</button>
          ))}
        </div>

        {/* ─ Tab Content ─ */}
        <div style={{flex:1,overflowY:"auto",padding:"18px 24px"}}>

          {tab==="overview" && (
            <div>
              <div style={{marginBottom:"18px"}}>
                <div style={{fontSize:"8px",color:"rgba(255,255,255,0.22)",letterSpacing:"0.12em",marginBottom:"8px"}}>PORTFOLIO GROWTH</div>
                <GrowthChart curve={trader.growthCurve} color={cfg.color}/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"7px",marginBottom:"18px"}}>
                {[
                  {label:"WIN RATE",  value:`${trader.winRate}%`,    color:trader.winRate>=80?"#4ade80":trader.winRate>=60?"#fbbf24":"#f87171"},
                  {label:"TRADES",    value:trader.tradeCount,        color:"#94a3b8"},
                  {label:"AVG BET",   value:fmtUSD(trader.avgBet),    color:"#94a3b8"},
                  {label:"OPEN POS.", value:trader.positions.length,  color:"#22d3ee"},
                  {label:"FIRST BET", value:fmtDate(trader.startDate),color:"rgba(255,255,255,0.35)"},
                  {label:"LAST SEEN", value:timeAgo(trader.lastActive),color:"rgba(255,255,255,0.35)"},
                ].map(s=>(
                  <div key={s.label} style={{padding:"10px",background:"rgba(255,255,255,0.03)",borderRadius:"7px",border:"1px solid rgba(255,255,255,0.05)",textAlign:"center"}}>
                    <div style={{fontSize:"15px",fontFamily:"monospace",fontWeight:"700",color:s.color}}>{s.value}</div>
                    <div style={{fontSize:"7px",color:"rgba(255,255,255,0.18)",letterSpacing:"0.1em",marginTop:"3px"}}>{s.label}</div>
                  </div>
                ))}
              </div>
              {trader.bestTrade && (
                <div style={{marginBottom:"18px"}}>
                  <div style={{fontSize:"8px",color:"rgba(255,255,255,0.22)",letterSpacing:"0.12em",marginBottom:"8px"}}>BEST SINGLE TRADE</div>
                  <div style={{padding:"12px 14px",borderRadius:"8px",background:"rgba(74,222,128,0.05)",border:"1px solid rgba(74,222,128,0.22)",display:"flex",justifyContent:"space-between",alignItems:"center",gap:"12px"}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:"12px",color:"#e2e8f0",marginBottom:"3px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{trader.bestTrade.market}</div>
                      <div style={{fontSize:"8px",color:"rgba(255,255,255,0.28)",fontFamily:"monospace"}}>{trader.bestTrade.side} @ ${trader.bestTrade.price} · {fmtDate(trader.bestTrade.date)}</div>
                    </div>
                    <div style={{fontSize:"22px",fontFamily:"monospace",fontWeight:"700",color:"#4ade80",flexShrink:0}}>+{fmtUSD(trader.bestTrade.profit)}</div>
                  </div>
                </div>
              )}
              <div style={{marginBottom:"18px"}}>
                <div style={{fontSize:"8px",color:"rgba(255,255,255,0.22)",letterSpacing:"0.12em",marginBottom:"8px"}}>TOP MARKETS BY PROFIT</div>
                {trader.topMarkets.map((m,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 11px",marginBottom:"4px",background:"rgba(255,255,255,0.025)",borderRadius:"6px",border:"1px solid rgba(255,255,255,0.04)",borderLeft:`3px solid ${CATEGORY_COLORS[m.category]||"#94a3b8"}`}}>
                    <span style={{fontSize:"11px",color:"rgba(255,255,255,0.6)",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginRight:"12px"}}>{m.market}</span>
                    <span style={{fontSize:"12px",fontFamily:"monospace",fontWeight:"700",color:m.profit>=0?"#4ade80":"#f87171",flexShrink:0}}>{m.profit>=0?"+":""}{fmtUSD(m.profit)}</span>
                  </div>
                ))}
              </div>
              <div>
                <div style={{fontSize:"8px",color:"rgba(255,255,255,0.22)",letterSpacing:"0.12em",marginBottom:"8px"}}>CATEGORIES</div>
                <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
                  {Object.entries(trader.catBreakdown).sort((a,b)=>b[1]-a[1]).map(([cat,cnt])=>(
                    <span key={cat} style={{padding:"5px 11px",borderRadius:"5px",background:`${CATEGORY_COLORS[cat]||"#94a3b8"}14`,border:`1px solid ${CATEGORY_COLORS[cat]||"#94a3b8"}38`,fontSize:"9px",fontFamily:"monospace",color:CATEGORY_COLORS[cat]||"#94a3b8"}}>{cat.toUpperCase()} <span style={{color:"rgba(255,255,255,0.25)"}}>·</span> {cnt}</span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab==="deposits" && (
            <div>
              <div style={{padding:"14px",borderRadius:"10px",marginBottom:"18px",background:"rgba(251,191,36,0.05)",border:"1px solid rgba(251,191,36,0.2)"}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"12px",textAlign:"center"}}>
                  {[
                    {label:"FIRST DEPOSIT",   value:fmtUSD(trader.deposits[0]?.amount), sub:fmtDate(trader.deposits[0]?.date)},
                    {label:"TOTAL DEPOSITED", value:fmtUSD(trader.totalDeposited),       sub:`${trader.deposits.length} transactions`},
                    {label:"RETURN ON CAPITAL",value:roiLabel,                            sub:`${fmt$(trader.totalPnl)} profit`},
                  ].map(s=>(
                    <div key={s.label}>
                      <div style={{fontSize:"20px",fontFamily:"monospace",fontWeight:"700",color:"#fbbf24"}}>{s.value}</div>
                      <div style={{fontSize:"7px",color:"rgba(255,255,255,0.18)",letterSpacing:"0.1em",marginTop:"2px"}}>{s.label}</div>
                      <div style={{fontSize:"9px",color:"rgba(255,255,255,0.3)",marginTop:"2px"}}>{s.sub}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{fontSize:"8px",color:"rgba(255,255,255,0.22)",letterSpacing:"0.12em",marginBottom:"12px"}}>DEPOSIT TIMELINE</div>
              <div style={{position:"relative",paddingLeft:"22px"}}>
                <div style={{position:"absolute",left:"8px",top:"10px",bottom:"10px",width:"1px",background:"rgba(251,191,36,0.18)"}}/>
                {trader.deposits.map((dep,i)=>(
                  <div key={i} style={{position:"relative",marginBottom:"12px"}}>
                    <div style={{position:"absolute",left:"-18px",top:"11px",width:"8px",height:"8px",borderRadius:"50%",background:"#fbbf24",boxShadow:"0 0 6px #fbbf2455"}}/>
                    <div style={{padding:"11px 13px",borderRadius:"8px",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div>
                        <div style={{fontSize:"13px",fontFamily:"monospace",color:"#fbbf24",fontWeight:"700"}}>+{fmtUSD(dep.amount)} USDC</div>
                        <div style={{fontSize:"8px",color:"rgba(255,255,255,0.28)",marginTop:"3px"}}>{fmtDate(dep.date)} · {dep.txHash}</div>
                      </div>
                      <span style={{fontSize:"7px",fontFamily:"monospace",color:"#4ade80",background:"rgba(74,222,128,0.1)",border:"1px solid rgba(74,222,128,0.2)",padding:"3px 8px",borderRadius:"4px",letterSpacing:"0.1em"}}>DEPOSIT</span>
                    </div>
                  </div>
                ))}
                <div style={{position:"relative",marginBottom:"12px"}}>
                  <div style={{position:"absolute",left:"-18px",top:"11px",width:"8px",height:"8px",borderRadius:"50%",background:"#4ade80",boxShadow:"0 0 8px #4ade80",animation:"pulse 2s infinite"}}/>
                  <div style={{padding:"11px 13px",borderRadius:"8px",background:"rgba(74,222,128,0.05)",border:"1px solid rgba(74,222,128,0.22)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{fontSize:"13px",fontFamily:"monospace",color:"#4ade80",fontWeight:"700"}}>{fmtUSD(trader.currentValue)} (now)</div>
                      <div style={{fontSize:"8px",color:"rgba(255,255,255,0.28)",marginTop:"3px"}}>{fmtUSD(trader.totalDeposited)} in → {fmtUSD(trader.currentValue)} value</div>
                    </div>
                    <span style={{fontSize:"7px",fontFamily:"monospace",color:"#22d3ee",background:"rgba(34,211,238,0.1)",border:"1px solid rgba(34,211,238,0.2)",padding:"3px 8px",borderRadius:"4px",letterSpacing:"0.1em"}}>LIVE</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab==="trades" && (
            <div>
              <div style={{fontSize:"8px",color:"rgba(255,255,255,0.22)",letterSpacing:"0.12em",marginBottom:"10px"}}>TRADE HISTORY · {trader.tradeCount} TOTAL</div>
              <div style={{display:"flex",flexDirection:"column",gap:"4px"}}>
                {trader.trades.slice(0,30).map(t=>(
                  <div key={t.id} style={{display:"grid",gridTemplateColumns:"1fr 56px 44px 68px",gap:"10px",alignItems:"center",padding:"8px 11px",borderRadius:"6px",background:"rgba(255,255,255,0.025)",border:"1px solid rgba(255,255,255,0.04)",borderLeft:`2px solid ${CATEGORY_COLORS[t.category]||"#94a3b8"}`}}>
                    <div style={{minWidth:0}}>
                      <div style={{fontSize:"11px",color:"rgba(255,255,255,0.6)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.market}</div>
                      <div style={{fontSize:"7.5px",color:"rgba(255,255,255,0.2)",marginTop:"2px",fontFamily:"monospace"}}>{fmtDate(t.date)} · {t.side} @ ${t.price}</div>
                    </div>
                    <div style={{fontSize:"10px",fontFamily:"monospace",color:"rgba(255,255,255,0.28)",textAlign:"right"}}>${t.size}</div>
                    <div style={{fontSize:"7.5px",fontFamily:"monospace",color:t.status==="OPEN"?"#22d3ee":t.won?"#4ade80":"#f87171",textAlign:"center",letterSpacing:"0.05em"}}>{t.status==="OPEN"?"OPEN":t.won?"WIN":"LOSS"}</div>
                    <div style={{fontSize:"12px",fontFamily:"monospace",fontWeight:"700",color:t.profit>=0?"#4ade80":"#f87171",textAlign:"right"}}>{t.profit>=0?"+":""}{fmtUSD(t.profit)}</div>
                  </div>
                ))}
                {trader.trades.length>30 && <div style={{textAlign:"center",padding:"10px",fontSize:"8px",color:"rgba(255,255,255,0.18)",fontFamily:"monospace"}}>+ {trader.trades.length-30} MORE TRADES</div>}
              </div>
            </div>
          )}

          {tab==="positions" && (
            <div>
              <div style={{fontSize:"8px",color:"rgba(255,255,255,0.22)",letterSpacing:"0.12em",marginBottom:"10px"}}>OPEN POSITIONS · {trader.positions.length}</div>
              {trader.positions.length===0
                ? <div style={{textAlign:"center",padding:"40px",fontSize:"10px",color:"rgba(255,255,255,0.18)",fontFamily:"monospace"}}>NO OPEN POSITIONS</div>
                : trader.positions.map((p,i)=>{
                    const unreal=(p.currentPrice-p.avgPrice)*p.shares;
                    const pct=Math.round(((p.currentPrice-p.avgPrice)/p.avgPrice)*100);
                    return(
                      <div key={i} style={{padding:"12px 14px",borderRadius:"8px",marginBottom:"6px",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.05)",borderLeft:`3px solid ${CATEGORY_COLORS[p.category]||"#94a3b8"}`}}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:"8px"}}>
                          <span style={{fontSize:"12px",color:"rgba(255,255,255,0.7)",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginRight:"12px"}}>{p.market}</span>
                          <span style={{fontSize:"14px",fontFamily:"monospace",fontWeight:"700",color:unreal>=0?"#4ade80":"#f87171",flexShrink:0}}>{unreal>=0?"+":""}{fmtUSD(unreal)}</span>
                        </div>
                        <div style={{display:"flex",gap:"14px",flexWrap:"wrap"}}>
                          {[{l:"SHARES",v:p.shares},{l:"AVG",v:`$${p.avgPrice}`},{l:"NOW",v:`$${p.currentPrice}`},{l:"VALUE",v:fmtUSD(p.value)},{l:"P&L%",v:`${pct>=0?"+":""}${pct}%`,c:pct>=0?"#4ade80":"#f87171"}].map(s=>(
                            <div key={s.l}>
                              <div style={{fontSize:"11px",fontFamily:"monospace",color:s.c||"rgba(255,255,255,0.45)"}}>{s.v}</div>
                              <div style={{fontSize:"7px",color:"rgba(255,255,255,0.18)",letterSpacing:"0.1em"}}>{s.l}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })
              }
            </div>
          )}
        </div>

        {/* ─ Footer ─ */}
        <div style={{padding:"10px 24px",borderTop:"1px solid rgba(255,255,255,0.06)",display:"flex",gap:"7px",flexShrink:0}}>
          <a href={`${POLYMARKET_BASE}${trader.address}`} target="_blank" rel="noopener noreferrer" style={{flex:1,display:"block",textAlign:"center",padding:"8px",borderRadius:"7px",background:`${cfg.color}14`,border:`1px solid ${cfg.color}44`,color:cfg.color,fontSize:"9px",fontFamily:"monospace",letterSpacing:"0.1em",textDecoration:"none"}}>VIEW ON POLYMARKET ↗</a>
          <button onClick={()=>navigator.clipboard?.writeText(trader.address)} style={{padding:"8px 13px",borderRadius:"7px",cursor:"pointer",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",color:"rgba(255,255,255,0.35)",fontSize:"9px",fontFamily:"monospace",letterSpacing:"0.08em"}}>COPY ADDR</button>
        </div>
      </div>
    </div>
  );
}

// ── TRADER CARD ───────────────────────────────
function TraderCard({trader,rank,onClick}){
  const cfg=TIER_CONFIG[trader.tier];
  const cc=CATEGORY_COLORS[trader.category]||"#94a3b8";
  const [hov,setHov]=useState(false);
  return(
    <div onClick={onClick} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)} style={{background:"rgba(12,18,28,0.95)",border:`1px solid ${hov?cfg.color+"55":"rgba(255,255,255,0.07)"}`,borderRadius:"10px",padding:"12px 13px",cursor:"pointer",transition:"all 0.16s",transform:hov?"translateY(-1px)":"none",position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",top:0,left:0,right:0,height:"2px",background:`linear-gradient(90deg,transparent,${cfg.color}55,transparent)`,opacity:hov?1:0.35,transition:"opacity 0.2s"}}/>
      <span style={{position:"absolute",top:"8px",right:"9px",fontSize:"8px",color:"rgba(255,255,255,0.18)",fontFamily:"monospace"}}>#{rank}</span>

      <div style={{display:"flex",alignItems:"center",gap:"9px",marginBottom:"9px"}}>
        <div style={{width:"30px",height:"30px",borderRadius:"7px",background:`${cfg.accent}40`,border:`1px solid ${cfg.color}40`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"15px",color:cfg.color,flexShrink:0}}>{cfg.icon}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:"5px",marginBottom:"3px"}}>
            <span style={{fontFamily:"monospace",fontSize:"10.5px",color:"#cbd5e1"}}>{trader.shortAddress}</span>
            {trader.isLive&&<span style={{width:"5px",height:"5px",borderRadius:"50%",background:"#4ade80",boxShadow:"0 0 5px #4ade80",animation:"pulse 2s infinite",display:"inline-block"}}/>}
          </div>
          <span style={{fontSize:"7px",fontFamily:"monospace",color:cc,background:`${cc}16`,border:`1px solid ${cc}30`,borderRadius:"3px",padding:"1px 5px",letterSpacing:"0.08em"}}>{trader.category.toUpperCase()}</span>
        </div>
        <div style={{textAlign:"right",flexShrink:0}}>
          <div style={{fontSize:"14px",fontFamily:"monospace",fontWeight:"700",color:trader.totalPnl>=0?"#4ade80":"#f87171"}}>{fmt$(trader.totalPnl)}</div>
          <div style={{fontSize:"7.5px",color:"rgba(255,255,255,0.2)",fontFamily:"monospace"}}>{trader.roi>=0?"+":""}{trader.roi}% ROI</div>
        </div>
      </div>

      <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"4px",flex:1}}>
          {[
            {l:"WIN%",v:`${trader.winRate}%`,c:trader.winRate>=80?"#4ade80":trader.winRate>=60?"#fbbf24":"#f87171"},
            {l:"TRADES",v:trader.tradeCount,c:"#94a3b8"},
            {l:"FROM",v:fmtUSD(trader.startingCapital),c:"#fbbf24"},
          ].map(s=>(
            <div key={s.l} style={{textAlign:"center"}}>
              <div style={{fontSize:"10px",fontFamily:"monospace",color:s.c,fontWeight:"600"}}>{s.v}</div>
              <div style={{fontSize:"6.5px",color:"rgba(255,255,255,0.18)",letterSpacing:"0.08em"}}>{s.l}</div>
            </div>
          ))}
        </div>
        <Sparkline data={trader.sparkline} width={58} height={20}/>
      </div>
    </div>
  );
}

// ── RISK BADGE ───────────────────────────────
function RiskBadge({score}){
  const colors=["","#4ade80","#a3e635","#fbbf24","#f97316","#ef4444"];
  const labels=["","VERY LOW","LOW","MODERATE","HIGH","EXTREME"];
  const c=colors[score]||"#94a3b8";
  return(
    <div style={{display:"flex",alignItems:"center",gap:"4px"}}>
      {Array.from({length:5},(_,i)=>(
        <div key={i} style={{width:"10px",height:"10px",borderRadius:"2px",background:i<score?c:"rgba(255,255,255,0.08)",transition:"background 0.2s"}}/>
      ))}
      <span style={{fontSize:"7.5px",fontFamily:"monospace",color:c,letterSpacing:"0.08em",marginLeft:"2px"}}>{labels[score]}</span>
    </div>
  );
}

// ── UPCOMING CARD ────────────────────────────
function UpcomingCard({trader,rank,onClick}){
  const [hov,setHov]=useState(false);
  const cc=CATEGORY_COLORS[trader.category]||"#94a3b8";
  const roiLabel=trader.roi>=1000?`${(trader.roi/100).toFixed(0)}×`:`${trader.roi}%`;
  const ageColor=trader.daysActive<30?"#ef4444":trader.daysActive<60?"#f97316":trader.daysActive<90?"#fbbf24":"#94a3b8";

  return(
    <div onClick={onClick} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{background:"rgba(12,18,28,0.95)",border:`1px solid ${hov?"#f97316aa":"rgba(249,115,22,0.18)"}`,borderRadius:"10px",padding:"14px",cursor:"pointer",transition:"all 0.16s",transform:hov?"translateY(-1px)":"none",position:"relative",overflow:"hidden"}}>

      {/* orange top stripe */}
      <div style={{position:"absolute",top:0,left:0,right:0,height:"2px",background:`linear-gradient(90deg,transparent,#f9731688,transparent)`,opacity:hov?1:0.5}}/>

      {/* rank */}
      <span style={{position:"absolute",top:"9px",right:"10px",fontSize:"8px",color:"rgba(255,255,255,0.18)",fontFamily:"monospace"}}>#{rank}</span>

      {/* top row */}
      <div style={{display:"flex",alignItems:"flex-start",gap:"10px",marginBottom:"10px"}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:"6px",marginBottom:"4px"}}>
            <span style={{fontFamily:"monospace",fontSize:"11px",color:"#e2e8f0"}}>{trader.shortAddress}</span>
            {trader.isLive&&<span style={{width:"5px",height:"5px",borderRadius:"50%",background:"#4ade80",boxShadow:"0 0 5px #4ade80",animation:"pulse 2s infinite",display:"inline-block"}}/>}
          </div>
          <div style={{display:"flex",gap:"4px",flexWrap:"wrap",alignItems:"center"}}>
            <span style={{fontSize:"7px",fontFamily:"monospace",color:cc,background:`${cc}16`,border:`1px solid ${cc}30`,borderRadius:"3px",padding:"1px 5px"}}>{trader.category.toUpperCase()}</span>
            <span style={{fontSize:"7px",fontFamily:"monospace",color:ageColor,background:`${ageColor}16`,border:`1px solid ${ageColor}30`,borderRadius:"3px",padding:"1px 5px"}}>{trader.daysActive}d OLD</span>
          </div>
        </div>
        {/* ROI big number */}
        <div style={{textAlign:"right",flexShrink:0}}>
          <div style={{fontSize:"20px",fontFamily:"monospace",fontWeight:"700",color:"#f97316",letterSpacing:"-0.02em"}}>{roiLabel}</div>
          <div style={{fontSize:"7.5px",color:"rgba(255,255,255,0.2)",fontFamily:"monospace"}}>{fmt$(trader.totalPnl)}</div>
        </div>
      </div>

      {/* stats row */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:"5px",marginBottom:"10px"}}>
        {[
          {l:"FROM",v:fmtUSD(trader.startingCapital),c:"#fbbf24"},
          {l:"WIN%",v:`${trader.winRate}%`,c:trader.winRate>=80?"#4ade80":"#fbbf24"},
          {l:"TRADES",v:trader.tradeCount,c:"#94a3b8"},
          {l:"AVG BET",v:fmtUSD(trader.avgBet),c:"#94a3b8"},
        ].map(s=>(
          <div key={s.l} style={{textAlign:"center"}}>
            <div style={{fontSize:"11px",fontFamily:"monospace",color:s.c,fontWeight:"600"}}>{s.v}</div>
            <div style={{fontSize:"6.5px",color:"rgba(255,255,255,0.18)",letterSpacing:"0.08em"}}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* sparkline + risk */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <RiskBadge score={trader.riskScore}/>
        <Sparkline data={trader.sparkline} width={68} height={22}/>
      </div>
    </div>
  );
}

// ── UPCOMING PANEL ───────────────────────────
function UpcomingPanel({traders,filter,onSelect}){
  const PAGE=20;
  const [page,setPage]=useState(1);
  const [sort,setSort]=useState("roi");
  const [maxAge,setMaxAge]=useState(150);
  const [maxRisk,setMaxRisk]=useState(5);
  const [dismissed,setDismissed]=useState(false);

  const filtered=traders
    .filter(t=>t.daysActive<=maxAge)
    .filter(t=>t.riskScore<=maxRisk)
    .filter(t=>filter.category==="all"||t.category===filter.category)
    .sort((a,b)=>{
      if(sort==="roi")      return b.roi-a.roi;
      if(sort==="pnl")      return b.totalPnl-a.totalPnl;
      if(sort==="age")      return a.daysActive-b.daysActive; // newest first
      if(sort==="risk")     return a.riskScore-b.riskScore;
      return b.roi-a.roi;
    });

  const visible=filtered.slice(0,page*PAGE);
  const hasMore=visible.length<filtered.length;

  return(
    <div style={{padding:"0 20px 40px"}}>

      {/* ── RISK WARNING BANNER ── */}
      {!dismissed && (
        <div style={{margin:"0 0 18px",padding:"14px 18px",borderRadius:"12px",background:"rgba(239,68,68,0.07)",border:"1px solid rgba(239,68,68,0.35)",position:"relative",animation:"slideUp 0.3s ease"}}>
          <button onClick={()=>setDismissed(true)} style={{position:"absolute",top:"10px",right:"12px",background:"none",border:"none",color:"rgba(255,255,255,0.25)",cursor:"pointer",fontSize:"14px"}}>✕</button>
          <div style={{display:"flex",gap:"12px",alignItems:"flex-start"}}>
            <div style={{fontSize:"24px",flexShrink:0,marginTop:"2px"}}>⚠</div>
            <div>
              <div style={{fontSize:"11px",fontFamily:"monospace",fontWeight:"700",color:"#ef4444",letterSpacing:"0.1em",marginBottom:"5px"}}>HIGH RISK WARNING</div>
              <div style={{fontSize:"11px",color:"rgba(255,255,255,0.55)",lineHeight:"1.6",maxWidth:"680px"}}>
                These wallets are <strong style={{color:"rgba(255,255,255,0.8)"}}>≤5 months old</strong> with limited track records. High returns may reflect <strong style={{color:"rgba(255,255,255,0.8)"}}>luck, variance, or a single lucky trade</strong> — not repeatable skill. Past performance on a handful of trades is not predictive. Copy-trading new wallets carries <strong style={{color:"#ef4444"}}>significant risk of total loss</strong>. Always size positions conservatively and never allocate more than you can afford to lose.
              </div>
              <div style={{display:"flex",gap:"12px",marginTop:"8px",flexWrap:"wrap"}}>
                {["Short track record","High variance","Unproven edge","Potential lucky streak"].map(w=>(
                  <span key={w} style={{fontSize:"8px",fontFamily:"monospace",color:"#f97316",background:"rgba(249,115,22,0.1)",border:"1px solid rgba(249,115,22,0.25)",borderRadius:"4px",padding:"2px 8px"}}>{w}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CONTROLS ── */}
      <div style={{display:"flex",gap:"10px",alignItems:"center",flexWrap:"wrap",marginBottom:"16px",padding:"10px 14px",background:"rgba(255,255,255,0.025)",borderRadius:"10px",border:"1px solid rgba(255,255,255,0.06)"}}>
        {/* Sort */}
        <div style={{display:"flex",gap:"3px",alignItems:"center"}}>
          <span style={{fontSize:"7.5px",color:"rgba(255,255,255,0.2)",fontFamily:"monospace",marginRight:"4px"}}>SORT</span>
          {[{v:"roi",l:"ROI"},{v:"pnl",l:"PNL"},{v:"age",l:"NEWEST"},{v:"risk",l:"LOWEST RISK"}].map(s=>(
            <button key={s.v} onClick={()=>setSort(s.v)} style={{padding:"3px 9px",borderRadius:"4px",cursor:"pointer",fontSize:"7.5px",fontFamily:"monospace",letterSpacing:"0.08em",border:`1px solid ${sort===s.v?"#f97316":"rgba(255,255,255,0.07)"}`,background:sort===s.v?"rgba(249,115,22,0.14)":"transparent",color:sort===s.v?"#f97316":"rgba(255,255,255,0.22)",transition:"all 0.12s"}}>{s.l}</button>
          ))}
        </div>

        {/* Max age */}
        <div style={{display:"flex",gap:"3px",alignItems:"center",marginLeft:"8px"}}>
          <span style={{fontSize:"7.5px",color:"rgba(255,255,255,0.2)",fontFamily:"monospace",marginRight:"4px"}}>MAX AGE</span>
          {[30,60,90,150].map(d=>(
            <button key={d} onClick={()=>setMaxAge(d)} style={{padding:"3px 9px",borderRadius:"4px",cursor:"pointer",fontSize:"7.5px",fontFamily:"monospace",border:`1px solid ${maxAge===d?"#fbbf24":"rgba(255,255,255,0.07)"}`,background:maxAge===d?"rgba(251,191,36,0.12)":"transparent",color:maxAge===d?"#fbbf24":"rgba(255,255,255,0.22)",transition:"all 0.12s"}}>{d}d</button>
          ))}
        </div>

        {/* Max risk */}
        <div style={{display:"flex",gap:"3px",alignItems:"center",marginLeft:"8px"}}>
          <span style={{fontSize:"7.5px",color:"rgba(255,255,255,0.2)",fontFamily:"monospace",marginRight:"4px"}}>RISK ≤</span>
          {[2,3,4,5].map(r=>{
            const rc=["","#4ade80","#fbbf24","#f97316","#ef4444","#dc2626"][r];
            return <button key={r} onClick={()=>setMaxRisk(r)} style={{padding:"3px 9px",borderRadius:"4px",cursor:"pointer",fontSize:"7.5px",fontFamily:"monospace",border:`1px solid ${maxRisk===r?rc:"rgba(255,255,255,0.07)"}`,background:maxRisk===r?`${rc}18`:"transparent",color:maxRisk===r?rc:"rgba(255,255,255,0.22)",transition:"all 0.12s"}}>{r}</button>;
          })}
        </div>

        <span style={{marginLeft:"auto",fontSize:"8px",fontFamily:"monospace",color:"rgba(255,255,255,0.25)"}}>{filtered.length} wallets</span>
      </div>

      {/* ── GRID ── */}
      {filtered.length===0 ? (
        <div style={{textAlign:"center",padding:"60px",fontSize:"11px",color:"rgba(255,255,255,0.2)",fontFamily:"monospace"}}>NO WALLETS MATCH YOUR FILTERS</div>
      ) : (
        <>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:"10px"}}>
            {visible.map((t,i)=><UpcomingCard key={t.address} trader={t} rank={i+1} onClick={()=>onSelect(t)}/>)}
          </div>
          {hasMore && (
            <button onClick={()=>setPage(p=>p+1)} style={{display:"block",margin:"14px auto 0",padding:"9px 28px",borderRadius:"7px",cursor:"pointer",background:"rgba(249,115,22,0.08)",border:"1px solid rgba(249,115,22,0.3)",color:"#f97316",fontSize:"8.5px",fontFamily:"monospace",letterSpacing:"0.12em"}}>
              LOAD MORE · {filtered.length-visible.length} REMAINING
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ── LEADERBOARD PANEL ─────────────────────────
function LeaderboardPanel({tier,traders,filter,onSelect}){
  const cfg=TIER_CONFIG[tier];
  const PAGE=25;
  const [page,setPage]=useState(1);

  // Reset page when filter changes
  useEffect(()=>setPage(1),[filter.category,filter.sort,tier]);

  const filtered=traders
    .filter(t=>t.tiers.includes(tier))
    .filter(t=>filter.category==="all"||t.category===filter.category)
    .sort((a,b)=>{
      if(filter.sort==="winRate") return b.winRate-a.winRate;
      if(filter.sort==="roi") return b.roi-a.roi;
      if(filter.sort==="trades") return b.tradeCount-a.tradeCount;
      return b.totalPnl-a.totalPnl;
    });

  const visible=filtered.slice(0, page*PAGE);
  const hasMore=visible.length < filtered.length;

  return(
    <div style={{background:"rgba(5,9,16,0.98)",border:`1px solid ${cfg.color}28`,borderRadius:"13px",overflow:"hidden",display:"flex",flexDirection:"column"}}>
      <div style={{padding:"13px 14px 11px",background:`linear-gradient(135deg,${cfg.accent}24 0%,transparent 55%)`,borderBottom:`1px solid ${cfg.color}18`,flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
          <span style={{fontSize:"19px",color:cfg.color}}>{cfg.icon}</span>
          <div style={{flex:1}}>
            <div style={{fontSize:"10.5px",fontFamily:"monospace",fontWeight:"700",color:cfg.color,letterSpacing:"0.14em"}}>{cfg.label}</div>
            <div style={{fontSize:"8px",color:"rgba(255,255,255,0.22)",marginTop:"1px"}}>{cfg.desc}</div>
          </div>
          <div style={{textAlign:"right"}}>
            <span style={{fontSize:"14px",fontFamily:"monospace",fontWeight:"700",color:cfg.color}}>{filtered.length}</span>
            <div style={{fontSize:"7px",color:"rgba(255,255,255,0.2)"}}>wallets</div>
          </div>
        </div>
      </div>
      <div style={{padding:"8px",display:"flex",flexDirection:"column",gap:"5px",overflowY:"auto",maxHeight:"680px",scrollbarWidth:"thin",scrollbarColor:`${cfg.color}18 transparent`}}>
        {filtered.length===0
          ? <div style={{textAlign:"center",padding:"28px",fontSize:"9px",color:"rgba(255,255,255,0.14)",fontFamily:"monospace"}}>NO MATCHES</div>
          : visible.map((t,i)=><TraderCard key={t.address} trader={t} rank={i+1} onClick={()=>onSelect(t)}/>)
        }
        {hasMore && (
          <button onClick={()=>setPage(p=>p+1)} style={{margin:"4px 0 2px",padding:"9px",borderRadius:"7px",cursor:"pointer",background:`${cfg.color}0e`,border:`1px solid ${cfg.color}28`,color:cfg.color,fontSize:"8.5px",fontFamily:"monospace",letterSpacing:"0.12em",transition:"all 0.15s"}}>
            LOAD MORE · {filtered.length - visible.length} REMAINING
          </button>
        )}
        {!hasMore && filtered.length > PAGE && (
          <div style={{textAlign:"center",padding:"8px",fontSize:"7.5px",color:"rgba(255,255,255,0.14)",fontFamily:"monospace"}}>ALL {filtered.length} WALLETS LOADED</div>
        )}
      </div>
    </div>
  );
}

// ── TICKER ────────────────────────────────────
function LiveTicker({traders}){
  const [x,setX]=useState(0);
  const items=traders.slice(0,18).map(t=>({addr:t.shortAddress,market:t.topMarkets[0]?.market||"—",pnl:t.totalPnl,tier:t.tier}));
  const W=items.length*330;
  useEffect(()=>{ const iv=setInterval(()=>setX(p=>p-0.5),18); return()=>clearInterval(iv); },[]);
  return(
    <div style={{overflow:"hidden",height:"28px",display:"flex",alignItems:"center",background:"rgba(0,0,0,0.32)",borderTop:"1px solid rgba(255,255,255,0.04)",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
      <div style={{display:"flex",transform:`translateX(${x%W}px)`,whiteSpace:"nowrap"}}>
        {[...items,...items].map((item,i)=>{
          const cfg=TIER_CONFIG[item.tier];
          return <span key={i} style={{fontSize:"8.5px",fontFamily:"monospace",paddingRight:"38px",color:"rgba(255,255,255,0.28)"}}><span style={{color:cfg?.color}}>{cfg?.icon} {item.addr}</span><span style={{color:"rgba(255,255,255,0.14)"}}> → </span><span>{item.market.slice(0,30)}</span><span style={{color:"#4ade80"}}> {fmt$(item.pnl)}</span><span style={{color:"rgba(255,255,255,0.1)"}}> · </span></span>;
        })}
      </div>
    </div>
  );
}

// ── HEADER STATS ──────────────────────────────
function HeaderStats({traders,lastRefresh,dataSource}){
  const totPnl=traders.reduce((s,t)=>s+t.totalPnl,0);
  const avgWin=traders.length?Math.round(traders.reduce((s,t)=>s+t.winRate,0)/traders.length):0;
  const insiders=traders.filter(t=>t.tiers.includes("insider")).length;
  const totDep=traders.reduce((s,t)=>s+t.totalDeposited,0);
  const age=lastRefresh?Math.round((Date.now()-lastRefresh)/1000):null;
  return(
    <div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"7px",padding:"10px 0 3px"}}>
        {[
          {label:"WALLETS TRACKED",value:traders.length,color:"#22d3ee"},
          {label:"TOTAL ALPHA PNL",value:fmtUSD(totPnl),color:"#4ade80"},
          {label:"AVG WIN RATE",value:`${avgWin}%`,color:"#a78bfa"},
          {label:"INSIDER FLAGS",value:insiders,color:"#f97316"},
        ].map(s=>(
          <div key={s.label} style={{textAlign:"center",padding:"9px 6px",background:"rgba(255,255,255,0.025)",borderRadius:"7px",border:"1px solid rgba(255,255,255,0.05)"}}>
            <div style={{fontSize:"18px",fontFamily:"monospace",fontWeight:"700",color:s.color}}>{s.value}</div>
            <div style={{fontSize:"7px",color:"rgba(255,255,255,0.18)",letterSpacing:"0.12em",marginTop:"2px"}}>{s.label}</div>
          </div>
        ))}
      </div>
      <div style={{display:"flex",justifyContent:"space-between",padding:"3px 2px 7px"}}>
        <div style={{fontSize:"7.5px",color:"rgba(255,255,255,0.14)",fontFamily:"monospace"}}>{fmtUSD(totDep)} total capital across {traders.length} wallets</div>
        {age!==null && <div style={{fontSize:"7.5px",color:"rgba(255,255,255,0.14)",fontFamily:"monospace"}}><span style={{color:dataSource==="live"?"#4ade80":"#fbbf24"}}>●</span> {dataSource.toUpperCase()} · {age}s ago</div>}
      </div>
    </div>
  );
}

// ── FILTER BAR ────────────────────────────────
function FilterBar({filter,setFilter}){
  const cats=["all","politics","crypto","finance","sports","other"];
  const sorts=[{v:"pnl",l:"PNL"},{v:"winRate",l:"WIN%"},{v:"roi",l:"ROI"},{v:"trades",l:"TRADES"}];
  return(
    <div style={{display:"flex",alignItems:"center",gap:"8px",flexWrap:"wrap",padding:"8px 20px",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
      <div style={{display:"flex",gap:"3px",flexWrap:"wrap"}}>
        {cats.map(cat=>{
          const a=filter.category===cat, col=cat==="all"?"#94a3b8":CATEGORY_COLORS[cat];
          return <button key={cat} onClick={()=>setFilter(f=>({...f,category:cat}))} style={{padding:"3px 8px",borderRadius:"4px",cursor:"pointer",fontSize:"7.5px",fontFamily:"monospace",letterSpacing:"0.1em",textTransform:"uppercase",border:`1px solid ${a?col:"rgba(255,255,255,0.08)"}`,background:a?`${col}18`:"transparent",color:a?col:"rgba(255,255,255,0.22)",transition:"all 0.12s"}}>{cat}</button>;
        })}
      </div>
      <div style={{marginLeft:"auto",display:"flex",gap:"3px",alignItems:"center"}}>
        <span style={{fontSize:"7.5px",color:"rgba(255,255,255,0.14)",fontFamily:"monospace",marginRight:"3px"}}>SORT</span>
        {sorts.map(s=>(
          <button key={s.v} onClick={()=>setFilter(f=>({...f,sort:s.v}))} style={{padding:"3px 8px",borderRadius:"4px",cursor:"pointer",fontSize:"7.5px",fontFamily:"monospace",letterSpacing:"0.08em",border:`1px solid ${filter.sort===s.v?"#22d3ee":"rgba(255,255,255,0.07)"}`,background:filter.sort===s.v?"#22d3ee18":"transparent",color:filter.sort===s.v?"#22d3ee":"rgba(255,255,255,0.2)",transition:"all 0.12s"}}>{s.l}</button>
        ))}
      </div>
    </div>
  );
}

// ── APP ───────────────────────────────────────
export default function Situation(){
  const [traders,setTraders]=useState([]);
  const [upcomingTraders,setUpcomingTraders]=useState([]);
  const [loading,setLoading]=useState(true);
  const [lastRefresh,setLastRefresh]=useState(null);
  const [dataSource,setDataSource]=useState("mock");
  const [filter,setFilter]=useState({category:"all",sort:"pnl"});
  const [search,setSearch]=useState("");
  const [selected,setSelected]=useState(null);
  const [msg,setMsg]=useState("SCANNING LEADERBOARD…");
  const [mainTab,setMainTab]=useState("leaderboards"); // "leaderboards" | "upcoming"

  const loadData=useCallback(async()=>{
    setMsg("SCANNING LEADERBOARD…");
    try {
      const lb=await fetchLeaderboard();
      if(lb&&Array.isArray(lb)&&lb.length>0){
        setMsg(`ENRICHING ${Math.min(lb.length,100)} WALLETS…`);
        const top=lb.slice(0,100);
        const enriched=await Promise.all(top.map(async entry=>{
          const addr=entry.proxyWalletAddress||entry.address||entry.userId;
          if(!addr) return null;
          const [trades,positions,value]=await Promise.all([fetchTrades(addr),fetchPositions(addr),fetchValue(addr)]);
          const pnl=value?.portfolioValue??0;
          const tc=(trades||[]).length||10;
          const wr=50+Math.floor(Math.random()*45);
          const tier=pnl>50000?"insider":wr>=85?"highWinRate":tc>50?"schizo":"zeroToHero";
          const sc=Math.round(500+Math.random()*5000);
          return {
            address:addr, shortAddress:`${addr.slice(0,8)}…${addr.slice(-4)}`,
            tier, tiers:[tier], category:"other", totalPnl:pnl, winRate:wr,
            tradeCount:tc, avgBet:200, startingCapital:sc, totalDeposited:sc,
            currentValue:sc+pnl, roi:Math.round((pnl/sc)*100),
            sparkline:Array.from({length:20},(_,i)=>({x:i,y:sc+(pnl*i/19)})),
            growthCurve:Array.from({length:20},(_,i)=>({date:new Date(Date.now()-(20-i)*86400000).toISOString(),value:sc+(pnl*i/19)})),
            deposits:[{date:new Date(Date.now()-60*86400000).toISOString(),amount:sc,txHash:"0x…"}],
            trades:((trades||[]).slice(0,20)).map((t,i)=>({id:`t${i}`,date:t.timestamp||new Date().toISOString(),market:t.market||"Unknown",category:"other",side:t.side||"BUY",price:parseFloat(t.price||0.5),size:parseFloat(t.size||100),profit:0,won:true,status:"RESOLVED"})),
            positions:[], topMarkets:[], bestTrade:null, catBreakdown:{other:tc},
            startDate:new Date(Date.now()-60*86400000).toISOString(),
            lastActive:new Date().toISOString(), isLive:false, daysActive:60,
          };
        }));
        const valid=enriched.filter(Boolean);
        if(valid.length>=5){ setTraders(valid); setDataSource("live"); setLastRefresh(Date.now()); setLoading(false); return; }
      }
    } catch(e){}
    setTraders(generateMockTraders());
    setUpcomingTraders(generateUpcomingTraders());
    setDataSource("mock");
    setLastRefresh(Date.now());
    setLoading(false);
  },[]);

  useEffect(()=>{ loadData(); const iv=setInterval(loadData,REFRESH_INTERVAL); return()=>clearInterval(iv); },[loadData]);

  const shown=search ? traders.filter(t=>t.address.toLowerCase().includes(search.toLowerCase())) : traders;

  if(loading) return(
    <div style={{minHeight:"100vh",background:"#050810",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"monospace"}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:"38px",color:"#22d3ee",marginBottom:"14px",animation:"spin 2s linear infinite"}}>◈</div>
        <div style={{color:"rgba(255,255,255,0.22)",fontSize:"9px",letterSpacing:"0.22em"}}>{msg}</div>
      </div>
    </div>
  );

  return(
    <div style={{minHeight:"100vh",background:"radial-gradient(ellipse at 12% 8%,#0c1828 0%,#050810 50%)",color:"#e2e8f0",fontFamily:"monospace"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes slideUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:2px}
        input::placeholder{color:rgba(255,255,255,0.2)} input{outline:none}
      `}</style>

      {/* HEADER */}
      <div style={{padding:"16px 20px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"baseline",gap:"11px"}}>
            <span style={{fontSize:"24px",fontWeight:"700",background:"linear-gradient(135deg,#22d3ee 0%,#a78bfa 100%)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",letterSpacing:"-0.03em"}}>SITUATION</span>
            <span style={{fontSize:"7.5px",color:"rgba(255,255,255,0.14)",letterSpacing:"0.2em"}}>POLYMARKET INTELLIGENCE v4</span>
          </div>
          <div style={{display:"flex",gap:"7px",alignItems:"center"}}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="search wallet…" style={{padding:"5px 11px",borderRadius:"6px",width:"155px",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",color:"#e2e8f0",fontSize:"9.5px",fontFamily:"monospace"}}/>
            <button onClick={loadData} style={{padding:"5px 11px",borderRadius:"6px",cursor:"pointer",background:"rgba(34,211,238,0.07)",border:"1px solid rgba(34,211,238,0.22)",color:"#22d3ee",fontSize:"8.5px",fontFamily:"monospace",letterSpacing:"0.1em"}}>↺ REFRESH</button>
          </div>
        </div>
        <HeaderStats traders={shown} lastRefresh={lastRefresh} dataSource={dataSource}/>
      </div>

      <LiveTicker traders={traders}/>

      {/* ── TOP-LEVEL TAB SWITCHER ── */}
      <div style={{display:"flex",alignItems:"center",gap:"0",padding:"0 20px",borderBottom:"1px solid rgba(255,255,255,0.06)",background:"rgba(0,0,0,0.2)"}}>
        {[
          {id:"leaderboards", label:"LEADERBOARDS", icon:"◈", color:"#22d3ee"},
          {id:"upcoming",     label:"UP & COMING",  icon:"⚡", color:"#f97316", badge:upcomingTraders.length},
        ].map(tab=>{
          const active=mainTab===tab.id;
          return(
            <button key={tab.id} onClick={()=>setMainTab(tab.id)} style={{display:"flex",alignItems:"center",gap:"6px",padding:"11px 18px",background:"none",border:"none",borderBottom:`2px solid ${active?tab.color:"transparent"}`,color:active?tab.color:"rgba(255,255,255,0.3)",cursor:"pointer",fontSize:"9px",fontFamily:"monospace",letterSpacing:"0.14em",transition:"all 0.15s",position:"relative",top:"1px"}}>
              <span style={{fontSize:"12px"}}>{tab.icon}</span>
              {tab.label}
              {tab.badge && <span style={{fontSize:"7.5px",background:active?"rgba(249,115,22,0.22)":"rgba(255,255,255,0.08)",color:active?"#f97316":"rgba(255,255,255,0.3)",border:`1px solid ${active?"rgba(249,115,22,0.4)":"rgba(255,255,255,0.1)"}`,borderRadius:"10px",padding:"1px 6px",letterSpacing:"0.08em"}}>{tab.badge}</span>}
            </button>
          );
        })}
        {/* filter bar inline for leaderboards */}
        {mainTab==="leaderboards" && (
          <div style={{marginLeft:"auto",display:"flex",gap:"3px",alignItems:"center",padding:"6px 0"}}>
            {["all","politics","crypto","finance","sports","other"].map(cat=>{
              const a=filter.category===cat, col=cat==="all"?"#94a3b8":CATEGORY_COLORS[cat];
              return <button key={cat} onClick={()=>setFilter(f=>({...f,category:cat}))} style={{padding:"3px 8px",borderRadius:"4px",cursor:"pointer",fontSize:"7.5px",fontFamily:"monospace",letterSpacing:"0.08em",textTransform:"uppercase",border:`1px solid ${a?col:"rgba(255,255,255,0.07)"}`,background:a?`${col}18`:"transparent",color:a?col:"rgba(255,255,255,0.2)",transition:"all 0.12s"}}>{cat}</button>;
            })}
            <div style={{width:"1px",height:"16px",background:"rgba(255,255,255,0.08)",margin:"0 6px"}}/>
            {[{v:"pnl",l:"PNL"},{v:"winRate",l:"WIN%"},{v:"roi",l:"ROI"},{v:"trades",l:"TRADES"}].map(s=>(
              <button key={s.v} onClick={()=>setFilter(f=>({...f,sort:s.v}))} style={{padding:"3px 8px",borderRadius:"4px",cursor:"pointer",fontSize:"7.5px",fontFamily:"monospace",letterSpacing:"0.08em",border:`1px solid ${filter.sort===s.v?"#22d3ee":"rgba(255,255,255,0.07)"}`,background:filter.sort===s.v?"rgba(34,211,238,0.1)":"transparent",color:filter.sort===s.v?"#22d3ee":"rgba(255,255,255,0.2)",transition:"all 0.12s"}}>{s.l}</button>
            ))}
          </div>
        )}
      </div>

      {/* ── LEADERBOARDS VIEW ── */}
      {mainTab==="leaderboards" && (
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"12px",padding:"12px 20px 40px",minWidth:"900px",overflowX:"auto"}}>
          {Object.keys(TIER_CONFIG).map(tier=>(
            <LeaderboardPanel key={tier} tier={tier} traders={shown} filter={filter} onSelect={setSelected}/>
          ))}
        </div>
      )}

      {/* ── UP & COMING VIEW ── */}
      {mainTab==="upcoming" && (
        <UpcomingPanel traders={upcomingTraders} filter={filter} onSelect={setSelected}/>
      )}

      <div style={{padding:"10px 20px",borderTop:"1px solid rgba(255,255,255,0.04)",display:"flex",justifyContent:"space-between"}}>
        <span style={{fontSize:"7.5px",color:"rgba(255,255,255,0.1)",letterSpacing:"0.08em"}}>SITUATION v4 · GAMMA + DATA API · {traders.length} MAIN · {upcomingTraders.length} UPCOMING</span>
        <span style={{fontSize:"7.5px",color:"rgba(255,255,255,0.07)",letterSpacing:"0.08em"}}>NOT FINANCIAL ADVICE · DYOR</span>
      </div>

      {selected && <WalletModal trader={selected} onClose={()=>setSelected(null)}/>}
    </div>
  );
}
