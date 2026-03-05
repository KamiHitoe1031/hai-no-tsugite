import fs from "fs";
import path from "path";
import { Marked } from "marked";

const ROOT = path.resolve(import.meta.dirname, "..");
const DIST = path.join(ROOT, "dist");
const SRC = path.join(ROOT, "src");
const IMAGES = path.join(ROOT, "images");

// 巻の定義
const VOLUMES = [
  {
    dir: "第一巻_灰の庭",
    slug: "vol1",
    title: "第一巻「灰の庭」",
    subtitle: "不遇の日々、力の目覚め、最初の決断",
  },
  {
    dir: "第二巻_銀の糸",
    slug: "vol2",
    title: "第二巻「銀の糸」",
    subtitle: "旅路と真実、世界の残酷さ、繋がりの意味",
  },
  {
    dir: "第三巻_暁の声",
    slug: "vol3",
    title: "第三巻「暁の声」",
    subtitle: "対峙と選択、継承、新たな一歩",
  },
];

// テンプレート読み込み
function loadTemplate(name) {
  return fs.readFileSync(path.join(SRC, "templates", `${name}.html`), "utf-8");
}

// テンプレート変数置換
function render(template, vars) {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value ?? "");
  }
  return result;
}

// 画像パスの存在チェック → img要素 or プレースホルダー
function imageTag(relativePath, alt, className) {
  const absPath = path.join(ROOT, relativePath);
  if (fs.existsSync(absPath)) {
    return `<img src="${relativePath}" alt="${alt}" loading="lazy">`;
  }
  return `<div class="placeholder-image">${alt}</div>`;
}

// Markdownのカスタムレンダラー設定
function createMarked() {
  const marked = new Marked();

  const renderer = {
    // 場面転換: ＊　＊　＊ をシーンブレイクに
    paragraph({ text, tokens }) {
      // tokensの中身のtextを取り出す
      const rawText = tokens?.map(t => t.raw || t.text || "").join("") || text;

      // 場面転換
      if (/^[\s　]*＊[\s　]*＊[\s　]*＊[\s　]*$/.test(rawText)) {
        return '<hr class="scene-break">\n';
      }

      // 「」始まりのセリフ
      const trimmed = rawText.replace(/^[\s　]+/, "");
      if (trimmed.startsWith("「") || trimmed.startsWith("『")) {
        return `<p class="dialogue">${rawText}</p>\n`;
      }

      // 全角スペースだけの空行
      if (/^[\s　]*$/.test(rawText)) {
        return '<p class="empty-line"></p>\n';
      }

      return `<p>${rawText}</p>\n`;
    },

    // 見出しのカスタマイズ
    heading({ text, depth }) {
      if (depth === 2) {
        // ——XXの視点—— パターン
        if (/^——.*——$/.test(text)) {
          return `<h2 class="viewpoint">${text}</h2>\n`;
        }
        return `<h2>${text}</h2>\n`;
      }
      if (depth === 1) {
        return `<h1>${text}</h1>\n`;
      }
      return `<h${depth}>${text}</h${depth}>\n`;
    },

    // 水平線はscene-breakとして扱う
    hr() {
      return '<hr class="scene-break">\n';
    },
  };

  marked.use({ renderer });
  return marked;
}

// ディレクトリ再帰作成
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

// ファイルコピー（再帰）
function copyDir(src, dest) {
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// 各話のタイトルをファイル名から抽出
function chapterTitle(filename) {
  // 第01話_灰燼の記憶.md → 灰燼の記憶
  const match = filename.match(/第\d+話_(.+)\.md$/);
  return match ? match[1] : filename.replace(".md", "");
}

// 各話の番号を抽出
function chapterNum(filename) {
  const match = filename.match(/第(\d+)話/);
  return match ? parseInt(match[1], 10) : 0;
}

// ビルド実行
function build() {
  console.log("ビルド開始...");

  // dist/ をクリーン
  if (fs.existsSync(DIST)) {
    fs.rmSync(DIST, { recursive: true });
  }
  ensureDir(DIST);

  // テンプレート読み込み
  const baseTemplate = loadTemplate("base");
  const indexTemplate = loadTemplate("index");
  const volumeTemplate = loadTemplate("volume");
  const chapterTemplate = loadTemplate("chapter");

  const marked = createMarked();

  // 全話のフラットリスト（前後ナビ用）
  const allChapters = [];

  for (const vol of VOLUMES) {
    const volDir = path.join(ROOT, vol.dir);
    if (!fs.existsSync(volDir)) {
      console.warn(`ディレクトリが見つかりません: ${vol.dir}`);
      continue;
    }

    const files = fs.readdirSync(volDir)
      .filter(f => f.endsWith(".md") && f.startsWith("第"))
      .sort((a, b) => chapterNum(a) - chapterNum(b));

    for (const file of files) {
      const num = chapterNum(file);
      const padNum = String(num).padStart(2, "0");
      allChapters.push({
        vol,
        file,
        title: chapterTitle(file),
        num,
        slug: `ch${padNum}`,
        url: `/${vol.slug}/ch${padNum}.html`,
        imagePath: `images/${vol.slug}/ch${padNum}.webp`,
      });
    }
  }

  // 各話HTMLを生成
  for (let i = 0; i < allChapters.length; i++) {
    const ch = allChapters[i];
    const prev = i > 0 ? allChapters[i - 1] : null;
    const next = i < allChapters.length - 1 ? allChapters[i + 1] : null;

    const mdPath = path.join(ROOT, ch.vol.dir, ch.file);
    const mdContent = fs.readFileSync(mdPath, "utf-8");
    const htmlContent = marked.parse(mdContent);

    const chapterImageTag = imageTag(ch.imagePath, ch.title, "chapter-image");

    const prevLink = prev
      ? `<a href="${prev.url}" class="nav-prev">${prev.title}</a>`
      : '<span class="nav-placeholder"></span>';
    const nextLink = next
      ? `<a href="${next.url}" class="nav-next">${next.title}</a>`
      : '<span class="nav-placeholder"></span>';

    const chapterHtml = render(chapterTemplate, {
      volumePath: `/${ch.vol.slug}/`,
      volumeTitle: ch.vol.title,
      chapterImage: chapterImageTag,
      chapterContent: htmlContent,
      prevLink,
      nextLink,
    });

    const fullHtml = render(baseTemplate, {
      title: `${ch.title} - ${ch.vol.title}`,
      description: `灰の継ぎ手 ${ch.vol.title} ${ch.title}`,
      basePath: "../",
      content: chapterHtml,
    });

    const outDir = path.join(DIST, ch.vol.slug);
    ensureDir(outDir);
    fs.writeFileSync(path.join(outDir, `${ch.slug}.html`), fullHtml);
    console.log(`  ${ch.vol.slug}/${ch.slug}.html`);
  }

  // 巻目次ページを生成
  for (const vol of VOLUMES) {
    const volChapters = allChapters.filter(ch => ch.vol.slug === vol.slug);
    const coverImageTag = imageTag(`images/cover-${vol.slug}.webp`, vol.title, "volume-cover");

    const chapterLinks = volChapters.map(ch =>
      `<li><a href="${ch.slug}.html">${ch.title}</a></li>`
    ).join("\n    ");

    const volumeHtml = render(volumeTemplate, {
      coverImage: coverImageTag,
      volumeTitle: vol.title,
      volumeSubtitle: vol.subtitle,
      chapterLinks,
    });

    const fullHtml = render(baseTemplate, {
      title: vol.title,
      description: `灰の継ぎ手 ${vol.title} - ${vol.subtitle}`,
      basePath: "../",
      content: volumeHtml,
    });

    const outDir = path.join(DIST, vol.slug);
    ensureDir(outDir);
    fs.writeFileSync(path.join(outDir, "index.html"), fullHtml);
    console.log(`  ${vol.slug}/index.html`);
  }

  // トップページを生成
  const heroImageTag = imageTag("images/main-visual.webp", "灰の継ぎ手", "hero-image");

  const volumeCards = VOLUMES.map(vol => {
    const volChapters = allChapters.filter(ch => ch.vol.slug === vol.slug);
    const coverTag = imageTag(`images/cover-${vol.slug}.webp`, vol.title, "volume-card-image");
    return `<a href="${vol.slug}/" class="volume-card">
      <div class="volume-card-image">${coverTag}</div>
      <div class="volume-card-info">
        <h2>${vol.title}</h2>
        <p>${vol.subtitle}</p>
        <p class="chapter-count">全${volChapters.length}話</p>
      </div>
    </a>`;
  }).join("\n  ");

  const indexHtml = render(indexTemplate, {
    heroImage: heroImageTag,
    volumeCards,
  });

  const fullIndexHtml = render(baseTemplate, {
    title: "灰の継ぎ手",
    description: "灰の庭にも、花は咲く。——星脈世界を舞台にした物語",
    basePath: "",
    content: indexHtml,
  });

  fs.writeFileSync(path.join(DIST, "index.html"), fullIndexHtml);
  console.log("  index.html");

  // 静的アセットをコピー
  copyDir(path.join(SRC, "css"), path.join(DIST, "css"));
  copyDir(path.join(SRC, "js"), path.join(DIST, "js"));
  console.log("  css/, js/ コピー完了");

  // 画像ディレクトリをコピー（存在する場合）
  if (fs.existsSync(IMAGES)) {
    copyDir(IMAGES, path.join(DIST, "images"));
    console.log("  images/ コピー完了");
  }

  console.log(`\nビルド完了! dist/ に${allChapters.length}話 + 目次ページを出力しました`);
}

build();
