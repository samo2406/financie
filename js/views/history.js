import * as db from '../db.js';
import { monthLabel, eur, esc, el } from '../util.js';

const filter = { month: '', person: '', category: '', search: '' };

export function renderHistory(root) {
  const people = db.getPeople();
  const cats = db.getCategories();
  const allMonths = db.months().slice().reverse();

  root.appendChild(el(`
  <div class="history-view">
    <div class="filters card">
      <select id="f-month">
        <option value="">Všetky mesiace</option>
        ${allMonths.map(m => `<option value="${m}" ${filter.month === m ? 'selected' : ''}>${monthLabel(m)}</option>`).join('')}
      </select>
      <select id="f-person">
        <option value="">Obaja</option>
        <option value="S" ${filter.person === 'S' ? 'selected' : ''}>${esc(people.S)}</option>
        <option value="M" ${filter.person === 'M' ? 'selected' : ''}>${esc(people.M)}</option>
      </select>
      <select id="f-category">
        <option value="">Všetky kategórie</option>
        ${cats.map(c => `<option value="${c.id}" ${filter.category === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
      </select>
      <input id="f-search" type="search" placeholder="Hľadať obchod…" value="${esc(filter.search)}">
    </div>
    <div id="history-results"></div>
  </div>`));

  const results = root.querySelector('#history-results');

  const apply = () => {
    filter.month = root.querySelector('#f-month').value;
    filter.person = root.querySelector('#f-person').value;
    filter.category = root.querySelector('#f-category').value;
    filter.search = root.querySelector('#f-search').value;
    renderResults(results, people);
  };

  ['#f-month', '#f-person', '#f-category'].forEach(sel =>
    root.querySelector(sel).addEventListener('change', apply));
  root.querySelector('#f-search').addEventListener('input', apply);

  renderResults(results, people);
}

function renderResults(container, people) {
  let list = db.getExpenses();
  if (filter.month) list = list.filter(e => e.month === filter.month);
  if (filter.person) list = list.filter(e => e.person === filter.person);
  if (filter.category) list = list.filter(e => e.category === filter.category);
  if (filter.search.trim()) {
    const q = filter.search.trim().toLowerCase();
    list = list.filter(e => e.merchant.toLowerCase().includes(q));
  }
  list = list.slice().sort((a, b) => b.month.localeCompare(a.month) || b.id - a.id);

  const total = list.reduce((a, e) => a + e.amount, 0);
  const count = list.length;

  // limit vykreslenia — pri celej histórii ukáž prvých 300, súčty rátame zo všetkého
  const shown = list.slice(0, 300);

  container.innerHTML = `
    <div class="summary-bar">
      <span>${count} položiek</span>
      <strong>${eur(total)}</strong>
    </div>
    <table class="expenses full">
      <thead><tr><th>Mesiac</th><th>Kto</th><th>Obchod</th><th>Kategória</th><th class="num">Suma</th></tr></thead>
      <tbody>
        ${shown.map(e => {
          const c = db.getCategory(e.category);
          return `<tr>
            <td>${monthLabel(e.month)}</td>
            <td>${esc(people[e.person] || e.person)}</td>
            <td>${esc(e.merchant) || '—'}</td>
            <td><span class="chip" style="--c:${c ? c.color : '#888'}">${c ? esc(c.name) : '?'}</span></td>
            <td class="num">${eur(e.amount)}</td>
          </tr>`;
        }).join('') || '<tr><td colspan="5" class="muted empty">Nič sa nenašlo</td></tr>'}
      </tbody>
    </table>
    ${count > shown.length ? `<p class="muted center">Zobrazených prvých ${shown.length} z ${count} — spresni filter.</p>` : ''}`;
}
