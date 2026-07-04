import * as db from '../db.js';
import { monthShort, currentMonth, shiftMonth, eur, fmtDate, todayIso, esc, el, parseAmount, catIcon, initial } from '../util.js';

let month = currentMonth();

export function renderMonth(root) {
  const people = db.getPeople();
  const cats = db.getCategories();
  const expenses = db.expensesForMonth(month);
  // uzavretý mesiac drží pomer odfotený pri vyúčtovaní; otvorený berie živý pomer z nastavení
  const settlement = db.getSettlement(month);
  const locked = !!(settlement && settlement.settledAt);
  const ratioS = locked ? settlement.ratioS : db.getDefaultRatioS();

  const sumS = round2(expenses.filter(e => e.person === 'S').reduce((a, e) => a + e.amount, 0));
  const sumM = round2(expenses.filter(e => e.person === 'M').reduce((a, e) => a + e.amount, 0));
  const total = round2(sumS + sumM);
  const shareS = total * ratioS;
  const shareM = total * (1 - ratioS);
  const paysS = Math.max(shareS - sumS, 0);
  const paysM = Math.max(shareM - sumM, 0);
  const pctS = Math.round(ratioS * 100);

  const catOptions = cats.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  // do našepkávania nedávame jednorazové obchody (kategória Ostatné)
  const merchantList = db.getMerchants().filter(m => m.category !== 'ostatne').map(m => `<option value="${esc(m.name)}">`).join('');

  root.appendChild(el(`
  <div class="month-view">
    <div class="month-nav">
      <div class="month-carousel">
        ${Array.from({ length: 9 }, (_, i) => {
          const m = shiftMonth(month, i - 4);
          return `<button class="mon-chip${i === 4 ? ' active' : ''}" data-month="${m}">${monthShort(m)}</button>`;
        }).join('')}
      </div>
    </div>

    <div class="columns">
      ${personColumn('S', people.S, sumS, expenses, cats)}
      ${personColumn('M', people.M, sumM, expenses, cats)}
    </div>
    <datalist id="merchant-list">${merchantList}</datalist>

    <section class="settlement card">
      <div class="settle-total">
        <span>Celkové výdavky spolu</span>
        <strong>${eur(total)}</strong>
      </div>

      <div class="settle-hero">
        ${settleBar('S', people.S, sumS, shareS)}
        ${settleBar('M', people.M, sumM, shareM)}
      </div>

      <div class="settle-result">
        ${total === 0 ? '<p class="muted">Zatiaľ žiadne výdavky.</p>'
          : paysS > 0.005 ? `<p><strong>${esc(people.S)}</strong> doplatí <strong class="owe">${eur(paysS)}</strong></p>`
          : paysM > 0.005 ? `<p><strong>${esc(people.M)}</strong> doplatí <strong class="owe">${eur(paysM)}</strong></p>`
          : '<p>Vyrovnané, nikto nič nedopláca. 🎉</p>'}
        <div class="settle-meta">
          Pomer <b>${pctS} / ${100 - pctS} %</b>
          · ${locked
            ? `uzamknuté${settlement.settledAt === 'unknown' ? '' : ' ' + fmtDate(settlement.settledAt)}`
            : 'podľa nastavení'}
        </div>
        ${locked
          ? `<p class="settled">✅ Vyplatené${settlement.settledAt === 'unknown' ? '' : ' ' + fmtDate(settlement.settledAt)}
             <button id="unsettle" class="link-btn">zrušiť</button></p>`
          : total > 0 ? `<button id="settle" class="primary">Označiť ako vyplatené</button>` : ''}
      </div>
    </section>
  </div>`));

  function personColumn(personKey, name, sum, all, cats) {
    const list = all.filter(e => e.person === personKey);
    const rows = list.map(e => {
      const c = db.getCategory(e.category);
      const color = c ? c.color : '#868e96';
      return `<tr data-id="${e.id}">
        <td class="cell-icon"><span class="cat-ic" style="--c:${color}">${catIcon(e.category)}</span></td>
        <td class="cell-merchant" title="Dvojklik pre úpravu">${esc(e.merchant) || '<span class="muted">—</span>'}</td>
        <td class="cell-cat" title="Klik pre zmenu kategórie"><span class="chip" style="--c:${color}">${c ? esc(c.name) : '?'}</span></td>
        <td class="num cell-amount" title="Dvojklik pre úpravu">${eur(e.amount)}</td>
        <td><button class="del" title="Zmazať">×</button></td>
      </tr>`;
    }).join('');
    return `
    <section class="card person-col" data-person="${personKey}">
      <div class="pcol-head">
        <span class="av av-${personKey}">${initial(name)}</span>
        <span class="pcol-name">${esc(name)}</span>
        <span class="pcol-sub">${eur(sum)}</span>
      </div>
      <table class="expenses">
        <tbody>${rows || '<tr><td colspan="5" class="muted empty">Žiadne výdavky</td></tr>'}</tbody>
      </table>
      <form class="add-row" autocomplete="off">
        <input name="merchant" list="merchant-list" placeholder="Obchod" required>
        <input name="amount" inputmode="decimal" placeholder="0,00 €" required>
        <select name="category">${catOptions}</select>
        <button class="primary" title="Pridať (Enter)">+</button>
      </form>
    </section>`;
  }

  // --- navigácia mesiacov (carousel) ---
  root.querySelectorAll('.mon-chip').forEach(b => b.addEventListener('click', () => {
    month = b.dataset.month;
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
    db.deleteExpense(btn.closest('tr').dataset.id);
    rerender(root);
  }));

  // --- inline úprava zapísaných výdavkov ---
  const findExpense = id => db.getExpenses().find(e => e.id === id);

  // dvojklik na text/sumu → políčko; Enter alebo klik mimo uloží, Esc zruší
  function editCell(td, buildInput, commit) {
    const id = td.closest('tr').dataset.id;
    const e = findExpense(id);
    if (!e) return;
    td.innerHTML = buildInput(e);
    const inp = td.querySelector('input');
    inp.focus();
    inp.select();
    let cancel = false;
    inp.addEventListener('keydown', ev => {
      if (ev.key === 'Enter') inp.blur();
      else if (ev.key === 'Escape') { cancel = true; inp.blur(); }
    });
    inp.addEventListener('blur', () => {
      if (!cancel) commit(id, e, inp.value);
      rerender(root);
    }, { once: true });
  }

  root.querySelectorAll('td.cell-merchant').forEach(td => td.addEventListener('dblclick', () => {
    editCell(td,
      e => `<input class="inline-edit" list="merchant-list" value="${esc(e.merchant)}">`,
      (id, e, value) => {
        const val = value.trim();
        if (!val || val === e.merchant) return;
        const merchant = db.merchantCanonical(val);
        const patch = { merchant };
        const cat = db.merchantCategory(merchant);
        if (cat) patch.category = cat;
        db.updateExpense(id, patch);
      });
  }));

  root.querySelectorAll('td.cell-amount').forEach(td => td.addEventListener('dblclick', () => {
    editCell(td,
      e => `<input class="inline-edit num" inputmode="decimal" value="${String(e.amount).replace('.', ',')}">`,
      (id, e, value) => {
        const val = parseAmount(value);
        if (val !== null && val !== e.amount) db.updateExpense(id, { amount: val });
      });
  }));

  root.querySelectorAll('td.cell-cat').forEach(td => td.addEventListener('click', () => {
    const id = td.closest('tr').dataset.id;
    const e = findExpense(id);
    if (!e) return;
    td.innerHTML = `<select class="inline-edit">${cats.map(c =>
      `<option value="${c.id}" ${c.id === e.category ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`;
    const sel = td.querySelector('select');
    sel.focus();
    let done = false;
    sel.addEventListener('change', () => { done = true; db.updateExpense(id, { category: sel.value }); rerender(root); });
    sel.addEventListener('blur', () => { if (!done) rerender(root); }, { once: true });
  }));

  // --- vyplatené: odfotí aktuálny pomer z nastavení a uzamkne ho pre tento mesiac ---
  const settleBtn = root.querySelector('#settle');
  if (settleBtn) settleBtn.addEventListener('click', () => {
    db.upsertSettlement(month, { ratioS: db.getDefaultRatioS(), settledAt: todayIso() });
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

function settleBar(key, name, paid, share) {
  const net = round2(paid - share);
  const fill = share > 0.005 ? Math.min(100, Math.max(0, Math.round((paid / share) * 100))) : (paid > 0 ? 100 : 0);
  const neg = net < -0.005;
  return `
  <div class="sbar-row">
    <span class="av av-${key}">${initial(name)}</span>
    <div class="sbar-mid">
      <div class="sbar-top"><span class="sbar-name">${esc(name)}</span>
        <small>zaplatené ${eur(paid)} · podiel ${eur(share)}</small></div>
      <div class="bar"><i class="fill-${key}" style="width:${fill}%"></i></div>
    </div>
    <span class="sbar-net ${neg ? 'neg' : 'pos'}">${neg ? '−' : '+'}${eur(Math.abs(net))}</span>
  </div>`;
}

const round2 = v => Math.round(v * 100) / 100;
