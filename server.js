const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

const CJ_BASE_URL = "https://developers.cjdropshipping.com/api2.0/v1";

const FALLBACK_PRODUCTS = [
  {
    id: "fallback-1",
    name: "שעון חכם ספורטיבי",
    price: 89,
    image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800",
    category: "גאדג׳טים",
    description: "שעון חכם בעיצוב מודרני עם מסך איכותי",
    source: "fallback"
  },
  {
    id: "fallback-2",
    name: "אוזניות Bluetooth אלחוטיות",
    price: 69,
    image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800",
    category: "אלקטרוניקה",
    description: "אוזניות אלחוטיות לשימוש יומיומי",
    source: "fallback"
  },
  {
    id: "fallback-3",
    name: "תיק גב יומיומי",
    price: 79,
    image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800",
    category: "אופנה",
    description: "תיק גב נוח לעבודה, לימודים ונסיעות",
    source: "fallback"
  }
];

function getCJToken() {
  return (
    process.env.CJ_ACCESS_TOKEN ||
    process.env.CJ_API_TOKEN ||
    process.env.NEXT_PUBLIC_CJ_ACCESS_TOKEN ||
    ""
  );
}

function toNumber(value, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function getFirstImage(item) {
  if (typeof item?.productImage === "string" && item.productImage) {
    return item.productImage;
  }

  if (typeof item?.image === "string" && item.image) {
    return item.image;
  }

  if (Array.isArray(item?.productImageSet) && item.productImageSet.length > 0) {
    const first = item.productImageSet[0];

    if (typeof first === "string") return first;
    if (typeof first?.image === "string") return first.image;
    if (typeof first?.url === "string") return first.url;
  }

  if (Array.isArray(item?.images) && item.images.length > 0) {
    const first = item.images[0];

    if (typeof first === "string") return first;
    if (typeof first?.url === "string") return first.url;
  }

  return "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800";
}

function extractProductList(data) {
  if (Array.isArray(data?.data?.list)) return data.data.list;
  if (Array.isArray(data?.data?.content)) return data.data.content;
  if (Array.isArray(data?.data?.records)) return data.data.records;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.result?.list)) return data.result.list;
  if (Array.isArray(data?.result)) return data.result;
  if (Array.isArray(data?.products)) return data.products;

  return [];
}

function mapCJProduct(item, index) {
  return {
    id: String(
      item?.pid ||
        item?.productId ||
        item?.vid ||
        item?.id ||
        item?.sku ||
        `cj-${index + 1}`
    ),
    name:
      item?.productNameEn ||
      item?.productName ||
      item?.nameEn ||
      item?.name ||
      "מוצר ללא שם",
    price: toNumber(
      item?.sellPrice ||
        item?.price ||
        item?.listedPrice ||
        item?.listPrice ||
        item?.variantSellPrice ||
        0,
      0
    ),
    image: getFirstImage(item),
    category:
      item?.categoryName ||
      item?.category ||
      item?.categoryNameEn ||
      "מוצרים",
    description:
      item?.description ||
      item?.productDescription ||
      item?.remark ||
      "",
    source: "cj"
  };
}

async function getProductsFromCJ() {
  const token = getCJToken();

  if (!token) {
    console.warn("Missing CJ token. Using fallback products.");
    return FALLBACK_PRODUCTS;
  }

  const url = `${CJ_BASE_URL}/product/list?pageNum=1&pageSize=20`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "CJ-Access-Token": token
      }
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      console.error("CJ request failed:", data);
      return FALLBACK_PRODUCTS;
    }

    if (data?.success === false || data?.result === false) {
      console.error("CJ returned error:", data);
      return FALLBACK_PRODUCTS;
    }

    const list = extractProductList(data);

    if (!Array.isArray(list) || list.length === 0) {
      console.warn("CJ returned empty list:", data);
      return FALLBACK_PRODUCTS;
    }

    return list.map(mapCJProduct);
  } catch (error) {
    console.error("CJ service error:", error);
    return FALLBACK_PRODUCTS;
  }
}

app.get("/", function (req, res) {
  res.json({
    success: true,
    message: "Buyli backend is running",
    syncedAt: new Date().toISOString()
  });
});

app.get("/api/products", async function (req, res) {
  try {
    const products = await getProductsFromCJ();

    res.json({
      success: true,
      source: products?.[0]?.source || "cj",
      product: products,
      products: products,
      count: products.length,
      syncedAt: new Date().toISOString()
    });
  } catch (error) {
    res.json({
      success: true,
      source: "fallback-error",
      product: FALLBACK_PRODUCTS,
      products: FALLBACK_PRODUCTS,
      count: FALLBACK_PRODUCTS.length,
      error: error?.message || "Unknown error",
      syncedAt: new Date().toISOString()
    });
  }
});

app.get("/products", async function (req, res) {
  try {
    const products = await getProductsFromCJ();

    res.json({
      success: true,
      product: products,
      products: products,
      count: products.length,
      syncedAt: new Date().toISOString()
    });
  } catch (error) {
    res.json({
      success: true,
      product: FALLBACK_PRODUCTS,
      products: FALLBACK_PRODUCTS,
      count: FALLBACK_PRODUCTS.length,
      error: error?.message || "Unknown error",
      syncedAt: new Date().toISOString()
    });
  }
});

app.listen(PORT, function () {
  console.log(`Buyli backend running on port ${PORT}`);
});
