import * as db from '../db.js';
import { monthLabel, eur, esc, el } from '../util.js';

let yearFilter = '';
let charts = [];

export function renderCharts(root) {
  charts.forEach(c => c.destroy());
  charts = [];

  const cats = db.getCategories();
  const expenses = db.getExpenses();
  const years = [...new Set(expenses.map(e => e.month.slice(0, 4)))].sort();

  root.appendChild(el(`
  <div class="charts-view">
    <div class="filters card">
      <select id="c-year">
        <option value="">Celé obdobie</option>
        ${years.map(y => `<option value="${y}" ${yearFilter === y ? 'selected' : ''}>${y}</option>`).join('')}
      </select>
    </div>
    <section class="card"><h3>Mesačné výdavky</h3><canvas id="ch-monthly"></canvas></section>
    <section class="card"><h3>Kategórie po mesiacoch</h3><canvas id="ch-stacked"></canvas></section>
    <div class="chart-pair">
      <section class="card"><h3>Rozdelenie podľa kategórií</h3><canvas id="ch-donut"></canvas></section>
      <section class="card"><h3>Kto koľko zaplatil</h3><canvas id="ch-person"></canvas></section>
    </div>
  </div>`));

  root.querySelector('#c-year').addEventListener('change', e => {
    yearFilter = e.target.value;
    root.innerHTML = '';
    renderCharts(root);
  });

  const filtered = yearFilter ? expenses.filter(e => e.month.startsWith(yearFilter)) : expenses;
  const monthsList = [...new Set(filtered.map(e => e.month))].sort();
  const labels = monthsList.map(m => monthLabel(m));

  const sumBy = (pred) => monthsList.map(m =>
    round2(filtered.filter(e => e.month === m && pred(e)).reduce((a, e) => a + e.amount, 0)));

  const totals = sumBy(() => true);
  const avg = totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : 0;

  const gridColor = 'rgba(255,255,255,.07)';
  const tickColor = '#8b93a7';
  Chart.defaults.color = tickColor;
  Chart.defaults.font.family = "'Segoe UI', system-ui, sans-serif";

  const scale = { grid: { color: gridColor }, ticks: { color: tickColor } };
  const eurTip = ctx => ` ${ctx.dataset.label || ''}: ${eur(ctx.parsed.y ?? ctx.parsed)}`;

  // 1. mesačné totály + priemer
  charts.push(new Chart(root.querySelector('#ch-monthly'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Spolu', data: totals, backgroundColor: '#4dabf7', borderRadius: 4 },
        { label: `Priemer (${eur(avg)})`, data: totals.map(() => round2(avg)), type: 'line', borderColor: '#ffd43b', borderDash: [6, 4], pointRadius: 0, borderWidth: 2 },
      ],
    },
    options: { scales: { x: scale, y: scale }, plugins: { tooltip: { callbacks: { label: eurTip } } } },
  }));

  // 2. stacked podľa kategórií
  charts.push(new Chart(root.querySelector('#ch-stacked'), {
    type: 'bar',
    data: {
      labels,
      datasets: cats.map(c => ({
        label: c.name,
        data: sumBy(e => e.category === c.id),
        backgroundColor: c.color,
        borderRadius: 2,
      })),
    },
    options: { scales: { x: { ...scale, stacked: true }, y: { ...scale, stacked: true } }, plugins: { tooltip: { callbacks: { label: eurTip } } } },
  }));

  // 3. donut kategórie
  const catTotals = cats.map(c => round2(filtered.filter(e => e.category === c.id).reduce((a, e) => a + e.amount, 0)));
  charts.push(new Chart(root.querySelector('#ch-donut'), {
    type: 'doughnut',
    data: { labels: cats.map(c => c.name), datasets: [{ data: catTotals, backgroundColor: cats.map(c => c.color), borderWidth: 0 }] },
    options: { plugins: { tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${eur(ctx.parsed)}` } } } },
  }));

  // 4. porovnanie osôb po mesiacoch
  const people = db.getPeople();
  charts.push(new Chart(root.querySelector('#ch-person'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: people.S, data: sumBy(e => e.person === 'S'), backgroundColor: '#4dabf7', borderRadius: 2 },
        { label: people.M, data: sumBy(e => e.person === 'M'), backgroundColor: '#f783ac', borderRadius: 2 },
      ],
    },
    options: { scales: { x: scale, y: scale }, plugins: { tooltip: { callbacks: { label: eurTip } } } },
  }));
}

const round2 = v => Math.round(v * 100) / 100;
