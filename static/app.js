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
  connectorResults: [],
  storage: null,
  projectWorkspace: null,
  projectSelectedPath: "",
  projectFileMode: "guide",
  projectCurrentContent: "",
  projectCodeWrapped: false,
  projectDocument: null,
  auth: null,
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
  if (response.status === 401 && payload.auth_required) {
    const next = `${window.location.pathname}${window.location.search}`;
    window.location.replace(`/login?next=${encodeURIComponent(next)}`);
  }
  if (!response.ok) throw new Error(payload.error || `请求失败：${response.status}`);
  return payload;
};

async function loadAuthUser() {
  const response = await fetch("/api/auth/me", { headers: { Accept: "application/json" } });
  const payload = await response.json();
  if (response.status === 401) {
    const next = `${window.location.pathname}${window.location.search}`;
    window.location.replace(`/login?next=${encodeURIComponent(next)}`);
    return;
  }
  state.auth = payload;
  el("authControls").hidden = !payload.enabled;
  if (payload.user) {
    const roleLabel = payload.user.role === "beta" ? "内测" : "普通";
    el("authUsername").textContent = `${payload.user.display_name || payload.user.username} · ${roleLabel}`;
    el("authUsername").title = payload.host_ai_allowed
      ? "内测账户可使用主机 API"
      : "普通账户需在自己的电脑上运行 Paperfield 并连接本地 API";
  }
}

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

function renderConnectorResults(items = []) {
  state.connectorResults = items;
  const container = el("connectorResults");
  if (!items.length) {
    container.innerHTML = `<div class="connector-empty">没有找到匹配论文</div>`;
    return;
  }
  container.innerHTML = items.map((paper, index) => `
    <article class="connector-result">
      <div><h3>${escapeHtml(paper.title)}</h3><p>${escapeHtml(paper.authors.join(" · ") || "作者信息缺失")}</p><span>${escapeHtml(paper.venue || paper.source)} · ${escapeHtml(formatDate(paper.published))}${paper.doi ? ` · DOI ${escapeHtml(paper.doi)}` : ""}</span></div>
      <button class="button ${paper.already_saved ? "button-secondary" : "button-primary"}" type="button" data-connector-import="${index}">${paper.already_saved ? "打开" : "加入并打开"}</button>
    </article>`).join("");
  container.querySelectorAll("[data-connector-import]").forEach((button) => button.addEventListener("click", async () => {
    const paper = state.connectorResults[Number(button.dataset.connectorImport)];
    button.disabled = true;
    try {
      const imported = paper.already_saved
        ? { id: paper.existing_id }
        : await api("/api/connectors/import", { method: "POST", body: JSON.stringify(paper) });
      el("connectorDialog").close();
      await Promise.all([loadPapers({ preserveSelection: false }), loadStats(), loadOptions()]);
      openReader(imported.id);
    } catch (error) {
      toast(error.message, true);
      button.disabled = false;
    }
  }));
}

async function searchConnector() {
  const query = el("connectorQuery").value.trim();
  if (!query) return;
  el("connectorResults").innerHTML = `<div class="connector-empty">正在查找论文</div>`;
  try {
    const payload = await api(`/api/connectors/search?q=${encodeURIComponent(query)}`);
    renderConnectorResults(payload.items);
  } catch (error) {
    el("connectorResults").innerHTML = `<div class="connector-empty is-error">${escapeHtml(error.message)}</div>`;
  }
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
    sort_secondary: el("secondarySortFilter").value,
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
    sort_secondary: el("projectSecondarySortFilter").value,
  };
  Object.entries(values).forEach(([key, value]) => value && params.set(key, value));
  return params;
}

const isProjectMode = () => state.view === "projects" || state.view === "project-recommended";

function applyViewMode() {
  const projectMode = isProjectMode();
  const projectRecommendedMode = state.view === "project-recommended";
  const recommendedMode = state.view === "recommended";
  document.querySelector(".content-grid").classList.toggle("is-recommended", recommendedMode || projectRecommendedMode);
  document.querySelectorAll(".paper-only-filter").forEach((item) => { item.hidden = projectMode || recommendedMode; });
  document.querySelectorAll(".project-only-filter").forEach((item) => { item.hidden = !projectMode || projectRecommendedMode; });
  el("dateFilter").closest("label").hidden = recommendedMode || projectRecommendedMode;
  document.querySelector(".score-guide").hidden = projectMode;
  el("streamTitle").textContent = projectRecommendedMode ? "每日项目" : projectMode ? "GitHub 项目" : recommendedMode ? "每周精选" : "论文流";
  el("loadMoreButton").textContent = projectMode ? "加载更多项目" : "加载更多论文";
  document.querySelector(".stream-head .status-tabs").hidden = projectMode || recommendedMode;
  el("overviewTitle").textContent = projectRecommendedMode ? "今天值得研究的项目" : projectMode ? "今天有哪些项目在更新" : recommendedMode ? "本周先读这几篇" : "今天值得读什么";
  el("overviewMessage").textContent = projectRecommendedMode ? "从活跃仓库中按方向、社区采用、论文关联和完整度筛选。" : projectMode ? "跟踪具身智能与大模型开源仓库，并连接对应论文。" : recommendedMode ? "从完整候选池中按领域、刊物、时效、全文证据与复现线索二次筛选。" : "浏览全部公开论文元数据与来源。";
  el("statTotalLabel").textContent = projectRecommendedMode ? "今日项目" : projectMode ? "GitHub 项目" : recommendedMode ? "本周精选" : "收录论文";
  el("statUnreadLabel").textContent = projectRecommendedMode ? "候选项目" : projectMode ? "今日更新" : recommendedMode ? "候选池" : "未读";
  el("statFavoriteLabel").textContent = projectMode ? "论文关联" : "已收藏";
  if (state.stats) {
    el("statTotal").textContent = projectRecommendedMode ? state.total : projectMode ? state.stats.project_total : recommendedMode ? state.total : state.stats.total;
    el("statUnread").textContent = projectRecommendedMode ? state.stats.project_total : projectMode ? state.stats.project_updated_today : recommendedMode ? state.stats.total : state.stats.unread;
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
    if (state.view === "project-recommended") {
      const payload = await api("/api/project-recommendations");
      state.projects = payload.items;
      state.total = payload.total;
      renderProjects();
      el("resultCount").textContent = `${payload.total} 个 · 候选 ${payload.candidate_total} 个`;
      el("loadMoreWrap").hidden = true;
      el("navProjectRecommendedCount").textContent = payload.total;
      return;
    }
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
          ${project.size_kb ? `<span>${Math.max(1, Math.round(project.size_kb / 1024))} MB</span>` : ""}
          <span>更新于 ${escapeHtml(formatDate(project.pushed_at?.slice(0, 10)))}</span>
        </div>
        <h3 class="paper-title">${escapeHtml(project.full_name)}</h3>
        <div class="project-description">${escapeHtml(project.description || "仓库暂未提供简介")}</div>
        <div class="paper-topics">${project.topics.slice(0, 5).map((topic) => `<span class="topic-tag">${escapeHtml(topic)}</span>`).join("")}</div>
      </div>
      <div class="paper-score project-score">
        <strong>${project.recommendation_score ? Math.round(project.recommendation_score) : project.stars}</strong>
        <span>${project.recommendation_score ? "项目分" : "Stars"}</span>
        <b>${project.recommendation_score ? `${project.stars} Stars` : `${project.linked_paper_count} 篇论文`}</b>
      </div>`;
    row.addEventListener("click", () => openProjectReader(project.full_name));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openProjectReader(project.full_name);
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
        <button type="button" data-open-project-reader>代码工作台</button>
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
  el("paperDetail").querySelector("[data-open-project-reader]").addEventListener("click", () => openProjectReader(project.full_name));
  el("paperDetail").querySelectorAll("[data-linked-paper]").forEach((button) => button.addEventListener("click", async () => {
    state.view = "all";
    state.topic = "";
    applyViewMode();
    document.querySelectorAll(".rail-link").forEach((item) => item.classList.toggle("is-active", item.dataset.view === "all"));
    await loadPapers({ preserveSelection: false });
    await openPaper(button.dataset.linkedPaper);
  }));
}

function setProjectTab(tab) {
  document.querySelectorAll("[data-project-tab]").forEach((button) => {
    const active = button.dataset.projectTab === tab;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  const panels = { readme: "projectReadmePanel", explain: "projectExplainPanel", chat: "projectChatPanel" };
  Object.entries(panels).forEach(([name, id]) => {
    const active = name === tab;
    el(id).hidden = !active;
    el(id).classList.toggle("is-active", active);
  });
}

function renderReadingBackupStatus(id, available, pending = false) {
  const status = el(id);
  status.textContent = pending ? "正在备份历史" : available ? "云端历史已备份" : "本地历史";
  status.classList.toggle("is-saved", Boolean(available));
}

async function monitorPaperReadingBackup(paperId) {
  renderReadingBackupStatus("readerBackupStatus", false, true);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 700));
    try {
      const paper = await api(`/api/papers/${encodeURIComponent(paperId)}`);
      if (paper.reading_backup_available && !paper.reading_backup_pending) {
        renderReadingBackupStatus("readerBackupStatus", true);
        return;
      }
    } catch (error) { break; }
  }
  renderReadingBackupStatus("readerBackupStatus", false);
}

async function monitorProjectReadingBackup(fullName) {
  renderReadingBackupStatus("projectBackupStatus", false, true);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 700));
    try {
      const workspace = await api(`/api/projects/${encodeURIComponent(fullName)}/workspace`);
      if (workspace.reading_backup_available && !workspace.reading_backup_pending) {
        renderReadingBackupStatus("projectBackupStatus", true);
        return;
      }
    } catch (error) { break; }
  }
  renderReadingBackupStatus("projectBackupStatus", false);
}

function projectExplanationMarkup(explanation) {
  const block = (title, value) => {
    const content = Array.isArray(value)
      ? `<ul>${value.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
      : `<p>${escapeHtml(value || "暂无")}</p>`;
    return `<section class="project-explain-block"><h4>${title}</h4>${content}</section>`;
  };
  return `<div class="explain-head"><h3>代码讲解</h3><div class="explain-actions"><span class="explain-mode">${explanation.mode === "ai" ? `AI 讲解 · ${escapeHtml(explanation.model || "")}` : "元数据导读"}</span><button class="text-button" type="button" data-project-explain>重新生成</button></div></div>
    ${explanation.notice ? `<p style="color:var(--warning)">${escapeHtml(explanation.notice)}</p>` : ""}
    <div class="project-explain-grid">
      ${block("项目目标", explanation.overview)}${block("代码架构", explanation.architecture)}${block("关键入口", explanation.entry_points)}
      ${block("代码流程", explanation.code_flow)}${block("安装与运行", explanation.setup)}${block("值得学习", explanation.strengths)}
      ${block("风险与边界", explanation.risks)}${block("阅读顺序", explanation.learning_path)}
    </div>`;
}

function projectFileItemMarkup(item, showReason = false) {
  return `<button class="project-file-item" type="button" title="${escapeHtml(item.path)}" data-project-file="${escapeHtml(item.path)}">
    <strong>${escapeHtml(item.name)}</strong>
    <span>${escapeHtml(item.directory || "仓库根目录")}</span>
    ${showReason && item.reason ? `<em>${escapeHtml(item.reason)}</em>` : ""}
  </button>`;
}

function renderProjectFiles(mode = state.projectFileMode) {
  const workspace = state.projectWorkspace;
  if (!workspace) return;
  state.projectFileMode = mode;
  document.querySelectorAll("[data-project-file-mode]").forEach((button) => button.classList.toggle("is-active", button.dataset.projectFileMode === mode));
  if (mode === "guide") {
    el("projectFileTree").innerHTML = (workspace.reading_sections || []).map((section) => `
      <section class="project-guide-section">
        <header><strong>${escapeHtml(section.label)}</strong><span>${section.items.length}</span></header>
        ${section.items.map((item) => projectFileItemMarkup(item, true)).join("")}
      </section>`).join("") || `<p class="project-file-empty">没有识别到明确入口，请切换到全部文件。</p>`;
  } else {
    const groups = new Map();
    (workspace.file_entries || []).forEach((item) => {
      if (!groups.has(item.group_key)) groups.set(item.group_key, { label: item.group_label, items: [] });
      groups.get(item.group_key).items.push(item);
    });
    el("projectFileTree").innerHTML = [...groups.values()].map((group, index) => `
      <details class="project-file-group" ${index < 2 ? "open" : ""}>
        <summary><span>${escapeHtml(group.label)}</span><b>${group.items.length}</b></summary>
        ${group.items.map((item) => projectFileItemMarkup(item)).join("")}
      </details>`).join("");
  }
  el("projectFileTree").querySelectorAll("[data-project-file]").forEach((button) => button.addEventListener("click", () => loadProjectFile(button.dataset.projectFile)));
  el("projectFileTree").querySelector(`[data-project-file="${CSS.escape(state.projectSelectedPath)}"]`)?.classList.add("is-active");
  filterProjectFiles();
}

function filterProjectFiles() {
  const query = el("projectFileSearch").value.trim().toLowerCase();
  el("projectFileTree").querySelectorAll("[data-project-file]").forEach((button) => {
    button.hidden = Boolean(query) && !button.dataset.projectFile.toLowerCase().includes(query);
  });
  el("projectFileTree").querySelectorAll(".project-file-group, .project-guide-section").forEach((group) => {
    group.hidden = Boolean(query) && ![...group.querySelectorAll("[data-project-file]")].some((button) => !button.hidden);
  });
}

function renderProjectCode(content) {
  const code = el("projectCodeContent");
  code.innerHTML = "";
  const fragment = document.createDocumentFragment();
  (content || "文件为空").split("\n").forEach((line) => {
    const row = document.createElement("span");
    row.className = "project-code-line";
    row.textContent = line || " ";
    fragment.append(row);
  });
  code.append(fragment);
}

function renderProjectDocument(path, htmlContent, important = false) {
  state.projectDocument = {
    path,
    important,
    html: { en: htmlContent },
    language: "en",
  };
  el("projectDocumentPath").textContent = path || "README";
  el("projectDocumentLanguages").hidden = !important;
  document.querySelectorAll("[data-project-doc-lang]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.projectDocLang === "en");
    button.disabled = false;
  });
  el("projectReadmeContent").innerHTML = htmlContent || "<p>文档内容为空。</p>";
}

async function setProjectDocumentLanguage(target) {
  const workspace = state.projectWorkspace;
  const documentState = state.projectDocument;
  if (!workspace || !documentState?.important || !["en", "zh", "ja"].includes(target)) return;
  document.querySelectorAll("[data-project-doc-lang]").forEach((button) => { button.disabled = true; });
  try {
    if (!documentState.html[target]) {
      el("projectReadmeContent").innerHTML = `<div class="reader-explain-empty"><strong>正在生成${target === "zh" ? "中文" : "日文"}文档</strong><p>保留标题、列表、链接与代码块</p></div>`;
      const payload = await api(`/api/projects/${encodeURIComponent(workspace.project.full_name)}/document`, {
        method: "POST",
        body: JSON.stringify({ path: documentState.path, target }),
      });
      documentState.html[target] = payload.html;
    }
    documentState.language = target;
    el("projectReadmeContent").innerHTML = documentState.html[target];
    document.querySelectorAll("[data-project-doc-lang]").forEach((button) => button.classList.toggle("is-active", button.dataset.projectDocLang === target));
  } catch (error) {
    el("projectReadmeContent").innerHTML = documentState.html.en;
    documentState.language = "en";
    toast(error.message, true);
  } finally {
    document.querySelectorAll("[data-project-doc-lang]").forEach((button) => { button.disabled = false; });
  }
}

function restoreProjectReadme() {
  const workspace = state.projectWorkspace;
  if (!workspace) return;
  el("projectRootReadme").hidden = true;
  const important = (workspace.important_documents || []).some((item) => item.path === workspace.readme_path);
  renderProjectDocument(workspace.readme_path || "README", workspace.readme_html || "<p>仓库没有找到 README。</p>", important);
}

async function loadProjectFile(path) {
  const workspace = state.projectWorkspace;
  if (!workspace || !path) return;
  state.projectSelectedPath = path;
  el("projectCurrentPath").textContent = path;
  el("projectCodeContent").textContent = "正在读取文件";
  el("projectCodeMeta").textContent = "";
  document.querySelectorAll("[data-project-file]").forEach((button) => button.classList.toggle("is-active", button.dataset.projectFile === path));
  try {
    const payload = await api(`/api/projects/${encodeURIComponent(workspace.project.full_name)}/source?path=${encodeURIComponent(path)}`);
    state.projectCurrentContent = payload.content || "";
    renderProjectCode(payload.content || "");
    el("projectCodeMeta").textContent = `${payload.language} · ${Number(payload.line_count || 0).toLocaleString()} 行${payload.truncated ? " · 已截断" : ""}`;
    if (payload.rendered_html) {
      el("projectRootReadme").hidden = payload.path === workspace.readme_path;
      renderProjectDocument(payload.path, payload.rendered_html, payload.important_document);
      setProjectTab("readme");
    }
  } catch (error) {
    el("projectCodeContent").textContent = error.message;
  }
}

function renderProjectChatHistory(items = []) {
  const history = el("projectChatHistory");
  history.innerHTML = "";
  if (!items.length) {
    history.innerHTML = `<p class="chat-empty">还没有针对这个项目的提问。</p>`;
    return;
  }
  items.forEach((item) => {
    const message = document.createElement("div");
    message.className = `chat-message is-${item.role}`;
    const label = document.createElement("strong");
    label.textContent = item.role === "user" ? "你" : "代码导师";
    const content = document.createElement("p");
    content.textContent = item.content;
    message.append(label, content);
    history.append(message);
  });
  history.scrollTop = history.scrollHeight;
}

async function loadProjectChatHistory(fullName) {
  try {
    const payload = await api(`/api/projects/${encodeURIComponent(fullName)}/chat`);
    renderProjectChatHistory(payload.items);
  } catch (error) {
    renderProjectChatHistory([]);
  }
}

function renderProjectWorkspace(workspace) {
  state.projectWorkspace = workspace;
  const project = workspace.project;
  el("projectReaderTitle").textContent = project.full_name;
  el("projectReaderMeta").textContent = `${project.language || "语言未标注"} · ${project.stars} Stars · ${workspace.file_count} 个源码文件 · ${project.linked_paper_count} 篇关联论文${project.size_kb ? ` · 仓库约 ${Math.max(1, Math.round(project.size_kb / 1024))} MB` : ""}`;
  el("projectGithubLink").href = project.url;
  renderReadingBackupStatus("projectBackupStatus", workspace.reading_backup_available, workspace.reading_backup_pending);
  restoreProjectReadme();
  if (!workspace.ready) {
    el("projectFileTree").innerHTML = "";
    el("projectCurrentPath").textContent = "源码不可用";
    el("projectCodeContent").textContent = workspace.error || "仓库中没有可安全显示的文本源码。";
  } else {
    renderProjectFiles("guide");
    const routeItems = (workspace.reading_sections || []).flatMap((section) => section.items);
    const preferred = routeItems.find((item) => (item.group_key === "source" || item.group_key === "runtime") && item.path.split("/").length <= 2)?.path
      || workspace.readme_path
      || workspace.files.find((path) => !/\.(md|rst|txt)$/i.test(path))
      || workspace.files[0];
    loadProjectFile(preferred);
  }
  el("projectExplanation").innerHTML = workspace.explanation
    ? projectExplanationMarkup(workspace.explanation)
    : `<div class="reader-explain-empty"><strong>尚未生成代码讲解</strong><p>讲解会读取 README、依赖配置、入口文件和核心模块，但不会执行仓库代码。</p><button class="button button-primary" type="button" data-project-explain>生成代码讲解</button></div>`;
  el("projectExplanation").querySelector("[data-project-explain]")?.addEventListener("click", generateProjectExplanation);
}

async function openProjectReader(fullName, force = false) {
  const dialog = el("projectReaderDialog");
  state.selectedProject = fullName;
  state.projectWorkspace = null;
  state.projectSelectedPath = "";
  state.projectFileMode = "guide";
  state.projectCurrentContent = "";
  state.projectCodeWrapped = false;
  state.projectDocument = null;
  setProjectTab("readme");
  el("projectReaderTitle").textContent = fullName;
  el("projectReaderMeta").textContent = "正在缓存公开仓库源码";
  renderReadingBackupStatus("projectBackupStatus", false);
  el("projectFileTree").innerHTML = "";
  el("projectFileSearch").value = "";
  el("projectCurrentPath").textContent = "正在读取仓库";
  el("projectCodeMeta").textContent = "";
  el("projectCodeContent").classList.remove("is-wrapped");
  el("projectCodeWrap").classList.remove("is-active");
  el("projectCodeContent").textContent = "下载并校验公开源码压缩包";
  el("projectReadmeContent").textContent = "正在读取 README";
  el("projectDocumentPath").textContent = "README";
  el("projectDocumentLanguages").hidden = true;
  el("projectRootReadme").hidden = true;
  el("projectExplanation").innerHTML = "";
  renderProjectChatHistory([]);
  if (!dialog.open) dialog.showModal();
  const url = new URL(window.location.href);
  url.searchParams.set("view", state.view);
  url.searchParams.set("project", fullName);
  url.searchParams.delete("paper");
  window.history.replaceState({}, "", url);
  try {
    const workspace = await api(`/api/projects/${encodeURIComponent(fullName)}/workspace`, { method: "POST", body: JSON.stringify({ force }) });
    renderProjectWorkspace(workspace);
    await loadProjectChatHistory(fullName);
  } catch (error) {
    el("projectCodeContent").textContent = error.message;
    el("projectReadmeContent").textContent = error.message;
    toast(error.message, true);
  }
}

async function generateProjectExplanation() {
  const workspace = state.projectWorkspace;
  if (!workspace) return;
  setProjectTab("explain");
  el("projectExplanation").innerHTML = `<div class="reader-explain-empty"><strong>正在分析代码</strong><p>读取入口、配置与核心模块</p></div>`;
  try {
    const explanation = await api(`/api/projects/${encodeURIComponent(workspace.project.full_name)}/explain`, { method: "POST", body: "{}" });
    workspace.explanation = explanation;
    el("projectExplanation").innerHTML = projectExplanationMarkup(explanation);
    el("projectExplanation").querySelector("[data-project-explain]")?.addEventListener("click", generateProjectExplanation);
    monitorProjectReadingBackup(workspace.project.full_name);
  } catch (error) {
    el("projectExplanation").innerHTML = `<div class="reader-explain-empty"><strong>代码讲解失败</strong><p>${escapeHtml(error.message)}</p><button class="button button-secondary" type="button" data-project-explain>重试</button></div>`;
    el("projectExplanation").querySelector("[data-project-explain]").addEventListener("click", generateProjectExplanation);
  }
}

async function loadPapers({ preserveSelection = true, append = false } = {}) {
  if (isProjectMode()) return loadProjects({ append });
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
      group.innerHTML = `<strong>${escapeHtml(currentGroup)}</strong><span>本周优先阅读</span>`;
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

function updateReaderStorageAction() {
  const button = el("readerCloudButton");
  const asset = state.readerAsset;
  button.hidden = false;
  if (!state.storage?.configured) {
    button.disabled = false;
    button.textContent = "R2 未连接";
    return;
  }
  if (!asset) {
    button.disabled = true;
    button.textContent = "转存云端";
    return;
  }
  const selectedMode = el("readerStorageMode").value;
  if (asset.cloud_available && selectedMode === asset.storage_mode) {
    button.disabled = true;
    button.textContent = "保存位置已应用";
    return;
  }
  button.disabled = !asset.local_cached && !asset.cloud_available;
  button.textContent = asset.cloud_available ? "应用保存位置" : "立即转存云端";
}

function renderReaderAsset(paper, asset, reloadPdf = true) {
  state.readerAsset = asset;
  el("translationPage").max = Math.max(1, asset.page_count || 1);
  el("translationPageCount").textContent = `/ ${asset.page_count || 0}`;
  el("readerStorageMode").value = asset.storage_mode || el("readerStorageMode").value;
  updateReaderStorageAction();
  if (asset.pdf_available) {
    el("pdfStatus").hidden = true;
    el("pdfUnavailable").hidden = true;
    if (reloadPdf) el("pdfFrame").src = `${asset.pdf_url}#view=FitH`;
    el("pdfFrame").hidden = false;
    el("readerCacheButton").textContent = asset.cloud_available && !asset.local_cached ? "从云端读取" : "PDF 已缓存";
    if (asset.fulltext_available) loadTranslationPage(1);
  } else {
    el("pdfStatus").hidden = true;
    el("pdfFrame").hidden = true;
    el("pdfUnavailable").hidden = false;
    el("pdfUnavailableReason").textContent = asset.error || "公开学术源中没有发现可直接访问的副本。";
    el("pdfFallbackLink").href = paper.source_url || paper.pdf_url || "#";
    el("readerCacheButton").textContent = "重新查找 PDF";
  }
}

async function resolveReaderAsset(paper, force = false) {
  setPdfStatus("正在寻找公开 PDF", "检查论文源、OpenAlex、Semantic Scholar、arXiv 与公开机构仓储");
  el("readerCacheButton").disabled = true;
  try {
    const asset = await api(`/api/papers/${encodeURIComponent(paper.id)}/resolve`, {
      method: "POST",
      body: JSON.stringify({ force, storage: el("readerStorageMode").value }),
    });
    renderReaderAsset(paper, asset);
  } catch (error) {
    setPdfStatus("PDF 解析失败", error.message);
  } finally {
    el("readerCacheButton").disabled = false;
  }
}

async function importReaderPdf(file) {
  const paper = state.readerPaper;
  if (!paper || !file) return;
  if (file.type && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    toast("请选择 PDF 文件", true);
    return;
  }
  setPdfStatus("正在导入 PDF", "校验文件并提取逐页全文");
  el("readerImportButton").disabled = true;
  try {
    const response = await fetch(`/api/papers/${encodeURIComponent(paper.id)}/import`, {
      method: "POST",
      headers: {
        "Content-Type": "application/pdf",
        "X-Paperfield-Filename": encodeURIComponent(file.name),
        "X-Paperfield-Storage": el("readerStorageMode").value,
      },
      body: file,
    });
    const asset = await response.json();
    if (response.status === 401 && asset.auth_required) {
      const next = `${window.location.pathname}${window.location.search}`;
      window.location.replace(`/login?next=${encodeURIComponent(next)}`);
    }
    if (!response.ok) throw new Error(asset.error || `导入失败：${response.status}`);
    renderReaderAsset(paper, asset);
    toast(`已导入 ${asset.page_count} 页 PDF`);
    await generateReaderExplanation();
  } catch (error) {
    setPdfStatus("PDF 导入失败", error.message);
    toast(error.message, true);
  } finally {
    el("readerImportButton").disabled = false;
    el("readerPdfInput").value = "";
  }
}

async function archiveReaderPdf() {
  const paper = state.readerPaper;
  if (!paper) return;
  if (!state.storage?.configured) {
    if (!el("storageDialog").open) el("storageDialog").showModal();
    toast("请先完成 Cloudflare R2 配置");
    return;
  }
  const button = el("readerCloudButton");
  button.disabled = true;
  button.textContent = "正在上传";
  try {
    let mode = el("readerStorageMode").value;
    if (!state.readerAsset?.cloud_available && mode === "local") {
      mode = "hybrid";
      el("readerStorageMode").value = mode;
    }
    const asset = mode === "local"
      ? await api(`/api/papers/${encodeURIComponent(paper.id)}/resolve`, { method: "POST", body: JSON.stringify({ storage: mode }) })
      : await api(`/api/papers/${encodeURIComponent(paper.id)}/archive`, {
        method: "POST",
        body: JSON.stringify({ remove_local: mode === "cloud" }),
      });
    renderReaderAsset(paper, asset, false);
    toast(`PDF 已保存到 ${asset.cloud_provider}`);
  } catch (error) {
    toast(error.message, true);
    button.disabled = false;
    button.textContent = "立即转存云端";
  }
}

const formatStorageBytes = (bytes = 0) => {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${unit}`;
};

function renderStorageStatus(payload) {
  state.storage = payload;
  const settings = payload.settings || {};
  updateReaderStorageAction();
  el("readerStorageMode").querySelectorAll("option").forEach((option) => {
    option.disabled = !payload.configured && option.value !== "local";
  });
  el("defaultStorageMode").querySelectorAll("option").forEach((option) => {
    option.disabled = !payload.configured && option.value !== "local";
  });
  el("defaultStorageMode").value = settings.pdf_storage_mode || "local";
  el("readerStorageMode").value = settings.pdf_storage_mode || "local";
  el("localPdfDir").value = settings.local_pdf_dir || "";
  el("localCacheMaxMb").value = settings.local_cache_max_mb || 2048;
  el("r2BillingCycleDay").value = settings.r2_billing_cycle_day || 1;
  el("storageEntryStatus").textContent = payload.configured ? payload.provider : "本地";
  const usage = payload.usage || {};
  el("cloudUsageMeta").textContent = payload.configured
    ? `${payload.provider} · ${payload.bucket} · ${usage.period_start || ""} 至 ${usage.period_end || ""} · ${usage.object_count || 0} 个对象`
    : `尚未配置对象存储${payload.missing_configuration?.length ? ` · 缺少 ${payload.missing_configuration.join("、")}` : ""}`;
  const meters = [
    ["存储容量", usage.storage_percent || 0, `${formatStorageBytes(usage.storage_bytes || 0)} / 10 GB`],
    ["A 类操作", usage.class_a_percent || 0, `${Number(usage.class_a || 0).toLocaleString()} / 1,000,000`],
    ["B 类操作", usage.class_b_percent || 0, `${Number(usage.class_b || 0).toLocaleString()} / 10,000,000`],
  ];
  el("storageUsageMeters").innerHTML = meters.map(([label, percent, detail]) => `<div class="usage-meter"><div><strong>${label}</strong><span>${detail}</span></div><progress max="100" value="${Math.min(100, percent)}"></progress><small>${percent.toFixed(3)}% 免费额度</small></div>`).join("");
  const estimate = Number(usage.estimated_overage_usd || 0);
  el("storageUsageNotice").textContent = payload.configured
    ? `${usage.estimate_notice || ""} 当前估算超额费用：$${estimate.toFixed(4)}。${usage.inventory_error ? ` 清点失败：${usage.inventory_error}` : ""}`
    : "配置后，Paperfield 会每天清点一次桶容量，并统计自身产生的 A/B 类操作。";
}

async function loadStorageStatus(refresh = false) {
  const payload = await api(`/api/storage${refresh ? "?refresh=1" : ""}`);
  renderStorageStatus(payload);
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
  renderReadingBackupStatus("readerBackupStatus", false);
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
    renderReadingBackupStatus("readerBackupStatus", paper.reading_backup_available, paper.reading_backup_pending);
    updateReaderStorageAction();
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
  const stages = ["1/3 读取 PDF 全文", "2/3 整理方法与实验", "3/3 等待模型生成中文精读"];
  container.innerHTML = `<div class="explain-head"><h3>全文精读</h3><span class="explain-mode" id="readerAnalysisStage">${stages[0]}</span></div><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div>`;
  let stageIndex = 0;
  const stageTimer = window.setInterval(() => {
    stageIndex = Math.min(stages.length - 1, stageIndex + 1);
    const stage = el("readerAnalysisStage");
    if (stage) stage.textContent = stages[stageIndex];
  }, 6000);
  try {
    const explanation = await api(`/api/papers/${encodeURIComponent(paper.id)}/explain`, { method: "POST", body: "{}" });
    paper.explanation = explanation;
    container.innerHTML = explanationMarkup(explanation);
    container.querySelector("[data-explain]")?.addEventListener("click", generateReaderExplanation);
    toast(explanation.reading_basis === "fulltext" ? "全文精读已生成" : "仅找到摘要，已生成摘要讲解");
    monitorPaperReadingBackup(paper.id);
  } catch (error) {
    container.innerHTML = `<div class="reader-explain-empty"><strong>精读生成失败</strong><p>${escapeHtml(error.message)}</p><button class="button button-secondary" type="button" data-reader-explain>重试</button></div>`;
    container.querySelector("[data-reader-explain]").addEventListener("click", generateReaderExplanation);
  } finally {
    window.clearInterval(stageTimer);
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
  if (isProjectMode()) state.selectedProject = null;
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
  el("navProjectRecommendedCount").textContent = Math.min(4, stats.project_total);
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
  const projectMode = isProjectMode();
  const recommendedMode = state.view === "recommended";
  state.topic = "";
  state.view = projectMode ? state.view : recommendedMode ? "recommended" : "all";
  state.status = "";
  ["searchInput", "authorFilter", "dateFilter"].forEach((id) => { el(id).value = ""; });
  ["topicFilter", "tierFilter", "platformFilter", "venueFilter", "institutionFilter", "sourceFilter"].forEach((id) => { el(id).value = ""; });
  el("projectLanguageFilter").value = "";
  el("projectSortFilter").value = "updated";
  el("projectSecondarySortFilter").value = "";
  el("sortFilter").value = "quality";
  el("secondarySortFilter").value = "";
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
  ["topicFilter", "tierFilter", "platformFilter", "venueFilter", "institutionFilter", "sourceFilter", "dateFilter", "sortFilter", "secondarySortFilter"].forEach((id) => el(id).addEventListener("change", () => {
    if (id === "topicFilter") state.topic = "";
    loadPapers({ preserveSelection: false });
  }));
  ["projectLanguageFilter", "projectSortFilter", "projectSecondarySortFilter"].forEach((id) => el(id).addEventListener("change", () => loadPapers({ preserveSelection: false })));
  el("clearFilters").addEventListener("click", clearFilters);
  el("emptyClear").addEventListener("click", clearFilters);
  el("refreshButton").addEventListener("click", triggerRefresh);
  el("logoutButton").addEventListener("click", async () => {
    try {
      await api("/api/auth/logout", { method: "POST", body: "{}" });
    } finally {
      window.location.replace("/login");
    }
  });
  el("openConnectorButton").addEventListener("click", () => {
    el("connectorQuery").value = "";
    el("connectorResults").innerHTML = "";
    el("connectorDialog").showModal();
    el("connectorQuery").focus();
  });
  el("connectorClose").addEventListener("click", () => el("connectorDialog").close());
  el("openStorageButton").addEventListener("click", () => {
    el("storageDialog").showModal();
    el("defaultStorageMode").focus();
  });
  el("storageClose").addEventListener("click", () => el("storageDialog").close());
  el("refreshStorageUsage").addEventListener("click", async () => {
    const button = el("refreshStorageUsage");
    button.disabled = true;
    button.textContent = "正在清点";
    try {
      await loadStorageStatus(true);
      toast("云端用量已更新");
    } catch (error) {
      toast(error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = "重新清点";
    }
  });
  el("storageSettingsForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    try {
      await api("/api/settings", {
        method: "POST",
        body: JSON.stringify({
          pdf_storage_mode: el("defaultStorageMode").value,
          local_pdf_dir: el("localPdfDir").value.trim(),
          local_cache_max_mb: Number(el("localCacheMaxMb").value),
          r2_billing_cycle_day: Number(el("r2BillingCycleDay").value),
        }),
      });
      await loadStorageStatus();
      toast("存储设置已保存");
    } catch (error) {
      toast(error.message, true);
    } finally {
      button.disabled = false;
    }
  });
  el("connectorForm").addEventListener("submit", (event) => { event.preventDefault(); searchConnector(); });
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
    const activeItems = isProjectMode() ? state.projects : state.papers;
    if ((event.key === "j" || event.key === "k") && activeItems.length) {
      event.preventDefault();
      const current = Math.max(0, activeItems.findIndex((item) => isProjectMode() ? item.full_name === state.selectedProject : item.id === state.selectedId));
      const next = event.key === "j" ? Math.min(activeItems.length - 1, current + 1) : Math.max(0, current - 1);
      if (isProjectMode()) openProjectReader(activeItems[next].full_name);
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
  el("readerImportButton").addEventListener("click", () => el("readerPdfInput").click());
  el("pdfUnavailableImportButton").addEventListener("click", () => el("readerPdfInput").click());
  el("readerPdfInput").addEventListener("change", () => importReaderPdf(el("readerPdfInput").files?.[0]));
  el("readerCloudButton").addEventListener("click", archiveReaderPdf);
  el("readerStorageMode").addEventListener("change", updateReaderStorageAction);
  el("projectReaderClose").addEventListener("click", () => el("projectReaderDialog").close());
  document.querySelectorAll("[data-project-tab]").forEach((button) => button.addEventListener("click", () => setProjectTab(button.dataset.projectTab)));
  document.querySelectorAll("[data-project-file-mode]").forEach((button) => button.addEventListener("click", () => renderProjectFiles(button.dataset.projectFileMode)));
  el("projectRefreshSource").addEventListener("click", () => state.projectWorkspace && openProjectReader(state.projectWorkspace.project.full_name, true));
  el("projectFileSearch").addEventListener("input", () => {
    if (el("projectFileSearch").value.trim() && state.projectFileMode !== "all") renderProjectFiles("all");
    filterProjectFiles();
  });
  el("projectRootReadme").addEventListener("click", restoreProjectReadme);
  document.querySelectorAll("[data-project-doc-lang]").forEach((button) => button.addEventListener("click", () => setProjectDocumentLanguage(button.dataset.projectDocLang)));
  el("projectCodeWrap").addEventListener("click", () => {
    state.projectCodeWrapped = !state.projectCodeWrapped;
    el("projectCodeContent").classList.toggle("is-wrapped", state.projectCodeWrapped);
    el("projectCodeWrap").classList.toggle("is-active", state.projectCodeWrapped);
  });
  el("projectCodeCopy").addEventListener("click", async () => {
    if (!state.projectCurrentContent) return;
    try {
      await navigator.clipboard.writeText(state.projectCurrentContent);
      toast("代码已复制");
    } catch (error) {
      toast("浏览器不允许访问剪贴板", true);
    }
  });
  el("projectChatForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const workspace = state.projectWorkspace;
    const question = el("projectChatQuestion").value.trim();
    if (!workspace || !question) return;
    const button = event.submitter || el("projectChatForm").querySelector("button[type=submit]");
    button.disabled = true;
    el("projectChatQuestion").value = "";
    try {
      await api(`/api/projects/${encodeURIComponent(workspace.project.full_name)}/chat`, {
        method: "POST",
        body: JSON.stringify({ question, selected_path: state.projectSelectedPath }),
      });
      await loadProjectChatHistory(workspace.project.full_name);
      monitorProjectReadingBackup(workspace.project.full_name);
    } catch (error) {
      toast(error.message, true);
    } finally {
      button.disabled = false;
    }
  });
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
      monitorPaperReadingBackup(paper.id);
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
  const requestedView = initialParams.get("view");
  if (requestedView === "project-recommended") state.view = "project-recommended";
  else if (requestedView === "projects" || initialProject) state.view = "projects";
  el("overviewDate").textContent = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(now);
  bindEvents();
  applyViewMode();
  document.querySelectorAll(".rail-link").forEach((item) => item.classList.toggle("is-active", item.dataset.view === state.view));
  try {
    await Promise.all([loadAuthUser(), loadOptions(), loadStats(), loadStorageStatus(), loadPapers({ preserveSelection: false })]);
    if (initialPaperId) await openPaper(initialPaperId, false);
    if (initialProject) await openProjectReader(initialProject);
  } catch (error) {
    toast(error.message, true);
  }
}

init();
