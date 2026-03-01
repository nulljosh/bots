/**
 * openclaw-handler.js — /food command integration
 * Usage: /food chipotle bowl:chicken guac
 *        /food dominos pizza location:langley
 *        /food status 847263
 */

const { FoodOrderHandler } = require('./sms-handler');
const { ChipotleOrderParser } = require('./chipotle');

class OpenClawFoodHandler {
  constructor(options = {}) {
    this.handler = new FoodOrderHandler(options);
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
    // /food dominos pizza location:langley
    return {
      status: 'not_ready',
      message: 'Dominos integration ready in foodbot.js. Use: dominos.createOrder()',
    };
  }

  async handleStatus(pickupCode) {
    // /food status 847263
    return {
      pickupCode,
      message: 'Status polling not yet implemented. Check your text for ETA.',
    };
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
        '/food dominos pizza location:langley — Order Dominos pizza',
        '/food status 847263 — Check order status',
        '/food menu chipotle — Show menu',
      ],
    };
  }
}

module.exports = { OpenClawFoodHandler };
