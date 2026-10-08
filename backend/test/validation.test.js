const test = require('node:test');
const assert = require('node:assert/strict');
const { validEmail, validDecimalAmount, validAuctionInput, ALLOWED_ROLES, parsePositiveId, validFutureDate, validImageUrl } = require('../src/utils/validation');

const validAuction = {
  title: 'Vintage Camera',
  description: 'A detailed camera lot description.',
  category: 'Cameras',
  startingPrice: 1000,
  minimumIncrement: 100,
  endTime: new Date(Date.now() + 60_000).toISOString()
};

test('registration accepts only the supported buyer and seller roles', () => {
  assert.deepEqual([...ALLOWED_ROLES].sort(), ['buyer', 'seller']);
});

test('email validation accepts a normal address and rejects malformed values', () => {
  assert.equal(validEmail('buyer@example.com'), true);
  assert.equal(validEmail('not-an-email'), false);
});

test('auction validation accepts an allowed category and future end time', () => {
  const errors = validAuctionInput({ title: 'Vintage Camera', description: 'A detailed camera lot description.', category: 'Cameras', startingPrice: 1000, minimumIncrement: 100, endTime: new Date(Date.now() + 60_000).toISOString() });
  assert.deepEqual(errors, []);
});

test('auction validation rejects invalid category, excessive price, and ended time', () => {
  const errors = validAuctionInput({ ...validAuction, category: 'Other', startingPrice: 100_000_000, endTime: new Date(Date.now() - 60_000).toISOString() });
  assert.equal(errors.length, 3);
});

test('starting price accepts 1 and 1.00 at the DECIMAL(10,2) minimum', () => {
  assert.deepEqual(validAuctionInput({ ...validAuction, startingPrice: 1 }), []);
  assert.deepEqual(validAuctionInput({ ...validAuction, startingPrice: '1.00' }), []);
});

test('starting price rejects values below 1, negative, zero, and non-numeric inputs', () => {
  for (const startingPrice of [0.99, 0.001, 0, -1, 'not-a-number']) {
    assert.ok(validAuctionInput({ ...validAuction, startingPrice }).some(error => error.startsWith('Starting price')),
      `expected ${String(startingPrice)} to be rejected`);
  }
});

test('DECIMAL(10,2) amount validation rejects excess precision and overflow', () => {
  assert.equal(validDecimalAmount(1), true);
  assert.equal(validDecimalAmount('99999999.99'), true);
  assert.equal(validDecimalAmount(99_999_999.99), true);
  assert.equal(validDecimalAmount(100_000_000), false);
  assert.equal(validDecimalAmount(99_999_999.999), false);
  assert.equal(validDecimalAmount(1.001), false);
});

test('positive IDs reject malformed, out-of-range, and non-integer values', () => {
  assert.equal(parsePositiveId('12'), 12);
  assert.equal(parsePositiveId(12), 12);
  for (const value of ['0', '-1', '1.0', '1e2', ' 1', '2147483648', 1.1, true, null]) assert.equal(parsePositiveId(value), null);
});

test('auction end times require a valid future ISO timestamp with timezone', () => {
  assert.equal(validFutureDate(new Date(Date.now() + 60_000).toISOString()), true);
  for (const value of ['2030-02-30T10:00:00Z', '2030-01-01', 'not-a-date', 123, new Date(Date.now() - 60_000).toISOString()]) assert.equal(validFutureDate(value), false);
});

test('image URL validation allows absent values and valid HTTP(S) URLs only', () => {
  assert.equal(validImageUrl(null), true);
  assert.equal(validImageUrl('https://cdn.example.com/image.jpg'), true);
  assert.equal(validImageUrl('javascript:alert(1)'), false);
  assert.equal(validImageUrl('https://user:pass@example.com/img.jpg'), false);
  assert.equal(validImageUrl({}), false);
});

test('auction validation enforces typed, bounded fields', () => {
  const future = new Date(Date.now() + 60_000).toISOString();
  assert.ok(validAuctionInput({ ...validAuction, title: 'x'.repeat(161), imageUrl: 'javascript:alert(1)', endTime: future }).length >= 2);
  assert.ok(validAuctionInput({ ...validAuction, description: 'x'.repeat(10001), imageUrl: 42, endTime: future }).length >= 2);
});

