/**
 * food.js — Master food API
 * Merges dominos + starbot, adds McDonald's menu lookup + Chipotle ordering.
 *
 * Dominos: store finder, menu, tracker, full ordering (CA + US)
 * Starbucks: store finder, menu lookup, card balance, rewards, ordering (needs API key intercept)
 * McDonald's: menu lookup (CA) — no auth needed
 * Chipotle: restaurant search, menu, ordering, pickup times, delivery estimates
 * Taco Bell: location search, menu, cart/ordering, delivery estimates, promotions
 * Pizza Hut: store finder, menu, cart/ordering, session-based auth
 * Firehouse Subs: store finder, menu lookup (RBI GraphQL gateway, no auth needed)
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
  const extraHeaders = options.headers || {};
  const merged = { ...DOMINOS_HEADERS, ...extraHeaders };
  const { headers: _, ...rest } = options;
  const res = await fetch(url, { headers: merged, ...rest });
  if (!res.ok) throw new Error(`Dominos API ${res.status}: ${res.statusText} — ${url}`);
  return res.json();
}

function flattenMenuItems(menu) {
  const groups = Object.values(menu || {});
  return groups.flatMap(group => (Array.isArray(group) ? group : []));
}

function fuzzySearchMenu(menu, query) {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return [];
  return flattenMenuItems(menu).filter(item => {
    const haystack = `${item.name || ''} ${item.description || ''}`.toLowerCase();
    return haystack.includes(q);
  });
}

function readPrice(item, size = 'medium') {
  if (!item) return null;
  const key = `price_${String(size || '').toLowerCase()}`;
  return item[key] ?? item.price ?? item.price_regular ?? null;
}

class DominosStoreFinder {
  constructor(baseUrl, lang) { this.baseUrl = baseUrl; this.lang = lang; }

  async find(input, type = 'Delivery') {
    const params = new URLSearchParams();
    let resolvedType = type;

    if (typeof input === 'object' && input !== null) {
      if (input.type) resolvedType = input.type;
      if (input.s || input.street) params.set('s', String(input.s || input.street));
      if (input.c || input.city || input.address) params.set('c', String(input.c || input.city || input.address));
      if (input.lat !== undefined && input.lng !== undefined) {
        params.set('lat', String(input.lat));
        params.set('lng', String(input.lng));
      }
    } else {
      const address = String(input || '').trim();
      if (address) {
        const parts = address.split(',').map(s => s.trim()).filter(Boolean);
        params.set('s', parts[0] || address);
        if (parts.length > 1) params.set('c', parts.slice(1).join(', '));
      }
    }

    if (!params.has('s') && !params.has('c') && !(params.has('lat') && params.has('lng'))) {
      throw new Error('Address or lat/lng required');
    }

    params.set('type', resolvedType);
    const url = `${this.baseUrl}/power/store-locator?${params.toString()}`;
    try {
      const data = await dominosRequest(url);
      return data?.Stores || [];
    } catch {
      return [];
    }
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

  async poll(phone, intervalMs = 30000, onUpdate, maxPolls = 120) {
    for (let i = 0; i < maxPolls; i++) {
      const data = await this.byPhone(phone);
      const orders = data.OrderStatuses || [];
      if (onUpdate) onUpdate(orders);
      if (orders.length > 0 && orders.every(o => o.OrderStatus === 'Complete' || o.OrderStatus === 'Delivered')) return;
      await new Promise(r => setTimeout(r, intervalMs));
    }
    throw new Error(`Tracker polling exceeded ${maxPolls} attempts`);
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
  constructor(baseUrl, region, auth = null) {
    this.baseUrl = baseUrl;
    this.auth = auth;
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

  _authHeaders() {
    const h = { 'DPZ-Market': 'CANADA' };
    if (this.auth?.accessToken) h['Authorization'] = `Bearer ${this.auth.accessToken}`;
    return h;
  }

  async validate() { const res = await dominosRequest(`${this.baseUrl}/power/validate-order`, { method: 'POST', headers: this._authHeaders(), body: JSON.stringify({ Order: { ...this.data, Market: 'CANADA' } }) }); return { valid: res.Status !== -1, ...res }; }
  async price() { const res = await dominosRequest(`${this.baseUrl}/power/price-order`, { method: 'POST', headers: this._authHeaders(), body: JSON.stringify({ Order: { ...this.data, Market: 'CANADA' } }) }); if (res.Status === -1) throw new Error('Pricing failed: ' + JSON.stringify(res.StatusItems)); return res; }
  async place() {
    if (!this.data.StoreID) throw new Error('Store ID required');
    if (!this.data.Products.length) throw new Error('No items in order');
    if (!this.data.Payments.length) throw new Error('Payment required');
    if (!this.data.Address.Region) throw new Error('Address region required');
    return dominosRequest(`${this.baseUrl}/power/place-order`, { method: 'POST', headers: this._authHeaders(), body: JSON.stringify({ Order: { ...this.data, Market: 'CANADA' } }) });
  }
}

class DominosAuth {
  constructor({ email, password, clientId, clientIds, scopes } = {}) {
    this.email = email;
    this.password = password;
    this.clientIds = Array.from(new Set(
      [clientId, ...(Array.isArray(clientIds) ? clientIds : []), process.env.DOMINOS_CLIENT_ID, 'nolo'].filter(Boolean),
    ));
    this.scopeCandidates = Array.from(new Set(
      (Array.isArray(scopes) && scopes.length ? scopes : ['customer:loyalty:read customer:profile:read:basic customer:card:read customer:orderHistory:read customer:card:update customer:profile:update']).map(s => (s || '').trim()),
    ));
    this.tokenUrl = 'https://api.dominos.ca/as/token.oauth2';
    this.accessToken = null;
    this.customerId = null;
    this.tokenScope = [];
    this.expiresAt = 0;
  }

  static decodeJwtPayload(jwt) {
    const parts = String(jwt || '').split('.');
    if (parts.length < 2) return {};
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    try {
      return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
    } catch {
      return {};
    }
  }

  async requestToken({ clientId, scope }) {
    const params = new URLSearchParams({
      grant_type: 'password',
      username: this.email,
      password: this.password,
      client_id: clientId,
    });
    if (scope) params.set('scope', scope);
    const res = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'DPZ-Market': 'CANADA',
        'Origin': 'https://order.dominos.ca',
        'Referer': 'https://order.dominos.ca/en/pages/order/',
      },
      body: params.toString(),
    });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    return { ok: res.ok, status: res.status, data };
  }

  async hasCustomerAccess(token, customerId) {
    if (!token || !customerId) return false;
    const headers = {
      ...DOMINOS_HEADERS,
      'Authorization': `Bearer ${token}`,
      'DPZ-Market': 'CANADA',
      'Origin': 'https://order.dominos.ca',
      'Referer': 'https://order.dominos.ca/en/pages/order/',
    };
    try {
      const res = await fetch(`https://api.dominos.ca/power/customer/${customerId}/loyalty`, { headers });
      return res.status === 200;
    } catch {
      return false;
    }
  }

  async login() {
    if (!this.email || !this.password) throw new Error('Dominos credentials required for login().');
    const attempts = [];

    for (const clientId of this.clientIds) {
      for (const scope of this.scopeCandidates) {
        const result = await this.requestToken({ clientId, scope });
        const scopeLabel = scope || '(none)';
        if (!result.ok || !result.data?.access_token) {
          attempts.push(`${clientId} ${scopeLabel} => ${result.status}`);
          continue;
        }

        const payload = DominosAuth.decodeJwtPayload(result.data.access_token);
        const customerId = payload.CustomerID || payload.customer_id || null;
        const tokenScopeRaw = result.data.scope;
        const tokenScope = Array.isArray(tokenScopeRaw)
          ? tokenScopeRaw
          : (typeof tokenScopeRaw === 'string' ? tokenScopeRaw.split(/\s+/).filter(Boolean) : []);
        const usable = await this.hasCustomerAccess(result.data.access_token, customerId);

        attempts.push(`${clientId} ${scopeLabel} => ${result.status} scope=[${tokenScope.join(',')}] usable=${usable}`);
        if (!usable) continue;

        this.accessToken = result.data.access_token;
        this.expiresAt = Date.now() + ((result.data.expires_in || 3600) - 60) * 1000;
        this.customerId = customerId;
        this.tokenScope = tokenScope;
        return this;
      }
    }

    throw new Error(`Dominos auth failed to obtain customer-scoped token. Attempts: ${attempts.join(' | ')}`);
  }

  async getToken() {
    if (!this.accessToken || Date.now() >= this.expiresAt) await this.login();
    return this.accessToken;
  }

  get headers() {
    if (!this.accessToken) throw new Error('Not authenticated. Call login() first.');
    return {
      ...DOMINOS_HEADERS,
      'Authorization': `Bearer ${this.accessToken}`,
      'DPZ-Market': 'CANADA',
      'Origin': 'https://order.dominos.ca',
      'Referer': 'https://order.dominos.ca/en/pages/order/',
    };
  }

  async _authedGet(path) {
    await this.getToken();
    const res = await fetch(`https://api.dominos.ca/power/${path}`, { headers: this.headers });
    if (!res.ok) throw new Error(`Dominos ${path} fetch failed: ${res.status}`);
    return res.json();
  }

  async loyalty() {
    if (!this.customerId) throw new Error('No CustomerID available. Login may have failed to extract it.');
    return this._authedGet(`customer/${this.customerId}/loyalty`);
  }

  profile() {
    if (!this.accessToken) throw new Error('Not authenticated. Call login() first.');
    return DominosAuth.decodeJwtPayload(this.accessToken);
  }

  async coupons() { return this._authedGet('customer/coupons'); }
  async deals() { return this._authedGet('customer/deals'); }
}

class DominosAPI {
  constructor({ region = 'ca', email, password, clientId, clientIds, scopes, storeId = null } = {}) {
    const cfg = DOMINOS_REGIONS[region];
    if (!cfg) throw new Error(`Unknown region: ${region}`);
    this.region = region; this.config = cfg;
    this.defaultStoreId = storeId;
    this._lastMenu = null;
    this.stores = new DominosStoreFinder(cfg.order, cfg.lang);
    this.menu = new DominosMenu(cfg.order, cfg.lang);
    this.tracker = new DominosTracker(cfg.tracker);
    this.auth = email && password ? new DominosAuth({ email, password, clientId, clientIds, scopes }) : null;
  }

  async login() {
    if (!this.auth) throw new Error('No credentials provided. Pass email+password to DominosAPI().');
    await this.auth.login();
    return this;
  }

  createOrder() {
    const order = new DominosOrder(this.config.order, this.region, this.auth);
    if (this.auth?.customerId) order.data.CustomerID = this.auth.customerId;
    return order;
  }
  createItem(code, qty, options) { return new DominosItem(code, qty, options); }
  createPayment(details) { return new DominosPayment(details); }
  async checkLoyalty() {
    if (!this.auth) throw new Error('No credentials provided. Pass email+password to DominosAPI().');
    return this.auth.loyalty();
  }
  async loyaltyStatus() {
    const data = await this.checkLoyalty();
    const points = data?.VestedPointBalance ?? 0;
    const pending = data?.PendingPointBalance ?? 0;
    const threshold = 60;
    const remaining = Math.max(0, threshold - points);
    const coupons = data?.LoyaltyCoupons || [];
    return { points, pending, remaining, threshold, hasFreeReward: remaining === 0, coupons, raw: data };
  }
  async getCoupons() {
    if (!this.auth) throw new Error('No credentials provided. Pass email+password to DominosAPI().');
    return this.auth.coupons();
  }
  async getDeals() {
    if (!this.auth) throw new Error('No credentials provided. Pass email+password to DominosAPI().');
    return this.auth.deals();
  }

  async find(input, type = 'Delivery') { return this.stores.find(input, type); }

  async searchStores(lat, lng, radius = 5) {
    void radius;
    return this.find({ lat, lng, type: 'Delivery' });
  }

  async getMenu(storeId = this.defaultStoreId) {
    if (!storeId) throw new Error('Store ID required');
    const menu = await this.menu.get(storeId);
    this._lastMenu = menu;
    return menu;
  }

  searchMenu(query) {
    if (!this._lastMenu) return [];
    return DominosMenu.searchItems(this._lastMenu, query);
  }

  getPrice(itemId, size = 'medium') {
    if (!this._lastMenu?.Products) return null;
    const item = this._lastMenu.Products[itemId];
    if (!item) return null;
    return item.Price ?? item?.Variants?.[size]?.Price ?? null;
  }
}

// ─── STARBUCKS ────────────────────────────────────────────────────────────────

const SBUX_BASE = 'https://openapi.starbucks.com/v1';
const SBUX_UA = 'Starbucks Android 6.48';

class StarbucksAPI {
  constructor() {
    this.accessToken = null; this.clientId = null; this.clientSecret = null;
    this.MENU = {
      espresso: [
        { id: 'caffe_latte', name: 'Caffe Latte', price_small: 4.45, price_medium: 4.95, price_large: 5.45 },
        { id: 'caramel_macchiato', name: 'Caramel Macchiato', price_small: 5.25, price_medium: 5.75, price_large: 6.25 },
      ],
      brewed: [
        { id: 'pike_place', name: 'Pike Place Roast', price_small: 2.95, price_medium: 3.25, price_large: 3.55 },
        { id: 'cold_brew', name: 'Cold Brew', price_small: 4.25, price_medium: 4.75, price_large: 5.25 },
      ],
      refreshers: [
        { id: 'strawberry_acai_refresher', name: 'Strawberry Acai Refresher', price_small: 4.95, price_medium: 5.45, price_large: 5.95 },
      ],
      food: [
        { id: 'bacon_gouda', name: 'Bacon, Gouda & Egg Sandwich', price: 5.75 },
        { id: 'butter_croissant', name: 'Butter Croissant', price: 4.25 },
      ],
    };
  }

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

  async searchStores(lat, lng, radius = 5) {
    const url = new URL('https://www.starbucks.ca/bff/locations');
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lng', String(lng));
    url.searchParams.set('mop', 'true');
    url.searchParams.set('radius', String(radius));
    const res = await fetch(url, { headers: { 'User-Agent': SBUX_UA, 'Accept': 'application/json' } });
    if (!res.ok) throw new Error(`Store locator failed: ${res.status}`);
    const data = await res.json();
    return (data.stores || []).map(s => ({ id: s.id, name: s.name, storeNumber: s.storeNumber, address: s.address, distance: s.distance }));
  }

  getMenu() { return this.MENU; }
  searchMenu(query) { return fuzzySearchMenu(this.MENU, query); }
  getPrice(itemId, size = 'medium') {
    const item = flattenMenuItems(this.MENU).find(i => i.id === itemId);
    return readPrice(item, size);
  }
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
    const lang = `${language}-${market.toLowerCase()}`;
    this.apiUrl = `https://www.mcdonalds.com/${market.toLowerCase()}/${lang}/eat/nutritioninfo.json`;
    this.menuEndpoints = [
      this.apiUrl,
      'https://cache.mcdonalds.com/api/v1/menu',
      'https://www.mcdonalds.com/us/en-us/services/routeservice.html',
    ];
    this.STATIC_MENU = {
      burgers: [
        { id: 'big_mac', name: 'Big Mac', price: 6.49 },
        { id: 'quarter_pounder_cheese', name: 'Quarter Pounder with Cheese', price: 6.89 },
        { id: 'mcdouble', name: 'McDouble', price: 3.39 },
        { id: 'filet_o_fish', name: 'Filet-O-Fish', price: 5.99 },
        { id: 'mcchicken', name: 'McChicken', price: 3.99 },
      ],
      chicken: [
        { id: 'mcnuggets_6pc', name: 'Chicken McNuggets (6 pc)', price: 4.69 },
        { id: 'mcnuggets_10pc', name: 'Chicken McNuggets (10 pc)', price: 6.99 },
        { id: 'mcnuggets_20pc', name: 'Chicken McNuggets (20 pc)', price: 11.99 },
      ],
      sides: [
        { id: 'fries', name: 'World Famous Fries', price_small: 2.89, price_medium: 3.59, price_large: 4.19 },
        { id: 'apple_pie', name: 'Baked Apple Pie', price: 1.99 },
      ],
      desserts: [
        { id: 'mcflurry_oreo', name: 'McFlurry with OREO Cookies', price_small: 4.49, price_medium: 5.19, price_large: 5.89 },
      ],
    };
    this._liveMenu = null;
  }

  async _request(url) {
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });
    if (!res.ok) throw new Error(`McDonald's API ${res.status}: ${res.statusText}`);
    return res.json();
  }

  async _loadLiveMenu() {
    for (const endpoint of this.menuEndpoints) {
      try {
        const data = await this._request(endpoint);
        if (data?.pncategories?.category?.length) {
          this._liveMenu = data;
          return data;
        }
      } catch {
        // Endpoint unavailable; continue.
      }
    }
    return null;
  }

  async searchStores() { throw new Error('Store search not available'); }

  async getMenu() {
    const live = this._liveMenu || await this._loadLiveMenu();
    if (!live) return this.STATIC_MENU;

    const grouped = {};
    for (const cat of live?.pncategories?.category || []) {
      const key = String(cat.item_name || 'other').toLowerCase().replace(/[^a-z0-9]+/g, '_');
      grouped[key] = (cat.menu_item || []).map(item => ({
        id: item.field_item_serving_id || item.item_name?.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
        name: item.item_name,
        description: item.item_description,
        calories: item.calories,
      }));
    }
    return Object.keys(grouped).length ? grouped : this.STATIC_MENU;
  }

  async searchMenu(query) {
    return fuzzySearchMenu(await this.getMenu(), query);
  }

  async getPrice(itemId, size = 'medium') {
    const item = flattenMenuItems(await this.getMenu()).find(i => i.id === itemId);
    return readPrice(item, size);
  }

  async categories() {
    const data = this._liveMenu || await this._loadLiveMenu();
    const cats = data?.pncategories?.category || [];
    return cats.map(c => ({ id: c.field_category_id, name: c.item_name, image: c.thumbnail }));
  }

  async menuByCategory(categoryId) {
    const data = await this._request(`${this.apiUrl}?item_id=${categoryId}&type=category&lang=${this.language}`);
    const items = data?.pncategories?.category?.[0]?.menu_item || [];
    return items.map(i => ({
      id: i.field_item_serving_id,
      name: i.item_name,
      calories: i.calories,
      description: i.item_description,
      image: i.thumbnail,
    }));
  }

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

  async nutrition(itemId) {
    return this._request(`${this.apiUrl}?item_id=${itemId}&type=item&lang=${this.language}`);
  }
}

// ─── CHIPOTLE ────────────────────────────────────────────────────────────────

class ChipotleAPI {
  constructor() {
    this.baseUrl = 'https://services.chipotle.com';
    this.webOrigin = 'https://www.chipotle.com';
    this.STATIC_MENU = {
      entrees: [
        { id: 'burrito', name: 'Burrito', price: 10.85 },
        { id: 'bowl', name: 'Bowl', price: 10.85 },
        { id: 'quesadilla', name: 'Quesadilla', price: 11.45 },
      ],
      sides: [
        { id: 'chips', name: 'Chips', price: 2.25 },
        { id: 'chips_guac', name: 'Chips & Guacamole', price: 5.2 },
      ],
      drinks: [
        { id: 'bottled_water', name: 'Bottled Water', price: 2.6 },
        { id: 'tractor_berry', name: 'Tractor Organic Berry Agua Fresca', price: 3.4 },
      ],
    };
    this._lastMenu = null;
  }

  async _request(method, path, options = {}) {
    const { params, body, headers = {} } = options;
    const url = new URL(path, this.baseUrl);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
      }
    }

    const res = await fetch(url, {
      method,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Origin': this.webOrigin,
        'Referer': `${this.webOrigin}/`,
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Chipotle API ${res.status}: ${res.statusText} — ${url}`);
    }

    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  async searchRestaurants(latitude, longitude, radius = 80647) {
    const body = {
      latitude,
      longitude,
      radius,
      restaurantStatuses: ['OPEN', 'LAB'],
      conceptIds: ['CMG'],
      orderBy: 'distance',
      orderByDescending: false,
      pageSize: 10,
      pageIndex: 0,
      embeds: {
        addressTypes: ['MAIN'],
        realHours: true,
        directions: true,
        onlineOrdering: true,
        timezone: true,
        experience: true,
        sustainability: true,
      },
    };
    try {
      return await this._request('POST', '/restaurant/v3/restaurant', { body });
    } catch (primaryError) {
      try {
        const fallback = await fetch(`${this.webOrigin}/restaurant/v3/restaurant`, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
            'Origin': this.webOrigin,
            'Referer': `${this.webOrigin}/`,
          },
          body: JSON.stringify(body),
        });
        if (!fallback.ok) throw new Error(`Chipotle API ${fallback.status}: ${fallback.statusText}`);
        return await fallback.json();
      } catch {
        throw primaryError;
      }
    }
  }

  async getMenu(storeId = null) {
    if (!storeId) return this.STATIC_MENU;
    try {
      const menu = await this._request('GET', `/menuinnovation/v1/restaurants/${storeId}/onlinemenus/compressed`);
      this._lastMenu = menu;
      return menu;
    } catch {
      return this.STATIC_MENU;
    }
  }

  async getRestaurant(restaurantId, embeds = ['addresses', 'realHours', 'experience', 'onlineOrdering', 'sustainability']) {
    return this._request('GET', `/restaurant/v3/restaurant/${restaurantId}`, {
      params: { embed: embeds.join(',') },
    });
  }

  async createOrder(restaurantId, orderType = 'Regular', groupOrderMessage = null) {
    return this._request('POST', '/order/v3/cart/online', {
      params: { embeds: 'order' },
      body: {
        restaurantId,
        orderType,
        groupOrderMessage,
        orderSource: 'WebV2',
      },
    });
  }

  async addMealToOrder(orderId, mealData, etag) {
    return this._request('POST', `/order/v3/cart/online/${orderId}/meals`, {
      headers: { 'If-Match': etag },
      params: { embeds: 'order', finalizePricing: true },
      body: mealData,
    });
  }

  async submitOrder(orderId, paymentData, etag) {
    return this._request('POST', `/order/v3/submit/online/${orderId}`, {
      headers: { 'If-Match': etag },
      body: paymentData,
    });
  }

  async getPickupTimes(storeId) {
    return this._request('GET', `/order/v3/submit/pickuptimes/${storeId}`);
  }

  async getDeliveryEstimate(deliveryData) {
    return this._request('POST', '/order/v3/delivery/estimate', {
      body: deliveryData,
    });
  }

  async getOrder(orderId, finalizePricing = true) {
    return this._request('GET', `/order/v3/cart/online/${orderId}`, {
      params: { finalizePricing },
    });
  }

  async addDeliveryInfo(orderId, deliveryData, etag) {
    return this._request('PUT', `/order/v3/cart/online/${orderId}/delivery`, {
      headers: { 'If-Match': etag },
      params: { embeds: 'order', finalizePricing: true },
      body: deliveryData,
    });
  }

  async searchStores(lat, lng, radius = 80647) {
    try {
      const response = await this.searchRestaurants(lat, lng, radius);
      return response?.data || response?.restaurants || response || [];
    } catch {
      return [];
    }
  }

  async searchMenu(query) {
    return fuzzySearchMenu(await this.getMenu(), query);
  }

  async getPrice(itemId, size = 'medium') {
    const menu = await this.getMenu();
    const item = flattenMenuItems(menu).find(i => i.id === itemId);
    return readPrice(item, size);
  }
}

// ─── TACO BELL ───────────────────────────────────────────────────────────────

class TacoBellAPI {
  constructor() {
    this.baseUrl = 'https://www.tacobell.com';
    this.STATIC_MENU = {
      tacos: [
        { id: 'crunchy_taco', name: 'Crunchy Taco', price: 2.29 },
        { id: 'soft_taco', name: 'Soft Taco', price: 2.49 },
      ],
      burritos: [
        { id: 'beefy_5_layer_burrito', name: 'Beefy 5-Layer Burrito', price: 4.29 },
        { id: 'bean_burrito', name: 'Bean Burrito', price: 2.99 },
      ],
      sides: [
        { id: 'nacho_fries', name: 'Nacho Fries', price_small: 2.99, price_medium: 3.99, price_large: 4.99 },
        { id: 'cinnamon_twists', name: 'Cinnamon Twists', price: 1.99 },
      ],
      drinks: [
        { id: 'baja_blast', name: 'MTN DEW Baja Blast', price_small: 2.29, price_medium: 2.69, price_large: 2.99 },
      ],
    };
  }

  async _request(method, path, options = {}) {
    const { params, body, headers = {} } = options;
    const url = new URL(path, this.baseUrl);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
      }
    }

    const res = await fetch(url, {
      method,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Taco Bell API ${res.status}: ${res.statusText} — ${url}`);
    }

    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  async searchLocations(latitude, longitude, radius = 50, pageSize = 20) {
    return this._request('POST', '/api/v1/locations/search', {
      body: { latitude, longitude, radius, pageSize, pageIndex: 0 },
    });
  }

  async getLocation(locationId) {
    return this._request('GET', `/api/v1/locations/${locationId}`);
  }

  async getLocationHours(locationId) {
    return this._request('GET', `/api/v1/locations/${locationId}/hours`);
  }

  async getLocationMenu(locationId) {
    return this._request('GET', `/api/v1/locations/${locationId}/menu`);
  }

  async getMenu(locationId = null) {
    try {
      return await this._request('GET', '/api/v1/menu', {
        params: locationId ? { locationId } : undefined,
      });
    } catch {
      return this.STATIC_MENU;
    }
  }

  async getMenuItems(filters = {}) {
    return this._request('GET', '/api/v1/menu/items', { params: filters });
  }

  async getMenuItem(itemId) {
    return this._request('GET', `/api/v1/menu/items/${itemId}`);
  }

  async createCart(locationId) {
    return this._request('POST', '/api/v1/cart', {
      body: { locationId, orderSource: 'WebV2' },
    });
  }

  async getCart(cartId) {
    return this._request('GET', `/api/v1/cart/${cartId}`);
  }

  async addItemToCart(cartId, itemData, etag) {
    return this._request('POST', `/api/v1/cart/${cartId}/items`, {
      body: itemData,
      headers: { 'If-Match': etag },
    });
  }

  async updateCartItem(cartId, itemId, updateData, etag) {
    return this._request('PUT', `/api/v1/cart/${cartId}/items/${itemId}`, {
      body: updateData,
      headers: { 'If-Match': etag },
    });
  }

  async removeCartItem(cartId, itemId, etag) {
    return this._request('DELETE', `/api/v1/cart/${cartId}/items/${itemId}`, {
      headers: { 'If-Match': etag },
    });
  }

  async applyPromoCode(cartId, promoCode, etag) {
    return this._request('POST', `/api/v1/cart/${cartId}/apply-promo`, {
      body: { promoCode },
      headers: { 'If-Match': etag },
    });
  }

  async checkout(cartId, checkoutData, etag) {
    return this._request('POST', '/api/v1/checkout', {
      body: { cartId, ...checkoutData },
      headers: { 'If-Match': etag },
    });
  }

  async submitOrder(checkoutId, paymentData, etag) {
    return this._request('POST', '/api/v1/orders', {
      body: { checkoutId, ...paymentData },
      headers: { 'If-Match': etag },
    });
  }

  async getOrder(orderId) {
    return this._request('GET', `/api/v1/orders/${orderId}`);
  }

  async getDeliveryEstimate(deliveryData) {
    return this._request('POST', '/api/v1/delivery/estimate', {
      body: deliveryData,
    });
  }

  async getPromotions(locationId = null) {
    return this._request('GET', '/api/v1/promotions', {
      params: locationId ? { locationId } : undefined,
    });
  }

  async searchStores(lat, lng, radius = 50) {
    const result = await this.searchLocations(lat, lng, radius);
    return result?.locations || result?.data || result || [];
  }

  async searchMenu(query) {
    return fuzzySearchMenu(await this.getMenu(), query);
  }

  async getPrice(itemId, size = 'medium') {
    const item = flattenMenuItems(await this.getMenu()).find(i => i.id === itemId);
    return readPrice(item, size);
  }
}

// ─── PIZZA HUT ───────────────────────────────────────────────────────────────

class PizzaHutAPI {
  constructor({ sessionToken = null } = {}) {
    this.baseUrl = 'https://quikorder.pizzahut.com/phorders3/service.php';
    this.sessionToken = sessionToken;
    this.accountID = 'phimc2api';
    this.accountPW = 'fs112358';
    this.STATIC_MENU = {
      pizzas: [
        { id: 'pepperoni_lovers', name: "Pepperoni Lover's", price_medium: 14.99, price_large: 18.99 },
        { id: 'supreme', name: 'Supreme', price_medium: 15.99, price_large: 19.99 },
      ],
      sides: [
        { id: 'breadsticks', name: 'Breadsticks', price: 6.99 },
        { id: 'wings_8pc', name: 'Traditional Wings (8 pc)', price: 12.99 },
      ],
      desserts: [
        { id: 'cinnabon_mini_rolls', name: 'Cinnabon Mini Rolls', price: 7.99 },
      ],
    };
  }

  async _request(requestType, data = {}) {
    const payload = {
      version: '2.0',
      appsource: 'Android',
      appversion: '2.1.2',
      request: requestType,
      data: JSON.stringify({
        accountID: this.accountID,
        accountPW: this.accountPW,
        ...data,
      }),
    };

    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(payload)) {
      body.set(key, value);
    }

    const res = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'User-Agent': 'PizzaHut Android/2.1.2',
      },
      body: body.toString(),
    });

    if (!res.ok) {
      throw new Error(`Pizza Hut API ${res.status}: ${res.statusText}`);
    }

    return res.json();
  }

  async generateSession(address) {
    const data = await this._request('GenerateTempAccount', { address });
    if (data.sessionToken) this.sessionToken = data.sessionToken;
    return data;
  }

  async searchStoresByZip(zip) {
    return this._request('FindNearByAddress', { customer_zip: zip });
  }

  async searchStores(lat, lng, radius = 25) {
    if (typeof lat === 'string' && lng === undefined) return this.searchStoresByZip(lat);
    void radius;
    throw new Error('Store search not available');
  }

  async getMenu(unitID = null, occasion = 'D', section = 'category', subsection = 'APICAROUSEL') {
    if (!unitID) return this.STATIC_MENU;
    return this._request('GetMenuItems', { unitID, occasion, section, subsection });
  }

  async getMenuSection(unitID, section, occasion = 'D') {
    return this._request('GetMenuItems', { unitID, occasion, section, subsection: section });
  }

  async startOrder(unitID, occasion = 'D', locationIndex = 0) {
    if (!this.sessionToken) throw new Error('No session token. Call generateSession() first.');
    return this._request('HTMLOrder', {
      sessionToken: this.sessionToken,
      unitID,
      occasion,
      location_index: locationIndex,
      action: 'start',
    });
  }

  async addItemToOrder(unitID, itemData) {
    if (!this.sessionToken) throw new Error('No session token. Call generateSession() first.');
    return this._request('HTMLOrder', {
      sessionToken: this.sessionToken,
      unitID,
      action: 'add',
      ...itemData,
    });
  }

  async submitOrder(unitID, paymentData) {
    if (!this.sessionToken) throw new Error('No session token. Call generateSession() first.');
    return this._request('HTMLOrder', {
      sessionToken: this.sessionToken,
      unitID,
      action: 'submit',
      ...paymentData,
    });
  }

  async getOrder(unitID) {
    if (!this.sessionToken) throw new Error('No session token. Call generateSession() first.');
    return this._request('HTMLOrder', {
      sessionToken: this.sessionToken,
      unitID,
      action: 'status',
    });
  }

  async searchMenu(query) {
    return fuzzySearchMenu(await this.getMenu(), query);
  }

  async getPrice(itemId, size = 'medium') {
    const item = flattenMenuItems(await this.getMenu()).find(i => i.id === itemId);
    return readPrice(item, size);
  }
}

// ─── FIREHOUSE SUBS ──────────────────────────────────────────────────────────

/**
 * Firehouse Subs — RBI GraphQL gateway.
 * Store search + menu lookup. No auth needed for public queries.
 * Ordering requires Cognito auth (not implemented).
 */
class FirehouseSubsAPI {
  constructor() {
    this.gateway = 'https://use1-prod-fhs-gateway.rbictg.com/graphql';
    // Static menu - FHS menu is stable; names not available via public RBI GraphQL API
    this.MENU = {
      hot_subs: [
        { id: 'engineer', name: 'Engineer', description: 'Smoked turkey breast, Virginia honey ham, melted provolone', price_small: 7.49, price_medium: 9.49, price_large: 11.49 },
        { id: 'hook_ladder', name: 'Hook & Ladder', description: 'Smoked turkey breast, Virginia honey ham, melted provolone', price_small: 7.49, price_medium: 9.49, price_large: 11.49 },
        { id: 'smokehouse_beef_cheddar_brisket', name: 'Smokehouse Beef & Cheddar Brisket', description: 'Beef brisket, cheddar cheese sauce, crispy onion straws', price_small: 8.49, price_medium: 10.99, price_large: 13.49 },
        { id: 'italian', name: 'Italian', description: 'Genoa salami, pepperoni, ham, melted provolone', price_small: 7.49, price_medium: 9.49, price_large: 11.49 },
        { id: 'new_york_steamer', name: 'New York Steamer', description: 'Pastrami, melted provolone', price_small: 8.49, price_medium: 10.49, price_large: 12.99 },
        { id: 'firehouse_meatball', name: 'Firehouse Meatball', description: 'Meatballs, marinara, melted provolone', price_small: 7.49, price_medium: 9.49, price_large: 11.49 },
        { id: 'turkey_bacon_ranch', name: 'Turkey Bacon Ranch', description: 'Smoked turkey breast, bacon, melted provolone, ranch', price_small: 7.99, price_medium: 9.99, price_large: 12.49 },
        { id: 'club_on_a_sub', name: 'Club on a Sub', description: 'Smoked turkey breast, Virginia honey ham, bacon, melted provolone', price_small: 8.49, price_medium: 10.49, price_large: 12.99 },
        { id: 'beef_cheese', name: 'Beef & Cheese', description: 'USDA choice beef, melted provolone', price_small: 8.49, price_medium: 10.49, price_large: 12.99 },
        { id: 'steak_cheese_sub', name: 'Steak & Cheese Sub', description: 'Grilled steak, sautéed peppers & onions, melted provolone', price_small: 8.49, price_medium: 10.49, price_large: 12.99 },
        { id: 'chicken_ranch', name: 'Chicken Ranch', description: 'Chicken, bacon, melted provolone, ranch', price_small: 7.99, price_medium: 9.99, price_large: 12.49 },
        { id: 'brisket_cheddar', name: 'Brisket & Cheddar', description: 'Slow-smoked brisket, cheddar sauce', price_small: 8.49, price_medium: 10.99, price_large: 13.49 },
      ],
      specialty_subs: [
        { id: 'firehouse_hero', name: 'Firehouse Hero', description: 'Smoked turkey breast, Virginia honey ham, Genoa salami, pepperoni, melted provolone', price_medium: 10.49, price_large: 12.99 },
        { id: 'veggie', name: 'Veggie', description: 'Provolone, pepperoncini, tomatoes, banana peppers, olives, cucumbers', price_small: 6.99, price_medium: 8.99, price_large: 10.99 },
        { id: 'chicken_fillet', name: 'Chicken Fillet', description: 'Breaded chicken fillet, melted provolone', price_small: 7.99, price_medium: 9.99, price_large: 12.49 },
      ],
      kids_meals: [
        { id: 'kids_turkey', name: "Kids' Turkey", price: 5.99 },
        { id: 'kids_ham', name: "Kids' Ham", price: 5.99 },
        { id: 'kids_pbj', name: "Kids' PB&J", price: 5.99 },
      ],
      sides: [
        { id: 'chips', name: 'Chips', price: 1.99 },
        { id: 'cookie', name: 'Cookie', price: 1.49 },
        { id: 'pickle', name: 'Pickle', price: 0.99 },
        { id: 'fountain_drink', name: 'Fountain Drink', price: 2.49 },
      ],
    };
  }

  async _graphql(query, variables = {}) {
    const res = await fetch(this.gateway, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw new Error(`Firehouse Subs API ${res.status}: ${res.statusText}`);
    const data = await res.json();
    if (data.errors?.length) throw new Error(`Firehouse GraphQL: ${data.errors[0].message}`);
    return data.data;
  }

  /**
   * Search nearby Firehouse Subs locations.
   * Note: FHS is US-only. Canadian coords return empty results.
   */
  async searchStores(lat, lng, radius = 50000, serviceModes = ['EAT_IN']) {
    const data = await this._graphql(`
      query NearbyRestaurants($input: NearbyRestaurantsInput!) {
        nearbyRestaurants(input: $input) {
          nodes {
            storeId
            name
            latitude
            longitude
            physicalAddress { address1 city stateProvince postalCode }
          }
        }
      }
    `, {
      input: {
        coordinates: { userLat: lat, userLng: lng, searchRadius: radius },
        serviceModes,
        radiusStrictMode: false,
      },
    });
    return data?.nearbyRestaurants?.nodes || [];
  }

  /** Get full static menu. */
  getMenu() {
    return this.MENU;
  }

  /**
   * Search menu items by name or description.
   * @param {string} query
   */
  searchMenu(query) {
    const q = query.toLowerCase();
    const results = [];
    for (const [category, items] of Object.entries(this.MENU)) {
      for (const item of items) {
        if (item.name.toLowerCase().includes(q) || (item.description && item.description.toLowerCase().includes(q))) {
          results.push({ ...item, category });
        }
      }
    }
    return results;
  }

  /**
   * Get price for an item by size.
   * @param {string} itemId
   * @param {'small'|'medium'|'large'} size
   */
  getPrice(itemId, size = 'medium') {
    for (const items of Object.values(this.MENU)) {
      const item = items.find(i => i.id === itemId);
      if (item) return item[`price_${size}`] || item.price || null;
    }
    return null;
  }
}

// ─── DAIRY QUEEN ─────────────────────────────────────────────────────────────

class DairyQueenAPI {
  constructor() {
    this.MENU = {
      burgers: [
        { id: 'flame_thrower_signature_stackburger', name: 'FlameThrower Signature Stackburger', description: 'Two seasoned beef patties, jalapeno bacon, pepper jack, FlameThrower sauce', price: 8.49 },
        { id: 'bacon_two_cheese_deluxe_stackburger', name: 'Bacon Two Cheese Deluxe Signature Stackburger', description: 'Bacon, American and white cheddar, lettuce, tomato, onion', price: 8.29 },
        { id: 'original_cheeseburger_signature_stackburger', name: 'Original Cheeseburger Signature Stackburger', description: 'Single seasoned beef patty with pickle, ketchup, mustard', price: 5.79 },
      ],
      chicken: [
        { id: 'chicken_strip_basket_4pc', name: 'Chicken Strip Basket (4 pc)', description: 'Crispy chicken strips with fries, Texas toast, dipping sauce', price: 9.29 },
        { id: 'chicken_strip_basket_6pc', name: 'Chicken Strip Basket (6 pc)', description: 'Six crispy chicken strips with fries and Texas toast', price: 11.29 },
        { id: 'spicy_chicken_strip_sandwich', name: 'Spicy Chicken Strip Sandwich', description: 'Crispy chicken strips with spicy sauce, lettuce, tomato', price: 6.79 },
      ],
      blizzards: [
        { id: 'oreo_blizzard', name: 'OREO Blizzard Treat', description: 'Vanilla soft serve blended with OREO cookie pieces', price_mini: 4.39, price_small: 5.29, price_medium: 6.19, price_large: 7.09 },
        { id: 'reeses_pb_cup_blizzard', name: "REESE'S Peanut Butter Cup Blizzard Treat", description: "Vanilla soft serve with REESE'S Peanut Butter Cup pieces", price_mini: 4.59, price_small: 5.49, price_medium: 6.39, price_large: 7.29 },
        { id: 'choco_brownie_extreme_blizzard', name: 'Choco Brownie Extreme Blizzard Treat', description: 'Chocolate chunks, brownie pieces, cocoa fudge', price_mini: 4.79, price_small: 5.69, price_medium: 6.59, price_large: 7.49 },
      ],
      ice_cream: [
        { id: 'vanilla_cone', name: 'Vanilla Cone', description: 'Classic DQ vanilla soft serve cone', price_small: 2.49, price_medium: 2.99, price_large: 3.49 },
        { id: 'hot_fudge_sundae', name: 'Hot Fudge Sundae', description: 'Vanilla soft serve with hot fudge topping', price_small: 3.49, price_medium: 4.19, price_large: 4.89 },
        { id: 'dilly_bar', name: 'Dilly Bar', description: 'Vanilla soft serve coated in chocolate', price: 2.79 },
      ],
      drinks: [
        { id: 'moolatte', name: 'Mocha MooLatté', description: 'Coffee blended drink with mocha flavor', price_small: 4.19, price_medium: 4.89, price_large: 5.49 },
        { id: 'strawberry_shake', name: 'Strawberry Shake', description: 'Creamy strawberry shake', price_small: 4.29, price_medium: 4.99, price_large: 5.69 },
        { id: 'fountain_drink', name: 'Fountain Drink', description: 'Coca-Cola Freestyle beverages', price_small: 2.19, price_medium: 2.59, price_large: 2.99 },
      ],
      kids_meals: [
        { id: 'kids_hamburger_meal', name: "Kids' Hamburger Meal", description: 'Hamburger, side, drink, and kids dessert', price: 6.29 },
        { id: 'kids_chicken_strips_meal', name: "Kids' Chicken Strips Meal", description: 'Two chicken strips, side, drink, and kids dessert', price: 6.49 },
      ],
      sides: [
        { id: 'fries_regular', name: 'Fries', description: 'Golden crispy fries', price_small: 2.79, price_medium: 3.39, price_large: 3.99 },
        { id: 'onion_rings', name: 'Onion Rings', description: 'Crispy battered onion rings', price_small: 3.29, price_medium: 3.99, price_large: 4.69 },
        { id: 'cheese_curds', name: 'Cheese Curds', description: 'Crispy fried Wisconsin white cheddar cheese curds', price_small: 4.79, price_regular: 5.79 },
      ],
    };

    this.storeEndpoints = [
      'https://www.dairyqueen.com/en-us/api/store/nearby',
      'https://api.dairyqueen.com/store/dq/v1/stores/nearby',
      'https://www.dairyqueen.com/api/locator',
    ];
  }

  async searchStores(lat, lng, radius = 25) {
    const normalizedLat = Number(lat);
    const normalizedLng = Number(lng);
    const normalizedRadius = Number(radius);

    for (const endpoint of this.storeEndpoints) {
      try {
        const url = new URL(endpoint);
        url.searchParams.set('lat', String(normalizedLat));
        url.searchParams.set('lng', String(normalizedLng));
        if (endpoint.includes('/dq/v1/stores/nearby')) {
          url.searchParams.set('radius', String(Math.max(normalizedRadius, 1)));
          url.searchParams.set('limit', '25');
        } else {
          url.searchParams.set('radius', String(Math.max(normalizedRadius, 1)));
        }

        const res = await fetch(url.toString(), {
          headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
        });
        if (!res.ok) continue;

        const payload = await res.json();
        const stores = payload?.stores || payload?.results || payload?.data?.stores || payload?.data || [];
        if (Array.isArray(stores) && stores.length) return stores;
      } catch {
        // Try next endpoint.
      }
    }

    throw new Error('No public Dairy Queen store locator endpoint is currently accessible.');
  }

  getMenu() {
    return this.MENU;
  }

  _fuzzyScore(item, query) {
    const q = query.toLowerCase().trim();
    if (!q) return 0;
    const haystack = `${item.name} ${item.description || ''}`.toLowerCase();
    if (haystack.includes(q)) return 100;

    const qTokens = q.split(/\s+/).filter(Boolean);
    const tokenHits = qTokens.filter(t => haystack.includes(t)).length;
    const tokenScore = qTokens.length ? (tokenHits / qTokens.length) * 70 : 0;

    let i = 0;
    for (const ch of haystack) {
      if (ch === q[i]) i += 1;
      if (i === q.length) break;
    }
    const subsequenceScore = q.length ? (i / q.length) * 30 : 0;

    return tokenScore + subsequenceScore;
  }

  searchMenu(query) {
    const matches = [];

    for (const [category, items] of Object.entries(this.MENU)) {
      for (const item of items) {
        const score = this._fuzzyScore(item, query);
        if (score >= 45) matches.push({ ...item, category, score: Number(score.toFixed(1)) });
      }
    }

    return matches.sort((a, b) => b.score - a.score);
  }

  getPrice(itemId, size = 'medium') {
    const normalizedSize = String(size).toLowerCase();
    for (const items of Object.values(this.MENU)) {
      const item = items.find(i => i.id === itemId);
      if (!item) continue;
      return item[`price_${normalizedSize}`] || item.price || item.price_regular || null;
    }
    return null;
  }
}

// ─── EXPORTS ─────────────────────────────────────────────────────────────────

export {
  // Dominos
  DominosAuth, DominosAPI, DominosStoreFinder, DominosMenu, DominosTracker,
  DominosOrder, DominosItem, DominosPayment, detectCardType,
  // Starbucks
  StarbucksAPI,
  // McDonald's
  McDonaldsAPI,
  // Chipotle
  ChipotleAPI,
  // Taco Bell
  TacoBellAPI,
  // Pizza Hut
  PizzaHutAPI,
  // Firehouse Subs
  FirehouseSubsAPI,
  // Dairy Queen
  DairyQueenAPI,
};
