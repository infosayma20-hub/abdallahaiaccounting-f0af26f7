// Temporary product image mapping. Replace with real product.image_url from
// the admin panel/database when photos are uploaded.
import broast2 from "@/assets/kiosk/broast-2pcs.jpg.asset.json";
import broast3 from "@/assets/kiosk/broast-3pcs.jpg.asset.json";
import broastSingle from "@/assets/kiosk/broast-single.jpg.asset.json";
import broastBucket from "@/assets/kiosk/broast-bucket.jpg.asset.json";
import grilled from "@/assets/kiosk/grilled.jpg.asset.json";
import crispy from "@/assets/kiosk/crispy.jpg.asset.json";
import fries from "@/assets/kiosk/fries.jpg.asset.json";
import pizza from "@/assets/kiosk/pizza.jpg.asset.json";
import burger from "@/assets/kiosk/burger.jpg.asset.json";
import juice from "@/assets/kiosk/juice.jpg.asset.json";
import family from "@/assets/kiosk/family.jpg.asset.json";

// Ordered: most-specific keywords first.
const RULES: { keys: string[]; url: string }[] = [
  { keys: ["عائل", "دلو", "bucket", "family"], url: family.url },
  { keys: ["مشوي", "مشاوي", "grill"], url: grilled.url },
  { keys: ["بطاط", "فرايز", "fries", "potato"], url: fries.url },
  { keys: ["بيتزا", "pizza"], url: pizza.url },
  { keys: ["برغر", "برجر", "burger"], url: burger.url },
  { keys: ["عصير", "عصائر", "juice"], url: juice.url },
  { keys: ["جوسي", "juicy", "كرسبي", "crispy", "استربس", "strips"], url: crispy.url },
  { keys: ["بروست", "دجاج", "chicken", "broast"], url: broast2.url },
];

const BROAST_FALLBACKS = [broast2.url, broast3.url, broastSingle.url, broastBucket.url];

/**
 * Returns a URL for a kiosk product image.
 * 1. If the product already has a real image_url from the DB, use it.
 * 2. Otherwise, pick a temporary 8K stock image by matching keywords in the name.
 * 3. Fall back to a rotating broast image keyed by product id for variety.
 */
export function kioskImageFor(product: { id: string; name?: string | null; name_en?: string | null; image_url?: string | null }): string {
  if (product.image_url) return product.image_url;
  const hay = `${product.name || ""} ${product.name_en || ""}`.toLowerCase();
  for (const rule of RULES) {
    if (rule.keys.some(k => hay.includes(k.toLowerCase()))) return rule.url;
  }
  let h = 0;
  for (let i = 0; i < product.id.length; i++) h = (h * 31 + product.id.charCodeAt(i)) | 0;
  return BROAST_FALLBACKS[Math.abs(h) % BROAST_FALLBACKS.length];
}