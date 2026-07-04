// Vygeneruje supabase/seed-data.sql z data/seed.json — celú históriu na jednorazový
// import do Supabase cez SQL editor. Výstup je gitignored (obsahuje súkromné dáta).
//   node tools/gen-seed-sql.js
const fs = require('fs');
const path = require('path');

const seed = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'seed.json'), 'utf8'));

const q = v => v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`;
const num = v => v === null || v === undefined ? 'null' : Number(v);

const lines = [];
lines.push('-- Import histórie z lovky.xlsx. Spusti v Supabase SQL editore PO schema.sql.');
lines.push('-- Súkromné dáta — nie je v gite.');
lines.push('');

// settings
lines.push(`update public.settings set people = '${JSON.stringify(seed.people)}'::jsonb, default_ratio_s = ${num(seed.defaultRatioS)} where id = 1;`);
lines.push('');

// categories
const cats = seed.categories.map((c, i) => `(${q(c.id)}, ${q(c.name)}, ${q(c.color)}, ${i})`);
lines.push('insert into public.categories (id, name, color, sort) values');
lines.push(cats.join(',\n') + '\non conflict (id) do update set name = excluded.name, color = excluded.color, sort = excluded.sort;');
lines.push('');

// merchants
const merch = seed.merchants.map(m => `(${q(m.name)}, ${q(m.category)})`);
lines.push('insert into public.merchants (name, category) values');
lines.push(merch.join(',\n') + '\non conflict (name) do update set category = excluded.category;');
lines.push('');

// settlements
const setl = seed.settlements.map(s => `(${q(s.month)}, ${num(s.ratioS)}, ${q(s.settledAt)})`);
lines.push('insert into public.settlements (month, ratio_s, settled_at) values');
lines.push(setl.join(',\n') + '\non conflict (month) do update set ratio_s = excluded.ratio_s, settled_at = excluded.settled_at;');
lines.push('');

// expenses (dávky po 400 riadkov kvôli čitateľnosti)
const rows = seed.expenses.map(e =>
  `(${q(String(e.id))}, ${q(e.month)}, ${q(e.person)}, ${q(e.merchant)}, ${num(e.amount)}, ${q(e.category)}, ${q(e.note || null)})`);
for (let i = 0; i < rows.length; i += 400) {
  lines.push('insert into public.expenses (id, month, person, merchant, amount, category, note) values');
  lines.push(rows.slice(i, i + 400).join(',\n') + '\non conflict (id) do nothing;');
  lines.push('');
}

const out = path.join(__dirname, '..', 'supabase', 'seed-data.sql');
fs.writeFileSync(out, lines.join('\n'), 'utf8');
console.log(`Zapísané: ${out}`);
console.log(`Kategórií: ${seed.categories.length}, obchodov: ${seed.merchants.length}, mesiacov: ${seed.settlements.length}, výdavkov: ${seed.expenses.length}`);
