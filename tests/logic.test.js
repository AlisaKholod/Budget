import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fmt, signed, totals, byCategory, weeksOfMonth, monthIndex, parseDate, futureItems, futureGroups,
  futureTiles, reserve, planFact, wishGoal, wishProgress, wishDiscountPct, wishSite, tripDates, nightsWord, tripSpan, daysWord, lodgingTotals,
  parseRoute, monthlySeries, iso,
} from '../js/logic.js';

const op = (date, type, category, sub, desc, amount, currency = '₪') => ({ date, type, category, sub, desc, amount, currency });

const ops = [
  op('2026-11-17', 'Расход', 'Продукты', 'Еда', 'Молоко 3% картон', 7.35),
  op('2026-11-17', 'Расход', 'Продукты', 'Алкоголь', 'Вино', 37.9),
  op('2026-11-17', 'Расход', 'Продукты', 'Малыш', 'Салфетки влажные Huggies x2', 25.44),
  op('2026-11-17', 'Расход', 'Продукты', 'Еда', 'Округление', -0.02),
  op('2026-11-03', 'Доход', 'ИП', '', 'Оплата', 16000),
  op('2026-10-05', 'Расход', 'Аренда', '', 'Аренда', 5200),
  op('2026-11-05', 'Расход', 'Подарки', '', 'Подарок', 4000, '₽'),
];

test('fmt и signed', () => {
  assert.equal(fmt(1234.5, '₪'), '1 235 ₪');
  assert.equal(fmt(7.35), '7,35');
  assert.equal(fmt(12), '12');
  assert.equal(signed(-20, '₪'), '−20 ₪');
  assert.equal(signed(20), '+20');
});

test('totals считает по стране (валюте) и месяцу', () => {
  const nov = monthIndex(new Date(2026, 10, 1));
  const il = totals(ops, 'IL', nov);
  assert.equal(il.expense, 70.67);
  assert.equal(il.income, 16000);
  assert.equal(il.balance, 15929.33);
  assert.equal(totals(ops, 'RU', nov).expense, 4000);
});

test('byCategory даёт подкатегории и сортирует по сумме', () => {
  const nov = monthIndex(new Date(2026, 10, 1));
  const c = byCategory(ops, 'IL', nov, 'Расход');
  assert.equal(c.length, 1);
  assert.equal(c[0].name, 'Продукты');
  assert.deepEqual(c[0].subs.map((s) => s.name), ['Алкоголь', 'Малыш', 'Еда']);
  assert.equal(c[0].subs.find((s) => s.name === 'Алкоголь').total, 37.9);
});

test('weeksOfMonth: ноябрь 2026, недели с воскресенья', () => {
  const w = weeksOfMonth(2026, 10).map((x) => iso(x.start) + '..' + iso(x.end));
  assert.deepEqual(w, [
    '2026-11-01..2026-11-07', '2026-11-08..2026-11-14', '2026-11-15..2026-11-21', '2026-11-22..2026-11-28', '2026-11-29..2026-11-30',
  ]);
});

test('будущие расходы: группы, плитки и резерв равными частями', () => {
  const now = monthIndex(new Date(2026, 10, 17));
  const future = [
    { date: '2026-11-25', name: 'Арнона', amount: 900, currency: '₪', source: 'Налог' },
    { date: '2026-12-15', name: 'Битуах Леуми', amount: 1100, currency: '₪', source: 'Налог' },
    { date: '2027-01-31', name: 'Налоговые авансы', amount: 2400, currency: '₪', source: 'Налог' },
    { date: '2027-03-15', name: 'Кофемашина', amount: 2000, currency: '₪', source: 'Вишлист' },
    { date: '2027-05-10', name: 'Поездка', amount: 4700, currency: '₪', source: 'Путешествия' },
    { date: '2027-05-10', name: 'Отпуск', amount: 60000, currency: '₽', source: 'Путешествия' },
    { date: '2026-10-01', name: 'Прошлое', amount: 1, currency: '₪', source: 'Налог' },
  ];
  const items = futureItems(future, 'IL', now);
  assert.equal(items.length, 5); // без рублёвых и без прошлого
  const groups = futureGroups(items, 1, now);
  assert.deepEqual(groups.map((g) => [g.title, g.total]), [['Ноябрь', 900], ['Декабрь', 1100]]);
  assert.deepEqual(futureTiles(items, now).map((t) => t.total), [900, 1100, 2400]);
  const r = reserve(items);
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows.find((x) => x.name === 'Кофемашина').perMonth, 500); // 2000 / 4 мес.
  assert.equal(r.rows.find((x) => x.name === 'Поездка').perMonth, 783.33); // 4700 / 6 мес.
  assert.equal(r.perMonth, 1283.33);
});

test('planFact: совпадение по названию и «вне списка»', () => {
  const week = weeksOfMonth(2026, 10)[2]; // 15–21 нояб
  const plan = [{ name: 'Молоко', plan: 7 }, { name: 'Хлеб', plan: 12 }];
  const r = planFact(plan, ops, week, 'IL');
  assert.equal(r.rows[0].fact, 7.35);
  assert.equal(r.rows[0].diff, 0.35);
  assert.equal(r.rows[1].fact, null);
  assert.equal(r.extras.length, 3); // вино, салфетки, округление
  assert.equal(r.factTotal, 70.67);
  assert.equal(r.planTotal, 19);
});

test('вишлист: цель со скидкой, прогресс и процент', () => {
  const w = { price: 2000, salePrice: 1700, saved: 1000 };
  assert.equal(wishGoal(w), 2000); // копим на свою цену, а не на цену сайта
  assert.equal(wishProgress(w), 50);
  assert.equal(wishDiscountPct(w), 15);
  assert.deepEqual(wishSite(w), { site: 1700, gain: 300, pct: 15 });
  assert.equal(wishSite({ price: 11000, salePrice: 8600 }).gain, 2400);
  assert.equal(wishSite({ price: 100, salePrice: 120 }).gain, -20);
  assert.equal(wishSite({ price: 100, salePrice: 0 }), null);
  assert.equal(wishGoal({ price: 400, salePrice: 0 }), 400);
  assert.equal(wishProgress({ price: 0, saved: 10 }), 0);
});

test('поездка: даты, ночи, склонение', () => {
  const t = tripDates('2027-05-10', [{ name: 'A', nights: 3 }, { name: 'B', nights: 4 }]);
  assert.equal(iso(t.rows[0].from), '2027-05-10');
  assert.equal(iso(t.rows[0].to), '2027-05-13');
  assert.equal(iso(t.rows[1].to), '2027-05-17');
  assert.equal(t.nights, 7);
  assert.equal(nightsWord(1), '1 ночь');
  assert.equal(nightsWord(3), '3 ночи');
  assert.equal(nightsWord(11), '11 ночей');
});

test('parseRoute: длинная ссылка, api=1, список, короткая ссылка, пусто', () => {
  assert.deepEqual(parseRoute('https://www.google.com/maps/dir/Colosseum,+Rome/Vatican+Museums/@41.9,12.4,13z/data=!4m2').names, ['Colosseum, Rome', 'Vatican Museums']);
  assert.deepEqual(parseRoute('https://www.google.com/maps/dir/?api=1&origin=A&destination=B&waypoints=C|D').names, ['A', 'C', 'D', 'B']);
  assert.deepEqual(parseRoute('Рим\nФлоренция').names, ['Рим', 'Флоренция']);
  assert.ok(parseRoute('https://maps.app.goo.gl/abc').error);
  assert.ok(parseRoute('').error);
});

test('monthlySeries: накопление не уходит в минус', () => {
  const nov = monthIndex(new Date(2026, 10, 1));
  const s = monthlySeries(ops, 'IL', nov, 2);
  assert.equal(s.length, 2);
  assert.equal(s[0].saved, 0); // октябрь: только расход
  assert.equal(s[1].saved, 15929.33);
});

test('parseDate', () => {
  assert.equal(iso(parseDate('2026-11-17')), '2026-11-17');
  assert.equal(parseDate(''), null);
  assert.equal(parseDate('мусор'), null);
});

test('tripSpan и жильё', () => {
  assert.deepEqual(tripSpan('2027-05-10', '2027-05-19'), { nights: 9, days: 10 });
  assert.deepEqual(tripSpan('2027-02-27', '2027-03-02'), { nights: 3, days: 4 });
  assert.equal(tripSpan('2027-05-10', '2027-05-09'), null);
  assert.equal(tripSpan('', '2027-05-09'), null);
  assert.equal(daysWord(1), '1 день');
  assert.equal(daysWord(3), '3 дня');
  assert.equal(daysWord(11), '11 дней');
  const t = lodgingTotals([
    { from: '2027-05-10', to: '2027-05-14', price: 900, currency: '₪' },
    { from: '2027-05-14', to: '2027-05-19', price: 1100.5, currency: '₪' },
    { price: 50, currency: '$' },
  ]);
  assert.deepEqual(t, { byCur: { '₪': 2000.5, '$': 50 }, nights: 9 });
});
