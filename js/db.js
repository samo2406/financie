// Dátová vrstva nad Supabase. Pri prihlásení sa dáta jednorazovo načítajú do
// pamäte (state) a views nad nimi čítajú synchrónne ako doteraz. Zápisy sú
// optimistické: najprv sa upraví state (UI reaguje okamžite), potom sa asynchrónne
// zapíšu do Supabase.
import { supabase } from './supabase.js';

let state = null;
const listeners = [];

export function onChange(fn) { listeners.push(fn); }
function emit() { listeners.forEach(fn => fn()); }

// odošle zápis do Supabase; pri chybe upozorní (state ostáva optimisticky zmenený)
function remote(query) {
  Promise.resolve(query).then(({ error }) => {
    if (error) { console.error('Supabase:', error); alert('Uloženie do cloudu zlyhalo: ' + error.message); }
  });
}

// --- autentifikácia ---
export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}
export function onAuth(cb) { supabase.auth.onAuthStateChange((_e, s) => cb(s)); }
// prihlásenie menom aj e-mailom: k holému menu (bez @) sa doplní fixná doména
const LOGIN_DOMAIN = '@lovky.local';
export function toEmail(name) {
  name = name.trim();
  return name.includes('@') ? name : name.toLowerCase() + LOGIN_DOMAIN;
}
export async function signIn(name, password) {
  const { error } = await supabase.auth.signInWithPassword({ email: toEmail(name), password });
  if (error) throw error;
}
export async function signOut() { await supabase.auth.signOut(); }
export async function currentEmail() { return (await supabase.auth.getUser()).data.user?.email || ''; }

// --- načítanie ---
export async function init() {
  const [settings, categories, merchants, expenses, settlements] = await Promise.all([
    supabase.from('settings').select('*').maybeSingle(),
    supabase.from('categories').select('*').order('sort'),
    supabase.from('merchants').select('*').order('name'),
    supabase.from('expenses').select('*'),
    supabase.from('settlements').select('*'),
  ]);
  const err = settings.error || categories.error || merchants.error || expenses.error || settlements.error;
  if (err) throw err;

  const s = settings.data || { people: { S: 'Samuel', M: 'Marcelka' }, default_ratio_s: 0.65 };
  state = {
    people: s.people,
    defaultRatioS: Number(s.default_ratio_s),
    categories: (categories.data || []).map(c => ({ id: c.id, name: c.name, color: c.color })),
    merchants: (merchants.data || []).map(m => ({ name: m.name, category: m.category })),
    expenses: (expenses.data || []).map(e => ({
      id: e.id, month: e.month, person: e.person, merchant: e.merchant,
      amount: Number(e.amount), category: e.category, ...(e.note ? { note: e.note } : {}),
    })),
    settlements: (settlements.data || []).map(x => ({ month: x.month, ratioS: Number(x.ratio_s), settledAt: x.settled_at })),
  };
  emit();
}

// --- čítanie ---
export const getPeople = () => state.people;
export const getCategories = () => state.categories;
export const getMerchants = () => state.merchants;
export const getExpenses = () => state.expenses;
export const getDefaultRatioS = () => state.defaultRatioS;

export function getCategory(id) { return state.categories.find(c => c.id === id); }
export function expensesForMonth(month) { return state.expenses.filter(e => e.month === month); }
export function getSettlement(month) { return state.settlements.find(s => s.month === month) || null; }

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

// --- zápis: výdavky ---
export function addExpense({ month, person, merchant, amount, category, note }) {
  merchant = merchantCanonical(merchant);
  const e = { id: crypto.randomUUID(), month, person, merchant, amount, category, ...(note ? { note } : {}) };
  state.expenses.push(e);
  learnMerchant(merchant, category);
  emit();
  remote(supabase.from('expenses').insert({ id: e.id, month, person, merchant, amount, category, note: note || null }));
  return e;
}

export function updateExpense(id, patch) {
  const e = state.expenses.find(x => x.id === id);
  if (!e) return;
  Object.assign(e, patch);
  if (patch.merchant && patch.category) learnMerchant(patch.merchant, patch.category);
  emit();
  remote(supabase.from('expenses').update(patch).eq('id', id));
}

export function deleteExpense(id) {
  state.expenses = state.expenses.filter(x => x.id !== id);
  emit();
  remote(supabase.from('expenses').delete().eq('id', id));
}

// --- zápis: obchody ---
function learnMerchant(name, category) {
  if (!name) return;
  const m = state.merchants.find(x => x.name.toLowerCase() === name.toLowerCase());
  if (m) {
    if (m.category !== category) { m.category = category; remote(supabase.from('merchants').update({ category }).eq('name', m.name)); }
  } else {
    state.merchants.push({ name, category });
    remote(supabase.from('merchants').upsert({ name, category }));
  }
}
export function setMerchantCategory(name, category) { learnMerchant(name, category); emit(); }
export function deleteMerchant(name) {
  state.merchants = state.merchants.filter(x => x.name !== name);
  emit();
  remote(supabase.from('merchants').delete().eq('name', name));
}

// --- zápis: vyúčtovanie ---
export function upsertSettlement(month, patch) {
  let s = state.settlements.find(x => x.month === month);
  if (!s) { s = { month, ratioS: state.defaultRatioS, settledAt: null }; state.settlements.push(s); }
  Object.assign(s, patch);
  emit();
  remote(supabase.from('settlements').upsert({ month: s.month, ratio_s: s.ratioS, settled_at: s.settledAt }));
  return s;
}

// --- zápis: nastavenia ---
function saveSettings() {
  remote(supabase.from('settings').upsert({ id: 1, people: state.people, default_ratio_s: state.defaultRatioS }));
}
export function setDefaultRatioS(r) { state.defaultRatioS = r; saveSettings(); }
export function setPersonName(key, name) { state.people[key] = name; emit(); saveSettings(); }

// --- zápis: kategórie ---
export function addCategory(name, color) {
  const id = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-');
  if (!id || state.categories.some(c => c.id === id)) return null;
  const c = { id, name, color };
  state.categories.push(c);
  emit();
  remote(supabase.from('categories').insert({ id, name, color, sort: state.categories.length }));
  return c;
}
export function updateCategory(id, patch) {
  const c = state.categories.find(x => x.id === id);
  if (!c) return;
  Object.assign(c, patch);
  emit();
  remote(supabase.from('categories').update(patch).eq('id', id));
}
export function deleteCategory(id) {
  if (id === 'ostatne') return false;
  state.expenses.forEach(e => { if (e.category === id) e.category = 'ostatne'; });
  state.merchants.forEach(m => { if (m.category === id) m.category = 'ostatne'; });
  state.categories = state.categories.filter(c => c.id !== id);
  emit();
  remote(supabase.from('expenses').update({ category: 'ostatne' }).eq('category', id));
  remote(supabase.from('merchants').update({ category: 'ostatne' }).eq('category', id));
  remote(supabase.from('categories').delete().eq('id', id));
  return true;
}

// --- záloha ---
export function exportJson() {
  return JSON.stringify({
    people: state.people, defaultRatioS: state.defaultRatioS,
    categories: state.categories, merchants: state.merchants,
    expenses: state.expenses, settlements: state.settlements,
  }, null, 1);
}

export async function importJson(text) {
  const data = JSON.parse(text);
  if (!data.expenses || !data.categories) throw new Error('Neplatný formát zálohy');
  await supabase.from('settings').upsert({ id: 1, people: data.people, default_ratio_s: data.defaultRatioS });
  await supabase.from('categories').upsert(data.categories.map((c, i) => ({ id: c.id, name: c.name, color: c.color, sort: i })));
  if (data.merchants.length) await supabase.from('merchants').upsert(data.merchants);
  if (data.settlements.length) await supabase.from('settlements').upsert(
    data.settlements.map(s => ({ month: s.month, ratio_s: s.ratioS, settled_at: s.settledAt })));
  const ex = data.expenses.map(e => ({
    id: String(e.id), month: e.month, person: e.person, merchant: e.merchant,
    amount: e.amount, category: e.category, note: e.note || null,
  }));
  for (let i = 0; i < ex.length; i += 500) {
    const { error } = await supabase.from('expenses').upsert(ex.slice(i, i + 500));
    if (error) throw error;
  }
  await init();
}
