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
export const REQUIRED_SCRIPT_VERSION = 3;
export const status = { mode: 'demo', offline: false, error: '', missing: [], scriptVersion: 0, checked: false };
export let data = emptyData();

export function emptyData() {
  return { ops: [], cats: [], wishes: [], future: [], planWeeks: [], tracked: [], trips: [], places: [], smalls: [], lodging: [] };
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
    d.wishes.push({ _row: row, owner: str(r[0]), name: str(r[1]), price: num(r[2]), currency: str(r[3]) || '₪', link: str(r[4]), desc: str(r[5]), when: str(r[6]), saved: num(r[7]), priority: str(r[8]), salePrice: num(r[9]), saleStore: str(r[10]), image: str(r[11]), bought: dateStr(r[12]) });
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
  for (const { r, row } of rows(all['Поездки'])) {
    if (!r[0]) continue;
    d.trips.push({ _row: row, id: str(r[0]), name: str(r[1]), best: str(r[2]), start: dateStr(r[3]), flights: num(r[4]), stay: num(r[5]), food: num(r[6]), transport: num(r[7]), fun: num(r[8]), currency: str(r[9]) || '₪', fareDrop: num(r[10]), image: str(r[11]), end: dateStr(r[12]), flightLink: str(r[13]), flightMin: num(r[14]), flightCur: str(r[15]), flightChecked: dateStr(r[16]) });
  }
  for (const { r, row } of rows(all['Жильё'])) {
    if (!r[0]) continue;
    d.lodging.push({ _row: row, tripId: str(r[0]), name: str(r[1]), from: dateStr(r[2]), to: dateStr(r[3]), price: num(r[4]), currency: str(r[5]) || '₪', link: str(r[6]), image: str(r[7]) });
  }
  for (const { r, row } of rows(all['Мелкие покупки'])) {
    if (!r[0]) continue;
    d.smalls.push({ _row: row, name: str(r[0]), desc: str(r[1]), image: str(r[2]), who: str(r[3]), date: dateStr(r[4]) });
  }
  for (const { r } of rows(all['Места'])) {
    if (!r[0]) continue;
    d.places.push({ tripId: str(r[0]), n: num(r[1]), name: str(r[2]), nights: num(r[3]) || 1 });
  }
  return d;
}

const opRow = (o) => [o.id, o.date, o.type, o.country, o.category, o.sub, o.desc, o.amount, o.currency, o.who, o.store, o.pay, o.source, o.receiptId];
const wishRow = (w) => [w.owner, w.name, w.price, w.currency, w.link, w.desc, w.when, w.saved, w.priority, w.salePrice || '', w.saleStore || '', w.image || '', w.bought || ''];
const futureRow = (f) => [f.date, f.name, f.amount, f.currency, f.source, f.note || ''];
const planRow = (p) => [p.weekStart, p.name, p.plan, p.currency, p.category || 'Продукты', p.sub || '', p.budget || ''];
const trackedRow = (t) => [t.name, t.store, t.branch, t.threshold, t.last || '', t.onSale ? 'да' : '', t.checked || '', t.image || ''];
const smallRow = (x) => [x.name, x.desc || '', x.image || '', x.who || '', x.date || ''];
const tripRow = (t) => [t.id, t.name, t.best, t.start, t.flights, t.stay, t.food, t.transport, t.fun, t.currency, t.fareDrop || '', t.image || '', t.end || '', t.flightLink || '', t.flightMin || '', t.flightCur || '', t.flightChecked || ''];
const lodgingRow = (x) => [x.tripId, x.name, x.from || '', x.to || '', x.price || '', x.currency || '₪', x.link || '', x.image || ''];

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
  status.scriptVersion = Number(json.version) || 0;
  return json.data;
}

/** Читает таблицу. Если скрипт старый и не отдаёт какой-то лист, не затираем то, что уже есть на устройстве. */
async function loadAll() {
  const all = await fetchAll();
  const d = fromSheets(all);
  const cache = read(LS.cache, {});
  status.missing = [];
  for (const [key, sheet] of [['lodging', 'Жильё'], ['smalls', 'Мелкие покупки'], ['trips', 'Поездки'], ['places', 'Места']]) {
    if (!all[sheet]) { d[key] = (data[key] && data[key].length ? data[key] : cache[key]) || []; status.missing.push(sheet); }
  }
  return d;
}

/** Первая загрузка. В режиме таблицы при ошибке берём последние сохранённые данные. */
/** Быстрый старт: если на устройстве уже есть сохранённые данные таблицы, показываем их сразу, а свежие подтягиваем в фоне. */
export function initFast() {
  if (!isSheetMode()) return false;
  const cache = read(LS.cache, null);
  if (!cache || !Array.isArray(cache.ops)) return false;
  status.mode = 'sheet';
  data = Object.assign(emptyData(), cache);
  return true;
}

/** Фоновое обновление из таблицы. Возвращает true, если данные заменены. Если за это время пользователь что-то менял, результат не применяем, чтобы не затереть правку. */
export async function refresh() {
  if (!isSheetMode()) return false;
  const before = mutations;
  status.checked = false;
  try {
    const fresh = await loadAll();
    status.checked = true;
    status.offline = false;
    status.error = '';
    if (mutations !== before) return false;
    data = fresh;
    write(LS.cache, data);
    return true;
  } catch (e) {
    status.offline = true;
    status.error = String(e.message || e);
    return false;
  }
}

export async function init() {
  if (isSheetMode()) {
    status.mode = 'sheet';
    status.checked = false;
    try {
      data = await loadAll();
      status.checked = true;
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
    data = Object.assign(emptyData(), read(LS.demo, null) || seed(new Date()));
    write(LS.demo, data);
  }
  return data;
}

let mutations = 0;

function persist() {
  mutations += 1;
  write(isSheetMode() ? LS.cache : LS.demo, data);
}

/** Выполнить запись в таблицу. Ошибку возвращаем строкой, а локальные данные уже обновлены. */
/** После добавления строки перечитываем таблицу, чтобы у новой записи появился номер строки (для правки и удаления). */
async function addRemote(body) {
  const err = await remote(body);
  if (err || !isSheetMode()) return err;
  try {
    data = await loadAll();
    persist();
  } catch (e) { /* данные уже записаны; номер строки подтянется при следующей загрузке */ }
  return '';
}

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
  return addRemote({ action: 'append', sheet: 'Вишлист', values: wishRow(wish) });
}

export async function setWishSaved(w, saved) {
  w.saved = saved;
  persist();
  if (!isSheetMode()) return '';
  if (!w._row) return 'Строка вишлиста ещё не получила номер, обнови страницу.';
  return remote({ action: 'update', sheet: 'Вишлист', row: w._row, col: 8, values: [saved] });
}

export async function setWishBought(w, date) {
  w.bought = date || '';
  persist();
  if (!isSheetMode()) return '';
  if (!w._row) return 'Строка вишлиста ещё не получила номер, обнови страницу.';
  return remote({ action: 'update', sheet: 'Вишлист', row: w._row, col: 13, values: [w.bought] });
}

export async function updateWish(w, patch) {
  Object.assign(w, patch);
  persist();
  if (!isSheetMode()) return '';
  if (!w._row) return 'Строка вишлиста ещё не получила номер, обнови страницу.';
  return remote({ action: 'update', sheet: 'Вишлист', row: w._row, col: 1, values: wishRow(w) });
}

// Узнаёт цену товара по ссылке через Apps Script. Возвращает { ok, price, currency, title, image, host, several } или { ok:false, error }.
export async function lookupPrice(url, mode) {
  if (!isSheetMode()) return { ok: false, error: 'Подключи таблицу в ⚙: цену по ссылке узнаёт скрипт, в демо-режиме это не работает.' };
  try {
    return await call({ action: 'price', url, mode });
  } catch (e) {
    const m = String(e.message || e);
    if (/нельзя менять|Неизвестное действие/.test(m)) return { ok: false, error: 'Скрипт в таблице устарел: вставь новый Code.gs и создай новую версию развёртывания (инструкция в apps-script/README.md).' };
    return { ok: false, error: m };
  }
}

export async function addSmall(x) {
  const item = Object.assign({ desc: '', image: '', who: settings.who, date: iso(new Date()) }, x);
  data.smalls.push(item);
  persist();
  return addRemote({ action: 'append', sheet: 'Мелкие покупки', values: smallRow(item) });
}

export async function updateSmall(x, patch) {
  Object.assign(x, patch);
  persist();
  if (!isSheetMode()) return '';
  if (!x._row) return 'Строка списка ещё не получила номер, обнови страницу.';
  return remote({ action: 'update', sheet: 'Мелкие покупки', row: x._row, col: 1, values: smallRow(x) });
}

export async function deleteSmall(x) {
  const i = data.smalls.indexOf(x);
  if (i < 0) return '';
  const row = x._row;
  if (isSheetMode()) {
    if (!row) return 'Строка списка ещё не получила номер, обнови страницу.';
    const err = await remote({ action: 'deleteRow', sheet: 'Мелкие покупки', row, checkCol: 1, checkValue: x.name });
    if (err) return err;
    data.smalls.forEach((y) => { if (y._row > row) y._row -= 1; });
  }
  data.smalls.splice(i, 1);
  persist();
  return '';
}

export async function deleteWish(w) {
  const i = data.wishes.indexOf(w);
  if (i < 0) return '';
  const row = w._row;
  if (isSheetMode() && !row) return 'Строка вишлиста ещё не получила номер, обнови страницу.';
  if (isSheetMode()) {
    const err = await remote({ action: 'deleteRow', sheet: 'Вишлист', row, checkCol: 2, checkValue: w.name });
    if (err) return err;
    data.wishes.forEach((x) => { if (x._row > row) x._row -= 1; });
  }
  data.wishes.splice(i, 1);
  persist();
  return '';
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
  return addRemote({ action: 'append', sheet: 'Поездки', values: tripRow(t) });
}

export async function updateTrip(t, patch) {
  Object.assign(t, patch);
  persist();
  if (!isSheetMode()) return '';
  if (!t._row) return 'Строка поездки ещё не получила номер, обнови страницу.';
  return remote({ action: 'update', sheet: 'Поездки', row: t._row, col: 1, values: tripRow(t) });
}

/** Удалить поездку вместе с её местами и жильём. */
export async function deleteTrip(t) {
  const i = data.trips.indexOf(t);
  if (i < 0) return '';
  if (isSheetMode()) {
    if (!t._row) return 'Строка поездки ещё не получила номер, обнови страницу.';
    // сначала зависимые листы, чтобы не остались сироты, если удаление строки не удастся
    let err = await remote({ action: 'replaceWhere', sheet: 'Места', keyCol: 1, keyValue: t.id, rows: [] });
    if (err) return err;
    err = await remote({ action: 'replaceWhere', sheet: 'Жильё', keyCol: 1, keyValue: t.id, rows: [] });
    if (err) return err;
    err = await remote({ action: 'deleteRow', sheet: 'Поездки', row: t._row, checkCol: 1, checkValue: t.id });
    if (err) return err;
    data.trips.forEach((x) => { if (x._row > t._row) x._row -= 1; });
  }
  data.trips.splice(i, 1);
  data.places = data.places.filter((p) => p.tripId !== t.id);
  data.lodging = data.lodging.filter((x) => x.tripId !== t.id);
  persist();
  return '';
}

export async function addLodging(x) {
  data.lodging.push(x);
  persist();
  return addRemote({ action: 'append', sheet: 'Жильё', values: lodgingRow(x) });
}

export async function updateLodging(x, patch) {
  Object.assign(x, patch);
  persist();
  if (!isSheetMode()) return '';
  if (!x._row) return 'Строка жилья ещё не получила номер, обнови страницу.';
  return remote({ action: 'update', sheet: 'Жильё', row: x._row, col: 1, values: lodgingRow(x) });
}

export async function deleteLodging(x) {
  const i = data.lodging.indexOf(x);
  if (i < 0) return '';
  const row = x._row;
  if (isSheetMode()) {
    if (!row) return 'Строка жилья ещё не получила номер, обнови страницу.';
    const err = await remote({ action: 'deleteRow', sheet: 'Жильё', row, checkCol: 2, checkValue: x.name });
    if (err) return err;
    data.lodging.forEach((y) => { if (y._row > row) y._row -= 1; });
  }
  data.lodging.splice(i, 1);
  persist();
  return '';
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

  d.smalls.push(
    { name: 'Батарейки AA', desc: 'Для пульта, 4 штуки', image: '', who: 'Я', date: iso(today) },
    { name: 'Лампочка в коридор', desc: 'Тёплый свет, цоколь E27', image: '', who: 'Муж', date: iso(today) }
  );
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
    { id: 'T1', name: '[Направление 1]', best: 'Апр – июн', start: start(6, 10), flights: 1400, stay: 1800, food: 700, transport: 300, fun: 500, currency: '₪', fareDrop: 18, image: '', end: start(6, 19), flightLink: '', flightMin: 1250, flightCur: '₪', flightChecked: iso(today) },
    { id: 'T2', name: '[Направление 2]', best: 'Сен – окт', start: start(10, 8), flights: 900, stay: 1200, food: 600, transport: 200, fun: 400, currency: '₪', fareDrop: 0, image: '', end: start(10, 15), flightLink: '', flightMin: 0, flightCur: '', flightChecked: '' }
  );
  d.lodging.push(
    { tripId: 'T1', name: '[Отель в центре]', from: start(6, 10), to: start(6, 14), price: 900, currency: '₪', link: '', image: '' },
    { tripId: 'T1', name: '[Апартаменты у моря]', from: start(6, 14), to: start(6, 19), price: 1100, currency: '₪', link: '', image: '' }
  );
  d.places.push(
    { tripId: 'T1', n: 1, name: '[Место 1]', nights: 3 }, { tripId: 'T1', n: 2, name: '[Место 2]', nights: 4 }, { tripId: 'T1', n: 3, name: '[Место 3]', nights: 2 },
    { tripId: 'T2', n: 1, name: '[Место 1]', nights: 5 }
  );
  void nowIdx;
  return d;
}
