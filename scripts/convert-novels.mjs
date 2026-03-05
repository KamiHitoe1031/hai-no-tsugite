// 3小説のMarkdownフォーマットをNovel Libraryサイト形式に変換するスクリプト
// 使い方: node scripts/convert-novels.mjs

import fs from "fs";
import path from "path";

const ROOT = path.resolve(import.meta.dirname, "..");
// ソース小説のルートディレクトリ
const NOVELS_ROOT = "O:/AI_/Claudecode/小説執筆に関する考え方/作品";

// 変換対象の定義
const NOVELS = [
  {
    srcDir: "企画1_綴じられた声と七つの鍵",
    destDir: "綴じられた声と七つの鍵",
  },
  {
    srcDir: "企画2_灰色の王冠と嘘つきの薬師",
    destDir: "灰色の王冠と嘘つきの薬師",
  },
  {
    srcDir: "企画3_果ての海と約束の灯台",
    destDir: "果ての海と約束の灯台",
  },
  {
    srcDir: "企画4_嘘と鎖の契約者",
    destDir: "嘘と鎖の契約者",
  },
];

// ファイル名からソート用の番号を取得
function sortNum(filename) {
  const match = filename.match(/^(\d+)_/);
  return match ? parseInt(match[1], 10) : 999;
}

// ファイル名からタイトルを抽出（例: "01_序章_沈黙の始まり.md" → "沈黙の始まり"）
function extractTitle(filename) {
  const match = filename.match(/^\d+_(?:序章|第\d+章|終章)_(.+)\.md$/);
  if (match) return match[1];
  return filename.replace(".md", "");
}

// Markdownの内容をサイト形式に変換
function convertContent(content, chapterNum, title) {
  const lines = content.split("\n");
  const result = [];
  let skipFirstH1 = true;
  let skipChapterH2 = true;
  // ### N を見つけた直後、次の --- もスキップするフラグ
  let skipNextHr = false;
  // 最初のパートマーカー(### 1)かどうか
  let isFirstPart = true;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // `# 作品名` → `# 第XX話　タイトル` に置換
    if (skipFirstH1 && /^# /.test(line)) {
      const padNum = String(chapterNum).padStart(2, "0");
      result.push(`# 第${padNum}話　${title}`);
      skipFirstH1 = false;
      continue;
    }

    // `## 序章「...」` / `## 第X章「...」` / `## 終章「...」` を削除
    // 漢数字にも対応: 第一章, 第十六章 など
    if (skipChapterH2 && /^## (?:序章|第.+章|終章)/.test(line)) {
      skipChapterH2 = false;
      continue;
    }

    // `### 数字` (パート区切り) → 削除
    if (/^### \d+\s*$/.test(trimmed)) {
      if (isFirstPart) {
        // 最初のパート: 前後の --- を両方削除（章開始の区切りなので不要）
        removeTrailingHr(result);
        isFirstPart = false;
      }
      // それ以降のパート: 前の --- は場面転換として残し、### N 行のみ削除
      // 次の --- はスキップ（### N の後の区切り）
      skipNextHr = true;
      continue;
    }

    // `### side: キャラ名の視点` → `## ——キャラ名の視点——`
    const sideMatch = trimmed.match(/^### side:\s*(.+)$/);
    if (sideMatch) {
      // 直前の --- は場面転換として残す
      result.push(`## ——${sideMatch[1]}——`);
      // 次の --- はスキップ（viewpointヘッダの後の区切り）
      skipNextHr = true;
      continue;
    }

    // `### キャラ名の声` 等のh3見出し → `## ——...——`
    if (/^### /.test(trimmed) && !/^### \d/.test(trimmed)) {
      const heading = trimmed.replace(/^### /, "");
      // 直前の --- は場面転換として残す
      result.push(`## ——${heading}——`);
      // 次の --- はスキップ
      skipNextHr = true;
      continue;
    }

    // `---`（水平線）の処理
    if (trimmed === "---") {
      if (skipNextHr) {
        skipNextHr = false;
        continue;
      }
      result.push(line);
      continue;
    }

    // 空行の処理
    if (trimmed === "") {
      // skipNextHr中の空行はそのまま通す（---検出のために次の行を見たい）
      result.push(line);
      continue;
    }

    // その他の行
    skipNextHr = false;
    result.push(line);
  }

  // 後処理: 先頭の不要な --- と空行をクリーンアップ
  let text = result.join("\n");

  // # 第XX話 タイトル の直後にある --- を削除
  text = text.replace(/(# 第\d+話　.+\n)\n*---\n/, "$1\n");

  // 連続する --- を1つに統合
  text = text.replace(/(---\n)\s*\n*---\n/g, "$1");

  // 連続する空行を2行までに制限
  text = text.replace(/\n{4,}/g, "\n\n\n");

  return text;
}

// resultの末尾から --- と空行を削除するヘルパー
function removeTrailingHr(result) {
  // 末尾の空行を削除
  while (result.length > 0 && result[result.length - 1].trim() === "") {
    result.pop();
  }
  // 末尾が --- なら削除
  if (result.length > 0 && result[result.length - 1].trim() === "---") {
    result.pop();
  }
  // さらに空行を削除
  while (result.length > 0 && result[result.length - 1].trim() === "") {
    result.pop();
  }
}

// メイン処理
function main() {
  console.log("小説変換スクリプト開始\n");

  for (const novel of NOVELS) {
    const srcDir = path.join(NOVELS_ROOT, novel.srcDir);
    const destDir = path.join(ROOT, novel.destDir);

    console.log(`[${novel.destDir}]`);

    // ソースファイル一覧（設計書を除外）
    const files = fs.readdirSync(srcDir)
      .filter(f => f.endsWith(".md") && !f.startsWith("00_"))
      .sort((a, b) => sortNum(a) - sortNum(b));

    // 出力ディレクトリ作成
    fs.mkdirSync(destDir, { recursive: true });

    let chapterNum = 0;
    for (const file of files) {
      chapterNum++;
      const padNum = String(chapterNum).padStart(2, "0");
      const title = extractTitle(file);

      // ソースファイル読み取り
      const content = fs.readFileSync(path.join(srcDir, file), "utf-8");

      // フォーマット変換
      const converted = convertContent(content, chapterNum, title);

      // 出力ファイル名
      const outFilename = `第${padNum}話_${title}.md`;
      fs.writeFileSync(path.join(destDir, outFilename), converted, "utf-8");

      // 文字数カウント（空白・見出し除去）
      let countText = converted;
      countText = countText.replace(/^#{1,6}\s+.*$/gm, "");
      countText = countText.replace(/^[\s　]*＊[\s　]*＊[\s　]*＊[\s　]*$/gm, "");
      countText = countText.replace(/[\s\n\r\t　]/g, "");
      const chars = countText.length;

      console.log(`  ${outFilename} (${chars.toLocaleString("ja-JP")}字)`);
    }

    console.log(`  → ${chapterNum}話 変換完了\n`);
  }

  console.log("全変換完了!");
}

main();
