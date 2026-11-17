/**
 * Мост между приложением «Бюджет» и Google Таблицей.
 *
 * Как подключить: см. apps-script/README.md.
 * Ключ доступа хранится в «Свойствах скрипта» (KEY), а не в коде.
 */

// Листы, которые приложение может читать и менять.
var SHEETS = ['Операции', 'Категории', 'Люди', 'Правила', 'План недели', 'Будущие расходы', 'Вишлист', 'Скидки', 'Поездки', 'Места'];
var WRITABLE = ['Операции', 'Вишлист', 'Будущие расходы', 'План недели', 'Скидки', 'Поездки', 'Места'];

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
    SHEETS.forEach(function (name) {
      var sh = ss.getSheetByName(name);
      if (!sh) return;
      var vals = sh.getDataRange().getValues();
      data[name] = vals.map(function (row) { return row.map(function (v) { return plain_(v, tz); }); });
    });
    return out_({ ok: true, data: data });
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var body = JSON.parse(e.postData.contents);
    if (!authorized_(body.key)) return out_({ ok: false, error: 'Неверный ключ' });
    if (WRITABLE.indexOf(body.sheet) < 0) return out_({ ok: false, error: 'Этот лист менять нельзя' });
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
    try { lock.releaseLock(); } catch (x) { /* замок не был взят */ }
  }
}

/** Запусти один раз вручную: создаст случайный ключ и покажет его в журнале. */
function createKey() {
  var key = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('KEY', key);
  Logger.log('Ключ: ' + key);
}
