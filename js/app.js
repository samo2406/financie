import * as db from './db.js';
import { renderMonth } from './views/month.js';
import { renderHistory } from './views/history.js';
import { renderCharts } from './views/charts.js';
import { renderSettings } from './views/settings.js';

const VIEWS = { month: renderMonth, history: renderHistory, charts: renderCharts, settings: renderSettings };
let current = 'month';

function show(view) {
  current = view;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  const root = document.getElementById('view');
  root.innerHTML = '';
  VIEWS[view](root);
}

document.getElementById('tabs').addEventListener('click', e => {
  const btn = e.target.closest('button[data-view]');
  if (btn) show(btn.dataset.view);
});

db.init().then(() => show(current)).catch(err => {
  document.getElementById('view').innerHTML = `<p class="error">Nepodarilo sa načítať dáta: ${err.message}</p>`;
});
