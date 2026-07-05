import * as db from './db.js';
import { renderMonth } from './views/month.js';
import { renderHistory } from './views/history.js';
import { renderCharts } from './views/charts.js';
import { renderSettings } from './views/settings.js';
import { el, esc } from './util.js';

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

function showLogin(message) {
  document.body.classList.remove('authed');
  const root = document.getElementById('view');
  root.innerHTML = '';
  const form = el(`
    <form class="login card">
      <h2>💶 Financie</h2>
      <p class="muted">Prihlás sa pre prístup k výdavkom.</p>
      <input name="email" type="text" placeholder="Meno" autocomplete="username" required>
      <input name="password" type="password" placeholder="Heslo" autocomplete="current-password" required>
      <button class="primary" type="submit">Prihlásiť sa</button>
      <p class="login-error">${message ? esc(message) : ''}</p>
    </form>`);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = form.querySelector('button');
    btn.disabled = true;
    form.querySelector('.login-error').textContent = '';
    try {
      await db.signIn(form.email.value.trim(), form.password.value);
      await boot();
    } catch (err) {
      form.querySelector('.login-error').textContent = 'Prihlásenie zlyhalo: ' + err.message;
      btn.disabled = false;
    }
  });
  root.appendChild(form);
}

async function renderAuthBar() {
  const bar = document.getElementById('auth-bar');
  const email = await db.currentEmail();
  const who = email.replace(/@financie\.local$/, '');
  // téma podľa prihláseného účtu: macka → girlypop, inak Midnight
  document.body.classList.toggle('theme-girly', /^(macka|marcel)/i.test(who));
  bar.innerHTML = `<span class="who">${esc(who)}</span>
    <button id="refresh" title="Načítať najnovšie dáta">🔄</button>
    <button id="logout">Odhlásiť</button>`;
  bar.querySelector('#logout').addEventListener('click', async () => { await db.signOut(); });
  bar.querySelector('#refresh').addEventListener('click', async () => {
    const btn = bar.querySelector('#refresh');
    btn.classList.add('spin');
    try { await db.init(); show(current); } finally { btn.classList.remove('spin'); }
  });
}

async function boot() {
  const session = await db.getSession();
  if (!session) { showLogin(); return; }
  try {
    await db.init();
  } catch (err) {
    showLogin('Nepodarilo sa načítať dáta: ' + err.message);
    return;
  }
  document.body.classList.add('authed');
  await renderAuthBar();
  show(current);
}

// odhlásenie v inej karte / vypršanie session
db.onAuth(session => { if (!session) showLogin(); });

boot();
