// simulation-logic.mjs - fonctions pures pour le calcul de la simulation de prêt crypto
export function calcWbtcSize(depositUSDC, price) {
  return price > 0 ? depositUSDC / price : 0;
}

export function calcDepositTotal(depositUSDC, r_yield, time) {
  // Simple interest on deposit
  return depositUSDC * (1 + r_yield * time);
}

export function calcBorrowable(depositUSDC, LTV) {
  return depositUSDC * LTV;
}

export function calcRealLTV(depositUSDC, borrowed) {
  return depositUSDC > 0 ? (borrowed / depositUSDC) * 100 : 0;
}

export function computeSeries({ C0, r_yield, LTV, r_loan, borrowed, r_vault, duration, unit }) {
  const B0 = C0 * LTV;
  const borrowedAmt = Math.min(Math.max(borrowed, 0), B0);
  const labels = [];
  const data = [];
  let breakEvenTime = null;
  for (let i = 0; i <= duration; i++) {
    const monthsCount = unit === 'months' ? i : i * 12;
    const timeYears = monthsCount / 12;
    labels.push(unit === 'months' ? `${i} month` : `${i} years`);
    const depositProfit = C0 * r_yield * timeYears;                    // simple interest on deposit
    const loanCost = borrowedAmt * r_loan * timeYears;                  // linear loan cost
    const vaultProfit = borrowedAmt * (Math.pow(1 + r_vault / 12, monthsCount) - 1); // monthly compounded vault
    const net = depositProfit + vaultProfit - loanCost;
    data.push(net);
    if (breakEvenTime === null && net >= 0 && i > 0) {
      breakEvenTime = i;
    }
  }
  const breakEven = breakEvenTime !== null
    ? (unit === 'months' ? `${breakEvenTime} mois` : `${breakEvenTime} ans`)
    : 'Pas de break-even';
  const netGain = data[data.length - 1] || 0;
  return { labels, data, breakEven, netGain };
}