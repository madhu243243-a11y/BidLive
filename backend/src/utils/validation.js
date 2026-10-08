const ALLOWED_ROLES = new Set(['buyer', 'seller']);
const ALLOWED_CATEGORIES = new Set([
  'Electronics', 'Mobiles', 'Laptops', 'Fashion', 'Watches', 'Cameras', 'Vehicles', 'Collectibles'
]);

function validEmail(email) {
  return typeof email === 'string' && email.length <= 150 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function parsePositiveId(value) {
  if (typeof value === 'number') return Number.isInteger(value) && value > 0 && value <= 2147483647 ? value : null;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id <= 2147483647 ? id : null;
}

function validFutureDate(value) {
  if (typeof value !== 'string') return false;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|([+-])(\d{2}):(\d{2}))$/);
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText = '00', fractionText = '', zone, , offsetHourText, offsetMinuteText] = match;
  const [year, month, day, hour, minute, second] = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number);
  if (year < 1000 || month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) return false;
  if (zone !== 'Z' && (Number(offsetHourText) > 23 || Number(offsetMinuteText) > 59)) return false;
  const calendar = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && time > Date.now();
}

function validImageUrl(value) {
  if (value === undefined || value === null || value === '') return true;
  if (typeof value !== 'string' || value.length > 500) return false;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname) && !url.username && !url.password;
  } catch (error) { return false; }
}

function validDecimalAmount(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return false;
  const text = String(value);
  return /^\d+(?:\.\d{1,2})?$/.test(text) && Number.isFinite(Number(value)) && Number(value) < 100000000;
}

function validAuctionInput(input, partial = false) {
  const errors = [];
  const has = (key) => Object.prototype.hasOwnProperty.call(input, key);
  if ((!partial || has('title')) && (typeof input.title !== 'string' || input.title.trim().length < 5 || input.title.trim().length > 160)) errors.push('Title must be between 5 and 160 characters.');
  if ((!partial || has('description')) && (typeof input.description !== 'string' || input.description.trim().length < 15 || input.description.trim().length > 10000)) errors.push('Description must be between 15 and 10000 characters.');
  if ((!partial || has('category')) && !ALLOWED_CATEGORIES.has(input.category)) errors.push('Choose a valid auction category.');
  if ((!partial || has('startingPrice')) && (!validDecimalAmount(input.startingPrice) || Number(input.startingPrice) < 1)) errors.push('Starting price must be between 1 and 99,999,999.99, with no more than 2 decimal places.');
  if (has('minimumIncrement') && (!validDecimalAmount(input.minimumIncrement) || Number(input.minimumIncrement) < 1)) errors.push('Minimum increment must be between 1 and 99,999,999.99, with no more than 2 decimal places.');
  if ((!partial || has('endTime')) && !validFutureDate(input.endTime)) errors.push('Auction end time must be a valid future date in ISO format.');
  if (has('imageUrl') && !validImageUrl(input.imageUrl)) errors.push('Image URL must be a valid HTTP or HTTPS URL no longer than 500 characters.');
  return errors;
}

module.exports = { ALLOWED_ROLES, ALLOWED_CATEGORIES, validEmail, validDecimalAmount, validAuctionInput, parsePositiveId, validFutureDate, validImageUrl };

