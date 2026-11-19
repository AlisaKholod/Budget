import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Code.gs — обычный JS без модулей: загружаем его в песочницу вместе с заглушками сервисов Google.
const ctx = vm.createContext({ ContentService: {}, PropertiesService: {}, SpreadsheetApp: {}, LockService: {}, Utilities: {}, Logger: {}, UrlFetchApp: {} });
vm.runInContext(fs.readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8'), ctx);
const { parseProduct_, parseMoney_ } = ctx;
const ld = (o) => `<html><head><script type="application/ld+json">${JSON.stringify(o)}</script></head></html>`;

test('parseMoney_: форматы чисел', () => {
  assert.equal(parseMoney_('10,000.00'), 10000);
  assert.equal(parseMoney_('10.000,50'), 10000.5);
  assert.equal(parseMoney_('₪ 8 600'), 8600);
  assert.equal(parseMoney_('12,5'), 12.5);
  assert.equal(parseMoney_('1,234'), 1234);
  assert.equal(parseMoney_(''), 0);
});

test('JSON-LD: одна цена', () => {
  const r = parseProduct_(ld({ '@type': 'Product', name: 'Чайник', image: 'https://x/i.jpg', offers: { '@type': 'Offer', price: '199.90', priceCurrency: 'ILS' } }), 'https://shop/p');
  assert.equal(r.price, 199.9);
  assert.equal(r.currency, 'ILS');
  assert.equal(r.title, 'Чайник');
  assert.equal(r.image, 'https://x/i.jpg');
});

test('JSON-LD: несколько вариантов — берём тот, что в ссылке (variant=)', () => {
  const html = ld({ '@type': 'Product', name: 'Телефон', offers: [
    { price: '8600', priceCurrency: 'ILS', url: 'https://s/p?variant=111' },
    { price: '10000', priceCurrency: 'ILS', url: 'https://s/p?variant=222' },
  ] });
  assert.equal(parseProduct_(html, 'https://s/p?variant=222').price, 10000);
  const any = parseProduct_(html, 'https://s/p');
  assert.equal(any.price, 8600);
  assert.equal(any.several, true);
});

test('@graph и AggregateOffer', () => {
  const r = parseProduct_(ld({ '@graph': [{ '@type': 'WebSite' }, { '@type': 'Product', name: 'A', offers: { '@type': 'AggregateOffer', lowPrice: '50', priceCurrency: 'ILS' } }] }), '');
  assert.equal(r.price, 50);
});

test('запасной вариант: meta-теги', () => {
  const html = '<html><head><title>Тест</title><meta property="og:title" content="Товар"><meta property="product:price:amount" content="1,299.00"><meta property="product:price:currency" content="ILS"><meta property="og:image" content="https://x/o.png"></head></html>';
  const r = parseProduct_(html, '');
  assert.equal(r.price, 1299);
  assert.equal(r.currency, 'ILS');
  assert.equal(r.title, 'Товар');
  assert.equal(r.image, 'https://x/o.png');
});

test('цены нет', () => {
  assert.equal(parseProduct_('<html><title>X</title></html>', '').price, 0);
});
