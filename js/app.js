import * as L from './logic.js';
import * as S from './store.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') || /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(u || '') ? u : '');

const today = new Date();
const nowIdx = L.monthIndex(today);
const OWNERS = ['Я', 'Муж', 'Даня'];
const WHEN = ['1–3 мес', '3–6 мес', '6–12 мес', 'Позже'];

const ui = {
  tab: 'budget', country: 'IL', monthOff: 0, dtab: 'exp', showAll: false,
  shopTab: 'weeks', shopOff: 0, openWeek: null, owner: 'Я', wishView: 'list', onlySale: false, trip: null,
};

// ---------- Мелкие помощники ----------

const img = (url, label, cls = 'ph') => {
  const u = safeUrl(url);
  return u
    ? `<div class="${cls}"><img src="${esc(u)}" alt="" loading="lazy" referrerpolicy="no-referrer"></div>`
    : `<div class="${cls} empty" aria-hidden="true">${esc(String(label || '?').replace(/^\[/, '').charAt(0).toUpperCase())}</div>`;
};

const bar = (pct, over = false) => `<div class="bar"><div style="width:${Math.max(0, Math.min(100, pct))}%;background:${over ? 'var(--bad)' : 'var(--accent)'}"></div></div>`;
const badge = (text, kind = '') => `<span class="b ${kind}">${esc(text)}</span>`;

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 5000);
}

// ---------- Бюджет ----------

function viewBudget() {
  const d = S.data;
  const idx = nowIdx + ui.monthOff;
  const cur = L.CUR[ui.country];
  const t = L.totals(d.ops, ui.country, idx);
  const modes = ['IL', 'RU'].map((c) => {
    const tt = L.totals(d.ops, c, idx);
    return `<button class="mode ${c === ui.country ? 'on' : ''}" data-act="country" data-v="${c}"><span>${c === 'IL' ? 'Израиль' : 'Россия'}</span><b>Остаток ${L.fmt(tt.balance, L.CUR[c])}</b></button>`;
  }).join('');

  const type = ui.dtab === 'exp' ? 'Расход' : 'Доход';
  const cats = L.byCategory(d.ops, ui.country, idx, type);
  const maxCat = Math.max(1, ...cats.map((c) => c.total));
  const detail = cats.length
    ? cats.map((c) => `<div class="row col"><div class="row"><span>${esc(c.name)}</span><b>${L.fmt(c.total, cur)}</b></div>${bar((c.total / maxCat) * 100)}${c.subs.length ? `<div class="m">${c.subs.map((s) => esc(s.name) + ' ' + L.fmt(s.total)).join(' · ')}</div>` : ''}</div>`).join('')
    : '<div class="m">В этом месяце записей нет.</div>';

  const fut = L.futureItems(d.future, ui.country, nowIdx);
  const maxOff = Math.max(1, ...fut.map((f) => f.off));
  const groups = L.futureGroups(fut, ui.showAll ? maxOff : 1, nowIdx);
  const visible = fut.filter((f) => f.off <= (ui.showAll ? maxOff : 1)).reduce((s, f) => s + f.amount, 0);
  const hidden = fut.filter((f) => f.off >= 2);
  const tiles = L.futureTiles(fut, nowIdx).map((x) => `<div class="k">${esc(x.title)}<b>${L.fmt(x.total, cur)}</b></div>`).join('');
  const res = L.reserve(fut);

  const series = L.monthlySeries(d.ops, ui.country, idx, 6);
  const mx = Math.max(1, ...series.map((s) => Math.max(s.expense, s.saved)));
  const chart = series.map((s, i) => {
    const x = 12 + i * 54;
    const he = Math.round((s.expense / mx) * 100);
    const hs = Math.round((s.saved / mx) * 100);
    return `<rect x="${x}" y="${110 - he}" width="18" height="${he}" rx="3" fill="var(--ink)"/><rect x="${x + 20}" y="${110 - hs}" width="18" height="${hs}" rx="3" fill="var(--accent)"/><text x="${x + 19}" y="128" text-anchor="middle" font-size="11" fill="var(--muted)">${s.label}</text>`;
  }).join('');

  return `
  <div class="monthnav"><button data-act="monthPrev" aria-label="Предыдущий месяц">‹</button><b>${L.monthTitle(idx, true)}</b><button data-act="monthNext" aria-label="Следующий месяц" ${ui.monthOff >= 0 ? 'disabled' : ''}>›</button></div>
  <div class="f">${modes}</div>
  <div class="f"><div class="k">Расходы<b>${L.fmt(t.expense, cur)}</b></div><div class="k">Доходы<b>${L.fmt(t.income, cur)}</b></div><div class="k">Остаток<b>${L.fmt(t.balance, cur)}</b></div></div>
  <section class="c"><h2>Детализация</h2>
    <div class="f"><button class="p ${ui.dtab === 'exp' ? 'on' : ''}" data-act="dtab" data-v="exp">Расходы</button><button class="p ${ui.dtab === 'inc' ? 'on' : ''}" data-act="dtab" data-v="inc">Доходы</button></div>
    ${detail}
    ${ui.dtab === 'exp' ? `<div class="m top">Запланировано на ближайшие месяцы</div><div class="f">${tiles}</div>` : ''}
  </section>
  <section class="c"><div class="row"><h2>Будущие расходы</h2><b>${L.fmt(visible, cur)}</b></div>
    <div class="m">Показаны ближайшие 2 месяца, остальное хранится дальше.</div>
    ${groups.length ? groups.map((g) => `<div class="row top"><b>${esc(g.title)}</b><b>${L.fmt(g.total, cur)}</b></div>${g.items.map((i) => `<div class="row"><span>${esc(i.name)}<span class="m sub">${L.ddmm(i.d)} · ${esc(i.source)}${i.note ? ' · ' + esc(i.note) : ''}</span></span><b>${L.fmt(i.amount, cur)}</b></div>`).join('')}`).join('') : '<div class="m">Запланированных расходов нет.</div>'}
    ${!ui.showAll ? `<div class="m">${hidden.length ? `На дальний срок хранится: ${hidden.length} шт. на ${L.fmt(hidden.reduce((s, f) => s + f.amount, 0), cur)}` : 'На дальний срок ничего не запланировано'}</div>` : ''}
    <button class="o" data-act="showAll">${ui.showAll ? 'Скрыть дальние' : 'Показать весь горизонт'}</button>
    <button class="o" data-act="addFuture">+ Будущий расход</button>
  </section>
  ${res.rows.length ? `<section class="c hl"><div class="row"><h2>Отложить на большую трату</h2><b>${L.fmt(res.perMonth, cur)}/мес</b></div><div class="m">Откладываем равными частями каждый месяц, чтобы набрать к сроку.</div>${res.rows.map((r) => `<div class="row"><span>${esc(r.name)}<span class="m sub">к ${L.ddmm(L.parseDate(r.date))}.${String(L.parseDate(r.date).getFullYear()).slice(2)} · ${r.months} мес.</span></span><b>${L.fmt(r.perMonth, cur)}/мес</b></div>`).join('')}</section>` : ''}
  <section class="c"><h2>Расходы и накопления</h2>
    <svg viewBox="0 0 330 136" role="img" aria-label="Расходы и накопления по месяцам" class="chart">${chart}</svg>
    <div class="m"><span class="dot ink"></span>расходы <span class="dot acc"></span>накопления, ${cur}</div>
  </section>`;
}

// ---------- Покупки ----------

function viewShop() {
  const tabs = `<div class="f"><button class="p ${ui.shopTab === 'weeks' ? 'on' : ''}" data-act="shopTab" data-v="weeks">Недели</button><button class="p ${ui.shopTab === 'deals' ? 'on' : ''}" data-act="shopTab" data-v="deals">Скидки</button></div>`;
  return ui.shopTab === 'weeks' ? tabs + shopWeeks() : tabs + shopDeals();
}

function weekPlan(w) {
  const key = L.iso(w.start);
  const rows = S.data.planWeeks.filter((p) => p.weekStart === key);
  const budgetRow = [...rows].reverse().find((r) => r.name === '(бюджет)');
  const budget = budgetRow ? budgetRow.budget : Math.max(0, ...rows.map((r) => r.budget || 0));
  return { key, budget, items: rows.filter((r) => r.name !== '(бюджет)') };
}

function shopWeeks() {
  const sm = new Date(today.getFullYear(), today.getMonth() + ui.shopOff, 1);
  const weeks = L.weeksOfMonth(sm.getFullYear(), sm.getMonth());
  const cards = weeks.map((w) => {
    const wp = weekPlan(w);
    const pf = L.planFact(wp.items.map((i) => ({ name: i.name, plan: i.plan })), S.data.ops, w, 'IL');
    const hasFact = pf.factTotal !== 0;
    const over = wp.budget > 0 && pf.factTotal > wp.budget;
    const open = ui.openWeek === w.n;
    const diffBadge = !hasFact ? badge('чеков ещё нет') : wp.budget > 0 ? (over ? badge('Перерасход ' + L.fmt(pf.factTotal - wp.budget, '₪'), 'bad') : badge('Осталось ' + L.fmt(wp.budget - pf.factTotal, '₪'), 'ok')) : badge('Бюджет не задан');
    const table = open ? `
      <div class="g h"><span>По списку</span><span>План</span><span>Факт</span></div>
      ${pf.rows.length ? pf.rows.map((r) => `<div class="g"><span>${esc(r.name)}</span><span>${L.fmt(r.plan)}</span><span class="${r.diff == null ? '' : r.diff > 0 ? 'bad-t' : r.diff < 0 ? 'ok-t' : ''}">${r.fact == null ? '—' : L.fmt(r.fact)}</span></div>`).join('') : '<div class="m">Список недели пуст.</div>'}
      ${pf.extras.length ? `<div class="g h top"><span>Вне списка</span><span></span><span>Факт</span></div>${pf.extras.map((x) => `<div class="g"><span>${esc(x.name)}${x.sub ? `<span class="m sub">${esc(x.sub)}</span>` : ''}</span><span></span><span>${L.fmt(x.fact)}</span></div>`).join('')}` : ''}
      <div class="row top"><span class="m">План по списку</span><b>${L.fmt(pf.planTotal, '₪')}</b></div>
      <div class="f"><button class="o" data-act="addPlan" data-v="${w.n}">+ Позиция</button><button class="o" data-act="setBudget" data-v="${w.n}">Бюджет недели</button></div>` : '';
    return `<section class="c"><button class="hd" data-act="openWeek" data-v="${w.n}" aria-expanded="${open}"><span>Неделя ${w.n}<span class="m sub">${L.ddmm(w.start)} – ${L.ddmm(w.end)}</span></span><span>${open ? '▾' : '▸'}</span></button>
      ${bar(wp.budget > 0 ? (pf.factTotal / wp.budget) * 100 : 0, over)}
      <div class="row"><span class="m">${hasFact ? 'Факт ' + L.fmt(pf.factTotal, '₪') + (wp.budget > 0 ? ' из бюджета ' + L.fmt(wp.budget, '₪') : '') : wp.budget > 0 ? 'Бюджет ' + L.fmt(wp.budget, '₪') : 'Бюджет не задан'}</span>${diffBadge}</div>
      ${table}</section>`;
  }).join('');
  const nav = `<div class="row"><button class="o sm" data-act="shopMonth" data-v="-1" aria-label="Предыдущий месяц">‹</button><b>${L.monthTitle(L.monthIndex(sm))}</b><button class="o sm" data-act="shopMonth" data-v="1" aria-label="Следующий месяц">›</button></div>`;
  return `${nav}<div class="m">Факт берётся из трат «Продукты» по Израилю за неделю (недели с воскресенья по субботу).</div>${cards}`;
}

function shopDeals() {
  const list = S.data.tracked;
  return `<div class="m">Товары, которые ты часто берёшь. Цены обновляю по твоей просьбе в чате.</div>
  ${list.length ? list.map((t) => {
    const low = t.last > 0 && t.threshold > 0 && t.last <= t.threshold;
    return `<section class="c"><div class="f">${img(t.image, t.name)}<div class="grow"><div class="row"><h2>${esc(t.name)}</h2>${t.onSale ? badge('Акция', 'ok') : badge('Без акции')}</div>
      <div class="m">${esc(t.store)}${t.branch ? ' · ' + esc(t.branch) : ''}</div>
      <div class="row"><span>${t.last ? 'Сейчас ' + L.fmt(t.last, '₪') : 'Цена ещё не проверена'}</span>${low ? badge('Ниже порога', 'ok') : ''}</div>
      <div class="m">Порог ${t.threshold ? L.fmt(t.threshold, '₪') : '—'}${t.checked ? ' · проверено ' + esc(t.checked) : ''}</div></div></div></section>`;
  }).join('') : '<div class="m">Пока ничего не отслеживаем.</div>'}
  <button class="o" data-act="addTracked">+ Отслеживать товар</button>`;
}

// ---------- Вишлист ----------

function viewWish() {
  const tabs = OWNERS.map((o) => `<button class="p ${ui.owner === o ? 'on' : ''}" data-act="owner" data-v="${o}">${o}</button>`).join('');
  const mine = S.data.wishes.map((w, i) => ({ w, i })).filter(({ w }) => w.owner === ui.owner);
  const done = mine.filter(({ w }) => w.bought);
  const views = `<div class="f"><button class="p ${ui.wishView === 'list' ? 'on' : ''}" data-act="wishView" data-v="list">Хотелки</button><button class="p ${ui.wishView === 'done' ? 'on' : ''}" data-act="wishView" data-v="done">🏆 Достижения${done.length ? ' · ' + done.length : ''}</button></div>`;
  if (ui.wishView === 'done') {
    const total = {};
    done.forEach(({ w }) => { total[w.currency] = (total[w.currency] || 0) + (L.wishGoal(w) || L.num(w.price)); });
    const sum = Object.entries(total).map(([c, v]) => L.fmt(v, c)).join(' + ');
    const cards = done.map(({ w, i }) => `<section class="c"><div class="f">${img(w.image, w.name)}<div class="grow"><div class="row"><h2>${esc(w.name)}</h2>${badge('Куплено', 'ok')}</div>
      <div class="m">${esc(w.bought)} · ${L.fmt(L.wishGoal(w) || L.num(w.price), w.currency)}</div>
      ${w.desc ? `<div class="m">${esc(w.desc)}</div>` : ''}</div></div>
      <div class="f"><button class="o sm" data-act="wishUnbuy" data-v="${i}">Вернуть в хотелки</button><button class="o sm" data-act="wishEdit" data-v="${i}">Изменить</button><button class="o sm" data-act="wishDel" data-v="${i}">Удалить</button></div></section>`).join('');
    return `<div class="f">${tabs}</div>${views}
      ${done.length ? `<div class="m">Исполнено желаний: <b>${done.length}</b> на сумму <b>${sum}</b></div>` : ''}
      ${cards || '<div class="m">Пока пусто. Нажми «Куплено» на карточке, когда купите.</div>'}`;
  }
  const list = mine.filter(({ w }) => !w.bought && (!ui.onlySale || L.wishDiscountPct(w) > 0));
  const cards = list.map(({ w, i }) => {
    const goal = L.wishGoal(w);
    const pct = L.wishDiscountPct(w);
    const link = safeUrl(w.link);
    return `<section class="c"><div class="f">${img(w.image, w.name)}<div class="grow"><div class="row"><h2>${esc(w.name)}</h2>${badge(w.priority || 'Средний')}</div>
      <div class="m">Цена ${L.fmt(L.num(w.price), w.currency)}</div>
      ${pct ? badge(`Скидка ${pct}% · ${w.saleStore || 'магазин'} · ${L.fmt(L.num(w.salePrice), w.currency)}`, 'ok') : badge('Скидок нет')}
      ${w.desc ? `<div class="m">${esc(w.desc)}</div>` : ''}
      ${link ? `<a class="lnk" href="${esc(link)}" target="_blank" rel="noopener noreferrer">Ссылка на магазин ↗</a>` : ''}
      ${w.when ? badge('Купить: ' + w.when) : ''}</div></div>
      ${bar(L.wishProgress(w))}
      <div class="row"><span class="m">Накоплено ${L.fmt(L.num(w.saved), w.currency)} из ${L.fmt(goal, w.currency)}</span><button class="o sm" data-act="wishPlus" data-v="${i}">+100 ${esc(w.currency)}</button></div>
      <div class="f"><button class="primary sm" data-act="wishBuy" data-v="${i}">✓ Куплено</button><button class="o sm" data-act="wishEdit" data-v="${i}">Изменить</button><button class="o sm" data-act="wishDel" data-v="${i}">Удалить</button></div></section>`;
  }).join('');
  return `<div class="f">${tabs}</div>${views}
  <div class="f"><button class="primary grow" data-act="addWish">+ Добавить хотелку</button><button class="p ${ui.onlySale ? 'on' : ''}" data-act="onlySale">Только со скидкой</button></div>
  ${cards || '<div class="m">Здесь пока пусто.</div>'}`;
}

// ---------- Путешествия ----------

function tripPlaces(id) {
  return S.data.places.filter((p) => p.tripId === id).sort((a, b) => a.n - b.n);
}

function viewTravel() {
  const trip = S.data.trips.find((t) => t.id === ui.trip);
  return trip ? tripDetail(trip) : tripList();
}

function tripList() {
  const trips = S.data.trips;
  const fares = trips.filter((t) => t.fareDrop > 0);
  const months = Array.from({ length: 12 }, (_, o) => {
    const idx = nowIdx + o;
    const k = trips.findIndex((t) => L.parseDate(t.start) && L.monthIndex(L.parseDate(t.start)) === idx);
    return `<div class="mo ${k >= 0 ? 'on' : ''}">${L.MONTHS_SHORT[idx % 12]}<b>${k >= 0 ? k + 1 : ''}</b></div>`;
  }).join('');
  return `
  ${fares.length ? `<section class="c hl"><div class="row"><h2>Скидки на авиабилеты</h2>${badge(fares.length + ' направл.', 'ok')}</div><div class="m">${fares.map((t) => esc(t.name) + ' −' + t.fareDrop + '%').join(', ')}</div></section>` : ''}
  <section class="c"><h2>Ближайшие 12 месяцев</h2><div class="mg">${months}</div><div class="m">Цифра в месяце означает номер поездки.</div></section>
  ${trips.map((t) => `<button class="tw" data-act="trip" data-v="${esc(t.id)}">${img(t.image, t.name, 'tp')}<div class="tb"><b>${esc(t.name)}</b><span class="m">Лучшие месяцы</span><b>${esc(t.best || '—')}</b><span class="m">Бюджет ≈ ${L.fmt(L.tripBudget(t), t.currency)}</span>${t.fareDrop > 0 ? badge('Билеты −' + t.fareDrop + '%', 'ok') : ''}</div></button>`).join('') || '<div class="m">Поездок пока нет.</div>'}
  <button class="o" data-act="addTrip">+ Новая поездка</button>`;
}

function routeMap(rows) {
  const n = rows.length;
  const ys = [100, 50, 110, 45, 95, 55, 105, 50];
  const pts = rows.map((_, k) => ({ x: n > 1 ? 30 + (k * 260) / (n - 1) : 160, y: ys[k % 8] }));
  return `<svg viewBox="0 0 320 160" class="map" role="img" aria-label="Схема маршрута"><rect width="320" height="160" rx="12" fill="var(--map)"/><polyline points="${pts.map((p) => Math.round(p.x) + ',' + p.y).join(' ')}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-dasharray="6 4" stroke-linejoin="round"/>${pts.map((p, k) => `<circle cx="${Math.round(p.x)}" cy="${p.y}" r="11" fill="var(--accent)" stroke="#fff" stroke-width="2"/><text x="${Math.round(p.x)}" y="${p.y + 4}" text-anchor="middle" font-size="12" font-weight="700" fill="#fff">${k + 1}</text>`).join('')}<text x="8" y="152" font-size="11" fill="var(--muted)">Схема порядка, не карта</text></svg>`;
}

function tripDetail(t) {
  const places = tripPlaces(t.id);
  const td = L.tripDates(t.start, places);
  const costs = [['Авиабилеты', t.flights], ['Жильё', t.stay], ['Питание', t.food], ['Транспорт', t.transport], ['Развлечения', t.fun]];
  const names = places.map((p) => p.name);
  return `
  <button class="o" data-act="tripBack">← Все поездки</button>
  ${img(t.image, t.name, 'tp hero')}
  <div><h1>${esc(t.name)}</h1><div class="m">${t.start ? 'Старт ' + esc(t.start) + ' · ' : ''}лучшие месяцы: ${esc(t.best || '—')}</div></div>
  ${t.fareDrop > 0 ? `<section class="c hl"><b>Билеты дешевле обычного на ${t.fareDrop}%</b></section>` : ''}
  <section class="c"><div class="row"><h2>Детализация цен</h2><b>≈ ${L.fmt(L.tripBudget(t), t.currency)}</b></div>${costs.map(([n, v]) => `<div class="row"><span>${n}</span><span>${L.fmt(L.num(v), t.currency)}</span></div>`).join('')}</section>
  <section class="c"><div class="row"><h2>Маршрут и даты</h2><span class="m">${places.length ? 'Всего ' + L.nightsWord(td.nights) : ''}</span></div>
    ${places.length ? routeMap(td.rows) : '<div class="m">Мест пока нет.</div>'}
    ${places.length ? `<a class="gm" href="${esc(L.gmapsDirUrl(names))}" target="_blank" rel="noopener noreferrer">Открыть в Google Maps ↗</a>` : ''}
    ${td.rows.map((p, k) => `<div class="row"><span><b>${k + 1}. ${esc(p.name)}</b><span class="m sub">${L.ddmm(p.from)} – ${L.ddmm(p.to)} · ${L.nightsWord(p.nights)}</span><a class="lnk" href="${esc(L.gmapsPlaceUrl(p.name))}" target="_blank" rel="noopener noreferrer">На карте ↗</a></span><span class="f"><button class="q" data-act="nights" data-v="${k}" data-d="-1" aria-label="Меньше ночей">−</button><button class="q" data-act="nights" data-v="${k}" data-d="1" aria-label="Больше ночей">+</button></span></div>`).join('')}
    <div class="f"><button class="o grow" data-act="addPlace">+ Место</button><button class="o grow" data-act="importRoute">Загрузить из Google Maps</button></div>
  </section>`;
}

// ---------- Отрисовка ----------

const VIEWS = { budget: viewBudget, shop: viewShop, wish: viewWish, travel: viewTravel };
const TITLES = { budget: 'Бюджет', shop: 'Покупки', wish: 'Вишлист', travel: 'Путешествия' };

function render() {
  const scroll = window.scrollY;
  $('#title').textContent = TITLES[ui.tab];
  $('#view').innerHTML = VIEWS[ui.tab]();
  document.querySelectorAll('.nav button').forEach((b) => b.classList.toggle('on', b.dataset.v === ui.tab));
  const banner = S.status.offline
    ? `<div class="banner bad">Нет связи с таблицей, показаны последние сохранённые данные. ${esc(S.status.error)}</div>`
    : S.status.mode === 'demo' ? '<div class="banner">Демо-данные. Они хранятся только на этом устройстве. Таблицу можно подключить в настройках (⚙).</div>' : '';
  $('#banners').innerHTML = banner;
  $('#fab').hidden = !['budget', 'shop'].includes(ui.tab);
  window.scrollTo(0, scroll);
}

// ---------- Формы ----------

function field(f) {
  const id = 'f_' + f.name;
  const req = f.required ? 'required' : '';
  let input;
  if (f.type === 'select') input = `<select id="${id}" name="${f.name}" ${req}>${f.options.map((o) => `<option value="${esc(o)}" ${o === f.value ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  else if (f.type === 'photo') {
    return `<div class="fld photo" data-photo="${f.name}">${esc(f.label)}
      <input type="hidden" name="${f.name}" value="${esc(f.value || '')}">
      <div class="pv" hidden><img alt="" class="pvimg"><button type="button" class="o sm" data-photo-clear>Убрать</button></div>
      <label class="o filebtn">📷 Выбрать фото<input type="file" accept="image/*" hidden data-photo-file></label>
      <input type="url" class="pu" placeholder="или вставь ссылку на картинку" data-photo-url>
      <div class="m" data-photo-msg></div></div>`;
  }
  else if (f.type === 'textarea') input = `<textarea id="${id}" name="${f.name}" rows="4" placeholder="${esc(f.placeholder || '')}" ${req}></textarea>`;
  else input = `<input id="${id}" name="${f.name}" type="${f.type || 'text'}" ${f.type === 'number' ? 'inputmode="decimal" step="any"' : ''} value="${esc(f.value ?? '')}" placeholder="${esc(f.placeholder || '')}" ${req}>`;
  return `<label class="fld" for="${id}">${esc(f.label)}${input}</label>`;
}

function openForm({ title, fields, submit = 'Сохранить', hint = '', onSubmit, onOpen }) {
  const m = $('#modal');
  m.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="row"><h2>${esc(title)}</h2><button type="button" class="x" data-act="close" aria-label="Закрыть">×</button></div>${hint ? `<div class="m">${esc(hint)}</div>` : ''}<form novalidate>${fields.map(field).join('')}<button class="primary" type="submit">${esc(submit)}</button></form></div>`;
  m.hidden = false;
  const form = m.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const v = Object.fromEntries(new FormData(form));
    closeModal();
    const err = await onSubmit(v);
    if (err) toast(err);
    render();
  });
  wirePhotos(form);
  if (onOpen) onOpen(form);
  const first = form.querySelector('input,select,textarea');
  if (first) first.focus();
}

// Уменьшаем фото до небольшой миниатюры, чтобы оно влезло в ячейку таблицы (лимит 50 000 знаков).
function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      URL.revokeObjectURL(url);
      for (const [side, q] of [[360, 0.75], [300, 0.7], [240, 0.65], [180, 0.6]]) {
        const k = Math.min(1, side / Math.max(im.width, im.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(im.width * k));
        c.height = Math.max(1, Math.round(im.height * k));
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(im, 0, 0, c.width, c.height);
        const d = c.toDataURL('image/jpeg', q);
        if (d.length < 40000) return resolve(d);
      }
      reject(new Error('Фото слишком сложное, выбери другое.'));
    };
    im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Не удалось открыть это фото.')); };
    im.src = url;
  });
}

function wirePhotos(form) {
  form.querySelectorAll('[data-photo]').forEach((box) => {
    const hidden = box.querySelector('input[type=hidden]');
    const pv = box.querySelector('.pv');
    const pimg = box.querySelector('.pvimg');
    const msg = box.querySelector('[data-photo-msg]');
    const urlIn = box.querySelector('[data-photo-url]');
    const set = (v) => {
      hidden.value = v;
      pv.hidden = !v;
      if (v) pimg.src = v;
    };
    set(hidden.value);
    box.querySelector('[data-photo-file]').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      msg.textContent = 'Обрабатываю…';
      try { set(await shrinkImage(f)); urlIn.value = ''; msg.textContent = ''; } catch (err) { msg.textContent = err.message; }
    });
    urlIn.addEventListener('input', () => set(safeUrl(urlIn.value.trim())));
    box.querySelector('[data-photo-clear]').addEventListener('click', () => { set(''); urlIn.value = ''; });
  });
}

function closeModal() {
  $('#modal').hidden = true;
  $('#modal').innerHTML = '';
}

const isoToday = () => L.iso(new Date());

function formOp() {
  const country = ui.country;
  const cur = L.CUR[country];
  openForm({
    title: 'Новая операция',
    fields: [
      { name: 'type', label: 'Тип', type: 'select', options: ['Расход', 'Доход'], value: 'Расход' },
      { name: 'amount', label: 'Сумма', type: 'number', required: true },
      { name: 'currency', label: 'Валюта', type: 'select', options: ['₪', '₽'], value: cur },
      { name: 'category', label: 'Категория', type: 'select', options: [''] },
      { name: 'sub', label: 'Подкатегория', type: 'select', options: [''] },
      { name: 'desc', label: 'Описание', type: 'text', placeholder: 'например, такси' },
      { name: 'date', label: 'Дата', type: 'date', value: isoToday(), required: true },
    ],
    onOpen(form) {
      const fill = () => {
        const type = form.type.value;
        const c = L.COUNTRY_BY_CUR[form.currency.value];
        const cats = S.catsFor(type, c);
        const prev = form.category.value;
        form.category.innerHTML = cats.map((x) => `<option>${esc(x.name)}</option>`).join('');
        if (cats.some((x) => x.name === prev)) form.category.value = prev;
        const subs = (cats.find((x) => x.name === form.category.value) || { subs: [] }).subs;
        form.sub.innerHTML = '<option value=""></option>' + subs.map((s) => `<option>${esc(s)}</option>`).join('');
        form.sub.closest('label').hidden = subs.length === 0;
      };
      form.type.addEventListener('change', fill);
      form.currency.addEventListener('change', fill);
      form.category.addEventListener('change', fill);
      if (ui.tab === 'shop' && form.type.value === 'Расход') {
        form.currency.value = '₪';
        fill();
        if ([...form.category.options].some((o) => o.value === 'Продукты')) { form.category.value = 'Продукты'; fill(); }
      } else fill();
    },
    onSubmit: (v) => {
      const amount = L.num(v.amount);
      if (!(amount > 0)) return 'Сумма должна быть больше нуля.';
      const d = L.parseDate(v.date);
      const res = S.addOp({ date: v.date, type: v.type, country: L.COUNTRY_BY_CUR[v.currency], category: v.category, sub: v.sub || '', desc: v.desc || v.category, amount, currency: v.currency });
      return Promise.resolve(res).then((r) => {
        if (d && v.type === 'Расход' && v.category === 'Продукты' && v.currency === '₪') {
          ui.shopOff = (d.getFullYear() - today.getFullYear()) * 12 + d.getMonth() - today.getMonth();
          const w = L.weeksOfMonth(d.getFullYear(), d.getMonth()).find((x) => d >= x.start && L.iso(d) <= L.iso(x.end));
          if (w) { ui.openWeek = w.n; toast(`Записано в неделю ${w.n} (${L.ddmm(w.start)} – ${L.ddmm(w.end)})`); }
        }
        return typeof r === 'string' ? r : undefined;
      });
    },
  });
}

function formFuture() {
  openForm({
    title: 'Будущий расход',
    fields: [
      { name: 'name', label: 'Название', required: true },
      { name: 'amount', label: 'Сумма', type: 'number', required: true },
      { name: 'currency', label: 'Валюта', type: 'select', options: ['₪', '₽'], value: L.CUR[ui.country] },
      { name: 'date', label: 'Дата', type: 'date', required: true },
      { name: 'source', label: 'Источник', type: 'select', options: ['Налог', 'Вишлист', 'Путешествия', 'Покупки', 'Другое'], value: 'Налог' },
    ],
    onSubmit: (v) => S.addFuture({ date: v.date, name: v.name, amount: L.num(v.amount), currency: v.currency, source: v.source, note: '' }),
  });
}

function formWeekItem(w) {
  openForm({
    title: `Позиция на неделю ${w.n}`,
    fields: [{ name: 'name', label: 'Что купить', required: true }, { name: 'plan', label: 'Плановая цена, ₪', type: 'number', required: true }],
    onSubmit: (v) => S.addPlanItem({ weekStart: L.iso(w.start), name: v.name.trim(), plan: L.num(v.plan), currency: '₪', category: 'Продукты', sub: '', budget: weekPlan(w).budget }),
  });
}

function formBudget(w) {
  openForm({
    title: `Бюджет недели ${w.n}`,
    fields: [{ name: 'budget', label: 'Бюджет на закупку, ₪', type: 'number', required: true, value: weekPlan(w).budget || '' }],
    onSubmit: (v) => S.addPlanItem({ weekStart: L.iso(w.start), name: '(бюджет)', plan: 0, currency: '₪', category: '', sub: '', budget: L.num(v.budget) }),
  });
}

function formTracked() {
  openForm({
    title: 'Отслеживать товар',
    fields: [
      { name: 'name', label: 'Товар', required: true },
      { name: 'store', label: 'Магазин', value: 'Кешет Таамим' },
      { name: 'branch', label: 'Филиал', value: 'Кирьят-Хаим' },
      { name: 'threshold', label: 'Порог цены, ₪', type: 'number' },
      { name: 'image', label: 'Фото (необязательно)', type: 'photo' },
    ],
    onSubmit: (v) => S.addTracked({ name: v.name.trim(), store: v.store, branch: v.branch, threshold: L.num(v.threshold), last: 0, onSale: false, checked: '', image: (v.image || '').trim() }),
  });
}

function formWish(w) {
  const edit = !!w;
  const cur = w || {};
  openForm({
    title: edit ? `Изменить: ${cur.name}` : `Новая хотелка: ${ui.owner}`,
    submit: edit ? 'Сохранить изменения' : 'Сохранить',
    fields: [
      { name: 'name', label: 'Название', required: true, value: cur.name },
      { name: 'price', label: 'Примерная цена', type: 'number', value: cur.price || '' },
      { name: 'currency', label: 'Валюта', type: 'select', options: ['₪', '₽'], value: cur.currency || '₪' },
      { name: 'salePrice', label: 'Цена со скидкой (если есть)', type: 'number', value: cur.salePrice || '' },
      { name: 'saleStore', label: 'Где скидка', value: cur.saleStore || '' },
      { name: 'link', label: 'Ссылка на магазин', value: cur.link || '' },
      { name: 'image', label: 'Фото (необязательно)', type: 'photo', value: cur.image || '' },
      { name: 'desc', label: 'Описание', value: cur.desc || '' },
      { name: 'when', label: 'Когда планируешь купить', type: 'select', options: WHEN, value: cur.when || WHEN[0] },
      { name: 'priority', label: 'Приоритет', type: 'select', options: ['Высокий', 'Средний', 'Низкий'], value: cur.priority || 'Средний' },
    ],
    onSubmit: (v) => {
      const data = { name: v.name.trim(), price: L.num(v.price), currency: v.currency, salePrice: L.num(v.salePrice), saleStore: (v.saleStore || '').trim(), link: v.link.trim(), desc: v.desc.trim(), when: v.when, priority: v.priority, image: v.image.trim() };
      return edit ? S.updateWish(w, data) : S.addWish({ owner: ui.owner, ...data });
    },
  });
}

function formTrip() {
  openForm({
    title: 'Новая поездка',
    fields: [
      { name: 'name', label: 'Направление', required: true },
      { name: 'best', label: 'Лучшие месяцы', placeholder: 'например, апр – июн' },
      { name: 'start', label: 'Дата начала', type: 'date' },
      { name: 'currency', label: 'Валюта', type: 'select', options: ['₪', '₽'], value: '₪' },
      { name: 'flights', label: 'Авиабилеты', type: 'number' },
      { name: 'stay', label: 'Жильё', type: 'number' },
      { name: 'food', label: 'Питание', type: 'number' },
      { name: 'transport', label: 'Транспорт', type: 'number' },
      { name: 'fun', label: 'Развлечения', type: 'number' },
      { name: 'image', label: 'Фото (необязательно)', type: 'photo' },
    ],
    onSubmit: (v) => S.addTrip({ id: 'T' + Date.now().toString(36), name: v.name.trim(), best: v.best, start: v.start, currency: v.currency, flights: L.num(v.flights), stay: L.num(v.stay), food: L.num(v.food), transport: L.num(v.transport), fun: L.num(v.fun), fareDrop: 0, image: v.image.trim() }),
  });
}

function formPlace() {
  openForm({
    title: 'Новое место',
    hint: 'Лучше с городом, например «Колизей, Рим», тогда ссылка в Google Maps найдёт точное место.',
    fields: [{ name: 'name', label: 'Название', required: true }, { name: 'nights', label: 'Ночей', type: 'number', value: 2, required: true }],
    onSubmit: (v) => {
      const places = tripPlaces(ui.trip).map((p) => ({ name: p.name, nights: p.nights }));
      places.push({ name: v.name.trim(), nights: Math.max(1, Math.round(L.num(v.nights))) });
      return S.setPlaces(ui.trip, places);
    },
  });
}

function formRoute() {
  openForm({
    title: 'Маршрут из Google Maps',
    hint: 'Построй маршрут в Google Maps, скопируй длинную ссылку из адресной строки и вставь сюда. Можно и список мест, по одному в строке. Список мест заменится.',
    fields: [{ name: 'raw', label: 'Ссылка или список', type: 'textarea', placeholder: 'https://www.google.com/maps/dir/...', required: true }],
    submit: 'Импортировать',
    onSubmit: (v) => {
      const r = L.parseRoute(v.raw);
      if (r.error) return r.error;
      toast('Загружено мест: ' + r.names.length + '. Ночи выставлены по 2, поправь кнопками.');
      return S.setPlaces(ui.trip, r.names.map((name) => ({ name, nights: 2 })));
    },
  });
}

function formSettings() {
  openForm({
    title: 'Настройки',
    hint: S.isSheetMode() ? 'Подключена Google Таблица.' : 'Сейчас демо-режим. Вставь адрес и ключ из инструкции apps-script/README.md.',
    fields: [
      { name: 'who', label: 'Кто пользуется этим телефоном', type: 'select', options: ['Я', 'Муж'], value: S.settings.who },
      { name: 'url', label: 'Адрес скрипта (Apps Script)', value: S.settings.url, placeholder: 'https://script.google.com/macros/s/.../exec' },
      { name: 'key', label: 'Секретный ключ', type: 'password', value: S.settings.key },
    ],
    submit: 'Сохранить и перезагрузить',
    onSubmit: (v) => {
      S.saveSettings({ who: v.who, url: v.url.trim(), key: v.key.trim() });
      location.reload();
      return '';
    },
    onOpen(form) {
      if (!S.isSheetMode()) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'o';
        b.textContent = 'Сбросить демо-данные';
        b.addEventListener('click', () => { S.resetDemo(); closeModal(); render(); toast('Демо-данные восстановлены.'); });
        form.appendChild(b);
      }
    },
  });
}

// ---------- События ----------

const weekByN = (n) => L.weeksOfMonth(today.getFullYear(), today.getMonth()).find((w) => w.n === +n);

const ACTIONS = {
  close: () => closeModal(),
  nav: (v) => { ui.tab = v; ui.trip = null; render(); },
  country: (v) => { ui.country = v; render(); },
  monthPrev: () => { ui.monthOff -= 1; render(); },
  monthNext: () => { if (ui.monthOff < 0) ui.monthOff += 1; render(); },
  dtab: (v) => { ui.dtab = v; render(); },
  showAll: () => { ui.showAll = !ui.showAll; render(); },
  addOp: () => formOp(),
  addFuture: () => formFuture(),
  shopTab: (v) => { ui.shopTab = v; render(); },
  shopMonth: (v) => { ui.shopOff += +v; ui.openWeek = null; render(); },
  openWeek: (v) => { ui.openWeek = ui.openWeek === +v ? 0 : +v; render(); },
  addPlan: (v) => formWeekItem(weekByN(v)),
  setBudget: (v) => formBudget(weekByN(v)),
  addTracked: () => formTracked(),
  owner: (v) => { ui.owner = v; render(); },
  onlySale: () => { ui.onlySale = !ui.onlySale; render(); },
  addWish: () => formWish(),
  wishEdit: (v) => { const w = S.data.wishes[+v]; if (w) formWish(w); },
  wishView: (v) => { ui.wishView = v; render(); },
  wishBuy: async (v) => {
    const w = S.data.wishes[+v];
    if (!w) return;
    const err = await S.setWishBought(w, isoToday());
    toast(err || `«${w.name}» куплено! Смотри во вкладке «Достижения»`);
    render();
  },
  wishUnbuy: async (v) => {
    const w = S.data.wishes[+v];
    if (!w) return;
    const err = await S.setWishBought(w, '');
    if (err) toast(err);
    render();
  },
  wishDel: (v) => {
    const w = S.data.wishes[+v];
    if (!w) return;
    openForm({
      title: `Удалить «${w.name}»?`, fields: [], submit: 'Удалить',
      hint: 'Хотелка будет удалена из списка и из таблицы. Это нельзя отменить.',
      onSubmit: () => S.deleteWish(w),
    });
  },
  wishPlus: async (v) => {
    const w = S.data.wishes[+v];
    if (!w) return;
    const err = await S.setWishSaved(w, Math.min(L.wishGoal(w) || Infinity, L.num(w.saved) + 100));
    if (err) toast(err);
    render();
  },
  trip: (v) => { ui.trip = v; window.scrollTo(0, 0); render(); },
  tripBack: () => { ui.trip = null; render(); },
  addTrip: () => formTrip(),
  addPlace: () => formPlace(),
  importRoute: () => formRoute(),
  nights: async (v, el) => {
    const places = tripPlaces(ui.trip).map((p) => ({ name: p.name, nights: p.nights }));
    const k = +v;
    if (!places[k]) return;
    places[k].nights = Math.max(1, places[k].nights + +el.dataset.d);
    const err = await S.setPlaces(ui.trip, places);
    if (err) toast(err);
    render();
  },
  settings: () => formSettings(),
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (el && ACTIONS[el.dataset.act]) ACTIONS[el.dataset.act](el.dataset.v, el);
  else if (e.target.id === 'modal') closeModal();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

document.querySelectorAll('.nav button').forEach((b) => { b.dataset.act = 'nav'; });

(async function start() {
  const cw = L.weeksOfMonth(today.getFullYear(), today.getMonth()).find((w) => today >= w.start && today <= w.end);
  ui.openWeek = cw ? cw.n : null;
  render();
  await S.init();
  $('#loading').hidden = true;
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
