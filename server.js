import express from "express";
import cors from "cors";
import admin from "firebase-admin";

const app = express();
app.use(cors());
app.use(express.json());

const CJ_API_KEY = process.env.CJ_API_KEY;

if (!CJ_API_KEY) {
  console.warn("CJ_API_KEY is missing. Set it as an environment variable.");
}

try {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
} catch (error) {
  console.warn("Firebase Admin not initialized. Firestore cache will be skipped.", error?.message);
}

function priceToIls(value) {
  const numberValue = Number(value || 0);
  if (!Number.isFinite(numberValue) || numberValue <= 0) return 99;
  return Math.round(numberValue * 3.7);
}

function normalizeCJItem(item, index = 0) {
  const rawPrice = item.sellPrice || item.price || item.productSellPrice || item.variantSellPrice;
  const price = priceToIls(rawPrice);
  const id = item.pid || item.productId || item.id || `cj-${Date.now()}-${index}`;
  const title = item.productNameEn || item.productName || item.title || "CJ Product";
  const category = item.categoryName || item.category || item.productType || "CJ";

  return {
    id: `cj-${id}`,
    name: title,
    nameEn: title,
    nameAr: title,
    price: `₪${price}`,
    originalPrice: `₪${Math.round(price * 1.55)}`,
    image:
      item.productImage ||
      item.productImageSet?.[0] ||
      item.image ||
      item.mainImage ||
      "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=900",
    description: `מוצר אמיתי מסונכרן מ-CJdropshipping. קטגוריה: ${category}.`,
    descriptionEn: `Real synced product from CJdropshipping. Category: ${category}.`,
    descriptionAr: `منتج حقيقي متزامن من CJdropshipping. الفئة: ${category}.`,
    category,
    categoryEn: category,
    categoryAr: category,
    rating: 4.6,
    orders: Math.max(50, Number(item.variantsNum || item.stock || item.inventory || 100)),
    badge: "CJ Live",
    supplier: "CJdropshipping",
    shipping: "CJ משלוח 7–18 ימים",
    supplierProductId: id,
    supplierRaw: item,
    searchTags: [
      title,
      category,
      "cj",
      "cjdropshipping",
      "live product",
      "supplier",
      "מוצר אמיתי",
      "ספק",
      "منتج حقيقي",
      "مورد",
    ],
  };
}

async function fetchCJProducts(keyword = "watch") {
  const response = await fetch("https://developers.cjdropshipping.com/api2.0/v1/product/list", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "CJ-Access-Token": CJ_API_KEY,
    },
    body: JSON.stringify({
      pageNum: 1,
      pageSize: 30,
      productNameEn: keyword || "watch",
    }),
  });

  const json = await response.json();
  const list = json?.data?.list || json?.data || json?.result?.list || [];

  if (!Array.isArray(list) || list.length === 0) {
    throw new Error(`CJ returned empty list: ${JSON.stringify(json).slice(0, 300)}`);
  }

  return list.map(normalizeCJItem);
}

async function cacheProducts(products, keyword) {
  try {
    const db = admin.firestore();
    await db.collection("products").add({
      items: products,
      count: products.length,
      keyword,
      source: "backend-cj-live",
      syncedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.warn("Firestore cache skipped:", error?.message);
  }
}

app.get("/products", async (req, res) => {
  try {
    const keyword = String(req.query.keyword || "watch");
    const products = await fetchCJProducts(keyword);
    await cacheProducts(products, keyword);

    res.json({
      products,
      source: "backend-cj-live",
      count: products.length,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      error: error?.message || "Unknown backend error",
      products: [],
      source: "backend-error",
      count: 0,
      syncedAt: new Date().toISOString(),
    });
  }
});

app.post("/sync-products", async (req, res) => {
  try {
    const keyword = String(req.body?.keyword || "watch");
    const products = await fetchCJProducts(keyword);
    await cacheProducts(products, keyword);

    res.json({
      products,
      source: "backend-cj-live",
      count: products.length,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      error: error?.message || "Unknown backend sync error",
      products: [],
      source: "backend-error",
      count: 0,
      syncedAt: new Date().toISOString(),
    });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Buyli backend proxy running on port ${port}`);
});
