import express from "express";
import cors from "cors";
import crypto from "crypto";

const app = express();
const PORT = process.env.PORT || 8080;
const CJ_BASE_URL = "https://developers.cjdropshipping.com/api2.0/v1";
const ALIEXPRESS_API_URL = process.env.ALIEXPRESS_API_URL || "https://api-sg.aliexpress.com/sync";

app.use(cors());
app.use(express.json({ limit: "1mb" }));

let lastCatalog = [];
let lastBlockedProducts = [];
let catalogCache = new Map();
let syncJobs = [];
let orderEvents = [];
let cjTokenCache = { accessToken: "", refreshToken: "", expiresAt: 0 };

const DEFAULT_PAGE_SIZE = 120;
// AliExpress may limit a single API call. Buyli does not limit the catalog;
// we fetch in provider-safe batches, multiple pages and multiple keyword variants.
const PROVIDER_SAFE_PAGE_SIZE = 50;
const MAX_BUYLI_PAGE_SIZE = 240;
const BUYLI_UNLIMITED_MODE = true;
const SEARCH_BATCH_PAGES = 3;

const SEARCH_INTENT_RULES = [
  {
    id: "dress",
    aliases: ["שמלה", "שמלות", "שמל", "dress", "dresses", "gown"],
    backendKeyword: "women dress",
    mustIncludeAny: ["dress", "dresses", "gown", "robe"],
    exclude: ["heel", "heels", "shoe", "shoes", "sandal", "sandals", "sneaker", "sneakers", "boot", "boots", "slipper", "slippers", "bag", "handbag", "wallet"]
  },
  {
    id: "heels",
    aliases: ["עקב", "עקבים", "נעלי עקב", "heels", "high heels"],
    backendKeyword: "women high heels shoes",
    mustIncludeAny: ["heel", "heels", "pump", "pumps", "stiletto", "shoe", "shoes"],
    exclude: ["dress", "dresses", "gown", "bag", "watch"]
  },
  {
    id: "shoes",
    aliases: ["נעל", "נעליים", "סניקרס", "sneaker", "sneakers", "shoes"],
    backendKeyword: "shoes sneakers",
    mustIncludeAny: ["shoe", "shoes", "sneaker", "sneakers"],
    exclude: ["dress", "dresses", "gown", "bag", "watch"]
  },
  {
    id: "watch",
    aliases: ["שעון", "שעונים", "watch", "watches", "smartwatch"],
    backendKeyword: "watch",
    mustIncludeAny: ["watch", "watches", "smartwatch", "clock"],
    exclude: ["shoe", "dress", "bag", "heels"]
  },
  {
    id: "bag",
    aliases: ["תיק", "תיקים", "ארנק", "ארנקים", "bag", "bags", "handbag", "backpack", "wallet"],
    backendKeyword: "women bag handbag backpack",
    mustIncludeAny: ["bag", "bags", "handbag", "backpack", "wallet", "purse"],
    exclude: ["dress", "shoe", "heels", "watch"]
  },
  {
    id: "kitchen",
    aliases: ["מטבח", "כיור", "kitchen", "sink", "organizer"],
    backendKeyword: "kitchen organizer gadget",
    mustIncludeAny: ["kitchen", "sink", "cook", "organizer", "storage"],
    exclude: ["dress", "shoe", "heels", "watch", "bag"]
  },
  {
    id: "car",
    aliases: ["רכב", "אוטו", "car", "auto", "vehicle"],
    backendKeyword: "car accessories",
    mustIncludeAny: ["car", "auto", "vehicle"],
    exclude: ["dress", "shoe", "heels", "bag"]
  },
  {
    id: "beauty",
    aliases: ["יופי", "טיפוח", "איפור", "beauty", "makeup", "hair"],
    backendKeyword: "beauty tools makeup hair",
    mustIncludeAny: ["beauty", "makeup", "cosmetic", "hair", "skin", "nail"],
    exclude: ["dress", "shoe", "heels", "watch", "bag"]
  },
  {
    id: "electronics",
    aliases: ["אלקטרוניקה", "אוזניות", "מטען", "כבל", "טלפון", "earbuds", "charger", "cable", "phone"],
    backendKeyword: "phone accessories earbuds charger",
    mustIncludeAny: ["earbuds", "headphone", "charger", "cable", "phone", "usb", "bluetooth"],
    exclude: ["dress", "heels", "bag"]
  }
];

function normalizeQueryText(value = "") {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[׳״'"`.,;:!?()[\]{}|/\\_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function resolveSearchIntent(keyword = "") {
  const query = normalizeQueryText(keyword);
  if (!query || query === "buyli-home") return null;
  return SEARCH_INTENT_RULES.find((rule) =>
    rule.aliases.some((alias) => {
      const normalizedAlias = normalizeQueryText(alias);
      return query === normalizedAlias || query.includes(normalizedAlias) || normalizedAlias.includes(query);
    })
  ) || null;
}

function providerKeywordForSearch(keyword = "") {
  const intent = resolveSearchIntent(keyword);
  return intent?.backendKeyword || keyword || "watch";
}

function expandedKeywordsForSearch(keyword = "") {
  const intent = resolveSearchIntent(keyword);
  const normalized = providerKeywordForSearch(keyword);

  if (!intent && keyword && keyword !== "buyli-home") {
    return [normalized];
  }

  if (keyword === "buyli-home") {
    return [
      "women dress",
      "women bag",
      "smart watch",
      "kitchen organizer",
      "home gadgets",
      "car accessories",
      "beauty tools",
      "phone accessories",
      "sports accessories",
      "kids toys"
    ];
  }

  const plans = {
    dress: ["women dress", "women dresses", "summer dress", "party dress", "casual dress", "long dress", "evening dress", "fashion dress", "mini dress"],
    heels: ["women high heels", "high heel shoes", "stiletto heels", "women pumps", "party heels"],
    shoes: ["sneakers", "men shoes", "women shoes", "sport shoes", "casual shoes"],
    watch: ["smart watch", "men watch", "women watch", "digital watch", "fashion watch"],
    bag: ["women bag", "handbag", "backpack", "wallet", "crossbody bag", "shoulder bag"],
    kitchen: ["kitchen organizer", "kitchen gadgets", "sink organizer", "kitchen storage", "cooking tools"],
    car: ["car accessories", "car phone holder", "car organizer", "car led", "auto accessories"],
    beauty: ["beauty tools", "makeup tools", "hair tools", "skin care tools", "nail tools"],
    electronics: ["phone accessories", "wireless earbuds", "charger", "usb cable", "bluetooth speaker"]
  };

  return plans[intent?.id] || [normalized];
}

function productMatchesIntent(product, keyword = "") {
  const intent = resolveSearchIntent(keyword);
  if (!intent) return true;
  const text = normalizeQueryText([product.title, product.description, product.category].join(" "));
  if (intent.exclude.some((word) => text.includes(normalizeQueryText(word)))) return false;
  return intent.mustIncludeAny.some((word) => text.includes(normalizeQueryText(word)));
}

function requestedPage(value) {
  const n = Number(value || 1);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

function requestedPageSize(value) {
  const n = Number(value || DEFAULT_PAGE_SIZE);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(n), MAX_BUYLI_PAGE_SIZE);
}

function cacheKey(source, keyword, page) {
  return `${source}:${String(keyword || '').toLowerCase()}:page-${page}`;
}

function rememberProducts(source, keyword, page, products) {
  const key = cacheKey(source, keyword, page);
  catalogCache.set(key, { products, source, keyword, page, cachedAt: new Date().toISOString() });
  const merged = [...lastCatalog, ...products];
  const seen = new Set();
  lastCatalog = merged.filter((item) => {
    const id = `${item.source || source}:${item.id || item.externalProductId}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function summarizeOrders(orders = []) {
  const payableStatuses = new Set(['paid', 'supplier_ordered', 'shipped', 'completed']);
  const finalStatuses = new Set(['completed']);
  const activeOrders = orders.filter((order) => payableStatuses.has(order.status));
  const completedOrders = orders.filter((order) => finalStatuses.has(order.status));
  const totalPaid = activeOrders.reduce((sum, order) => sum + toNumber(order.customerPaid || order.totalPrice, 0), 0);
  const supplierCost = activeOrders.reduce((sum, order) => sum + toNumber(order.supplierCostTotal, 0), 0);
  const grossProfit = activeOrders.reduce((sum, order) => sum + toNumber(order.buyliProfitTotal, 0), 0);
  return {
    ordersCount: orders.length,
    actualSalesOrders: activeOrders.length,
    completedOrders: completedOrders.length,
    totalPaid: Number(totalPaid.toFixed(2)),
    supplierCost: Number(supplierCost.toFixed(2)),
    actualGrossProfit: Number(grossProfit.toFixed(2)),
    avgProfitPerOrder: activeOrders.length ? Number((grossProfit / activeOrders.length).toFixed(2)) : 0,
    statuses: orders.reduce((acc, order) => {
      acc[order.status || 'unknown'] = (acc[order.status || 'unknown'] || 0) + 1;
      return acc;
    }, {})
  };
}

const FALLBACK_PRODUCTS = [
  {
    id: "fallback-cj-watch",
    title: "CJ Smart Watch Ready Product",
    price: 39,
    image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=900",
    images: [
      "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=900",
      "https://images.unsplash.com/photo-1434493789847-2f02dc6ca35d?w=900",
      "https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?w=900"
    ],
    category: "Electronics",
    description: "CJ ready product for Buyli testing and product engine sync.",
    source: "cj",
    sourceStatus: "fallback"
  },
  {
    id: "fallback-ae-watch",
    title: "AliExpress Smart Watch Affiliate Ready",
    price: 42,
    image: "https://images.unsplash.com/photo-1434493789847-2f02dc6ca35d?w=900",
    images: [
      "https://images.unsplash.com/photo-1434493789847-2f02dc6ca35d?w=900",
      "https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?w=900",
      "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=900"
    ],
    category: "Electronics",
    description: "AliExpress fallback product. The API keys are ready; live API will be used when AliExpress returns product data.",
    source: "aliexpress",
    affiliateUrl: "",
    sourceStatus: "fallback"
  },
  {
    id: "fallback-shein-dress",
    title: "SHEIN Style Summer Dress Ready Feed",
    price: 35,
    image: "https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?w=900",
    images: [
      "https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?w=900",
      "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=900",
      "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=900"
    ],
    category: "Fashion",
    description: "SHEIN placeholder. Add affiliate/feed credentials after approval.",
    source: "shein",
    affiliateUrl: "",
    sourceStatus: "manual"
  }
];

function env(...names) {
  return names.map((name) => process.env[name]).find(Boolean) || "";
}

function mask(value) {
  if (!value) return "";
  if (value.length <= 6) return "***";
  return `${value.slice(0, 3)}***${value.slice(-3)}`;
}

function toNumber(value, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;
  const clean = String(value).replace(/[^0-9.]/g, "");
  const n = Number(clean);
  return Number.isFinite(n) ? n : fallback;
}

// BUYLI TEMPORARY FIXED PRICING METHOD
// Final price = (supplier cost × 1.15 + ₪5) ÷ 0.92, then rounded to a nice retail price.
const BUYLI_BASE_PROFIT_RATE = 0.15;
const BUYLI_HANDLING_FEE_ILS = 5;
const BUYLI_BUFFER_RATE = 0.08;

function roundToBuyliPrice(value) {
  const safeValue = Math.max(1, Number(value) || 1);
  return Number((Math.max(29.9, Math.ceil(safeValue / 5) * 5 - 0.1)).toFixed(2));
}

function calculateBuyliPricing(supplierCostIls) {
  const supplierCost = Math.max(1, toNumber(supplierCostIls, 1));
  const baseProfit = supplierCost * BUYLI_BASE_PROFIT_RATE;
  const beforeBuffer = supplierCost + baseProfit + BUYLI_HANDLING_FEE_ILS;
  const rawRetailPrice = beforeBuffer / (1 - BUYLI_BUFFER_RATE);
  const buyliPrice = roundToBuyliPrice(rawRetailPrice);

  return {
    supplierPrice: Number(supplierCost.toFixed(2)),
    price: buyliPrice,
    buyliRetailPrice: buyliPrice,
    buyliProfit: Number((buyliPrice - supplierCost).toFixed(2)),
    buyliProfitPercent: Number(((buyliPrice - supplierCost) / supplierCost).toFixed(2)),
    pricingMethod: {
      baseProfitRate: BUYLI_BASE_PROFIT_RATE,
      handlingFee: BUYLI_HANDLING_FEE_ILS,
      bufferRate: BUYLI_BUFFER_RATE,
      formula: "(supplierCost * 1.15 + 5) / 0.92"
    }
  };
}

function getFirstImage(item) {
  const values = [
    item?.product_main_image_url,
    item?.product_small_image_urls?.string?.[0],
    item?.productImage,
    item?.image,
    item?.mainImage,
    item?.coverImage
  ];
  for (const value of values) {
    if (typeof value === "string" && value) return value;
  }

  const arrays = [item?.productImageSet, item?.images, item?.imageList, item?.product_small_image_urls?.string];
  for (const arr of arrays) {
    if (!Array.isArray(arr)) continue;
    const first = arr[0];
    if (typeof first === "string") return first;
    if (typeof first?.image === "string") return first.image;
    if (typeof first?.url === "string") return first.url;
  }

  return "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=900";
}

function getImages(item) {
  const images = [getFirstImage(item)];
  const raw = item?.product_small_image_urls?.string || item?.productImageSet || item?.images || item?.imageList || [];

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (typeof entry === "string") images.push(entry);
      if (typeof entry?.image === "string") images.push(entry.image);
      if (typeof entry?.url === "string") images.push(entry.url);
    }
  }

  return [...new Set(images.filter(Boolean))].slice(0, 8);
}

function extractList(data) {
  return (
    data?.aliexpress_affiliate_product_query_response?.resp_result?.result?.products?.product ||
    data?.aliexpress_affiliate_product_query_response?.resp_result?.result?.products ||
    data?.resp_result?.result?.products?.product ||
    data?.resp_result?.result?.products ||
    data?.data?.list ||
    data?.data?.content ||
    data?.data?.records ||
    data?.data ||
    data?.result?.list ||
    data?.result ||
    data?.products ||
    []
  );
}

function sortedParamString(params) {
  return Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== "" && key !== "sign")
    .sort()
    .map((key) => `${key}${params[key]}`)
    .join("");
}

function signSha256(params, secret) {
  // Alibaba TOP-style HMAC-SHA256 signing.
  return crypto.createHmac("sha256", secret).update(sortedParamString(params)).digest("hex").toUpperCase();
}

function signMd5(params, secret) {
  // Fallback TOP-style MD5 signing used by some Alibaba APIs.
  return crypto.createHash("md5").update(secret + sortedParamString(params) + secret).digest("hex").toUpperCase();
}

function mapCJProduct(item, index) {
  const supplierCost = toNumber(item?.sellPrice || item?.price || item?.listedPrice || item?.listPrice || item?.variantSellPrice || 0);
  const pricing = calculateBuyliPricing(supplierCost);
  return {
    id: String(item?.pid || item?.productId || item?.vid || item?.id || `cj-${index + 1}`),
    title: item?.productNameEn || item?.productName || item?.nameEn || item?.name || "CJ Product",
    price: pricing.price,
    supplierPrice: pricing.supplierPrice,
    buyliRetailPrice: pricing.buyliRetailPrice,
    buyliProfit: pricing.buyliProfit,
    buyliProfitPercent: pricing.buyliProfitPercent,
    pricingMethod: pricing.pricingMethod,
    image: getFirstImage(item),
    images: getImages(item),
    category: item?.categoryName || item?.category || item?.categoryNameEn || "Products",
    description: item?.description || item?.productDescription || item?.remark || "",
    source: "cj",
    externalProductId: String(item?.pid || item?.productId || item?.id || ""),
    sourceStatus: "live"
  };
}

function mapAliExpressProduct(item, index, trackingId) {
  const supplierCost = toNumber(item?.target_sale_price || item?.sale_price || item?.app_sale_price || item?.target_original_price, 0);
  const pricing = calculateBuyliPricing(supplierCost);
  return {
    id: String(item?.product_id || item?.productId || item?.item_id || `aliexpress-${index + 1}`),
    title: item?.product_title || item?.title || item?.name || "AliExpress Product",
    price: pricing.price,
    supplierPrice: pricing.supplierPrice,
    buyliRetailPrice: pricing.buyliRetailPrice,
    buyliProfit: pricing.buyliProfit,
    buyliProfitPercent: pricing.buyliProfitPercent,
    pricingMethod: pricing.pricingMethod,
    image: getFirstImage(item),
    images: getImages(item),
    category: item?.first_level_category_name || item?.second_level_category_name || item?.category || "Products",
    description: item?.product_title || "AliExpress Affiliate product",
    source: "aliexpress",
    externalProductId: String(item?.product_id || item?.productId || item?.item_id || ""),
    affiliateUrl: item?.promotion_link || item?.product_detail_url || "",
    trackingId,
    sourceStatus: "live"
  };
}

const BLOCKED_PRODUCT_WORDS = [
  "weapon", "knife", "gun", "ammo", "tobacco", "vape", "cigarette",
  "drug", "medicine", "adult", "pistol", "rifle", "blade", "dagger",
  "steroid", "prescription", "nicotine", "thc", "cbd", "alcohol",
  "nike", "adidas", "gucci", "louis vuitton", "lv", "rolex", "apple",
  "airpods", "jordan", "yeezy", "balenciaga", "prada", "dior"
];

function productBlockReason(product) {
  const text = [product.title, product.description, product.category].join(" ").toLowerCase();
  if (!product.image) return "missing_image";
  if (!Number(product.price) || Number(product.price) <= 0) return "invalid_price";
  if (product.source === "aliexpress" && !product.affiliateUrl) return "missing_affiliate_url";
  const blockedWord = BLOCKED_PRODUCT_WORDS.find((word) => text.includes(word));
  if (blockedWord) return `blocked_word:${blockedWord}`;
  return "";
}

function filterCatalog(products) {
  const clean = [];
  const blocked = [];
  for (const product of products) {
    const reason = productBlockReason(product);
    if (reason) blocked.push({ id: product.id, title: product.title, source: product.source, reason });
    else clean.push(product);
  }
  lastBlockedProducts = blocked;
  return clean;
}

async function getCJAccessToken() {
  const manualToken = env("CJ_ACCESS_TOKEN", "CJ_API_TOKEN", "NEXT_PUBLIC_CJ_ACCESS_TOKEN");
  if (manualToken) return manualToken;

  const apiKey = env("CJ_API_KEY", "NEXT_PUBLIC_CJ_API_KEY");
  if (!apiKey) return "";

  const now = Date.now();
  if (cjTokenCache.accessToken && cjTokenCache.expiresAt > now + 60_000) {
    return cjTokenCache.accessToken;
  }

  const response = await fetch(`${CJ_BASE_URL}/authentication/getAccessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey })
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || data?.success === false || data?.result === false || !data?.data?.accessToken) {
    console.error("CJ getAccessToken failed", data);
    return "";
  }

  const expiryTime = data?.data?.accessTokenExpiryDate ? Date.parse(data.data.accessTokenExpiryDate) : 0;
  cjTokenCache = {
    accessToken: data.data.accessToken,
    refreshToken: data?.data?.refreshToken || "",
    expiresAt: Number.isFinite(expiryTime) && expiryTime > now ? expiryTime : now + 12 * 60 * 60 * 1000
  };

  return cjTokenCache.accessToken;
}

async function getProductsFromCJ(keyword = "watch") {
  const token = await getCJAccessToken();
  if (!token) return FALLBACK_PRODUCTS.filter((item) => item.source === "cj");

  const url = `${CJ_BASE_URL}/product/list`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "CJ-Access-Token": token },
    body: JSON.stringify({ pageNum: 1, pageSize: 40, productNameEn: keyword })
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || data?.success === false || data?.result === false) {
    console.error("CJ request failed", data);
    return FALLBACK_PRODUCTS.filter((item) => item.source === "cj");
  }

  const list = extractList(data);
  if (!Array.isArray(list) || list.length === 0) return FALLBACK_PRODUCTS.filter((item) => item.source === "cj");
  return list.map(mapCJProduct);
}

async function callAliExpressApi(keyword = "watch", signMode = "sha256", page = 1, pageSize = DEFAULT_PAGE_SIZE) {
  const appKey = env("ALIEXPRESS_APP_KEY");
  const appSecret = env("ALIEXPRESS_APP_SECRET");
  const trackingId = env("ALIEXPRESS_TRACKING_ID");
  const targetCurrency = env("ALIEXPRESS_TARGET_CURRENCY") || "ILS";
  const targetLanguage = env("ALIEXPRESS_TARGET_LANGUAGE") || "EN";
  const shipTo = env("ALIEXPRESS_SHIP_TO") || "IL";

  if (!appKey || !appSecret || !trackingId) {
    return { ok: false, ready: false, error: "Missing ALIEXPRESS_APP_KEY / ALIEXPRESS_APP_SECRET / ALIEXPRESS_TRACKING_ID" };
  }

  const params = {
    app_key: appKey,
    method: "aliexpress.affiliate.product.query",
    sign_method: signMode === "md5" ? "md5" : "sha256",
    timestamp: new Date().toISOString().slice(0, 19).replace("T", " "),
    format: "json",
    v: "2.0",
    keywords: keyword,
    tracking_id: trackingId,
    target_currency: targetCurrency,
    target_language: targetLanguage,
    ship_to_country: shipTo,
    page_no: String(requestedPage(page)),
    page_size: String(requestedPageSize(pageSize))
  };

  params.sign = signMode === "md5" ? signMd5(params, appSecret) : signSha256(params, appSecret);

  const url = `${ALIEXPRESS_API_URL}?${new URLSearchParams(params).toString()}`;
  const response = await fetch(url);
  const text = await response.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  return { ok: response.ok, status: response.status, data, signMode };
}

async function getProductsFromAliExpress(keyword = "watch", page = 1, pageSize = DEFAULT_PAGE_SIZE) {
  const appKey = env("ALIEXPRESS_APP_KEY");
  const appSecret = env("ALIEXPRESS_APP_SECRET");
  const trackingId = env("ALIEXPRESS_TRACKING_ID");

  if (!appKey || !appSecret || !trackingId) {
    return [];
  }

  const originalKeyword = keyword;
  const keywordPlan = expandedKeywordsForSearch(keyword);
  const targetCount = requestedPageSize(pageSize);
  const providerPageSize = Math.min(PROVIDER_SAFE_PAGE_SIZE, targetCount);

  const allProducts = [];
  const debugAttempts = [];
  const seen = new Set();

  // V9.2: deeper search. One user query can fan out to several accurate AliExpress
  // keywords and several provider pages, while still filtering wrong intent results.
  for (const currentKeyword of keywordPlan) {
    for (let pageOffset = 0; pageOffset < SEARCH_BATCH_PAGES; pageOffset++) {
      const providerPage = ((requestedPage(page) - 1) * SEARCH_BATCH_PAGES) + pageOffset + 1;
      const attempts = [await callAliExpressApi(currentKeyword, "sha256", providerPage, providerPageSize)];
      const firstList = extractList(attempts[0]?.data);
      if (!Array.isArray(firstList) || firstList.length === 0) {
        attempts.push(await callAliExpressApi(currentKeyword, "md5", providerPage, providerPageSize));
      }

      debugAttempts.push(...attempts);

      const successful = attempts.find((attempt) => {
        const list = extractList(attempt?.data);
        return Array.isArray(list) && list.length > 0;
      });

      if (!successful) continue;

      const list = extractList(successful.data);
      for (const rawItem of list) {
        const mapped = mapAliExpressProduct(rawItem, allProducts.length, trackingId);
        if (!productMatchesIntent(mapped, originalKeyword)) continue;
        const key = mapped.externalProductId || mapped.id || mapped.affiliateUrl;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        allProducts.push(mapped);
        if (allProducts.length >= targetCount) break;
      }

      if (allProducts.length >= targetCount) break;
    }
    if (allProducts.length >= targetCount) break;
  }

  if (allProducts.length) {
    return allProducts;
  }

  console.error("AliExpress live request returned no usable products", debugAttempts.map((a) => ({ signMode: a.signMode, status: a.status, ok: a.ok, responseKeys: Object.keys(a.data || {}) })));
  return [];
}

async function getProductsFromShein() {
  const feedUrl = env("SHEIN_FEED_URL");
  const affiliateId = env("SHEIN_AFFILIATE_ID");

  if (!feedUrl) {
    return [];
  }

  try {
    const response = await fetch(feedUrl);
    const data = await response.json();
    const list = extractList(data);
    if (!Array.isArray(list)) throw new Error("SHEIN feed did not return an array");
    return list.slice(0, 40).map((item, index) => {
      const supplierCost = toNumber(item.price || item.salePrice, 0);
      const pricing = calculateBuyliPricing(supplierCost);
      return {
        id: String(item.id || item.productId || `shein-${index + 1}`),
        title: item.title || item.name || "SHEIN Product",
        price: pricing.price,
        supplierPrice: pricing.supplierPrice,
        buyliRetailPrice: pricing.buyliRetailPrice,
        buyliProfit: pricing.buyliProfit,
        buyliProfitPercent: pricing.buyliProfitPercent,
        pricingMethod: pricing.pricingMethod,
        image: getFirstImage(item),
        images: getImages(item),
        category: item.category || "Fashion",
        description: item.description || "SHEIN feed product",
        source: "shein",
        affiliateUrl: item.affiliateUrl || affiliateId || "",
        sourceStatus: "live"
      };
    });
  } catch (error) {
    console.error("SHEIN feed failed", error);
    return FALLBACK_PRODUCTS.filter((item) => item.source === "shein");
  }
}

async function getProducts(keyword = "watch", source = "all", page = 1, pageSize = DEFAULT_PAGE_SIZE) {
  if (source === "cj") return getProductsFromCJ(keyword);
  if (source === "aliexpress") return getProductsFromAliExpress(keyword, page, pageSize);
  if (source === "shein") return getProductsFromShein(keyword);

  const [cj, aliexpress, shein] = await Promise.all([
    getProductsFromCJ(keyword),
    getProductsFromAliExpress(keyword, page, pageSize),
    getProductsFromShein(keyword)
  ]);
  return [...cj, ...aliexpress, ...shein];
}

function healthHandler(_req, res) {
  res.json({ ok: true, name: "Buyli backend proxy", providers: ["cj", "aliexpress", "shein"] });
}
app.get("/health", healthHandler);
app.get("/api/health", healthHandler);

app.get("/api/providers", (_req, res) => {
  res.redirect(307, "/providers");
});

app.get("/providers", (_req, res) => {
  res.json({
    providers: [
      { key: "cj", ready: Boolean(env("CJ_API_KEY", "CJ_ACCESS_TOKEN", "CJ_API_TOKEN")), mode: "api" },
      {
        key: "aliexpress",
        ready: Boolean(env("ALIEXPRESS_APP_KEY") && env("ALIEXPRESS_APP_SECRET") && env("ALIEXPRESS_TRACKING_ID")),
        mode: "affiliate_api",
        appKey: env("ALIEXPRESS_APP_KEY"),
        trackingId: env("ALIEXPRESS_TRACKING_ID"),
        status: env("ALIEXPRESS_APP_STATUS") || "Online",
        secretLoaded: Boolean(env("ALIEXPRESS_APP_SECRET"))
      },
      { key: "shein", ready: Boolean(env("SHEIN_FEED_URL") || env("SHEIN_AFFILIATE_ID")), mode: "feed_or_affiliate" }
    ]
  });
});

app.get("/api/aliexpress/status", (_req, res) => {
  res.redirect(307, "/aliexpress/status");
});

app.get("/aliexpress/status", (_req, res) => {
  res.json({
    ok: true,
    ready: Boolean(env("ALIEXPRESS_APP_KEY") && env("ALIEXPRESS_APP_SECRET") && env("ALIEXPRESS_TRACKING_ID")),
    appKey: env("ALIEXPRESS_APP_KEY"),
    trackingId: env("ALIEXPRESS_TRACKING_ID"),
    status: env("ALIEXPRESS_APP_STATUS") || "Online",
    shipTo: env("ALIEXPRESS_SHIP_TO") || "IL",
    secretLoaded: Boolean(env("ALIEXPRESS_APP_SECRET")),
    secretMask: mask(env("ALIEXPRESS_APP_SECRET"))
  });
});

app.get("/aliexpress/test", async (req, res) => {
  const keyword = String(req.query.keyword || "watch");
  const page = requestedPage(req.query.page);
  const pageSize = requestedPageSize(req.query.pageSize);
  try {
    const products = await getProductsFromAliExpress(keyword, page, pageSize);
    res.json({
      ok: true,
      ready: Boolean(env("ALIEXPRESS_APP_KEY") && env("ALIEXPRESS_APP_SECRET") && env("ALIEXPRESS_TRACKING_ID")),
      appKey: env("ALIEXPRESS_APP_KEY"),
      trackingId: env("ALIEXPRESS_TRACKING_ID"),
      status: env("ALIEXPRESS_APP_STATUS") || "Online",
      count: products.length,
      page,
      pageSize,
      hasMore: products.length >= Math.min(pageSize, MAX_BUYLI_PAGE_SIZE),
      nextPage: products.length >= Math.min(pageSize, MAX_BUYLI_PAGE_SIZE) ? page + 1 : null,
      searchDepth: "multi-keyword-multi-page",
      products,
      syncedAt: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" });
  }
});

async function productsHandler(req, res) {
  try {
    const keyword = String(req.query.keyword || "watch");
    const source = String(req.query.source || "aliexpress").toLowerCase();
    const page = requestedPage(req.query.page);
    const pageSize = requestedPageSize(req.query.pageSize);
    const rawProducts = await getProducts(keyword, source, page, pageSize);
    const products = filterCatalog(rawProducts);
    rememberProducts(source, keyword, page, products);
    res.json({
      products,
      count: products.length,
      source,
      page,
      pageSize,
      hasMore: products.length >= Math.min(pageSize, MAX_BUYLI_PAGE_SIZE),
      nextPage: products.length >= Math.min(pageSize, MAX_BUYLI_PAGE_SIZE) ? page + 1 : null,
      searchDepth: "multi-keyword-multi-page",
      unlimitedMode: BUYLI_UNLIMITED_MODE,
      cachedCatalogCount: lastCatalog.length,
      blockedCount: lastBlockedProducts.length,
      syncedAt: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error", products: [] });
  }
}
app.get("/products", productsHandler);
app.get("/api/products", productsHandler);

app.post("/sync-products", async (req, res) => {
  try {
    const keyword = String(req.body?.keyword || "watch");
    const source = String(req.body?.source || "aliexpress").toLowerCase();
    const page = requestedPage(req.body?.page);
    const pageSize = requestedPageSize(req.body?.pageSize);
    const rawProducts = await getProducts(keyword, source, page, pageSize);
    const products = filterCatalog(rawProducts);
    rememberProducts(source, keyword, page, products);
    syncJobs.unshift({ id: `SYNC-${Date.now()}`, keyword, source, page, pageSize, count: products.length, createdAt: new Date().toISOString() });
    res.json({ products, count: products.length, source, page, pageSize, hasMore: products.length >= Math.min(pageSize, MAX_BUYLI_PAGE_SIZE), nextPage: products.length >= Math.min(pageSize, MAX_BUYLI_PAGE_SIZE) ? page + 1 : null, unlimitedMode: BUYLI_UNLIMITED_MODE, searchDepth: "multi-keyword-multi-page", blockedCount: lastBlockedProducts.length, syncedAt: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error", products: [] });
  }
});


app.post("/admin/orders", (req, res) => {
  const order = req.body || {};
  if (!order.id) return res.status(400).json({ ok: false, error: "Missing order id" });
  orderEvents = [order, ...orderEvents.filter((item) => item.id !== order.id)].slice(0, 1000);
  res.json({ ok: true, stored: true, count: orderEvents.length });
});

app.get("/api/admin/orders", (_req, res) => {
  res.redirect(307, "/admin/orders");
});

app.get("/admin/orders", (_req, res) => {
  res.json({ ok: true, orders: orderEvents, metrics: summarizeOrders(orderEvents), updatedAt: new Date().toISOString() });
});

app.get("/api/admin/metrics", (_req, res) => {
  res.redirect(307, "/admin/metrics");
});

app.get("/admin/metrics", (_req, res) => {
  const bySource = lastCatalog.reduce((acc, item) => {
    acc[item.source || "unknown"] = (acc[item.source || "unknown"] || 0) + 1;
    return acc;
  }, {});

  const supplierValue = lastCatalog.reduce((sum, item) => sum + toNumber(item.supplierPrice || item.price, 0), 0);

  res.json({
    ok: true,
    productsLoaded: lastCatalog.length,
    unlimitedMode: BUYLI_UNLIMITED_MODE,
    cachedPages: catalogCache.size,
    syncJobs: syncJobs.slice(0, 10),
    actualSales: summarizeOrders(orderEvents),
    recentOrders: orderEvents.slice(0, 20),
    blockedProducts: lastBlockedProducts.length,
    blockedPreview: lastBlockedProducts.slice(0, 20),
    bySource,
    supplierValue: Number(supplierValue.toFixed(2)),
    providers: {
      aliexpress: {
        ready: Boolean(env("ALIEXPRESS_APP_KEY") && env("ALIEXPRESS_APP_SECRET") && env("ALIEXPRESS_TRACKING_ID")),
        appKey: env("ALIEXPRESS_APP_KEY"),
        trackingId: env("ALIEXPRESS_TRACKING_ID"),
        status: env("ALIEXPRESS_APP_STATUS") || "Online",
        secretLoaded: Boolean(env("ALIEXPRESS_APP_SECRET"))
      },
      cj: { ready: Boolean(env("CJ_API_KEY", "CJ_ACCESS_TOKEN", "CJ_API_TOKEN")) },
      shein: { ready: Boolean(env("SHEIN_FEED_URL") || env("SHEIN_AFFILIATE_ID")) }
    },
    updatedAt: new Date().toISOString()
  });
});



app.get("/admin", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Buyli Admin Dashboard</title>
  <style>
    body{margin:0;background:#0d0d0d;color:#f6f1df;font-family:Arial,Helvetica,sans-serif;direction:rtl}
    header{padding:24px 32px;background:#151515;border-bottom:1px solid #3d3212;display:flex;justify-content:space-between;align-items:center}
    h1{margin:0;color:#d6b83f;font-size:28px}.sub{color:#bbb;margin-top:6px}.grid{display:grid;grid-template-columns:repeat(4,minmax(160px,1fr));gap:16px;padding:24px 32px}.card{background:#171717;border:1px solid #3d3212;border-radius:18px;padding:20px;box-shadow:0 10px 30px rgba(0,0,0,.25)}
    .label{color:#aaa;font-size:14px}.value{font-size:28px;font-weight:800;color:#d6b83f;margin-top:8px}.section{padding:0 32px 24px}.row{display:flex;gap:16px;flex-wrap:wrap}.btn{background:#d6b83f;color:#111;border:0;border-radius:12px;padding:12px 18px;font-weight:800;cursor:pointer}.btn.dark{background:#222;color:#f6f1df;border:1px solid #3d3212}
    table{width:100%;border-collapse:collapse;background:#171717;border-radius:18px;overflow:hidden;border:1px solid #3d3212}th,td{padding:14px;border-bottom:1px solid #272727;text-align:right;font-size:14px}th{color:#d6b83f;background:#111}.ok{color:#6ee7a7}.bad{color:#ff7b7b}.muted{color:#aaa}pre{white-space:pre-wrap;direction:ltr;text-align:left;background:#111;padding:16px;border-radius:12px;overflow:auto;max-height:260px}
  </style>
</head>
<body>
  <header><div><h1>Buyli Admin Dashboard</h1><div class="sub">נתוני מכירות בפועל, הזמנות, רווחים וחיבורי ספקים</div></div><button class="btn" onclick="loadAll()">רענון</button></header>
  <div class="grid">
    <div class="card"><div class="label">מכירות בפועל</div><div id="sales" class="value">₪0</div></div>
    <div class="card"><div class="label">עלות ספקים בפועל</div><div id="cost" class="value">₪0</div></div>
    <div class="card"><div class="label">רווח גולמי בפועל</div><div id="profit" class="value">₪0</div></div>
    <div class="card"><div class="label">מספר הזמנות</div><div id="ordersCount" class="value">0</div></div>
  </div>
  <div class="section"><div class="row">
    <button class="btn dark" onclick="testProducts('dress')">בדוק שמלות</button>
    <button class="btn dark" onclick="testProducts('watch')">בדוק שעונים</button>
    <button class="btn dark" onclick="testProducts('bag')">בדוק תיקים</button>
    <button class="btn dark" onclick="testProducts('kitchen')">בדוק מטבח</button>
  </div></div>
  <div class="section"><h2>מצב מערכת</h2><div class="card"><div id="status">טוען...</div></div></div>
  <div class="section"><h2>הזמנות אחרונות</h2><table><thead><tr><th>מספר</th><th>לקוח</th><th>שולם</th><th>עלות ספק</th><th>רווח</th><th>סטטוס</th></tr></thead><tbody id="orders"><tr><td colspan="6" class="muted">אין הזמנות עדיין</td></tr></tbody></table></div>
  <div class="section"><h2>בדיקת מוצרים</h2><pre id="products">לחץ על בדיקת קטגוריה כדי לראות מוצרים חיים.</pre></div>
<script>
const money = function(n){ return '₪' + Number(n || 0).toFixed(2); };
async function loadAll(){
  const r=await fetch('/admin/metrics'); const d=await r.json();
  const s=d.actualSales||{};
  document.getElementById('sales').textContent=money(s.totalPaid||s.totalSales||0);
  document.getElementById('cost').textContent=money(s.totalSupplierCost||0);
  document.getElementById('profit').textContent=money(s.totalProfit||s.grossProfit||0);
  document.getElementById('ordersCount').textContent=s.orderCount||d.recentOrders?.length||0;
  const ali=d.providers?.aliexpress||{};
  document.getElementById('status').innerHTML = 'AliExpress: <b class="' + (ali.ready ? 'ok' : 'bad') + '">' + (ali.ready ? 'מחובר' : 'לא מחובר') + '</b> | App Status: ' + (ali.status || '') + ' | Tracking ID: ' + (ali.trackingId || '') + ' | מוצרים ב-cache: ' + (d.productsLoaded || 0) + ' | מוצרים חסומים: ' + (d.blockedProducts || 0);
  const rows = (d.recentOrders || []).map(function(o){ return '<tr><td>' + (o.id || '') + '</td><td>' + (o.customerName || (o.customer && o.customer.name) || '') + '</td><td>' + money(o.customerPaid || o.total || 0) + '</td><td>' + money(o.supplierCost || 0) + '</td><td>' + money(o.buyliProfit || 0) + '</td><td>' + (o.orderStatus || o.status || '') + '</td></tr>'; }).join('');
  document.getElementById('orders').innerHTML=rows||'<tr><td colspan="6" class="muted">אין הזמנות עדיין</td></tr>';
}
async function testProducts(k){
  document.getElementById('products').textContent='טוען מוצרים...';
  const r=await fetch('/products?source=aliexpress&keyword='+encodeURIComponent(k)+'&pageSize=20');
  const d=await r.json();
  document.getElementById('products').textContent=JSON.stringify({count:d.count, products:(d.products||[]).slice(0,5)},null,2);
  loadAll();
}
loadAll();
</script>
</body></html>`);
});

app.listen(PORT, () => {
  console.log(`Buyli backend proxy running on port ${PORT}`);
  console.log(`AliExpress ready: ${Boolean(env("ALIEXPRESS_APP_KEY") && env("ALIEXPRESS_APP_SECRET") && env("ALIEXPRESS_TRACKING_ID"))}`);
});

export { getCJAccessToken, getProductsFromCJ, getProductsFromAliExpress, getProductsFromShein, getProducts, callAliExpressApi };
