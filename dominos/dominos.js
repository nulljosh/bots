/**
 * Dominos Pizza API - Unofficial Node.js wrapper
 * Reverse-engineered endpoints for store finder, menu, tracker, and orders.
 * Supports US and Canadian regions.
 * 
 * Incorporates patterns from RIAEvangelist/node-dominos-pizza-api (576 stars)
 * for battle-tested order placement, item options, and payment validation.
 */

const REGIONS = {
  us: { order: 'https://order.dominos.com', tracker: 'https://tracker.dominos.com', lang: 'en', tld: 'com' },
  ca: { order: 'https://order.dominos.ca', tracker: 'https://tracker.dominos.com', lang: 'en', tld: 'ca' },
};

const HEADERS = {
  'Referer': 'https://order.dominos.com/en/pages/order/',
  'Content-Type': 'application/json',
  'Accept': 'application/json',
};

// Common pizza codes (from node-dominos-pizza-api)
const ITEMS = {
  // Pizzas (14" = large, 12" = medium, 10" = small)
  '14SCREEN': 'Large Hand Tossed',
  '14THIN': 'Large Thin Crust',
  'P14IBKPX': 'Large Brooklyn Style',
  '12SCREEN': 'Medium Hand Tossed',
  '12THIN': 'Medium Thin Crust',
  '10SCREEN': 'Small Hand Tossed',
  'P_14SCREEN': 'Large Pan',
  // Toppings: X=sauce, C=cheese, P=pepperoni, S=sausage, M=mushroom, O=onion, G=green pepper
  // Format: { 'TOPPING': { '1/1': '1' } } where 1/1=whole, 1/2=left, 2/2=right, '1'=normal, '1.5'=extra, '2'=double
};

// Card type detection (from node-dominos-pizza-api Payment.js)
const CARD_PATTERNS = {
  VISA: /^4[0-9]{12}(?:[0-9]{3})?$/,
  MASTERCARD: /^5[1-5][0-9]{14}$/,
  AMEX: /^3[47][0-9]{13}$/,
  DINERS: /^3(?:0[0-5]|[68][0-9])[0-9]{11}$/,
  DISCOVER: /^6(?:011|5[0-9]{2})[0-9]{12}$/,
};

function detectCardType(number) {
  const clean = number.replace(/\D/g, '');
  for (const [type, re] of Object.entries(CARD_PATTERNS)) {
    if (re.test(clean)) return type;
  }
  return null;
}

async function request(url, options = {}) {
  const res = await fetch(url, { headers: HEADERS, ...options });
  if (!res.ok) throw new Error(`Dominos API ${res.status}: ${res.statusText} — ${url}`);
  return res.json();
}

// --- Store Finder ---

class StoreFinder {
  constructor(baseUrl, lang) {
    this.baseUrl = baseUrl;
    this.lang = lang;
  }

  async find(address, type = 'Delivery') {
    let street, city;
    if (typeof address === 'object') {
      street = address.street;
      city = address.city;
    } else {
      const parts = address.split(',').map(s => s.trim());
      street = parts[0] || '';
      city = parts.slice(1).join(', ');
    }
    const url = `${this.baseUrl}/power/store-locator?s=${encodeURIComponent(street)}&c=${encodeURIComponent(city)}&type=${type}`;
    const data = await request(url);
    return data.Stores || [];
  }

  async profile(storeId) {
    return request(`${this.baseUrl}/power/store/${storeId}/profile`);
  }
}

// --- Menu ---

class Menu {
  constructor(baseUrl, lang) {
    this.baseUrl = baseUrl;
    this.lang = lang;
  }

  async get(storeId) {
    return request(`${this.baseUrl}/power/store/${storeId}/menu?lang=${this.lang}&structured=true`);
  }

  async coupon(storeId, couponId) {
    return request(`${this.baseUrl}/power/store/${storeId}/coupon/${couponId}?lang=${this.lang}`);
  }

  static filterByCategory(menuData, category) {
    const cats = menuData.Categorization?.FoodCategorization?.Categories || [];
    return cats.find(c => c.Code === category) || null;
  }

  static searchItems(menuData, query) {
    const products = menuData.Products || {};
    const q = query.toLowerCase();
    return Object.entries(products)
      .filter(([, item]) => item.Name?.toLowerCase().includes(q))
      .map(([code, item]) => ({ code, ...item }));
  }

  static getCategories(menuData) {
    return (menuData.Categorization?.FoodCategorization?.Categories || [])
      .map(c => ({ code: c.Code, name: c.Name, count: c.Products?.length || 0 }));
  }
}

// --- Order Tracker ---

class Tracker {
  constructor(trackerUrl) {
    this.trackerUrl = trackerUrl;
  }

  async _fetch(url) {
    const res = await fetch(url, {
      headers: { 'Referer': 'https://order.dominos.com/en/pages/order/' },
    });
    if (!res.ok) throw new Error(`Tracker ${res.status}: ${res.statusText}`);
    return Tracker.parseXml(await res.text());
  }

  async byPhone(phone) {
    return this._fetch(`${this.trackerUrl}/orderstorage/GetTrackerData?Phone=${phone.replace(/\D/g, '')}`);
  }

  async byId(storeId, orderKey) {
    return this._fetch(`${this.trackerUrl}/orderstorage/GetTrackerData?StoreID=${storeId}&OrderKey=${orderKey}`);
  }

  static parseXml(xml) {
    const get = (tag) => {
      const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
      return m ? m[1].trim() : null;
    };
    const getAll = (tag) => {
      const matches = [];
      const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'g');
      let m;
      while ((m = re.exec(xml))) matches.push(m[1].trim());
      return matches;
    };
    return {
      AsOf: get('AsOf'),
      OrderStatuses: getAll('OrderStatus').map(block => {
        const field = (tag) => { const m = block.match(new RegExp(`<${tag}>([^<]*)</${tag}>`)); return m ? m[1] : null; };
        return {
          StoreID: field('StoreID'), OrderID: field('OrderID'),
          OrderStatus: field('OrderStatus'), OrderDescription: field('OrderDescription'),
          StartTime: field('StartTime'), StopTime: field('StopTime'),
          DriverName: field('DriverName'), ManagerName: field('ManagerName'),
        };
      }),
    };
  }

  async poll(phone, intervalMs = 30000, onUpdate) {
    while (true) {
      const data = await this.byPhone(phone);
      const orders = data.OrderStatuses || [];
      if (onUpdate) onUpdate(orders);
      if (orders.length > 0 && orders.every(o => o.OrderStatus === 'Complete' || o.OrderStatus === 'Delivered')) break;
      await new Promise(r => setTimeout(r, intervalMs));
    }
  }

  static STAGES = ['Order Placed', 'Prep', 'Bake', 'Quality Check', 'Out for Delivery', 'Delivered'];
  static STAGE_MAP = { OrdPlaced: 0, MakeLine: 1, Oven: 2, QualCheck: 3, RouteLine: 4, Complete: 5 };

  static parseStage(status) {
    const idx = Tracker.STAGE_MAP[status?.RouteModuleStatus] ?? 0;
    return { stage: Tracker.STAGES[idx], index: idx, total: Tracker.STAGES.length };
  }
}

// --- Item Builder (inspired by node-dominos-pizza-api) ---

class Item {
  constructor(code, qty = 1, options = {}) {
    this.Code = code;
    this.Qty = qty;
    this.Options = options;
    this.isNew = true;
  }

  // Topping helpers: position is '1/1' (whole), '1/2' (left), '2/2' (right)
  // amount is '1' (normal), '1.5' (extra), '2' (double), '0' (none)
  addTopping(code, position = '1/1', amount = '1') {
    this.Options[code] = { [position]: amount };
    return this;
  }

  get formatted() {
    return { Code: this.Code, Qty: this.Qty, Options: this.Options, isNew: this.isNew };
  }
}

// --- Payment (with card type auto-detection from node-dominos-pizza-api) ---

class Payment {
  constructor({ number, expiration, cvv, postalCode, amount = 0, tipAmount = 0 }) {
    const clean = number.replace(/\D/g, '');
    const cardType = detectCardType(clean);
    if (!cardType) throw new Error(`Unrecognized card number. Supported: ${Object.keys(CARD_PATTERNS).join(', ')}`);

    this.Type = 'CreditCard';
    this.Amount = amount;
    this.TipAmount = tipAmount;
    this.Number = clean;
    this.CardType = cardType;
    this.Expiration = expiration.replace(/\D/g, '');
    this.SecurityCode = cvv;
    this.PostalCode = postalCode;
  }

  get formatted() {
    return { ...this };
  }
}

// --- Order Builder ---

class Order {
  constructor(baseUrl, region) {
    this.baseUrl = baseUrl;
    this.data = {
      Address: {}, Coupons: [], CustomerID: '', Extension: '',
      OrderChannel: 'OLO', OrderID: '', NoCombine: true,
      OrderMethod: 'Web', OrderTaker: null, Products: [], Payments: [],
      ServiceMethod: 'Delivery',
      SourceOrganizationURI: `order.dominos.${region === 'ca' ? 'ca' : 'com'}`,
      Version: '1.0', LanguageCode: 'en', Partners: {},
      NewUser: true, metaData: { calculateNutrition: true },
    };
  }

  setAddress({ street, city, region, postalCode, type = 'House' }) {
    this.data.Address = { Street: street, City: city, Region: region, PostalCode: postalCode, Type: type };
    return this;
  }

  setStore(storeId) { this.data.StoreID = storeId; return this; }

  setCustomer({ firstName, lastName, email, phone }) {
    Object.assign(this.data, { FirstName: firstName, LastName: lastName, Email: email, Phone: phone });
    return this;
  }

  addItem(item) {
    if (item instanceof Item) {
      this.data.Products.push(item.formatted);
    } else {
      this.data.Products.push(item);
    }
    return this;
  }

  // Legacy compat
  addProduct(code, qty = 1, options = {}) {
    return this.addItem(new Item(code, qty, options));
  }

  addCoupon(code) { this.data.Coupons.push({ Code: code, Qty: 1 }); return this; }

  setPayment(payment) {
    if (payment instanceof Payment) {
      this.data.Payments = [payment.formatted];
    } else {
      // Raw object with auto-detection
      this.data.Payments = [new Payment(payment).formatted];
    }
    return this;
  }

  // Future order support (from node-dominos-pizza-api)
  orderInFuture(date) {
    if (date < Date.now()) throw new Error('Order date must be in the future');
    this.data.FutureOrderTime = date.toISOString().replace('T', ' ').replace('.000Z', '');
    return this;
  }

  orderNow() { delete this.data.FutureOrderTime; return this; }

  async validate() {
    const res = await request(`${this.baseUrl}/power/validate-order`, {
      method: 'POST', body: JSON.stringify({ Order: this.data }),
    });
    return { valid: res.Status !== -1, ...res };
  }

  async price() {
    const res = await request(`${this.baseUrl}/power/price-order`, {
      method: 'POST', body: JSON.stringify({ Order: this.data }),
    });
    if (res.Status === -1) throw new Error('Pricing failed: ' + JSON.stringify(res.StatusItems));
    return res;
  }

  async place() {
    if (!this.data.StoreID) throw new Error('Store ID required before placing order');
    if (!this.data.Products.length) throw new Error('Order must contain items');
    if (!this.data.Payments.length) throw new Error('Payment required before placing order');
    if (!this.data.Address.Region) throw new Error('Address region required before placing order');

    return request(`${this.baseUrl}/power/place-order`, {
      method: 'POST', body: JSON.stringify({ Order: this.data }),
    });
  }
}

// --- Main Client ---

class DominosAPI {
  constructor({ region = 'ca' } = {}) {
    const cfg = REGIONS[region];
    if (!cfg) throw new Error(`Unknown region: ${region}. Use 'us' or 'ca'.`);
    this.region = region;
    this.config = cfg;
    this.stores = new StoreFinder(cfg.order, cfg.lang);
    this.menu = new Menu(cfg.order, cfg.lang);
    this.tracker = new Tracker(cfg.tracker);
  }

  createOrder() { return new Order(this.config.order, this.region); }
  createItem(code, qty, options) { return new Item(code, qty, options); }
  createPayment(details) { return new Payment(details); }
}

export { DominosAPI, StoreFinder, Menu, Tracker, Order, Item, Payment, ITEMS, detectCardType };
