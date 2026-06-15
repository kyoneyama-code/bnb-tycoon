// ============================================================
//  案件ダッシュボード 共通エンジン
//  ------------------------------------------------------------
//  各サイト（MTR / AP）のHTMLが window.SITE_CATEGORIES を定義した
//  あとにこのファイルを読み込みます。データは data-biz2025.js の
//  window.DASHBOARD_DATA が唯一の供給元です。
// ============================================================
const CATEGORIES = window.SITE_CATEGORIES || [];

  // ============================================================
  //  ステータスバッジカラー
  // ============================================================
  const STATUS_COLORS = {
    "検討中":   { bg: "#f7eed8", text: "#9a6a18" },
    "交渉中":   { bg: "#e7efe9", text: "#2f5d50" },
    "進行中":   { bg: "#e7efe9", text: "#2f5d50" },
    "申請中":   { bg: "#f7eed8", text: "#9a6a18" },
    "契約済":   { bg: "#e0ede6", text: "#2f5d50" },
    "完了":     { bg: "#e0ede6", text: "#2f5d50" },
    "取得済":   { bg: "#e0ede6", text: "#2f5d50" },
    "稼働中":   { bg: "#e0ede6", text: "#2f5d50" },
    "見送り":   { bg: "#efece4", text: "#7c8580" },
    "保留":     { bg: "#efece4", text: "#7c8580" },
    "停止中":   { bg: "#efece4", text: "#7c8580" },
    "要確認":   { bg: "#f6e3df", text: "#b13b2b" },
    "期限超過": { bg: "#f6e3df", text: "#b13b2b" },
    "★★★★★": { bg: "#e0ede6", text: "#2f5d50" },
    "★★★★":  { bg: "#f7eed8", text: "#9a6a18" },
    "★★★":   { bg: "#efece4", text: "#7c8580" },
  };

  // ============================================================
  //  State
  // ============================================================
  const allData = {};
  let fuseIndex = null;
  let searchDocs = [];
  let currentModal = null;
  let isSearchActive = false;

  // ============================================================
  //  CSV パーサー
  // ============================================================
  function parseCSVLine(line) {
    const result = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i+1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (c === ',' && !inQ) { result.push(cur); cur = ''; }
      else cur += c;
    }
    result.push(cur);
    return result;
  }

  function parseCSV(text) {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const headers = parseCSVLine(lines[0]).map(h => h.trim());
    return lines.slice(1).filter(l => l.trim()).map(line => {
      const vals = parseCSVLine(line);
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim(); });
      return obj;
    });
  }

  // ============================================================
  //  データ読み込み
  // ============================================================
  function loadCategory(cat) {
    const d = (window.DASHBOARD_DATA && window.DASHBOARD_DATA[cat.id]);
    if (Array.isArray(d)) return d;
    return [];   // データは data-biz2025.js が唯一の供給元
  }

  function loadAll() {
    let total = 0;
    CATEGORIES.forEach(cat => {
      allData[cat.id] = loadCategory(cat);
      total += allData[cat.id].length;
    });

    document.getElementById('total-count').textContent = `合計 ${total} 件`;
    const meta = window.DASHBOARD_META;
    document.getElementById('last-update').textContent =
      (meta && meta.updated) ? `${meta.updated} 更新` : '';
  }

  // ============================================================
  //  検索 (Fuse.js)
  // ============================================================
  function buildSearchIndex() {
    searchDocs = [];
    CATEGORIES.forEach(cat => {
      (allData[cat.id] || []).forEach((item, idx) => {
        searchDocs.push({
          _catId:   cat.id,
          _catName: cat.name,
          _catIcon: cat.icon,
          _idx:     idx,
          searchText: Object.values(item).filter(Boolean).join(' '),
        });
      });
    });
    fuseIndex = new Fuse(searchDocs, {
      keys: ['searchText'],
      threshold: 0.4,
      minMatchCharLength: 1,
      includeScore: true,
      ignoreLocation: true,
    });
  }

  let searchTimer = null;

  function onSearchInput(q) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => doSearch(q.trim()), 150);
  }

  function doSearch(q) {
    const sv  = document.getElementById('search-view');
    const cv  = document.getElementById('categories-view');
    const tabs = document.getElementById('cat-tabs');
    const clrBtn = document.getElementById('search-clear');
    const banner = document.getElementById('sample-banner');

    if (!q) {
      sv.classList.remove('active');
      cv.style.display = '';
      tabs.style.display = '';
      banner.style.display = banner._wasShown ? 'flex' : 'none';
      clrBtn.classList.add('hidden');
      isSearchActive = false;
      return;
    }

    clrBtn.classList.remove('hidden');
    isSearchActive = true;
    banner._wasShown = banner.style.display !== 'none';
    cv.style.display = 'none';
    tabs.style.display = 'none';
    banner.style.display = 'none';
    sv.classList.add('active');

    const hits = fuseIndex.search(q);
    document.getElementById('search-hd').textContent =
      `「${q}」の検索結果: ${hits.length} 件`;

    if (!hits.length) {
      document.getElementById('search-results').innerHTML = `
        <div class="no-results">
          <div class="no-results-icon">🔍</div>
          <div>検索結果が見つかりませんでした</div>
          <div style="font-size:12px;margin-top:6px;color:var(--text-muted)">別のキーワードを試してみてください</div>
        </div>`;
      return;
    }

    // Group by category
    const grouped = {};
    hits.forEach(r => {
      const id = r.item._catId;
      if (!grouped[id]) grouped[id] = [];
      grouped[id].push(r.item);
    });

    let html = '';
    Object.entries(grouped).forEach(([catId, docs]) => {
      const cat = CATEGORIES.find(c => c.id === catId);
      if (!cat) return;
      html += `<div class="search-result-group">
        <div class="search-group-hd">
          <span>${cat.icon}</span>
          <span>${esc(cat.name)}</span>
          <span style="margin-left:auto;font-family:var(--font-disp);color:var(--accent)">${docs.length}件</span>
        </div>
        <div class="cards-grid">`;
      docs.forEach(doc => {
        html += renderCard(cat, allData[doc._catId][doc._idx], doc._idx);
      });
      html += '</div></div>';
    });
    document.getElementById('search-results').innerHTML = html;
  }

  function clearSearch() {
    document.getElementById('search-input').value = '';
    doSearch('');
  }

  // ============================================================
  //  ユーティリティ
  // ============================================================
  function esc(s) {
    return String(s||'')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function isUrl(s) {
    if (!s) return false;
    if (s.startsWith('http://') || s.startsWith('https://')) return true;
    // リポジトリ内ファイル（相対パス）も許可: docs/foo.pdf, ./foo.pdf, *.pdf 等
    return /^(\.?\/)?[\w./%\-－ぁ-んァ-ヶ一-龯]+\.(pdf|png|jpe?g|gif|webp|docx?|xlsx?|pptx?)$/i.test(s)
        || s.startsWith('docs/');
  }

  function badge(val) {
    if (!val) return '';
    const c = STATUS_COLORS[val] || { bg: '#f1f5f9', text: '#64748b' };
    return `<span class="badge" style="background:${c.bg};color:${c.text}">${esc(val)}</span>`;
  }

  function showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 3500);
  }

  // ============================================================
  //  カードレンダリング
  // ============================================================
  function renderCard(cat, item, idx) {
    const titleVal    = item[cat.titleColumn] || '（未入力）';
    const subtitleVal = item[cat.subtitleColumn] || '';
    const statusVal   = cat.statusColumn ? item[cat.statusColumn] : '';
    const linkUrl     = cat.titleLinkColumn ? item[cat.titleLinkColumn] : '';

    const titleHtml = (linkUrl && isUrl(linkUrl))
      ? `<a href="${esc(linkUrl)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${esc(titleVal)} ↗</a>`
      : esc(titleVal);

    let fieldsHtml = '';
    if (cat.cardFields?.length) {
      const fItems = cat.cardFields.filter(f => item[f.column]);
      if (fItems.length) {
        fieldsHtml = `<div class="card-fields">${
          fItems.map(f => `<div class="cf-item">
            <span class="cf-label">${esc(f.label)}</span>
            <span class="cf-val">${esc(item[f.column])}</span>
          </div>`).join('')
        }</div>`;
      }
    }

    const links = (cat.linkDefs||[]).filter(l => isUrl(item[l.column]));
    const linksHtml = links.length
      ? `<div class="link-chips">${links.map(l =>
          `<a class="link-chip" href="${esc(item[l.column])}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${l.icon} ${esc(l.label)}</a>`
        ).join('')}</div>` : '';

    return `<div class="card" onclick="openModal('${cat.id}',${idx})">
      <div class="card-head">
        <div class="card-title">${titleHtml}</div>
        ${badge(statusVal)}
      </div>
      ${subtitleVal ? `<div class="card-sub">${esc(subtitleVal)}</div>` : ''}
      ${fieldsHtml}
      ${linksHtml}
    </div>`;
  }

  // ============================================================
  //  カテゴリセクションレンダリング
  // ============================================================
  function renderCategorySection(cat, isFirst) {
    const items = allData[cat.id] || [];
    const cardsHtml = items.length
      ? `<div class="cards-grid">${items.map((item,idx) => renderCard(cat,item,idx)).join('')}</div>`
      : `<div class="empty-state">データがありません</div>`;

    return `<div class="cat-section${isFirst?' open':''}" id="cat-${cat.id}">
      <div class="cat-header" onclick="toggleCat('${cat.id}')">
        <span class="cat-icon">${cat.icon}</span>
        <span class="cat-name">${esc(cat.name)}</span>
        <span class="cat-badge">${items.length}</span>
        <span class="cat-chevron">▼</span>
      </div>
      <div class="cat-body">${cardsHtml}</div>
    </div>`;
  }

  // ============================================================
  //  全体レンダリング
  // ============================================================
  function renderAll() {
    // Tabs
    document.getElementById('cat-tabs').innerHTML =
      CATEGORIES.map((cat, i) => {
        const cnt = (allData[cat.id]||[]).length;
        return `<button class="cat-tab${i===0?' active':''}" onclick="scrollToCat('${cat.id}',this)">
          ${cat.icon} ${esc(cat.name)}
          <span class="tab-count">${cnt}</span>
        </button>`;
      }).join('');

    // Categories
    document.getElementById('categories-view').innerHTML =
      CATEGORIES.map((cat, i) => renderCategorySection(cat, i===0)).join('');
  }

  // ============================================================
  //  モーダル
  // ============================================================
  function openModal(catId, idx) {
    const cat  = CATEGORIES.find(c => c.id === catId);
    const item = allData[catId]?.[idx];
    if (!cat || !item) return;
    currentModal = { catId, idx };

    const titleVal    = item[cat.titleColumn] || '（未入力）';
    const subtitleVal = item[cat.subtitleColumn] || '';
    const statusVal   = cat.statusColumn ? item[cat.statusColumn] : '';
    const skipCols    = new Set([cat.titleColumn, cat.subtitleColumn, cat.statusColumn]);
    const linkCols    = new Set((cat.linkDefs||[]).map(l => l.column));

    let fieldsHtml = '<div class="modal-fields">';
    Object.entries(item).forEach(([k, v]) => {
      if (!v || skipCols.has(k) || linkCols.has(k)) return;
      fieldsHtml += `<div class="mf-item">
        <div class="mf-label">${esc(k)}</div>
        <div class="mf-val">${esc(v)}</div>
      </div>`;
    });
    fieldsHtml += '</div>';

    const links = (cat.linkDefs||[]).filter(l => isUrl(item[l.column]));
    const linksHtml = links.length
      ? `<div class="modal-links">${links.map(l =>
          `<a class="modal-link-btn" href="${esc(item[l.column])}" target="_blank" rel="noopener">${l.icon} ${esc(l.label)}</a>`
        ).join('')}</div>` : '';

    document.getElementById('modal-body').innerHTML = `
      <div class="modal-cat-label">${cat.icon} ${esc(cat.name)}</div>
      <div class="modal-title">${esc(titleVal)}</div>
      ${subtitleVal ? `<div class="modal-sub">${esc(subtitleVal)}</div>` : ''}
      ${statusVal ? `<div style="margin-bottom:10px">${badge(statusVal)}</div>` : ''}
      <div class="modal-divider"></div>
      ${fieldsHtml}
      ${linksHtml}`;

    document.getElementById('modal-backdrop').classList.add('active');
    requestAnimationFrame(() => {
      document.getElementById('modal-panel').classList.add('active');
    });
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    document.getElementById('modal-panel').classList.remove('active');
    document.getElementById('modal-backdrop').classList.remove('active');
    document.body.style.overflow = '';
    currentModal = null;
  }

  // ============================================================
  //  UI ヘルパー
  // ============================================================
  function toggleCat(id) {
    document.getElementById(`cat-${id}`)?.classList.toggle('open');
  }

  function scrollToCat(id, btn) {
    document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    const sec = document.getElementById(`cat-${id}`);
    if (sec) {
      sec.classList.add('open');
      setTimeout(() => sec.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
    }
  }

  // ============================================================
  //  イベント
  // ============================================================
  document.getElementById('search-input').addEventListener('input', e => onSearchInput(e.target.value));
  document.getElementById('search-clear').addEventListener('click', clearSearch);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (currentModal)     { closeModal(); return; }
      if (isSearchActive)   { clearSearch(); return; }
    }
  });

  // ============================================================
  //  初期化
  // ============================================================
  (function init() {
    loadAll();
    renderAll();
    buildSearchIndex();
    document.getElementById('loading').classList.add('hidden');
  })();

