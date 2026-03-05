import fs from "fs";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(import.meta.dirname, "..", ".env") });

const ROOT = path.resolve(import.meta.dirname, "..");
// CLIで --prompts <file> を指定可能（デフォルト: prompts.json）
const promptsArg = process.argv.indexOf("--prompts");
const PROMPTS_FILE = promptsArg !== -1 && process.argv[promptsArg + 1]
  ? path.resolve(import.meta.dirname, process.argv[promptsArg + 1])
  : path.join(import.meta.dirname, "prompts.json");
const SKIP_REFS = promptsArg !== -1;
const CHAR_REFS_DIR = path.join(ROOT, "images", "character-refs");

if (!process.env.GOOGLE_API_KEY) {
  console.error("エラー: GOOGLE_API_KEY が .env に設定されていません");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

// NanobanaPro (Gemini 3 Pro Image)
const MODEL = "gemini-3-pro-image-preview";

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// キャラクターリファレンス定義
const CHARACTER_REFS = [
  {
    id: "sylphi",
    name: "シルフィ",
    prompt: "anime illustration, light novel style, character reference sheet, full body front view, a 15-year-old girl with long silver-gray hair reaching her waist and jade-green eyes, petite and slender build, wearing a simple gray medieval servant dress, a small silver flower-shaped hairpin in her hair, gentle and somewhat melancholic expression, clean white background, high detail anime art style, Japanese light novel illustration quality",
  },
  {
    id: "erich",
    name: "エーリヒ",
    prompt: "anime illustration, light novel style, character reference sheet, full body front view, a 17-year-old young man with golden blonde hair and bright blue eyes, tall and elegant build with refined noble bearing, wearing aristocratic medieval clothing with a blue vest and white shirt, handsome and dignified expression, clean white background, high detail anime art style, Japanese light novel illustration quality",
  },
  {
    id: "rosetta",
    name: "ロゼッタ",
    prompt: "anime illustration, light novel style, character reference sheet, full body front view, a 16-year-old girl with curly red hair in a ponytail and freckles on her cheeks, lively and cheerful expression, wearing a servant dress with an apron, energetic pose, clean white background, high detail anime art style, Japanese light novel illustration quality",
  },
  {
    id: "kaspar",
    name: "カスパル",
    prompt: "anime illustration, light novel style, character reference sheet, full body front view, a 56-year-old man with short salt-and-pepper hair and a scar across his left cheek, large muscular build of a former soldier, wearing simple worn work clothes, stern but kind expression, clean white background, high detail anime art style, Japanese light novel illustration quality",
  },
  {
    id: "irene",
    name: "イレーネ",
    prompt: "anime illustration, light novel style, character reference sheet, full body front view, a woman in her 40s with black hair pulled back tightly in a bun, silver-rimmed glasses, wearing formal dark bureaucratic clothing, sharp analytical expression, strict and composed posture, clean white background, high detail anime art style, Japanese light novel illustration quality",
  },
];

// 各プロンプトに登場するキャラクター（キーワードマッチ）
const CHARACTER_KEYWORDS = {
  sylphi: ["silver-gray hair", "silver-haired", "Sylphi", "jade-green eyes"],
  erich: ["golden-haired", "golden blonde", "Erich", "golden hair"],
  rosetta: ["red hair", "red-haired", "curly red", "Rosetta", "freckles"],
  kaspar: ["salt-and-pepper", "scarred", "Kaspar", "facial scar"],
  irene: ["black hair", "silver-rimmed glasses", "Irene", "tight bun"],
};

// プロンプトからキャラクターを特定
function detectCharacters(prompt) {
  const found = [];
  for (const [charId, keywords] of Object.entries(CHARACTER_KEYWORDS)) {
    if (keywords.some(kw => prompt.toLowerCase().includes(kw.toLowerCase()))) {
      found.push(charId);
    }
  }
  return found;
}

// NanobanaProで画像生成（キャラ参照画像付き）
async function generateImage(prompt, referenceImages, aspectRatio) {
  const parts = [];

  // キャラクター参照画像を添付（NanobanaProは最大5人のキャラクター一貫性をサポート）
  if (referenceImages.length > 0) {
    parts.push({
      text: "以下のキャラクターの外見を正確に再現してイラストを生成してください。キャラクターの髪色、目の色、服装、体格を参照画像と一致させてください。\n\nCharacter references:",
    });
    for (const ref of referenceImages) {
      parts.push({
        inlineData: {
          mimeType: "image/png",
          data: fs.readFileSync(ref.path).toString("base64"),
        },
      });
      parts.push({ text: `(${ref.name})` });
    }
    parts.push({
      text: `\n\nGenerate the following scene illustration:\n${prompt}`,
    });
  } else {
    parts.push({ text: prompt });
  }

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts }],
    config: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: {
        aspectRatio: aspectRatio || "3:4",
      },
    },
  });

  // レスポンスから画像を抽出
  if (response.candidates && response.candidates[0]) {
    const resParts = response.candidates[0].content.parts;
    for (const part of resParts) {
      if (part.inlineData) {
        return Buffer.from(part.inlineData.data, "base64");
      }
    }
  }
  throw new Error("画像がレスポンスに含まれていません");
}

async function main() {
  const prompts = JSON.parse(fs.readFileSync(PROMPTS_FILE, "utf-8"));
  fs.mkdirSync(CHAR_REFS_DIR, { recursive: true });

  console.log(`使用モデル: ${MODEL} (NanobanaPro)`);
  console.log(`プロンプト: ${path.basename(PROMPTS_FILE)}\n`);

  const charRefPaths = {};

  if (!SKIP_REFS) {
    // === Phase 1: キャラクターリファレンス生成（灰の継ぎ手専用） ===
    console.log("=== Phase 1: キャラクターリファレンス生成 ===\n");

    for (const char of CHARACTER_REFS) {
      const refPath = path.join(CHAR_REFS_DIR, `${char.id}.png`);
      charRefPaths[char.id] = refPath;

      if (fs.existsSync(refPath)) {
        console.log(`[リファレンス] スキップ: ${char.name} (既存)`);
        continue;
      }

      console.log(`[リファレンス] 生成中: ${char.name}...`);
      try {
        const buf = await generateImage(char.prompt, [], "3:4");
        fs.writeFileSync(refPath, buf);
        console.log(`  完了: ${char.name} (${(buf.length / 1024).toFixed(0)}KB)`);
      } catch (err) {
        console.error(`  エラー: ${char.name} - ${err.message}`);
      }
      await sleep(3000);
    }
    console.log("");
  }

  // === シーンイラスト生成 ===
  console.log("=== シーンイラスト生成 ===\n");
  console.log(`${prompts.length}枚の画像を生成します\n`);

  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < prompts.length; i++) {
    const item = prompts[i];
    const outputPath = path.join(ROOT, item.output);
    const outputDir = path.dirname(outputPath);

    if (fs.existsSync(outputPath)) {
      console.log(`[${i + 1}/${prompts.length}] スキップ: ${item.output} (既存)`);
      skipped++;
      continue;
    }

    fs.mkdirSync(outputDir, { recursive: true });

    // プロンプトに登場するキャラクターを検出（キャラ参照有効時のみ）
    const refImages = SKIP_REFS ? [] : detectCharacters(item.prompt)
      .filter(id => fs.existsSync(charRefPaths[id]))
      .map(id => ({
        path: charRefPaths[id],
        name: CHARACTER_REFS.find(c => c.id === id)?.name || id,
      }));

    const refNames = refImages.map(r => r.name).join(", ");
    console.log(`[${i + 1}/${prompts.length}] 生成中: ${item.output} (${item.aspect_ratio})${refNames ? ` [参照: ${refNames}]` : ""}`);

    try {
      const imageBuffer = await generateImage(item.prompt, refImages, item.aspect_ratio);
      fs.writeFileSync(outputPath, imageBuffer);
      generated++;
      console.log(`  完了: ${item.output} (${(imageBuffer.length / 1024).toFixed(0)}KB)`);
    } catch (err) {
      failed++;
      console.error(`  エラー: ${item.output} - ${err.message}`);
    }

    await sleep(3000);
  }

  console.log(`\n画像生成完了: ${generated}枚生成、${skipped}枚スキップ、${failed}枚失敗`);
}

main();
