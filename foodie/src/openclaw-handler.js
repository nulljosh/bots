/**
 * openclaw-handler.js — /food command integration
 * Usage: /food chipotle bowl:chicken guac
 *        /food dominos usual
 *        /food dominos pepperoni bacon
 *        /food status tracker
 */

const { FoodOrderHandler } = require('./sms-handler');
const { ChipotleOrderParser } = require('./chipotle');
const { DominosAPI, DominosOrderParser } = require('./dominos');

class OpenClawFoodHandler {
  constructor(options = {}) {
    this.handler = new FoodOrderHandler(options);
    this.dominos = new DominosAPI({ 
      region: options.region || 'ca',
      defaultStore: options.store || 10090
    });
  }

  // Parse /food command
  async execute(args) {
    if (!args || args.length === 0) return this.help();

    const [restaurant, ...rest] = args;
    const commandStr = rest.join(' ');

    try {
      switch (restaurant.toLowerCase()) {
        case 'chipotle':
        case 'chip':
          return await this.handleChipotle(commandStr);
        case 'dominos':
        case 'pizza':
          return await this.handleDominos(commandStr);
        case 'status':
          return await this.handleStatus(commandStr);
        case 'menu':
          return await this.handleMenu(rest[0]);
        default:
          return { error: `Unknown restaurant: ${restaurant}. Try: chipotle, dominos, status, menu` };
      }
    } catch (err) {
      return { error: err.message };
    }
  }

  async handleChipotle(args) {
    // /food chipotle bowl:chicken guac
    // /food chipotle burrito:carnitas rice:brown
    const parsed = ChipotleOrderParser.parse(args);
    const result = await this.handler.handle(args);
    
    if (result.success) {
      return {
        status: 'confirmed',
        restaurant: 'Chipotle',
        orderId: result.orderId,
        pickupCode: result.pickupCode,
        eta: `${result.eta} minutes`,
        total: `$${result.total}`,
        message: `✓ Order placed. Pickup code: ${result.pickupCode}. Ready in ${result.eta} min.`,
      };
    }
    return { error: result.error };
  }

  async handleDominos(args) {
    // /food dominos usual
    // /food dominos pepperoni bacon
    try {
      const parsed = DominosOrderParser.parse(args);
      
      // Create order
      const orderResult = await this.dominos.createOrder(parsed);
      if (!orderResult.success) {
        return { error: orderResult.error };
      }

      const order = orderResult.order;

      // Get pricing
      const priceResult = await this.dominos.priceOrder(order);
      if (!priceResult.success) {
        return { error: priceResult.error };
      }

      // Build summary
      const summary = {
        status: 'ready_for_payment',
        restaurant: 'Dominos',
        store: orderResult.storeID,
        size: parsed.size,
        toppings: parsed.toppings.join(', '),
        subtotal: `$${priceResult.subtotal?.toFixed(2) || '0.00'}`,
        tax: `$${priceResult.tax?.toFixed(2) || '0.00'}`,
        total: `$${priceResult.total?.toFixed(2) || '0.00'}`,
        eta: `${priceResult.eta} min`,
        message: `Order ready for payment. Total: $${priceResult.total?.toFixed(2) || '0.00'}. Confirm to proceed with Mastercard.`,
        order: order, // For internal use
      };

      return summary;
    } catch (err) {
      return { error: `Dominos order failed: ${err.message}` };
    }
  }

  async handleStatus(tracker) {
    // /food status tracker — shows tracking URL
    // /food status <phone> — track specific order
    if (tracker === 'tracker' || !tracker) {
      return {
        service: 'Dominos Tracker',
        url: 'https://tracker.dominos.com',
        message: 'Track your order at tracker.dominos.com with phone 7788462726',
      };
    }
    
    try {
      const result = await this.dominos.trackOrder(tracker);
      if (result.success) {
        return {
          status: 'tracked',
          orders: result.orders,
          url: result.url,
          message: `Tracking data retrieved. See ${result.url}`,
        };
      }
      return { error: result.error };
    } catch (err) {
      return { error: `Status lookup failed: ${err.message}` };
    }
  }

  async handleMenu(restaurant) {
    // /food menu chipotle
    if (!restaurant) {
      return {
        available: ['chipotle', 'dominos', 'starbucks', 'mcdonalds'],
      };
    }
    return {
      restaurant,
      message: 'Menu lookup: Coming soon. Use full command to order directly.',
    };
  }

  help() {
    return {
      commands: [
        '/food chipotle bowl:chicken guac — Order Chipotle bowl with chicken & guac',
        '/food chipotle burrito:carnitas rice:brown — Burrito with carnitas & brown rice',
        '/food dominos usual — Order Josh\'s usual: 14" hand-tossed, pepperoni+bacon, garlic dip',
        '/food dominos pepperoni bacon — Custom pizza with pepperoni & bacon',
        '/food status tracker — View Dominos tracker link',
        '/food menu chipotle — Show menu',
      ],
    };
  }
}

module.exports = { OpenClawFoodHandler };
