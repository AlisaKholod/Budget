/**
 * Мост между приложением «Бюджет» и Google Таблицей.
 *
 * Как подключить: см. apps-script/README.md.
 * Ключ доступа хранится в «Свойствах скрипта» (KEY), а не в коде.
 */

// Версия скрипта. Приложение сравнивает её со своей и подсказывает, если скрипт нужно обновить.
// Новые листы и поля приложения подхватываются сами: скрипт работает с любыми листами таблицы.
var VERSION = 3;

// Листы, которые приложение не должно менять (их ты правишь в таблице руками или они считаются формулами).
var READ_ONLY = ['Категории', 'Люди', 'Правила'];
// Листы, которые приложению вообще не отдаём. Лист с названием, начинающимся с «_», тоже скрыт.
var HIDDEN = ['Сводка'];

function isHidden_(name) {
  return HIDDEN.indexOf(name) >= 0 || name.charAt(0) === '_';
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function authorized_(key) {
  var real = PropertiesService.getScriptProperties().getProperty('KEY');
  return !!real && key === real;
}

// Даты отдаём строкой «ГГГГ-ММ-ДД» в часовом поясе таблицы, чтобы не было сдвига на день.
function plain_(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  return v;
}

function doGet(e) {
  try {
    var p = e.parameter || {};
    if (!authorized_(p.key)) return out_({ ok: false, error: 'Неверный ключ' });
    if (p.action !== 'all') return out_({ ok: false, error: 'Неизвестное действие' });
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var tz = ss.getSpreadsheetTimeZone();
    var data = {};
    ss.getSheets().forEach(function (sh) {
      var name = sh.getName();
      if (isHidden_(name)) return;
      var vals = sh.getDataRange().getValues();
      data[name] = vals.map(function (row) { return row.map(function (v) { return plain_(v, tz); }); });
    });
    return out_({ ok: true, version: VERSION, data: data });
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  var locked = false;
  try {
    var body = JSON.parse(e.postData.contents);
    if (!authorized_(body.key)) return out_({ ok: false, error: 'Неверный ключ' });
    // Поиск цены не трогает таблицу, поэтому делаем его без блокировки.
    if (body.action === 'price') { var pr = lookupPrice_(body.url, body.mode); pr.version = VERSION; return out_(pr); }
    if (body.action === 'ping') return out_({ ok: true, version: VERSION });
    lock.waitLock(20000);
    locked = true;
    if (isHidden_(String(body.sheet)) || READ_ONLY.indexOf(body.sheet) >= 0) return out_({ ok: false, error: 'Этот лист менять нельзя' });
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(body.sheet);
    if (!sh) return out_({ ok: false, error: 'Нет листа ' + body.sheet });

    if (body.action === 'append') {
      sh.appendRow(body.values);
      return out_({ ok: true });
    }
    if (body.action === 'update') {
      // Меняем значения в строке body.row, начиная со столбца body.col (оба с единицы).
      if (!(body.row >= 2)) return out_({ ok: false, error: 'Нельзя менять заголовок' });
      sh.getRange(body.row, body.col, 1, body.values.length).setValues([body.values]);
      return out_({ ok: true });
    }
    if (body.action === 'replaceWhere') {
      // Заменяем все строки, где в столбце keyCol стоит keyValue, на body.rows.
      var vals = sh.getDataRange().getValues();
      for (var r = vals.length; r >= 2; r--) {
        if (String(vals[r - 1][body.keyCol - 1]) === String(body.keyValue)) sh.deleteRow(r);
      }
      body.rows.forEach(function (row) { sh.appendRow(row); });
      return out_({ ok: true });
    }
    if (body.action === 'deleteRow') {
      // Удаляем строку body.row, только если в столбце checkCol стоит checkValue (защита от сдвига строк).
      if (!(body.row >= 2)) return out_({ ok: false, error: 'Нельзя удалить заголовок' });
      var cur = sh.getRange(body.row, body.checkCol).getValue();
      if (String(cur) !== String(body.checkValue)) return out_({ ok: false, error: 'Строка изменилась, обнови страницу' });
      sh.deleteRow(body.row);
      return out_({ ok: true });
    }
    return out_({ ok: false, error: 'Неизвестное действие' });
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  } finally {
    if (locked) { try { lock.releaseLock(); } catch (x) { /* уже снят */ } }
  }
}

/** Запусти один раз вручную: создаст случайный ключ и покажет его в журнале. */
function createKey() {
  var key = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('KEY', key);
  Logger.log('Ключ: ' + key);
}

// ---------- Цена товара по ссылке ----------

/** "10,000.00" и "10.000,00" и "10 000" -> число. */
function parseMoney_(s) {
  if (typeof s === 'number') return s;
  s = String(s == null ? '' : s).replace(/[^0-9.,]/g, '');
  if (!s) return 0;
  var lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    if (lastDot > lastComma) s = s.replace(/,/g, '');
    else s = s.replace(/\./g, '').replace(',', '.');
  } else if (lastComma >= 0) {
    // «1,234» — тысячи; «12,5» — десятичная запятая
    s = /,\d{3}$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (lastDot >= 0 && /\.\d{3}$/.test(s) && s.indexOf('.') === lastDot) {
    s = s.replace('.', '');
  }
  var n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

function metaContent_(html, names) {
  for (var i = 0; i < names.length; i++) {
    var n = names[i].replace(/[:.]/g, '\\$&');
    var re1 = new RegExp('<meta[^>]+(?:property|name|itemprop)=["\']' + n + '["\'][^>]*content=["\']([^"\']*)["\']', 'i');
    var re2 = new RegExp('<meta[^>]+content=["\']([^"\']*)["\'][^>]*(?:property|name|itemprop)=["\']' + n + '["\']', 'i');
    var m = html.match(re1) || html.match(re2);
    if (m && m[1]) return m[1];
  }
  return '';
}

function collectProducts_(node, out) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach(function (x) { collectProducts_(x, out); }); return; }
  var t = node['@type'];
  var types = Array.isArray(t) ? t : [t];
  if (types.indexOf('Product') >= 0 || types.indexOf('ProductGroup') >= 0) out.push(node);
  if (node['@graph']) collectProducts_(node['@graph'], out);
  if (node.hasVariant) collectProducts_(node.hasVariant, out);
}

function offersOf_(p) {
  var o = p.offers;
  if (!o) return [];
  if (!Array.isArray(o)) o = [o];
  var list = [];
  o.forEach(function (x) {
    if (x && x.offers) list = list.concat(offersOf_({ offers: x.offers }));
    else if (x) list.push(x);
  });
  return list;
}

function offerPrice_(o) {
  var spec = Array.isArray(o.priceSpecification) ? o.priceSpecification[0] : o.priceSpecification;
  return parseMoney_(o.price != null ? o.price : (o.lowPrice != null ? o.lowPrice : (spec && spec.price)));
}

/** Достаёт из HTML страницы название, цену, валюту и картинку. Чистая функция, её можно тестировать. */
function parseProduct_(html, pageUrl) {
  var res = { price: 0, currency: '', title: '', image: '', several: false };
  var variant = (String(pageUrl || '').match(/[?&]variant=(\d+)/) || [])[1];
  var products = [];
  var re = /<script[^>]+type=["\']application\/ld\+json["\'][^>]*>([\s\S]*?)<\/script>/gi;
  var m;
  while ((m = re.exec(html))) {
    try { collectProducts_(JSON.parse(m[1].trim()), products); } catch (err) { /* битый блок пропускаем */ }
  }
  var offers = [];
  products.forEach(function (p) {
    if (!res.title && p.name) res.title = String(p.name);
    if (!res.image && p.image) res.image = String(Array.isArray(p.image) ? (p.image[0].url || p.image[0]) : (p.image.url || p.image));
    offers = offers.concat(offersOf_(p));
  });
  offers = offers.filter(function (o) { return offerPrice_(o) > 0; });
  if (offers.length) {
    var chosen = null;
    if (variant) chosen = offers.filter(function (o) { return String(o.url || o['@id'] || o.sku || '').indexOf(variant) >= 0; })[0] || null;
    if (!chosen) {
      chosen = offers.reduce(function (a, b) { return offerPrice_(b) < offerPrice_(a) ? b : a; });
      res.several = offers.some(function (o) { return offerPrice_(o) !== offerPrice_(chosen); });
    }
    res.price = offerPrice_(chosen);
    res.currency = String(chosen.priceCurrency || '');
  }
  if (!res.price) {
    res.price = parseMoney_(metaContent_(html, ['product:price:amount', 'og:price:amount', 'price']));
    res.currency = metaContent_(html, ['product:price:currency', 'og:price:currency', 'priceCurrency']);
  }
  if (!res.title) res.title = metaContent_(html, ['og:title']) || ((html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '').trim();
  if (!res.image) res.image = metaContent_(html, ['og:image']);
  return res;
}

function lookupPrice_(url, mode) {
  url = String(url || '').trim();
  if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'Нужна ссылка, начинающаяся с http' };
  var resp;
  try {
    resp = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8,ru;q=0.7'
      }
    });
  } catch (err) {
    return { ok: false, error: 'Не удалось открыть страницу' };
  }
  var code = resp.getResponseCode();
  if (code >= 400) return { ok: false, error: 'Магазин не пустил (код ' + code + ')' };
  var html = resp.getContentText().slice(0, 1500000);
  var p = parseProduct_(html, url);
  if (!(p.price > 0) && mode === 'min') {
    // Для билетов: если у страницы нет «товарной» разметки, ищем самую низкую цену в тексте.
    var t = textMin_(html);
    if (t) { p.price = t.price; p.currency = t.currency; p.approx = true; p.count = t.count; }
  }
  if (!(p.price > 0)) return { ok: false, error: 'На странице не нашлась цена (возможно, она подгружается скриптами)' };
  p.host = (url.match(/^https?:\/\/(?:www\.)?([^\/?#]+)/i) || [])[1] || '';
  p.ok = true;
  return p;
}

var CUR_SYMBOLS_ = { '₪': 'ILS', '$': 'USD', '€': 'EUR', '₽': 'RUB' };

/** Самая низкая цена среди упоминаний вида «₪1,250» или «1 250 ₪» в тексте страницы; берём валюту, которой больше всего. */
function textMin_(html) {
  var text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
  var found = {};
  var num = '(\\d{1,3}(?:[ ,.\\u00a0]\\d{3})+(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)';
  var re = new RegExp('([₪$€₽])\\s?' + num + '|' + num + '\\s?([₪$€₽])', 'g');
  var m;
  while ((m = re.exec(text))) {
    var sym = m[1] || m[4];
    var val = parseMoney_((m[2] || m[3]).replace(/[\u00a0 ]/g, ''));
    if (val < 30 || val > 1000000) continue;
    (found[sym] = found[sym] || []).push(val);
  }
  var best = null;
  Object.keys(found).forEach(function (s) { if (!best || found[s].length > found[best].length) best = s; });
  if (!best) return null;
  return { price: Math.min.apply(null, found[best]), currency: CUR_SYMBOLS_[best], count: found[best].length };
}
