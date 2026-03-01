/**
 * Dominos API Integration Handler
 * Integrates with foodie for quick pizza ordering
 * Josh's usual: 14" hand-tossed, pepperoni+bacon, garlic dip, store 10090
 */

const Dominos = require('dominos');

class DominosOrderParser {
  /**
   * Parse natural order syntax
   * Examples: "usual", "pizza", "14 pepperoni bacon", "delivery langley"
   */
  static parse(commandStr) {
    const text = (commandStr || '').toLowerCase().trim();
    
    // Default to Josh's usual
    if (!text || text === 'usual' || text === 'the usual') {
      return {
        intent: 'usual',
        size: '14SCREEN',
        toppings: ['P', 'K'], // Pepperoni, bacon (K)
        sauce: 'X', // Garlic (X = extra sauce variant)
        sides: [{ code: 'GARBUTTER', qty: 1 }], // Garlic dip
        store: 10090,
      };
    }

    // Parse custom: "pepperoni bacon" or "veggie" etc
    const toppings = [];
    const sides = [];
    let size = '14SCREEN';
    let store = 10090;

    // Extract size if specified
    if (text.includes('14')) size = '14SCREEN';
    if (text.includes('10')) size = '10SCREEN';
    if (text.includes('12')) size = '12SCREEN';
    if (text.includes('16')) size = '16SCREEN';

    // Map toppings
    const toppingMap = {
      'pepperoni': 'P',
      'p': 'P',
      'bacon': 'K',
      'k': 'K',
      'sausage': 'S',
      'beef': 'B',
      'chicken': 'BBQC',
      'ham': 'H',
      'pineapple': 'Td',
      'veggie': ['Td', 'O', 'M', 'G'], // tomato, onion, mushroom, green pepper
      'mushroom': 'M',
      'onion': 'O',
      'peppers': 'G',
    };

    for (const [key, code] of Object.entries(toppingMap)) {
      if (text.includes(key)) {
        if (Array.isArray(code)) {
          toppings.push(...code);
        } else {
          toppings.push(code);
        }
      }
    }

    // Extract store location
    if (text.includes('langley')) store = 10090;
    if (text.includes('vancouver')) store = 10090; // Default for now
    if (text.includes('delivery')) { /* marker, no action needed */ }

    return {
      intent: 'custom',
      size,
      toppings: toppings.length > 0 ? toppings : ['P'], // Default to pepperoni
      sauce: 'X',
      sides: [],
      store,
    };
  }
}

class DominosAPI {
  constructor(options = {}) {
    this.region = options.region || 'ca';
    this.defaultStore = options.defaultStore || 10090; // Langley
    this.customer = options.customer || {
      firstName: 'Joshua',
      lastName: 'Trommel',
      phone: '7788462726',
      email: 'jatrommel@gmail.com',
      address: {
        street: '20690 40 Ave',
        city: 'Langley',
        region: 'BC',
        postalCode: 'V3A 9X2'
      }
    };
    this.dominos = new Dominos.Dominos(this.customer);
  }

  /**
   * Search for stores near a location or use default
   */
  async findStores(addressStr) {
    try {
      const storeCode = this.region === 'ca' ? 'CANADA' : 'USA';
      // Use store finder from dominos package
      const stores = await this.dominos.getNearbyStores({
        street: this.customer.address.street,
        city: this.customer.address.city,
        region: this.customer.address.region,
        postalCode: this.customer.address.postalCode,
      }, 'Delivery');

      return stores || [];
    } catch (err) {
      console.error('[Dominos] Store finder error:', err.message);
      // Return default store on error
      return [{ StoreID: this.defaultStore }];
    }
  }

  /**
   * Create a new order with items
   */
  async createOrder(parsed) {
    try {
      const order = new Dominos.Order(this.dominos);
      
      // Add customer
      order.setCustomer(this.customer);
      
      // Set address for delivery
      order.setDeliveryAddress(this.customer.address);
      
      // Set store (use parsed store or default)
      order.storeID = parsed.store || this.defaultStore;

      // Build pizza item
      const pizza = new Dominos.Item();
      pizza.code = parsed.size || '14SCREEN'; // Size code
      
      // Add toppings
      for (const topping of parsed.toppings) {
        pizza.addTopping(topping);
      }

      // Add pizza to order
      order.addItem(pizza);

      // Add sides (garlic dip, etc)
      for (const side of parsed.sides) {
        const sideItem = new Dominos.Item();
        sideItem.code = side.code;
        order.addItem(sideItem);
      }

      return { success: true, order, storeID: order.storeID };
    } catch (err) {
      console.error('[Dominos] Order creation error:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Get menu for a store
   */
  async getMenu(storeId = null) {
    try {
      const store = storeId || this.defaultStore;
      // Menu fetching from dominos package
      const menu = await this.dominos.getMenu(store);
      return { success: true, data: menu };
    } catch (err) {
      console.error('[Dominos] Menu error:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Price an order (dry run, no commitment)
   */
  async priceOrder(order) {
    try {
      // Dominos package handles pricing
      const pricing = await order.validate();
      return {
        success: true,
        subtotal: order.getSubtotal?.(),
        tax: order.getTax?.(),
        total: order.getTotal?.(),
        eta: 30, // Typical delivery time
      };
    } catch (err) {
      console.error('[Dominos] Pricing error:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Place order with payment
   * Requires encrypted card data (handled externally)
   */
  async placeOrder(order, paymentData) {
    try {
      // Add payment
      order.addPayment({
        type: 'creditCard',
        number: paymentData.cardNumber,
        expiration: paymentData.expiration,
        cvv: paymentData.cvv,
        postalCode: paymentData.postalCode,
      });

      // Submit order
      const result = await order.place();

      return {
        success: true,
        orderId: result?.OrderID || result?.orderId || 'unknown',
        storeID: result?.StoreID || order.storeID,
        status: 'placed',
        message: `Order placed! Track via tracker.dominos.com with phone 7788462726`,
      };
    } catch (err) {
      console.error('[Dominos] Order placement error:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Track an order
   */
  async trackOrder(phone) {
    try {
      const orders = await this.dominos.getTrackerData({ phone });
      return {
        success: true,
        orders: orders || [],
        url: `https://tracker.dominos.com?phone=${phone.replace(/\D/g, '')}`,
      };
    } catch (err) {
      console.error('[Dominos] Tracking error:', err.message);
      return { success: false, error: err.message };
    }
  }
}

module.exports = { DominosAPI, DominosOrderParser };
