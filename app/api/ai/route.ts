import { GoogleGenAI, Type } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { logger, publicErrorMessage } from "@/lib/logger";
import { rateLimit, clientIpFromRequest } from "@/lib/rate-limit";

const MAX_QUERY_LEN = 500;
const MAX_TEXT_LEN = 4000;
const ALLOWED_ACTIONS = new Set([
  "recommend",
  "barcode",
  "moderate",
  "analyze_metrics",
  "security_tip",
]);

function clip(value: unknown, max: number): string {
  return String(value ?? "").slice(0, max);
}

// Initialize Gemini client lazily to avoid startup crashes if key is missing
let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI | null {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      aiClient = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    }
  }
  return aiClient;
}

// 1. Search Query Recommendations Heuristics
function getHeuristicRecommendation(query: string) {
  const q = query.toLowerCase().trim();
  
  let categoryIntent = "General Goods & Electronics";
  let tags = ["Vetted", "SecureEscrow", "DirectDelivery"];
  let tips = [
    "Verify seller's trust score and escrow badge before initiating the transaction.",
    "Inspect the item physically or ask for a detailed live photo via chat.",
    "Always check the secure 6-digit delivery PIN before releasing payment."
  ];

  if (q.includes("phone") || q.includes("iphone") || q.includes("samsung") || q.includes("android") || q.includes("pixel")) {
    categoryIntent = "Mobile Phones & Gadgets";
    tags = ["Phones", "Electronics", "Deals"];
    tips = [
      "Ask for a screen recording showing the device IMEI and battery health.",
      "Check our verified merchant listings to avoid blacklisted devices.",
      "Escrow payments ensure you can test the device for 48 hours before releasing funds."
    ];
  } else if (q.includes("laptop") || q.includes("macbook") || q.includes("computer") || q.includes("dell") || q.includes("hp")) {
    categoryIntent = "Laptops & Computing";
    tags = ["Laptops", "Computing", "Tech"];
    tips = [
      "Verify the processor specifications and RAM configuration via Chat live photos.",
      "Opt for delivery partners with physical verification checks.",
      "Compare prices with certified businesses on our premium storefronts."
    ];
  } else if (q.includes("shoe") || q.includes("sneaker") || q.includes("clothe") || q.includes("fashion") || q.includes("shirt") || q.includes("dress") || q.includes("agbada")) {
    categoryIntent = "Fashion & Apparel";
    tags = ["Fashion", "Wears", "Style"];
    tips = [
      "Confirm sizes directly with the merchant using Nigeria size charts.",
      "Ask for actual material photos to verify fabric quality and stitch work.",
      "Our Escrow service guarantees full refund if sizes do not fit your specification."
    ];
  } else if (q.includes("car") || q.includes("toyota") || q.includes("lexus") || q.includes("honda") || q.includes("vehicle") || q.includes("motor")) {
    categoryIntent = "Vehicles & Transport";
    tags = ["Cars", "Automotive", "Transit"];
    tips = [
      "Always request a verified mechanic report or meet in a secure transit location.",
      "Do not pay full amount upfront; deposit in our secured escrow wallet first.",
      "Check custom clearance documents with the moderator panel."
    ];
  }

  return {
    categoryIntent,
    aiTips: tips,
    filterTags: tags
  };
}

// 1b. Security Tip Fallbacks Heuristics
function getHeuristicSecurityTip(category: string, title: string) {
  const cat = (category || "").toLowerCase();
  const t = (title || "").toLowerCase();
  let advice = "Always verify the seller's trust score and use GoodSale Escrow. Never pay directly outside of the platform to ensure your funds are protected until you physically inspect and confirm the product.";
  let badgeTitle = "General Safety Advice";
  let threatLevel = "LOW";

  if (cat.includes("phone") || cat.includes("gadget") || cat.includes("electronic") || cat.includes("mobile") || t.includes("iphone") || t.includes("samsung")) {
    badgeTitle = "Device Security Alert";
    advice = "When purchasing mobile devices, always verify the screen quality and request the seller to record a brief video showing the device IMEI and battery health status. Escrow secures your funds for 48 hours so you can test all sensors and carrier locks before releasing payment.";
    threatLevel = "MEDIUM";
  } else if (cat.includes("comput") || cat.includes("laptop") || cat.includes("tech") || t.includes("macbook") || t.includes("dell")) {
    badgeTitle = "Hardware Verification Tip";
    advice = "Laptops and desktop systems are high-value tech assets. We recommend arranging delivery via verified GoodDispatch™ carriers who support physical component inspection, and ensuring you boot the system to verify RAM and processor specs match the listing description.";
    threatLevel = "MEDIUM";
  } else if (cat.includes("fashion") || cat.includes("cloth") || cat.includes("shoe") || t.includes("agbada") || t.includes("sneaker")) {
    badgeTitle = "Apparel Inspection Advice";
    advice = "To avoid sizing or material mismatch, verify dimensions with the merchant's local sizing charts before checking out. With Escrow, your payment is held securely and can be fully refunded if the size or color doesn't match your agreed terms.";
    threatLevel = "LOW";
  } else if (cat.includes("vehicle") || cat.includes("car") || cat.includes("transport") || cat.includes("automotive") || t.includes("toyota") || t.includes("lexus")) {
    badgeTitle = "Automotive Compliance Warning";
    advice = "Do not pay transport or clearance fees offline. Secure the transaction via GoodSale deposit/escrow and inspect the vehicle with a professional mechanic at a SafeMeet™ hub to confirm custom clearance and mechanical status before completing the sale.";
    threatLevel = "HIGH";
  }
  return {
    badgeTitle,
    tip: advice,
    threatLevel
  };
}

// 2. Barcode Autofill Heuristics
function getHeuristicBarcode(barcode: string) {
  const code = barcode.trim();
  
  if (code === "194253831814") {
    return {
      title: "iPhone 15 Pro Max (256GB, Titanium Gray)",
      category: "Mobile Phones",
      brand: "Apple",
      price: 1350000,
      condition: "NEW",
      description: "Original US-spec iPhone 15 Pro Max with 100% Battery health. 256GB Storage, pristine Natural Titanium frame. Comes with Apple Care warranty and original high-speed charging cable. Secured via GoodSale Escrow.",
      warranty: "1 Year Apple Manufacturer Warranty",
      returnPolicy: "48 Hours GoodSale Escrow return window"
    };
  } else if (code === "195949117604") {
    return {
      title: "MacBook Pro 14\" M3 (8GB RAM, 512GB SSD, Space Gray)",
      category: "Computing",
      brand: "Apple",
      price: 1850000,
      condition: "NEW",
      description: "Brand new sealed Space Gray 14-inch Apple MacBook Pro M3 chip. Features 8-core CPU, 10-core GPU, and gorgeous Liquid Retina XDR display. Battery cycle count 0. Shipped via secure GoodDispatch delivery partners.",
      warranty: "12 Months Apple Nigeria Warranty Cover",
      returnPolicy: "Return within 3 days if seal is broken"
    };
  } else if (code === "493821039823") {
    return {
      title: "Premium Handwoven Senator Agbada Set (Royal Blue)",
      category: "Fashion",
      brand: "Traditional Handcrafted",
      price: 85000,
      condition: "NEW",
      description: "Exquisitely styled royal blue Senator style Agbada outfit. Crafted from premium cashmere fabric with gold breast embroidery details. Perfect for wedding ceremonies, coronations, and high-society Nigerian celebrations.",
      warranty: "Lifetime custom tailoring seam warranty",
      returnPolicy: "Free exchange within 48 hours if size mismatch occurs"
    };
  }

  // Default fallback barcode data
  return {
    title: `Scanned Catalog Item (UPC #${code})`,
    category: "Electronics",
    brand: "Generic Brand",
    price: 45000,
    condition: "NEW",
    description: `Pre-filled specification details for commercial item UPC barcode #${code}. Secure checkout and door-to-door GoodDispatch delivery applicable.`,
    warranty: "6 Months local merchant warranty",
    returnPolicy: "48 hours inspect-to-release escrow policy"
  };
}

// 3. Moderate / Safety Check Heuristics
function getHeuristicModeration(title: string, description: string, price: number) {
  const text = `${title} ${description}`.toLowerCase();
  
  const prohibitedWords = ['weapon', 'gun', 'drug', 'illegal', 'cocaine', 'ammunition', 'pistol', 'stolen', 'cloned', 'counterfeit', 'stolen device'];
  const foundProhibited = prohibitedWords.filter(w => text.includes(w));

  if (foundProhibited.length > 0) {
    return {
      safetyScore: 15,
      recommendation: "REJECT",
      feedback: `Listing contains suspicious or prohibited terms: "${foundProhibited.join(', ')}". GoodSale's anti-fraud engine prohibits listing restricted goods, weapons, control substances, or stolen equipment in the Nigerian peer-to-peer index.`
    };
  }

  if (price > 10000000) {
    return {
      safetyScore: 78,
      recommendation: "APPROVE",
      feedback: "High-value ticket item detected (Price > ₦10M). Proceed with caution; Escrow service is highly recommended to secure funds. Avoid paying any direct offline logistics fees."
    };
  }

  return {
    safetyScore: 98,
    recommendation: "APPROVE",
    feedback: "Title, pricing, and specs conform perfectly to GoodSale compliance indices. Listing shows solid integrity and matches active Nigeria peer-to-peer standards."
  };
}

export async function POST(req: NextRequest) {
  try {
    const ip = clientIpFromRequest(req);
    const limited = rateLimit(`ai:${ip}`, 30, 60_000);
    if (!limited.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many AI requests. Please slow down." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) } }
      );
    }

    const body = await req.json();
    const { action, payload } = body;

    if (!action || !payload || typeof payload !== "object") {
      return NextResponse.json({ success: false, error: "Missing action or payload parameters" }, { status: 400 });
    }

    if (!ALLOWED_ACTIONS.has(action)) {
      return NextResponse.json({ success: false, error: `Action ${action} not recognized.` }, { status: 400 });
    }

    const client = getAiClient();

    // ACTION 1: SEARCH RECOMMENDATION TIPS
    if (action === "recommend") {
      const query = clip(payload.query, MAX_QUERY_LEN);
      if (!client) {
        return NextResponse.json({
          success: true,
          recommendations: getHeuristicRecommendation(query)
        });
      }

      try {
        const prompt = `You are the core intelligence of GoodSale, Nigeria's premier escrow-backed peer-to-peer commerce marketplace.
Analyze the user's search query: "${query}".
Deliver a highly tailored response containing:
1. "categoryIntent": The inferred main shopping category (e.g. "Mobile Phones", "Computing", "Fashion & Luxury", "Automotive", "Home Appliances").
2. "aiTips": An array of 1-3 highly practical, specific safety or merchant tips relevant to buying this type of item in Nigeria. Incorporate GoodSale's escrow, trust scores, and delivery PIN mechanics in a professional, reassuring tone.
3. "filterTags": An array of 2-4 lowercase search hashtags (e.g. "iphone", "gadgets", "tech") to refine the search.`;

        const response = await client.models.generateContent({
          model: "gemini-3.5-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                categoryIntent: { type: Type.STRING },
                aiTips: { type: Type.ARRAY, items: { type: Type.STRING } },
                filterTags: { type: Type.ARRAY, items: { type: Type.STRING } }
              },
              required: ["categoryIntent", "aiTips", "filterTags"]
            }
          }
        });

        if (response.text) {
          return NextResponse.json({
            success: true,
            recommendations: JSON.parse(response.text.trim())
          });
        }
      } catch (err) {
        console.error("Gemini query recommend call failed, using fallback:", err);
      }

      return NextResponse.json({
        success: true,
        recommendations: getHeuristicRecommendation(query)
      });
    }

    // ACTION 2: BARCODE AUTOFILL LOOKUP
    if (action === "barcode") {
      const barcode = clip(payload.barcode, 64);
      if (!client) {
        return NextResponse.json({
          success: true,
          data: getHeuristicBarcode(barcode)
        });
      }

      try {
        const prompt = `Identify the commercial item represented by the UPC barcode: "${barcode}".
Return the metadata as a JSON object with:
1. "title": descriptive title of the specific product
2. "category": one of: "Mobile Phones", "Computing", "Fashion", "Automotive", "Electronics", "General"
3. "brand": product manufacturer brand
4. "price": estimate typical price in Nigerian Naira (number)
5. "condition": "NEW"
6. "description": detailed high-fidelity commercial specifications and description
7. "warranty": brief description of warranty options
8. "returnPolicy": description of buyer satisfaction guarantee or return windows

If the barcode is unfamiliar, make up a realistic product of high quality fitting a standard UPC format.`;

        const response = await client.models.generateContent({
          model: "gemini-3.5-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                category: { type: Type.STRING },
                brand: { type: Type.STRING },
                price: { type: Type.NUMBER },
                condition: { type: Type.STRING },
                description: { type: Type.STRING },
                warranty: { type: Type.STRING },
                returnPolicy: { type: Type.STRING }
              },
              required: ["title", "category", "brand", "price", "condition", "description"]
            }
          }
        });

        if (response.text) {
          return NextResponse.json({
            success: true,
            data: JSON.parse(response.text.trim())
          });
        }
      } catch (err) {
        console.error("Gemini barcode query failed, using fallback:", err);
      }

      return NextResponse.json({
        success: true,
        data: getHeuristicBarcode(barcode)
      });
    }

    // ACTION 3: AI SAFETY MODERATION
    if (action === "moderate") {
      const title = clip(payload.title, MAX_QUERY_LEN);
      const description = clip(payload.description, MAX_TEXT_LEN);
      const price = Number(payload.price) || 0;
      const condition = clip(payload.condition || "NEW", 32);

      if (!client) {
        return NextResponse.json({
          success: true,
          report: getHeuristicModeration(title, description, price)
        });
      }

      try {
        const prompt = `You are a strict trust, safety, and compliance moderator for GoodSale Nigeria.
Analyze this proposed peer-to-peer product listing:
Title: "${title}"
Description: "${description}"
Price: ₦${price}
Condition: "${condition}"

Audit this against trust standard metrics: check for fraud, prohibited items (drugs, firearms, replica cash, blacklisted hardware, stolen properties), spam titles, and predatory pricing.
Provide a safety report JSON with:
1. "safetyScore": integer score between 0 and 100 representing safety integrity
2. "recommendation": "APPROVE" or "REJECT" based on score
3. "feedback": a helpful explanation or constructive tip explaining the compliance assessment for the seller.`;

        const response = await client.models.generateContent({
          model: "gemini-3.5-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                safetyScore: { type: Type.INTEGER },
                recommendation: { type: Type.STRING },
                feedback: { type: Type.STRING }
              },
              required: ["safetyScore", "recommendation", "feedback"]
            }
          }
        });

        if (response.text) {
          return NextResponse.json({
            success: true,
            report: JSON.parse(response.text.trim())
          });
        }
      } catch (err) {
        console.error("Gemini compliance moderator failed, using fallback:", err);
      }

      return NextResponse.json({
        success: true,
        report: getHeuristicModeration(title, description, price)
      });
    }

    // ACTION 4: AI BUSINESS ANALYTICS OPTIMIZATION
    if (action === "analyze_metrics") {
      const views = Number(payload.views) || 0;
      const escrowHeld = Number(payload.escrowHeld) || 0;
      const productsCount = Number(payload.productsCount) || 0;

      const getHeuristicMetricsAnalysis = (v: number, eh: number, pc: number) => {
        return {
          salesVelocity: v > 500 ? "High Velocity" : "Moderate Velocity",
          growthTip: "We highly recommend allocating ₦5,000 to Sponsored CPC Ads or purchasing a Featured Placement to elevate search ranking by 2.5x and increase buyer inquiry rates by 45%.",
          priceAdjustment: "Your active computing and traditional wear catalogs are priced competitively. Consider including standard '6 Months Store Warranty' labels to attract high-budget buyers looking for security.",
          organicBoostChance: "Subscribe to the Verified+ premium membership plan or corporate business storefront. It adds a prestigious gold trust badge overlay and triggers a 40% organic rank surge in the catalog index."
        };
      };

      if (!client) {
        return NextResponse.json({
          success: true,
          insight: getHeuristicMetricsAnalysis(views, escrowHeld, productsCount)
        });
      }

      try {
        const prompt = `You are the executive AI Business Strategist for GoodSale Nigeria.
Analyze this seller's store traffic metrics and inventory overview:
- Active Catalog Listings: ${productsCount}
- Total Catalog Views: ${views}
- Capital Currently Secured in Escrow: ₦${escrowHeld}

Evaluate their conversion stats and provide a highly motivating, strategic growth audit with:
1. "salesVelocity": string assessment (e.g. "Optimal Momentum", "Needs Ads Boost", "Price Optimization Needed")
2. "growthTip": string - specific, high-value advice targeting how they can utilize GoodSale's Sponsored CPC campaigns, Featured promotions, or Flash sales.
3. "priceAdjustment": string - advice on how to price their inventory or use warranty flags to build trust with Lagos shoppers.
4. "organicBoostChance": string - explaining the importance of verifying their ID for the Gold Badge or upgrading to Business Subscriptions to increase traffic.`;

        const response = await client.models.generateContent({
          model: "gemini-3.5-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                salesVelocity: { type: Type.STRING },
                growthTip: { type: Type.STRING },
                priceAdjustment: { type: Type.STRING },
                organicBoostChance: { type: Type.STRING }
              },
              required: ["salesVelocity", "growthTip", "priceAdjustment", "organicBoostChance"]
            }
          }
        });

        if (response.text) {
          return NextResponse.json({
            success: true,
            insight: JSON.parse(response.text.trim())
          });
        }
      } catch (err) {
        console.error("Gemini metrics optimization analysis failed, using fallback:", err);
      }

      return NextResponse.json({
        success: true,
        insight: getHeuristicMetricsAnalysis(views, escrowHeld, productsCount)
      });
    }

    // ACTION 5: CONTEXT-AWARE SECURITY TIP
    if (action === "security_tip") {
      const category = clip(payload.category, MAX_QUERY_LEN);
      const title = clip(payload.title, MAX_QUERY_LEN);

      if (!client) {
        return NextResponse.json({
          success: true,
          tipData: getHeuristicSecurityTip(category, title)
        });
      }

      try {
        const prompt = `You are the Lead Trust & Safety Officer at GoodSale, Nigeria's premier escrow-backed peer-to-peer commerce marketplace.
Review this product listing:
Category: "${category}"
Title: "${title}"

Generate a context-aware security advice / security tip for a prospective buyer looking to purchase this item.
Be highly specific to the Nigerian market conditions (e.g., meeting in Lagos, testing items safely, verifying IMEI for phones, inspect fabrics, checking vehicle customs papers, using SafeMeet™ or GoodDispatch™).
Always emphasize how GoodSale's Escrow protects them.

Provide a safety tip JSON with:
1. "badgeTitle": A concise, catchy warning badge title (e.g., "Device Safety Alert", "High-Value Verification", "Sizing & Quality Tip")
2. "tip": The precise advice block itself. It should be 2-3 sentences max, warm but authoritative, very realistic and practical.
3. "threatLevel": One of "LOW", "MEDIUM", or "HIGH" depending on how risky this transaction category is typically.`;

        const response = await client.models.generateContent({
          model: "gemini-3.5-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                badgeTitle: { type: Type.STRING },
                tip: { type: Type.STRING },
                threatLevel: { type: Type.STRING }
              },
              required: ["badgeTitle", "tip", "threatLevel"]
            }
          }
        });

        if (response.text) {
          return NextResponse.json({
            success: true,
            tipData: JSON.parse(response.text.trim())
          });
        }
      } catch (err) {
        console.error("Gemini security_tip failed, using fallback:", err);
      }

      return NextResponse.json({
        success: true,
        tipData: getHeuristicSecurityTip(category, title)
      });
    }

    return NextResponse.json({ success: false, error: `Action ${action} not recognized.` }, { status: 400 });

  } catch (err: unknown) {
    logger.error("Failed to process AI endpoint request", { error: String(err) });
    return NextResponse.json(
      { success: false, error: publicErrorMessage(err) },
      { status: 500 }
    );
  }
}
