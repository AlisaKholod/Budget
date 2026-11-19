// Чистая логика приложения: без DOM, чтобы её можно было проверять в node.

export const CUR = { IL: '₪', RU: '₽' };
export const COUNTRY_BY_CUR = { '₪': 'IL', '₽': 'RU' };
export const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
export const MONTHS_SHORT = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

const p2 = (n) => String(n).padStart(2, '0');

/** Дата → 'YYYY-MM-DD' в локальном времени. */
export function iso(d) {
  return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
}

/** 'YYYY-MM-DD' → Date (локальная полночь). Пустое или кривое значение → null. */
export function parseDate(s) {
  if (s instanceof Date) return new Date(s.getFullYear(), s.getMonth(), s.getDate());
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

/** Индекс месяца: год*12 + месяц(0..11). Удобно считать разницу в месяцах. */
export function monthIndex(d) {
  return d.getFullYear() * 12 + d.getMonth();
}

export function monthTitle(idx, withYear = false) {
  const y = Math.floor(idx / 12);
  return MONTHS[idx % 12] + (withYear ? ' ' + y : '');
}

export function num(v) {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

export function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** 1234.5 → '1 235' (без копеек для крупных сумм) либо '12,50' для малых. */
export function fmt(n, cur = '') {
  const v = Math.abs(n) >= 100 ? Math.round(n) : round2(n);
  let s = String(v).replace('.', ',');
  const [int, frac] = s.split(',');
  const spaced = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  s = frac !== undefined ? spaced + ',' + frac.padEnd(2, '0') : spaced;
  return cur ? s + ' ' + cur : s;
}

export function signed(n, cur = '') {
  const s = fmt(Math.abs(n), cur);
  return n > 0 ? '+' + s : n < 0 ? '−' + s : s;
}

/** Операции выбранной страны (по валюте) за месяц. */
export function opsOf(ops, country, monthIdx) {
  return ops.filter((o) => {
    const d = parseDate(o.date);
    return d && COUNTRY_BY_CUR[o.currency] === country && (monthIdx == null || monthIndex(d) === monthIdx);
  });
}

export function totals(ops, country, monthIdx) {
  const list = opsOf(ops, country, monthIdx);
  const expense = list.filter((o) => o.type === 'Расход').reduce((t, o) => t + num(o.amount), 0);
  const income = list.filter((o) => o.type === 'Доход').reduce((t, o) => t + num(o.amount), 0);
  return { expense: round2(expense), income: round2(income), balance: round2(income - expense) };
}

/** Группировка по категории с подкатегориями. */
export function byCategory(ops, country, monthIdx, type) {
  const map = new Map();
  for (const o of opsOf(ops, country, monthIdx)) {
    if (o.type !== type) continue;
    const c = map.get(o.category) || { name: o.category, total: 0, subs: new Map() };
    c.total += num(o.amount);
    if (o.sub) c.subs.set(o.sub, (c.subs.get(o.sub) || 0) + num(o.amount));
    map.set(o.category, c);
  }
  return [...map.values()]
    .map((c) => ({ name: c.name, total: round2(c.total), subs: [...c.subs].map(([name, v]) => ({ name, total: round2(v) })).sort((a, b) => b.total - a.total) }))
    .sort((a, b) => b.total - a.total);
}

/** Последние n месяцев (включая текущий): расход, доход, накопление = доход − расход. */
export function monthlySeries(ops, country, endIdx, n = 6) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const idx = endIdx - i;
    const t = totals(ops, country, idx);
    out.push({ idx, label: MONTHS_SHORT[idx % 12], expense: t.expense, income: t.income, saved: Math.max(0, t.balance) });
  }
  return out;
}

/** Будущие расходы страны, отсортированные по дате, со смещением в месяцах от текущего. */
export function futureItems(future, country, nowIdx) {
  return future
    .map((f) => ({ ...f, d: parseDate(f.date), amount: num(f.amount) }))
    .filter((f) => f.d && COUNTRY_BY_CUR[f.currency] === country)
    .map((f) => ({ ...f, off: monthIndex(f.d) - nowIdx }))
    .filter((f) => f.off >= 0)
    .sort((a, b) => a.d - b.d);
}

/** Группы по месяцам: от 0 до lastOff включительно, пустые месяцы пропускаются. */
export function futureGroups(items, lastOff, nowIdx) {
  const out = [];
  for (let o = 0; o <= lastOff; o++) {
    const its = items.filter((i) => i.off === o);
    if (!its.length) continue;
    out.push({ off: o, title: monthTitle(nowIdx + o, o + (nowIdx % 12) >= 12), total: round2(its.reduce((t, i) => t + i.amount, 0)), items: its });
  }
  return out;
}

/** Суммы на три месяца вперёд (для плиток). */
export function futureTiles(items, nowIdx, n = 3) {
  return Array.from({ length: n }, (_, o) => ({
    title: monthTitle(nowIdx + o),
    total: round2(items.filter((i) => i.off === o).reduce((t, i) => t + i.amount, 0)),
  }));
}

/**
 * Резерв на большую трату: крупные покупки (Вишлист, Путешествия, Покупка), срок которых
 * дальше двух ближайших месяцев. Откладываем равными частями: цена / число месяцев до срока.
 */
export function reserve(items, minOff = 2) {
  const big = items.filter((i) => ['Вишлист', 'Путешествия', 'Крупная покупка'].includes(i.source) && i.off >= minOff);
  const rows = big.map((i) => ({ name: i.name, date: i.date, amount: i.amount, months: i.off, perMonth: round2(i.amount / Math.max(1, i.off)) }));
  return { rows, perMonth: round2(rows.reduce((t, r) => t + r.perMonth, 0)) };
}

// ---------- Недели и план/факт ----------

/** Недели месяца с воскресенья по субботу; крайние обрезаны границами месяца. */
export function weeksOfMonth(year, month) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const weeks = [];
  let start = new Date(first);
  while (start <= last) {
    const end = new Date(start);
    end.setDate(end.getDate() + (6 - end.getDay()));
    const e = end > last ? last : end;
    weeks.push({ n: weeks.length + 1, start: new Date(start), end: new Date(e) });
    start = new Date(e);
    start.setDate(start.getDate() + 1);
  }
  return weeks;
}

export function inRange(dateStr, start, end) {
  const d = parseDate(dateStr);
  return !!d && d >= start && d <= end;
}

const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').trim();

/**
 * План/факт недели. План: позиции списка (название, цена). Факт: траты категории «Продукты»
 * за неделю. Позиция считается купленной, если её название входит в описание траты.
 * Всё остальное — «вне списка».
 */
export function planFact(planItems, ops, week, country = 'IL') {
  const weekOps = ops.filter(
    (o) => o.type === 'Расход' && o.category === 'Продукты' && COUNTRY_BY_CUR[o.currency] === country && inRange(o.date, week.start, week.end)
  );
  const used = new Set();
  const rows = planItems.map((p) => {
    const key = norm(p.name);
    const found = weekOps.filter((o, i) => !used.has(i) && key && norm(o.desc).includes(key));
    found.forEach((o) => used.add(weekOps.indexOf(o)));
    const fact = found.length ? round2(found.reduce((t, o) => t + num(o.amount), 0)) : null;
    return { name: p.name, plan: num(p.plan), fact, diff: fact == null ? null : round2(fact - num(p.plan)) };
  });
  const extras = weekOps.filter((_, i) => !used.has(i)).map((o) => ({ name: o.desc, fact: num(o.amount), sub: o.sub }));
  const planTotal = round2(rows.reduce((t, r) => t + r.plan, 0));
  const factTotal = round2(weekOps.reduce((t, o) => t + num(o.amount), 0));
  return { rows, extras, planTotal, factTotal };
}

// ---------- Вишлист ----------

export function wishGoal(w) {
  // Цель накопления — цена, которую человек назвал сам; цена на сайте её не меняет.
  const price = num(w.price);
  return price > 0 ? price : num(w.salePrice);
}

export function wishProgress(w) {
  const goal = wishGoal(w);
  return goal > 0 ? Math.min(100, Math.round((num(w.saved) / goal) * 100)) : 0;
}

// Сравнение цены на сайте с «моей» ценой: gain > 0 — на сайте дешевле, gain < 0 — дороже.
export function wishSite(w) {
  const price = num(w.price);
  const site = num(w.salePrice);
  if (!(site > 0)) return null;
  const gain = round2(price - site);
  return { site, gain, pct: price > 0 ? Math.round((Math.abs(gain) / price) * 100) : 0 };
}

export function wishDiscountPct(w) {
  const price = num(w.price);
  const sale = num(w.salePrice);
  return sale > 0 && sale < price ? Math.round((1 - sale / price) * 100) : 0;
}

// ---------- Путешествия ----------

export function tripDates(start, places) {
  const s = parseDate(start) || new Date();
  let off = 0;
  const rows = places.map((p) => {
    const a = new Date(s.getFullYear(), s.getMonth(), s.getDate() + off);
    off += Math.max(1, num(p.nights));
    const b = new Date(s.getFullYear(), s.getMonth(), s.getDate() + off);
    return { ...p, from: a, to: b };
  });
  return { rows, nights: off, end: new Date(s.getFullYear(), s.getMonth(), s.getDate() + off) };
}

/** Длительность поездки по датам начала и конца: ночи и дни (день заезда и день отъезда считаются). */
export function tripSpan(start, end) {
  const a = parseDate(start);
  const b = parseDate(end);
  if (!a || !b || b < a) return null;
  const nights = Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
  return { nights, days: nights + 1 };
}

export function daysWord(n) {
  const m = n % 10, h = n % 100;
  return n + ' ' + (m === 1 && h !== 11 ? 'день' : m >= 2 && m <= 4 && (h < 10 || h >= 20) ? 'дня' : 'дней');
}

/** Жильё по поездке: сумма по валютам и число ночей, которые оно закрывает. */
export function lodgingTotals(list) {
  const byCur = {};
  let nights = 0;
  list.forEach((x) => {
    byCur[x.currency] = round2((byCur[x.currency] || 0) + num(x.price));
    const s = tripSpan(x.from, x.to);
    if (s) nights += s.nights;
  });
  return { byCur, nights };
}

export function ddmm(d) {
  return p2(d.getDate()) + '.' + p2(d.getMonth() + 1);
}

export function nightsWord(n) {
  const m = n % 10, h = n % 100;
  return n + ' ' + (m === 1 && h !== 11 ? 'ночь' : m >= 2 && m <= 4 && (h < 10 || h >= 20) ? 'ночи' : 'ночей');
}

export function tripBudget(t) {
  return ['flights', 'stay', 'food', 'transport', 'fun'].reduce((s, k) => s + num(t[k]), 0);
}

/** Места из ссылки Google Maps (длинной), из ссылки api=1 или из списка по строкам. */
export function parseRoute(raw) {
  raw = String(raw || '').trim();
  if (!raw) return { error: 'Вставь ссылку или список мест.' };
  if (/maps\.app\.goo\.gl|goo\.gl\/maps/.test(raw)) {
    return { error: 'Короткие ссылки не раскрываются. Скопируй длинную ссылку из адресной строки Google Maps.' };
  }
  const dec = (v) => {
    try { return decodeURIComponent(v.replace(/\+/g, ' ')).trim(); } catch (e) { return v.trim(); }
  };
  let names = [];
  if (/[?&]api=1/.test(raw) && /[?&]destination=/.test(raw)) {
    const q = new URLSearchParams(raw.split('?')[1]);
    names = [q.get('origin'), ...(q.get('waypoints') || '').split('|'), q.get('destination')].map((v) => (v || '').trim()).filter(Boolean);
  } else if (/google\.[a-z.]+\/maps\/dir\//.test(raw)) {
    const path = raw.split('/maps/dir/')[1].split('?')[0];
    for (const seg of path.split('/')) {
      if (seg.startsWith('@') || seg.startsWith('data=')) break;
      const v = dec(seg);
      if (v) names.push(v);
    }
  } else {
    names = raw.split(/\n|;/).map((v) => v.trim()).filter(Boolean);
  }
  names = names.slice(0, 12);
  return names.length ? { names } : { error: 'Не нашла мест в ссылке. Проверь ссылку или вставь список мест по одному в строке.' };
}

export function gmapsDirUrl(names) {
  return 'https://www.google.com/maps/dir/' + names.map(encodeURIComponent).join('/');
}

export function gmapsPlaceUrl(name) {
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(name);
}
