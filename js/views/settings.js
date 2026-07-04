import * as db from '../db.js';
import { esc, el } from '../util.js';

export function renderSettings(root) {
  const people = db.getPeople();
  const cats = db.getCategories();
  const merchants = db.getMerchants();

  root.appendChild(el(`
  <div class="settings-view">
    <section class="card">
      <h3>Predvolený pomer</h3>
      <div class="ratio-slider">
        <div class="ratio-ends">
          <span>${esc(people.S)} <b id="pct-s">${Math.round(db.getDefaultRatioS() * 100)} %</b></span>
          <span><b id="pct-m">${100 - Math.round(db.getDefaultRatioS() * 100)} %</b> ${esc(people.M)}</span>
        </div>
        <input id="def-ratio" type="range" min="0" max="100" step="5" value="${Math.round(db.getDefaultRatioS() * 100)}">
      </div>
      <p class="muted">Používa sa pre otvorené mesiace. Pri označení mesiaca ako vyplateného sa pomer preň uzamkne — neskoršia zmena už staré mesiace neprepočíta.</p>
    </section>

    <section class="card">
      <h3>Kategórie</h3>
      <div id="cat-list">
        ${cats.map(c => `
          <div class="cat-row" data-id="${c.id}">
            <input type="color" value="${c.color}" title="Farba">
            <input class="cat-name" value="${esc(c.name)}">
            ${c.id !== 'ostatne' ? '<button class="del" title="Zmazať (položky prejdú do Ostatné)">×</button>' : '<span class="muted">predvolená</span>'}
          </div>`).join('')}
      </div>
      <form id="cat-add" class="add-row" autocomplete="off">
        <input type="color" name="color" value="#20c997">
        <input name="name" placeholder="Nová kategória" required>
        <button class="primary">+</button>
      </form>
    </section>

    <section class="card">
      <h3>Obchody → kategórie <span class="muted">(auto-kategorizácia pri zadávaní)</span></h3>
      <input id="m-search" type="search" placeholder="Hľadať obchod…">
      <div id="merchant-list-box">
        ${merchants.map(m => merchantRow(m, cats)).join('')}
      </div>
    </section>

    <section class="card">
      <h3>Záloha dát</h3>
      <div class="settings-row">
        <button id="export" class="primary">Exportovať JSON</button>
        <label class="file-btn">Importovať JSON<input id="import" type="file" accept=".json" hidden></label>
      </div>
      <p class="muted">Dáta sú v cloude (Supabase). Export slúži ako offline záloha.</p>
    </section>
  </div>`));

  // predvolený pomer (posuvník so živým zobrazením percent)
  const ratio = root.querySelector('#def-ratio');
  ratio.addEventListener('input', () => {
    const v = +ratio.value;
    root.querySelector('#pct-s').textContent = `${v} %`;
    root.querySelector('#pct-m').textContent = `${100 - v} %`;
  });
  ratio.addEventListener('change', () => db.setDefaultRatioS(+ratio.value / 100));

  // kategórie
  root.querySelectorAll('.cat-row').forEach(row => {
    const id = row.dataset.id;
    row.querySelector('input[type=color]').addEventListener('change', e => db.updateCategory(id, { color: e.target.value }));
    row.querySelector('.cat-name').addEventListener('change', e => db.updateCategory(id, { name: e.target.value.trim() || id }));
    const del = row.querySelector('.del');
    if (del) del.addEventListener('click', () => {
      if (confirm('Zmazať kategóriu? Jej položky sa presunú do Ostatné.')) {
        db.deleteCategory(id);
        rerender(root);
      }
    });
  });
  root.querySelector('#cat-add').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target;
    if (db.addCategory(f.name.value.trim(), f.color.value)) rerender(root);
    else alert('Kategória s takým názvom už existuje.');
  });

  // obchody
  const box = root.querySelector('#merchant-list-box');
  box.addEventListener('change', e => {
    const row = e.target.closest('.merchant-row');
    if (row && e.target.tagName === 'SELECT') db.setMerchantCategory(row.dataset.name, e.target.value);
  });
  box.addEventListener('click', e => {
    if (e.target.classList.contains('del')) {
      db.deleteMerchant(e.target.closest('.merchant-row').dataset.name);
      rerender(root);
    }
  });
  root.querySelector('#m-search').addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase();
    box.querySelectorAll('.merchant-row').forEach(r =>
      r.style.display = r.dataset.name.toLowerCase().includes(q) ? '' : 'none');
  });

  // záloha
  root.querySelector('#export').addEventListener('click', () => {
    const blob = new Blob([db.exportJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `financie-zaloha-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  root.querySelector('#import').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await db.importJson(await file.text());
      alert('Import hotový.');
      rerender(root);
    } catch (err) {
      alert('Import zlyhal: ' + err.message);
    }
  });
}

function merchantRow(m, cats) {
  return `<div class="merchant-row" data-name="${esc(m.name)}">
    <span>${esc(m.name)}</span>
    <select>${cats.map(c => `<option value="${c.id}" ${m.category === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
    <button class="del" title="Odstrániť mapovanie">×</button>
  </div>`;
}

function rerender(root) {
  root.innerHTML = '';
  renderSettings(root);
}
