import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = (supabaseUrl && supabaseAnonKey) ? createClient(supabaseUrl, supabaseAnonKey) : null;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const userId = formData.get("userId")?.toString() || "unknown";

    if (!file) {
      return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const fileExtension = file.name.split(".").pop() || "png";
    const fileName = `gov_id_${userId}_${Date.now()}.${fileExtension}`;

    let uploadedUrl = "";
    let uploadSource = "none";

    // 1. Try uploading to Supabase Storage if configured
    if (supabase) {
      try {
        // Try uploading to "government-ids" bucket first
        let { data, error } = await supabase.storage
          .from("government-ids")
          .upload(fileName, fileBuffer, {
            contentType: file.type,
            upsert: true
          });

        // Self-healing: try creating "government-ids" bucket if missing
        if (error && (error.message?.includes("not found") || error.message?.includes("Bucket"))) {
          try {
            console.log("[Self-Healing] Attempting to auto-create 'government-ids' bucket...");
            const { error: createError } = await supabase.storage.createBucket("government-ids", { public: true });
            if (!createError) {
              const retryRes = await supabase.storage
                .from("government-ids")
                .upload(fileName, fileBuffer, {
                  contentType: file.type,
                  upsert: true
                });
              data = retryRes.data;
              error = retryRes.error;
            }
          } catch (bucketCreateErr: any) {
            console.warn("[Self-Healing] Could not auto-create government-ids bucket:", bucketCreateErr.message);
          }
        }

        if (!error && data) {
          const { data: publicUrlData } = supabase.storage
            .from("government-ids")
            .getPublicUrl(fileName);
          uploadedUrl = publicUrlData.publicUrl;
          uploadSource = "supabase-storage";
        } else {
          // Fallback to "goodsale-data" bucket
          let { data: data2, error: error2 } = await supabase.storage
            .from("goodsale-data")
            .upload(`uploads/${fileName}`, fileBuffer, {
              contentType: file.type,
              upsert: true
            });

          // Self-healing: try creating "goodsale-data" bucket if missing
          if (error2 && (error2.message?.includes("not found") || error2.message?.includes("Bucket"))) {
            try {
              console.log("[Self-Healing] Attempting to auto-create 'goodsale-data' bucket during ID upload fallback...");
              const { error: createError } = await supabase.storage.createBucket("goodsale-data", { public: true });
              if (!createError) {
                const retryRes2 = await supabase.storage
                  .from("goodsale-data")
                  .upload(`uploads/${fileName}`, fileBuffer, {
                    contentType: file.type,
                    upsert: true
                  });
                data2 = retryRes2.data;
                error2 = retryRes2.error;
              }
            } catch (bucketCreateErr: any) {
              console.warn("[Self-Healing] Could not auto-create fallback goodsale-data bucket:", bucketCreateErr.message);
            }
          }

          if (!error2 && data2) {
            const { data: publicUrlData } = supabase.storage
              .from("goodsale-data")
              .getPublicUrl(`uploads/${fileName}`);
            uploadedUrl = publicUrlData.publicUrl;
            uploadSource = "supabase-storage-fallback";
          } else {
            console.warn("[Diagnostic] Supabase storage upload failed, using local fallback:", error || error2);
          }
        }
      } catch (err: any) {
        console.warn("[Diagnostic] Supabase storage upload exception, using local fallback:", err.message);
      }
    }

    // 2. If Supabase is not configured or failed, save to public local uploads as backup
    if (!uploadedUrl) {
      try {
        const publicUploadsDir = path.join(process.cwd(), "public", "uploads");
        if (!fs.existsSync(publicUploadsDir)) {
          fs.mkdirSync(publicUploadsDir, { recursive: true });
        }
        const localPath = path.join(publicUploadsDir, fileName);
        await fs.promises.writeFile(localPath, fileBuffer);
        uploadedUrl = `/uploads/${fileName}`;
        uploadSource = "local-file-system";
      } catch (fsError) {
        // Ultimate fallback to data URL base64 representation
        console.warn("Local FS write failed, falling back to base64 Data URL:", fsError);
        const base64Data = fileBuffer.toString("base64");
        uploadedUrl = `data:${file.type};base64,${base64Data}`;
        uploadSource = "base64-fallback";
      }
    }

    return NextResponse.json({
      success: true,
      url: uploadedUrl,
      source: uploadSource,
      fileName
    });
  } catch (error: any) {
    console.error("Error in upload-id route:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
