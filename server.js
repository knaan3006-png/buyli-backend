import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;
const CJ_BASE_URL = "https://developers.cjdropshipping.com/api2.0/v1";

let cachedAccessToken = null;
let cachedAccessTokenTime = 0;
let cachedProducts = null;
let cachedProductsTime = 0;

const CACHE_TIME_MS = 1000 * 60 * 15;

const BLOCKED_WORDS = [
  "axe",
  "knife",
  "self-defense",
  "weapon",
  "tactical",
  "gun",
  "blade",
  "pepper",
  "sword",
  "crossbow",
  "machete",
  "dagger",
  "ammo",
  "bullet",
  "rifle",
  "pistol",
  "airsoft",
  "vape",
  "nicotine",
  "cigarette",
  "cbd",
  "thc",
  "drug",
  "adult",
  "sex toy"
];

const CATEGORY_HE = {
  "Men's Jackets": "ז׳קטים לגברים",
  Boxers: "בוקסרים",
  "Suits & Sets": "חליפות וסטים",
  "Lady Dresses": "שמלות נשים",
  "Camping & Hiking": "קמפינג וטיולים",
  "Women's Short-sleeved Shirt": "חולצות נשים",
  "Blouses & Shirts": "חולצות",
  Wallets: "ארנקים",
  "Bracelets & Bangles": "צמידים",
  Rompers: "אוברולים",
  "Necklace & Pendants": "שרשראות",
  "Wide Leg Pants": "מכנסיים רחבים",
  "Men's Suits": "חליפות גברים",
  Women: "נשים",
  Men: "גברים",
  "Men's Underwear": "הלבשה תחתונה לגברים",
  "Women's Clothing": "בגדי נשים",
  "Men's Clothing": "בגדי גברים",
  "Home & Garden": "בית וגינה",
  Jewelry: "תכשיטים",
  Watches: "שעונים",
  "Consumer Electronics": "אלקטרוניקה",
  "Health & Beauty": "יופי וטיפוח",
  Shoes: "נעליים",
  Bags: "תיקים",
  "Sports & Outdoors": "ספורט וטיולים",
  "Home Office Storage": "אחסון לבית ולמשרד",
  Drinkware: "כלי שתייה",
  "Home Textile": "טקסטיל לבית",
  "Winter Accessories": "אביזרי חורף",
  Sweaters: "סוודרים",
  "Casual Pants": "מכנסיים",
  Blazers: "בלייזרים",
  Dresses: "שמלות",
  "T-Shirts": "חולצות",
  Earrings: "עגילים",
  "Silver Jewelry": "תכשיטי כסף",
  "Storage Bags & Cases": "תיקי אחסון",
  "Men Sweaters": "סוודרים לגברים",
  "Men Jackets": "ז׳קטים לגברים",
  "Women's Short Sleeved Shirts": "חולצות נשים",
  "Wall-mounted Storage": "אחסון לקיר"
};

function cleanText(value) {
  if (!value) return "";

  return String(value)
    .replace(/<script[^>]*>.*?<\/script>/gis, " ")
    .replace(/<style[^>]*>.*?<\/style>/gis, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function numberValue(value) {
  if (value === null || value === undefined) return 0;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const cleaned = value
      .replace("$", "")
      .replace("USD", "")
      .replace(",", "")
      .trim();

    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }

  return 0;
}

function categoryName(category) {
  return CATEGORY_HE[category] || category || "מוצרים";
}

function addImage(list, value) {
  if (!value) return;

  if (typeof value === "string") {
    const matches = value.match(/https?:\/\/[^\s"'<>\\]+/g) || [];

    for (const url of matches) {
      const cleanUrl = url.trim();

      if (!cleanUrl.startsWith("http")) continue;
      if (cleanUrl.includes("avatar")) continue;
      if (cleanUrl.includes("profile")) continue;
      if (cleanUrl.includes("user")) continue;
      if (cleanUrl.includes("facebook")) continue;
      if (cleanUrl.includes("instagram")) continue;

      list.push(cleanUrl);
    }

    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) addImage(list, item);
    return;
  }

  if (typeof value === "object") {
    for (const key of Object.keys(value)) {
      const lower = key.toLowerCase();

      if (
        lower.includes("image") ||
        lower.includes("img") ||
        lower.includes("photo") ||
        lower.includes("pic") ||
        lower.includes("url") ||
        lower.includes("src")
      ) {
        addImage(list, value[key]);
      }
    }
  }
}

function extractImages(product) {
  const results = [];

  addImage(results, product.image);
  addImage(results, product.productImage);
  addImage(results, product.bigImage);
  addImage(results, product.imageUrl);
  addImage(results, product.mainImage);
  addImage(results, product.productImageSet);
  addImage(results, product.productImages);
  addImage(results, product.images);
  addImage(results, product.variantImages);
  addImage(results, product.description);
  addImage(results, product.productDescription);

  const rawText = JSON.stringify(product);
  addImage(results, rawText);

  const unique = [];

  for (const img of results) {
    const cleanUrl = img
      .replace(/\\u002F/g, "/")
      .replace(/\\/g, "")
      .replace(/,$/, "")
      .trim();

    if (!cleanUrl.startsWith("http")) continue;
    if (cleanUrl.includes(" ")) continue;
    if (cleanUrl.length < 20) continue;

    const looksLikeImage =
      cleanUrl.includes(".jpg") ||
      cleanUrl.includes(".jpeg") ||
      cleanUrl.includes(".png") ||
      cleanUrl.includes(".webp") ||
      cleanUrl.includes("cjdropshipping.com") ||
      cleanUrl.includes("oss-cf.cjdropshipping.com") ||
      cleanUrl.includes("cf.cjdropshipping.com");

    if (!looksLikeImage) continue;

    if (!unique.includes(cleanUrl)) unique.push(cleanUrl);
  }

  return unique.slice(0, 8);
}

function findPrice(product) {
  const directFields = [
    product.sellPrice,
    product.price,
    product.productPrice,
    product.variantSellPrice,
    product.supplierPrice,
    product.productSellPrice,
    product.listPrice,
    product.nowPrice,
    product.originalPrice,
    product.lowestSellPrice,
    product.highestSellPrice,
    product.minPrice,
    product.maxPrice,
    product.startingPrice
  ];

  for (const value of directFields) {
    const price = numberValue(value);
    if (price > 0 && price < 500) return price;
  }

  const candidates = [];

  function scan(obj) {
    if (!obj || typeof obj !== "object") return;

    if (Array.isArray(obj)) {
      for (const item of obj) scan(item);
      return;
    }

    for (const [key, value] of Object.entries(obj)) {
      const lower = key.toLowerCase();

      if (
        lower.includes("price") ||
        lower.includes("sell") ||
        lower.includes("cost")
      ) {
        const n = numberValue(value);
        if (n > 0 && n < 500) candidates.push(n);
      }

      if (typeof value === "object") scan(value);
    }
  }

  scan(product);

  if (!candidates.length) return 0;

  candidates.sort((a, b) => a - b);
  return candidates[0];
}

function isBlocked(product) {
  const text = [
    product.name,
    product.nameOriginal,
    product.productName,
    product.category,
    product.categoryName,
    product.description,
    product.productDescription
  ]
    .join(" ")
    .toLowerCase();

  return BLOCKED_WORDS.some((word) => text.includes(word));
}

function smartHebrewName(originalName, category) {
  const name = String(originalName || "").toLowerCase();
  const cat = String(category || "").toLowerCase();

  if (name.includes("dress") || cat.includes("dress")) return "שמלת נשים אלגנטית";
  if (name.includes("jacket") || cat.includes("jacket")) return "ז׳קט אופנתי";
  if (name.includes("shirt") || name.includes("blouse") || cat.includes("shirt")) return "חולצה אופנתית";
  if (name.includes("t-shirt") || name.includes("tee")) return "טי־שירט אופנתית";
  if (name.includes("pants") || name.includes("trousers")) return "מכנסיים אופנתיים";
  if (name.includes("suit") || cat.includes("suit")) return "סט לבוש אלגנטי";
  if (name.includes("boxer") || cat.includes("boxer")) return "בוקסר איכותי לגברים";
  if (name.includes("wallet") || cat.includes("wallet")) return "ארנק אלגנטי";
  if (name.includes("bracelet") || cat.includes("bracelet")) return "צמיד מעוצב";
  if (name.includes("necklace") || name.includes("pendant")) return "שרשרת מעוצבת";
  if (name.includes("earring")) return "עגילים מעוצבים";
  if (name.includes("bag") || name.includes("backpack")) return "תיק אופנתי";
  if (name.includes("shoe") || name.includes("sneaker") || cat.includes("shoe")) return "נעליים אופנתיות";
  if (name.includes("watch")) return "שעון אלגנטי";
  if (name.includes("cup") || name.includes("mug")) return "כוס מעוצבת";
  if (name.includes("storage") || cat.includes("storage")) return "פתרון אחסון לבית";
  if (name.includes("blanket")) return "שמיכה נעימה לבית";
  if (name.includes("camping") || name.includes("hiking")) return "מוצר לטיולים וקמפינג";
  if (cat.includes("jewelry")) return "תכשיט מעוצב";
  if (cat.includes("electronics")) return "גאדג׳ט שימושי";
  if (cat.includes("beauty")) return "מוצר טיפוח ויופי";

  return categoryName(category);
}

function smartHebrewDescription(originalName, category) {
  const catHe = categoryName(category);
  const productHe = smartHebrewName(originalName, category);

  return `${productHe} מקטגוריית ${catHe}. מוצר שנבחר ל־Buyli לאחר סינון איכות, תמונות ומחיר. המחיר באפליקציה כולל רווח שלך ולא מציג את מחיר הספק.`;
}

async function translateWithAI(product) {
  const apiKey = process.env.OPENAI_API_KEY;
  const aiEnabled = process.env.ENABLE_AI_TRANSLATION === "true";

  if (!apiKey || !aiEnabled) {
    return {
      nameHe: smartHebrewName(product.nameOriginal, product.category),
      descriptionHe: smartHebrewDescription(product.nameOriginal, product.category),
      categoryHe: categoryName(product.category),
      translationMode: "smart-local"
    };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Translate ecommerce products to Hebrew. Return valid JSON only with nameHe, descriptionHe, categoryHe. Keep nameHe short and accurate."
          },
          {
            role: "user",
            content: JSON.stringify({
              nameOriginal: product.nameOriginal,
              category: product.category,
              description: product.description
            })
          }
        ],
        temperature: 0.2
      })
    });

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content || "";
    const jsonText = text.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(jsonText);

    return {
      nameHe: parsed.nameHe || smartHebrewName(product.nameOriginal, product.category),
      descriptionHe:
        parsed.descriptionHe || smartHebrewDescription(product.nameOriginal, product.category),
      categoryHe: parsed.categoryHe || categoryName(product.category),
      translationMode: "ai"
    };
  } catch (error) {
    return {
      nameHe: smartHebrewName(product.nameOriginal, product.category),
      descriptionHe: smartHebrewDescription(product.nameOriginal, product.category),
      categoryHe: categoryName(product.category),
      translationMode: "smart-local"
    };
  }
}

function roundPrice(price) {
  if (!price || price <= 0) return 0;
  const rounded = Math.ceil(price) - 0.1;
  return Number(Math.max(rounded, 4.9).toFixed(2));
}

function calculatePrice(supplierPrice) {
  const cost = numberValue(supplierPrice);

  if (!cost || cost <= 0) {
    return {
      supplierPrice: 0,
      salePrice: 0,
      estimatedProfit: 0,
      marginPercent: 0
    };
  }

  let multiplier = 1.55;

  if (cost <= 5) multiplier = 2.6;
  else if (cost <= 15) multiplier = 2.1;
  else if (cost <= 40) multiplier = 1.75;

  const estimatedShipping = cost < 12 ? 3.5 : cost < 35 ? 5.5 : 8;
  const paymentFeePercent = 0.035;
  const safetyBuffer = 1.5;

  const rawSalePrice =
    (cost + estimatedShipping + safetyBuffer) * multiplier * (1 + paymentFeePercent);

  const salePrice = roundPrice(rawSalePrice);
  const estimatedProfit = Number(
    (salePrice - cost - estimatedShipping - safetyBuffer).toFixed(2)
  );

  const marginPercent =
    salePrice > 0 ? Number(((estimatedProfit / salePrice) * 100).toFixed(1)) : 0;

  return {
    supplierPrice: Number(cost.toFixed(2)),
    salePrice,
    estimatedProfit,
    marginPercent
  };
}

function calculateBuyliScore(product) {
  let score = 50;

  if (product.images?.length >= 4) score += 15;
  else if (product.images?.length >= 2) score += 8;

  if (product.estimatedProfit >= 8) score += 15;
  else if (product.estimatedProfit >= 4) score += 8;

  if (product.salePrice >= 9 && product.salePrice <= 60) score += 10;
  if (product.nameHe && product.nameHe.length <= 35) score += 5;
  if (product.descriptionHe && product.descriptionHe.length > 40) score += 5;
  if (product.source === "cj") score += 5;

  if (product.salePrice > 120) score -= 10;
  if (product.images?.length <= 1) score -= 8;
  if (product.estimatedProfit <= 2) score -= 15;

  return Math.max(0, Math.min(100, Math.round(score)));
}

async function getCJAccessToken() {
  const now = Date.now();

  if (cachedAccessToken && now - cachedAccessTokenTime < 1000 * 60 * 60 * 20) {
    return cachedAccessToken;
  }

  const cjApiKey = process.env.CJ_API_KEY;
  const cjAccessToken = process.env.CJ_ACCESS_TOKEN;

  if (cjAccessToken) {
    cachedAccessToken = cjAccessToken;
    cachedAccessTokenTime = now;
    return cachedAccessToken;
  }

  if (!cjApiKey) return null;

  try {
    const response = await fetch(`${CJ_BASE_URL}/authentication/getAccessToken`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CJ-Access-Token": cjApiKey
      }
    });

    const data = await response.json();

    const token =
      data?.data?.accessToken ||
      data?.data?.token ||
      data?.accessToken ||
      data?.token ||
      null;

    if (token) {
      cachedAccessToken = token;
      cachedAccessTokenTime = now;
      return token;
    }

    cachedAccessToken = cjApiKey;
    cachedAccessTokenTime = now;
    return cachedAccessToken;
  } catch (error) {
    cachedAccessToken = cjApiKey;
    cachedAccessTokenTime = now;
    return cachedAccessToken;
  }
}

function parseCJList(data) {
  const candidates = [
    data?.data?.list,
    data?.data?.content,
    data?.data?.products,
    data?.data,
    data?.result?.list,
    data?.result,
    data?.products,
    data?.product
  ];

  for (const item of candidates) {
    if (Array.isArray(item)) return item;
  }

  return [];
}

async function fetchCJListByPath(token, path) {
  const url = `${CJ_BASE_URL}${path}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "CJ-Access-Token": token
    }
  });

  const data = await response.json();

  return {
    url,
    status: response.status,
    data,
    list: parseCJList(data)
  };
}

async function getProductsFromCJ() {
  const token = await getCJAccessToken();

  if (!token) {
    return {
      products: [],
      debug: {
        source: "cj",
        ok: false,
        reason: "Missing CJ token",
        hasCJ_API_KEY: Boolean(process.env.CJ_API_KEY),
        hasCJ_ACCESS_TOKEN: Boolean(process.env.CJ_ACCESS_TOKEN)
      }
    };
  }

  const attempts = [
    "/product/list?pageNum=1&pageSize=100",
    "/product/list?pageNum=1&pageSize=50",
    "/product/list?page=1&pageSize=100",
    "/product/list?current=1&size=100"
  ];

  const attemptResults = [];
  let selectedList = [];

  for (const path of attempts) {
    try {
      const result = await fetchCJListByPath(token, path);

      attemptResults.push({
        url: result.url,
        status: result.status,
        rawCode: result.data?.code,
        rawMessage: result.data?.message || result.data?.msg,
        listCount: result.list.length,
        dataKeys: result.data ? Object.keys(result.data) : []
      });

      if (result.list.length) {
        selectedList = result.list;
        break;
      }
    } catch (error) {
      attemptResults.push({
        path,
        error: error.message
      });
    }
  }

  const products = selectedList.map((item, index) => {
    const name =
      item.productName ||
      item.name ||
      item.productTitle ||
      item.title ||
      `CJ Product ${index + 1}`;

    const category =
      item.categoryName ||
      item.category ||
      item.productCategoryName ||
      item.categoryFirstName ||
      "מוצרים";

    const price = findPrice(item);

    const image =
      item.image ||
      item.productImage ||
      item.bigImage ||
      item.imageUrl ||
      item.mainImage ||
      "";

    const description = item.description || item.productDescription || "";

    const images = extractImages({
      ...item,
      image,
      description
    });

    return {
      id: String(item.pid || item.id || item.productId || `cj-${index}`),
      source: "cj",
      name,
      nameOriginal: name,
      price,
      category,
      description,
      image: images[0] || image,
      images,
      raw: item
    };
  });

  return {
    products,
    debug: {
      source: "cj",
      ok: true,
      attempts: attemptResults,
      rawCount: selectedList.length,
      mappedCount: products.length,
      tokenStart: String(token).slice(0, 8)
    }
  };
}

async function getProductsFromAliExpress() {
  return {
    products: [],
    debug: {
      source: "aliexpress",
      ok: true,
      ready: true,
      message: "AliExpress connector placeholder ready"
    }
  };
}

async function getProductsFromShein() {
  return {
    products: [],
    debug: {
      source: "shein",
      ok: true,
      ready: true,
      message: "SHEIN connector placeholder ready"
    }
  };
}

async function buildProductEngine() {
  const now = Date.now();

  if (cachedProducts && now - cachedProductsTime < CACHE_TIME_MS) {
    return {
      products: cachedProducts,
      debug: {
        cache: true,
        cachedCount: cachedProducts.length
      }
    };
  }

  const cj = await getProductsFromCJ();
  const ali = await getProductsFromAliExpress();
  const shein = await getProductsFromShein();

  const combined = [...cj.products, ...ali.products, ...shein.products];

  const debug = {
    cache: false,
    cj: cj.debug,
    aliexpress: ali.debug,
    shein: shein.debug,
    combinedCount: combined.length,
    rejected: {
      blocked: 0,
      noPrice: 0,
      noImage: 0,
      noProfit: 0
    }
  };

  const clean = combined.filter((product) => {
    if (isBlocked(product)) {
      debug.rejected.blocked++;
      return false;
    }

    const price = numberValue(product.price);
    const images = product.images?.length ? product.images : extractImages(product);

    if (!price || price <= 0) {
      debug.rejected.noPrice++;
      return false;
    }

    if (!images.length && !product.image) {
      debug.rejected.noImage++;
      return false;
    }

    return true;
  });

  debug.cleanCount = clean.length;

  const finalProducts = [];

  for (let index = 0; index < clean.length; index++) {
    const product = clean[index];

    const images = product.images?.length ? product.images : extractImages(product);
    const image = images[0] || product.image;

    const pricing = calculatePrice(product.price);

    if (!pricing.salePrice || pricing.estimatedProfit <= 0) {
      debug.rejected.noProfit++;
      continue;
    }

    const baseProduct = {
      id: product.id,
      source: product.source || "unknown",
      nameOriginal: product.nameOriginal || product.name,
      category: product.category || "מוצרים",
      description: cleanText(product.description),
      image,
      images: images.length ? images : [image],
      supplierPrice: pricing.supplierPrice,
      salePrice: pricing.salePrice,
      estimatedProfit: pricing.estimatedProfit,
      marginPercent: pricing.marginPercent
    };

    const translation = await translateWithAI(baseProduct);

    const readyProduct = {
      ...baseProduct,
      name: translation.nameHe,
      nameHe: translation.nameHe,
      descriptionHe: translation.descriptionHe,
      categoryHe: translation.categoryHe,
      translationMode: translation.translationMode,
      price: pricing.salePrice,
      oldPrice: roundPrice(pricing.salePrice * 1.28),
      isNew: index < 10,
      isSale: index % 3 === 0
    };

    readyProduct.buyliScore = calculateBuyliScore(readyProduct);

    finalProducts.push(readyProduct);
  }

  finalProducts.sort((a, b) => b.buyliScore - a.buyliScore);

  debug.finalCount = finalProducts.length;

  cachedProducts = finalProducts;
  cachedProductsTime = now;

  return {
    products: finalProducts,
    debug
  };
}

app.get("/", (req, res) => {
  res.json({
    success: true,
    app: "Buyli Backend",
    version: "V8 Product Engine Clean Debug",
    endpoints: ["/api/products", "/api/health", "/api/debug/cj"]
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    version: "V8-clean-debug",
    cjConfigured: Boolean(process.env.CJ_API_KEY || process.env.CJ_ACCESS_TOKEN),
    aiConfigured: Boolean(process.env.OPENAI_API_KEY),
    aiEnabled: process.env.ENABLE_AI_TRANSLATION === "true",
    cacheProducts: Boolean(cachedProducts),
    cachedProductsCount: cachedProducts?.length || 0,
    time: new Date().toISOString()
  });
});

app.get("/api/debug/cj", async (req, res) => {
  try {
    cachedAccessToken = null;
    cachedAccessTokenTime = 0;

    const token = await getCJAccessToken();

    if (!token) {
      return res.json({
        success: false,
        message: "No CJ token",
        hasCJ_API_KEY: Boolean(process.env.CJ_API_KEY),
        hasCJ_ACCESS_TOKEN: Boolean(process.env.CJ_ACCESS_TOKEN)
      });
    }

    const attempts = [
      "/product/list?pageNum=1&pageSize=100",
      "/product/list?pageNum=1&pageSize=50",
      "/product/list?page=1&pageSize=100",
      "/product/list?current=1&size=100"
    ];

    const results = [];

    for (const path of attempts) {
      try {
        const result = await fetchCJListByPath(token, path);

        results.push({
          url: result.url,
          status: result.status,
          code: result.data?.code,
          message: result.data?.message || result.data?.msg,
          dataKeys: result.data ? Object.keys(result.data) : [],
          listCount: result.list.length,
          sample: result.list?.[0] || null,
          raw: result.data
        });
      } catch (error) {
        results.push({
          path,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      hasToken: Boolean(token),
      tokenStart: String(token).slice(0, 8),
      hasCJ_API_KEY: Boolean(process.env.CJ_API_KEY),
      hasCJ_ACCESS_TOKEN: Boolean(process.env.CJ_ACCESS_TOKEN),
      attempts: results
    });
  } catch (error) {
    res.json({
      success: false,
      error: error.message
    });
  }
});

app.get("/api/products", async (req, res) => {
  try {
    const force = req.query.force === "true";

    if (force) {
      cachedProducts = null;
      cachedProductsTime = 0;
    }

    const result = await buildProductEngine();
    const products = result.products;

    if (!products.length) {
      return res.status(200).json({
        success: false,
        source: "buyli-v8-clean-debug",
        count: 0,
        products: [],
        product: [],
        message: "No valid CJ products found after filtering",
        debug: result.debug,
        engine: {
          pricing: true,
          filtering: true,
          gallery: true,
          buyliScore: true,
          aiTranslation: process.env.ENABLE_AI_TRANSLATION === "true",
          aliExpressReady: true,
          sheinReady: true,
          fallbackProducts: false
        }
      });
    }

    res.json({
      success: true,
      source: "buyli-v8-clean-debug",
      count: products.length,
      products,
      product: products,
      engine: {
        pricing: true,
        filtering: true,
        gallery: true,
        buyliScore: true,
        aiTranslation: process.env.ENABLE_AI_TRANSLATION === "true",
        aliExpressReady: true,
        sheinReady: true,
        fallbackProducts: false
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      source: "buyli-v8-clean-debug",
      count: 0,
      products: [],
      product: [],
      message: "Buyli Product Engine failed",
      error: error.message,
      fallbackProducts: false
    });
  }
});

app.listen(PORT, () => {
  console.log(`Buyli V8 clean debug backend running on port ${PORT}`);
});
