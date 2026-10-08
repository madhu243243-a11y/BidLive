const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = {
  URL,
  historyContainer: { innerHTML: '' },
  document: { addEventListener() {}, getElementById() { return context.historyContainer; } },
  window: { location: { href: 'http://localhost:5500/auction-details.html' } }
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/main.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/auctions.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/bidding.js'), 'utf8'), context);

test('auction image helper uses a safe placeholder for null and invalid URLs', () => {
  const image = { dataset: {}, src: '', alt: '', onerror: null };
  context.image = image;
  vm.runInContext('setAuctionImage(image, null)', context);
  assert.match(image.src, /^https:\/\//);
  assert.doesNotMatch(image.src, /\/null$/);
  image.onerror();
  assert.match(image.src, /^https:\/\//);
  vm.runInContext('setAuctionImage(image, "javascript:alert(1)")', context);
  assert.match(image.src, /^https:\/\//);
});

test('valid auction image URLs remain unchanged and text escaping encodes HTML syntax', () => {
  const image = { dataset: {}, src: '', alt: '', onerror: null };
  context.image = image;
  vm.runInContext('setAuctionImage(image, "https://cdn.example.test/item.jpg")', context);
  assert.equal(image.src, 'https://cdn.example.test/item.jpg');
  assert.equal(vm.runInContext('escapeHTML(`<img src=x onerror=alert(1)>`) ', context), '&lt;img src=x onerror=alert(1)&gt;');
});

test('auction card and real-time bid-history renderers escape untrusted user text', () => {
  const card = vm.runInContext(`createAuctionCardHTML({id:7,category:'<svg onload=x>',title:'<img src=x onerror=alert(1)>',imageUrl:null,endTimestamp:Date.now()+60000,currentBid:100,bidsCount:0})`, context);
  assert.ok(card.includes('&lt;svg onload=x&gt;'));
  assert.ok(card.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!card.includes('<img src=x onerror=alert(1)>'));

  context.history = [{ bidder: '<img src=x onerror=alert(1)>', amount: 100, time: '<svg onload=x>' }];
  vm.runInContext('renderBidHistory(history)', context);
  assert.ok(context.historyContainer.innerHTML.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(context.historyContainer.innerHTML.includes('&lt;svg onload=x&gt;'));
  assert.ok(!context.historyContainer.innerHTML.includes('<img src=x onerror=alert(1)>'));
});
