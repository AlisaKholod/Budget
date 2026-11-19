import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Проверяем Code.gs на поддельной таблице: любые листы доступны, служебные скрыты или только для чтения.
function setup(sheetsData) {
  const appended = [];
  const sheets = Object.entries(sheetsData).map(([name, vals]) => ({
    getName: () => name,
    getDataRange: () => ({ getValues: () => vals }),
    appendRow: (v) => appended.push([name, v]),
  }));
  const ss = {
    getSpreadsheetTimeZone: () => 'UTC',
    getSheets: () => sheets,
    getSheetByName: (n) => sheets.find((s) => s.getName() === n) || null,
  };
  const out = { text: '' };
  const ctx = vm.createContext({
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ t, setMimeType() { return this; } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'K' }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: { formatDate: () => '2026-11-19' },
    UrlFetchApp: {},
    Logger: {},
  });
  vm.runInContext(fs.readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8'), ctx);
  return { ctx, appended, out };
}

test('doGet отдаёт любые листы и версию, скрывает «Сводка» и листы с «_»', () => {
  const { ctx } = setup({ 'Операции': [['a']], 'Новый лист': [['b']], 'Сводка': [['x']], '_служебный': [['y']] });
  const r = JSON.parse(ctx.doGet({ parameter: { action: 'all', key: 'K' } }).t);
  assert.equal(r.ok, true);
  assert.ok(r.version >= 3);
  assert.deepEqual(Object.keys(r.data).sort(), ['Новый лист', 'Операции']);
});

test('doGet без ключа отказывает', () => {
  const { ctx } = setup({ 'Операции': [['a']] });
  assert.equal(JSON.parse(ctx.doGet({ parameter: { action: 'all', key: 'bad' } }).t).ok, false);
});

test('doPost: новый лист можно писать, служебные и «Категории» нельзя', () => {
  const { ctx, appended } = setup({ 'Жильё': [['h']], 'Категории': [['h']], 'Сводка': [['h']] });
  const post = (b) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ key: 'K', ...b }) } }).t);
  assert.equal(post({ action: 'append', sheet: 'Жильё', values: [1] }).ok, true);
  assert.equal(JSON.stringify(appended), JSON.stringify([['Жильё', [1]]]));
  assert.equal(post({ action: 'append', sheet: 'Категории', values: [1] }).ok, false);
  assert.equal(post({ action: 'append', sheet: 'Сводка', values: [1] }).ok, false);
  assert.equal(post({ action: 'ping' }).version >= 3, true);
});
