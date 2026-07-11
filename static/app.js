const state = {
  papers: [],
  projects: [],
  selectedId: null,
  selectedProject: null,
  readerPaper: null,
  readerAsset: null,
  status: "",
  topic: "",
  view: "recommended",
  refreshPoll: null,
  total: 0,
  pageSize: 100,
  stats: null,
};

const el = (id) => document.getElementById(id);

const escapeHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const api = async (path, options = {}) => {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `请求失败：${response.status}`);
  return payload;
};

const debounce = (fn, delay = 260) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};

function toast(message, error = false) {
  const item = document.createElement("div");
  item.className = `toast${error ? " is-error" : ""}`;
  item.textContent = message;
  el("toastRegion").append(item);
  setTimeout(() => item.remove(), 3200);
}

function formatDate(value) {
  if (!value) return "日期未知";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function lastSyncLabel(latest) {
  if (!latest?.finished_at) return "尚未同步";
  const date = new Date(latest.finished_at);
  return Number.isNaN(date.getTime()) ? latest.finished_at : new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

function currentParams() {
  const params = new URLSearchParams();
  const values = {
    q: el("searchInput").value.trim(),
    topic: state.topic || el("topicFilter").value,
    venue: el("venueFilter").value,
    author: el("authorFilter").value.trim(),
    institution: el("institutionFilter").value,
    source: el("sourceFilter").value,
    tier: el("tierFilter").value,
    platform: el("platformFilter").value,
    top: state.view === "top" ? "1" : "",
    date_from: el("dateFilter").value,
    sort: el("sortFilter").value,
    status: state.status,
    favorite: state.view === "favorites" ? "1" : "",
  };
  Object.entries(values).forEach(([key, value]) => value && params.set(key, value));
  return params;
}

function projectParams() {
  const params = new URLSearchParams();
  const values = {
    q: el("searchInput").value.trim(),
    topic: state.topic || el("topicFilter").value,
    language: el("projectLanguageFilter").value,
    date_from: el("dateFilter").value,
    sort: el("projectSortFilter").value,
  };
  Object.entries(values).forEach(([key, value]) => value && params.set(key, value));
  return params;
}

function applyViewMode() {
  const projectMode = state.view === "projects";
  const recommendedMode = state.view === "recommended";
  document.querySelector(".content-grid").classList.toggle("is-recommended", recommendedMode);
  document.querySelectorAll(".paper-only-filter").forEach((item) => { item.hidden = projectMode || recommendedMode; });
  document.querySelectorAll(".project-only-filter").forEach((item) => { item.hidden = !projectMode; });
  el("dateFilter").closest("label").hidden = recommendedMode;
  document.querySelector(".score-guide").hidden = projectMode;
  el("streamTitle").textContent = projectMode ? "GitHub 项目" : recommendedMode ? "每日精选" : "论文流";
  el("loadMoreButton").textContent = projectMode ? "加载更多项目" : "加载更多论文";
  document.querySelector(".stream-head .status-tabs").hidden = projectMode || recommendedMode;
  el("overviewTitle").textContent = projectMode ? "今天有哪些项目在更新" : recommendedMode ? "今天先读这几篇" : "今天值得读什么";
  el("overviewMessage").textContent = projectMode ? "跟踪具身智能与大模型开源仓库，并连接对应论文。" : recommendedMode ? "从完整候选池中按领域、刊物、时效、全文证据与复现线索二次筛选。" : "浏览全部公开论文元数据与来源。";
  el("statTotalLabel").textContent = projectMode ? "GitHub 项目" : recommendedMode ? "今日精选" : "收录论文";
  el("statUnreadLabel").textContent = projectMode ? "今日更新" : recommendedMode ? "候选池" : "未读";
  el("statFavoriteLabel").textContent = projectMode ? "论文关联" : "已收藏";
  if (state.stats) {
    el("statTotal").textContent = projectMode ? state.stats.project_total : recommendedMode ? state.total : state.stats.total;
    el("statUnread").textContent = projectMode ? state.stats.project_updated_today : recommendedMode ? state.stats.total : state.stats.unread;
    el("statFavorite").textContent = projectMode ? state.stats.project_link_count : state.stats.favorites;
    if (!state.stats.refresh.running) el("refreshButton").textContent = projectMode ? "更新全部" : "更新论文";
  }
}

function renderSkeleton() {
  el("emptyState").hidden = true;
  el("loadMoreWrap").hidden = true;
  el("paperList").innerHTML = Array.from({ length: 5 }, () => `
    <div class="skeleton-row" aria-hidden="true">
      <div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div>
    </div>`).join("");
}

async function loadProjects({ append = false } = {}) {
  if (!append) renderSkeleton();
  try {
    const params = projectParams();
    params.set("limit", state.pageSize);
    params.set("offset", append ? state.projects.length : 0);
    const payload = await api(`/api/projects?${params.toString()}`);
    state.projects = append ? [...state.projects, ...payload.items] : payload.items;
    state.total = payload.total;
    renderProjects();
    el("resultCount").textContent = `${payload.total} 个`;
    el("loadMoreWrap").hidden = !payload.has_more;
    if (!append && !state.projects.some((project) => project.full_name === state.selectedProject)) {
      state.selectedProject = null;
      showReadingEmpty();
    }
  } catch (error) {
    if (append) {
      toast(error.message, true);
      return;
    }
    el("paperList").innerHTML = "";
    el("emptyState").hidden = false;
    el("emptyState").querySelector("strong").textContent = "GitHub 项目加载失败";
    el("emptyState").querySelector("p").textContent = error.message;
    toast(error.message, true);
  }
}

function renderProjects() {
  const list = el("paperList");
  list.innerHTML = "";
  el("emptyState").hidden = state.projects.length > 0;
  if (!state.projects.length) {
    el("emptyState").querySelector("strong").textContent = "当前筛选没有 GitHub 项目";
    el("emptyState").querySelector("p").textContent = "调整主题、语言或起始日期后重试。";
  }
  for (const project of state.projects) {
    const row = document.createElement("article");
    row.className = `paper-row project-row${project.full_name === state.selectedProject ? " is-selected" : ""}`;
    row.tabIndex = 0;
    row.innerHTML = `
      <div>
        <div class="paper-kicker">
          <span class="venue">${escapeHtml(project.categories.join(" · ") || "相关项目")}</span>
          <span>${escapeHtml(project.language || "语言未标注")}</span>
          <span>更新于 ${escapeHtml(formatDate(project.pushed_at?.slice(0, 10)))}</span>
        </div>
        <h3 class="paper-title">${escapeHtml(project.full_name)}</h3>
        <div class="project-description">${escapeHtml(project.description || "仓库暂未提供简介")}</div>
        <div class="paper-topics">${project.topics.slice(0, 5).map((topic) => `<span class="topic-tag">${escapeHtml(topic)}</span>`).join("")}</div>
      </div>
      <div class="paper-score project-score">
        <strong>${project.stars}</strong>
        <span>Stars</span>
        <b>${project.linked_paper_count} 篇论文</b>
      </div>`;
    row.addEventListener("click", () => openProject(project.full_name));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openProject(project.full_name);
      }
    });
    list.append(row);
  }
}

async function openProject(fullName, openPane = true) {
  state.selectedProject = fullName;
  const url = new URL(window.location.href);
  url.searchParams.set("view", "projects");
  url.searchParams.set("project", fullName);
  url.searchParams.delete("paper");
  window.history.replaceState({}, "", url);
  renderProjects();
  el("readingEmpty").hidden = true;
  el("paperDetail").hidden = false;
  el("paperDetail").innerHTML = `<div class="detail-shell"><div class="skeleton-line" style="width:42%"></div><div class="skeleton-line" style="width:90%;height:22px"></div><div class="skeleton-line" style="width:72%"></div></div>`;
  if (openPane) el("readingPane").classList.add("is-open");
  try {
    const project = await api(`/api/projects/${encodeURIComponent(fullName)}`);
    renderProjectDetail(project);
  } catch (error) {
    toast(error.message, true);
  }
}

function renderProjectDetail(project) {
  el("paperDetail").innerHTML = `
    <div class="detail-shell">
      <div class="detail-actions">
        <button type="button" data-close-detail>返回列表</button>
        <a href="${escapeHtml(project.url)}" target="_blank" rel="noreferrer">打开 GitHub</a>
        ${project.homepage ? `<a href="${escapeHtml(project.homepage)}" target="_blank" rel="noreferrer">项目主页</a>` : ""}
      </div>
      <h2 class="detail-title">${escapeHtml(project.full_name)}</h2>
      <p class="detail-byline">${escapeHtml(project.description || "仓库暂未提供简介")}</p>
      <div class="detail-meta">
        <span>Stars ${project.stars}</span><span>Forks ${project.forks}</span><span>Issues ${project.open_issues}</span>
        <span>${escapeHtml(project.language || "语言未标注")}</span><span>${escapeHtml(project.license || "许可证未标注")}</span>
        <span>更新于 ${escapeHtml(formatDate(project.pushed_at?.slice(0, 10)))}</span>
      </div>
      <div class="paper-topics">${project.topics.map((topic) => `<span class="topic-tag">${escapeHtml(topic)}</span>`).join("")}</div>
      <section class="detail-section">
        <h3>关联论文</h3>
        ${project.papers?.length ? `<div class="linked-list">${project.papers.map((paper) => `
          <button type="button" data-linked-paper="${escapeHtml(paper.id)}">
            <strong>${escapeHtml(paper.title)}</strong><span>${escapeHtml(paper.venue)} · 匹配 ${Math.round(paper.project_score)}</span>
          </button>`).join("")}</div>` : `<p>暂未找到高置信度论文关联。项目仍会保留在每日更新流中。</p>`}
      </section>
    </div>`;
  el("paperDetail").querySelector("[data-close-detail]").addEventListener("click", showReadingEmpty);
  el("paperDetail").querySelectorAll("[data-linked-paper]").forEach((button) => button.addEventListener("click", async () => {
    state.view = "all";
    state.topic = "";
    applyViewMode();
    document.querySelectorAll(".rail-link").forEach((item) => item.classList.toggle("is-active", item.dataset.view === "all"));
    await loadPapers({ preserveSelection: false });
    await openPaper(button.dataset.linkedPaper);
  }));
}

async function loadPapers({ preserveSelection = true, append = false } = {}) {
  if (state.view === "projects") return loadProjects({ append });
  if (!append) renderSkeleton();
  try {
    if (state.view === "recommended") {
      const params = new URLSearchParams();
      const topic = state.topic || el("topicFilter").value;
      if (topic) params.set("topic", topic);
      const payload = await api(`/api/recommendations?${params.toString()}`);
      state.papers = payload.items;
      state.total = payload.total;
      renderPapers();
      el("resultCount").textContent = `${payload.total} 篇 · 每领域最多 ${payload.per_topic} 篇`;
      el("loadMoreWrap").hidden = true;
      el("navRecommendedCount").textContent = payload.total;
      if (state.stats) el("statTotal").textContent = payload.total;
      return;
    }
    const params = currentParams();
    params.set("limit", state.pageSize);
    params.set("offset", append ? state.papers.length : 0);
    const payload = await api(`/api/papers?${params.toString()}`);
    state.papers = append ? [...state.papers, ...payload.items] : payload.items;
    state.total = payload.total;
    renderPapers();
    el("resultCount").textContent = `${payload.total} 篇`;
    el("loadMoreWrap").hidden = !payload.has_more;
    if (append) return;
    if (!preserveSelection || !state.papers.some((paper) => paper.id === state.selectedId)) {
      state.selectedId = null;
      showReadingEmpty();
    } else if (state.selectedId) {
      await openPaper(state.selectedId, false);
    }
  } catch (error) {
    if (append) {
      toast(error.message, true);
      return;
    }
    el("paperList").innerHTML = "";
    el("emptyState").hidden = false;
    el("emptyState").querySelector("strong").textContent = "论文列表加载失败";
    el("emptyState").querySelector("p").textContent = error.message;
    toast(error.message, true);
  }
}

function renderPapers() {
  const list = el("paperList");
  list.innerHTML = "";
  el("emptyState").hidden = state.papers.length > 0;
  let currentGroup = "";
  for (const paper of state.papers) {
    if (state.view === "recommended" && paper.recommendation_topic !== currentGroup) {
      currentGroup = paper.recommendation_topic;
      const group = document.createElement("div");
      group.className = "recommendation-group";
      group.innerHTML = `<strong>${escapeHtml(currentGroup)}</strong><span>今日优先阅读</span>`;
      list.append(group);
    }
    const row = document.createElement("article");
    row.className = `paper-row${paper.id === state.selectedId ? " is-selected" : ""}${paper.is_recommended ? " is-recommended" : ""}`;
    row.tabIndex = 0;
    row.dataset.id = paper.id;
    row.setAttribute("aria-label", `打开论文：${paper.title}`);
    row.innerHTML = `
      <div>
        <div class="paper-kicker">
          <span class="venue">${escapeHtml(paper.venue || paper.source)}</span>
          <span class="venue-tier">${escapeHtml(paper.venue_tier)}</span>
          <span>${escapeHtml(formatDate(paper.published))}</span>
          <span>${escapeHtml(paper.status === "read" ? "已读" : paper.status === "reading" ? "在读" : "未读")}</span>
        </div>
        <h3 class="paper-title">${escapeHtml(paper.title)}</h3>
        <div class="paper-authors">${escapeHtml(paper.authors.join(" · ") || "作者信息缺失")}</div>
        <div class="paper-topics">${paper.topics.map((topic) => `<span class="topic-tag">${escapeHtml(topic)}</span>`).join("")}</div>
        ${paper.notable_institutions?.length ? `<div class="institution-tags">${paper.notable_institutions.slice(0, 3).map((institution) => `<span title="${escapeHtml(institution.strengths.join(" · "))}">${escapeHtml(institution.name)}</span>`).join("")}</div>` : ""}
      </div>
      <div class="paper-score">
        <button class="favorite-toggle${paper.favorite ? " is-active" : ""}" type="button" aria-label="${paper.favorite ? "取消收藏" : "收藏论文"}" data-favorite>${paper.favorite ? "★" : "☆"}</button>
        <strong>${Math.round(paper.recommendation_score ?? paper.quality_score)}</strong>
        <span>${paper.is_recommended ? "精选分" : "推荐分"}</span>
        ${paper.is_recommended ? `<b class="pdf-state ${paper.fulltext_cached ? "is-ready" : ""}">${paper.fulltext_cached ? "全文已缓存" : paper.pdf_cached ? "PDF 已缓存" : "点击查找 PDF"}</b>` : ""}
      </div>`;
    row.addEventListener("click", (event) => {
      if (event.target.closest("[data-favorite]")) return;
      if (paper.is_recommended) openReader(paper.id);
      else openPaper(paper.id);
    });
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (paper.is_recommended) openReader(paper.id);
        else openPaper(paper.id);
      }
    });
    row.querySelector("[data-favorite]").addEventListener("click", (event) => toggleFavorite(event, paper));
    list.append(row);
  }
}

async function toggleFavorite(event, paper) {
  event.stopPropagation();
  try {
    await api(`/api/papers/${encodeURIComponent(paper.id)}/state`, {
      method: "POST",
      body: JSON.stringify({ favorite: !paper.favorite }),
    });
    paper.favorite = !paper.favorite;
    renderPapers();
    loadStats();
    toast(paper.favorite ? "已加入收藏" : "已取消收藏");
  } catch (error) {
    toast(error.message, true);
  }
}

async function openPaper(paperId, openPane = true) {
  state.selectedId = paperId;
  const url = new URL(window.location.href);
  url.searchParams.set("paper", paperId);
  url.searchParams.delete("project");
  url.searchParams.delete("view");
  window.history.replaceState({}, "", url);
  renderPapers();
  el("readingEmpty").hidden = true;
  el("paperDetail").hidden = false;
  el("paperDetail").innerHTML = `<div class="detail-shell"><div class="skeleton-line" style="width:42%"></div><div class="skeleton-line" style="width:90%;height:22px"></div><div class="skeleton-line" style="width:72%"></div></div>`;
  if (openPane) el("readingPane").classList.add("is-open");
  try {
    const paper = await api(`/api/papers/${encodeURIComponent(paperId)}`);
    renderDetail(paper);
  } catch (error) {
    toast(error.message, true);
  }
}

function renderDetail(paper) {
  const explanation = paper.explanation;
  el("paperDetail").innerHTML = `
    <div class="detail-shell">
      <div class="detail-actions">
        <button type="button" data-close-detail>返回列表</button>
        <button type="button" data-favorite-detail>${paper.favorite ? "★ 已收藏" : "☆ 收藏"}</button>
        <button type="button" data-open-reader>打开精读工作台</button>
        <a href="${escapeHtml(paper.source_url || paper.pdf_url)}" target="_blank" rel="noreferrer">查看原文</a>
        ${paper.pdf_url ? `<a href="${escapeHtml(paper.pdf_url)}" target="_blank" rel="noreferrer">PDF</a>` : ""}
      </div>
      <h2 class="detail-title">${escapeHtml(paper.title)}</h2>
      <p class="detail-byline">${escapeHtml(paper.authors.join(" · ") || "作者信息缺失")}</p>
      <div class="detail-meta">
        <span>${escapeHtml(paper.venue || paper.source)}</span>
        <span>${escapeHtml(formatDate(paper.published))}</span>
        <span>${escapeHtml(paper.source)}</span>
        <span>${escapeHtml(paper.venue_tier)}</span>
        <span>${escapeHtml(paper.platform)}</span>
        <span>${escapeHtml(paper.publication_status)}</span>
        <span>推荐分 ${Math.round(paper.quality_score)}</span>
        ${paper.citation_count ? `<span>引用 ${paper.citation_count}</span>` : ""}
      </div>
      <div class="paper-topics">${paper.topics.map((topic) => `<span class="topic-tag">${escapeHtml(topic)}</span>`).join("")}</div>

      ${paper.notable_institutions?.length ? `<section class="detail-section">
        <h3>代表研究机构</h3>
        <div class="institution-list">${paper.notable_institutions.map((institution) => `
          <a href="${escapeHtml(institution.url)}" target="_blank" rel="noreferrer"><strong>${escapeHtml(institution.name)}</strong><span>${escapeHtml(institution.type)} · ${escapeHtml(institution.region)} · ${escapeHtml(institution.strengths.join("、"))}</span></a>`).join("")}</div>
      </section>` : ""}

      ${paper.projects?.length ? `<section class="detail-section">
        <h3>关联 GitHub 项目</h3>
        <div class="linked-list">${paper.projects.map((project) => `
          <button type="button" data-linked-project="${escapeHtml(project.full_name)}">
            <strong>${escapeHtml(project.full_name)}</strong>
            <span>Stars ${project.stars} · 匹配 ${Math.round(project.score)}</span>
          </button>`).join("")}</div>
      </section>` : ""}

      <section class="detail-section">
        <h3>阅读状态</h3>
        <div class="status-tabs" data-detail-status>
          <button class="${paper.status === "unread" ? "is-active" : ""}" data-value="unread">未读</button>
          <button class="${paper.status === "reading" ? "is-active" : ""}" data-value="reading">在读</button>
          <button class="${paper.status === "read" ? "is-active" : ""}" data-value="read">已读</button>
        </div>
      </section>

      <section class="detail-section">
        <h3>原始摘要</h3>
        <p>${escapeHtml(paper.abstract || "公开元数据暂未提供摘要，请打开原文查看。")}</p>
      </section>

      <section class="detail-section" id="explanationSection">
        ${explanation ? explanationMarkup(explanation) : `
          <div class="explain-head"><h3>中文讲解</h3><span class="explain-mode">尚未生成</span></div>
          <p>生成后会把研究背景、问题、方法、实验、贡献和阅读门槛拆开说明，并明确区分原文信息与推断。</p>
          <button class="button button-primary" type="button" data-explain style="margin-top:14px">生成中文讲解</button>`}
      </section>

      <section class="detail-section">
        <h3>我的笔记</h3>
        <textarea class="notes-box" data-notes placeholder="记录为什么值得读、关键疑问或与导师方向的关系">${escapeHtml(paper.notes || "")}</textarea>
        <button class="button button-secondary" type="button" data-save-notes style="margin-top:9px">保存笔记</button>
      </section>
    </div>`;

  el("paperDetail").querySelector("[data-close-detail]").addEventListener("click", showReadingEmpty);
  el("paperDetail").querySelector("[data-open-reader]").addEventListener("click", () => openReader(paper.id));
  el("paperDetail").querySelectorAll("[data-linked-project]").forEach((button) => button.addEventListener("click", async () => {
    state.view = "projects";
    applyViewMode();
    document.querySelectorAll(".rail-link").forEach((item) => item.classList.toggle("is-active", item.dataset.view === "projects"));
    await loadProjects();
    await openProject(button.dataset.linkedProject);
  }));
  el("paperDetail").querySelector("[data-favorite-detail]").addEventListener("click", async () => {
    await api(`/api/papers/${encodeURIComponent(paper.id)}/state`, { method: "POST", body: JSON.stringify({ favorite: !paper.favorite }) });
    toast(!paper.favorite ? "已加入收藏" : "已取消收藏");
    await loadPapers();
    await loadStats();
  });
  el("paperDetail").querySelectorAll("[data-detail-status] button").forEach((button) => button.addEventListener("click", async () => {
    await api(`/api/papers/${encodeURIComponent(paper.id)}/state`, { method: "POST", body: JSON.stringify({ status: button.dataset.value }) });
    toast("阅读状态已更新");
    await loadPapers();
    await loadStats();
  }));
  el("paperDetail").querySelector("[data-explain]")?.addEventListener("click", () => generateExplanation(paper.id));
  el("paperDetail").querySelector("[data-save-notes]").addEventListener("click", async () => {
    const notes = el("paperDetail").querySelector("[data-notes]").value;
    await api(`/api/papers/${encodeURIComponent(paper.id)}/state`, { method: "POST", body: JSON.stringify({ notes }) });
    toast("笔记已保存");
  });
}

function explanationMarkup(explanation) {
  const list = (value) => Array.isArray(value)
    ? `<ul>${value.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : `<p>${escapeHtml(value || "暂无")}</p>`;
  return `
    <div class="explain-head">
      <h3>中文讲解</h3>
      <div class="explain-actions">
        <span class="explain-mode">${explanation.mode === "ai" ? `${explanation.reading_basis === "fulltext" ? "全文精读" : "摘要讲解"}${explanation.model ? ` · ${escapeHtml(explanation.model)}` : ""}` : "摘要导读"}</span>
        <button class="text-button" type="button" data-explain>重新生成</button>
      </div>
    </div>
    ${explanation.notice ? `<p style="color:var(--warning);margin-bottom:12px">${escapeHtml(explanation.notice)}</p>` : ""}
    <div class="explain-grid">
      <div class="explain-block"><h4>一句话理解</h4>${list(explanation.one_sentence)}</div>
      <div class="explain-block"><h4>论文结构</h4>${list(explanation.paper_structure)}</div>
      <div class="explain-block"><h4>研究背景</h4>${list(explanation.background)}</div>
      <div class="explain-block"><h4>解决的问题</h4>${list(explanation.problem)}</div>
      <div class="explain-block"><h4>方法路线</h4>${list(explanation.method)}</div>
      <div class="explain-block"><h4>算法流程</h4>${list(explanation.algorithm_flow)}</div>
      <div class="explain-block"><h4>公式与推导</h4>${list(explanation.derivation)}</div>
      <div class="explain-block"><h4>实验怎么看</h4>${list(explanation.experiments)}</div>
      <div class="explain-block"><h4>结论链条</h4>${list(explanation.conclusions)}</div>
      <div class="explain-block"><h4>主要贡献</h4>${list(explanation.contributions)}</div>
      <div class="explain-block"><h4>局限与核查点</h4>${list(explanation.limitations)}</div>
      <div class="explain-block"><h4>阅读前置</h4>${list(explanation.prerequisites)}</div>
      <div class="explain-block"><h4>是否适合你</h4>${list(explanation.fit)}</div>
      ${Array.isArray(explanation.evidence) && explanation.evidence.length ? `
        <div class="explain-block"><h4>原文证据</h4><ul>${explanation.evidence.map((item) => `<li>${escapeHtml(item.claim || "")}${item.pages ? ` <b>${escapeHtml(Array.isArray(item.pages) ? item.pages.join("、") : item.pages)}</b>` : ""}</li>`).join("")}</ul></div>` : ""}
      ${Array.isArray(explanation.glossary) && explanation.glossary.length ? `
        <div class="explain-block"><h4>术语表</h4><dl class="glossary">${explanation.glossary.map((item) => `<div><dt>${escapeHtml(item.term)}</dt><dd>${escapeHtml(item.explanation)}</dd></div>`).join("")}</dl></div>` : ""}
    </div>`;
}

async function generateExplanation(paperId) {
  const section = el("explanationSection");
  section.innerHTML = `<div class="explain-head"><h3>中文讲解</h3><span class="explain-mode">正在生成</span></div><div class="skeleton-line" style="width:88%"></div><div class="skeleton-line" style="width:72%"></div><div class="skeleton-line" style="width:82%"></div>`;
  try {
    const explanation = await api(`/api/papers/${encodeURIComponent(paperId)}/explain`, { method: "POST", body: "{}" });
    section.innerHTML = explanationMarkup(explanation);
    section.querySelector("[data-explain]")?.addEventListener("click", () => generateExplanation(paperId));
    toast(explanation.mode === "ai" ? "AI 讲解已生成" : "摘要导读已生成");
  } catch (error) {
    section.innerHTML = `<div class="explain-head"><h3>中文讲解</h3><span class="explain-mode">生成失败</span></div><p>${escapeHtml(error.message)}</p><button class="button button-secondary" type="button" data-retry-explain style="margin-top:12px">重试</button>`;
    section.querySelector("[data-retry-explain]").addEventListener("click", () => generateExplanation(paperId));
  }
}

function recommendationFor(paperId) {
  return state.papers.find((paper) => paper.id === paperId && paper.is_recommended) || null;
}

function renderReaderScore(paper) {
  const recommendation = recommendationFor(paper.id);
  if (!recommendation?.score_breakdown?.length) {
    el("readerScore").innerHTML = "";
    return;
  }
  el("readerScore").innerHTML = `
    <section class="reader-score-block">
      <div class="reader-score-total"><strong>${Math.round(recommendation.recommendation_score)}</strong><span>${escapeHtml(recommendation.recommendation_topic)}精选分</span></div>
      <div class="score-components">${recommendation.score_breakdown.map((item) => `
        <div title="${escapeHtml(item.reason)}"><span>${escapeHtml(item.name)}</span><b>${item.score}/${item.max}</b><i style="--score-width:${Math.max(0, Math.min(100, item.score / item.max * 100))}%"></i></div>`).join("")}</div>
    </section>`;
}

function setReaderTab(tab) {
  document.querySelectorAll("[data-reader-tab]").forEach((button) => {
    const active = button.dataset.readerTab === tab;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  ["explain", "chat", "translate"].forEach((name) => {
    const panel = el(`reader${name[0].toUpperCase()}${name.slice(1)}Panel`);
    const active = name === tab;
    panel.hidden = !active;
    panel.classList.toggle("is-active", active);
  });
}

function setPdfStatus(title, detail = "") {
  el("pdfStatus").hidden = false;
  el("pdfStatus").innerHTML = `<strong>${escapeHtml(title)}</strong>${detail ? `<span>${escapeHtml(detail)}</span>` : ""}`;
  el("pdfFrame").hidden = true;
  el("pdfUnavailable").hidden = true;
}

async function resolveReaderAsset(paper, force = false) {
  setPdfStatus("正在寻找公开 PDF", "检查论文源、OpenAlex、Semantic Scholar、arXiv 与公开机构仓储");
  el("readerCacheButton").disabled = true;
  try {
    const asset = await api(`/api/papers/${encodeURIComponent(paper.id)}/resolve`, { method: "POST", body: JSON.stringify({ force }) });
    state.readerAsset = asset;
    el("translationPage").max = Math.max(1, asset.page_count || 1);
    el("translationPageCount").textContent = `/ ${asset.page_count || 0}`;
    if (asset.pdf_available) {
      el("pdfStatus").hidden = true;
      el("pdfUnavailable").hidden = true;
      el("pdfFrame").src = `${asset.pdf_url}#view=FitH`;
      el("pdfFrame").hidden = false;
      el("readerCacheButton").textContent = "PDF 已缓存";
      if (asset.fulltext_available) loadTranslationPage(1);
    } else {
      el("pdfStatus").hidden = true;
      el("pdfFrame").hidden = true;
      el("pdfUnavailable").hidden = false;
      el("pdfUnavailableReason").textContent = asset.error || "公开学术源中没有发现可直接访问的副本。";
      el("pdfFallbackLink").href = paper.source_url || paper.pdf_url || "#";
      el("readerCacheButton").textContent = "重新查找 PDF";
    }
  } catch (error) {
    setPdfStatus("PDF 解析失败", error.message);
  } finally {
    el("readerCacheButton").disabled = false;
  }
}

function renderChatHistory(items = []) {
  const history = el("chatHistory");
  history.innerHTML = "";
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "chat-empty";
    empty.textContent = "还没有针对这篇论文的提问。";
    history.append(empty);
    return;
  }
  items.forEach((item) => {
    const message = document.createElement("div");
    message.className = `chat-message is-${item.role}`;
    const label = document.createElement("strong");
    label.textContent = item.role === "user" ? "你" : "论文导师";
    const content = document.createElement("p");
    content.textContent = item.content;
    message.append(label, content);
    history.append(message);
  });
  history.scrollTop = history.scrollHeight;
}

async function loadChatHistory(paperId) {
  try {
    const payload = await api(`/api/papers/${encodeURIComponent(paperId)}/chat`);
    renderChatHistory(payload.items);
  } catch (error) {
    renderChatHistory([]);
  }
}

async function openReader(paperId) {
  const dialog = el("readerDialog");
  state.selectedId = paperId;
  state.readerPaper = null;
  state.readerAsset = null;
  setReaderTab("explain");
  setPdfStatus("正在载入论文", "读取元数据与本地缓存状态");
  el("readerTitle").textContent = "论文阅读工作台";
  el("readerMeta").textContent = "";
  el("readerExplanation").innerHTML = `<div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div>`;
  el("readerScore").innerHTML = "";
  el("translationSource").textContent = "";
  el("translationResult").textContent = "";
  renderChatHistory([]);
  if (!dialog.open) dialog.showModal();
  try {
    const paper = await api(`/api/papers/${encodeURIComponent(paperId)}`);
    state.readerPaper = paper;
    el("readerTitle").textContent = paper.title;
    const institutionNames = paper.notable_institutions?.slice(0, 2).map((item) => item.name).join(" · ");
    el("readerMeta").textContent = `${paper.authors.join(" · ") || "作者信息缺失"} · ${paper.venue || paper.source} · ${formatDate(paper.published)}${institutionNames ? ` · ${institutionNames}` : ""}`;
    el("readerSourceLink").href = paper.source_url || paper.pdf_url || "#";
    renderReaderScore(paper);
    el("readerExplanation").innerHTML = paper.explanation
      ? explanationMarkup(paper.explanation)
      : `<div class="reader-explain-empty"><strong>尚未生成全文精读</strong><p>生成时会优先读取缓存全文，并按页标注关键证据。</p><button class="button button-primary" type="button" data-reader-explain>生成全文精读</button></div>`;
    el("readerExplanation").querySelector("[data-reader-explain]")?.addEventListener("click", generateReaderExplanation);
    el("readerExplanation").querySelector("[data-explain]")?.addEventListener("click", generateReaderExplanation);
    await Promise.all([resolveReaderAsset(paper), loadChatHistory(paperId)]);
  } catch (error) {
    setPdfStatus("论文载入失败", error.message);
    el("readerExplanation").innerHTML = `<p>${escapeHtml(error.message)}</p>`;
  }
}

async function generateReaderExplanation() {
  const paper = state.readerPaper;
  if (!paper) return;
  const container = el("readerExplanation");
  container.innerHTML = `<div class="explain-head"><h3>全文精读</h3><span class="explain-mode">正在读取并分析</span></div><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div>`;
  try {
    const explanation = await api(`/api/papers/${encodeURIComponent(paper.id)}/explain`, { method: "POST", body: "{}" });
    paper.explanation = explanation;
    container.innerHTML = explanationMarkup(explanation);
    container.querySelector("[data-explain]")?.addEventListener("click", generateReaderExplanation);
    toast(explanation.reading_basis === "fulltext" ? "全文精读已生成" : "仅找到摘要，已生成摘要讲解");
  } catch (error) {
    container.innerHTML = `<div class="reader-explain-empty"><strong>精读生成失败</strong><p>${escapeHtml(error.message)}</p><button class="button button-secondary" type="button" data-reader-explain>重试</button></div>`;
    container.querySelector("[data-reader-explain]").addEventListener("click", generateReaderExplanation);
  }
}

async function loadTranslationPage(pageNumber) {
  const paper = state.readerPaper;
  if (!paper || !state.readerAsset?.fulltext_available) return;
  try {
    const page = await api(`/api/papers/${encodeURIComponent(paper.id)}/text?page=${pageNumber}`);
    el("translationPage").value = page.page;
    el("translationPageCount").textContent = `/ ${page.page_count}`;
    el("translationSource").textContent = page.text || "该页没有提取到可翻译文本。";
    el("translationResult").textContent = "";
  } catch (error) {
    el("translationSource").textContent = error.message;
  }
}

async function localBrowserTranslate(text) {
  if (!globalThis.Translator?.create) return null;
  const options = { sourceLanguage: "en", targetLanguage: "zh" };
  const availability = globalThis.Translator.availability ? await globalThis.Translator.availability(options) : "available";
  if (availability === "unavailable") return null;
  const translator = await globalThis.Translator.create(options);
  const chunks = [];
  for (let index = 0; index < text.length; index += 2500) chunks.push(text.slice(index, index + 2500));
  const translated = [];
  for (const chunk of chunks) translated.push(await translator.translate(chunk));
  return translated.join("\n\n");
}

async function translateCurrentPage() {
  const source = el("translationSource").textContent.trim();
  if (!source) {
    await loadTranslationPage(Number(el("translationPage").value) || 1);
  }
  const text = el("translationSource").textContent.trim();
  if (!text) return;
  el("translatePageButton").disabled = true;
  el("translationResult").textContent = "正在翻译…";
  try {
    const local = await localBrowserTranslate(text);
    if (local) {
      el("translationResult").textContent = local;
      el("translationProvider").textContent = "浏览器本机翻译 · 未使用 GPT";
    } else {
      const payload = await api("/api/translate", { method: "POST", body: JSON.stringify({ text, source: "en", target: "zh" }) });
      el("translationResult").textContent = payload.text;
      el("translationProvider").textContent = `${payload.provider} · 未使用 GPT`;
    }
  } catch (error) {
    el("translationResult").textContent = error.message;
  } finally {
    el("translatePageButton").disabled = false;
  }
}

function showReadingEmpty() {
  el("paperDetail").hidden = true;
  el("readingEmpty").hidden = false;
  el("readingPane").classList.remove("is-open");
  if (state.view === "projects") state.selectedProject = null;
  const url = new URL(window.location.href);
  url.searchParams.delete("paper");
  url.searchParams.delete("project");
  window.history.replaceState({}, "", url);
}

async function loadOptions() {
  const options = await api("/api/options");
  const fill = (select, values, placeholder) => {
    select.innerHTML = `<option value="">${placeholder}</option>${values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
  };
  fill(el("topicFilter"), options.topics, "全部主题");
  fill(el("tierFilter"), options.tiers, "全部层级");
  fill(el("platformFilter"), options.platforms, "全部平台");
  const coverageItems = options.venue_coverage?.items || [];
  const coverageByVenue = new Map(coverageItems.map((item) => [item.venue, item]));
  const venueLabel = (venue) => {
    const item = coverageByVenue.get(venue);
    if (!item) return venue;
    if (item.availability_status === "scheduled") return `${venue}（待公开 ${item.scheduled_count}）`;
    if (item.availability_status === "blocked") return `${venue}（数据源受限）`;
    if (item.availability_status === "error") return `${venue}（同步失败）`;
    if (item.availability_status === "pending") return `${venue}（待采集）`;
    return `${venue}（${item.count}）`;
  };
  el("venueFilter").innerHTML = `<option value="">全部刊物</option>${options.venues.map((venue) => `<option value="${escapeHtml(venue)}">${escapeHtml(venueLabel(venue))}</option>`).join("")}`;
  const coverage = options.venue_coverage;
  el("coverageSummary").textContent = coverage
    ? `当前可读 ${coverage.covered}/${coverage.catalog_total} · 已索引 ${coverage.indexed}/${coverage.catalog_total}${coverage.scheduled ? ` · ${coverage.scheduled} 个待公开` : ""}${coverage.blocked ? ` · ${coverage.blocked} 个受限` : ""}`
    : "";
  el("coverageSummary").title = coverageItems
    .filter((item) => item.availability_status !== "available")
    .map((item) => `${item.venue}: ${venueLabel(item.venue)}`)
    .join("\n");
  el("institutionFilter").innerHTML = `<option value="">全部机构</option>${options.institutions.map((institution) => `<option value="${escapeHtml(institution.id)}">${escapeHtml(institution.name)}</option>`).join("")}`;
  fill(el("sourceFilter"), options.sources, "全部数据源");
  fill(el("projectLanguageFilter"), options.project_languages, "全部语言");
  el("authorOptions").innerHTML = options.authors.map((author) => `<option value="${escapeHtml(author)}"></option>`).join("");
}

async function loadStats() {
  const stats = await api("/api/stats");
  state.stats = stats;
  el("statTotal").textContent = stats.total;
  el("statUnread").textContent = stats.unread;
  el("statFavorite").textContent = stats.favorites;
  el("navAllCount").textContent = stats.total;
  el("navTopCount").textContent = stats.top_venue_count;
  el("navProjectCount").textContent = stats.project_total;
  el("navFavoriteCount").textContent = stats.favorites;
  el("navEmbodiedCount").textContent = stats.topic_counts["具身智能"] || 0;
  el("navLlmCount").textContent = stats.topic_counts["大语言模型"] || 0;
  el("navMultimodalCount").textContent = stats.topic_counts["多模态大模型"] || 0;
  const syncDot = el("syncDot");
  syncDot.className = `sync-dot${stats.refresh.running ? " is-busy" : stats.latest_sync?.status === "success" ? " is-live" : ""}`;
  el("syncTitle").textContent = stats.refresh.running ? (stats.refresh.message || "正在更新") : stats.latest_sync?.status === "success" ? "数据已同步" : "等待更新";
  el("syncTime").textContent = stats.refresh.running ? "请稍候" : lastSyncLabel(stats.latest_sync);
  el("refreshButton").disabled = stats.refresh.running;
  el("refreshButton").textContent = stats.refresh.running ? "正在更新" : "更新论文";
  applyViewMode();
  return stats;
}

async function triggerRefresh() {
  try {
    const response = await api("/api/refresh", { method: "POST", body: "{}" });
    toast(response.message);
    clearInterval(state.refreshPoll);
    state.refreshPoll = setInterval(async () => {
      const stats = await loadStats();
      if (!stats.refresh.running) {
        clearInterval(state.refreshPoll);
        await Promise.all([loadPapers({ preserveSelection: false }), loadOptions()]);
        toast("论文与项目更新完成");
      }
    }, 1600);
  } catch (error) {
    toast(error.message, true);
  }
}

function clearFilters() {
  const projectMode = state.view === "projects";
  const recommendedMode = state.view === "recommended";
  state.topic = "";
  state.view = projectMode ? "projects" : recommendedMode ? "recommended" : "all";
  state.status = "";
  ["searchInput", "authorFilter", "dateFilter"].forEach((id) => { el(id).value = ""; });
  ["topicFilter", "tierFilter", "platformFilter", "venueFilter", "institutionFilter", "sourceFilter"].forEach((id) => { el(id).value = ""; });
  el("projectLanguageFilter").value = "";
  el("projectSortFilter").value = "updated";
  el("sortFilter").value = "quality";
  applyViewMode();
  document.querySelectorAll(".rail-link").forEach((item) => item.classList.toggle("is-active", item.dataset.view === state.view));
  document.querySelectorAll(".status-tabs[data-status], .status-tabs button");
  document.querySelectorAll(".stream-head [data-status]").forEach((item) => item.classList.toggle("is-active", item.dataset.status === ""));
  loadPapers({ preserveSelection: false });
}

function bindEvents() {
  const reload = debounce(() => loadPapers({ preserveSelection: false }));
  el("searchInput").addEventListener("input", reload);
  el("authorFilter").addEventListener("input", reload);
  ["topicFilter", "tierFilter", "platformFilter", "venueFilter", "institutionFilter", "sourceFilter", "dateFilter", "sortFilter"].forEach((id) => el(id).addEventListener("change", () => {
    if (id === "topicFilter") state.topic = "";
    loadPapers({ preserveSelection: false });
  }));
  ["projectLanguageFilter", "projectSortFilter"].forEach((id) => el(id).addEventListener("change", () => loadPapers({ preserveSelection: false })));
  el("clearFilters").addEventListener("click", clearFilters);
  el("emptyClear").addEventListener("click", clearFilters);
  el("refreshButton").addEventListener("click", triggerRefresh);
  el("loadMoreButton").addEventListener("click", () => loadPapers({ append: true }));

  document.querySelectorAll(".rail-link").forEach((button) => button.addEventListener("click", () => {
    state.topic = button.dataset.topic || "";
    state.view = button.dataset.view || "recommended";
    applyViewMode();
    document.querySelectorAll(".rail-link").forEach((item) => item.classList.toggle("is-active", item === button));
    loadPapers({ preserveSelection: false });
  }));

  document.querySelectorAll(".stream-head [data-status]").forEach((button) => button.addEventListener("click", () => {
    state.status = button.dataset.status;
    document.querySelectorAll(".stream-head [data-status]").forEach((item) => item.classList.toggle("is-active", item === button));
    loadPapers({ preserveSelection: false });
  }));

  document.addEventListener("keydown", (event) => {
    if (el("readerDialog").open) return;
    if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) {
      event.preventDefault();
      el("searchInput").focus();
      return;
    }
    if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) return;
    const activeItems = state.view === "projects" ? state.projects : state.papers;
    if ((event.key === "j" || event.key === "k") && activeItems.length) {
      event.preventDefault();
      const current = Math.max(0, activeItems.findIndex((item) => state.view === "projects" ? item.full_name === state.selectedProject : item.id === state.selectedId));
      const next = event.key === "j" ? Math.min(activeItems.length - 1, current + 1) : Math.max(0, current - 1);
      if (state.view === "projects") openProject(activeItems[next].full_name);
      else openPaper(activeItems[next].id);
    }
  });

  el("readerClose").addEventListener("click", () => el("readerDialog").close());
  el("readerDialog").addEventListener("close", () => {
    el("pdfFrame").src = "about:blank";
    state.readerPaper = null;
    state.readerAsset = null;
  });
  document.querySelectorAll("[data-reader-tab]").forEach((button) => button.addEventListener("click", () => setReaderTab(button.dataset.readerTab)));
  el("readerCacheButton").addEventListener("click", () => state.readerPaper && resolveReaderAsset(state.readerPaper, true));
  el("translationPage").addEventListener("change", () => loadTranslationPage(Number(el("translationPage").value) || 1));
  el("translatePageButton").addEventListener("click", translateCurrentPage);
  el("chatForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const paper = state.readerPaper;
    const question = el("chatQuestion").value.trim();
    if (!paper || !question) return;
    const button = event.submitter || el("chatForm").querySelector("button[type=submit]");
    button.disabled = true;
    el("chatQuestion").value = "";
    const history = el("chatHistory");
    if (history.querySelector(".chat-empty")) history.innerHTML = "";
    const pending = document.createElement("div");
    pending.className = "chat-message is-user";
    pending.innerHTML = `<strong>你</strong><p>${escapeHtml(question)}</p>`;
    history.append(pending);
    try {
      await api(`/api/papers/${encodeURIComponent(paper.id)}/chat`, { method: "POST", body: JSON.stringify({ question }) });
      await loadChatHistory(paper.id);
    } catch (error) {
      toast(error.message, true);
      await loadChatHistory(paper.id);
    } finally {
      button.disabled = false;
      el("chatQuestion").focus();
    }
  });
}

async function init() {
  const now = new Date();
  const initialParams = new URLSearchParams(window.location.search);
  const initialPaperId = initialParams.get("paper");
  const initialProject = initialParams.get("project");
  if (initialParams.get("view") === "projects" || initialProject) state.view = "projects";
  el("overviewDate").textContent = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(now);
  bindEvents();
  applyViewMode();
  document.querySelectorAll(".rail-link").forEach((item) => item.classList.toggle("is-active", item.dataset.view === state.view));
  try {
    await Promise.all([loadOptions(), loadStats(), loadPapers({ preserveSelection: false })]);
    if (initialPaperId) await openPaper(initialPaperId, false);
    if (initialProject) await openProject(initialProject, false);
  } catch (error) {
    toast(error.message, true);
  }
}

init();
