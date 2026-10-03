// Shared price logic (used by the shop and the admin tool).
function tierExtra(tiers, n) {
    const t = tiers.find(t => t.max === null || n <= t.max);
    return t ? t.extra : 0
}
// items: [{n,blocks,sp}]; withComplexity=false reproduces code version 1 (no complexity surcharge).
function calcPrice(P, stack, items, rnd, withComplexity = true) {
    let cost = 0;
    const rows = items.map(i => {
        const st = Math.ceil(i.blocks / stack);
        cost += st * i.sp;
        return {
            n: i.n,
            blocks: i.blocks,
            stacks: st,
            sp: i.sp
        }
    }),
        distinct = rows.filter(r => r.blocks > 0).length,
        extra = withComplexity ? tierExtra(P.complexityTiers, distinct) : 0,
        profit = Math.max(cost * P.profitPct / 100, P.minProfit),
        target = (cost + profit) / (100 - P.internalDiscPct) * 100 + extra,
        rounded = Math.ceil(target / P.round) * P.round,
        list = rounded + rnd,
        base = Math.floor(list / P.round) * P.round,
        cust = Math.round(base * (100 - P.customerDiscPct) / 100);
    return {
        rows,
        cost,
        profit,
        target,
        rounded,
        rnd,
        list,
        base,
        cust,
        distinct,
        extra
    }
}
