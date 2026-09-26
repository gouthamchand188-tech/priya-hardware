# Priya Hardware — Complete E-commerce Upgrade

This project upgrades the existing Priya Hardware store into an Amazon-style hardware e-commerce experience (using its own Priya Hardware branding).

## Included

### Customer
- Home / hero / categories
- Product search, category filtering, price filtering and sorting
- Product details
- Product images with upload support from Admin
- Cart with quantity controls
- Wishlist
- Customer registration/login
- Checkout and COD/ONLINE method selection
- My Orders with status tracking
- Product reviews

### Admin
- Dashboard statistics
- Add/edit/delete products
- Product image upload
- Inventory/stock
- Orders and order-status updates
- Category overview
- Store shortcut

### Data
SQLite stores products, customers, sessions, orders and reviews.

## Run locally

1. Install Node.js 20+.
2. Run `npm install`.
3. Set an admin password:
   - Windows PowerShell: `$env:ADMIN_PASSWORD="your-password"`
   - macOS/Linux: `export ADMIN_PASSWORD="your-password"`
4. Run `npm start`.
5. Open `http://localhost:3000`.
6. Admin login: `http://localhost:3000/admin-login.html`.

## Render

The included `render.yaml` uses `/var/data` for SQLite so a Render persistent disk can keep the database. Set `ADMIN_PASSWORD` in Render environment variables.

A real payment gateway is not included; selecting ONLINE records the payment method. A gateway such as Razorpay/Stripe can be connected after the store flow is working.
