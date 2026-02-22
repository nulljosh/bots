/**
 * Starbot - Starbucks API wrapper
 * Based on tgvarik/Starbucks (openapi.starbucks.com/v1/)
 * Adapted for Canadian market.
 */

const BASE_URL = 'https://openapi.starbucks.com/v1';
const USER_AGENT = 'Starbucks Android 6.48';

export class StarbotAPI {
  constructor() {
    this.accessToken = null;
    this.clientId = null;
    this.clientSecret = null;
  }

  /**
   * Set API credentials (required for auth)
   * To get these: intercept Starbucks mobile app traffic with mitmproxy
   */
  setCredentials(clientId, clientSecret) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    return this;
  }

  /**
   * Authenticate with Starbucks account
   */
  async login(username, password) {
    if (!this.clientId) throw new Error('Call setCredentials() first. Need client_id and client_secret from Starbucks app.');

    const params = new URLSearchParams({
      sig: this._signature(),
      market: 'CA',
      platform: 'Android',
    });

    const body = new URLSearchParams({
      grant_type: 'password',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      username,
      password,
    });

    const res = await fetch(`${BASE_URL}/oauth/token?${params}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
        'X-Api-Key': this.clientId,
      },
      body: body.toString(),
    });

    if (!res.ok) throw new Error(`Auth failed: ${res.status}`);
    const data = await res.json();
    this.accessToken = data.access_token;
    return data;
  }

  /**
   * Set access token directly (if you have one)
   */
  setToken(token) {
    this.accessToken = token;
    return this;
  }

  async _authedRequest(method, path, params = {}, body = null) {
    if (!this.accessToken) throw new Error('Not authenticated. Call login() or setToken() first.');

    const url = new URL(`${BASE_URL}/${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Accept': 'application/json',
        'User-Agent': USER_AGENT,
      },
    };

    if (body) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }

    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`Starbucks API ${res.status}: ${await res.text()}`);
    return res.json();
  }

  /**
   * Find nearby stores by lat/lng
   */
  async nearbyStores(lat, lng, limit = 10, radius = 5) {
    const data = await this._authedRequest('GET', 'stores/nearby', {
      latlng: `${lat},${lng}`,
      limit, radius,
      xopState: true,
      userSubMarket: 'CA',
      serviceTime: true,
      locale: 'en-CA',
    });

    return (data.stores || []).map(s => ({
      id: s.store?.id,
      name: s.store?.name,
      storeNumber: s.store?.storeNumber,
      address: s.store?.address,
      distance: s.distance,
    }));
  }

  /**
   * Find stores by address (geocodes first via public API)
   */
  async storesByAddress(address) {
    // Use Starbucks store locator (no auth needed)
    const res = await fetch(`https://www.starbucks.ca/bff/locations?lat=49.1&lng=-122.6&mop=true&place=${encodeURIComponent(address)}`, {
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!res.ok) throw new Error(`Store locator failed: ${res.status}`);
    const data = await res.json();
    return (data.stores || []).map(s => ({
      id: s.id,
      name: s.name,
      storeNumber: s.storeNumber,
      address: s.address?.streetAddressLine1,
      city: s.address?.city,
      distance: s.distance,
      mobileOrder: s.xopState === 'OPEN',
      hours: s.schedule?.todayHours,
    }));
  }

  /**
   * Get registered Starbucks cards
   */
  async cards() {
    const data = await this._authedRequest('GET', 'me/cards');
    return (Array.isArray(data) ? data : []).map(c => ({
      cardId: c.cardId,
      cardNumber: c.cardNumber,
      nickname: c.nickname,
      balance: c.balance,
    }));
  }

  /**
   * Get last order (for reordering)
   */
  async lastOrder() {
    const data = await this._authedRequest('GET', 'me/orders', {
      market: 'CA', locale: 'en-CA', limit: 1, offset: 0,
    });
    return data?.orderHistoryItems?.[0]?.basket || null;
  }

  /**
   * Convert a past order into a cart for reordering
   */
  orderToCart(order) {
    return {
      cart: {
        offers: [],
        items: (order.items || []).map(it => ({
          quantity: it.quantity,
          commerce: { sku: it.commerce?.sku },
        })),
      },
      delivery: { deliveryType: order.preparation },
    };
  }

  /**
   * Price an order at a specific store
   */
  async priceOrder(storeNumber, cart) {
    const data = await this._authedRequest('POST', `me/stores/${storeNumber}/priceOrder`, {
      market: 'CA', locale: 'en-CA', serviceTime: true,
    }, cart);

    return {
      orderToken: data.orderToken,
      total: data.summary?.totalAmount,
      storeNumber: data.store?.storeNumber,
      signature: data.signature,
    };
  }

  /**
   * Place an order (pay with Starbucks card)
   */
  async placeOrder(pricedOrder, cardId) {
    return this._authedRequest('POST',
      `me/stores/${pricedOrder.storeNumber}/orderToken/${pricedOrder.orderToken}/submitOrder`,
      { market: 'CA', locale: 'en-CA' },
      {
        signature: pricedOrder.signature,
        tenders: [{
          amountToCharge: pricedOrder.total,
          type: 'SVC',
          id: cardId,
        }],
      }
    );
  }

  /**
   * Get rewards/stars balance
   */
  async rewards() {
    return this._authedRequest('GET', 'me/rewards', { market: 'CA', locale: 'en-CA' });
  }

  _signature() {
    // Simplified -- real implementation uses HMAC
    return Buffer.from(`${this.clientId}:${Date.now()}`).toString('base64');
  }
}
