// Dátová vrstva. Aktuálne localStorage seedovaný z data/seed.json;
// rovnaké API neskôr implementuje Supabase backend.
const LS_KEY = 'lovky-data-v1';

let state = null;
const listeners = [];

export async function init() {
  const raw = localStorage.getItem(LS_KEY);
  if (raw) {
    state = JSON.parse(raw);
    return;
  }
  // seed nie je súčasťou verejného repa — bez neho sa začína naprázdno
  const res = await fetch('data/seed.json').catch(() => null);
  state = res && res.ok ? await res.json() : emptyState();
  state.nextId = state.expenses.reduce((m, e) => Math.max(m, e.id), 0) + 1;
  persist();
}

function emptyState() {
  return {
    people: { S: 'Samuel', M: 'Marcelka' },
    defaultRatioS: 0.65,
    categories: [
      { id: 'jedlo', name: 'Jedlo', color: '#e8590c' },
      { id: 'byt', name: 'Byt', color: '#1971c2' },
      { id: 'potraviny', name: 'Potraviny', color: '#2f9e44' },
      { id: 'eshop', name: 'Eshop', color: '#9c36b5' },
      { id: 'domacnost', name: 'Domácnosť', color: '#f08c00' },
      { id: 'ostatne', name: 'Ostatné', color: '#868e96' },
    ],
    merchants: [],
    expenses: [],
    settlements: [],
  };
}

function persist() {
  localStorage.setItem(LS_KEY, JSON.stringify(state));
  listeners.forEach(fn => fn());
}

export function onChange(fn) { listeners.push(fn); }

// --- čítanie ---
export const getPeople = () => state.people;
export const getCategories = () => state.categories;
export const getMerchants = () => state.merchants;
export const getExpenses = () => state.expenses;
export const getDefaultRatioS = () => state.defaultRatioS;

export function getCategory(id) { return state.categories.find(c => c.id === id); }

export function expensesForMonth(month) {
  return state.expenses.filter(e => e.month === month);
}

export function getSettlement(month) {
  return state.settlements.find(s => s.month === month) || null;
}

export function months() {
  const set = new Set(state.expenses.map(e => e.month));
  state.settlements.forEach(s => set.add(s.month));
  return [...set].sort();
}

export function merchantCategory(name) {
  const m = state.merchants.find(x => x.name.toLowerCase() === name.trim().toLowerCase());
  return m ? m.category : null;
}

export function merchantCanonical(name) {
  const m = state.merchants.find(x => x.name.toLowerCase() === name.trim().toLowerCase());
  return m ? m.name : name.trim();
}

// --- zápis ---
export function addExpense({ month, person, merchant, amount, category, note }) {
  merchant = merchantCanonical(merchant);
  const e = { id: state.nextId++, month, person, merchant, amount, category, ...(note ? { note } : {}) };
  state.expenses.push(e);
  learnMerchant(merchant, category);
  persist();
  return e;
}

export function updateExpense(id, patch) {
  const e = state.expenses.find(x => x.id === id);
  if (!e) return;
  Object.assign(e, patch);
  if (patch.merchant && patch.category) learnMerchant(patch.merchant, patch.category);
  persist();
}

export function deleteExpense(id) {
  state.expenses = state.expenses.filter(x => x.id !== id);
  persist();
}

function learnMerchant(name, category) {
  if (!name) return;
  const m = state.merchants.find(x => x.name.toLowerCase() === name.toLowerCase());
  if (m) m.category = category;
  else state.merchants.push({ name, category });
}

export function setMerchantCategory(name, category) { learnMerchant(name, category); persist(); }

export function deleteMerchant(name) {
  state.merchants = state.merchants.filter(x => x.name !== name);
  persist();
}

export function upsertSettlement(month, patch) {
  let s = state.settlements.find(x => x.month === month);
  if (!s) { s = { month, ratioS: state.defaultRatioS, settledAt: null }; state.settlements.push(s); }
  Object.assign(s, patch);
  persist();
  return s;
}

export function setDefaultRatioS(r) { state.defaultRatioS = r; persist(); }
export function setPersonName(key, name) { state.people[key] = name; persist(); }

export function addCategory(name, color) {
  const id = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-');
  if (state.categories.some(c => c.id === id)) return null;
  const c = { id, name, color };
  state.categories.push(c);
  persist();
  return c;
}

export function updateCategory(id, patch) {
  const c = state.categories.find(x => x.id === id);
  if (c) { Object.assign(c, patch); persist(); }
}

export function deleteCategory(id) {
  if (id === 'ostatne') return false;
  state.expenses.forEach(e => { if (e.category === id) e.category = 'ostatne'; });
  state.merchants.forEach(m => { if (m.category === id) m.category = 'ostatne'; });
  state.categories = state.categories.filter(c => c.id !== id);
  persist();
  return true;
}

// --- záloha ---
export function exportJson() { return JSON.stringify(state, null, 1); }

export function importJson(text) {
  const data = JSON.parse(text);
  if (!data.expenses || !data.categories) throw new Error('Neplatný formát zálohy');
  state = data;
  persist();
}

export function resetToSeed() {
  localStorage.removeItem(LS_KEY);
  return init();
}
