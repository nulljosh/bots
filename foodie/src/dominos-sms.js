/**
 * dominos-sms.js — SMS notifications for Dominos orders
 * Sends confirmation & tracking updates via text
 */

const { DominosAPI } = require('./dominos');

class DominosSmsNotifier {
  constructor(options = {}) {
    this.dominos = new DominosAPI(options);
    this.phone = options.phone || '7788462726';
    this.callbacks = [];
    this.polling = false;
  }

  /**
   * Send order confirmation SMS
   */
  async notifyOrderPlaced(orderData) {
    const message = `
Dominos Order Confirmed!
Order ID: ${orderData.orderId}
Store: ${orderData.storeID}
Total: $${(orderData.total || 0).toFixed(2)}
Delivery: ~${orderData.eta || 30} min
Track: tracker.dominos.com
    `.trim();

    return this.emit('sms', {
      to: this.phone,
      message,
      order: orderData,
    });
  }

  /**
   * Send order status update
   */
  async notifyOrderStatus(status, stage) {
    const message = `
Dominos Order Update
Status: ${status}
${stage ? `Stage: ${stage}` : ''}
Track: tracker.dominos.com
    `.trim();

    return this.emit('sms', {
      to: this.phone,
      message,
      status,
    });
  }

  /**
   * Poll tracker and send updates
   */
  async startTracking(phone, pollIntervalMs = 30000) {
    if (this.polling) return; // Already polling
    this.polling = true;

    const poll = async () => {
      try {
        const result = await this.dominos.trackOrder(phone);
        if (result.success && result.orders && result.orders.length > 0) {
          for (const order of result.orders) {
            await this.notifyOrderStatus(
              order.OrderStatus,
              order.OrderDescription
            );
          }
        }

        // Check if all orders are complete
        if (result.orders?.every(o => o.OrderStatus === 'Complete' || o.OrderStatus === 'Delivered')) {
          this.polling = false;
          await this.notifyOrderStatus('Delivered', 'Your order has arrived!');
          return;
        }

        // Continue polling
        if (this.polling) {
          setTimeout(poll, pollIntervalMs);
        }
      } catch (err) {
        console.error('[Dominos SMS] Polling error:', err.message);
        if (this.polling) {
          setTimeout(poll, pollIntervalMs * 2); // Back off on error
        }
      }
    };

    poll();
  }

  /**
   * Stop polling
   */
  stopTracking() {
    this.polling = false;
  }

  /**
   * Register callback for SMS sending
   */
  onSms(callback) {
    this.callbacks.push(callback);
    return this;
  }

  /**
   * Emit SMS to callbacks
   */
  async emit(type, data) {
    for (const cb of this.callbacks) {
      try {
        await cb(type, data);
      } catch (err) {
        console.error('[Dominos SMS] Callback error:', err.message);
      }
    }
  }
}

module.exports = { DominosSmsNotifier };
