import fs from "fs";
import path from "path";
import { Marked } from "marked";

const ROOT = path.resolve(import.meta.dirname, "..");
const DIST = path.join(ROOT, "dist");
const SRC = path.join(ROOT, "src");
const IMAGES = path.join(ROOT, "images");

// 物語設定を読み込み
const STORIES = JSON.parse(
  fs.readFileSync(path.join(ROOT, "stories.json"), "utf-8")
);

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

// 文字数カウント（Markdown構文を除外した本文の文字数）
function countChars(mdContent) {
  let text = mdContent;
  // Markdown見出しを除去
  text = text.replace(/^#{1,6}\s+.*$/gm, "");
  // 場面転換マーカーを除去
  text = text.replace(/^[\s　]*＊[\s　]*＊[\s　]*＊[\s　]*$/gm, "");
  // 空白・改行を除去
  text = text.replace(/[\s\n\r\t　]/g, "");
  return text.length;
}

// 数値をカンマ区切りでフォーマット
function formatNumber(n) {
  return n.toLocaleString("ja-JP");
}

// 画像パスの存在チェック → img要素 or プレースホルダー
function imageTag(relativePath, alt) {
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
    paragraph({ text, tokens }) {
      const rawText = tokens?.map(t => t.raw || t.text || "").join("") || text;
      if (/^[\s　]*＊[\s　]*＊[\s　]*＊[\s　]*$/.test(rawText)) {
        return '<hr class="scene-break">\n';
      }
      const trimmed = rawText.replace(/^[\s　]+/, "");
      if (trimmed.startsWith("「") || trimmed.startsWith("『")) {
        return `<p class="dialogue">${rawText}</p>\n`;
      }
      if (/^[\s　]*$/.test(rawText)) {
        return '<p class="empty-line"></p>\n';
      }
      return `<p>${rawText}</p>\n`;
    },
    heading({ text, depth }) {
      if (depth === 2) {
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
  console.log("ビルド開始...\n");

  // dist/ をクリーン
  if (fs.existsSync(DIST)) {
    fs.rmSync(DIST, { recursive: true });
  }
  ensureDir(DIST);

  // テンプレート読み込み
  const baseTemplate = loadTemplate("base");
  const portalTemplate = loadTemplate("portal");
  const indexTemplate = loadTemplate("index");
  const volumeTemplate = loadTemplate("volume");
  const chapterTemplate = loadTemplate("chapter");
  const marked = createMarked();

  // 各物語のサマリー情報（ポータル用）
  const storySummaries = [];

  // === 各物語をビルド ===
  for (const story of STORIES) {
    console.log(`[${story.title}]`);
    const storyDist = path.join(DIST, story.slug);
    ensureDir(storyDist);

    // 全話のフラットリスト
    const allChapters = [];

    for (const vol of story.volumes) {
      const volDir = path.join(ROOT, vol.dir);
      if (!fs.existsSync(volDir)) {
        console.warn(`  ディレクトリが見つかりません: ${vol.dir}`);
        continue;
      }

      const files = fs.readdirSync(volDir)
        .filter(f => f.endsWith(".md") && f.startsWith("第"))
        .sort((a, b) => chapterNum(a) - chapterNum(b));

      for (const file of files) {
        const num = chapterNum(file);
        const padNum = String(num).padStart(2, "0");
        const mdPath = path.join(volDir, file);
        const mdContent = fs.readFileSync(mdPath, "utf-8");
        const chars = countChars(mdContent);

        allChapters.push({
          vol,
          file,
          title: chapterTitle(file),
          num,
          slug: `ch${padNum}`,
          mdContent,
          chars,
          // 絶対パス（サイトルートから）
          url: `/${story.slug}/${vol.slug}/ch${padNum}.html`,
          imagePath: story.imageDir
            ? `images/${story.imageDir}/ch${padNum}.webp`
            : `images/${vol.slug}/ch${padNum}.webp`,
        });
      }
    }

    // --- 各話HTMLを生成 ---
    for (let i = 0; i < allChapters.length; i++) {
      const ch = allChapters[i];
      const prev = i > 0 ? allChapters[i - 1] : null;
      const next = i < allChapters.length - 1 ? allChapters[i + 1] : null;

      const htmlContent = marked.parse(ch.mdContent);
      const chapterImageTag = imageTag(ch.imagePath, ch.title);

      const prevLink = prev
        ? `<a href="${prev.url}" class="nav-prev">${prev.title}</a>`
        : '<span class="nav-placeholder"></span>';
      const nextLink = next
        ? `<a href="${next.url}" class="nav-next">${next.title}</a>`
        : '<span class="nav-placeholder"></span>';

      const chapterHtml = render(chapterTemplate, {
        volumePath: `/${story.slug}/${ch.vol.slug}/`,
        volumeTitle: ch.vol.title,
        chapterImage: chapterImageTag,
        chapterContent: htmlContent,
        chapterChars: formatNumber(ch.chars),
        prevLink,
        nextLink,
      });

      const breadcrumb = `<span class="breadcrumb-sep">/</span><a href="/${story.slug}/" class="breadcrumb-link">${story.title}</a>`;

      const fullHtml = render(baseTemplate, {
        title: `${ch.title} - ${ch.vol.title} | ${story.title}`,
        description: `${story.title} ${ch.vol.title} ${ch.title}`,
        basePath: "/",
        breadcrumb,
        content: chapterHtml,
      });

      const outDir = path.join(storyDist, ch.vol.slug);
      ensureDir(outDir);
      fs.writeFileSync(path.join(outDir, `${ch.slug}.html`), fullHtml);
      console.log(`  ${story.slug}/${ch.vol.slug}/${ch.slug}.html (${formatNumber(ch.chars)}字)`);
    }

    // --- 巻目次ページを生成 ---
    for (const vol of story.volumes) {
      const volChapters = allChapters.filter(ch => ch.vol.slug === vol.slug);
      const volChars = volChapters.reduce((sum, ch) => sum + ch.chars, 0);
      const coverImageTag = imageTag(
        story.imageDir
          ? `images/${story.imageDir}/cover.webp`
          : `images/cover-${vol.slug}.webp`,
        vol.title
      );

      const chapterLinks = volChapters.map(ch =>
        `<li><a href="${ch.slug}.html"><span class="ch-title">${ch.title}</span><span class="ch-chars">${formatNumber(ch.chars)}字</span></a></li>`
      ).join("\n    ");

      const volumeHtml = render(volumeTemplate, {
        coverImage: coverImageTag,
        volumeTitle: vol.title,
        volumeSubtitle: vol.subtitle,
        chapterCount: volChapters.length,
        volumeChars: formatNumber(volChars),
        chapterLinks,
      });

      const breadcrumb = `<span class="breadcrumb-sep">/</span><a href="/${story.slug}/" class="breadcrumb-link">${story.title}</a>`;

      const fullHtml = render(baseTemplate, {
        title: `${vol.title} | ${story.title}`,
        description: `${story.title} ${vol.title} - ${vol.subtitle}`,
        basePath: "/",
        breadcrumb,
        content: volumeHtml,
      });

      const outDir = path.join(storyDist, vol.slug);
      ensureDir(outDir);
      fs.writeFileSync(path.join(outDir, "index.html"), fullHtml);

      const volCharsFormatted = formatNumber(volChars);
      console.log(`  ${story.slug}/${vol.slug}/index.html (${volChapters.length}話 / ${volCharsFormatted}字)`);
    }

    // --- 物語トップページを生成 ---
    const totalChars = allChapters.reduce((sum, ch) => sum + ch.chars, 0);
    const heroImageTag = imageTag(
      story.imageDir
        ? `images/${story.imageDir}/main-visual.webp`
        : `images/main-visual.webp`,
      story.title
    );

    const volumeCards = story.volumes.map(vol => {
      const volChapters = allChapters.filter(ch => ch.vol.slug === vol.slug);
      const volChars = volChapters.reduce((sum, ch) => sum + ch.chars, 0);
      const coverTag = imageTag(
        story.imageDir
          ? `images/${story.imageDir}/cover.webp`
          : `images/cover-${vol.slug}.webp`,
        vol.title
      );
      return `<a href="${vol.slug}/" class="volume-card">
      <div class="volume-card-image">${coverTag}</div>
      <div class="volume-card-info">
        <h2>${vol.title}</h2>
        <p>${vol.subtitle}</p>
        <p class="chapter-count">全${volChapters.length}話 / ${formatNumber(volChars)}字</p>
      </div>
    </a>`;
    }).join("\n  ");

    const indexHtml = render(indexTemplate, {
      heroImage: heroImageTag,
      storyTitle: story.title,
      storySubtitle: story.subtitle,
      totalChapters: allChapters.length,
      totalChars: formatNumber(totalChars),
      volumeCards,
    });

    const breadcrumb = `<span class="breadcrumb-sep">/</span><span class="breadcrumb-current">${story.title}</span>`;

    const fullIndexHtml = render(baseTemplate, {
      title: `${story.title}`,
      description: story.description,
      basePath: "/",
      breadcrumb,
      content: indexHtml,
    });

    fs.writeFileSync(path.join(storyDist, "index.html"), fullIndexHtml);
    console.log(`  ${story.slug}/index.html (総計 ${formatNumber(totalChars)}字)\n`);

    // ポータル用サマリー
    storySummaries.push({
      ...story,
      totalChapters: allChapters.length,
      totalChars,
      volumeCount: story.volumes.length,
    });
  }

  // === ポータルページ（トップ）を生成 ===
  const storyCards = storySummaries.map(s => {
    const coverTag = imageTag(
      s.imageDir
        ? `images/${s.imageDir}/main-visual.webp`
        : `images/main-visual.webp`,
      s.title
    );
    return `<a href="${s.slug}/" class="story-card">
      <div class="story-card-image">${coverTag}</div>
      <div class="story-card-info">
        <h2>${s.title}</h2>
        <p class="story-card-subtitle">${s.subtitle}</p>
        <p class="story-card-desc">${s.description}</p>
        <p class="story-card-stats">全${s.volumeCount}巻 ${s.totalChapters}話 / ${formatNumber(s.totalChars)}字</p>
      </div>
    </a>`;
  }).join("\n  ");

  const portalHtml = render(portalTemplate, { storyCards });

  const fullPortalHtml = render(baseTemplate, {
    title: "Novel Library",
    description: "オリジナル小説コレクション",
    basePath: "/",
    breadcrumb: "",
    content: portalHtml,
  });

  fs.writeFileSync(path.join(DIST, "index.html"), fullPortalHtml);
  console.log("portal: index.html");

  // === 静的アセットをコピー ===
  copyDir(path.join(SRC, "css"), path.join(DIST, "css"));
  copyDir(path.join(SRC, "js"), path.join(DIST, "js"));
  console.log("assets: css/, js/");

  // 画像ディレクトリをコピー（各物語のサブディレクトリに）
  if (fs.existsSync(IMAGES)) {
    for (const story of STORIES) {
      copyDir(IMAGES, path.join(DIST, story.slug, "images"));
    }
    console.log("assets: images/");
  }

  const totalAllChars = storySummaries.reduce((sum, s) => sum + s.totalChars, 0);
  console.log(`\nビルド完了! ${STORIES.length}作品 / ${formatNumber(totalAllChars)}字`);
}

build();
