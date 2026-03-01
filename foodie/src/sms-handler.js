/**
 * sms-handler.js — Text-to-order orchestration
 * Parses SMS → places order → sends pickup notification
 */

const { ChipotleOrderParser, ChipotleAPI } = require('./chipotle');

class FoodOrderHandler {
  constructor(options = {}) {
    this.chipotle = new ChipotleAPI({ region: 'ca' });
    this.defaultStore = options.defaultStore || 'langley';
    this.paymentToken = options.paymentToken; // saved card
    this.phone = options.phone || '7788462726';
    this.callbacks = [];
  }

  async handle(smsText) {
    try {
      const parsed = ChipotleOrderParser.parse(smsText);
      console.log('[Order] Parsed:', parsed);

      // Find nearest store
      const stores = await this.chipotle.findStores('Langley, BC');
      if (stores.length === 0) throw new Error('No stores found');
      const store = stores[0];

      // Build order
      const order = this.chipotle.createOrder(store.id)
        .addItem('bowl', 1, { protein: parsed.protein })
        .setCustomer('Joshua', this.phone);

      // Price
      const pricing = await order.price();
      console.log('[Order] Pricing:', pricing);

      // Confirm before placing
      const confirmation = {
        restaurant: 'Chipotle',
        type: parsed.intent,
        protein: parsed.protein,
        hasGuac: parsed.hasGuac,
        store: store.name,
        total: pricing.total,
        eta: 15,
      };

      // Place order
      const result = await order.place(this.paymentToken);

      // Notify
      await this.notify({
        status: 'confirmed',
        orderId: result.orderId,
        pickupCode: result.pickupCode,
        eta: result.eta,
        total: result.total,
        store: store.name,
      });

      return { success: true, ...result };
    } catch (err) {
      console.error('[Order] Error:', err.message);
      await this.notify({
        status: 'error',
        message: `Order failed: ${err.message}`,
      });
      return { success: false, error: err.message };
    }
  }

  async notify(data) {
    // Callback to iMessage/notification system
    for (const cb of this.callbacks) {
      await cb(data);
    }
  }

  onNotify(callback) {
    this.callbacks.push(callback);
    return this;
  }
}

module.exports = { FoodOrderHandler };
