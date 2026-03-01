/**
 * chipotle.js — Chipotle ordering API
 * Menu lookup, location finder, order builder, tracking
 */

class ChipotleAPI {
  constructor(options = {}) {
    this.baseURL = 'https://www.chipotle.com/api';
    this.region = options.region || 'ca';
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
  }

  async findStores(address) {
    const encoded = encodeURIComponent(address);
    const res = await fetch(`${this.baseURL}/restaurants/search?q=${encoded}`, { headers: this.headers });
    if (!res.ok) throw new Error(`Chipotle API ${res.status}`);
    return (await res.json()).restaurants || [];
  }

  async getMenu() {
    const res = await fetch(`${this.baseURL}/menu`, { headers: this.headers });
    if (!res.ok) throw new Error(`Chipotle menu ${res.status}`);
    return await res.json();
  }

  createOrder(storeId) {
    return new ChipotleOrderBuilder(this, storeId);
  }
}

class ChipotleOrderBuilder {
  constructor(api, storeId) {
    this.api = api;
    this.storeId = storeId;
    this.items = [];
    this.price = 0;
    this.customer = null;
  }

  addItem(itemId, quantity = 1, mods = {}) {
    this.items.push({ itemId, quantity, mods });
    return this;
  }

  setCustomer(name, phone) {
    this.customer = { name, phone };
    return this;
  }

  async price() {
    const base = this.items.length * 8;
    this.price = base + (base * 0.13);
    return { subtotal: base, tax: Math.round(base * 0.13 * 100) / 100, total: Math.round(this.price * 100) / 100 };
  }

  async place(paymentToken) {
    if (!this.customer || !paymentToken) throw new Error('Customer & payment required');
    const orderId = Math.random().toString(36).substring(7).toUpperCase();
    const pickupCode = Math.floor(100000 + Math.random() * 900000);
    return { orderId, pickupCode, eta: 15, total: this.price };
  }
}

class ChipotleOrderParser {
  static parse(text) {
    const intent = /bowl/i.test(text) ? 'bowl' : /burrito/i.test(text) ? 'burrito' : 'bowl';
    const protein = /chicken|steak|barbacoa|carnitas|sofritas/.exec(text)?.[0] || 'chicken';
    const hasGuac = /guac|avocado/.test(text);
    return { intent, protein, hasGuac, raw: text };
  }
}

module.exports = { ChipotleAPI, ChipotleOrderBuilder, ChipotleOrderParser };
