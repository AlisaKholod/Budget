// Данные приложения. Два режима:
//  - демо: примерные данные, хранятся в localStorage этого устройства;
//  - таблица: читаем и пишем Google Таблицу через Apps Script (см. apps-script/Code.gs).

import { iso, parseDate, num, weeksOfMonth, monthIndex } from './logic.js';

const LS = { settings: 'budget.settings.v1', demo: 'budget.demo.v1', cache: 'budget.cache.v1' };

const read = (k, d) => {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; }
};
const write = (k, v) => {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* хранилище недоступно */ }
};

export const settings = Object.assign({ url: '', key: '', who: 'Я' }, read(LS.settings, {}));
export const status = { mode: 'demo', offline: false, error: '' };
export let data = emptyData();

export function emptyData() {
  return { ops: [], cats: [], wishes: [], future: [], planWeeks: [], tracked: [], trips: [], places: [] };
}

export function saveSettings(patch) {
  Object.assign(settings, patch);
  write(LS.settings, settings);
}

export const isSheetMode = () => !!(settings.url && settings.key);

// ---------- Сопоставление листов таблицы и объектов ----------

const rows = (values) => (values || []).slice(1).map((r, i) => ({ r, row: i + 2 }));
const str = (v) => (v == null ? '' : String(v));
const dateStr = (v) => (parseDate(v) ? iso(parseDate(v)) : str(v));

export function fromSheets(all) {
  const d = emptyData();
  for (const { r } of rows(all['Операции'])) {
    if (!r[0] && !r[1]) continue;
    d.ops.push({ id: str(r[0]), date: dateStr(r[1]), type: str(r[2]), country: str(r[3]), category: str(r[4]), sub: str(r[5]), desc: str(r[6]), amount: num(r[7]), currency: str(r[8]), who: str(r[9]), store: str(r[10]), pay: str(r[11]), source: str(r[12]), receiptId: str(r[13]) });
  }
  for (const { r } of rows(all['Категории'])) {
    if (r[0] === 'Расход' || r[0] === 'Доход') d.cats.push({ type: r[0], country: str(r[1]), category: str(r[2]), sub: str(r[3]) });
  }
  for (const { r, row } of rows(all['Вишлист'])) {
    if (!r[1]) continue;
    d.wishes.push({ _row: row, owner: str(r[0]), name: str(r[1]), price: num(r[2]), currency: str(r[3]) || '₪', link: str(r[4]), desc: str(r[5]), when: str(r[6]), saved: num(r[7]), priority: str(r[8]), salePrice: num(r[9]), saleStore: str(r[10]), image: str(r[11]) });
  }
  for (const { r } of rows(all['Будущие расходы'])) {
    if (!r[1]) continue;
    d.future.push({ date: dateStr(r[0]), name: str(r[1]), amount: num(r[2]), currency: str(r[3]) || '₪', source: str(r[4]), note: str(r[5]) });
  }
  for (const { r } of rows(all['План недели'])) {
    if (!r[0]) continue;
    d.planWeeks.push({ weekStart: dateStr(r[0]), name: str(r[1]), plan: num(r[2]), currency: str(r[3]) || '₪', category: str(r[4]), sub: str(r[5]), budget: num(r[6]) });
  }
  for (const { r } of rows(all['Скидки'])) {
    if (!r[0]) continue;
    d.tracked.push({ name: str(r[0]), store: str(r[1]), branch: str(r[2]), threshold: num(r[3]), last: num(r[4]), onSale: /^(да|true|1|истина)$/i.test(str(r[5])), checked: dateStr(r[6]), image: str(r[7]) });
  }
  for (const { r } of rows(all['Поездки'])) {
    if (!r[0]) continue;
    d.trips.push({ id: str(r[0]), name: str(r[1]), best: str(r[2]), start: dateStr(r[3]), flights: num(r[4]), stay: num(r[5]), food: num(r[6]), transport: num(r[7]), fun: num(r[8]), currency: str(r[9]) || '₪', fareDrop: num(r[10]), image: str(r[11]) });
  }
  for (const { r } of rows(all['Места'])) {
    if (!r[0]) continue;
    d.places.push({ tripId: str(r[0]), n: num(r[1]), name: str(r[2]), nights: num(r[3]) || 1 });
  }
  return d;
}

const opRow = (o) => [o.id, o.date, o.type, o.country, o.category, o.sub, o.desc, o.amount, o.currency, o.who, o.store, o.pay, o.source, o.receiptId];
const wishRow = (w) => [w.owner, w.name, w.price, w.currency, w.link, w.desc, w.when, w.saved, w.priority, w.salePrice || '', w.saleStore || '', w.image || ''];
const futureRow = (f) => [f.date, f.name, f.amount, f.currency, f.source, f.note || ''];
const planRow = (p) => [p.weekStart, p.name, p.plan, p.currency, p.category || 'Продукты', p.sub || '', p.budget || ''];
const trackedRow = (t) => [t.name, t.store, t.branch, t.threshold, t.last || '', t.onSale ? 'да' : '', t.checked || '', t.image || ''];
const tripRow = (t) => [t.id, t.name, t.best, t.start, t.flights, t.stay, t.food, t.transport, t.fun, t.currency, t.fareDrop || '', t.image || ''];

// ---------- Связь с Apps Script ----------

async function call(body) {
  const res = await fetch(settings.url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ key: settings.key, ...body }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Ошибка таблицы');
  return json;
}

async function fetchAll() {
  const res = await fetch(settings.url + (settings.url.includes('?') ? '&' : '?') + 'action=all&key=' + encodeURIComponent(settings.key));
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Ошибка таблицы');
  return json.data;
}

/** Первая загрузка. В режиме таблицы при ошибке берём последние сохранённые данные. */
export async function init() {
  if (isSheetMode()) {
    status.mode = 'sheet';
    try {
      data = fromSheets(await fetchAll());
      write(LS.cache, data);
      status.offline = false;
      status.error = '';
    } catch (e) {
      data = Object.assign(emptyData(), read(LS.cache, {}));
      status.offline = true;
      status.error = String(e.message || e);
    }
  } else {
    status.mode = 'demo';
    data = read(LS.demo, null) || seed(new Date());
    write(LS.demo, data);
  }
  return data;
}

function persist() {
  write(isSheetMode() ? LS.cache : LS.demo, data);
}

/** Выполнить запись в таблицу. Ошибку возвращаем строкой, а локальные данные уже обновлены. */
async function remote(body) {
  if (!isSheetMode()) return '';
  try {
    await call(body);
    return '';
  } catch (e) {
    return 'Не сохранилось в таблице: ' + String(e.message || e);
  }
}

export function resetDemo() {
  data = seed(new Date());
  write(LS.demo, data);
}

// ---------- Операции ----------

const pad = (n, l = 4) => String(n).padStart(l, '0');

export function nextOpId() {
  const max = data.ops.reduce((m, o) => Math.max(m, parseInt(String(o.id).replace(/\D/g, ''), 10) || 0), 0);
  return 'R-' + pad(max + 1);
}

export async function addOp(o) {
  const op = Object.assign({ id: nextOpId(), who: settings.who, store: '', pay: '', source: 'приложение', receiptId: '' }, o);
  data.ops.push(op);
  persist();
  return remote({ action: 'append', sheet: 'Операции', values: opRow(op) });
}

export async function addWish(w) {
  const wish = Object.assign({ saved: 0, priority: 'Средний', salePrice: 0, saleStore: '', image: '' }, w);
  data.wishes.push(wish);
  persist();
  return remote({ action: 'append', sheet: 'Вишлист', values: wishRow(wish) });
}

export async function setWishSaved(w, saved) {
  w.saved = saved;
  persist();
  if (!isSheetMode()) return '';
  if (!w._row) return 'Строка вишлиста ещё не получила номер, обнови страницу.';
  return remote({ action: 'update', sheet: 'Вишлист', row: w._row, col: 8, values: [saved] });
}

export async function addFuture(f) {
  data.future.push(f);
  persist();
  return remote({ action: 'append', sheet: 'Будущие расходы', values: futureRow(f) });
}

export async function addPlanItem(p) {
  data.planWeeks.push(p);
  persist();
  return remote({ action: 'append', sheet: 'План недели', values: planRow(p) });
}

export async function addTracked(t) {
  data.tracked.push(t);
  persist();
  return remote({ action: 'append', sheet: 'Скидки', values: trackedRow(t) });
}

export async function addTrip(t) {
  data.trips.push(t);
  persist();
  return remote({ action: 'append', sheet: 'Поездки', values: tripRow(t) });
}

/** Полностью заменить места поездки. */
export async function setPlaces(tripId, places) {
  data.places = data.places.filter((p) => p.tripId !== tripId).concat(places.map((p, i) => ({ tripId, n: i + 1, name: p.name, nights: p.nights })));
  persist();
  return remote({ action: 'replaceWhere', sheet: 'Места', keyCol: 1, keyValue: tripId, rows: places.map((p, i) => [tripId, i + 1, p.name, p.nights]) });
}

export const catsFor = (type, country) => {
  const list = data.cats.filter((c) => c.type === type && (c.country === country || c.country === 'Все'));
  const names = [...new Set(list.map((c) => c.category))];
  return names.map((name) => ({ name, subs: list.filter((c) => c.category === name && c.sub).map((c) => c.sub) }));
};

// ---------- Демо-данные ----------

export function seed(today) {
  const d = emptyData();
  const nowIdx = monthIndex(today);
  const mk = (off, day) => {
    const dt = new Date(today.getFullYear(), today.getMonth() + off, day);
    return iso(dt);
  };
  let id = 0;
  const op = (date, type, country, category, sub, desc, amount, currency) =>
    d.ops.push({ id: 'R-' + pad(++id), date, type, country, category, sub, desc, amount, currency, who: 'Я', store: '', pay: '', source: 'демо', receiptId: '' });

  d.cats = [
    ...[['Аренда'], ['Продукты', 'Еда'], ['Продукты', 'Алкоголь'], ['Продукты', 'Малыш'], ['Продукты', 'Дом'], ['Садик'], ['Коммуналка'], ['Машина'], ['Рестики'], ['Болезни'], ['Ноготочки'], ['Туды-сюды'], ['Налоги и страхование'], ['Прочее']].map((c) => ({ type: 'Расход', country: 'IL', category: c[0], sub: c[1] || '' })),
    ...['Варя месяц', 'Варя туды-сюды', 'Подарки', 'Коммуналка', 'Ипотека', 'Налоги', 'Прочее'].map((c) => ({ type: 'Расход', country: 'RU', category: c, sub: '' })),
    ...['ИП', 'Аренда Китайцы', 'Аренда 685', 'Другое'].map((c) => ({ type: 'Доход', country: 'Все', category: c, sub: '' })),
  ];

  for (let m = -5; m <= 0; m++) {
    const k = 5 + m; // небольшие колебания, чтобы график не был ровным
    op(mk(m, 1), 'Расход', 'IL', 'Аренда', '', 'Аренда', 5200, '₪');
    op(mk(m, 4), 'Расход', 'IL', 'Садик', '', 'Садик', 1900, '₪');
    op(mk(m, 6), 'Расход', 'IL', 'Коммуналка', '', 'Электричество и вода', 520 + k * 15, '₪');
    op(mk(m, 9), 'Расход', 'IL', 'Продукты', 'Еда', 'Закупка', 640 + k * 25, '₪');
    op(mk(m, 11), 'Расход', 'IL', 'Продукты', 'Малыш', 'Подгузники', 90, '₪');
    op(mk(m, 14), 'Расход', 'IL', 'Продукты', 'Алкоголь', 'Пиво', 60 + k * 5, '₪');
    op(mk(m, 16), 'Расход', 'IL', 'Рестики', '', 'Ужин', 220 + (k % 3) * 60, '₪');
    op(mk(m, 20), 'Расход', 'IL', 'Продукты', 'Еда', 'Закупка', 700 - k * 10, '₪');
    op(mk(m, 2), 'Доход', 'IL', 'ИП', '', 'Оплата по счёту', 16000 + (k % 2) * 1500, '₪');
    op(mk(m, 3), 'Доход', 'IL', 'Аренда Китайцы', '', 'Аренда', 2000, '₪');
    op(mk(m, 5), 'Расход', 'RU', 'Ипотека', '', 'Платёж по ипотеке', 25000, '₽');
    op(mk(m, 7), 'Расход', 'RU', 'Варя месяц', '', 'Содержание', 15000, '₽');
    op(mk(m, 8), 'Расход', 'RU', 'Коммуналка', '', 'Коммунальные', 4800 + k * 100, '₽');
    op(mk(m, 10), 'Доход', 'RU', 'Аренда 685', '', 'Аренда', 48000, '₽');
  }

  const fut = (date, name, amount, currency, source, note = '') => d.future.push({ date, name, amount, currency, source, note });
  fut(mk(0, 25), 'Арнона', 900, '₪', 'Налог');
  fut(mk(1, 0), 'Налоговые авансы', 2400, '₪', 'Налог');
  fut(mk(1, 15), 'Битуах Леуми', 1100, '₪', 'Налог');
  fut(mk(2, 0), 'Налоговые авансы', 2400, '₪', 'Налог');
  fut(mk(4, 15), 'Кофемашина', 2000, '₪', 'Вишлист');
  fut(mk(6, 10), 'Поездка [Направление 1]', 4700, '₪', 'Путешествия');
  fut(mk(1, 1), 'Налог на имущество', 4500, '₽', 'Налог');
  fut(mk(6, 10), 'Отпуск', 60000, '₽', 'Путешествия');
  for (const w of weeksOfMonth(today.getFullYear(), today.getMonth() + 1).concat(weeksOfMonth(today.getFullYear(), today.getMonth() + 2)).slice(0, 8)) {
    fut(iso(w.start), 'Недельная закупка', 700, '₪', 'Покупки');
  }

  const weeks = weeksOfMonth(today.getFullYear(), today.getMonth());
  const planItems = [['Подгузники', 90], ['Молоко', 7], ['Курица', 60], ['Овощи', 50], ['Хлеб', 12]];
  for (const w of weeks) {
    d.planWeeks.push({ weekStart: iso(w.start), name: '(бюджет)', plan: 0, currency: '₪', category: '', sub: '', budget: 700 });
    for (const [name, plan] of planItems) d.planWeeks.push({ weekStart: iso(w.start), name, plan, currency: '₪', category: 'Продукты', sub: '', budget: 700 });
  }
  const cur = weeks.find((w) => today >= w.start && today <= w.end) || weeks[0];
  op(iso(cur.start), 'Расход', 'IL', 'Продукты', 'Малыш', 'Подгузники размер 4', 85, '₪');
  op(iso(cur.start), 'Расход', 'IL', 'Продукты', 'Еда', 'Молоко 3% картон', 7.35, '₪');
  op(iso(cur.start), 'Расход', 'IL', 'Продукты', 'Алкоголь', 'Вино', 37.9, '₪');

  d.wishes.push(
    { owner: 'Я', name: 'Кофемашина', price: 2000, currency: '₪', link: '', desc: 'Для дома', when: '3–6 мес', saved: 1200, priority: 'Высокий', salePrice: 1700, saleStore: '[Магазин А]', image: '' },
    { owner: 'Я', name: 'Кроссовки', price: 400, currency: '₪', link: '', desc: 'Беговые', when: '1–3 мес', saved: 150, priority: 'Средний', salePrice: 0, saleStore: '', image: '' },
    { owner: 'Муж', name: 'Наушники', price: 800, currency: '₪', link: '', desc: 'Беспроводные', when: '6–12 мес', saved: 300, priority: 'Средний', salePrice: 680, saleStore: '[Магазин Б]', image: '' },
    { owner: 'Даня', name: 'Конструктор', price: 250, currency: '₪', link: '', desc: 'Подарок на день рождения', when: '1–3 мес', saved: 90, priority: 'Высокий', salePrice: 0, saleStore: '', image: '' }
  );
  d.tracked.push(
    { name: 'Подгузники, размер 4', store: 'Кешет Таамим', branch: 'Кирьят-Хаим', threshold: 95, last: 89, onSale: true, checked: iso(today), image: '' },
    { name: 'Салфетки влажные', store: 'Кешет Таамим', branch: 'Кирьят-Хаим', threshold: 25, last: 31, onSale: false, checked: iso(today), image: '' }
  );
  const y = today.getFullYear();
  const start = (off, day) => iso(new Date(y, today.getMonth() + off, day));
  d.trips.push(
    { id: 'T1', name: '[Направление 1]', best: 'Апр – июн', start: start(6, 10), flights: 1400, stay: 1800, food: 700, transport: 300, fun: 500, currency: '₪', fareDrop: 18, image: '' },
    { id: 'T2', name: '[Направление 2]', best: 'Сен – окт', start: start(10, 8), flights: 900, stay: 1200, food: 600, transport: 200, fun: 400, currency: '₪', fareDrop: 0, image: '' }
  );
  d.places.push(
    { tripId: 'T1', n: 1, name: '[Место 1]', nights: 3 }, { tripId: 'T1', n: 2, name: '[Место 2]', nights: 4 }, { tripId: 'T1', n: 3, name: '[Место 3]', nights: 2 },
    { tripId: 'T2', n: 1, name: '[Место 1]', nights: 5 }
  );
  void nowIdx;
  return d;
}
