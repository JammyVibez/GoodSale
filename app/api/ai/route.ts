import { GoogleGenAI, Type } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

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

// Robust fallback analyzer for offline, staging, or missing API key cases
function getHeuristicAnalysis(query: string) {
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
  } else if (q.includes("house") || q.includes("apartment") || q.includes("rent") || q.includes("land") || q.includes("flat")) {
    categoryIntent = "Real Estate & Housing";
    tags = ["Housing", "Properties", "Rentals"];
    tips = [
      "Verify property titles through verified legal moderators.",
      "Never pay inspection fees to unverified brokers outside GoodSale.",
      "Payments are held in Escrow until legal lease documents are signed."
    ];
  }

  return {
    categoryIntent,
    aiTips: tips,
    filterTags: tags
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, payload } = body;

    if (action !== "recommend" || !payload || !payload.query) {
      return NextResponse.json({ success: false, error: "Invalid action or payload" }, { status: 400 });
    }

    const query = payload.query;
    const client = getAiClient();

    if (!client) {
      // Return high-quality heuristic recommendation if API key is not present
      console.log("No GEMINI_API_KEY found, running robust fallback search heuristics.");
      return NextResponse.json({
        success: true,
        recommendations: getHeuristicAnalysis(query)
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
              categoryIntent: {
                type: Type.STRING,
                description: "The main product category of interest."
              },
              aiTips: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Actionable local commerce safety and shopping tips."
              },
              filterTags: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Refining hashtag tags."
              }
            },
            required: ["categoryIntent", "aiTips", "filterTags"]
          }
        }
      });

      const responseText = response.text;
      if (responseText) {
        const parsed = JSON.parse(responseText.trim());
        return NextResponse.json({
          success: true,
          recommendations: parsed
        });
      }
    } catch (apiError) {
      console.error("Gemini API call failed, falling back to heuristics:", apiError);
    }

    // In case of API failure or JSON parsing issue, return high quality heuristics
    return NextResponse.json({
      success: true,
      recommendations: getHeuristicAnalysis(query)
    });

  } catch (err: any) {
    console.error("Failed to process AI search route request:", err);
    return NextResponse.json({ success: false, error: err.message || "Internal Server Error" }, { status: 500 });
  }
}
