import React, { useEffect, useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// =====================================================
// 🧾 XvM TRADE + MARKET INTELLIGENCE TERMINAL
// =====================================================

const CITIES = [
  "Caerleon",
  "Bridgewatch",
  "FortSterling",
  "Lymhurst",
  "Black Market",
  "Martlock",
  "Thetford"
];

const TIERS = [4, 5, 6, 7, 8];
const ENCHANTS = [0, 1, 2, 3, 4];

const TAX = {
  listingFee: 0.025,
  premiumTax: 0.04,
  nonPremiumTax: 0.08
};

export default function XvMEmpireTracker() {
  const [trades, setTrades] = useState(() => {
    const saved = localStorage.getItem('xvm-empire-trades');
    return saved ? JSON.parse(saved) : [];
  });

  const [item, setItem] = useState('');
  const [qty, setQty] = useState(1);

  const [tier, setTier] = useState(6);
  const [enchant, setEnchant] = useState(0);

  const [buyPrice, setBuyPrice] = useState(0);
  const [sellPrice, setSellPrice] = useState(0);

  const [buyCity, setBuyCity] = useState(CITIES[0]);
  const [sellCity, setSellCity] = useState(CITIES[1]);

  const [priceInputs, setPriceInputs] = useState({});

  useEffect(() => {
    localStorage.setItem('xvm-empire-trades', JSON.stringify(trades));
  }, [trades]);

  const fmt = (n) => "$" + Math.round(Number(n || 0)).toLocaleString();
  const roundSilver = (n) => Math.round(Number(n || 0));

  const soldQty = (t) => (t.sellEvents || []).reduce((a, e) => a + e.qty, 0);
  const remainingQty = (t) => Math.max(t.qty - soldQty(t), 0);
  const invested = (t) => t.buyPrice * t.qty;

  const realizedProfit = (t) => {
    const events = t.sellEvents || [];
    return events.reduce((acc, e) => {
      const gross = (e.price - t.buyPrice) * e.qty;
      const fee = e.price * TAX.listingFee * e.qty;
      const tax = e.price * (t.premium ? TAX.premiumTax : TAX.nonPremiumTax) * e.qty;
      return acc + (gross - fee - tax);
    }, 0);
  };

  const heldValue = (t) => remainingQty(t) * (t.currentSellPrice || t.sellPrice);
  const roi = (t) => invested(t) ? (realizedProfit(t) / invested(t)) * 100 : 0;
  const ageDays = (t) => Math.max(1, (Date.now() - (t.listedAt || t.id)) / 86400000);
  const daysSinceLastSale = (t) => {
    if (!t.sellEvents || t.sellEvents.length === 0) return ageDays(t);
    const lastSale = Math.max(...t.sellEvents.map(e => e.time));
    return Math.max(0, (Date.now() - lastSale) / 86400000);
  };
  const profitPerDay = (t) => realizedProfit(t) / ageDays(t);
  const capitalEfficiency = (t) => invested(t) ? roi(t) / ageDays(t) : 0;

  const sellSummary = (t) => {
    const map = {};
    (t.sellEvents || []).forEach(e => {
      if (!map[e.price]) {
        map[e.price] = { qty: 0, taxes: 0, profit: 0 };
      }

      const grossRevenue = e.price * e.qty;
      const listingFees = roundSilver(grossRevenue * TAX.listingFee);
      const salesTax = roundSilver(grossRevenue * TAX.premiumTax);
      const totalTaxes = listingFees + salesTax;
      const netProfit = grossRevenue - (t.buyPrice * e.qty) - totalTaxes;

      map[e.price].qty += e.qty;
      map[e.price].taxes += totalTaxes;
      map[e.price].profit += netProfit;
    });

    return Object.entries(map).map(([price, data]) => ({
      price: Number(price),
      qty: data.qty,
      taxes: data.taxes,
      profit: data.profit,
      roi: t.buyPrice > 0 ? (data.profit / (t.buyPrice * data.qty)) * 100 : 0
    }));
  };

  const addTrade = () => {
    if (!item || buyPrice <= 0 || sellPrice <= 0 || qty <= 0) return;

    setTrades([
      {
        id: Date.now(),
        listedAt: Date.now(),
        item,
        qty,
        tier,
        enchant,
        buyPrice,
        sellPrice,
        buyCity,
        sellCity,
        sellEvents: [],
        relistHistory: [],
        relistCount: 0,
        currentSellPrice: sellPrice
      },
      ...trades
    ]);

    setItem('');
    setQty(1);
    setBuyPrice(0);
    setSellPrice(0);
  };

  const sellItem = (id, amount) => {
    setTrades(trades.map(t => {
      if (t.id !== id) return t;

      const sellAmount = Math.min(amount, remainingQty(t));

      return {
        ...t,
        sellEvents: [...(t.sellEvents || []), {
          qty: sellAmount,
          price: t.currentSellPrice || t.sellPrice,
          time: Date.now()
        }]
      };
    }));
  };

  const applyPriceChange = (id) => {
    const newPrice = Number(priceInputs[id]);
    if (!newPrice) return;

    setTrades(trades.map(t => {
      if (t.id !== id) return t;

      const changed = newPrice !== t.currentSellPrice;

      return {
        ...t,
        currentSellPrice: newPrice,
        relistCount: changed ? (t.relistCount || 0) + 1 : t.relistCount,
        relistHistory: changed
          ? [...(t.relistHistory || []), { price: newPrice, time: Date.now() }]
          : t.relistHistory
      };
    }));
  };

  // =============================
  // 🧠 SIGNAL ENGINE (FIXED)
  // =============================
  const getSignalInfo = (t) => {
    const sales = (t.sellEvents || []).length;
    const relists = t.relistCount || 0;
    const remaining = remainingQty(t);

    if (remaining === 0) {
      return { label: "CLOSED", action: "All sold", reason: "No stock left", color: "text-gray-500" };
    }

    if (sales === 0 && relists > 3) {
      return { label: "DUMP", action: "Exit position", reason: "No demand + repeated relists", color: "text-red-500" };
    }

    if (sales > 5 && relists < 2) {
      return { label: "HOLD", action: "Keep listing", reason: "Strong demand velocity", color: "text-green-500" };
    }

    if (relists >= 3 && sales < 3) {
      return { label: "UNDERCUT", action: "Lower price", reason: "Listing stale / uncompetitive", color: "text-orange-500" };
    }

    return { label: "MONITOR", action: "Watch market", reason: "No clear trend", color: "text-blue-500" };
  };

  const ItemHistoryChart = ({ t }) => {
    const timeline = [
      { time: t.listedAt || t.id, type: 'Listed', qty: t.qty, price: t.sellPrice },
      ...((t.relistHistory || []).map(x => ({
        time: x.time,
        type: 'Relisted',
        qty: remainingQty(t),
        price: x.price
      }))),
      ...((t.sellEvents || []).map(x => ({
        time: x.time,
        type: 'Sold',
        qty: x.qty,
        price: x.price
      })))
    ].sort((a, b) => a.time - b.time);

    const points = [
      { time: t.id, price: t.sellPrice, label: 'Listed' },
      ...(t.relistHistory || []).map(x => ({
        time: x.time,
        price: x.price,
        label: 'Relisted'
      })),
      ...(t.sellEvents || []).map(x => ({
        time: x.time,
        price: x.price,
        label: `Sold ${x.qty}`
      }))
    ].sort((a, b) => a.time - b.time);

    if (points.length < 2) return null;

    return (
      <div className="h-64 mt-4">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" />
            <YAxis />
            <Tooltip
              formatter={(value) => fmt(value)}
              labelFormatter={(label) => label}
            />
            <Line type="monotone" dataKey="price" strokeWidth={2} dot />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  };

  const totalUnitsBought = useMemo(() => trades.reduce((a,t)=>a + t.qty, 0), [trades]);
  const totalUnitsSold = useMemo(() => trades.reduce((a,t)=>a + soldQty(t), 0), [trades]);
  const totalUnitsHeld = useMemo(() => trades.reduce((a,t)=>a + remainingQty(t), 0), [trades]);

  const totalInvested = useMemo(() => trades.reduce((a,t)=>a+invested(t),0),[trades]);
  const totalRealized = useMemo(() => trades.reduce((a,t)=>a+realizedProfit(t),0),[trades]);
  const totalHeld = useMemo(() => trades.reduce((a,t)=>a+heldValue(t),0),[trades]);
  const totalROI = totalInvested ? (totalRealized/totalInvested)*100 : 0;
  const totalUnrealized = useMemo(() => trades.reduce((a,t) => {
    const currentPrice = t.currentSellPrice || t.sellPrice;
    const qtyHeld = remainingQty(t);
    if (qtyHeld <= 0) return a;
    const gross = (currentPrice - t.buyPrice) * qtyHeld;
    const fees = currentPrice * qtyHeld * (TAX.listingFee + TAX.premiumTax);
    return a + (gross - fees);
  }, 0), [trades]);

  const netWorth = totalRealized + totalHeld;
  const sellThroughRate = totalUnitsBought ? (totalUnitsSold / totalUnitsBought) * 100 : 0;

  const closedTrades = useMemo(() => trades.filter(t => remainingQty(t) === 0), [trades]);
  const winningTrades = useMemo(() => closedTrades.filter(t => realizedProfit(t) > 0), [closedTrades]);
  const winRate = closedTrades.length ? (winningTrades.length / closedTrades.length) * 100 : 0;

  const averageROI = closedTrades.length
    ? closedTrades.reduce((sum, t) => sum + roi(t), 0) / closedTrades.length
    : 0;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">XvM Empire Econ Tool</h1>

      <Card>
        <CardHeader><CardTitle>Trade Summary</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <div>Invested: {fmt(totalInvested)}</div>
          <div>Realized Profit: {fmt(totalRealized)}</div>
          <div>Unrealized Profit: {fmt(totalUnrealized)}</div>
          <div>Net Worth: {fmt(netWorth)}</div>
          <div>Held Value: {fmt(totalHeld)}</div>
          <div className={totalROI >= 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
            Portfolio ROI: {totalROI.toFixed(2)}%
          </div>
          <div className={averageROI >= 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
            Avg Closed ROI: {averageROI.toFixed(2)}%
          </div>
          <div className={winRate >= 50 ? 'text-green-600 font-semibold' : 'text-orange-600 font-semibold'}>
            Win Rate: {winRate.toFixed(1)}%
          </div>
          <div>Total Bought: {totalUnitsBought}</div>
          <div>Total Sold: {totalUnitsSold}</div>
          <div>Total Held: {totalUnitsHeld}</div>
          <div>Closed Trades: {closedTrades.length}</div>
          <div className={sellThroughRate >= 70 ? 'text-green-600 font-semibold' : sellThroughRate >= 40 ? 'text-orange-600 font-semibold' : 'text-red-600 font-semibold'}>
            Sell-Through: {sellThroughRate.toFixed(1)}%
          </div>
        </CardContent>
      </Card>

      {/* ADD TRADE */}
      <Card>
        <CardHeader><CardTitle>Add Trade</CardTitle></CardHeader>
        <CardContent className="space-y-3">

          <div>
            <div className="text-sm font-medium">Item</div>
            <Input value={item} onChange={e=>setItem(e.target.value)} />
          </div>

          <div>
            <div className="text-sm font-medium">Quantity</div>
            <Input type="number" value={qty} onChange={e=>setQty(Number(e.target.value))} />
          </div>

          <div>
            <div className="text-sm font-medium">Tier</div>
            <div className="flex gap-2">
              {TIERS.map(t=> (
                <button key={t} onClick={()=>setTier(t)} className={`px-3 py-1 border ${tier===t?'bg-black text-white':''}`}>T{t}</button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-sm font-medium">Enchant</div>
            <div className="flex gap-2">
              {ENCHANTS.map(e=> (
                <button key={e} onClick={()=>setEnchant(e)} className={`px-3 py-1 border ${enchant===e?'bg-black text-white':''}`}>.{e}</button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-sm font-medium">Buy Price + City</div>
            <div className="flex gap-2">
              <Input type="number" value={buyPrice} onChange={e=>setBuyPrice(Number(e.target.value))} />
              <select value={buyCity} onChange={e=>setBuyCity(e.target.value)}>
                {CITIES.map(c=> <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div>
            <div className="text-sm font-medium">Sell Price + City</div>
            <div className="flex gap-2">
              <Input type="number" value={sellPrice} onChange={e=>setSellPrice(Number(e.target.value))} />
              <select value={sellCity} onChange={e=>setSellCity(e.target.value)}>
                {CITIES.map(c=> <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <Button onClick={addTrade}>Add Trade</Button>
        </CardContent>
      </Card>

      {/* POSITIONS */}
      <Card>
        <CardHeader><CardTitle>Positions</CardTitle></CardHeader>
        <CardContent>
          {trades.map(t=> {
            const signal = getSignalInfo(t);

            return (
              <div key={t.id} className="border-b py-4 space-y-2">

                <div className="font-bold">{t.item} T{t.tier}.{t.enchant}</div>

                <div className={`font-bold ${signal.color}`}>{signal.label}</div>
                <div className="text-sm">{signal.action}</div>
                <div className="text-xs opacity-70">{signal.reason}</div>

                <div className="flex gap-2">
                  <Input
                    placeholder="Set sell price"
                    onChange={e=>setPriceInputs({...priceInputs,[t.id]:e.target.value})}
                  />
                  <Button onClick={()=>applyPriceChange(t.id)}>Update Price</Button>
                </div>

                <div className="flex gap-2">
                  <Button onClick={()=>sellItem(t.id,1)}>Sell +1</Button>
                </div>

                <div>Total Qty: {t.qty} | Sold: {soldQty(t)} | Remaining: {remainingQty(t)}</div>
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-green-500 h-3"
                    style={{ width: `${t.qty ? (soldQty(t) / t.qty) * 100 : 0}%` }}
                  />
                </div>
                <div className="text-xs text-gray-600">
                  Sell-Through: {t.qty ? ((soldQty(t) / t.qty) * 100).toFixed(1) : '0.0'}%
                </div>
                <div>Relists: {t.relistCount||0}</div>
                <div>Inventory Age: {ageDays(t).toFixed(1)} days</div>
                <div>Days Since Last Sale: {daysSinceLastSale(t).toFixed(1)} days</div>
                <div className={ageDays(t) > 14 ? 'text-red-600 font-semibold' : ageDays(t) > 7 ? 'text-orange-600 font-semibold' : 'text-green-600 font-semibold'}>
                  Inventory Status: {ageDays(t) > 14 ? 'Stale' : ageDays(t) > 7 ? 'Aging' : 'Fresh'}
                </div>
                <div>Profit/Day: {fmt(profitPerDay(t))}</div>
                <div className={capitalEfficiency(t) >= 2 ? 'text-green-600 font-semibold' : capitalEfficiency(t) >= 0.5 ? 'text-orange-600 font-semibold' : 'text-red-600 font-semibold'}>
                  Capital Efficiency: {capitalEfficiency(t).toFixed(2)}%/day
                </div>

                <div className="text-sm">
                  {sellSummary(t).map((s,i)=> (
                    <div key={i}>{s.qty}x @ {fmt(s.price)}</div>
                  ))}
                </div>

              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* ITEM HISTORY */}
      <Card>
        <CardHeader><CardTitle>Item History</CardTitle></CardHeader>
        <CardContent>
          {trades.map(t => (
            <div key={`history-${t.id}`} className="border-b py-6">
              <div className="font-bold mb-2">{t.item} T{t.tier}.{t.enchant}</div>
              <div className="text-sm mb-2">
                Realized Profit: {fmt(realizedProfit(t))} | ROI: {roi(t).toFixed(2)}% | Total: {t.qty} | Sold: {soldQty(t)} | Held: {remainingQty(t)}
              </div>
              <div className="text-sm mb-2">
                <div>Listed: {new Date(t.listedAt || t.id).toLocaleString()}</div>
                {(t.sellEvents || []).map((e, i) => (
                  <div key={`sale-${i}`}>
                    Sold {e.qty}x @ {fmt(e.price)} on {new Date(e.time).toLocaleString()}
                  </div>
                ))}
                {(t.relistHistory || []).map((r, i) => (
                  <div key={`relist-${i}`}>
                    Relisted @ {fmt(r.price)} on {new Date(r.time).toLocaleString()}
                  </div>
                ))}
                {sellSummary(t).map((s, i) => {
                  const grossRevenue = s.price * s.qty;
                  const listingFees = grossRevenue * TAX.listingFee;
                  const salesTax = grossRevenue * TAX.premiumTax;
                  const netProfit = ((s.price - t.buyPrice) * s.qty) - listingFees - salesTax;
                  const eventROI = t.buyPrice > 0 ? (netProfit / (t.buyPrice * s.qty)) * 100 : 0;

                  return (
                    <div key={i}>
                      {s.qty}x sold @ {fmt(s.price)} | Profit: {fmt(netProfit)} | ROI: {eventROI.toFixed(2)}% | Taxes: {fmt(listingFees + salesTax)}
                    </div>
                  );
                })}
              </div>
              <ItemHistoryChart t={t} />
            </div>
          ))}
        </CardContent>
      </Card>

    </div>
  );
}
