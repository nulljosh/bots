/**
 * sms-handler.js — Text-to-order orchestration
 * Parses SMS → places order → sends pickup notification
 * Supports: Chipotle, Dominos
 */

const { ChipotleOrderParser, ChipotleAPI } = require('./chipotle');
const { DominosAPI, DominosOrderParser } = require('./dominos');
const { DominosSmsNotifier } = require('./dominos-sms');

class FoodOrderHandler {
  constructor(options = {}) {
    this.chipotle = new ChipotleAPI({ region: 'ca' });
    this.dominos = new DominosAPI({ region: 'ca' });
    this.smsNotifier = new DominosSmsNotifier({ phone: options.phone || '7788462726' });
    this.defaultStore = options.defaultStore || 'langley';
    this.paymentToken = options.paymentToken; // saved card
    this.phone = options.phone || '7788462726';
    this.callbacks = [];
  }

  /**
   * Handle SMS order (auto-detect restaurant)
   */
  async handle(smsText) {
    try {
      // Detect restaurant
      const text = smsText.toLowerCase();
      if (text.includes('pizza') || text.includes('dominos') || text.includes('pepperoni')) {
        return await this.handleDominos(smsText);
      }

      // Default to Chipotle for backward compat
      const parsed = ChipotleOrderParser.parse(smsText);
      console.log('[Order] Parsed Chipotle:', parsed);

      // Find nearest store
      const stores = await this.chipotle.findStores('Langley, BC');
      if (stores.length === 0) throw new Error('No Chipotle stores found');
      const store = stores[0];

      // Build order
      const order = this.chipotle.createOrder(store.id)
        .addItem('bowl', 1, { protein: parsed.protein })
        .setCustomer('Joshua', this.phone);

      // Price
      const pricing = await order.price();
      console.log('[Order] Pricing:', pricing);

      // Confirmation
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
        restaurant: 'Chipotle',
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

  /**
   * Handle Dominos order
   */
  async handleDominos(smsText) {
    try {
      const parsed = DominosOrderParser.parse(smsText);
      console.log('[Dominos Order] Parsed:', parsed);

      // Create order
      const orderResult = await this.dominos.createOrder(parsed);
      if (!orderResult.success) {
        throw new Error(orderResult.error);
      }

      const order = orderResult.order;

      // Price
      const priceResult = await this.dominos.priceOrder(order);
      if (!priceResult.success) {
        throw new Error(priceResult.error);
      }

      // Place order (with payment)
      const paymentData = {
        cardNumber: process.env.CARD_NUMBER || '',
        expiration: process.env.CARD_EXP || '',
        cvv: process.env.CARD_CVV || '',
        postalCode: 'V3A9X2',
      };

      const placeResult = await this.dominos.placeOrder(order, paymentData);
      if (!placeResult.success) {
        throw new Error(placeResult.error);
      }

      // Notify & start tracking
      const notification = {
        status: 'confirmed',
        restaurant: 'Dominos',
        orderId: placeResult.orderId,
        storeID: placeResult.storeID,
        eta: priceResult.eta,
        total: priceResult.total,
      };

      await this.notify(notification);

      // Start SMS tracking
      await this.smsNotifier.notifyOrderPlaced(notification);
      this.smsNotifier.startTracking(this.phone);

      return { success: true, ...notification };
    } catch (err) {
      console.error('[Dominos Order] Error:', err.message);
      await this.notify({
        status: 'error',
        restaurant: 'Dominos',
        message: `Order failed: ${err.message}`,
      });
      return { success: false, error: err.message };
    }
  }

  async notify(data) {
    // Callback to iMessage/notification system
    for (const cb of this.callbacks) {
      try {
        await cb(data);
      } catch (err) {
        console.error('[Notify] Callback error:', err.message);
      }
    }
  }

  onNotify(callback) {
    this.callbacks.push(callback);
    return this;
  }

  /**
   * Register SMS callback (for actual SMS sending)
   */
  onSms(callback) {
    this.smsNotifier.onSms(callback);
    return this;
  }
}

module.exports = { FoodOrderHandler };
