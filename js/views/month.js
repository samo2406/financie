import * as db from '../db.js';
import { monthLabel, currentMonth, shiftMonth, eur, fmtDate, todayIso, esc, el, parseAmount } from '../util.js';

let month = currentMonth();

export function renderMonth(root) {
  const people = db.getPeople();
  const cats = db.getCategories();
  const expenses = db.expensesForMonth(month);
  const settlement = db.getSettlement(month);
  const ratioS = settlement ? settlement.ratioS : db.getDefaultRatioS();

  const sumS = round2(expenses.filter(e => e.person === 'S').reduce((a, e) => a + e.amount, 0));
  const sumM = round2(expenses.filter(e => e.person === 'M').reduce((a, e) => a + e.amount, 0));
  const total = round2(sumS + sumM);
  const shareS = total * ratioS;
  const shareM = total * (1 - ratioS);
  const paysS = Math.max(shareS - sumS, 0);
  const paysM = Math.max(shareM - sumM, 0);

  const catOptions = cats.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  const merchantList = db.getMerchants().map(m => `<option value="${esc(m.name)}">`).join('');

  root.appendChild(el(`
  <div class="month-view">
    <div class="month-nav">
      <button class="nav-btn" data-shift="-1">‹</button>
      <h2>${monthLabel(month)}</h2>
      <button class="nav-btn" data-shift="1">›</button>
    </div>

    <div class="columns">
      ${personColumn('S', people.S, expenses, cats)}
      ${personColumn('M', people.M, expenses, cats)}
    </div>
    <datalist id="merchant-list">${merchantList}</datalist>

    <section class="settlement card">
      <h3>Vyúčtovanie</h3>
      <div class="settle-grid">
        <div class="stat"><span>Spolu</span><strong>${eur(total)}</strong></div>
        <div class="stat"><span>${esc(people.S)} zaplatil</span><strong>${eur(sumS)}</strong></div>
        <div class="stat"><span>${esc(people.M)} zaplatila</span><strong>${eur(sumM)}</strong></div>
        <div class="stat"><span>Pomer</span>
          <strong class="ratio-edit">
            <input type="number" id="ratio-s" min="0" max="100" step="5" value="${Math.round(ratioS * 100)}"> /
            <span id="ratio-m">${Math.round((1 - ratioS) * 100)}</span> %
          </strong>
        </div>
        <div class="stat"><span>Podiel ${esc(people.S)}</span><strong>${eur(shareS)}</strong></div>
        <div class="stat"><span>Podiel ${esc(people.M)}</span><strong>${eur(shareM)}</strong></div>
      </div>
      <div class="settle-result">
        ${total === 0 ? '<p class="muted">Zatiaľ žiadne výdavky.</p>'
          : paysS > 0.005 ? `<p><strong>${esc(people.S)}</strong> doplatí <strong class="owe">${eur(paysS)}</strong></p>`
          : paysM > 0.005 ? `<p><strong>${esc(people.M)}</strong> doplatí <strong class="owe">${eur(paysM)}</strong></p>`
          : '<p>Vyrovnané, nikto nič nedopláca. 🎉</p>'}
        ${settlement && settlement.settledAt
          ? `<p class="settled">✅ Vyplatené ${settlement.settledAt === 'unknown' ? '' : fmtDate(settlement.settledAt)}
             <button id="unsettle" class="link-btn">zrušiť</button></p>`
          : total > 0 ? `<button id="settle" class="primary">Označiť ako vyplatené</button>` : ''}
      </div>
    </section>
  </div>`));

  function personColumn(personKey, name, all, cats) {
    const list = all.filter(e => e.person === personKey);
    const rows = list.map(e => {
      const c = db.getCategory(e.category);
      return `<tr data-id="${e.id}">
        <td>${esc(e.merchant) || '<span class="muted">—</span>'}</td>
        <td><span class="chip" style="--c:${c ? c.color : '#888'}">${c ? esc(c.name) : '?'}</span></td>
        <td class="num">${eur(e.amount)}</td>
        <td><button class="del" title="Zmazať">×</button></td>
      </tr>`;
    }).join('');
    return `
    <section class="card person-col" data-person="${personKey}">
      <h3>${esc(name)}</h3>
      <table class="expenses">
        <tbody>${rows || '<tr><td colspan="4" class="muted empty">Žiadne výdavky</td></tr>'}</tbody>
      </table>
      <form class="add-row" autocomplete="off">
        <input name="merchant" list="merchant-list" placeholder="Obchod" required>
        <input name="amount" inputmode="decimal" placeholder="0,00 €" required>
        <select name="category">${catOptions}</select>
        <button class="primary" title="Pridať (Enter)">+</button>
      </form>
    </section>`;
  }

  // --- navigácia mesiacov ---
  root.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => {
    month = shiftMonth(month, +b.dataset.shift);
    rerender(root);
  }));

  // --- pridávanie ---
  root.querySelectorAll('.add-row').forEach(form => {
    const person = form.closest('.person-col').dataset.person;
    const merchantInput = form.querySelector('[name=merchant]');
    const catSelect = form.querySelector('[name=category]');

    // auto-kategorizácia podľa obchodu
    merchantInput.addEventListener('change', () => {
      const cat = db.merchantCategory(merchantInput.value);
      if (cat) catSelect.value = cat;
    });

    form.addEventListener('submit', e => {
      e.preventDefault();
      const amount = parseAmount(form.amount.value);
      if (amount === null || !merchantInput.value.trim()) return;
      db.addExpense({ month, person, merchant: merchantInput.value, amount, category: catSelect.value });
      rerender(root, () => {
        // po pridaní rovno fokus na ďalší zápis v tom istom stĺpci
        root.querySelector(`.person-col[data-person=${person}] [name=merchant]`).focus();
      });
    });
  });

  // --- mazanie ---
  root.querySelectorAll('.expenses .del').forEach(btn => btn.addEventListener('click', () => {
    db.deleteExpense(+btn.closest('tr').dataset.id);
    rerender(root);
  }));

  // --- pomer ---
  const ratioInput = root.querySelector('#ratio-s');
  ratioInput.addEventListener('change', () => {
    const v = Math.min(100, Math.max(0, +ratioInput.value || 0));
    db.upsertSettlement(month, { ratioS: v / 100 });
    rerender(root);
  });

  // --- vyplatené ---
  const settleBtn = root.querySelector('#settle');
  if (settleBtn) settleBtn.addEventListener('click', () => {
    db.upsertSettlement(month, { ratioS, settledAt: todayIso() });
    rerender(root);
  });
  const unsettleBtn = root.querySelector('#unsettle');
  if (unsettleBtn) unsettleBtn.addEventListener('click', () => {
    db.upsertSettlement(month, { settledAt: null });
    rerender(root);
  });
}

function rerender(root, after) {
  root.innerHTML = '';
  renderMonth(root);
  if (after) after();
}

const round2 = v => Math.round(v * 100) / 100;
