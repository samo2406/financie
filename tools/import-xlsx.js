// Jednorazový import histórie z lovky.xlsx do data/seed.json.
// xlsx treba najprv rozbaliť ako zip (Expand-Archive) a cestu k priečinku dať ako argument:
//   node tools/import-xlsx.js <cesta-k-rozbalenemu-xlsx>
const fs = require('fs');
const path = require('path');

const srcDir = process.argv[2];
if (!srcDir) { console.error('Pouzitie: node tools/import-xlsx.js <rozbaleny-xlsx-priecinok>'); process.exit(1); }

const MONTHS = ['Január', 'Február', 'Marec', 'Apríl', 'Máj', 'Jún', 'Júl', 'August', 'September', 'Október', 'November', 'December'];

const CATEGORIES = [
  { id: 'jedlo', name: 'Jedlo', color: '#e8590c' },
  { id: 'byt', name: 'Byt', color: '#1971c2' },
  { id: 'potraviny', name: 'Potraviny', color: '#2f9e44' },
  { id: 'eshop', name: 'Eshop', color: '#9c36b5' },
  { id: 'domacnost', name: 'Domácnosť', color: '#f08c00' },
  { id: 'ostatne', name: 'Ostatné', color: '#868e96' },
];

// mapovanie obchod -> kategória prevzaté zo SUMIF vzorcov v xlsx (finálna verzia)
const MERCHANT_MAP = {
  jedlo: ['MC', 'Bolt Food', "SYMPLE's", 'Pizza', 'Wolt', 'KFC'],
  byt: ['Splátka', 'VSE', 'Orange'],
  potraviny: ['Tesco', 'Billa', 'Nitrazdroj', 'Lidl', 'COOP', 'Kaufland'],
  eshop: ['Alza', 'TEMU', 'GymBeam', 'Allegro'],
  domacnost: ['Pepco', 'TEDI', 'Action', 'DM', 'Lekáreň', 'Kinekus', 'OBI', 'JYSK', 'Domácnosť'],
};

const canonical = {}; // lowercase -> {name, category}
for (const [cat, names] of Object.entries(MERCHANT_MAP))
  for (const n of names) canonical[n.toLowerCase()] = { name: n, category: cat };

function readXml(p) { return fs.readFileSync(path.join(srcDir, p), 'utf8'); }

let shared = [];
try {
  shared = [...readXml('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m =>
    [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join('')
  );
} catch (e) {}

const wb = readXml('xl/workbook.xml');
const rels = readXml('xl/_rels/workbook.xml.rels');
const relMap = {};
for (const m of rels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) relMap[m[1]] = m[2];
const sheets = [...wb.matchAll(/<sheet name="([^"]+)"[^>]*r:id="([^"]+)"/g)].map(m => ({ name: m[1], target: relMap[m[2]] }));

function decodeEnt(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

function parseSheet(xml) {
  const cells = {}; // 'A4' -> {v, f}
  for (const r of xml.matchAll(/<c r="([A-Z]+\d+)"(?:[^>]*t="([^"]*)")?[^>]*?(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const [, ref, type, inner = ''] = r;
    const vm = inner.match(/<v>([\s\S]*?)<\/v>/);
    const fm = inner.match(/<f[^>]*>([\s\S]*?)<\/f>/);
    let v = vm ? vm[1] : '';
    if (type === 's' && vm) v = shared[+vm[1]];
    if (type === 'inlineStr') { const t = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/); v = t ? t[1] : ''; }
    cells[ref] = { v: decodeEnt(String(v)), f: fm ? fm[1] : null };
  }
  return cells;
}

const expenses = [];
const settlements = [];
let idCounter = 1;

for (const s of sheets) {
  const m = s.name.match(/^(.+)_(\d{2})$/);
  if (!m) continue;
  const monthIdx = MONTHS.indexOf(m[1]);
  if (monthIdx < 0) { console.warn('Neznámy mesiac:', s.name); continue; }
  const month = `20${m[2]}-${String(monthIdx + 1).padStart(2, '0')}`;
  const cells = parseSheet(readXml('xl/' + s.target.replace(/^\//, '')));

  const monthExpenses = [];
  for (let row = 2; row <= 200; row++) {
    // A/B = Samuel (popis, suma), C/D = Marcelka (suma, popis)
    const sAmt = parseFloat((cells['B' + row] || {}).v);
    if (!isNaN(sAmt) && sAmt !== 0) monthExpenses.push({ person: 'S', merchant: (cells['A' + row] || {}).v || '', amount: sAmt });
    const mAmt = parseFloat((cells['C' + row] || {}).v);
    if (!isNaN(mAmt) && mAmt !== 0) monthExpenses.push({ person: 'M', merchant: (cells['D' + row] || {}).v || '', amount: mAmt });
  }
  if (!monthExpenses.length) continue;

  for (const e of monthExpenses) {
    const merchant = e.merchant.trim();
    const known = canonical[merchant.toLowerCase()];
    expenses.push({
      id: idCounter++,
      month,
      person: e.person,
      merchant: known ? known.name : merchant,
      amount: Math.round(e.amount * 100) / 100,
      category: known ? known.category : 'ostatne',
    });
  }

  // pomer z formuly (G3*0.65)
  let ratioS = 0.65;
  const g4 = (cells['G4'] || {}).f || '';
  const rm = g4.match(/G3\*(0\.\d+)/);
  if (rm) ratioS = parseFloat(rm[1]);

  // "Vyplatené dd.m.yyyy" kdekoľvek v hárku
  let settledAt = null;
  for (const c of Object.values(cells)) {
    const vm = String(c.v).match(/Vyplaten[áé]\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/i);
    if (vm) { settledAt = `${vm[3]}-${vm[2].padStart(2, '0')}-${vm[1].padStart(2, '0')}`; break; }
    if (/Vyplaten/i.test(String(c.v)) && !settledAt) settledAt = 'unknown';
  }

  settlements.push({ month, ratioS, settledAt });
}

expenses.sort((a, b) => a.month.localeCompare(b.month) || a.id - b.id);
settlements.sort((a, b) => a.month.localeCompare(b.month));

// zoznam obchodov na autocomplete + auto-kategorizáciu: známe mapovania + obchody z histórie
const merchants = {};
for (const info of Object.values(canonical)) merchants[info.name] = info.category;
for (const e of expenses) if (e.merchant && !(e.merchant in merchants)) merchants[e.merchant] = e.category;

const seed = {
  people: { S: 'Samuel', M: 'Marcelka' },
  defaultRatioS: 0.65,
  categories: CATEGORIES,
  merchants: Object.entries(merchants).map(([name, category]) => ({ name, category })).sort((a, b) => a.name.localeCompare(b.name, 'sk')),
  expenses,
  settlements,
};

const outPath = path.join(__dirname, '..', 'data', 'seed.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(seed, null, 1), 'utf8');

const bym = {};
for (const e of expenses) { bym[e.month] = bym[e.month] || { n: 0, sum: 0 }; bym[e.month].n++; bym[e.month].sum += e.amount; }
console.log(`Mesiacov: ${settlements.length}, výdavkov: ${expenses.length}, obchodov: ${seed.merchants.length}`);
for (const [mo, st] of Object.entries(bym)) {
  const set = settlements.find(x => x.month === mo);
  console.log(`${mo}: ${st.n} pol., ${st.sum.toFixed(2)} €, pomer S=${set.ratioS}, vyplatené: ${set.settledAt || '-'}`);
}
