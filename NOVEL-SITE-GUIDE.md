# Novel Library サイト構築ガイド

他のClaudeエージェントが新しい作品を追加・管理するためのドキュメント。

---

## プロジェクト概要

Markdownで書かれた小説をHTMLに変換し、AI生成挿絵付きでCloudflare Pagesに公開する静的サイト。複数作品をポータル形式で管理する。

- **GitHubリポジトリ**: `KamiHitoe1031/hai-no-tsugite`
- **ホスティング**: Cloudflare Pages（GitHub連携で自動デプロイ）
- **画像生成**: Google Imagen 4.0 + Gemini 2.0 Flash（キャラクター一貫性対応）

---

## ディレクトリ構成

```
プロジェクトルート/
├── stories.json                # 全作品のメタデータ定義
├── package.json                # 依存: marked, @google/genai, dotenv
├── .env                        # GOOGLE_API_KEY（git管理外）
├── .env.example
├── .gitignore
│
├── scripts/
│   ├── build.mjs               # Markdown→HTML変換ビルド
│   ├── generate-images.mjs     # AI画像生成（2段階方式）
│   └── prompts.json            # 画像プロンプト定義
│
├── src/
│   ├── templates/
│   │   ├── base.html           # 全ページ共通骨格
│   │   ├── portal.html         # サイトトップ（作品一覧）
│   │   ├── index.html          # 作品トップ
│   │   ├── volume.html         # 巻目次
│   │   └── chapter.html        # 各話ページ
│   ├── css/style.css           # テーマ（ライト/ダーク対応）
│   └── js/main.js              # テーマ切替・読書進捗
│
├── images/                     # 生成済み画像（gitに含める）
│   ├── character-refs/         # キャラリファレンス画像（PNG）
│   ├── main-visual.webp        # メインビジュアル
│   ├── cover-vol{N}.webp       # 巻カバー
│   └── vol{N}/ch{NN}.webp      # 各話挿絵
│
├── 第一巻_灰の庭/              # 小説本文Markdown（既存作品）
├── 第二巻_銀の糸/
├── 第三巻_暁の声/
│
└── dist/                       # ビルド出力（gitignore）
```

---

## URL構成

```
/                                → ポータル（全作品一覧）
/{story-slug}/                   → 作品トップ
/{story-slug}/vol{N}/            → 巻目次
/{story-slug}/vol{N}/ch{NN}.html → 各話ページ
```

現在の例: `/hai-no-tsugite/vol1/ch01.html`

---

## 新しい作品を追加する手順

### Step 1: Markdown本文を作成

巻ごとにディレクトリを作り、各話のMarkdownファイルを配置する。

#### ディレクトリ命名規則

```
第一巻_巻タイトル/
├── 第01話_話タイトル.md
├── 第02話_話タイトル.md
└── ...
```

- ディレクトリ名: `第X巻_` で始まる（自由な名前でOK、stories.jsonで指定する）
- ファイル名: **必ず** `第XX話_タイトル.md` の形式（ビルドスクリプトがこの形式をパースする）

#### Markdownの書き方

```markdown
# 第一話　話タイトル

## ——キャラクター名の視点——

　全角スペースで字下げ。段落は自動的に<p>タグになる。

「セリフは鉤括弧で始める。自動的にdialogueクラスが付く」

『二重鉤括弧も対応』

　説明文が続く。

　　　　　＊　＊　＊

## ——別キャラの視点——

　場面転換後の新しいシーン。

## ——第一巻「タイトル」——了——
```

**自動変換ルール:**

| Markdown | HTML出力 | 用途 |
|----------|----------|------|
| `# 第一話 タイトル` | `<h1>` | 話タイトル |
| `## ——XX——` | `<h2 class="viewpoint">` | 視点切替 |
| `## その他` | `<h2>` | 通常見出し |
| `「…」`で始まる段落 | `<p class="dialogue">` | セリフ（字下げなし） |
| `＊　＊　＊` | `<hr class="scene-break">` | 場面転換 |
| 通常の段落 | `<p>` | 本文（CSSで1em字下げ） |

### Step 2: stories.json に作品を追加

```json
[
  {
    "slug": "hai-no-tsugite",
    "title": "灰の継ぎ手",
    "subtitle": "灰の庭にも、花は咲く。",
    "description": "星脈世界エルデリアを舞台に...",
    "volumes": [
      {
        "dir": "第一巻_灰の庭",
        "slug": "vol1",
        "title": "第一巻「灰の庭」",
        "subtitle": "不遇の日々、力の目覚め、最初の決断"
      }
    ]
  },
  {
    "slug": "new-story-slug",
    "title": "新作品タイトル",
    "subtitle": "キャッチフレーズ",
    "description": "作品の説明文（ポータルに表示される）",
    "volumes": [
      {
        "dir": "新作品_第一巻_巻タイトル",
        "slug": "vol1",
        "title": "第一巻「巻タイトル」",
        "subtitle": "巻のサブタイトル"
      }
    ]
  }
]
```

**各フィールドの説明:**

| フィールド | 説明 | 例 |
|-----------|------|-----|
| `slug` | URLパス（英数字とハイフン） | `"my-new-story"` |
| `title` | 作品名 | `"新しい物語"` |
| `subtitle` | キャッチフレーズ | `"光と影の狭間で"` |
| `description` | 説明文（ポータル表示用） | `"..."` |
| `volumes[].dir` | Markdownディレクトリ名（ルート相対） | `"第一巻_光の章"` |
| `volumes[].slug` | 巻のURLパス | `"vol1"` |
| `volumes[].title` | 巻タイトル | `"第一巻「光の章」"` |
| `volumes[].subtitle` | 巻サブタイトル | `"始まりの物語"` |

### Step 3: 画像プロンプトを定義（scripts/prompts.json）

既存のプロンプトはそのまま残し、新作品分を配列に追加する。

```json
[
  // ... 既存作品のプロンプトはそのまま ...

  {
    "output": "images/new-story/main-visual.webp",
    "prompt": "anime illustration, light novel style, ...",
    "aspect_ratio": "16:9"
  },
  {
    "output": "images/new-story/cover-vol1.webp",
    "prompt": "anime illustration, light novel style, book cover, ...",
    "aspect_ratio": "2:3"
  },
  {
    "output": "images/new-story/vol1/ch01.webp",
    "prompt": "anime illustration, light novel style, ...",
    "aspect_ratio": "3:4"
  }
]
```

**アスペクト比の使い分け:**

| 種類 | アスペクト比 | 用途 |
|------|-------------|------|
| メインビジュアル | `16:9` | 作品トップのバナー |
| 巻カバー | `2:3` | 巻目次の表紙（縦長） |
| 各話挿絵 | `3:4` | LN挿絵風（縦長） |

**プロンプトの書き方:**
- 必ず `"anime illustration, light novel style, "` で始める
- 全て英語で記述
- キャラクターの外見特徴を含める（髪色、目の色、服装、年齢）
  - キャラ一貫性のため、リファレンス画像のキーワードマッチに使われる
- シーンの情景・雰囲気を詳しく描写

### Step 4: キャラクターリファレンスを定義

`scripts/generate-images.mjs` の `CHARACTER_REFS` 配列と `CHARACTER_KEYWORDS` オブジェクトに新キャラを追加する。

```javascript
// CHARACTER_REFS に追加
{
  id: "new-char",
  name: "新キャラ名",
  prompt: "anime illustration, light novel style, character reference sheet, full body front view, [外見の詳細], clean white background, high detail anime art style",
}

// CHARACTER_KEYWORDS に追加
new_char: ["keyword1", "keyword2", "CharacterName"],
```

- `id`: 内部識別子（英小文字）
- `prompt`: キャラリファレンスシート生成用プロンプト（白背景、全身、正面）
- キーワード: 各話プロンプトに含まれる英語の特徴語句（自動マッチング用）

### Step 5: ビルドスクリプトの画像パス対応

**重要**: ビルドスクリプト（build.mjs）は現在、画像パスを以下のパターンで探す:

```javascript
// 各話の挿絵
imagePath: `images/${vol.slug}/ch${padNum}.webp`
// 巻カバー
`images/cover-${vol.slug}.webp`
// メインビジュアル
`images/main-visual.webp`
```

新作品で別の画像パスを使う場合、build.mjs の画像パス生成ロジックを更新する必要がある。現状は全作品が同じ `images/` ディレクトリを共有する設計なので、作品ごとにサブディレクトリを使う場合はビルドスクリプトの修正が必要。

**推奨**: 新作品追加時にbuild.mjsを以下のように修正する:
```javascript
// 画像パスを作品スラッグで分離
imagePath: `images/${story.slug}/${vol.slug}/ch${padNum}.webp`
```

### Step 6: 実行

```bash
# 1. 依存パッケージのインストール（初回のみ）
npm install

# 2. 画像生成（.envにGOOGLE_API_KEYが必要）
npm run generate-images

# 3. HTMLビルド
npm run build

# 4. ローカル確認
npm run preview
# → http://localhost:3000 でアクセス

# 5. コミット & プッシュ → Cloudflare Pagesが自動デプロイ
git add .
git commit -m "新作品「タイトル」を追加"
git push
```

---

## 画像生成の仕組み（2段階方式）

### Phase 1: キャラクターリファレンス生成

- **API**: Google Imagen 4.0 (`imagen-4.0-generate-001`)
- **出力**: `images/character-refs/{id}.png`
- 白背景の全身キャラクターシートを生成
- 既存ファイルがあればスキップ（冪等）

### Phase 2: シーンイラスト生成

- プロンプト内のキーワードからキャラクターを自動検出
- **キャラ参照あり**: Gemini 2.0 Flash (`gemini-2.0-flash-exp-image-generation`)
  - リファレンス画像をBase64で入力し、外見の一貫性を維持
- **キャラ参照なし**: Imagen 4.0
- 既存ファイルがあればスキップ（冪等なので安全に再実行可能）
- API呼び出し間隔: 3秒

---

## ビルドシステムの詳細

### テンプレート変数一覧

**base.html（全ページ共通）:**
| 変数 | 内容 |
|------|------|
| `{{title}}` | `<title>`タグの内容 |
| `{{description}}` | metaタグのdescription |
| `{{basePath}}` | サイトルートへの相対パス（通常 `/`） |
| `{{breadcrumb}}` | パンくずHTML（空文字列も可） |
| `{{content}}` | メインコンテンツ（他テンプレートの出力） |

**portal.html:**
| 変数 | 内容 |
|------|------|
| `{{storyCards}}` | 作品カードのHTMLリスト |

**index.html（作品トップ）:**
| 変数 | 内容 |
|------|------|
| `{{heroImage}}` | メインビジュアルのimgタグ |
| `{{storyTitle}}` | 作品タイトル |
| `{{storySubtitle}}` | キャッチフレーズ |
| `{{totalChapters}}` | 全話数 |
| `{{totalChars}}` | 総文字数（カンマ区切り） |
| `{{volumeCards}}` | 巻カードのHTMLリスト |

**volume.html:**
| 変数 | 内容 |
|------|------|
| `{{coverImage}}` | カバー画像のimgタグ |
| `{{volumeTitle}}` | 巻タイトル |
| `{{volumeSubtitle}}` | 巻サブタイトル |
| `{{chapterCount}}` | 話数 |
| `{{volumeChars}}` | 巻の文字数（カンマ区切り） |
| `{{chapterLinks}}` | `<li><a>`のリスト（各話リンク+文字数） |

**chapter.html:**
| 変数 | 内容 |
|------|------|
| `{{volumePath}}` | 巻目次への絶対パス |
| `{{volumeTitle}}` | 巻タイトル |
| `{{chapterImage}}` | 挿絵のimgタグ |
| `{{chapterContent}}` | Markdown変換済みHTML本文 |
| `{{chapterChars}}` | 話の文字数（カンマ区切り） |
| `{{prevLink}}` | 前の話へのリンク（巻またぎ対応） |
| `{{nextLink}}` | 次の話へのリンク（巻またぎ対応） |

### 文字数カウントのロジック

Markdownの見出し（`#`）・場面転換（`＊　＊　＊`）・全空白を除外し、実際の本文文字数のみをカウントする。句読点・鉤括弧は含まれる。

```javascript
function countChars(mdContent) {
  let text = mdContent;
  text = text.replace(/^#{1,6}\s+.*$/gm, "");          // 見出し除去
  text = text.replace(/^[\s　]*＊[\s　]*＊[\s　]*＊[\s　]*$/gm, ""); // 場面転換除去
  text = text.replace(/[\s\n\r\t　]/g, "");              // 空白除去
  return text.length;
}
```

---

## CSSテーマ

灰茶系の温かみのある配色。CSS Custom Properties（`--変数名`）で管理。

```css
/* ライトテーマ */
:root {
  --bg: #faf8f5;           /* 温かいベージュ */
  --text: #2c2420;         /* 濃い茶 */
  --accent: #8b7355;       /* 焦げ茶 */
}

/* ダークテーマ */
[data-theme="dark"] {
  --bg: #1a1714;           /* 暗い茶 */
  --text: #e0d8ce;         /* 明るいベージュ */
  --accent: #c4a876;       /* ゴールド */
}
```

フォント: Noto Serif JP、行間1.95、最大幅42em。

---

## セキュリティ注意事項

- `.env` にAPIキーを格納。**絶対にgitにコミットしない**
- `.gitignore` に `.env`, `.env.*` が含まれていることを確認
- コミット前に `git diff --staged` で秘密情報の混入をチェック
- `images/` は生成済み画像をgitに含める（ビルド時にAPI呼び出し不要にするため）

---

## コマンドリファレンス

```bash
npm run build              # Markdown→HTML変換、dist/に出力
npm run generate-images    # 画像生成（.envにGOOGLE_API_KEY必要）
npm run preview            # dist/をローカルサーバーで確認
```

---

## 技術スタック

| 項目 | 技術 |
|------|------|
| ランタイム | Node.js (ES Modules) |
| Markdown変換 | marked v15 |
| 画像生成 | Google Imagen 4.0 / Gemini 2.0 Flash |
| テンプレート | `{{変数}}` 置換方式 |
| CSS | Custom Properties + レスポンシブ |
| JS | Vanilla JS（ダークモード・読書進捗） |
| ホスティング | Cloudflare Pages（GitHub連携） |
