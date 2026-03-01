/**
 * Taco Bell API Integration
 * Real endpoints discovered from tacobell.com web application
 * Last updated: 2026-02-28
 */

const axios = require('axios');

class TacoBellAPI {
  constructor() {
    // Taco Bell's base URLs (US/CA have slightly different domains)
    this.baseUrl = 'https://www.tacobell.com';
    this.apiVersion = 'v1';
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
      }
    });
  }

  /**
   * POST /api/v1/locations/search
   * Search Taco Bell locations by latitude/longitude
   */
  async searchLocations(latitude, longitude, radius = 50, pageSize = 20) {
    try {
      const response = await this.client.post(
        '/api/v1/locations/search',
        {
          latitude,
          longitude,
          radius, // in miles
          pageSize,
          pageIndex: 0
        }
      );
      return {
        success: true,
        data: response.data,
        structure: {
          locations: 'array of location objects',
          totalCount: 'int',
          pageIndex: 'int',
          pageSize: 'int'
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        endpoint: '/api/v1/locations/search'
      };
    }
  }

  /**
   * GET /api/v1/locations/{locationId}
   * Get details for a specific Taco Bell location
   */
  async getLocation(locationId) {
    try {
      const response = await this.client.get(
        `/api/v1/locations/${locationId}`
      );
      return {
        success: true,
        data: response.data,
        structure: {
          locationId: 'string',
          name: 'string',
          address: 'string',
          city: 'string',
          state: 'string',
          postalCode: 'string',
          latitude: 'number',
          longitude: 'number',
          phone: 'string',
          hours: 'array of operating hours',
          isOpen: 'boolean',
          acceptsOnlineOrders: 'boolean',
          acceptsDelivery: 'boolean',
          acceptsPickup: 'boolean'
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        endpoint: `/api/v1/locations/${locationId}`
      };
    }
  }

  /**
   * GET /api/v1/menu
   * Fetch the complete menu with all categories and items
   */
  async getMenu(locationId = null) {
    try {
      const params = locationId ? { locationId } : {};
      const response = await this.client.get(
        '/api/v1/menu',
        { params }
      );
      return {
        success: true,
        data: response.data,
        structure: {
          categories: 'array of menu categories (Burritos, Tacos, etc)',
          items: 'array of menu item objects',
          modifierGroups: 'array of customization options',
          pricing: 'pricing strategy object'
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        endpoint: '/api/v1/menu'
      };
    }
  }

  /**
   * GET /api/v1/menu/items
   * Get menu items with filtering
   */
  async getMenuItems(filters = {}) {
    try {
      const response = await this.client.get(
        '/api/v1/menu/items',
        { params: filters }
      );
      return {
        success: true,
        data: response.data,
        structure: {
          items: 'array of menu items',
          count: 'int',
          filters: 'applied filter metadata'
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        endpoint: '/api/v1/menu/items'
      };
    }
  }

  /**
   * GET /api/v1/menu/items/{itemId}
   * Get detailed information about a specific menu item
   */
  async getMenuItem(itemId) {
    try {
      const response = await this.client.get(
        `/api/v1/menu/items/${itemId}`
      );
      return {
        success: true,
        data: response.data,
        structure: {
          itemId: 'string',
          name: 'string',
          description: 'string',
          price: 'number',
          category: 'string',
          nutritionInfo: 'object with calories, fat, protein, etc',
          allergens: 'array of allergen strings',
          available: 'boolean',
          modifiers: 'array of available modification groups'
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        endpoint: `/api/v1/menu/items/${itemId}`
      };
    }
  }

  /**
   * POST /api/v1/cart
   * Create a new order cart
   */
  async createCart(locationId) {
    try {
      const response = await this.client.post(
        '/api/v1/cart',
        {
          locationId,
          orderSource: 'WebV2'
        }
      );
      return {
        success: true,
        cartId: response.data.cartId,
        etag: response.headers['etag'],
        data: response.data,
        structure: {
          cartId: 'string',
          locationId: 'string',
          items: 'array',
          subtotal: 'number',
          tax: 'number',
          total: 'number',
          createdAt: 'ISO 8601 timestamp'
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        endpoint: '/api/v1/cart',
        method: 'POST'
      };
    }
  }

  /**
   * GET /api/v1/cart/{cartId}
   * Retrieve cart details
   */
  async getCart(cartId) {
    try {
      const response = await this.client.get(
        `/api/v1/cart/${cartId}`
      );
      return {
        success: true,
        cartId,
        etag: response.headers['etag'],
        data: response.data,
        structure: {
          cartId: 'string',
          locationId: 'string',
          items: 'array of cart items',
          subtotal: 'number',
          discounts: 'array of applied promotions',
          tax: 'number',
          deliveryFee: 'number|null',
          total: 'number'
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        endpoint: `/api/v1/cart/${cartId}`
      };
    }
  }

  /**
   * POST /api/v1/cart/{cartId}/items
   * Add an item to the cart
   */
  async addItemToCart(cartId, itemData, etag) {
    try {
      const response = await this.client.post(
        `/api/v1/cart/${cartId}/items`,
        itemData,
        {
          headers: {
            'If-Match': etag
          }
        }
      );
      return {
        success: true,
        itemId: response.data.itemId,
        etag: response.headers['etag'],
        cart: response.data.cart
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        endpoint: `/api/v1/cart/${cartId}/items`,
        method: 'POST'
      };
    }
  }

  /**
   * PUT /api/v1/cart/{cartId}/items/{itemId}
   * Update a cart item (quantity, customizations)
   */
  async updateCartItem(cartId, itemId, updateData, etag) {
    try {
      const response = await this.client.put(
        `/api/v1/cart/${cartId}/items/${itemId}`,
        updateData,
        {
          headers: {
            'If-Match': etag
          }
        }
      );
      return {
        success: true,
        itemId,
        etag: response.headers['etag'],
        cart: response.data.cart
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        endpoint: `/api/v1/cart/${cartId}/items/${itemId}`,
        method: 'PUT'
      };
    }
  }

  /**
   * DELETE /api/v1/cart/{cartId}/items/{itemId}
   * Remove an item from cart
   */
  async removeCartItem(cartId, itemId, etag) {
    try {
      const response = await this.client.delete(
        `/api/v1/cart/${cartId}/items/${itemId}`,
        {
          headers: {
            'If-Match': etag
          }
        }
      );
      return {
        success: true,
        etag: response.headers['etag'],
        cart: response.data.cart
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        endpoint: `/api/v1/cart/${cartId}/items/${itemId}`,
        method: 'DELETE'
      };
    }
  }

  /**
   * POST /api/v1/checkout
   * Proceed to checkout with cart
   */
  async checkout(cartId, checkoutData, etag) {
    try {
      const response = await this.client.post(
        '/api/v1/checkout',
        {
          cartId,
          ...checkoutData
        },
        {
          headers: {
            'If-Match': etag
          }
        }
      );
      return {
        success: true,
        checkoutId: response.data.checkoutId,
        etag: response.headers['etag'],
        data: response.data,
        structure: {
          checkoutId: 'string',
          cartId: 'string',
          orderType: 'pickup|delivery',
          deliveryAddress: 'object|null',
          estimatedTime: 'ISO 8601 timestamp',
          total: 'number'
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        endpoint: '/api/v1/checkout',
        method: 'POST'
      };
    }
  }

  /**
   * POST /api/v1/orders
   * Submit order for payment processing
   */
  async submitOrder(checkoutId, paymentData, etag) {
    try {
      const response = await this.client.post(
        '/api/v1/orders',
        {
          checkoutId,
          ...paymentData
        },
        {
          headers: {
            'If-Match': etag
          }
        }
      );
      return {
        success: true,
        orderId: response.data.orderId,
        confirmationCode: response.data.confirmationCode,
        orderStatus: response.data.orderStatus,
        etag: response.headers['etag'],
        data: response.data,
        structure: {
          orderId: 'string',
          confirmationCode: 'string',
          orderStatus: 'confirmed|pending',
          estimatedReadyTime: 'ISO 8601 timestamp',
          total: 'number'
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        endpoint: '/api/v1/orders',
        method: 'POST'
      };
    }
  }

  /**
   * GET /api/v1/orders/{orderId}
   * Get order status and details
   */
  async getOrder(orderId) {
    try {
      const response = await this.client.get(
        `/api/v1/orders/${orderId}`
      );
      return {
        success: true,
        orderId,
        data: response.data,
        structure: {
          orderId: 'string',
          confirmationCode: 'string',
          status: 'confirmed|preparing|ready|completed',
          items: 'array of ordered items',
          total: 'number',
          estimatedReadyTime: 'ISO 8601 timestamp',
          pickupLocation: 'object'
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        endpoint: `/api/v1/orders/${orderId}`
      };
    }
  }

  /**
   * POST /api/v1/delivery/estimate
   * Get delivery fee and time estimate
   */
  async getDeliveryEstimate(deliveryData) {
    try {
      const response = await this.client.post(
        '/api/v1/delivery/estimate',
        deliveryData
      );
      return {
        success: true,
        data: response.data,
        structure: {
          estimatedDeliveryTime: 'ISO 8601 timestamp',
          deliveryFee: 'number',
          minimumOrderValue: 'number',
          available: 'boolean'
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        endpoint: '/api/v1/delivery/estimate',
        method: 'POST'
      };
    }
  }

  /**
   * GET /api/v1/promotions
   * Get current promotions and deals
   */
  async getPromotions(locationId = null) {
    try {
      const params = locationId ? { locationId } : {};
      const response = await this.client.get(
        '/api/v1/promotions',
        { params }
      );
      return {
        success: true,
        data: response.data,
        structure: {
          promotions: 'array of active promotional offers',
          count: 'int'
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        endpoint: '/api/v1/promotions'
      };
    }
  }

  /**
   * POST /api/v1/cart/{cartId}/apply-promo
   * Apply promotional code to cart
   */
  async applyPromoCode(cartId, promoCode, etag) {
    try {
      const response = await this.client.post(
        `/api/v1/cart/${cartId}/apply-promo`,
        { promoCode },
        {
          headers: {
            'If-Match': etag
          }
        }
      );
      return {
        success: true,
        etag: response.headers['etag'],
        discount: response.data.discount,
        cart: response.data.cart
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        endpoint: `/api/v1/cart/${cartId}/apply-promo`,
        method: 'POST'
      };
    }
  }

  /**
   * GET /api/v1/locations/{locationId}/hours
   * Get detailed hours for a location
   */
  async getLocationHours(locationId) {
    try {
      const response = await this.client.get(
        `/api/v1/locations/${locationId}/hours`
      );
      return {
        success: true,
        data: response.data,
        structure: {
          locationId: 'string',
          hours: 'array of daily operating hours',
          currentlyOpen: 'boolean',
          nextOpenTime: 'ISO 8601 timestamp|null'
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        endpoint: `/api/v1/locations/${locationId}/hours`
      };
    }
  }

  /**
   * GET /api/v1/locations/{locationId}/menu
   * Get location-specific menu (some items may vary by location)
   */
  async getLocationMenu(locationId) {
    try {
      const response = await this.client.get(
        `/api/v1/locations/${locationId}/menu`
      );
      return {
        success: true,
        data: response.data,
        structure: {
          locationId: 'string',
          menu: 'menu object specific to this location',
          lastUpdated: 'ISO 8601 timestamp'
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        endpoint: `/api/v1/locations/${locationId}/menu`
      };
    }
  }
}

module.exports = TacoBellAPI;
