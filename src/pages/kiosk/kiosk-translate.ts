/**
 * Kiosk menu name translation (AR -> EN).
 *
 * The POS catalog is authored in Arabic only (products table has no `name_en`),
 * so when a kiosk guest switches to English the menu used to stay Arabic.
 * This module provides a deterministic, offline, professional translation layer:
 *
 *   1. Exact phrase overrides (categories / well-known items) — highest quality.
 *   2. Longest-match phrase dictionary over normalized tokens (3-gram -> 1-gram).
 *   3. Light post-processing (word order for "Meal", title casing, spacing).
 *
 * It is READ-ONLY / display-only: nothing here touches order payloads, which
 * always keep the original Arabic name for the kitchen, cashier and receipts.
 */

const normalize = (s: string) =>
  s
    .replace(/[\u064B-\u0652\u0670\u0640]/g, "") // tashkeel + tatweel
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/\s+/g, " ")
    .trim();

/* ------------------------------------------------------------------ */
/* 1. Exact full-name overrides                                        */
/* ------------------------------------------------------------------ */

const EXACT: Record<string, string> = {
  // ---- Categories ----
  "بروست فردي": "Single Broast",
  "بروست فردي مشوي": "Single Grilled Broast",
  "كرسبي فردي": "Single Crispy",
  "جوسي كريسبي": "Juicy Crispy",
  "عصائر طبيعيه": "Fresh Juices",
  "وجبات اريزكو": "Arizco Meals",
  "وجبات فرديه": "Single Meals",
  "وجبات عائليه بروست": "Broast Family Meals",
  "وجبات الاطفال": "Kids Meals",
  "وجبات اجنحه": "Wings Meals",
  "كرسبي + بروست": "Crispy + Broast",
  "كرسبي+كرنشي": "Crispy + Crunchy",
  "كرنشي عائلي": "Family Crunchy",
  "كريسبي عائلي": "Family Crispy",
  "مكس عائلي بروست + كرنشي": "Family Mix — Broast + Crunchy",
  "جبنه سائله": "Cheese Sauce",
  "مشروبات ساخنه": "Hot Drinks",
  "مشروبات باردة": "Cold Drinks",
  "مشروبات بارده": "Cold Drinks",
  "الاضافات": "Add-ons",
  "اضافه قطع": "Extra Pieces",
  "عرض توجيهي 2026": "Orientation Offer 2026",
  "السلطات": "Salads",
  "بطاطا": "Fries",
  "بيتزا": "Pizza",
  "برغر": "Burger",
  "عروض": "Offers",
  "موهيتو": "Mojito",
  "سموذي": "Smoothie",
  "بوظه": "Ice Cream",
  "ميلك شيك": "Milkshake",
  "صوصات": "Sauces",
  "حلويات": "Desserts",
  "سندويشات": "Sandwiches",
  "مشروبات": "Drinks",

  // ---- Frequent items ----
  "حلقات البصل": "Onion Rings",
  "بطاطا اصابع": "French Fries",
  "بطاطا بروست": "Broast Fries",
  "هاش براون": "Hash Brown",
  "كولسلو": "Coleslaw",
  "متومه": "Garlic Dip",
  "خبز متوم": "Garlic Bread",
  "خبز": "Bread",
  "كيلو خبز": "1 Kg Bread",
  "نص كيلو خبز": "½ Kg Bread",
  "صحن رز مع صوص": "Rice Plate with Sauce",
  "تويستر": "Twister",
  "ودجز": "Potato Wedges",
  "كريس كتس": "Criss-Cut Fries",
  "سلطه يونانيه": "Greek Salad",
  "سلطه سيزر كرسبي": "Crispy Caesar Salad",
  "سلطه سيزر مسحب مشوي": "Grilled Pulled Chicken Caesar Salad",
  "سلطه ديناميت": "Dynamite Salad",
  "سلطه فرايز تشكن": "Fries & Chicken Salad",
  "عسل وزنجبيل": "Honey & Ginger",
  "زهورات": "Herbal Tea",
  "يانسون": "Anise Tea",
  "سحلب": "Sahlab",
  "قهوه": "Coffee",
  "شاي": "Tea",
  "شاي اخضر": "Green Tea",
  "شاي لاتيه": "Tea Latte",
  "لبن صافي": "Ayran (Safi)",
  "لبن عيران بينار": "Ayran (Pinar)",
  "مياه": "Water",
  "صودا": "Soda",
  "سنجل سبريسو": "Single Espresso",
  "دبل سبريسو": "Double Espresso",
  "اسبريسو": "Espresso",
  "امريكانو": "Americano",
  "فلات وايت": "Flat White",
  "فرنش فانيلا": "French Vanilla",
  "ريستريتو": "Ristretto",
  "لونغو": "Lungo",
  "ماكياتو": "Macchiato",
  "موكا": "Mocha",
  "لاتيه": "Latte",
  "كوارتو": "Quarto",
  "فتوتشيني": "Fettuccine",
  "طربوش": "Tarboush",
  "فتاشه": "Fatasha",
  "وردة": "Rose",
  "بون بون": "Bonbon",
  "مارشميلو": "Marshmallow",
  "ماكرون": "Macaron",
  "مصاصه كيك": "Cake Pop",
  "كاسات اوريو": "Oreo Cups",
  "موس شوكولاته": "Chocolate Mousse",
  "سان سيباستيان": "San Sebastián Cheesecake",
  "تريليتشيا": "Tres Leches",
  "تشيز كيك": "Cheesecake",
  "بار كيك": "Cake Bar",
  "كب كيك": "Cupcake",
  "كيك بوظه": "Ice Cream Cake",
  "قرطوس بوظه": "Ice Cream Cone",
  "كره بوظه": "Ice Cream Scoop",
  "كرتين بوظه": "2 Ice Cream Scoops",
  "بوظه كبير": "Large Ice Cream",
  "اضافات للبوظه": "Ice Cream Toppings",
  "مشروب البوبا": "Boba Drink",
  "سمارتيز": "Smarties",
  "بودنج": "Pudding",
  "بودنج كندر": "Kinder Pudding",
  "تارت": "Tart",
  "دونات": "Donut",
  "مكرمله": "Caramelized",
  "ماجنوم كيك": "Magnum Cake",
  "كيكه دبي": "Dubai Cake",
  "كيكه شوكولاته": "Chocolate Cake",
  "كيك فريرو": "Ferrero Cake",
  "كيك فراوله": "Strawberry Cake",
  "كيك بستاشيو": "Pistachio Cake",
  "شات صغير": "Small Shat",
  "شات كبير": "Large Shat",
  "شات كبير اسود": "Large Black Shat",
  "سابرينا": "Sabrina",
  "كاندي": "Candy",
  "علبه كاندي": "Candy Box",
  "بيتزا الفصول الاربعه": "Four Seasons Pizza",
  "بيتزا مارجريتا": "Margherita Pizza",
  "بيتزا سلامي": "Salami Pizza",
  "بيتزا نقانق": "Sausage Pizza",
  "بيتزا الخضار": "Vegetable Pizza",
  "بيتزا البيستو": "Pesto Pizza",
  "بيتزا روست بيف": "Roast Beef Pizza",
  "بيتزا نصفين مع كرسبي": "Half & Half Pizza with Crispy",
  "بيتزا نصفين بدون كرسبي": "Half & Half Pizza without Crispy",
  "بيتزا الملكي مع خضار": "Malaky Pizza with Vegetables",
  "بيتزا الملكي بدون خضار": "Malaky Pizza without Vegetables",
  "بيتزا الملكي سبايسي": "Spicy Malaky Pizza",
  "بيتزا اسطوره دجاج الفريدو": "Legend Alfredo Chicken Pizza",
  "بيتزا اسطوره دجاج الباربكيو": "Legend BBQ Chicken Pizza",
  "بيتزا اسطوره دجاج الرانش": "Legend Ranch Chicken Pizza",
  "بيتزا اسطوره دجاج الهلابينو": "Legend Jalapeño Chicken Pizza",
  "برغر بيف الملكي فريش": "Malaky Fresh Beef Burger",
  "برغر بيف الملكي دبل": "Malaky Double Beef Burger",
  "برغر بيف الملكي تربل": "Malaky Triple Beef Burger",
  "برغر بيف الفريدو": "Alfredo Beef Burger",
  "برغر روست بيف": "Roast Beef Burger",
  "برغر كرسبي": "Crispy Burger",
  "برغر كرنشي": "Crunchy Burger",
  "سندويشه بطاطا": "Fries Sandwich",
  "سندويشه شنيتسل": "Schnitzel Sandwich",
  "سندويشه نقانق": "Sausage Sandwich",
  "سمك فيليه 4قطع": "Fish Fillet — 4 Pieces",
  "سمك فيليه 6قطع": "Fish Fillet — 6 Pieces",
  "علبه جبنه سائله": "Cheese Sauce Cup",
  "علبه صوص بندوره": "Tomato Sauce Cup",
  "علبه صوص حار-شطه": "Hot Chili Sauce Cup",
  "علبه بطاطا صغير+ جبنه سائله": "Small Fries + Cheese Sauce",
  "باريكيو صوص": "BBQ Sauce",
  "رانش صوص": "Ranch Sauce",
  "سويت تشيلي صوص": "Sweet Chili Sauce",
  "تشيلي صوص": "Chili Sauce",
  "سيراتشا صوص": "Sriracha Sauce",
  "صوص بافلو": "Buffalo Sauce",
  "ملكي صوص": "Malaky Sauce",
  "جوسي شطه": "Juicy Hot Chili",
  "جوسي ملكي صوص": "Juicy Malaky Sauce",
  "جوسي باريكيو": "Juicy BBQ",
  "جوسي بروست": "Juicy Broast",
  "جوسي بروست مشوي": "Juicy Grilled Broast",
  "جوسي كرسبي مشكل": "Mixed Juicy Crispy",
  "جوسي كرسبي بالجبنه السائله": "Juicy Crispy with Cheese Sauce",
  "جوسي تشيلي حار صوص": "Juicy Hot Chili Sauce",
  "جوسي سويت تشيلي صوص": "Juicy Sweet Chili Sauce",
  "هلبينو": "Jalapeño",
  "مسحب مشوي": "Grilled Pulled Chicken",
  "مسحب كرنشي": "Crunchy Pulled Chicken",
  "طابه": "Ball",
  "كيكه احمد الزامل": "Ahmad Al-Zamel Cake",
  "وردة": "Rose Dessert",
};

/** All dictionary keys are matched after normalization. */
const normalizeKeys = (src: Record<string, string>) => {
  const out: Record<string, string> = {};
  Object.entries(src).forEach(([k, v]) => { out[normalize(k)] = v; });
  return out;
};

/* ------------------------------------------------------------------ */
/* 2. Phrase / word dictionary (longest match wins)                    */
/* ------------------------------------------------------------------ */

const PHRASES: Record<string, string> = {
  // multi-word first (matched as 3/2-grams)
  "ميلك شيك": "Milkshake",
  "هاش براون": "Hash Brown",
  "مس فلورا": "Passion Fruit",
  "مسفلورا": "Passion Fruit",
  "بلاك بيري": "Blackberry",
  "بلو بيري": "Blueberry",
  "مكس بيري": "Mixed Berry",
  "سويت تشيلي": "Sweet Chili",
  "روست بيف": "Roast Beef",
  "فواكه استوائيه": "Tropical Fruits",
  "ايسد كوفي": "Iced Coffee",
  "ايسد تي": "Iced Tea",
  "حلقات البصل": "Onion Rings",
  "بطاطا اصابع": "French Fries",
  "ترتر بلو": "Blue Glitter",
  "ترتر وردي": "Pink Glitter",

  // singles
  "بروست": "Broast",
  "كرسبي": "Crispy",
  "كريسبي": "Crispy",
  "كرنشي": "Crunchy",
  "جوسي": "Juicy",
  "مسحب": "Pulled Chicken",
  "مشوي": "Grilled",
  "مشويه": "Grilled",
  "مقلي": "Fried",
  "قطعه": "Piece",
  "قطع": "Pieces",
  "قطعتين": "2 Pieces",
  "وجبه": "Meal",
  "وجبات": "Meals",
  "نصف": "Half",
  "نص": "Half",
  "فردي": "Single",
  "فرديه": "Single",
  "عائلي": "Family",
  "عائليه": "Family",
  "مشكل": "Mixed",
  "مكس": "Mix",
  "سفينه": "Fillet",
  "سفينتين": "2 Fillets",
  "سفاين": "Fillets",
  "ورك": "Thigh",
  "وركين": "2 Thighs",
  "فخده": "Drumstick",
  "فخاد": "Drumsticks",
  "جناح": "Wing",
  "اجنحه": "Wings",
  "صدر": "Breast",
  "دجاج": "Chicken",
  "لحمه": "Beef",
  "بيف": "Beef",
  "ارز": "Rice",
  "رز": "Rice",
  "بطاطا": "Fries",
  "اصابع": "Fingers",
  "بصل": "Onion",
  "خضار": "Vegetables",
  "بيتزا": "Pizza",
  "برغر": "Burger",
  "اسطوره": "Legend",
  "الفريدو": "Alfredo",
  "الرانش": "Ranch",
  "رانش": "Ranch",
  "الباربكيو": "BBQ",
  "باربكيو": "BBQ",
  "باربيكيو": "BBQ",
  "باريكيو": "BBQ",
  "الهلابينو": "Jalapeño",
  "هالابينو": "Jalapeño",
  "هلبينو": "Jalapeño",
  "سبايسي": "Spicy",
  "شنيتسل": "Schnitzel",
  "نقانق": "Sausage",
  "سلامي": "Salami",
  "مارجريتا": "Margherita",
  "البيستو": "Pesto",
  "نصفين": "Half & Half",
  "سندويشه": "Sandwich",
  "ساندويش": "Sandwich",
  "تورتيلا": "Tortilla",
  "بومر": "Boomer",
  "اريزكو": "Arizco",
  "الملكي": "Malaky",
  "ملكي": "Malaky",
  "سلطه": "Salad",
  "يونانيه": "Greek",
  "سيزر": "Caesar",
  "ديناميت": "Dynamite",
  "كولسلو": "Coleslaw",
  "متومه": "Garlic Dip",
  "متوم": "Garlic",
  "خبز": "Bread",
  "كيلو": "Kg",
  "علبه": "Box",
  "صحن": "Plate",
  "سطل": "Bucket",
  "قرطوس": "Cone",
  "كره": "Scoop",
  "كرتين": "2 Scoops",
  "صوص": "Sauce",
  "شطه": "Hot Chili",
  "تشيلي": "Chili",
  "حار": "Spicy",
  "عادي": "Regular",
  "عادى": "Regular",
  "بهار": "Seasoning",
  "بهارات": "Seasoning",
  "بدون": "Without",
  "مع": "With",
  "و": "&",
  "استبدال": "Swap",
  "اضافه": "Extra",
  "اضافي": "Extra",
  "اضافات": "Add-ons",
  "الاضافات": "Add-ons",
  "حجم": "Size",
  "الحجم": "Size",
  "نوع": "Type",
  "القطعه": "Piece",
  "الطلب": "Order",
  "الجبنه": "Cheese",
  "جبنه": "Cheese",
  "جبنة": "Cheese",
  "سائله": "Sauce",
  "السائله": "Sauce",
  "كبير": "Large",
  "صغير": "Small",
  "وسط": "Medium",
  "جدا": "Extra",
  "كامل": "Whole",
  "خيارات": "Options",
  "نكهه": "Flavor",
  "نكهات": "Flavors",
  "الكرسبي": "Crispy",
  "الكرنشي": "Crunchy",
  "البروست": "Broast",
  "الاول": "First",
  "الثاني": "Second",
  "الثالث": "Third",
  "عرض": "Offer",
  "توجيهي": "Tawjihi",
  "رمضان1": "Ramadan 1",
  "رمضان2": "Ramadan 2",
  "رمضان3": "Ramadan 3",
  "اطفال": "Kids",
  "الاطفال": "Kids",
  "ميني": "Mini",
  "سمول": "Small",
  "ميديوم": "Medium",
  "لارج": "Large",
  "سمك": "Fish",
  "فيليه": "Fillet",
  "فشافيش": "Popcorn Chicken",
  "بجيت": "Baguette",
  "بندوره": "Tomato",
  "زيرو": "Zero",
  "كولا": "Cola",
  "سما": "Sama",
  "المراعي": "Almarai",
  "عصير": "Juice",
  "عصائر": "Juices",
  "طبيعيه": "Fresh",
  "مشروب": "Drink",
  "مشروبات": "Drinks",
  "ساخنه": "Hot",
  "بارده": "Cold",
  "مياه": "Water",
  "شاي": "Tea",
  "اخضر": "Green",
  "قهوه": "Coffee",
  "لاتيه": "Latte",
  "موهيتو": "Mojito",
  "سموذي": "Smoothie",
  "بوظه": "Ice Cream",
  "حلويات": "Desserts",
  "كيك": "Cake",
  "كيكه": "Cake",
  "دونات": "Donut",
  "ايسد": "Iced",
  "هوت": "Hot",
  "فراوله": "Strawberry",
  "مانجا": "Mango",
  "اناناس": "Pineapple",
  "كيوي": "Kiwi",
  "ليمون": "Lemon",
  "نعنع": "Mint",
  "خوخ": "Peach",
  "رمان": "Pomegranate",
  "بطيخ": "Watermelon",
  "بلوبيري": "Blueberry",
  "جوافه": "Guava",
  "افوكادو": "Avocado",
  "تفاح": "Apple",
  "برتقال": "Orange",
  "عسل": "Honey",
  "زنجبيل": "Ginger",
  "حليب": "Milk",
  "فواكه": "Fruits",
  "كراميل": "Caramel",
  "شوكلت": "Chocolate",
  "شوكولاته": "Chocolate",
  "فانيلا": "Vanilla",
  "نوتيلا": "Nutella",
  "لوتس": "Lotus",
  "اوريو": "Oreo",
  "كندر": "Kinder",
  "بستاشيو": "Pistachio",
  "بندق": "Hazelnut",
  "احمر": "Red",
  "اسود": "Black",
  "ابيض": "White",
  "زهري": "Pink",
  "وردي": "Pink",
  "الفصول": "Seasons",
  "الاربعه": "Four",
};

const EXACT_N = normalizeKeys(EXACT);

const PHRASES_N = normalizeKeys(PHRASES);

const isArabic = (s: string) => /[\u0600-\u06FF]/.test(s);

const titleCase = (s: string) =>
  s.replace(/\b[a-z]/g, (c) => c.toUpperCase());

/** Translate one Arabic menu name to English. Returns null when not translatable. */
export function translateMenuNameToEn(raw?: string | null): string | null {
  const original = (raw || "").trim();
  if (!original) return null;
  if (!isArabic(original)) return original; // already Latin (brand names etc.)

  const norm = normalize(original);
  if (EXACT_N[norm]) return EXACT_N[norm];

  // split while keeping numbers and separators readable
  const spaced = norm
    .replace(/([0-9]+)/g, " $1 ")
    .replace(/([+/×—–-])/g, " $1 ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = spaced.split(" ").filter(Boolean);
  const out: string[] = [];
  let untranslated = 0;
  let arabicTokens = 0;

  for (let i = 0; i < tokens.length; ) {
    let matched = false;
    for (let n = 3; n >= 1; n--) {
      if (i + n > tokens.length) continue;
      const gram = tokens.slice(i, i + n).join(" ");
      const hit = PHRASES_N[gram] ?? EXACT_N[gram];
      if (hit) {
        out.push(hit);
        i += n;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    let tk = tokens[i];
    // conjunction glued to the next word: "ومانجا" -> "&" + "مانجا"
    if (tk.length > 2 && tk.startsWith("و") && (PHRASES_N[tk.slice(1)] || EXACT_N[tk.slice(1)])) {
      out.push("&", (PHRASES_N[tk.slice(1)] || EXACT_N[tk.slice(1)])!);
      i++;
      continue;
    }
    if (/^[0-9]+$/.test(tk) || /^[+/×—–-]$/.test(tk)) out.push(tk);
    else if (!isArabic(tk)) out.push(tk);
    else {
      untranslated++;
      out.push(tk); // keep original word as last resort
    }
    i++;
  }

  tokens.forEach((tk) => { if (isArabic(tk)) arabicTokens++; });

  // If most of the name could not be translated, keep the Arabic original —
  // a half-translated name looks worse than the source.
  if (arabicTokens > 0 && untranslated / Math.max(arabicTokens, 1) > 0.5) return null;

  let text = out.join(" ").replace(/\s+([+&/])\s+/g, " $1 ").replace(/\s{2,}/g, " ").trim();

  // "Meal 12 Pieces Broast" -> "12 Pieces Broast Meal"
  if (/^Meal\s+.+/i.test(text)) text = text.replace(/^Meal\s+/i, "") + " Meal";
  if (/^Box\s+.+/i.test(text)) text = text.replace(/^Box\s+/i, "") + " Box";
  // "Half Meal Crispy" -> "Half Crispy Meal"
  if (/\bMeal\b/.test(text) && !/\bMeal$/.test(text)) text = text.replace(/\s*\bMeal\b\s*/, " ").trim() + " Meal";

  // Arabic puts the adjective after the noun; English puts it before.
  // "Thigh Grilled" -> "Grilled Thigh"  /  "3 Pieces Drumsticks Grilled" -> "3 Pieces Grilled Drumsticks"
  for (const adj of ["Grilled", "Fried"]) {
    const re = new RegExp(`\\s${adj}(\\s+Meal)?$`);
    const m = text.match(re);
    if (!m) continue;
    const tail = m[1] || "";
    let body = text.slice(0, text.length - m[0].length).trim();
    const sep = Math.max(body.lastIndexOf("+"), body.lastIndexOf("&"), body.lastIndexOf("—"));
    const head = sep >= 0 ? body.slice(0, sep + 1) + " " : "";
    let chunk = sep >= 0 ? body.slice(sep + 1).trim() : body;
    const parts = chunk.split(" ");
    parts.splice(Math.max(parts.length - 1, 0), 0, adj);
    text = (head + parts.join(" ")).trim() + tail;
  }

  // "12 Piece Broast" -> "12 Broast Pieces" (natural English ordering)
  text = text.replace(
    /(\d+)\s+Pieces?\s+(Broast|Crispy|Crunchy|Drumsticks?|Thighs?|Fillets?|Wings?|Grilled\s+Broast|Grilled\s+Pulled\s+Chicken|Popcorn\s+Chicken)\b/g,
    (_m, n, kind) => `${n} ${kind} Pieces`,
  );

  // "Extra Piece Crispy" -> "Extra Crispy Piece"
  text = text.replace(
    /\bPiece(s)?\s+(Broast|Crispy|Crunchy|Grilled\s+Broast|Grilled\s+Pulled\s+Chicken)\b/g,
    (_m, plural, kind) => `${kind} Piece${plural || ""}`,
  );

  text = titleCase(text)
    .replace(/\bWith\b/g, "with")
    .replace(/\bWithout\b/g, "without")
    .replace(/\bAnd\b/g, "and");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Display helper: prefers stored English name, then auto-translation, then Arabic. */
export function displayName(lang: "ar" | "en", name?: string | null, nameEn?: string | null): string {
  if (lang !== "en") return name || nameEn || "";
  if (nameEn && nameEn.trim()) return nameEn;
  return translateMenuNameToEn(name) || name || "";
}
