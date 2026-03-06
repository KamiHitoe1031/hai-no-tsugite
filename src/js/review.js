// レビューコメント機能
(function () {
  "use strict";

  // 各話ページ以外では動作しない
  var chapterBody = document.querySelector(".chapter-body");
  if (!chapterBody) return;

  // ===== 定数 =====
  var STORAGE_KEY = "review-comments";
  var MODE_KEY = "review-mode";
  var pagePath = window.location.pathname;

  // ===== 状態 =====
  var isReviewMode = localStorage.getItem(MODE_KEY) === "true";
  var comments = loadComments();
  var panelOpen = false;
  var panelEl = null;
  var overlayEl = null;

  // ===== ストレージ =====
  function loadComments() {
    try {
      var data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return data[pagePath] || [];
    } catch (e) {
      return [];
    }
  }

  function saveComments() {
    try {
      var data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      data[pagePath] = comments;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error("コメント保存エラー:", e);
    }
  }

  function loadAllComments() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch (e) {
      return {};
    }
  }

  // ===== ユーティリティ =====
  function generateId() {
    return "c_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6);
  }

  function escapeHtml(text) {
    var div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function truncate(text, max) {
    if (text.length <= max) return text;
    return text.substring(0, max) + "...";
  }

  // ===== アンカー: テキスト位置の記録と復元 =====

  // chapter-bodyの直接の子要素を見つける
  function findBodyChild(node) {
    var current = node;
    while (current && current !== chapterBody) {
      if (current.parentNode === chapterBody) return current;
      current = current.parentNode;
    }
    return null;
  }

  // 要素のCSSセレクタを生成
  function makeSelector(el) {
    var tag = el.tagName.toLowerCase();
    var siblings = [];
    for (var i = 0; i < chapterBody.children.length; i++) {
      if (chapterBody.children[i].tagName.toLowerCase() === tag) {
        siblings.push(chapterBody.children[i]);
      }
    }
    var index = siblings.indexOf(el) + 1;
    return ".chapter-body > " + tag + ":nth-of-type(" + index + ")";
  }

  // 要素内でのテキストオフセットを計算
  function textOffset(root, textNode, offset) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var total = 0;
    var node;
    while ((node = walker.nextNode())) {
      if (node === textNode) return total + offset;
      total += node.textContent.length;
    }
    return total;
  }

  // RangeからAnchorを生成
  function createAnchor(range) {
    var startChild = findBodyChild(range.startContainer);
    var endChild = findBodyChild(range.endContainer);
    if (!startChild || !endChild) return null;

    return {
      startSelector: makeSelector(startChild),
      startOffset: textOffset(startChild, range.startContainer, range.startOffset),
      endSelector: makeSelector(endChild),
      endOffset: textOffset(endChild, range.endContainer, range.endOffset),
      selectedText: range.toString().trim(),
    };
  }

  // 要素内で指定オフセットのテキストノードを見つける
  function findNodeAtOffset(root, targetOffset) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var offset = 0;
    var node;
    while ((node = walker.nextNode())) {
      var len = node.textContent.length;
      if (offset + len >= targetOffset) {
        return { node: node, offset: targetOffset - offset };
      }
      offset += len;
    }
    return null;
  }

  // テキスト内容でフォールバック検索
  function fallbackSearch(text) {
    if (!text || text.length < 2) return null;
    var walker = document.createTreeWalker(chapterBody, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      var idx = node.textContent.indexOf(text);
      if (idx !== -1) {
        var range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, idx + text.length);
        return range;
      }
    }
    return null;
  }

  // AnchorからRangeを復元
  function resolveAnchor(anchor) {
    var startEl = document.querySelector(anchor.startSelector);
    var endEl = document.querySelector(anchor.endSelector);
    if (!startEl || !endEl) return fallbackSearch(anchor.selectedText);

    var startInfo = findNodeAtOffset(startEl, anchor.startOffset);
    var endInfo = findNodeAtOffset(endEl, anchor.endOffset);
    if (!startInfo || !endInfo) return fallbackSearch(anchor.selectedText);

    try {
      var range = document.createRange();
      range.setStart(startInfo.node, startInfo.offset);
      range.setEnd(endInfo.node, endInfo.offset);

      // テキスト内容で検証
      var rangeText = range.toString().trim();
      if (rangeText === anchor.selectedText) return range;
    } catch (e) {
      // ignore
    }

    return fallbackSearch(anchor.selectedText);
  }

  // ===== ハイライト =====

  // Range内のテキストノードを収集
  function collectTextNodes(range) {
    var result = [];
    var ancestor =
      range.commonAncestorContainer.nodeType === Node.TEXT_NODE
        ? range.commonAncestorContainer.parentNode
        : range.commonAncestorContainer;
    var walker = document.createTreeWalker(ancestor, NodeFilter.SHOW_TEXT);
    var node;
    var started = false;

    while ((node = walker.nextNode())) {
      if (node === range.startContainer) started = true;
      if (!started) continue;

      var start = node === range.startContainer ? range.startOffset : 0;
      var end = node === range.endContainer ? range.endOffset : node.textContent.length;

      if (start < end) {
        result.push({ node: node, startOffset: start, endOffset: end });
      }

      if (node === range.endContainer) break;
    }
    return result;
  }

  // Rangeにハイライトを適用
  function applyHighlight(range, commentId) {
    var textNodes = collectTextNodes(range);

    // 後ろから処理してオフセットのずれを防ぐ
    for (var i = textNodes.length - 1; i >= 0; i--) {
      var info = textNodes[i];
      var text = info.node.textContent;
      var before = text.substring(0, info.startOffset);
      var selected = text.substring(info.startOffset, info.endOffset);
      var after = text.substring(info.endOffset);

      var parent = info.node.parentNode;
      var fragment = document.createDocumentFragment();

      if (before) fragment.appendChild(document.createTextNode(before));

      var mark = document.createElement("mark");
      mark.className = "review-highlight";
      mark.dataset.commentId = commentId;
      mark.textContent = selected;
      fragment.appendChild(mark);

      if (after) fragment.appendChild(document.createTextNode(after));

      parent.replaceChild(fragment, info.node);
    }
  }

  // コメントIDでハイライトを除去
  function removeHighlight(commentId) {
    var marks = chapterBody.querySelectorAll('mark[data-comment-id="' + commentId + '"]');
    for (var i = 0; i < marks.length; i++) {
      var mark = marks[i];
      var parent = mark.parentNode;
      while (mark.firstChild) {
        parent.insertBefore(mark.firstChild, mark);
      }
      parent.removeChild(mark);
      parent.normalize();
    }
  }

  // 全ハイライトをクリアしてDOMを元に戻す
  function clearAllHighlights() {
    var marks = chapterBody.querySelectorAll("mark.review-highlight");
    for (var i = 0; i < marks.length; i++) {
      var mark = marks[i];
      var parent = mark.parentNode;
      while (mark.firstChild) {
        parent.insertBefore(mark.firstChild, mark);
      }
      parent.removeChild(mark);
    }
    chapterBody.normalize();
  }

  // 保存済みコメントからハイライトを復元
  function restoreHighlights() {
    clearAllHighlights();

    // 位置の逆順にソートして適用（オフセットずれ防止）
    var sorted = comments.slice().sort(function (a, b) {
      if (a.anchor.startSelector === b.anchor.startSelector) {
        return b.anchor.startOffset - a.anchor.startOffset;
      }
      // セレクタが異なる場合は元の順序維持
      return 0;
    });

    for (var i = 0; i < sorted.length; i++) {
      var range = resolveAnchor(sorted[i].anchor);
      if (range) {
        applyHighlight(range, sorted[i].id);
      }
    }
  }

  // ===== UI構築 =====

  function buildUI() {
    var headerRight = document.querySelector(".header-right");
    if (!headerRight) return;

    // レビュー切替ボタン
    var reviewBtn = document.createElement("button");
    reviewBtn.id = "review-toggle";
    reviewBtn.setAttribute("aria-label", "レビューモード");
    reviewBtn.setAttribute("title", "レビューモード");
    reviewBtn.innerHTML = "&#9998;";
    reviewBtn.style.display = "flex";
    if (isReviewMode) reviewBtn.classList.add("active");
    headerRight.insertBefore(reviewBtn, headerRight.firstChild);

    // パネルボタン
    var panelBtn = document.createElement("button");
    panelBtn.id = "review-panel-btn";
    panelBtn.setAttribute("title", "コメント一覧");
    panelBtn.innerHTML = "&#9776;";
    headerRight.insertBefore(panelBtn, reviewBtn.nextSibling);

    // パネル
    panelEl = document.createElement("aside");
    panelEl.className = "review-panel";
    panelEl.innerHTML =
      '<div class="review-panel-header">' +
      "<h3>レビューコメント</h3>" +
      '<div class="review-panel-header-actions">' +
      '<div style="position:relative;display:inline-block">' +
      '<button id="review-export-btn" title="エクスポート">&#8681; 出力</button>' +
      "</div>" +
      '<button id="review-panel-close">&times;</button>' +
      "</div>" +
      "</div>" +
      '<div class="review-panel-body"></div>';
    document.body.appendChild(panelEl);

    // オーバーレイ
    overlayEl = document.createElement("div");
    overlayEl.className = "review-overlay";
    document.body.appendChild(overlayEl);
  }

  // ===== ポップアップ =====

  function removePopup() {
    var existing = document.querySelector(".review-popup");
    if (existing) existing.remove();
  }

  function positionPopup(popup, rect) {
    var top = rect.bottom + window.scrollY + 8;
    var left = rect.left + window.scrollX;

    // 画面外に出ないよう調整
    document.body.appendChild(popup);
    var pw = popup.offsetWidth;
    if (left + pw > window.innerWidth - 16) {
      left = window.innerWidth - pw - 16;
    }
    if (left < 8) left = 8;

    popup.style.top = top + "px";
    popup.style.left = left + "px";
  }

  // 新規コメント追加ポップアップ
  function showAddPopup(savedRange) {
    removePopup();

    var rect = savedRange.getBoundingClientRect();
    var selectedText = savedRange.toString().trim();

    var popup = document.createElement("div");
    popup.className = "review-popup";
    popup.innerHTML =
      '<div class="review-popup-selected">' +
      escapeHtml(truncate(selectedText, 100)) +
      "</div>" +
      '<textarea placeholder="コメントを入力..."></textarea>' +
      '<div class="review-popup-actions">' +
      '<button class="review-btn review-btn-cancel">取消</button>' +
      '<button class="review-btn review-btn-save">保存</button>' +
      "</div>";

    positionPopup(popup, rect);

    var textarea = popup.querySelector("textarea");
    setTimeout(function () {
      textarea.focus();
    }, 50);

    // 保存
    function doSave() {
      var text = textarea.value.trim();
      if (!text) return;
      addComment(savedRange, text);
      removePopup();
    }

    popup.querySelector(".review-btn-save").addEventListener("click", doSave);
    popup.querySelector(".review-btn-cancel").addEventListener("click", removePopup);

    textarea.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        removePopup();
      }
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        doSave();
      }
    });

    // ポップアップ外クリックで閉じる
    setTimeout(function () {
      document.addEventListener("mousedown", closePopupOutside);
    }, 100);
  }

  // コメント閲覧ポップアップ（ハイライトクリック時）
  function showViewPopup(markEl, comment) {
    removePopup();

    var rect = markEl.getBoundingClientRect();

    var popup = document.createElement("div");
    popup.className = "review-popup";
    popup.innerHTML =
      '<div class="review-popup-selected">' +
      escapeHtml(truncate(comment.anchor.selectedText, 100)) +
      "</div>" +
      '<div class="review-popup-comment">' +
      escapeHtml(comment.text) +
      "</div>" +
      '<div class="review-popup-actions">' +
      '<button class="review-btn review-btn-delete">削除</button>' +
      '<button class="review-btn">編集</button>' +
      '<button class="review-btn review-btn-cancel">閉じる</button>' +
      "</div>";

    positionPopup(popup, rect);

    // 編集
    popup.querySelectorAll(".review-btn")[1].addEventListener("click", function () {
      removePopup();
      showEditPopup(markEl, comment);
    });

    // 削除
    popup.querySelector(".review-btn-delete").addEventListener("click", function () {
      deleteComment(comment.id);
      removePopup();
    });

    popup.querySelector(".review-btn-cancel").addEventListener("click", removePopup);

    setTimeout(function () {
      document.addEventListener("mousedown", closePopupOutside);
    }, 100);
  }

  // コメント編集ポップアップ
  function showEditPopup(markEl, comment) {
    removePopup();

    var rect = markEl.getBoundingClientRect();

    var popup = document.createElement("div");
    popup.className = "review-popup";
    popup.innerHTML =
      '<div class="review-popup-selected">' +
      escapeHtml(truncate(comment.anchor.selectedText, 100)) +
      "</div>" +
      '<textarea>' + escapeHtml(comment.text) + "</textarea>" +
      '<div class="review-popup-actions">' +
      '<button class="review-btn review-btn-cancel">取消</button>' +
      '<button class="review-btn review-btn-save">保存</button>' +
      "</div>";

    positionPopup(popup, rect);

    var textarea = popup.querySelector("textarea");
    setTimeout(function () {
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }, 50);

    function doSave() {
      var text = textarea.value.trim();
      if (!text) return;
      editComment(comment.id, text);
      removePopup();
    }

    popup.querySelector(".review-btn-save").addEventListener("click", doSave);
    popup.querySelector(".review-btn-cancel").addEventListener("click", removePopup);

    textarea.addEventListener("keydown", function (e) {
      if (e.key === "Escape") removePopup();
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        doSave();
      }
    });

    setTimeout(function () {
      document.addEventListener("mousedown", closePopupOutside);
    }, 100);
  }

  function closePopupOutside(e) {
    var popup = document.querySelector(".review-popup");
    if (popup && !popup.contains(e.target)) {
      removePopup();
      document.removeEventListener("mousedown", closePopupOutside);
    }
  }

  // ===== パネル =====

  function togglePanel() {
    panelOpen = !panelOpen;
    if (panelOpen) {
      renderPanelComments();
      panelEl.classList.add("open");
      overlayEl.classList.add("visible");
    } else {
      panelEl.classList.remove("open");
      overlayEl.classList.remove("visible");
    }
  }

  function closePanel() {
    panelOpen = false;
    panelEl.classList.remove("open");
    overlayEl.classList.remove("visible");
  }

  function renderPanelComments() {
    var body = panelEl.querySelector(".review-panel-body");
    if (comments.length === 0) {
      body.innerHTML = '<div class="review-panel-empty">コメントはありません</div>';
      return;
    }

    var html = "";
    for (var i = 0; i < comments.length; i++) {
      var c = comments[i];
      html +=
        '<div class="review-item" data-id="' + c.id + '">' +
        '<div class="review-item-num">#' + (i + 1) + "</div>" +
        '<div class="review-item-selected">' +
        escapeHtml(truncate(c.anchor.selectedText, 80)) +
        "</div>" +
        '<div class="review-item-text">' +
        escapeHtml(c.text) +
        "</div>" +
        '<div class="review-item-actions">' +
        '<button class="btn-jump" title="該当箇所へ">&#8599; 移動</button>' +
        '<button class="btn-edit" title="編集">&#9998; 編集</button>' +
        '<button class="btn-delete" title="削除">&#10005; 削除</button>' +
        "</div>" +
        "</div>";
    }
    body.innerHTML = html;

    // イベント委任
    body.addEventListener("click", function (e) {
      var item = e.target.closest(".review-item");
      if (!item) return;
      var id = item.dataset.id;
      var comment = comments.find(function (c) { return c.id === id; });
      if (!comment) return;

      if (e.target.closest(".btn-jump")) {
        jumpToComment(id);
      } else if (e.target.closest(".btn-edit")) {
        var mark = chapterBody.querySelector('mark[data-comment-id="' + id + '"]');
        if (mark) {
          closePanel();
          showEditPopup(mark, comment);
        }
      } else if (e.target.closest(".btn-delete")) {
        deleteComment(id);
        renderPanelComments();
      }
    });
  }

  function jumpToComment(commentId) {
    var mark = chapterBody.querySelector('mark[data-comment-id="' + commentId + '"]');
    if (!mark) return;

    closePanel();

    mark.scrollIntoView({ behavior: "smooth", block: "center" });

    // フラッシュアニメーション
    mark.classList.remove("flash");
    void mark.offsetWidth; // リフロー強制
    mark.classList.add("flash");
    setTimeout(function () {
      mark.classList.remove("flash");
    }, 1200);
  }

  function updateBadge() {
    var reviewBtn = document.getElementById("review-toggle");
    var panelBtn = document.getElementById("review-panel-btn");
    if (!reviewBtn || !panelBtn) return;

    // バッジ
    var badge = reviewBtn.querySelector(".review-badge");
    if (comments.length > 0) {
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "review-badge";
        reviewBtn.appendChild(badge);
      }
      badge.textContent = comments.length;
      panelBtn.style.display = "flex";
    } else {
      if (badge) badge.remove();
      panelBtn.style.display = "none";
    }
  }

  // ===== コメント操作 =====

  function addComment(range, text) {
    var anchor = createAnchor(range);
    if (!anchor) return;

    var comment = {
      id: generateId(),
      text: text,
      createdAt: Date.now(),
      anchor: anchor,
    };

    comments.push(comment);
    saveComments();

    // ハイライト再描画
    restoreHighlights();
    updateBadge();
    if (panelOpen) renderPanelComments();
  }

  function editComment(id, newText) {
    var comment = comments.find(function (c) { return c.id === id; });
    if (!comment) return;
    comment.text = newText;
    saveComments();
    if (panelOpen) renderPanelComments();
  }

  function deleteComment(id) {
    comments = comments.filter(function (c) { return c.id !== id; });
    saveComments();
    removeHighlight(id);
    updateBadge();
    if (panelOpen) renderPanelComments();
  }

  // ===== エクスポート =====

  function getPageTitle() {
    var h1 = chapterBody.querySelector("h1");
    return h1 ? h1.textContent.trim() : pagePath;
  }

  function formatMarkdownPage(path, pageComments, title) {
    var lines = [];
    lines.push("## " + (title || path));
    lines.push("");

    for (var i = 0; i < pageComments.length; i++) {
      var c = pageComments[i];
      lines.push("### " + (i + 1) + ".");
      lines.push("**該当箇所**: " + c.anchor.selectedText);
      lines.push("**コメント**: " + c.text);
      lines.push("");
    }

    return lines.join("\n");
  }

  function exportCurrentPage() {
    if (comments.length === 0) return;

    var title = getPageTitle();
    var now = new Date().toISOString().split("T")[0];
    var content =
      "# レビューコメント\n\n" +
      "**ページ**: " + title + "\n" +
      "**作成日**: " + now + "\n" +
      "**コメント数**: " + comments.length + "\n\n---\n\n" +
      formatMarkdownPage(pagePath, comments, title);

    downloadFile(content, "review-" + now + ".md");
  }

  function exportAllPages() {
    var allData = loadAllComments();
    var pages = Object.keys(allData).filter(function (k) {
      return allData[k].length > 0;
    });

    if (pages.length === 0) return;

    var now = new Date().toISOString().split("T")[0];
    var totalCount = 0;
    var sections = [];

    for (var i = 0; i < pages.length; i++) {
      var pageComments = allData[pages[i]];
      totalCount += pageComments.length;
      sections.push(formatMarkdownPage(pages[i], pageComments));
    }

    var content =
      "# レビューコメント（全ページ）\n\n" +
      "**作成日**: " + now + "\n" +
      "**総コメント数**: " + totalCount + "\n" +
      "**対象ページ数**: " + pages.length + "\n\n---\n\n" +
      sections.join("\n---\n\n");

    downloadFile(content, "review-all-" + now + ".md");
  }

  function exportJson() {
    var allData = loadAllComments();
    var content = JSON.stringify(allData, null, 2);
    var now = new Date().toISOString().split("T")[0];
    downloadFile(content, "review-" + now + ".json");
  }

  function downloadFile(content, filename) {
    var blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ===== イベントハンドラ =====

  function setupEvents() {
    var reviewBtn = document.getElementById("review-toggle");
    var panelBtn = document.getElementById("review-panel-btn");

    // レビューモード切替
    if (reviewBtn) {
      reviewBtn.addEventListener("click", function () {
        isReviewMode = !isReviewMode;
        localStorage.setItem(MODE_KEY, isReviewMode ? "true" : "false");
        reviewBtn.classList.toggle("active", isReviewMode);
      });
    }

    // パネル開閉
    if (panelBtn) {
      panelBtn.addEventListener("click", togglePanel);
    }

    // パネル閉じるボタン
    panelEl.querySelector("#review-panel-close").addEventListener("click", closePanel);

    // オーバーレイクリックで閉じる
    overlayEl.addEventListener("click", closePanel);

    // エクスポートボタン
    var exportBtn = panelEl.querySelector("#review-export-btn");
    if (exportBtn) {
      exportBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        var existing = document.querySelector(".review-export-menu");
        if (existing) {
          existing.remove();
          return;
        }

        var menu = document.createElement("div");
        menu.className = "review-export-menu";
        menu.innerHTML =
          "<button data-action=\"current\">このページ (Markdown)</button>" +
          "<button data-action=\"all\">全ページ (Markdown)</button>" +
          "<button data-action=\"json\">全ページ (JSON)</button>";

        exportBtn.parentNode.appendChild(menu);

        menu.addEventListener("click", function (ev) {
          var action = ev.target.dataset.action;
          if (action === "current") exportCurrentPage();
          else if (action === "all") exportAllPages();
          else if (action === "json") exportJson();
          menu.remove();
        });

        // メニュー外クリックで閉じる
        setTimeout(function () {
          document.addEventListener(
            "click",
            function closeMenu() {
              menu.remove();
              document.removeEventListener("click", closeMenu);
            },
            { once: true }
          );
        }, 10);
      });
    }

    // テキスト選択検出
    chapterBody.addEventListener("mouseup", function (e) {
      // ポップアップ内のクリックは無視
      if (e.target.closest(".review-popup")) return;

      // レビューモードでない場合は無視
      if (!isReviewMode) return;

      var selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;

      var range = selection.getRangeAt(0);

      // chapter-body内の選択のみ
      if (!chapterBody.contains(range.commonAncestorContainer)) return;

      var text = range.toString().trim();
      if (!text) return;

      // 範囲を保存（selection消失対策）
      var savedRange = range.cloneRange();

      // 少し遅延してポップアップ表示
      setTimeout(function () {
        showAddPopup(savedRange);
      }, 50);
    });

    // ハイライトクリック
    chapterBody.addEventListener("click", function (e) {
      var mark = e.target.closest("mark.review-highlight");
      if (!mark) return;

      var commentId = mark.dataset.commentId;
      var comment = comments.find(function (c) { return c.id === commentId; });
      if (!comment) return;

      e.preventDefault();
      e.stopPropagation();
      showViewPopup(mark, comment);
    });

    // Escでパネルを閉じる
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        if (panelOpen) closePanel();
        removePopup();
      }
    });
  }

  // ===== 初期化実行 =====
  buildUI();
  restoreHighlights();
  setupEvents();
  updateBadge();
})();
