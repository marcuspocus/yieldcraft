import { calcWbtcSize, calcDepositTotal, calcBorrowable, calcRealLTV, computeSeries } from './simulation-logic.mjs';
document.addEventListener('DOMContentLoaded', () => {
  console.log('simulation-lending.js loaded');
  const inputs = {
    depositValue: document.getElementById('depositValue'),
    wbtcPrice: document.getElementById('wbtcPrice'),
    depositYield: document.getElementById('depositYield'),
    tvlMax: document.getElementById('tvlMax'),
    loanInterest: document.getElementById('loanInterest'),
    borrowedAmount: document.getElementById('borrowedAmount'),
    vaultYield: document.getElementById('vaultYield'),
    duration: document.getElementById('duration'),
    durationUnit: document.getElementById('durationUnit'),
    vaultTopupInput: document.getElementById('vaultTopupInput'),
  };
  const splitSlider = document.getElementById('splitSlider');
  const splitSliderGroup = document.getElementById('splitSliderGroup');
  const splitLabel = document.getElementById('splitLabel');
  // Instance du chart pour pouvoir le détruire/recréer
  let chartInstance;
  const refreshBtn = document.getElementById('refreshPriceBtn');
  /**
   * Récupère le prix WBTC depuis Hyperliquid et met à jour le champ
   */
  async function fetchWbtcPrice() {
    try {
      const res = await fetch('https://api.hyperliquid.xyz/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ "type": "allMids" })
      });
      const json = await res.json();
      // Recherche du symbole WBTC dans la réponse (planaire ou sous markets/tickers)
      let price = json.BTC;
      price = parseFloat(price);
      if (!isNaN(price)) {
        inputs.wbtcPrice.value = price;
      }
    } catch (err) {
      console.error('Error fetching WBTC price:', err);
    }
  }
  // Événement sur le bouton de rafraîchissement
  if (refreshBtn) refreshBtn.addEventListener('click', fetchWbtcPrice);
  // Chargement initial du prix
  fetchWbtcPrice();
  const breakEvenEl = document.getElementById('breakEven');
  const netGainEl = document.getElementById('netGain');
  // Le chart sera créé et mis à jour par drawPNLChart(), pas d'instanciation ici
  const borrowableEl = document.getElementById('borrowableAmount');
  const realLTVEl = document.getElementById('realLTV');
  const depositValueEl = document.getElementById('depositValue');
  const wbtcAmountEl = document.getElementById('wbtcAmount');
  const depositTotalEl = document.getElementById('depositTotal');
  const finalCapitalEl = document.getElementById('finalCapital');
  // Helper pour styler les bordures selon valeur
  function styleBorder(el, value) {
    el.classList.remove('border-success', 'border-danger', 'border');
    if (value > 0) el.classList.add('border', 'border-success');
    else if (value < 0) el.classList.add('border', 'border-danger');
  }
  let firstLoad = true;

  let recurringTopup = 0;

  function setRecurringTopup(value) {
    recurringTopup = value;
    if (value > 0) {
      splitSliderGroup.classList.remove('d-none');
      updateSplitLabel(splitSlider.valueAsNumber || 100);
    } else {
      splitSliderGroup.classList.add('d-none');
    }
  }

  function updateSplitLabel(v) {
    const loanPct = 100 - v;
    const vaultPct = v;
    splitLabel.textContent = `${loanPct}% / ${vaultPct}%`;
  }

  function getValues() {
    return {
      C0: inputs.depositValue.valueAsNumber || 0,
      r_yield: (inputs.depositYield.valueAsNumber || 0) / 100,
      LTV: (inputs.tvlMax.valueAsNumber || 0) / 100,
      r_loan: (inputs.loanInterest.valueAsNumber || 0) / 100,
      borrowed: inputs.borrowedAmount.valueAsNumber || 0,
      r_vault: (inputs.vaultYield.valueAsNumber || 0) / 100,
      duration: inputs.duration.valueAsNumber || 0,
      unit: inputs.durationUnit.value
    };
  }
  function update() {
    const vals = getValues();
    // console.log('update', vals);
    // Taille en WBTC
    const depositUSDC = vals.C0;
    const price = inputs.wbtcPrice.valueAsNumber || 0;
    const wbtcSize = calcWbtcSize(depositUSDC, price);
    wbtcAmountEl.value = wbtcSize.toFixed(8);
    // Valeur finale du dépôt
    const time = vals.unit === 'months' ? vals.duration / 12 : vals.duration;
    const depositTotal = parseFloat(calcDepositTotal(depositUSDC, vals.r_yield, time).toFixed(2));
    depositTotalEl.value = depositTotal.toFixed(2);
    styleBorder(depositTotalEl, depositTotal);
    if (vals.duration < 1) return;
    // Montant empruntable (max selon LTV)
    const borrowable = calcBorrowable(depositUSDC, vals.LTV);
    borrowableEl.value = borrowable.toFixed(2);
    // Au premier chargement, initialiser Montant investi à Montant empruntable
    if (firstLoad) {
      inputs.borrowedAmount.value = borrowable.toFixed(2);
      vals.borrowed = borrowable;
      firstLoad = false;
    } else {
      // Empêcher un emprunt supérieur au montant empruntable
      if (inputs.borrowedAmount.valueAsNumber > borrowable) {
        inputs.borrowedAmount.value = borrowable.toFixed(2);
        vals.borrowed = borrowable;
      }
    }
    // LTV réel
    const borrowedClamped = Math.min(Math.max(vals.borrowed, 0), borrowable);
    realLTVEl.value = calcRealLTV(depositUSDC, borrowedClamped).toFixed(2);

    // Génération du tableau de répartition mensuelle et stockage des PnL
    const vaultShare = splitSlider && !isNaN(splitSlider.value) ? parseFloat(splitSlider.value) / 100 : 1;
    generateMonthlyBreakdown(vals, recurringTopup, vaultShare);

    const { breakEven } = computeSeries(vals);
    breakEvenEl.textContent = `Break-even point: ${breakEven}`;

    // Recalcule netGain et finalCapital à partir de pnlByMonth
    const netGain = Array.isArray(window.pnlByMonth) ? window.pnlByMonth.at(-1) : 0;
    const finalCapital = depositUSDC + netGain;
    // New: calculate total contributed, net real gain, net real pct, update DOM
    const totalContributed = depositUSDC + (recurringTopup * (vals.unit === 'months' ? vals.duration : vals.duration * 12));
    const netRealGain = finalCapital - totalContributed;
    const netRealPct = totalContributed > 0 ? (netRealGain / totalContributed) * 100 : 0;
    const totalContributedEl = document.getElementById('totalContributed');
    if (totalContributedEl) {
      totalContributedEl.textContent = `${totalContributed.toFixed(2)} USDC`;
    }
    // netGainEl.textContent = `${netGain.toFixed(2)} USDC (${netPct.toFixed(2)}%)`; // replaced below
    netGainEl.textContent = `${netRealGain.toFixed(2)} USDC (${netRealPct.toFixed(2)}%)`;
    styleBorder(netGainEl, netRealGain);
    finalCapitalEl.textContent = `${finalCapital.toFixed(2)} USDC`;
    styleBorder(finalCapitalEl, finalCapital - depositUSDC);
    // Mise à jour du graphique avec les valeurs mensuelles cumulées
    drawPNLChart();
  }

  /**
   * Génère un tableau mois par mois avec intérêts et PnL cumulé
   */
  function generateMonthlyBreakdown(vals, recurringTopup, vaultShare = 1) {
    const depositUSDC = vals.C0;
    const borrowable = calcBorrowable(depositUSDC, vals.LTV);
    const borrowedAmt = Math.min(Math.max(vals.borrowed, 0), borrowable);
    const loanShare = 1 - vaultShare;
    // Initialisation du tableau global de PnL mensuel cumulé
    window.pnlByMonth = [];
    const monthsCount = vals.unit === 'months' ? vals.duration : vals.duration * 12;
    const depositMonthly = depositUSDC * vals.r_yield / 12;
    let prevVaultBal = borrowedAmt;
    let currentDebt = borrowedAmt;
    let totalLoanCost = 0;
    let html = `<div class="table-responsive"><table class="table table-sm"><thead><tr>` +
      `<th>Month</th><th>Collateral yield</th><th>Vault return</th>` +
      `<th>Loan cost</th><th>Net PnL (cumulative)</th><th>Net capital</th></tr></thead><tbody>`;
    for (let m = 1; m <= monthsCount; m++) {
      const monthlyVaultInjection = recurringTopup * vaultShare;
      const monthlyLoanRepayment = recurringTopup * loanShare;
      const monthlyInterest = currentDebt * vals.r_loan / 12;
      const monthlyDebtPayment = Math.min(currentDebt, monthlyLoanRepayment);
      currentDebt = Math.max(0, currentDebt + monthlyInterest - monthlyDebtPayment);
      totalLoanCost += monthlyInterest;

      const vaultBal = borrowedAmt * Math.pow(1 + vals.r_vault / 12, m) +
        monthlyVaultInjection * ((Math.pow(1 + vals.r_vault / 12, m) - 1) / (vals.r_vault / 12));
      const vaultMonthly = vaultBal - prevVaultBal;
      prevVaultBal = vaultBal;

      const depositCum = depositMonthly * m;
      const vaultCum = vaultBal - borrowedAmt;
      const netCum = depositCum + vaultCum - totalLoanCost;
      const netCapital = depositUSDC + netCum;

      // Stockage pour le graphique mensuel
      window.pnlByMonth.push(netCum);

      const rowClass = netCum >= 0 ? 'table-success' : 'table-danger';
      html += `<tr class="${rowClass}">` +
        `<td>${m}</td>` +
        `<td>${depositMonthly.toFixed(2)}</td>` +
        `<td>${vaultMonthly.toFixed(2)}</td>` +
        `<td>${monthlyInterest.toFixed(2)}</td>` +
        `<td>${netCum.toFixed(2)}</td>` +
        `<td>${netCapital.toFixed(2)}</td>` +
        `</tr>`;
    }
    html += `</tbody></table></div>`;
    document.getElementById('monthlyBreakdown').innerHTML = html;
  }
  Object.values(inputs).forEach(el => {
    if (el && el !== inputs.vaultTopupInput) {
      el.addEventListener('input', update);
    }
  });
  if (inputs.vaultTopupInput) {
    inputs.vaultTopupInput.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      setRecurringTopup(isNaN(val) ? 0 : val);
      // Force an update only if value is non-negative
      if (!isNaN(val) && val >= 0) {
        update();
      }
    });
  }
  const initVal = parseFloat(inputs.vaultTopupInput.value);
  setRecurringTopup(isNaN(initVal) ? 0 : initVal);
  splitSlider.addEventListener('input', () => {
    updateSplitLabel(splitSlider.valueAsNumber || 100);
    update();
  });

  /**
   * Met à jour le Chart.js avec les valeurs mensuelles cumulées
   */
  function drawPNLChart() {
    const data = Array.isArray(window.pnlByMonth) ? window.pnlByMonth : [];
    const labels = data.map((_, i) => `${i + 1} month${i + 1 > 1 ? 's' : ''}`);
    // Détruire l'ancien chart pour réinitialiser le canvas
    if (chartInstance) {
      chartInstance.destroy();
    }
    const ctx = document.getElementById('pnlChart').getContext('2d');
    chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Net PnL (cumulative)',
          data: data,
          borderColor: '#0d6efd',
          backgroundColor: 'rgba(13,110,253,0.2)',
          fill: true,
          tension: 0.2,
          pointRadius: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { title: { display: true, text: 'Month' } },
          y: { title: { display: true, text: 'USDC' }, beginAtZero: true }
        }
      }
      });
  }

  update();
});