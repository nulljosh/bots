/**
 * foodbot.js — Master food API
 * Merges dominos + starbot, adds McDonald's menu lookup.
 *
 * Dominos: store finder, menu, tracker, full ordering (CA + US)
 * Starbucks: store finder, menu lookup, card balance, rewards, ordering (needs API key intercept)
 * McDonald's: menu lookup (CA) — no auth needed
 */

// ─── DOMINOS ─────────────────────────────────────────────────────────────────

const DOMINOS_REGIONS = {
  us: { order: 'https://order.dominos.com', tracker: 'https://tracker.dominos.com', lang: 'en', tld: 'com' },
  ca: { order: 'https://order.dominos.ca', tracker: 'https://tracker.dominos.com', lang: 'en', tld: 'ca' },
};

const DOMINOS_HEADERS = {
  'Referer': 'https://order.dominos.com/en/pages/order/',
  'Content-Type': 'application/json',
  'Accept': 'application/json',
};

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

async function dominosRequest(url, options = {}) {
  const res = await fetch(url, { headers: DOMINOS_HEADERS, ...options });
  if (!res.ok) throw new Error(`Dominos API ${res.status}: ${res.statusText} — ${url}`);
  return res.json();
}

class DominosStoreFinder {
  constructor(baseUrl, lang) { this.baseUrl = baseUrl; this.lang = lang; }

  async find(address, type = 'Delivery') {
    let street, city;
    if (typeof address === 'object') { street = address.street; city = address.city; }
    else { const parts = address.split(',').map(s => s.trim()); street = parts[0] || ''; city = parts.slice(1).join(', '); }
    const url = `${this.baseUrl}/power/store-locator?s=${encodeURIComponent(street)}&c=${encodeURIComponent(city)}&type=${type}`;
    const data = await dominosRequest(url);
    return data.Stores || [];
  }

  async profile(storeId) { return dominosRequest(`${this.baseUrl}/power/store/${storeId}/profile`); }
}

class DominosMenu {
  constructor(baseUrl, lang) { this.baseUrl = baseUrl; this.lang = lang; }
  async get(storeId) { return dominosRequest(`${this.baseUrl}/power/store/${storeId}/menu?lang=${this.lang}&structured=true`); }
  async coupon(storeId, couponId) { return dominosRequest(`${this.baseUrl}/power/store/${storeId}/coupon/${couponId}?lang=${this.lang}`); }
  static filterByCategory(menuData, category) {
    const cats = menuData.Categorization?.FoodCategorization?.Categories || [];
    return cats.find(c => c.Code === category) || null;
  }
  static searchItems(menuData, query) {
    const products = menuData.Products || {};
    const q = query.toLowerCase();
    return Object.entries(products).filter(([, item]) => item.Name?.toLowerCase().includes(q)).map(([code, item]) => ({ code, ...item }));
  }
  static getCategories(menuData) {
    return (menuData.Categorization?.FoodCategorization?.Categories || []).map(c => ({ code: c.Code, name: c.Name, count: c.Products?.length || 0 }));
  }
}

class DominosTracker {
  constructor(trackerUrl) { this.trackerUrl = trackerUrl; }

  async _fetch(url) {
    const res = await fetch(url, { headers: { 'Referer': 'https://order.dominos.com/en/pages/order/' } });
    if (!res.ok) throw new Error(`Tracker ${res.status}: ${res.statusText}`);
    return DominosTracker.parseXml(await res.text());
  }

  async byPhone(phone) { return this._fetch(`${this.trackerUrl}/orderstorage/GetTrackerData?Phone=${phone.replace(/\D/g, '')}`); }
  async byId(storeId, orderKey) { return this._fetch(`${this.trackerUrl}/orderstorage/GetTrackerData?StoreID=${storeId}&OrderKey=${orderKey}`); }

  static parseXml(xml) {
    const get = (tag) => { const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`)); return m ? m[1].trim() : null; };
    const getAll = (tag) => { const matches = []; const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'g'); let m; while ((m = re.exec(xml))) matches.push(m[1].trim()); return matches; };
    return {
      AsOf: get('AsOf'),
      OrderStatuses: getAll('OrderStatus').map(block => {
        const field = (tag) => { const m = block.match(new RegExp(`<${tag}>([^<]*)</${tag}>`)); return m ? m[1] : null; };
        return { StoreID: field('StoreID'), OrderID: field('OrderID'), OrderStatus: field('OrderStatus'), OrderDescription: field('OrderDescription'), StartTime: field('StartTime'), StopTime: field('StopTime'), DriverName: field('DriverName'), ManagerName: field('ManagerName') };
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
  static parseStage(status) { const idx = DominosTracker.STAGE_MAP[status?.RouteModuleStatus] ?? 0; return { stage: DominosTracker.STAGES[idx], index: idx, total: DominosTracker.STAGES.length }; }
}

class DominosItem {
  constructor(code, qty = 1, options = {}) { this.Code = code; this.Qty = qty; this.Options = options; this.isNew = true; }
  addTopping(code, position = '1/1', amount = '1') { this.Options[code] = { [position]: amount }; return this; }
  get formatted() { return { Code: this.Code, Qty: this.Qty, Options: this.Options, isNew: this.isNew }; }
}

class DominosPayment {
  constructor({ number, expiration, cvv, postalCode, amount = 0, tipAmount = 0 }) {
    const clean = number.replace(/\D/g, '');
    const cardType = detectCardType(clean);
    if (!cardType) throw new Error(`Unrecognized card. Supported: ${Object.keys(CARD_PATTERNS).join(', ')}`);
    this.Type = 'CreditCard'; this.Amount = amount; this.TipAmount = tipAmount;
    this.Number = clean; this.CardType = cardType;
    this.Expiration = expiration.replace(/\D/g, '');
    this.SecurityCode = cvv; this.PostalCode = postalCode;
  }
  get formatted() { return { ...this }; }
}

class DominosOrder {
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

  setAddress({ street, city, region, postalCode, type = 'House' }) { this.data.Address = { Street: street, City: city, Region: region, PostalCode: postalCode, Type: type }; return this; }
  setStore(storeId) { this.data.StoreID = storeId; return this; }
  setCustomer({ firstName, lastName, email, phone }) { Object.assign(this.data, { FirstName: firstName, LastName: lastName, Email: email, Phone: phone }); return this; }
  addItem(item) { this.data.Products.push(item instanceof DominosItem ? item.formatted : item); return this; }
  addProduct(code, qty = 1, options = {}) { return this.addItem(new DominosItem(code, qty, options)); }
  addCoupon(code) { this.data.Coupons.push({ Code: code, Qty: 1 }); return this; }
  setPayment(payment) { this.data.Payments = [payment instanceof DominosPayment ? payment.formatted : new DominosPayment(payment).formatted]; return this; }
  orderInFuture(date) { if (date < Date.now()) throw new Error('Date must be future'); this.data.FutureOrderTime = date.toISOString().replace('T', ' ').replace('.000Z', ''); return this; }
  orderNow() { delete this.data.FutureOrderTime; return this; }

  async validate() { const res = await dominosRequest(`${this.baseUrl}/power/validate-order`, { method: 'POST', body: JSON.stringify({ Order: this.data }) }); return { valid: res.Status !== -1, ...res }; }
  async price() { const res = await dominosRequest(`${this.baseUrl}/power/price-order`, { method: 'POST', body: JSON.stringify({ Order: this.data }) }); if (res.Status === -1) throw new Error('Pricing failed: ' + JSON.stringify(res.StatusItems)); return res; }
  async place() {
    if (!this.data.StoreID) throw new Error('Store ID required');
    if (!this.data.Products.length) throw new Error('No items in order');
    if (!this.data.Payments.length) throw new Error('Payment required');
    if (!this.data.Address.Region) throw new Error('Address region required');
    return dominosRequest(`${this.baseUrl}/power/place-order`, { method: 'POST', body: JSON.stringify({ Order: this.data }) });
  }
}

class DominosAPI {
  constructor({ region = 'ca' } = {}) {
    const cfg = DOMINOS_REGIONS[region];
    if (!cfg) throw new Error(`Unknown region: ${region}`);
    this.region = region; this.config = cfg;
    this.stores = new DominosStoreFinder(cfg.order, cfg.lang);
    this.menu = new DominosMenu(cfg.order, cfg.lang);
    this.tracker = new DominosTracker(cfg.tracker);
  }
  createOrder() { return new DominosOrder(this.config.order, this.region); }
  createItem(code, qty, options) { return new DominosItem(code, qty, options); }
  createPayment(details) { return new DominosPayment(details); }
}

// ─── STARBUCKS ────────────────────────────────────────────────────────────────

const SBUX_BASE = 'https://openapi.starbucks.com/v1';
const SBUX_UA = 'Starbucks Android 6.48';

class StarbucksAPI {
  constructor() { this.accessToken = null; this.clientId = null; this.clientSecret = null; }

  setCredentials(clientId, clientSecret) { this.clientId = clientId; this.clientSecret = clientSecret; return this; }
  setToken(token) { this.accessToken = token; return this; }

  async login(username, password) {
    if (!this.clientId) throw new Error('Call setCredentials() first. Intercept Starbucks app with mitmproxy to get clientId/clientSecret.');
    const params = new URLSearchParams({ sig: this._signature(), market: 'CA', platform: 'Android' });
    const body = new URLSearchParams({ grant_type: 'password', client_id: this.clientId, client_secret: this.clientSecret, username, password });
    const res = await fetch(`${SBUX_BASE}/oauth/token?${params}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'User-Agent': SBUX_UA, 'Accept': 'application/json', 'X-Api-Key': this.clientId },
      body: body.toString(),
    });
    if (!res.ok) throw new Error(`Starbucks auth failed: ${res.status}`);
    const data = await res.json();
    this.accessToken = data.access_token;
    return data;
  }

  async _authedRequest(method, path, params = {}, body = null) {
    if (!this.accessToken) throw new Error('Not authenticated. Call login() or setToken() first.');
    const url = new URL(`${SBUX_BASE}/${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const options = { method, headers: { 'Authorization': `Bearer ${this.accessToken}`, 'Accept': 'application/json', 'User-Agent': SBUX_UA } };
    if (body) { options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(body); }
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`Starbucks API ${res.status}: ${await res.text()}`);
    return res.json();
  }

  async nearbyStores(lat, lng, limit = 10, radius = 5) {
    const data = await this._authedRequest('GET', 'stores/nearby', { latlng: `${lat},${lng}`, limit, radius, xopState: true, userSubMarket: 'CA', serviceTime: true, locale: 'en-CA' });
    return (data.stores || []).map(s => ({ id: s.store?.id, name: s.store?.name, storeNumber: s.store?.storeNumber, address: s.store?.address, distance: s.distance }));
  }

  async storesByAddress(address) {
    const res = await fetch(`https://www.starbucks.ca/bff/locations?lat=49.1&lng=-122.6&mop=true&place=${encodeURIComponent(address)}`, { headers: { 'User-Agent': SBUX_UA } });
    if (!res.ok) throw new Error(`Store locator failed: ${res.status}`);
    const data = await res.json();
    return (data.stores || []).map(s => ({ id: s.id, name: s.name, storeNumber: s.storeNumber, address: s.address?.streetAddressLine1, city: s.address?.city, distance: s.distance, mobileOrder: s.xopState === 'OPEN', hours: s.schedule?.todayHours }));
  }

  async cards() {
    const data = await this._authedRequest('GET', 'me/cards');
    return (Array.isArray(data) ? data : []).map(c => ({ cardId: c.cardId, cardNumber: c.cardNumber, nickname: c.nickname, balance: c.balance }));
  }

  async lastOrder() {
    const data = await this._authedRequest('GET', 'me/orders', { market: 'CA', locale: 'en-CA', limit: 1, offset: 0 });
    return data?.orderHistoryItems?.[0]?.basket || null;
  }

  orderToCart(order) {
    return { cart: { offers: [], items: (order.items || []).map(it => ({ quantity: it.quantity, commerce: { sku: it.commerce?.sku } })) }, delivery: { deliveryType: order.preparation } };
  }

  async priceOrder(storeNumber, cart) {
    const data = await this._authedRequest('POST', `me/stores/${storeNumber}/priceOrder`, { market: 'CA', locale: 'en-CA', serviceTime: true }, cart);
    return { orderToken: data.orderToken, total: data.summary?.totalAmount, storeNumber: data.store?.storeNumber, signature: data.signature };
  }

  async placeOrder(pricedOrder, cardId) {
    return this._authedRequest('POST', `me/stores/${pricedOrder.storeNumber}/orderToken/${pricedOrder.orderToken}/submitOrder`, { market: 'CA', locale: 'en-CA' }, { signature: pricedOrder.signature, tenders: [{ amountToCharge: pricedOrder.total, type: 'SVC', id: cardId }] });
  }

  async rewards() { return this._authedRequest('GET', 'me/rewards', { market: 'CA', locale: 'en-CA' }); }

  _signature() { return Buffer.from(`${this.clientId}:${Date.now()}`).toString('base64'); }
}

// ─── MCDONALD'S ──────────────────────────────────────────────────────────────

/**
 * McDonald's menu lookup — Canadian market.
 * Uses the unofficial McD API (no auth needed for menu data).
 * Ordering not implemented (no stable API; use kiosk or app).
 */
class McDonaldsAPI {
  constructor({ market = 'CA', language = 'en' } = {}) {
    this.market = market;
    this.language = language;
    this.baseUrl = 'https://www.mcdonalds.com/ca/en-ca/eat/nutritioninfo.html';
    this.apiUrl = 'https://www.mcdonalds.com/ca/en-ca/eat/nutritioninfo.json';
  }

  /**
   * Fetch all menu categories.
   * Returns array of { id, name, image }.
   */
  async categories() {
    const url = `${this.apiUrl}`;
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });
    if (!res.ok) throw new Error(`McDonald's API ${res.status}`);
    const data = await res.json();
    const cats = data?.pncategories?.category || [];
    return cats.map(c => ({ id: c.field_category_id, name: c.item_name, image: c.thumbnail }));
  }

  /**
   * Fetch menu items for a category id.
   * Returns array of { id, name, calories, description }.
   */
  async menuByCategory(categoryId) {
    const url = `https://www.mcdonalds.com/ca/en-ca/eat/nutritioninfo.json?item_id=${categoryId}&type=category&lang=en`;
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });
    if (!res.ok) throw new Error(`McDonald's category fetch ${res.status}`);
    const data = await res.json();
    const items = data?.pncategories?.category?.[0]?.menu_item || [];
    return items.map(i => ({
      id: i.field_item_serving_id,
      name: i.item_name,
      calories: i.calories,
      description: i.item_description,
      image: i.thumbnail,
    }));
  }

  /**
   * Search menu items by name across all categories.
   * Fetches categories first, then filters.
   * Returns array of matches.
   */
  async search(query) {
    const cats = await this.categories();
    const q = query.toLowerCase();
    const results = [];

    await Promise.all(cats.map(async (cat) => {
      try {
        const items = await this.menuByCategory(cat.id);
        const matches = items.filter(i => i.name?.toLowerCase().includes(q));
        results.push(...matches.map(i => ({ ...i, category: cat.name })));
      } catch {
        // Skip categories that fail
      }
    }));

    return results;
  }

  /**
   * Fetch nutrition details for a specific item.
   */
  async nutrition(itemId) {
    const url = `https://www.mcdonalds.com/ca/en-ca/eat/nutritioninfo.json?item_id=${itemId}&type=item&lang=en`;
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });
    if (!res.ok) throw new Error(`McDonald's nutrition fetch ${res.status}`);
    return res.json();
  }
}

// ─── EXPORTS ─────────────────────────────────────────────────────────────────

export {
  // Dominos
  DominosAPI, DominosStoreFinder, DominosMenu, DominosTracker,
  DominosOrder, DominosItem, DominosPayment, detectCardType,
  // Starbucks
  StarbucksAPI,
  // McDonald's
  McDonaldsAPI,
};
