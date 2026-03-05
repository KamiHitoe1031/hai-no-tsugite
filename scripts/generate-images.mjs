import fs from "fs";
import path from "path";
import { fal } from "@fal-ai/client";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(import.meta.dirname, "..", ".env") });

const ROOT = path.resolve(import.meta.dirname, "..");
const PROMPTS_FILE = path.join(import.meta.dirname, "prompts.json");

// fal.ai設定
fal.config({
  credentials: process.env.FAL_KEY,
});

// 一定時間待機
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// WebP画像をダウンロードして保存
async function downloadImage(url, outputPath) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`ダウンロード失敗: ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);
}

async function main() {
  if (!process.env.FAL_KEY) {
    console.error("エラー: FAL_KEY が .env に設定されていません");
    process.exit(1);
  }

  const prompts = JSON.parse(fs.readFileSync(PROMPTS_FILE, "utf-8"));
  console.log(`${prompts.length}枚の画像を生成します\n`);

  let generated = 0;
  let skipped = 0;

  for (let i = 0; i < prompts.length; i++) {
    const item = prompts[i];
    const outputPath = path.join(ROOT, item.output);
    const outputDir = path.dirname(outputPath);

    // 既存ファイルがあればスキップ（冪等性）
    if (fs.existsSync(outputPath)) {
      console.log(`[${i + 1}/${prompts.length}] スキップ: ${item.output} (既存)`);
      skipped++;
      continue;
    }

    fs.mkdirSync(outputDir, { recursive: true });

    console.log(`[${i + 1}/${prompts.length}] 生成中: ${item.output}`);

    try {
      const result = await fal.subscribe("fal-ai/nano-banana-pro", {
        input: {
          prompt: item.prompt,
          aspect_ratio: item.aspect_ratio || "16:9",
          num_images: 1,
          output_format: "webp",
        },
      });

      const imageUrl = result.data.images[0].url;
      await downloadImage(imageUrl, outputPath);
      generated++;
      console.log(`  完了: ${item.output}`);
    } catch (err) {
      console.error(`  エラー: ${item.output} - ${err.message}`);
    }

    // レート制限対策: 1.5秒間隔
    if (i < prompts.length - 1) {
      await sleep(1500);
    }
  }

  console.log(`\n画像生成完了: ${generated}枚生成、${skipped}枚スキップ`);
}

main();
