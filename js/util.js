const MONTH_NAMES = ['Január', 'Február', 'Marec', 'Apríl', 'Máj', 'Jún', 'Júl', 'August', 'September', 'Október', 'November', 'December'];

export function monthLabel(month) {
  const [y, m] = month.split('-');
  return `${MONTH_NAMES[+m - 1]} ${y}`;
}

export function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const fmt = new Intl.NumberFormat('sk-SK', { style: 'currency', currency: 'EUR' });
export const eur = v => fmt.format(v);

export function fmtDate(iso) {
  if (!iso || iso === 'unknown') return '';
  const [y, m, d] = iso.split('-');
  return `${+d}. ${+m}. ${y}`;
}

export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// bezpečné skladanie HTML
export function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// suma zadaná ako "12,50" aj "12.50"
export function parseAmount(str) {
  const v = parseFloat(String(str).replace(',', '.').replace(/\s/g, ''));
  return isNaN(v) ? null : Math.round(v * 100) / 100;
}
