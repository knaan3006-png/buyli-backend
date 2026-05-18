# Buyli V11 Backend Proxy

This folder is a production-ready starting point for a CJdropshipping proxy.

Why this exists:
- The mobile app should not call CJ directly.
- The CJ API key should not stay inside the mobile app.
- The backend fetches CJ products and returns normalized Buyli products.
- The backend can save product cache into Firestore.

Deploy options:
1. Firebase Functions
2. Vercel / Netlify serverless
3. Small Node.js server

Required environment variable:
CJ_API_KEY=CJ5430203@api@...

Endpoints:
GET /products?keyword=watch
POST /sync-products

The app currently has backendProxyConfig.enabled=false.
After deploying the backend, set:
enabled: true
baseUrl: "https://YOUR_BACKEND_URL"
