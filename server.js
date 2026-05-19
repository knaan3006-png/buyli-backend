import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";

const API_URL = "https://buyli-backend.onrender.com/api/products";

const STORAGE_KEYS = {
  user: "buyli_user_v6",
  cart: "buyli_cart_v6",
  favorites: "buyli_favorites_v6",
  orders: "buyli_orders_v6"
};

const T = {
  bg: "#080808",
  card: "#111111",
  card2: "#181818",
  gold: "#D4AF37",
  gold2: "#F5D76E",
  text: "#FFFFFF",
  muted: "#A3A3A3",
  border: "#2A2A2A",
  red: "#EF4444",
  green: "#16A34A"
};

const ALL = "הכול";

const BLOCKED = [
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
  "dagger"
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
  "Sports & Outdoors": "ספורט וטיולים"
};

function categoryName(category) {
  return CATEGORY_HE[category] || category || "מוצרים";
}

function cleanText(value) {
  if (!value) return "מוצר איכותי להזמנה אונליין דרך Buyli.";
  return String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function smartHebrewName(originalName, category) {
  const name = String(originalName || "").toLowerCase();
  const cat = String(category || "").toLowerCase();

  if (name.includes("dress") || cat.includes("dress")) return "שמלת נשים";
  if (name.includes("jacket") || cat.includes("jacket")) return "ז׳קט אופנתי";
  if (name.includes("shirt") || name.includes("blouse") || cat.includes("shirt")) return "חולצה אופנתית";
  if (name.includes("pants") || name.includes("trousers")) return "מכנסיים אופנתיים";
  if (name.includes("suit") || cat.includes("suit")) return "סט לבוש";
  if (name.includes("boxer") || cat.includes("boxer")) return "בוקסר לגברים";
  if (name.includes("wallet") || cat.includes("wallet")) return "ארנק";
  if (name.includes("bracelet") || cat.includes("bracelet")) return "צמיד";
  if (name.includes("necklace") || name.includes("pendant")) return "שרשרת";
  if (name.includes("bag") || name.includes("backpack")) return "תיק";
  if (name.includes("shoe") || name.includes("sneaker")) return "נעליים";
  if (name.includes("watch")) return "שעון";
  if (name.includes("camping") || name.includes("hiking")) return "מוצר לטיולים";
  if (cat.includes("jewelry")) return "תכשיט";
  if (cat.includes("electronics")) return "מוצר אלקטרוני";
  if (cat.includes("beauty")) return "מוצר טיפוח";

  return categoryName(category);
}

function normalizeProduct(product, index) {
  const price = Number(product?.price || 0);
  const originalName = String(product?.name || product?.productName || "Product");
  const category = String(product?.category || "מוצרים");

  return {
    id: String(product?.id || product?.pid || `product-${index}`),
    name: smartHebrewName(originalName, category),
    originalName,
    price,
    oldPrice: price ? price * 1.35 : 0,
    image: String(product?.image || ""),
    category,
    description: cleanText(product?.description),
    isNew: index < 10,
    isSale: index % 3 === 0
  };
}

function isAllowed(product) {
  const text = `${product.name} ${product.originalName} ${product.category} ${product.description}`.toLowerCase();

  if (!product.image) return false;
  if (!product.price || Number(product.price) <= 0) return false;

  return !BLOCKED.some((word) => text.includes(word));
}

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function SearchBar({ searchText, setSearchText, onSearch, onClear }) {
  return (
    <View style={styles.searchWrap}>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={20} color={T.gold} />

        <TextInput
          style={styles.searchInput}
          placeholder="חפש מוצר בעברית או באנגלית..."
          placeholderTextColor="#777"
          value={searchText}
          onChangeText={setSearchText}
          onSubmitEditing={onSearch}
          autoCorrect={false}
          autoCapitalize="none"
          textAlign="right"
          blurOnSubmit={false}
          returnKeyType="search"
        />

        {searchText.length > 0 && (
          <TouchableOpacity onPress={onClear}>
            <Ionicons name="close-circle" size={21} color={T.muted} />
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity style={styles.searchButton} onPress={onSearch}>
        <Text style={styles.searchButtonText}>חפש</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function App() {
  const [appMode, setAppMode] = useState("loading");
  const [screen, setScreen] = useState("home");

  const [user, setUser] = useState(null);
  const [loginName, setLoginName] = useState("");
  const [loginPhone, setLoginPhone] = useState("");

  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [orders, setOrders] = useState([]);

  const [query, setQuery] = useState("");
  const [searchText, setSearchText] = useState("");
  const [category, setCategory] = useState(ALL);

  const [selected, setSelected] = useState(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [customerAddress, setCustomerAddress] = useState("");

  const [loadingProducts, setLoadingProducts] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [storageReady, setStorageReady] = useState(false);

  async function readStorage() {
    try {
      const savedUser = await AsyncStorage.getItem(STORAGE_KEYS.user);
      const savedCart = await AsyncStorage.getItem(STORAGE_KEYS.cart);
      const savedFavorites = await AsyncStorage.getItem(STORAGE_KEYS.favorites);
      const savedOrders = await AsyncStorage.getItem(STORAGE_KEYS.orders);

      const parsedUser = savedUser ? JSON.parse(savedUser) : null;

      setUser(parsedUser);
      setCart(savedCart ? JSON.parse(savedCart) : []);
      setFavorites(savedFavorites ? JSON.parse(savedFavorites) : []);
      setOrders(savedOrders ? JSON.parse(savedOrders) : []);

      setAppMode(parsedUser ? "app" : "welcome");
    } catch (e) {
      setAppMode("welcome");
    } finally {
      setStorageReady(true);
    }
  }

  async function saveStorage(key, value) {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
  }

  useEffect(() => {
    readStorage();
    loadProducts(false);
  }, []);

  useEffect(() => {
    if (storageReady) saveStorage(STORAGE_KEYS.cart, cart);
  }, [cart, storageReady]);

  useEffect(() => {
    if (storageReady) saveStorage(STORAGE_KEYS.favorites, favorites);
  }, [favorites, storageReady]);

  useEffect(() => {
    if (storageReady) saveStorage(STORAGE_KEYS.orders, orders);
  }, [orders, storageReady]);

  async function loadProducts(refresh = false) {
    try {
      refresh ? setRefreshing(true) : setLoadingProducts(true);
      setError("");

      const response = await fetch(API_URL);
      const data = await response.json();

      const list = Array.isArray(data?.products)
        ? data.products
        : Array.isArray(data?.product)
        ? data.product
        : [];

      const cleanProducts = list
        .map(normalizeProduct)
        .filter(isAllowed);

      setProducts(cleanProducts);
    } catch (e) {
      setError("לא הצלחנו לטעון מוצרים. בדוק אינטרנט ונסה שוב.");
    } finally {
      setLoadingProducts(false);
      setRefreshing(false);
    }
  }

  const categories = useMemo(() => {
    const raw = products
      .map((p) => String(p.category || "").trim())
      .filter(Boolean);

    return [ALL, ...Array.from(new Set(raw)).slice(0, 18)];
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();

    return products.filter((product) => {
      const searchPool = [
        product.name,
        product.originalName,
        product.category,
        categoryName(product.category),
        product.description
      ].join(" ").toLowerCase();

      const searchOk = !q || searchPool.includes(q);
      const categoryOk = category === ALL || product.category === category;

      return searchOk && categoryOk;
    });
  }, [products, query, category]);

  const homeProducts = filteredProducts.slice(0, 12);

  const total = cart.reduce((sum, item) => sum + Number(item.price || 0), 0);
  const shipping = total >= 50 || total === 0 ? 0 : 7.99;
  const finalTotal = total + shipping;

  function login() {
    if (!loginName.trim() || !loginPhone.trim()) {
      Alert.alert("חסרים פרטים", "נא למלא שם וטלפון.");
      return;
    }

    const newUser = {
      name: loginName.trim(),
      phone: loginPhone.trim(),
      createdAt: new Date().toISOString()
    };

    setUser(newUser);
    saveStorage(STORAGE_KEYS.user, newUser);
    setAppMode("app");
    setScreen("home");
  }

  async function logout() {
    await AsyncStorage.removeItem(STORAGE_KEYS.user);
    setUser(null);
    setLoginName("");
    setLoginPhone("");
    setAppMode("welcome");
    setScreen("home");
  }

  function runSearch() {
    setQuery(searchText.trim());
    setScreen("products");
  }

  function clearSearch() {
    setSearchText("");
    setQuery("");
  }

  function isFavorite(product) {
    return favorites.some((item) => item.id === product.id);
  }

  function toggleFavorite(product) {
    setFavorites((current) =>
      isFavorite(product)
        ? current.filter((item) => item.id !== product.id)
        : [...current, product]
    );
  }

  function addToCart(product) {
    setCart((current) => [...current, product]);
    Alert.alert("נוסף לסל", "המוצר נוסף לסל הקניות.");
  }

  function removeFromCart(index) {
    setCart((current) => current.filter((_, i) => i !== index));
  }

  function confirmOrder() {
    if (!cart.length) {
      Alert.alert("סל ריק", "צריך להוסיף מוצר לסל.");
      return;
    }

    if (!customerAddress.trim()) {
      Alert.alert("חסרה כתובת", "נא להזין כתובת למשלוח.");
      return;
    }

    const order = {
      id: `ORD-${Date.now()}`,
      createdAt: new Date().toLocaleString("he-IL"),
      userName: user?.name || "",
      phone: user?.phone || "",
      address: customerAddress.trim(),
      items: cart,
      total,
      shipping,
      finalTotal
    };

    setOrders((current) => [order, ...current]);
    setCart([]);
    setCustomerAddress("");
    setCheckoutOpen(false);
    setScreen("orders");

    Alert.alert("הזמנה התקבלה", "ההזמנה נשמרה במסך ההזמנות שלי.");
  }

  function CategoryChip({ item }) {
    const active = category === item;

    return (
      <TouchableOpacity
        style={[styles.chip, active && styles.chipActive]}
        onPress={() => {
          setCategory(item);
          setScreen("products");
        }}
      >
        <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
          {categoryName(item)}
        </Text>
      </TouchableOpacity>
    );
  }

  function ProductCard({ item }) {
    const favorite = isFavorite(item);

    return (
      <TouchableOpacity
        style={styles.productCard}
        activeOpacity={0.9}
        onPress={() => setSelected(item)}
      >
        <View>
          <Image source={{ uri: item.image }} style={styles.productImage} />

          <TouchableOpacity style={styles.heartButton} onPress={() => toggleFavorite(item)}>
            <Ionicons
              name={favorite ? "heart" : "heart-outline"}
              size={22}
              color={favorite ? T.red : T.text}
            />
          </TouchableOpacity>

          <View style={styles.badges}>
            {item.isNew && <Text style={styles.newBadge}>חדש</Text>}
            {item.isSale && <Text style={styles.saleBadge}>מבצע</Text>}
          </View>
        </View>

        <View style={styles.productBody}>
          <Text style={styles.productCategory} numberOfLines={1}>
            {categoryName(item.category)}
          </Text>

          <Text style={styles.productName} numberOfLines={2}>
            {item.name}
          </Text>

          <Text style={styles.originalName} numberOfLines={1}>
            {item.originalName}
          </Text>

          <View style={styles.priceRow}>
            <Text style={styles.price}>{money(item.price)}</Text>
            {item.isSale && <Text style={styles.oldPrice}>{money(item.oldPrice)}</Text>}
          </View>

          <TouchableOpacity style={styles.addButton} onPress={() => addToCart(item)}>
            <Ionicons name="bag-add" size={17} color="#080808" />
            <Text style={styles.addButtonText}>הוסף לסל</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  }

  function ProductList({ list }) {
    if (loadingProducts) {
      return (
        <View style={styles.infoBox}>
          <ActivityIndicator color={T.gold} size="large" />
          <Text style={styles.infoText}>טוען מוצרים...</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.infoBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.goldButton} onPress={() => loadProducts(false)}>
            <Text style={styles.goldButtonText}>נסה שוב</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <FlatList
        data={list}
        renderItem={({ item }) => <ProductCard item={item} />}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        numColumns={2}
        scrollEnabled={false}
        columnWrapperStyle={styles.productRow}
        contentContainerStyle={styles.productsList}
        ListEmptyComponent={<Text style={styles.emptyText}>לא נמצאו מוצרים.</Text>}
      />
    );
  }

  function SectionTitle({ title, sub, right, onRight }) {
    return (
      <View style={styles.sectionTitle}>
        <View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{sub}</Text>
        </View>

        {right && (
          <TouchableOpacity style={styles.smallButton} onPress={onRight}>
            <Text style={styles.smallButtonText}>{right}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  function ScreenTitle({ title, sub }) {
    return (
      <View style={styles.screenTitle}>
        <Text style={styles.bigTitle}>{title}</Text>
        <Text style={styles.subtitle}>{sub}</Text>
      </View>
    );
  }

  function Summary() {
    return (
      <View style={styles.summaryBox}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>מוצרים</Text>
          <Text style={styles.summaryValue}>{money(total)}</Text>
        </View>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>משלוח</Text>
          <Text style={styles.summaryValue}>{shipping === 0 ? "חינם" : money(shipping)}</Text>
        </View>

        <View style={styles.line} />

        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabelBig}>סה״כ לתשלום</Text>
          <Text style={styles.summaryValueBig}>{money(finalTotal)}</Text>
        </View>
      </View>
    );
  }

  function WelcomeScreen() {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={T.bg} />

        <View style={styles.welcome}>
          <Text style={styles.welcomeLogo}>Buyli</Text>
          <Text style={styles.welcomeTitle}>קניות חכמות, מראה יוקרתי</Text>
          <Text style={styles.welcomeText}>
            אפליקציית קניות מחוברת למוצרים אמיתיים מ־CJ, עם סל, מועדפים והזמנות.
          </Text>

          <TouchableOpacity style={styles.welcomeButton} onPress={() => setAppMode("login")}>
            <Text style={styles.welcomeButtonText}>התחל עכשיו</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  function LoginScreen() {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={T.bg} />

        <View style={styles.login}>
          <Text style={styles.logo}>Buyli</Text>
          <Text style={styles.bigTitle}>כניסה לאפליקציה</Text>
          <Text style={styles.subtitle}>כניסה דמו. בשלב הבא נחבר משתמשים אמיתיים לשרת.</Text>

          <TextInput
            style={styles.loginInput}
            placeholder="שם מלא"
            placeholderTextColor="#777"
            value={loginName}
            onChangeText={setLoginName}
            textAlign="right"
          />

          <TextInput
            style={styles.loginInput}
            placeholder="טלפון"
            placeholderTextColor="#777"
            value={loginPhone}
            onChangeText={setLoginPhone}
            keyboardType="phone-pad"
            textAlign="right"
          />

          <TouchableOpacity style={styles.checkoutButton} onPress={login}>
            <Text style={styles.checkoutButtonText}>כניסה</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.backButton} onPress={() => setAppMode("welcome")}>
            <Text style={styles.backButtonText}>חזור</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  function HomeScreen() {
    return (
      <>
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroSmall}>שלום {user?.name || "לקוח"}</Text>
              <Text style={styles.heroTitle}>ברוך הבא ל־Buyli</Text>
            </View>

            <TouchableOpacity style={styles.roundButton} onPress={() => loadProducts(true)}>
              <Ionicons name="refresh" size={22} color={T.gold} />
            </TouchableOpacity>
          </View>

          <Text style={styles.heroText}>
            מוצרים אמיתיים מ־CJ, מסוננים ומוצגים באפליקציה שלך.
          </Text>

          <View style={styles.promo}>
            <Ionicons name="sparkles" size={20} color={T.gold2} />
            <Text style={styles.promoText}>משלוח חינם מעל $50</Text>
          </View>

          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{products.length}</Text>
              <Text style={styles.statLabel}>מוצרים</Text>
            </View>

            <View style={styles.stat}>
              <Text style={styles.statValue}>{cart.length}</Text>
              <Text style={styles.statLabel}>בסל</Text>
            </View>

            <View style={styles.stat}>
              <Text style={styles.statValue}>{orders.length}</Text>
              <Text style={styles.statLabel}>הזמנות</Text>
            </View>
          </View>
        </View>

        <SearchBar
          searchText={searchText}
          setSearchText={setSearchText}
          onSearch={runSearch}
          onClear={clearSearch}
        />

        <SectionTitle title="קטגוריות" sub="נבנות אוטומטית מהמוצרים" />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories}>
          {categories.map((item) => <CategoryChip key={item} item={item} />)}
        </ScrollView>

        <SectionTitle
          title="מוצרים מומלצים"
          sub={`מוצגים ${homeProducts.length} מתוך ${filteredProducts.length}`}
          right="ראה הכול"
          onRight={() => setScreen("products")}
        />

        <ProductList list={homeProducts} />
      </>
    );
  }

  function ProductsScreen() {
    return (
      <>
        <ScreenTitle title="מוצרים" sub={`${filteredProducts.length} מוצרים מוצגים מתוך ${products.length}`} />

        <SearchBar
          searchText={searchText}
          setSearchText={setSearchText}
          onSearch={runSearch}
          onClear={clearSearch}
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories}>
          {categories.map((item) => <CategoryChip key={item} item={item} />)}
        </ScrollView>

        <TouchableOpacity style={styles.refreshButton} onPress={() => loadProducts(true)}>
          <Ionicons name="refresh" size={18} color="#080808" />
          <Text style={styles.refreshButtonText}>רענון מוצרים מ־CJ</Text>
        </TouchableOpacity>

        <ProductList list={filteredProducts} />
      </>
    );
  }

  function FavoritesScreen() {
    return (
      <>
        <ScreenTitle title="מועדפים" sub={`${favorites.length} מוצרים שמורים`} />
        <ProductList list={favorites} />
      </>
    );
  }

  function CartScreen() {
    return (
      <View style={{ padding: 18 }}>
        <ScreenTitle title="סל קניות" sub={cart.length ? `${cart.length} מוצרים בסל` : "הסל עדיין ריק"} />

        {!cart.length ? (
          <View style={styles.infoBox}>
            <Ionicons name="cart-outline" size={64} color={T.gold} />
            <Text style={styles.emptyTitle}>אין מוצרים בסל</Text>
            <Text style={styles.infoText}>עבור למסך המוצרים והוסף פריטים להזמנה.</Text>

            <TouchableOpacity style={styles.goldButton} onPress={() => setScreen("products")}>
              <Text style={styles.goldButtonText}>עבור למוצרים</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {cart.map((item, index) => (
              <View style={styles.cartItem} key={`${item.id}-${index}`}>
                <Image source={{ uri: item.image }} style={styles.cartImage} />

                <View style={{ flex: 1 }}>
                  <Text style={styles.cartName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.cartCategory} numberOfLines={1}>{categoryName(item.category)}</Text>
                  <Text style={styles.cartPrice}>{money(item.price)}</Text>
                </View>

                <TouchableOpacity onPress={() => removeFromCart(index)}>
                  <Ionicons name="trash-outline" size={24} color={T.red} />
                </TouchableOpacity>
              </View>
            ))}

            <Summary />

            <TouchableOpacity style={styles.checkoutButton} onPress={() => setCheckoutOpen(true)}>
              <Text style={styles.checkoutButtonText}>המשך לתשלום</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    );
  }

  function OrdersScreen() {
    return (
      <View style={{ padding: 18 }}>
        <ScreenTitle title="ההזמנות שלי" sub={`${orders.length} הזמנות שמורות במכשיר`} />

        {!orders.length ? (
          <View style={styles.infoBox}>
            <Ionicons name="receipt-outline" size={64} color={T.gold} />
            <Text style={styles.emptyTitle}>אין הזמנות עדיין</Text>
            <Text style={styles.infoText}>אחרי אישור הזמנה היא תופיע כאן.</Text>
          </View>
        ) : (
          orders.map((order) => (
            <View style={styles.orderCard} key={order.id}>
              <Text style={styles.orderTitle}>הזמנה {order.id}</Text>
              <Text style={styles.orderText}>{order.createdAt}</Text>
              <Text style={styles.orderText}>כמות מוצרים: {order.items.length}</Text>
              <Text style={styles.orderTotal}>{money(order.finalTotal)}</Text>
            </View>
          ))
        )}
      </View>
    );
  }

  function ProfileScreen() {
    return (
      <View style={{ padding: 18 }}>
        <ScreenTitle title="הפרופיל שלי" sub="פרטי משתמש ושמירה מקומית" />

        <View style={styles.profileCard}>
          <Ionicons name="person-circle-outline" size={74} color={T.gold} />
          <Text style={styles.profileName}>{user?.name}</Text>
          <Text style={styles.profilePhone}>{user?.phone}</Text>

          <View style={styles.profileStats}>
            <View style={styles.profileStat}>
              <Text style={styles.profileStatValue}>{orders.length}</Text>
              <Text style={styles.profileStatLabel}>הזמנות</Text>
            </View>

            <View style={styles.profileStat}>
              <Text style={styles.profileStatValue}>{favorites.length}</Text>
              <Text style={styles.profileStatLabel}>מועדפים</Text>
            </View>

            <View style={styles.profileStat}>
              <Text style={styles.profileStatValue}>{cart.length}</Text>
              <Text style={styles.profileStatLabel}>בסל</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.logoutButton} onPress={logout}>
            <Text style={styles.logoutButtonText}>יציאה מהחשבון</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  function CurrentScreen() {
    if (screen === "products") return <ProductsScreen />;
    if (screen === "favorites") return <FavoritesScreen />;
    if (screen === "cart") return <CartScreen />;
    if (screen === "orders") return <OrdersScreen />;
    if (screen === "profile") return <ProfileScreen />;
    return <HomeScreen />;
  }

  function Tab({ id, label, icon }) {
    const active = screen === id;

    return (
      <TouchableOpacity style={styles.tab} onPress={() => setScreen(id)}>
        <Ionicons
          name={active ? icon : `${icon}-outline`}
          size={23}
          color={active ? T.gold : T.muted}
        />
        <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>

        {id === "cart" && cart.length > 0 && (
          <View style={styles.tabBadge}>
            <Text style={styles.tabBadgeText}>{cart.length}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  if (appMode === "loading") {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={T.gold} />
          <Text style={styles.infoText}>טוען את Buyli...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (appMode === "welcome") return <WelcomeScreen />;
  if (appMode === "login") return <LoginScreen />;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={T.bg} />

      <View style={styles.header}>
        <View>
          <Text style={styles.logo}>Buyli</Text>
          <Text style={styles.headerText}>Premium Mobile Shopping</Text>
        </View>

        <TouchableOpacity style={styles.headerCart} onPress={() => setScreen("cart")}>
          <Ionicons name="bag-handle" size={23} color="#080808" />
          <Text style={styles.headerCartText}>{cart.length}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.main}
        contentContainerStyle={{ paddingBottom: 115 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadProducts(true)}
            tintColor={T.gold}
          />
        }
      >
        <CurrentScreen />
      </ScrollView>

      <View style={styles.bottomNav}>
        <Tab id="home" label="בית" icon="home" />
        <Tab id="products" label="מוצרים" icon="grid" />
        <Tab id="favorites" label="מועדפים" icon="heart" />
        <Tab id="orders" label="הזמנות" icon="receipt" />
        <Tab id="profile" label="פרופיל" icon="person" />
      </View>

      <Modal visible={!!selected} animationType="slide">
        <SafeAreaView style={styles.modal}>
          {selected && (
            <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
              <View style={styles.modalTop}>
                <TouchableOpacity style={styles.closeButton} onPress={() => setSelected(null)}>
                  <Ionicons name="close" size={28} color={T.text} />
                </TouchableOpacity>

                <TouchableOpacity style={styles.closeButton} onPress={() => toggleFavorite(selected)}>
                  <Ionicons
                    name={isFavorite(selected) ? "heart" : "heart-outline"}
                    size={26}
                    color={isFavorite(selected) ? T.red : T.text}
                  />
                </TouchableOpacity>
              </View>

              <Image source={{ uri: selected.image }} style={styles.fullImage} />

              <Text style={styles.modalCategory}>{categoryName(selected.category)}</Text>
              <Text style={styles.modalTitle}>{selected.name}</Text>
              <Text style={styles.modalOriginal}>{selected.originalName}</Text>
              <Text style={styles.modalDescription}>{selected.description}</Text>

              <View style={styles.modalPriceBox}>
                <View>
                  <Text style={styles.modalPrice}>{money(selected.price)}</Text>
                  {selected.isSale && <Text style={styles.modalOldPrice}>{money(selected.oldPrice)}</Text>}
                </View>

                <TouchableOpacity style={styles.modalAddButton} onPress={() => addToCart(selected)}>
                  <Ionicons name="bag-add" size={22} color="#080808" />
                  <Text style={styles.modalAddText}>הוסף לסל</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>

      <Modal visible={checkoutOpen} animationType="slide">
        <SafeAreaView style={styles.modal}>
          <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
            <TouchableOpacity style={styles.closeButton} onPress={() => setCheckoutOpen(false)}>
              <Ionicons name="close" size={28} color={T.text} />
            </TouchableOpacity>

            <ScreenTitle title="פרטי הזמנה" sub="תשלום דמו — בהמשך נחבר סליקה אמיתית" />

            <View style={styles.checkoutUserBox}>
              <Text style={styles.checkoutUserText}>שם: {user?.name}</Text>
              <Text style={styles.checkoutUserText}>טלפון: {user?.phone}</Text>
            </View>

            <TextInput
              style={[styles.checkoutInput, { minHeight: 90 }]}
              placeholder="כתובת למשלוח"
              placeholderTextColor="#777"
              value={customerAddress}
              onChangeText={setCustomerAddress}
              multiline
              textAlign="right"
            />

            <Summary />

            <TouchableOpacity style={styles.checkoutButton} onPress={confirmOrder}>
              <Text style={styles.checkoutButtonText}>אישור הזמנה</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
  main: { flex: 1, backgroundColor: T.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },

  welcome: {
    flex: 1,
    justifyContent: "center",
    padding: 28,
    backgroundColor: T.bg
  },

  welcomeLogo: {
    color: T.gold,
    fontSize: 54,
    fontWeight: "900",
    textAlign: "center"
  },

  welcomeTitle: {
    color: T.text,
    fontSize: 34,
    lineHeight: 42,
    fontWeight: "900",
    textAlign: "center",
    marginTop: 22
  },

  welcomeText: {
    color: T.muted,
    fontSize: 16,
    lineHeight: 26,
    textAlign: "center",
    marginTop: 14
  },

  welcomeButton: {
    backgroundColor: T.gold,
    paddingVertical: 16,
    borderRadius: 18,
    marginTop: 34,
    alignItems: "center"
  },

  welcomeButtonText: {
    color: "#080808",
    fontSize: 18,
    fontWeight: "900"
  },

  login: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: T.bg
  },

  loginInput: {
    marginTop: 14,
    backgroundColor: T.card,
    borderWidth: 1,
    borderColor: T.border,
    color: T.text,
    borderRadius: 18,
    paddingHorizontal: 15,
    paddingVertical: 14,
    fontSize: 16
  },

  backButton: {
    marginTop: 16,
    alignItems: "center"
  },

  backButtonText: {
    color: T.muted,
    fontWeight: "900"
  },

  header: {
    backgroundColor: T.bg,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },

  logo: { color: T.gold, fontSize: 32, fontWeight: "900" },
  headerText: { color: T.muted, fontSize: 12 },

  headerCart: {
    backgroundColor: T.gold,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 7
  },

  headerCartText: { color: "#080808", fontWeight: "900" },

  hero: {
    margin: 18,
    backgroundColor: T.card,
    borderWidth: 1,
    borderColor: "#3A3218",
    borderRadius: 30,
    padding: 22
  },

  heroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12
  },

  heroSmall: {
    color: T.gold,
    fontWeight: "900",
    fontSize: 13,
    textAlign: "right"
  },

  heroTitle: {
    color: T.text,
    fontSize: 34,
    lineHeight: 42,
    fontWeight: "900",
    marginTop: 8,
    textAlign: "right"
  },

  heroText: {
    color: T.muted,
    fontSize: 16,
    lineHeight: 26,
    marginTop: 12,
    textAlign: "right"
  },

  roundButton: {
    width: 46,
    height: 46,
    borderRadius: 999,
    backgroundColor: T.card2,
    borderWidth: 1,
    borderColor: T.border,
    alignItems: "center",
    justifyContent: "center"
  },

  promo: {
    marginTop: 18,
    backgroundColor: "#1E1A0C",
    borderColor: "#5D4B12",
    borderWidth: 1,
    borderRadius: 18,
    padding: 13,
    flexDirection: "row",
    justifyContent: "center",
    gap: 8
  },

  promoText: { color: T.gold2, fontWeight: "900" },

  stats: { flexDirection: "row", gap: 10, marginTop: 18 },

  stat: {
    flex: 1,
    backgroundColor: T.card2,
    borderRadius: 18,
    padding: 13,
    borderWidth: 1,
    borderColor: T.border
  },

  statValue: {
    color: T.gold,
    fontWeight: "900",
    fontSize: 18,
    textAlign: "center"
  },

  statLabel: {
    color: T.muted,
    textAlign: "center",
    marginTop: 4,
    fontSize: 12
  },

  searchWrap: {
    marginHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },

  searchBox: {
    flex: 1,
    backgroundColor: T.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: T.border,
    paddingHorizontal: 15,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },

  searchInput: {
    flex: 1,
    height: 48,
    color: T.text,
    fontSize: 16
  },

  searchButton: {
    backgroundColor: T.gold,
    borderRadius: 16,
    paddingHorizontal: 18,
    height: 50,
    alignItems: "center",
    justifyContent: "center"
  },

  searchButtonText: {
    color: "#080808",
    fontWeight: "900"
  },

  sectionTitle: {
    marginTop: 24,
    marginHorizontal: 18,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },

  title: { color: T.text, fontSize: 25, fontWeight: "900", textAlign: "right" },
  subtitle: { color: T.muted, textAlign: "right", marginTop: 4, lineHeight: 21 },

  bigTitle: {
    color: T.text,
    fontSize: 34,
    fontWeight: "900",
    textAlign: "right"
  },

  screenTitle: { margin: 18, marginBottom: 16 },

  smallButton: {
    backgroundColor: "#1E1A0C",
    borderWidth: 1,
    borderColor: "#5D4B12",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999
  },

  smallButtonText: { color: T.gold, fontWeight: "900" },

  categories: {
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 4,
    gap: 10
  },

  chip: {
    maxWidth: 190,
    backgroundColor: T.card,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: T.border
  },

  chipActive: { backgroundColor: T.gold, borderColor: T.gold },
  chipText: { color: T.text, fontWeight: "900" },
  chipTextActive: { color: "#080808" },

  refreshButton: {
    marginHorizontal: 18,
    marginBottom: 16,
    backgroundColor: T.gold,
    borderRadius: 16,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8
  },

  refreshButtonText: { color: "#080808", fontWeight: "900" },

  infoBox: {
    margin: 18,
    backgroundColor: T.card,
    borderRadius: 24,
    padding: 30,
    alignItems: "center",
    borderWidth: 1,
    borderColor: T.border
  },

  infoText: { color: T.muted, marginTop: 12, textAlign: "center", lineHeight: 22 },
  errorText: { color: T.text, textAlign: "center", lineHeight: 23 },

  goldButton: {
    marginTop: 14,
    backgroundColor: T.gold,
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 11
  },

  goldButtonText: { color: "#080808", fontWeight: "900" },

  productRow: { gap: 12, paddingHorizontal: 18 },
  productsList: { gap: 12 },

  productCard: {
    flex: 1,
    backgroundColor: T.card,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 24,
    overflow: "hidden",
    marginBottom: 12
  },

  productImage: { width: "100%", height: 165, backgroundColor: T.card2 },

  heartButton: {
    position: "absolute",
    top: 10,
    left: 10,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 999,
    padding: 7
  },

  badges: { position: "absolute", top: 10, right: 10, gap: 6 },

  newBadge: {
    backgroundColor: T.gold,
    color: "#080808",
    fontWeight: "900",
    fontSize: 11,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    overflow: "hidden"
  },

  saleBadge: {
    backgroundColor: "#7F1D1D",
    color: T.text,
    fontWeight: "900",
    fontSize: 11,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    overflow: "hidden"
  },

  productBody: { padding: 12 },

  productCategory: {
    color: T.gold,
    fontWeight: "900",
    fontSize: 12,
    textAlign: "right"
  },

  productName: {
    color: T.text,
    fontWeight: "900",
    fontSize: 15,
    lineHeight: 20,
    minHeight: 40,
    marginTop: 7,
    textAlign: "right"
  },

  originalName: {
    color: T.muted,
    fontSize: 11,
    textAlign: "right",
    marginTop: 4
  },

  priceRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },

  price: { color: T.text, fontWeight: "900", fontSize: 19 },
  oldPrice: { color: T.muted, textDecorationLine: "line-through", fontSize: 13 },

  addButton: {
    marginTop: 11,
    backgroundColor: T.gold,
    borderRadius: 14,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 5
  },

  addButtonText: { color: "#080808", fontWeight: "900", fontSize: 13 },

  emptyText: { color: T.muted, textAlign: "center", margin: 30 },
  emptyTitle: { color: T.text, fontSize: 22, fontWeight: "900", marginTop: 14 },

  cartItem: {
    marginTop: 12,
    backgroundColor: T.card,
    borderColor: T.border,
    borderWidth: 1,
    borderRadius: 20,
    padding: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },

  cartImage: { width: 64, height: 64, borderRadius: 16, backgroundColor: T.card2 },
  cartName: { color: T.text, fontWeight: "900", textAlign: "right" },
  cartCategory: { color: T.muted, textAlign: "right", fontSize: 12, marginTop: 3 },
  cartPrice: { color: T.gold, fontWeight: "900", textAlign: "right", marginTop: 4 },

  summaryBox: {
    marginTop: 18,
    backgroundColor: T.card,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 24,
    padding: 18
  },

  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10
  },

  summaryLabel: { color: T.muted, fontWeight: "800" },
  summaryValue: { color: T.text, fontWeight: "900" },
  summaryLabelBig: { color: T.text, fontWeight: "900", fontSize: 18 },
  summaryValueBig: { color: T.gold, fontWeight: "900", fontSize: 21 },
  line: { height: 1, backgroundColor: T.border, marginVertical: 8 },

  checkoutButton: {
    marginTop: 16,
    backgroundColor: T.gold,
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: "center"
  },

  checkoutButtonText: { color: "#080808", fontSize: 17, fontWeight: "900" },

  checkoutUserBox: {
    backgroundColor: T.card,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 20,
    padding: 16,
    marginTop: 10
  },

  checkoutUserText: {
    color: T.text,
    textAlign: "right",
    fontWeight: "800",
    marginBottom: 6
  },

  bottomNav: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: 10,
    backgroundColor: "#101010",
    borderColor: T.border,
    borderWidth: 1,
    borderRadius: 26,
    paddingVertical: 9,
    flexDirection: "row",
    justifyContent: "space-around"
  },

  tab: { alignItems: "center", minWidth: 54, position: "relative" },
  tabText: { color: T.muted, fontSize: 10, marginTop: 3, fontWeight: "800" },
  tabTextActive: { color: T.gold },

  tabBadge: {
    position: "absolute",
    top: -4,
    right: 4,
    backgroundColor: T.red,
    borderRadius: 999,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center"
  },

  tabBadgeText: { color: T.text, fontSize: 10, fontWeight: "900" },

  modal: { flex: 1, backgroundColor: T.bg },

  modalTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12
  },

  closeButton: {
    backgroundColor: T.card,
    borderColor: T.border,
    borderWidth: 1,
    borderRadius: 999,
    padding: 9,
    alignSelf: "flex-start"
  },

  fullImage: {
    width: "100%",
    height: 360,
    borderRadius: 28,
    backgroundColor: T.card2
  },

  modalCategory: {
    color: T.gold,
    fontWeight: "900",
    textAlign: "right",
    marginTop: 18
  },

  modalTitle: {
    color: T.text,
    fontSize: 28,
    lineHeight: 36,
    fontWeight: "900",
    marginTop: 10,
    textAlign: "right"
  },

  modalOriginal: {
    color: T.muted,
    fontSize: 13,
    textAlign: "right",
    marginTop: 5
  },

  modalDescription: {
    color: T.muted,
    fontSize: 16,
    lineHeight: 25,
    marginTop: 12,
    textAlign: "right"
  },

  modalPriceBox: {
    marginTop: 24,
    backgroundColor: T.card,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 24,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },

  modalPrice: { color: T.gold, fontWeight: "900", fontSize: 28 },
  modalOldPrice: { color: T.muted, textDecorationLine: "line-through", marginTop: 3 },

  modalAddButton: {
    backgroundColor: T.gold,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 7
  },

  modalAddText: { color: "#080808", fontWeight: "900", fontSize: 16 },

  checkoutInput: {
    marginTop: 14,
    backgroundColor: T.card,
    borderWidth: 1,
    borderColor: T.border,
    color: T.text,
    borderRadius: 18,
    paddingHorizontal: 15,
    paddingVertical: 14,
    fontSize: 16
  },

  orderCard: {
    backgroundColor: T.card,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 22,
    padding: 16,
    marginBottom: 12
  },

  orderTitle: {
    color: T.gold,
    fontWeight: "900",
    textAlign: "right",
    fontSize: 16
  },

  orderText: {
    color: T.muted,
    textAlign: "right",
    marginTop: 6
  },

  orderTotal: {
    color: T.text,
    fontWeight: "900",
    textAlign: "right",
    marginTop: 8,
    fontSize: 20
  },

  profileCard: {
    backgroundColor: T.card,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 26,
    padding: 24,
    alignItems: "center",
    marginTop: 10
  },

  profileName: {
    color: T.text,
    fontSize: 24,
    fontWeight: "900",
    marginTop: 10
  },

  profilePhone: {
    color: T.muted,
    marginTop: 4
  },

  profileStats: {
    flexDirection: "row",
    gap: 10,
    marginTop: 22,
    width: "100%"
  },

  profileStat: {
    flex: 1,
    backgroundColor: T.card2,
    borderRadius: 18,
    padding: 12,
    alignItems: "center"
  },

  profileStatValue: {
    color: T.gold,
    fontWeight: "900",
    fontSize: 20
  },

  profileStatLabel: {
    color: T.muted,
    fontSize: 12,
    marginTop: 3
  },

  logoutButton: {
    backgroundColor: "#7F1D1D",
    borderRadius: 16,
    paddingVertical: 14,
    width: "100%",
    alignItems: "center",
    marginTop: 22
  },

  logoutButtonText: {
    color: T.text,
    fontWeight: "900",
    fontSize: 16
  }
});
