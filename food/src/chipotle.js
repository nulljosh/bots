/**
 * Chipotle API Integration
 * Real endpoints discovered from chipotle.com web application
 * Last updated: 2026-02-28
 */

const axios = require('axios');

class ChipotleAPI {
  constructor() {
    this.baseUrl = 'https://www.chipotle.com';
    this.apiVersion = 'v3';
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
   * GET /menuinnovation/v1/restaurants/{storeId}/onlinemenus/compressed
   * Fetches the compressed menu for a restaurant
   */
  async getMenu(storeId) {
    try {
      const response = await this.client.get(
        `/menuinnovation/v1/restaurants/${storeId}/onlinemenus/compressed`
      );
      return {
        success: true,
        data: response.data,
        structure: {
          topLevelMenus: 'array of categories (Bowls, Burritos, etc)',
          itemGroups: 'array of item definitions with pricing',
          customizations: 'array of modification options'
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        endpoint: `/menuinnovation/v1/restaurants/${storeId}/onlinemenus/compressed`
      };
    }
  }

  /**
   * GET /restaurant/v3/restaurant/{restaurantId}
   * Fetches restaurant details including hours, location, capabilities
   */
  async getRestaurant(restaurantId, embeds = ['addresses', 'realHours', 'experience', 'onlineOrdering', 'sustainability']) {
    try {
      const response = await this.client.get(
        `/restaurant/v3/restaurant/${restaurantId}`,
        {
          params: {
            embed: embeds.join(',')
          }
        }
      );
      return {
        success: true,
        data: response.data,
        structure: {
          restaurantNumber: 'int',
          restaurantName: 'string',
          addresses: 'array of address objects',
          hours: 'array of operating hours by day',
          onlineOrdering: { onlineOrderingEnabled: 'boolean' },
          experience: {
            digitalKitchen: 'boolean',
            crewTipPickupEnabled: 'boolean',
            crewTipDeliveryEnabled: 'boolean'
          }
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        endpoint: `/restaurant/v3/restaurant/${restaurantId}`
      };
    }
  }

  /**
   * POST /restaurant/v3/restaurant
   * Search restaurants by location
   */
  async searchRestaurants(latitude, longitude, radius = 80647) {
    try {
      const response = await this.client.post(
        '/restaurant/v3/restaurant',
        {
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
            sustainability: true
          }
        }
      );
      return {
        success: true,
        data: response.data.data,
        structure: 'array of restaurant objects ordered by distance'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        endpoint: '/restaurant/v3/restaurant',
        payload: 'latitude, longitude, radius, filters'
      };
    }
  }

  /**
   * POST /order/v3/cart/online
   * Creates a new order cart
   */
  async createOrder(restaurantId, orderType = 'Regular', groupOrderMessage = null) {
    try {
      const payload = {
        restaurantId,
        orderType,
        groupOrderMessage,
        orderSource: 'WebV2'
      };

      const response = await this.client.post(
        '/order/v3/cart/online',
        payload,
        {
          params: {
            embeds: 'order'
          }
        }
      );

      return {
        success: true,
        orderId: response.data.order.orderId,
        etag: response.headers['etag'],
        data: response.data,
        structure: {
          order: {
            orderId: 'string',
            restaurantId: 'int',
            orderType: 'Regular|Group',
            meals: 'array',
            delivery: 'object|null',
            pricing: {
              orderMealsExtendedPrice: 'number',
              orderTaxAmount: 'number',
              orderTotalAmount: 'number'
            }
          }
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        endpoint: '/order/v3/cart/online',
        method: 'POST'
      };
    }
  }

  /**
   * GET /order/v3/cart/online/{orderId}
   * Retrieves order details
   */
  async getOrder(orderId, finalizePricing = true) {
    try {
      const response = await this.client.get(
        `/order/v3/cart/online/${orderId}`,
        {
          params: {
            finalizePricing
          }
        }
      );

      return {
        success: true,
        orderId,
        etag: response.headers['etag'],
        data: response.data.order,
        structure: {
          orderId: 'string',
          restaurantId: 'int',
          meals: 'array of meal objects',
          delivery: 'delivery info or null',
          discounts: 'array of applied promos',
          orderStatus: 'InProcess|Submitted',
          pricing: {
            subtotal: 'number',
            tax: 'number',
            deliveryFee: 'number',
            total: 'number'
          }
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        endpoint: `/order/v3/cart/online/${orderId}`
      };
    }
  }

  /**
   * POST /order/v3/cart/online/{orderId}/meals
   * Adds a meal to the cart
   */
  async addMealToOrder(orderId, mealData, etag) {
    try {
      const response = await this.client.post(
        `/order/v3/cart/online/${orderId}/meals`,
        mealData,
        {
          headers: {
            'If-Match': etag
          },
          params: {
            embeds: 'order',
            finalizePricing: true
          }
        }
      );

      return {
        success: true,
        mealId: response.data.mealId,
        etag: response.headers['etag'],
        order: response.data.order
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        endpoint: `/order/v3/cart/online/${orderId}/meals`,
        method: 'POST'
      };
    }
  }

  /**
   * PUT /order/v3/cart/online/{orderId}/delivery
   * Adds delivery info to order
   */
  async addDeliveryInfo(orderId, deliveryData, etag) {
    try {
      const response = await this.client.put(
        `/order/v3/cart/online/${orderId}/delivery`,
        deliveryData,
        {
          headers: {
            'If-Match': etag
          },
          params: {
            embeds: 'order',
            finalizePricing: true
          }
        }
      );

      return {
        success: true,
        etag: response.headers['etag'],
        order: response.data.order
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        endpoint: `/order/v3/cart/online/${orderId}/delivery`
      };
    }
  }

  /**
   * POST /order/v3/submit/online/{orderId}
   * Submits the order for payment processing
   */
  async submitOrder(orderId, paymentData, etag) {
    try {
      const response = await this.client.post(
        `/order/v3/submit/online/${orderId}`,
        paymentData,
        {
          headers: {
            'If-Match': etag
          }
        }
      );

      return {
        success: true,
        orderId: response.data.orderId,
        orderStatus: response.data.orderStatus,
        confirmationCode: response.data.confirmationCode,
        etag: response.headers['etag'],
        data: response.data,
        structure: {
          orderId: 'string',
          orderStatus: 'Submitted|Confirmed',
          confirmationCode: 'string',
          estimatedDeliveryTime: 'string|null',
          estimatedPickupTime: 'string|null'
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        endpoint: `/order/v3/submit/online/${orderId}`,
        method: 'POST'
      };
    }
  }

  /**
   * GET /order/v3/submit/pickuptimes/{storeId}
   * Gets available pickup times for a location
   */
  async getPickupTimes(storeId) {
    try {
      const response = await this.client.get(
        `/order/v3/submit/pickuptimes/${storeId}`
      );

      return {
        success: true,
        data: response.data,
        structure: 'array of available pickup time slots'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        endpoint: `/order/v3/submit/pickuptimes/${storeId}`
      };
    }
  }

  /**
   * POST /order/v3/delivery/estimate
   * Gets delivery estimate for address
   */
  async getDeliveryEstimate(deliveryData) {
    try {
      const response = await this.client.post(
        '/order/v3/delivery/estimate',
        deliveryData
      );

      return {
        success: true,
        data: response.data,
        structure: {
          estimatedDeliveryTime: 'string (ISO 8601)',
          deliveryFee: 'number',
          minimumOrderValue: 'number'
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        endpoint: '/order/v3/delivery/estimate',
        method: 'POST'
      };
    }
  }
}

module.exports = ChipotleAPI;
