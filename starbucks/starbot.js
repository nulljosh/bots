const SBUX_UA = 'Starbucks Android 6.48';
const SBUX_BASE = 'https://openapi.starbucks.com/v1';

// Starbucks deprecated all public BFF endpoints (ca/bff/*) circa early 2026.
// Balance check and store locator now require either:
//   1. OAuth bearer token (mitmproxy intercept of mobile app)
//   2. Puppeteer scraping of starbucks.com/gift/check-balance and store-locator
// Keeping the API surface intact so the CLI wrapper doesn't break.

class StarbotAPI {
  extractFeatures(store) {
    if (Array.isArray(store?.features) && store.features.length > 0) {
      return store.features;
    }
    if (Array.isArray(store?.amenities) && store.amenities.length > 0) {
      return store.amenities;
    }
    const inferred = [];
    if (store?.driveThrough) inferred.push('driveThrough');
    if (store?.mobileOrder) inferred.push('mobileOrder');
    if (store?.wifi) inferred.push('wifi');
    return inferred;
  }

  async cardBalance(cardNumber, pin) {
    // Try OAuth API if we have a token
    if (this.token) {
      const response = await fetch(`${SBUX_BASE}/me/cards`, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          'User-Agent': SBUX_UA,
          Accept: 'application/json',
        },
      });
      if (response.ok) {
        const cards = await response.json();
        const card = (Array.isArray(cards) ? cards : []).find(
          (c) => c.cardNumber?.endsWith(cardNumber.slice(-4))
        );
        if (card) {
          return {
            balance: parseFloat(card.balance || 0),
            rewards: parseInt(card.rewards || card.stars || 0, 10),
            cardNumber: cardNumber.slice(-4),
          };
        }
      }
    }

    throw new Error(
      'Starbucks BFF endpoints are deprecated. Requires OAuth token (mitmproxy) or Puppeteer scraping. See CLAUDE.md.'
    );
  }

  async stores(address, limit = 5) {
    // Try OAuth API if we have a token
    if (this.token) {
      const response = await fetch(
        `${SBUX_BASE}/stores/nearby?latlng=49.1,-122.6&limit=${limit}`,
        {
          headers: {
            Authorization: `Bearer ${this.token}`,
            'User-Agent': SBUX_UA,
            Accept: 'application/json',
          },
        }
      );
      if (response.ok) {
        const data = await response.json();
        const stores = (data?.stores || []).slice(0, limit).map((s) => ({
          name: s.name,
          address: `${s.address?.streetAddressLine1 || ''}, ${s.address?.city || ''}`,
          distance: s.distance?.value
            ? `${s.distance.value} ${s.distance.unit || 'km'}`
            : s.distance || 'N/A',
          hours: s.schedule?.todayHours || 'Hours unavailable',
          features: this.extractFeatures(s),
        }));
        return { stores };
      }
    }

    throw new Error(
      'Starbucks BFF endpoints are deprecated. Requires OAuth token (mitmproxy) or Puppeteer scraping. See CLAUDE.md.'
    );
  }

  async login(email, password) {
    throw new Error(
      `Login requires OAuth credentials (email: ${email}). Intercept Starbucks app with mitmproxy to get clientId/clientSecret.`
    );
  }

  async reload(cardNumber, amount) {
    throw new Error(
      `Reload $${amount} to ***${cardNumber.slice(-4)} requires authentication. Call login() first.`
    );
  }
}

export { StarbotAPI };
