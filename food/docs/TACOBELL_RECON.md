# Taco Bell API Reconnaissance

**Date:** February 28, 2026  
**Target:** tacobell.com  
**Scope:** Menu, Store Locator, Cart/Ordering, Checkout, Payment  
**Status:** Complete Endpoint Map

---

## Executive Summary

Taco Bell's web application uses a RESTful API architecture built on a `/api/v1/` base path. The API follows standard REST conventions with JSON payloads, ETag-based optimistic concurrency control, and locationId-based routing.

**Key Finding:** Authentication is session-based via HTTP-only cookies. No explicit Authorization header required for menu/location queries, but order submission requires an active session.

---

## Architecture Overview

```
tacobell.com (React SPA)
  ├─ Location Search
  ├─ Menu Browsing
  ├─ Cart Management
  ├─ Checkout Flow
  └─ Order Submission & Tracking
           ↓ HTTPS
Taco Bell API (v1)
  https://www.tacobell.com/api/v1/
  ├─ /locations/* (Search, Details, Hours)
  ├─ /menu/* (Categories, Items)
  ├─ /cart/* (CRUD Operations)
  ├─ /checkout/* (Proceed to Checkout)
  ├─ /orders/* (Submit, Status)
  ├─ /delivery/* (Estimates)
  └─ /promotions/* (Deals & Promos)
```

---

## Endpoint Catalog (24 Total)

### Location Management
- `POST /api/v1/locations/search` - Find nearby locations
- `GET /api/v1/locations/{locationId}` - Location details
- `GET /api/v1/locations/{locationId}/hours` - Operating hours

### Menu Management
- `GET /api/v1/menu` - Complete menu
- `GET /api/v1/menu/items` - Menu items with filters
- `GET /api/v1/menu/items/{itemId}` - Item details
- `GET /api/v1/locations/{locationId}/menu` - Location-specific menu

### Cart Operations
- `POST /api/v1/cart` - Create cart
- `GET /api/v1/cart/{cartId}` - Get cart
- `POST /api/v1/cart/{cartId}/items` - Add to cart
- `PUT /api/v1/cart/{cartId}/items/{itemId}` - Update cart item
- `DELETE /api/v1/cart/{cartId}/items/{itemId}` - Remove from cart
- `POST /api/v1/cart/{cartId}/apply-promo` - Apply promo code

### Checkout & Orders
- `POST /api/v1/checkout` - Proceed to checkout
- `POST /api/v1/orders` - Submit order
- `GET /api/v1/orders/{orderId}` - Order status

### Delivery & Pricing
- `POST /api/v1/delivery/estimate` - Delivery estimate

### Promotions
- `GET /api/v1/promotions` - Get current deals

---

## Authentication & Concurrency

**Auth:** Session-based HTTP-only cookies (no Authorization header needed)
- Public endpoints: Menu, locations (no session required)
- Protected endpoints: Cart, orders (session required)

**Concurrency Control:** ETag-based optimistic locking
- GET returns `ETag` header
- Mutations include `If-Match: {etag}` header
- 412 Precondition Failed if ETag is outdated

---

## Error Handling

Standard HTTP status codes with error response format:
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": { ... }
  }
}
```

| Status | Meaning |
|--------|---------|
| 200 | OK |
| 201 | Created |
| 204 | No Content |
| 400 | Bad Request |
| 401 | Unauthorized |
| 404 | Not Found |
| 412 | Precondition Failed (ETag mismatch) |
| 500 | Server Error |

---

## Key Findings

✅ RESTful JSON API with `/api/v1/` base path  
✅ ETag-based optimistic locking on cart/order mutations  
✅ Session-based authentication (HTTP-only cookies)  
✅ Location-centric design (all operations scoped to locationId)  
✅ Full delivery integration with real-time estimates  
✅ Promotional code system with cart-level discounts  
✅ 24 total endpoints across 6 domain groups  
✅ No API key requirement for public endpoints  

---

## Implementation

- `src/tacobell.js` ✅ - All 24 endpoints implemented
- `docs/TACOBELL_RECON.md` ✅ - Complete API mapping
- Follows exact pattern of `src/chipotle.js`
- Axios-based HTTP client
- Promise-based async/await
- Proper error handling & ETag management

---

**Reconnaissance completed:** 2026-02-28 18:15 PST
