// ミニロリのMarkdownファイルをNovel Libraryサイト形式に変換するスクリプト
// 使い方: node scripts/convert-miniloli.mjs

import fs from "fs";
import path from "path";

const ROOT = path.resolve(import.meta.dirname, "..");
const MINILOLI_ROOT = "O:/AI_/Claudecode/ミニロリ";

// 章タイトルを抽出（# 第X章「タイトル」 → タイトル）
function extractChapterTitle(content) {
  const firstLine = content.split("\n")[0];
  const match = firstLine.match(/^#\s*第\d+章[「『](.+?)[」』]/);
  if (match) return match[1];
  // フォールバック: # 第X章 の後の文字列を取得
  const fallback = firstLine.match(/^#\s*第\d+章\s*(.+)/);
  if (fallback) return fallback[1];
  return "無題";
}

// ファイル名に使えない文字をサニタイズ
function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*]/g, "_");
}

// メインストーリーのファイルを変換
function convertMainStory(content, chapterNum, title) {
  const lines = content.split("\n");
  const result = [];
  const padNum = String(chapterNum).padStart(2, "0");
  let firstH1 = true;

  for (const line of lines) {
    // 最初の見出しを変換
    if (firstH1 && /^#\s*第\d+章/.test(line)) {
      result.push(`# 第${padNum}話　${title}`);
      firstH1 = false;
      continue;
    }
    result.push(line);
  }

  return result.join("\n");
}

// 個別ストーリーのファイルを変換
function convertIndividualStory(content, chapterNum, title) {
  const lines = content.split("\n");
  const result = [];
  const padNum = String(chapterNum).padStart(2, "0");
  let firstH1 = true;

  for (const line of lines) {
    // 最初の見出しを変換
    if (firstH1 && /^#\s*第\d+章/.test(line)) {
      result.push(`# 第${padNum}話　${title}`);
      firstH1 = false;
      continue;
    }
    result.push(line);
  }

  return result.join("\n");
}

// メインストーリーのArc定義
const MAIN_ARCS = [
  { name: "Arc1_覚醒編", slug: "main-arc1", title: "メインストーリー Arc1「覚醒編」", subtitle: "灰色の目覚め、均衡の手、最初のロリたちとの出会い", chapters: [1, 2, 3, 4, 5, 6] },
  { name: "Arc2_集結編", slug: "main-arc2", title: "メインストーリー Arc2「集結編」", subtitle: "16人のロリの集結、表理の守護者との対立、世界炉の真実", chapters: [7, 8, 9, 10, 11, 12, 13] },
  { name: "Arc3_真実編", slug: "main-arc3", title: "メインストーリー Arc3「真実編」", subtitle: "世界炉のシステム、ルリの正体の亀裂、衝撃の真実", chapters: [14, 15, 16, 17, 18, 19] },
  { name: "Arc4_選択編", slug: "main-arc4", title: "メインストーリー Arc4「選択編」", subtitle: "ルリの正体判明、三つの選択、最終決戦とエピローグ", chapters: [20, 21, 22, 23, 24, 25] },
];

// 個別ストーリー定義
const INDIVIDUAL_STORIES = [
  { dir: "H01_フレイア", slug: "h01-freya", title: "フレイア個別ストーリー「折れた刃の行方」", subtitle: "戦争の醜さを知る銀髪の元将軍。不殺の誓いと贖罪の物語" },
  { dir: "H02_ティナ", slug: "h02-tina", title: "ティナ個別ストーリー「あたしのままで」", subtitle: "差別の醜さを知る半獣の少女。恐怖を超えて自分を取り戻す物語" },
  { dir: "H03_メル", slug: "h03-mel", title: "メル個別ストーリー「価値ある未来」", subtitle: "貧困の醜さを知るスラム育ちの少女。本当の豊かさを見つける物語" },
  { dir: "H04_セレナ", slug: "h04-serena", title: "セレナ個別ストーリー「嘘のない世界」", subtitle: "欺瞞の醜さを知る聡明な令嬢。信じることを取り戻す物語" },
  { dir: "H05_シャル", slug: "h05-shar", title: "シャル個別ストーリー「殺意のない場所」", subtitle: "暴力の醜さを知る無感情の少女。人の温もりを知る物語" },
  { dir: "H06_ユーリ", slug: "h06-yuri", title: "ユーリ個別ストーリー「永遠と一瞬」", subtitle: "孤独の醜さを知る数百歳のエルフ。永遠の孤独に終止符を打つ物語" },
  { dir: "H07_カナ", slug: "h07-kana", title: "カナ個別ストーリー「比較の鏡」", subtitle: "嫉妬の醜さを知る負けず嫌いの少女。自分だけの価値を見つける物語" },
  { dir: "H08_イリス", slug: "h08-iris", title: "イリス個別ストーリー「あたしの糸」", subtitle: "裏切りの醜さを知る毒舌の少女。信じる勇気を取り戻す物語" },
  { dir: "H09_ロゼ", slug: "h09-rose", title: "ロゼ個別ストーリー「因果を断つ者」", subtitle: "執着の醜さを知る研究者。呪われた因果の連鎖を断ち切る物語" },
  { dir: "H10_レイラ", slug: "h10-leila", title: "レイラ個別ストーリー「最後の糸」", subtitle: "支配の醜さを知る元姫。本当の自由を掴む物語" },
  { dir: "H11_ノア", slug: "h11-noa", title: "ノア個別ストーリー「未来の種」", subtitle: "無関心の醜さを知るぼんやりした少女。未来を自ら選ぶ物語" },
  { dir: "H12_ヴィオラ", slug: "h12-viola", title: "ヴィオラ個別ストーリー「善悪の秤」", subtitle: "偽善の醜さを知る完璧主義の少女。不完全な善と向き合う物語" },
  { dir: "H13_ソフィア", slug: "h13-sophia", title: "ソフィア個別ストーリー「喪失の残像」", subtitle: "喪失の醜さを知る内気な少女。失ったものを抱きしめて前に進む物語" },
  { dir: "H14_ルナ", slug: "h14-luna", title: "ルナ個別ストーリー「割れた宝石の光」", subtitle: "狂気の醜さを知る不安定な少女。壊れた心で輝く物語" },
  { dir: "H15_エリカ", slug: "h15-erika", title: "エリカ個別ストーリー「不完全な正義」", subtitle: "腐敗の醜さを知る元騎士。正義の在り方を問い直す物語" },
  { dir: "H16_ミレイユ", slug: "h16-mireille", title: "ミレイユ個別ストーリー「それでも、美しい」", subtitle: "絶望の醜さを知る厭世の詩人。世界の美しさを再発見する物語" },
  { dir: "H17_ルリ", slug: "h17-ruri", title: "ルリ真ヒロインルート「醜くも美しい世界」", subtitle: "全ての醜さを背負った最初のロリ。3000年の孤独を超えて紡ぐ、真実の愛の物語" },
];

function main() {
  console.log("ミニロリ変換スクリプト開始\n");

  // === メインストーリーの変換 ===
  for (const arc of MAIN_ARCS) {
    const destDir = path.join(ROOT, `ミニロリ_${arc.name}`);
    fs.mkdirSync(destDir, { recursive: true });
    console.log(`[${arc.name}]`);

    let localNum = 0;
    for (const chNum of arc.chapters) {
      localNum++;
      const padChNum = String(chNum).padStart(2, "0");
      const srcFile = path.join(MINILOLI_ROOT, "20_メインストーリー", `第${padChNum}章`, "本文.md");

      if (!fs.existsSync(srcFile)) {
        console.warn(`  ファイルが見つかりません: ${srcFile}`);
        continue;
      }

      const content = fs.readFileSync(srcFile, "utf-8");
      const title = extractChapterTitle(content);
      const converted = convertMainStory(content, localNum, title);

      const padLocalNum = String(localNum).padStart(2, "0");
      const outFilename = `第${padLocalNum}話_${sanitizeFilename(title)}.md`;
      fs.writeFileSync(path.join(destDir, outFilename), converted, "utf-8");

      // 文字数カウント
      let countText = converted;
      countText = countText.replace(/^#{1,6}\s+.*$/gm, "");
      countText = countText.replace(/^[\s　]*＊[\s　]*＊[\s　]*＊[\s　]*$/gm, "");
      countText = countText.replace(/[\s\n\r\t　]/g, "");

      console.log(`  ${outFilename} (${countText.length.toLocaleString("ja-JP")}字)`);
    }
    console.log(`  → ${localNum}話 変換完了\n`);
  }

  // === 個別ストーリーの変換 ===
  for (const story of INDIVIDUAL_STORIES) {
    const srcDir = path.join(MINILOLI_ROOT, "30_個別ストーリー", story.dir);
    const destDir = path.join(ROOT, `ミニロリ_${story.dir}`);
    fs.mkdirSync(destDir, { recursive: true });
    console.log(`[${story.dir}]`);

    let chapterCount = 0;
    for (let i = 1; i <= 12; i++) {
      const padNum = String(i).padStart(2, "0");
      const srcFile = path.join(srcDir, `第${padNum}章.md`);

      if (!fs.existsSync(srcFile)) {
        console.warn(`  ファイルが見つかりません: 第${padNum}章.md`);
        continue;
      }

      const content = fs.readFileSync(srcFile, "utf-8");
      const title = extractChapterTitle(content);
      const converted = convertIndividualStory(content, i, title);

      const outFilename = `第${padNum}話_${sanitizeFilename(title)}.md`;
      fs.writeFileSync(path.join(destDir, outFilename), converted, "utf-8");

      // 文字数カウント
      let countText = converted;
      countText = countText.replace(/^#{1,6}\s+.*$/gm, "");
      countText = countText.replace(/^[\s　]*＊[\s　]*＊[\s　]*＊[\s　]*$/gm, "");
      countText = countText.replace(/[\s\n\r\t　]/g, "");

      console.log(`  ${outFilename} (${countText.length.toLocaleString("ja-JP")}字)`);
      chapterCount++;
    }
    console.log(`  → ${chapterCount}話 変換完了\n`);
  }

  console.log("全変換完了!");
}

main();
