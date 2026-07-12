import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// Path to durable local storage file
const DB_FILE_PATH = path.join(process.cwd(), "goodsale_persistent_db.json");

// In-memory fallback if writing fails
let inMemoryDB: any = null;

// Initialize Supabase if keys exist
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = (supabaseUrl && supabaseAnonKey) ? createClient(supabaseUrl, supabaseAnonKey) : null;

export async function GET() {
  // 1. Try pulling state from Supabase Database
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("market_state")
        .select("state")
        .eq("id", 1)
        .single();
      
      if (!error && data && data.state) {
        return NextResponse.json({ success: true, state: data.state, source: "supabase-db" });
      }

      // 2. Try pulling state from Supabase Cloud Storage
      const { data: fileData, error: fileError } = await supabase
        .storage
        .from("goodsale-data")
        .download("database.json");

      if (!fileError && fileData) {
        const text = await fileData.text();
        const state = JSON.parse(text);
        return NextResponse.json({ success: true, state, source: "supabase-storage" });
      }
    } catch (supabaseError) {
      console.warn("Supabase query failed, falling back to local storage:", supabaseError);
    }
  }

  // 3. Fallback to Local Filesystem
  try {
    if (fs.existsSync(DB_FILE_PATH)) {
      const data = await fs.promises.readFile(DB_FILE_PATH, "utf-8");
      const state = JSON.parse(data);
      return NextResponse.json({ success: true, state, source: "local-file" });
    }
  } catch (error) {
    console.error("Error reading persistent database file:", error);
  }

  // 4. Fallback to Memory
  if (inMemoryDB) {
    return NextResponse.json({ success: true, state: inMemoryDB, source: "memory" });
  }

  return NextResponse.json({ success: false, message: "No persistent data found" });
}

export async function POST(req: NextRequest) {
  try {
    const { state } = await req.json();
    if (!state) {
      return NextResponse.json({ success: false, error: "State is required" }, { status: 400 });
    }

    inMemoryDB = state;

    let supabasePersistedDb = false;
    let supabasePersistedStorage = false;

    // 1. Save to Supabase Cloud Database & Storage if configured
    if (supabase) {
      try {
        // Upsert state into "market_state" table
        const { error: dbError } = await supabase
          .from("market_state")
          .upsert({ id: 1, state, updated_at: new Date().toISOString() });
        
        if (!dbError) {
          supabasePersistedDb = true;
        } else {
          console.warn("Supabase db upsert failed, table may not exist:", dbError.message);
        }

        // Upload/Overwrite state file in "goodsale-data" Storage bucket
        const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
        const { error: storageError } = await supabase
          .storage
          .from("goodsale-data")
          .upload("database.json", blob, { upsert: true });

        if (!storageError) {
          supabasePersistedStorage = true;
        } else {
          console.warn("Supabase storage upload failed, bucket may not exist:", storageError.message);
        }
      } catch (err: any) {
        console.warn("Failed to synchronize with Supabase services:", err.message);
      }
    }

    // 2. Always write to local filesystem as a reliable backup
    try {
      await fs.promises.writeFile(DB_FILE_PATH, JSON.stringify(state, null, 2), "utf-8");
      return NextResponse.json({ 
        success: true, 
        persisted: supabase ? "supabase-and-file" : "file",
        supabaseDb: supabasePersistedDb,
        supabaseStorage: supabasePersistedStorage
      });
    } catch (fsError) {
      console.warn("Could not write to local filesystem, falling back to memory:", fsError);
      return NextResponse.json({ 
        success: true, 
        persisted: "memory",
        supabaseDb: supabasePersistedDb,
        supabaseStorage: supabasePersistedStorage
      });
    }
  } catch (error: any) {
    console.error("Error writing to database:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
