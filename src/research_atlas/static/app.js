const state = {
  config: null,
  data: null,
  activeView: "radar",
  previousView: "radar",
  scope: "global",
  libraryKind: "papers",
  currentPaper: null,
  currentProject: null,
  dossierTab: "overview",
  analysisPaper: null,
  analysisTask: null,
  signalEditor: {
    mode: "create",
    signal: null,
    term: null,
    trigger: null,
  },
  editor: {
    loaded: false,
    loading: false,
    activeTab: "batches",
    batches: [],
    selectedBatchId: "",
    selectedBatch: null,
    entities: [],
    selectedEntityId: "",
    selectedEntity: null,
    relationships: [],
    coverage: [],
    audit: [],
  },
  frontier: {
    data: null,
    loading: false,
    error: "",
    query: "",
    filters: { domain: "", source: "", maturity: "", from: "", to: "" },
  },
  news: {
    items: [],
    sources: [],
    runs: [],
    monitor: null,
    stats: null,
    selectedId: 0,
    selected: null,
    loading: false,
    error: "",
    filters: { domain: "", topic: "", articleType: "", source: "", importance: "", from: "", to: "", unread: false, saved: false, q: "" },
  },
  knowledge: {
    method: [],
    problem: [],
    thread: [],
    loading: false,
    loaded: false,
    errors: {},
    selectedKind: "method",
    selectedId: "",
    selected: null,
  },
  researchThreads: {
    items: [],
    loading: false,
    loaded: false,
    error: "",
    selectedId: "",
    selected: null,
    flowloomCleanup: null,
  },
  curriculum: {
    data: null,
    learning: null,
    loading: false,
    error: "",
    track: "embodied",
    selectedChapterId: "",
    selectedLessonPath: "",
    lessonLoadingPath: "",
    lessonError: "",
    lessonCache: new Map(),
    mathRuntimePromise: null,
    mermaidRuntimePromise: null,
    expandedModules: new Set(),
  },
  loop: {
    tab: "focus",
    diagnostics: null,
    backups: [],
    publicDigests: [],
    researchViews: [],
    researchViewRuns: [],
    notifications: [],
    evidenceBundles: [],
    searchSnapshots: [],
    editingView: null,
  },
  catalogSearch: null,
  searchTimer: null,
  search: "",
  refreshInFlight: false,
  dataFingerprint: "",
  dossierFingerprint: "",
  bridge: {
    session: "",
    token: "",
    paperfieldOrigin: "",
    sourceWindow: null,
  },
};

const el = (id) => document.getElementById(id);
const viewPanels = () => [...document.querySelectorAll("[data-view-panel]")];
const navLinks = () => [...document.querySelectorAll(".rail-link[data-view]")];
const mobileQuery = globalThis.matchMedia("(max-width: 45.99rem)");
const curriculumTreeWideQuery = globalThis.matchMedia("(min-width: 68.75rem)");
const dialogTriggers = new Map();

function rememberDialogTrigger(dialog, trigger = null) {
  if (!dialog || dialog.open) return;
  const candidate = trigger instanceof HTMLElement ? trigger : document.activeElement;
  if (candidate instanceof HTMLElement && candidate.isConnected && candidate !== document.body && !candidate.closest("dialog[open]")) {
    dialogTriggers.set(dialog.id, candidate);
  }
}

function openManagedDialog(dialog, trigger = null, initialFocus = null) {
  if (!dialog) return;
  rememberDialogTrigger(dialog, trigger);
  if (!dialog.open) dialog.showModal();
  window.requestAnimationFrame(() => {
    if (!dialog.open) return;
    const requested = typeof initialFocus === "function" ? initialFocus() : initialFocus;
    const target = requested?.isConnected
      ? requested
      : dialog.querySelector("[autofocus], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])");
    target?.focus({ preventScroll: true });
  });
}

function bindDialogFocusRestore(dialog) {
  if (!dialog) return;
  dialog.addEventListener("keydown", (event) => {
    if (!(event.target instanceof Element) || event.target.closest("dialog") !== dialog) return;
    if (event.key === "Escape") {
      event.preventDefault();
      if (dialog.open) dialog.close();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...dialog.querySelectorAll("a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])")]
      .filter((item) => !item.hidden && item.getClientRects().length);
    if (!focusable.length) {
      event.preventDefault();
      dialog.focus({ preventScroll: true });
      return;
    }
    const current = focusable.indexOf(document.activeElement);
    if (event.shiftKey && current <= 0) {
      event.preventDefault();
      focusable[focusable.length - 1].focus({ preventScroll: true });
    } else if (!event.shiftKey && (current === focusable.length - 1 || current < 0)) {
      event.preventDefault();
      focusable[0].focus({ preventScroll: true });
    }
  });
  dialog.addEventListener("close", () => {
    const trigger = dialogTriggers.get(dialog.id);
    dialogTriggers.delete(dialog.id);
    if (!trigger?.isConnected) return;
    const owner = trigger.closest("dialog");
    if (owner && !owner.open) return;
    window.requestAnimationFrame(() => trigger.focus({ preventScroll: true }));
  });
}

const escapeHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

function displayDate(value) {
  if (!value) return "日期未知";
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "short", day: "numeric" }).format(date);
}

function textSnippet(value, maximum = 420) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > maximum ? `${text.slice(0, maximum).trim()}...` : text;
}

function shortId(value = "") {
  return String(value).slice(0, 8);
}

function operationIdempotencyKey(kind, reference) {
  const storageKey = `researchAtlas.pendingOperation.${kind}.${reference}`;
  let key = "";
  try {
    key = sessionStorage.getItem(storageKey) || "";
  } catch {
    key = "";
  }
  if (!key) {
    const suffix = globalThis.crypto?.randomUUID?.()
      || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    key = `${kind}-${suffix}`;
    try {
      sessionStorage.setItem(storageKey, key);
    } catch {
      // A blocked sessionStorage still permits the operation; retries in the
      // current function call keep the generated key in memory.
    }
  }
  return {
    key,
    clear() {
      try {
        sessionStorage.removeItem(storageKey);
      } catch {
        // No persistent browser state was available.
      }
    },
  };
}

const signalTypeLabels = {
  terminology_shift: "术语变化",
  research_question: "研究问题",
  method_change: "方法变化",
  benchmark: "基准/评测",
  replication: "复现与反证",
  artifact_release: "工程产物",
};

const signalMaturityLabels = {
  candidate: "候选",
  emerging: "正在形成",
  validated: "已有验证",
  contested: "存在争议",
  stable: "相对稳定",
  cooling: "热度回落",
};

const signalEvidenceRoleLabels = {
  naming_context: "命名语境",
  definition: "定义语境",
  representative: "代表论文",
  replication: "复现证据",
  contradiction: "相反证据",
  latest_progress: "近期进展",
};

function signalStatusDetails(status) {
  return {
    draft: { label: "草稿待审核", className: "is-warning" },
    published: { label: "已发布", className: "is-success" },
    retracted: { label: "已撤回", className: "is-danger" },
  }[status] || { label: "状态未知", className: "" };
}

async function api(path, options = {}) {
  const mountedPath = window.location.pathname.startsWith("/atlas/") && String(path).startsWith("/api/")
    ? `/atlas${path}`
    : path;
  const response = await fetch(mountedPath, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  if (!response.ok) {
    const error = new Error(payload.error || `Atlas 请求失败（${response.status}）`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function toast(message, error = false) {
  const item = document.createElement("div");
  item.className = `toast${error ? " is-error" : ""}`;
  item.textContent = message;
  el("toastRegion").append(item);
  window.setTimeout(() => item.remove(), 4200);
}

function setServiceState(kind, label, meta = "Atlas 本地服务") {
  el("serviceDot").className = `service-dot${kind ? ` is-${kind}` : ""}`;
  el("serviceLabel").textContent = label;
  el("serviceMeta").textContent = meta;
}

function setNavigation(open, restoreFocus = true) {
  const active = Boolean(open && mobileQuery.matches);
  const wasActive = document.body.classList.contains("is-nav-open");
  const rail = el("appRail");
  const main = el("mainContent");
  document.body.classList.toggle("is-nav-open", active);
  el("navToggle").setAttribute("aria-expanded", String(active));
  el("navBackdrop").hidden = !active;
  if (!mobileQuery.matches) {
    rail.inert = false;
    main.inert = false;
    rail.removeAttribute("aria-hidden");
    rail.removeAttribute("aria-modal");
    rail.removeAttribute("role");
    return;
  }
  if (active) {
    rail.inert = false;
    rail.removeAttribute("aria-hidden");
    rail.setAttribute("role", "dialog");
    rail.setAttribute("aria-modal", "true");
    main.inert = true;
    window.requestAnimationFrame(() => el("navClose").focus({ preventScroll: true }));
    return;
  }
  main.inert = false;
  if (wasActive && restoreFocus) el("navToggle").focus({ preventScroll: true });
  rail.inert = true;
  rail.setAttribute("aria-hidden", "true");
  rail.removeAttribute("aria-modal");
  rail.removeAttribute("role");
}

function handleNavigationKeydown(event) {
  if (!document.body.classList.contains("is-nav-open")) return;
  if (event.key === "Escape") {
    event.preventDefault();
    setNavigation(false);
    return;
  }
  if (event.key !== "Tab") return;
  const focusable = [...el("appRail").querySelectorAll("a[href], button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex='-1'])")]
    .filter((item) => !item.hidden && item.getClientRects().length);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!el("appRail").contains(document.activeElement)) {
    event.preventDefault();
    first.focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function activateRovingTab(button, selector) {
  document.querySelectorAll(selector).forEach((item) => {
    const active = item === button;
    item.classList.toggle("is-active", active);
    item.setAttribute("aria-selected", String(active));
    item.tabIndex = active ? 0 : -1;
  });
}

function bindRovingTablist(tablist) {
  tablist.addEventListener("keydown", (event) => {
    const orientation = tablist.getAttribute("aria-orientation") || "horizontal";
    const previousKey = orientation === "vertical" ? "ArrowUp" : "ArrowLeft";
    const nextKey = orientation === "vertical" ? "ArrowDown" : "ArrowRight";
    if (![previousKey, nextKey, "Home", "End"].includes(event.key)) return;
    const tabs = [...tablist.querySelectorAll(':scope > [role="tab"]:not(:disabled)')];
    if (!tabs.length) return;
    const currentTab = event.target.closest('[role="tab"]');
    const current = tabs.indexOf(currentTab);
    if (current < 0) return;
    event.preventDefault();
    const next = event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : (current + (event.key === nextKey ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].focus();
    tabs[next].click();
  });
}

function locationForView(view, item = null) {
  const url = new URL(window.location.href);
  ["view", "paper", "repo", "ref", "paperfield_id", "track", "chapter", "lesson", "thread", "q", "paperfieldBridgeSession", "paperfieldOrigin"].forEach((key) => url.searchParams.delete(key));
  url.hash = "";
  if (view === "dossier" && item) url.searchParams.set("paper", item.id);
  else if (view === "project" && item) url.searchParams.set("repo", item.full_name);
  else if (view === "curriculum") {
    url.searchParams.set("view", "curriculum");
    url.searchParams.set("track", state.curriculum.track);
    if (state.curriculum.selectedChapterId) url.searchParams.set("chapter", state.curriculum.selectedChapterId);
    if (state.curriculum.selectedLessonPath) url.searchParams.set("lesson", state.curriculum.selectedLessonPath);
  }
  else if (view === "threads" && item) {
    url.searchParams.set("view", "threads");
    url.searchParams.set("thread", item.slug || item.id);
  }
  else if (view === "radar" && state.frontier.query) url.searchParams.set("q", state.frontier.query);
  else if (view !== "radar") url.searchParams.set("view", view);
  return url;
}

function showView(view, { item = null, updateUrl = true } = {}) {
  const panel = document.querySelector(`[data-view-panel="${CSS.escape(view)}"]`);
  if (!panel) return;
  if (state.activeView !== view && !["dossier", "project"].includes(state.activeView)) state.previousView = state.activeView;
  state.activeView = view;
  viewPanels().forEach((candidate) => { candidate.hidden = candidate !== panel; });
  navLinks().forEach((button) => {
    const active = button.dataset.view === view || (view === "dossier" && button.dataset.view === "library") || (view === "project" && button.dataset.view === "library");
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  if (updateUrl) window.history.pushState({}, "", locationForView(view, item));
  setNavigation(false);
  const heading = panel.querySelector("h1");
  if (heading) {
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }
  window.scrollTo({ top: 0, behavior: globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  if (view === "editor") void loadEditorWorkspace();
  if (view === "methods") void loadKnowledgeViews();
  if (view === "threads") void loadPublicThreads();
  if (view === "curriculum") {
    if (state.curriculum.data) renderCurriculum();
    else void loadCurriculum();
  }
  if (view === "loop") void loadLoopOperations();
  if (view === "news") void loadNews();
}

function paperfieldPaperIdUrl(paperfieldId) {
  const base = new URL(state.config?.paperfield_base_url || "/", window.location.origin);
  base.searchParams.set("paper", String(paperfieldId).trim());
  base.searchParams.set("reader", "1");
  return base.href;
}

function paperfieldPaperUrl(paper) {
  const paperfieldId = String(paper?.paperfield_id || "").trim();
  if (paperfieldId) return paperfieldPaperIdUrl(paperfieldId);
  const reference = String(paper?.canonical_ref || "").trim();
  return reference ? paperfieldReferenceUrl(reference) : "";
}

function paperfieldReferenceUrl(reference) {
  const base = new URL(state.config?.paperfield_base_url || "/", window.location.origin);
  base.searchParams.set("paper_ref", reference);
  base.searchParams.set("action", "resolve");
  base.searchParams.set("reader", "1");
  return base.href;
}

function paperfieldCurriculumPaperUrl(paper) {
  const base = new URL(paperfieldReferenceUrl(paper.ref));
  if (paper.title) base.searchParams.set("expected_title", paper.title);
  return base.href;
}

function paperfieldProjectUrl(project) {
  const base = new URL(state.config?.paperfield_base_url || "/", window.location.origin);
  base.searchParams.set("project", project.full_name);
  return base.href;
}

function curriculumChapterLocations() {
  const locations = [];
  for (const track of state.curriculum.data?.tracks || []) {
    for (const module of track.modules || []) {
      for (const chapter of module.chapters || []) locations.push({ track, module, chapter });
    }
  }
  return locations;
}

function curriculumChapterLocation(chapterId) {
  return curriculumChapterLocations().find((item) => item.chapter.id === chapterId) || null;
}

function curriculumTrack() {
  const tracks = state.curriculum.data?.tracks || [];
  return tracks.find((item) => item.id === state.curriculum.track) || tracks[0] || null;
}

function curriculumStatusDetails(status) {
  return {
    stable: { label: "稳定基础", className: "is-success" },
    active: { label: "活跃方向", className: "is-primary" },
    needs_review: { label: "前沿待核查", className: "is-warning" },
  }[status] || { label: status || "状态未标注", className: "" };
}

function learningStatusDetails(status) {
  return {
    not_started: { label: "未开始", className: "" },
    queued: { label: "已加入队列", className: "is-primary" },
    learning: { label: "学习中", className: "is-primary" },
    review: { label: "需复习", className: "is-warning" },
    mastered: { label: "已掌握", className: "is-success" },
  }[status] || { label: "未开始", className: "" };
}

function learningChapterState(chapterId) {
  return (state.curriculum.learning?.items || []).find((item) => item.chapter_id === chapterId)
    || { chapter_id: chapterId, status: "not_started", prerequisite_gaps: [], ready: false, blocked: false };
}

function learningStatusOptions(selected) {
  return Object.entries({
    not_started: "未开始",
    queued: "加入队列",
    learning: "学习中",
    review: "需复习",
    mastered: "已掌握",
  }).map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`).join("");
}

function learningGapText(learning) {
  return learning.prerequisite_gaps?.length
    ? `还缺 ${learning.prerequisite_gaps.map((gap) => `${gap.chapter_id} ${gap.title}`).join("、")}`
    : "先修已满足";
}

function learningQueueMarkup(trackId = "") {
  const queue = (state.curriculum.learning?.queue || []).filter((item) => !trackId || item.track_id === trackId);
  if (!queue.length) return `<p class="learning-empty-line">先修未满足，或你已标记的章节已经完成。点击章节后可显式加入学习队列。</p>`;
  return `<ol class="learning-queue-list">${queue.slice(0, 6).map((item, index) => {
    const status = learningStatusDetails(item.status);
    return `<li><button type="button" data-curriculum-chapter="${escapeHtml(item.chapter_id)}"><span class="learning-queue-rank">${index + 1}</span><span><strong>${escapeHtml(item.chapter_code)} · ${escapeHtml(item.chapter_title)}</strong><small>${escapeHtml(status.label)} / ${escapeHtml(item.reason)}</small></span></button></li>`;
  }).join("")}</ol>`;
}

function activeLearningChapterContexts() {
  const active = new Set(["queued", "learning", "review"]);
  return (state.curriculum.learning?.items || [])
    .filter((item) => active.has(item.status))
    .map((item) => ({ ...item, location: curriculumChapterLocation(item.chapter_id) }))
    .filter((item) => item.location);
}

function normalizedLearningQuery(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/[\s_-]+/g, " ").trim();
}

function learningRelevance(item, kind) {
  const analysisIds = new Set((state.data?.analysis_requests || []).map((task) => String(task.canonical_paper_id || "")));
  const analysisRefs = new Set((state.data?.analysis_requests || []).map((task) => task.paper?.canonical_ref).filter(Boolean));
  const activeChapters = activeLearningChapterContexts();
  const activeById = new Map(activeChapters.map((chapter) => [chapter.chapter_id, chapter]));
  const reasons = [];
  const add = (key, text) => {
    if (text && !reasons.some((reason) => reason.key === key)) reasons.push({ key, text });
  };
  const papers = kind === "candidate" || kind === "paper"
    ? [kind === "candidate" ? (item.paper || {}) : item]
    : kind === "signal" || kind === "term"
      ? (item.evidence || []).map((evidence) => evidence.paper || {}).filter(Boolean)
      : [];
  for (const paper of papers) {
    if (analysisIds.has(String(paper.id || "")) || analysisRefs.has(paper.canonical_ref)) {
      add("analysis", "这篇论文已在你的深度分析范围中");
    }
    for (const chapter of paper.curriculum?.chapters || []) {
      const active = activeById.get(chapter.chapter_id);
      if (active) add(`chapter:${chapter.chapter_id}`, `关联 ${active.chapter_code}「${active.chapter_title}」`);
    }
  }
  if (kind === "update") {
    const related = item.related_paper_refs || [];
    if (related.some((reference) => analysisRefs.has(reference))) add("analysis", "关联你正在深度分析的论文");
  }
  const matched = new Map((item.matched_queries || []).map((query) => [normalizedLearningQuery(query), query]));
  for (const active of activeChapters) {
    for (const query of active.location.chapter.frontier_queries || []) {
      const matchedLabel = matched.get(normalizedLearningQuery(query));
      if (matchedLabel) {
        add(`query:${active.chapter_id}:${normalizedLearningQuery(query)}`, `命中 ${active.chapter_code} 的前沿查询「${matchedLabel}」`);
      }
    }
  }
  return reasons;
}

function learningRelevanceMarkup(item, kind) {
  const reasons = learningRelevance(item, kind);
  if (!reasons.length) return "";
  return `<div class="learning-relevance"><strong>为什么与你相关</strong><ul>${reasons.slice(0, 3).map((reason) => `<li>${escapeHtml(reason.text)}</li>`).join("")}</ul></div>`;
}

function curriculumKindLabel(kind) {
  return {
    foundation: "基础",
    core: "主干",
    frontier: "前沿",
    systems: "系统",
    research: "研究方法",
    branching: "分支",
  }[kind] || kind || "章节";
}

function normalizeCourseLessonPath(path) {
  return String(path || "").trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").replace(/\.md$/i, "");
}

function loadCourseScript(id, source) {
  const existing = document.getElementById(id);
  if (existing?.dataset.loaded === "true") return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const script = existing || document.createElement("script");
    const cleanup = () => {
      script.removeEventListener("load", loaded);
      script.removeEventListener("error", failed);
    };
    const loaded = () => {
      script.dataset.loaded = "true";
      cleanup();
      resolve(script);
    };
    const failed = () => {
      cleanup();
      script.remove();
      reject(new Error(`课程渲染组件加载失败：${source}`));
    };
    script.addEventListener("load", loaded, { once: true });
    script.addEventListener("error", failed, { once: true });
    if (!existing) {
      script.id = id;
      script.src = new URL(source, document.baseURI).href;
      script.async = true;
      document.head.append(script);
    }
  });
}

function ensureCourseMathRuntime() {
  if (globalThis.MathJax?.typesetPromise) return Promise.resolve(globalThis.MathJax);
  if (!state.curriculum.mathRuntimePromise) {
    state.curriculum.mathRuntimePromise = (async () => {
      await loadCourseScript("atlas-course-runtime", "course-runtime.js?v=0.17.2");
      await loadCourseScript("atlas-course-mathjax", "course-assets/mathjax-3.2.2/tex-mml-chtml.js");
      if (globalThis.MathJax?.startup?.promise) await globalThis.MathJax.startup.promise;
      if (!globalThis.MathJax?.typesetPromise) throw new Error("课程公式组件未就绪");
      return globalThis.MathJax;
    })().catch((error) => {
      state.curriculum.mathRuntimePromise = null;
      throw error;
    });
  }
  return state.curriculum.mathRuntimePromise;
}

function ensureCourseMermaidRuntime() {
  if (globalThis.mermaid?.run) return Promise.resolve(globalThis.mermaid);
  if (!state.curriculum.mermaidRuntimePromise) {
    state.curriculum.mermaidRuntimePromise = loadCourseScript(
      "atlas-course-mermaid",
      "course-assets/mermaid-11.16.1/mermaid.min.js",
    ).then(() => {
      if (!globalThis.mermaid?.run) throw new Error("课程方法图组件未就绪");
      return globalThis.mermaid;
    }).catch((error) => {
      state.curriculum.mermaidRuntimePromise = null;
      throw error;
    });
  }
  return state.curriculum.mermaidRuntimePromise;
}

function curriculumLessonLocation(path, preferredChapterId = state.curriculum.selectedChapterId) {
  const normalized = normalizeCourseLessonPath(path);
  if (!normalized) return null;
  const locations = [];
  for (const track of state.curriculum.data?.tracks || []) {
    for (const module of track.modules || []) {
      for (const chapter of module.chapters || []) {
        const lesson = (chapter.course_lessons || []).find((item) => normalizeCourseLessonPath(item.path) === normalized);
        if (lesson) locations.push({ track, module, chapter, lesson });
      }
    }
  }
  const sourceTrackId = normalized.split("/", 1)[0];
  return locations.find((location) => location.chapter.id === preferredChapterId)
    || locations.find((location) => location.track.id === sourceTrackId)
    || locations[0]
    || null;
}

function curriculumLessonUrl(path) {
  const normalized = normalizeCourseLessonPath(path);
  const location = curriculumLessonLocation(normalized);
  const url = locationForView("curriculum");
  if (location) {
    url.searchParams.set("track", location.track.id);
    url.searchParams.set("chapter", location.chapter.id);
  } else if (["llm", "embodied"].includes(normalized.split("/", 1)[0])) {
    url.searchParams.set("track", normalized.split("/", 1)[0]);
  }
  if (normalized) url.searchParams.set("lesson", normalized);
  return url.href;
}

function resolveCourseRelativePath(currentPath, href) {
  const raw = String(href || "").trim();
  if (!raw || raw.startsWith("#") || /^[a-z][a-z\d+.-]*:/i.test(raw) || raw.startsWith("//")) return "";
  let decoded = raw.split(/[?#]/, 1)[0].replace(/\\/g, "/");
  try { decoded = decodeURIComponent(decoded); } catch { /* Keep the browser-decoded value. */ }
  const parts = decoded.startsWith("/") ? [] : normalizeCourseLessonPath(currentPath).split("/").slice(0, -1);
  for (const part of decoded.replace(/^\/+/, "").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  const resolved = parts.join("/");
  return ["llm", "embodied"].includes(parts[0]) ? resolved : "";
}

function courseContentAssetUrl(path) {
  const url = new URL("api/curriculum/asset", document.baseURI);
  url.searchParams.set("path", path);
  url.searchParams.set("v", state.curriculum.data?.curriculum_version || "current");
  return url.href;
}

function courseRepositoryUrl(path, directory = false) {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const kind = directory ? "tree" : "blob";
  return `https://github.com/Shiraikuroko123/paperfield/${kind}/main/content/courses/%E8%AF%BE%E7%A8%8B/${encoded}`;
}

function curriculumListSection(title, items, className = "") {
  if (!items?.length) return "";
  return `<section class="curriculum-detail-section ${escapeHtml(className)}"><h3>${escapeHtml(title)}</h3><ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>`;
}

function curriculumLessonPickerMarkup(courseLessons) {
  const selectedPath = normalizeCourseLessonPath(state.curriculum.selectedLessonPath);
  const lessons = [...(courseLessons || [])];
  if (selectedPath && !lessons.some((lesson) => normalizeCourseLessonPath(lesson.path) === selectedPath)) {
    const cached = state.curriculum.lessonCache.get(selectedPath);
    lessons.unshift({ path: selectedPath, label: cached?.title || "当前教材" });
  }
  const selectedIndex = Math.max(0, lessons.findIndex((lesson) => normalizeCourseLessonPath(lesson.path) === selectedPath));
  return `<section class="curriculum-lesson-picker" aria-labelledby="curriculumLessonPickerTitle">
    <div><h3 id="curriculumLessonPickerTitle">本章教材与推导</h3><p>正文直接在 Atlas 阅读；公式、图解和章节关系与前沿雷达共用同一上下文。</p></div>
    <div>${lessons.length ? `<label class="field-label" for="curriculumLessonSelect">教材<select id="curriculumLessonSelect" data-course-lesson-select>${lessons.map((lesson) => {
      const active = normalizeCourseLessonPath(lesson.path) === selectedPath;
      return `<option value="${escapeHtml(lesson.path)}" ${active ? "selected" : ""}>${escapeHtml(lesson.label)}</option>`;
    }).join("")}</select></label><span class="lesson-picker-position">${escapeHtml(selectedIndex + 1)} / ${escapeHtml(lessons.length)}</span>` : `<span class="lesson-picker-empty">本章教材正在整理。</span>`}</div>
  </section>`;
}

function curriculumLessonTocMarkup(toc) {
  if (!toc?.length) return "";
  return `<nav class="curriculum-lesson-toc" aria-label="本课目录"><strong>本课目录</strong><ol>${toc.map((item) => `<li class="is-level-${escapeHtml(item.level)}"><a href="#${escapeHtml(item.id)}">${escapeHtml(item.title)}</a></li>`).join("")}</ol></nav>`;
}

function curriculumLessonMarkup() {
  const path = normalizeCourseLessonPath(state.curriculum.selectedLessonPath);
  if (!path) return `<section class="curriculum-lesson-reader"><div class="lesson-load-state"><strong>本章尚无正文</strong><p>仍可使用上方的理论、数学重点与论文入口。</p></div></section>`;
  if (state.curriculum.lessonLoadingPath === path) {
    return `<section class="curriculum-lesson-reader" aria-busy="true"><div class="lesson-load-state"><strong>正在读取教材</strong><p>${escapeHtml(path)}</p></div></section>`;
  }
  const lesson = state.curriculum.lessonCache.get(path);
  if (!lesson) {
    const message = state.curriculum.lessonError || "课程正文尚未载入。";
    return `<section class="curriculum-lesson-reader"><div class="lesson-load-state is-error"><strong>教材读取失败</strong><p>${escapeHtml(message)}</p><button class="button button-secondary" type="button" data-course-lesson-retry="${escapeHtml(path)}">重新读取</button></div></section>`;
  }
  return `<section class="curriculum-lesson-reader" id="curriculumLessonSurface" aria-labelledby="curriculumLessonTitle">
    <header class="curriculum-lesson-header">
      <div><p class="view-context">系统课程 / ${escapeHtml(lesson.track_id === "llm" ? "大模型" : "具身智能")}</p><h3 id="curriculumLessonTitle" tabindex="-1">${escapeHtml(lesson.title)}</h3><p>${escapeHtml(lesson.reading_minutes)} 分钟阅读 / ${escapeHtml(lesson.toc?.length || 0)} 个小节${lesson.has_math ? " / 含数学推导" : ""}${lesson.mermaid_diagrams ? ` / ${escapeHtml(lesson.mermaid_diagrams)} 幅方法图` : ""}</p></div>
      <a class="text-action" href="${escapeHtml(lesson.source_url)}" target="_blank" rel="noreferrer">查看版本化源文</a>
    </header>
    ${curriculumLessonTocMarkup(lesson.toc)}
    <article class="curriculum-lesson-content" id="curriculumLessonBody" data-course-source-path="${escapeHtml(lesson.path)}" data-course-has-math="${lesson.has_math ? "true" : "false"}">${lesson.html}</article>
    <footer class="curriculum-lesson-integrity"><span>教材源</span><code>${escapeHtml(lesson.source_path)}</code><span>SHA-256</span><code>${escapeHtml(lesson.source_sha256)}</code></footer>
  </section>`;
}

function curriculumPaperMarkup(paper) {
  const known = (state.data?.papers || []).find((item) => item.canonical_ref === paper.ref);
  const candidate = paper.evidence_status === "unreviewed_abstract_candidate";
  return `<article class="curriculum-paper">
    <div><span class="state-label ${candidate ? "is-warning" : "is-success"}">${candidate ? "摘要候选" : "引用已核对"}</span><span>${escapeHtml(paper.role || "代表论文")}</span></div>
    <h4>${escapeHtml(paper.title)}</h4>
    <p>${escapeHtml(paper.ref)}${candidate ? " / 尚未完成全文深度档案，不作为课程结论证据" : ""}</p>
    <div class="inline-actions">${known ? `<button class="button button-secondary" type="button" data-paper-id="${escapeHtml(known.id)}">查看 Atlas 档案</button>` : ""}<a class="button button-primary" href="${escapeHtml(paperfieldCurriculumPaperUrl(paper))}">在 Paperfield 精读</a></div>
  </article>`;
}

function curriculumDetailMarkup(location) {
  if (!location) return `<div class="empty-state is-compact"><strong>选择一个章节</strong><p>查看学习目标、理论、数学重点、研究痛点和代表论文。</p></div>`;
  const { track, module, chapter } = location;
  const status = curriculumStatusDetails(chapter.status);
  const prerequisites = (chapter.prerequisites || []).map((chapterId) => curriculumChapterLocation(chapterId)).filter(Boolean);
  const previous = chapter.previous_chapter_id ? curriculumChapterLocation(chapter.previous_chapter_id) : null;
  const next = chapter.next_chapter_id ? curriculumChapterLocation(chapter.next_chapter_id) : null;
  const concepts = (chapter.concepts || []).map((concept) => `<li><strong>${escapeHtml(concept.name)}</strong><p>${escapeHtml(concept.summary)}</p></li>`).join("");
  const projects = (chapter.projects || []).map((project) => {
    const match = String(project.url || "").match(/^https:\/\/github\.com\/([^/]+\/[^/#?]+)\/?(?:[?#].*)?$/i);
    const href = match
      ? new URL(`?project=${encodeURIComponent(match[1].replace(/\.git$/i, ""))}`, state.config?.paperfield_base_url || window.location.href).href
      : project.url;
    return `<li><a href="${escapeHtml(href)}"${match ? "" : ' target="_blank" rel="noreferrer"'}>${escapeHtml(project.label)}</a><span>${escapeHtml(project.role || "项目资源")}</span></li>`;
  }).join("");
  const frontierTerms = (chapter.frontier_queries || []).map((query) => `<span>${escapeHtml(query)}</span>`).join("");
  const courseLessons = chapter.course_lessons || [];
  const learning = learningChapterState(chapter.id);
  const learningStatus = learningStatusDetails(learning.status);
  const learningOptions = learningStatusOptions(learning.status);
  const gapText = learningGapText(learning);
  return `<div class="curriculum-detail-inner">
    <nav class="curriculum-breadcrumb" aria-label="当前课程位置"><ol><li>${escapeHtml(track.short_title || track.title)}</li><li>${escapeHtml(module.title)}</li><li aria-current="page">${escapeHtml(chapter.code)}</li></ol></nav>
    <header class="curriculum-chapter-header">
      <div><div class="row-topline"><span class="state-label ${status.className}">${escapeHtml(status.label)}</span><span class="state-label ${learningStatus.className}">${escapeHtml(learningStatus.label)}</span><span>${escapeHtml(curriculumKindLabel(chapter.kind))}</span><span>第 ${escapeHtml(chapter.order)} 章</span></div><h2 tabindex="-1">${escapeHtml(chapter.title)}</h2><p>${escapeHtml(chapter.summary)}</p></div>
    </header>
    <section class="learning-control" aria-labelledby="learningControlTitle"><div><h3 id="learningControlTitle">我的学习状态</h3><p>${escapeHtml(gapText)}。状态只在你明确提交后改变，不会因浏览页面自动推断掌握。</p></div><form class="learning-progress-form" data-learning-form="${escapeHtml(chapter.id)}"><label class="field-label" for="learningStatus-${escapeHtml(chapter.id)}">状态<select id="learningStatus-${escapeHtml(chapter.id)}" name="status">${learningOptions}</select></label><label class="field-label" for="learningConfidence-${escapeHtml(chapter.id)}">信心<input id="learningConfidence-${escapeHtml(chapter.id)}" name="confidence" type="number" min="0" max="100" step="5" value="${learning.confidence ?? ""}" placeholder="0-100"></label><label class="field-label learning-note-field" for="learningNote-${escapeHtml(chapter.id)}">学习备注<textarea id="learningNote-${escapeHtml(chapter.id)}" name="note" maxlength="2000" placeholder="记录仍不清楚的公式、实验或问题">${escapeHtml(learning.note || "")}</textarea></label><button class="button button-primary" type="submit">更新状态</button></form></section>
    <section class="curriculum-prerequisites"><h3>先修要求</h3>${prerequisites.length ? `<ul>${prerequisites.map((item) => `<li><button type="button" data-curriculum-chapter="${escapeHtml(item.chapter.id)}"><span>${escapeHtml(item.chapter.code)}</span><strong>${escapeHtml(item.chapter.title)}</strong></button></li>`).join("")}</ul>` : `<p>本路线起点，无章节先修。</p>`}</section>
    ${curriculumLessonPickerMarkup(courseLessons)}
    <div class="curriculum-learning-grid">
      ${curriculumListSection("学习目标", chapter.learning_goals, "is-goals")}
      ${curriculumListSection("核心理论", chapter.theory, "is-theory")}
      ${curriculumListSection("数学重点", chapter.math_focus, "is-math")}
      ${curriculumListSection("研究痛点", chapter.research_pain_points, "is-pain")}
    </div>
    <section class="curriculum-assessment"><h3>方法判断</h3><p>${escapeHtml(chapter.assessment)}</p></section>
    ${curriculumLessonMarkup()}
    <section class="curriculum-concepts"><div class="section-heading is-tight"><div><h3>本章知识点</h3><p>这些是教学索引，不是已审核公共知识实体。</p></div><span class="section-count">${escapeHtml(chapter.concepts?.length || 0)} 个</span></div><ul>${concepts}</ul></section>
    <section class="curriculum-papers"><div class="section-heading is-tight"><div><h3>代表论文</h3><p>论文会跳回 Paperfield 精读；候选论文保留证据边界。</p></div><span class="section-count">${escapeHtml(chapter.papers?.length || 0)} 篇</span></div>${chapter.papers?.length ? `<div>${chapter.papers.map(curriculumPaperMarkup).join("")}</div>` : `<p class="term-action-note">本章先建立理论坐标，不绑定单一论文。</p>`}</section>
    ${projects ? `<section class="curriculum-projects"><h3>项目与资料</h3><ul>${projects}</ul></section>` : ""}
    <section class="curriculum-frontier-link"><div><h3>接入前沿雷达</h3><p>按本章查询词查看新论文；候选不会自动升级成课程结论。</p><div>${frontierTerms}</div></div><button class="button button-secondary" type="button" data-curriculum-frontier="${escapeHtml(chapter.frontier_queries?.[0] || chapter.title)}">查看相关候选</button></section>
    <nav class="curriculum-sequence-nav" aria-label="相邻课程章节">
      ${previous ? `<button type="button" data-curriculum-chapter="${escapeHtml(previous.chapter.id)}"><span>上一章 ${escapeHtml(previous.chapter.code)}</span><strong>${escapeHtml(previous.chapter.title)}</strong></button>` : `<span></span>`}
      ${next ? `<button type="button" data-curriculum-chapter="${escapeHtml(next.chapter.id)}"><span>下一章 ${escapeHtml(next.chapter.code)}</span><strong>${escapeHtml(next.chapter.title)}</strong></button>` : `<span></span>`}
    </nav>
  </div>`;
}

function renderCurriculum() {
  const data = state.curriculum.data;
  if (!data) return;
  let track = curriculumTrack();
  if (!track) return;
  let selected = curriculumChapterLocation(state.curriculum.selectedChapterId);
  if (!selected || selected.track.id !== track.id) {
    state.curriculum.selectedChapterId = track.default_chapter_id;
    selected = curriculumChapterLocation(state.curriculum.selectedChapterId);
  }
  if (selected) {
    const chapterLessons = selected.chapter.course_lessons || [];
    const lessonLocation = curriculumLessonLocation(state.curriculum.selectedLessonPath);
    const lessonTrack = normalizeCourseLessonPath(state.curriculum.selectedLessonPath).split("/", 1)[0];
    if (
      !state.curriculum.selectedLessonPath
      || (lessonLocation && lessonLocation.chapter.id !== selected.chapter.id)
      || (lessonTrack && ["llm", "embodied"].includes(lessonTrack) && lessonTrack !== selected.track.id)
    ) {
      state.curriculum.selectedLessonPath = chapterLessons[0]?.path || "";
      state.curriculum.lessonError = "";
    }
  }
  if (selected) state.curriculum.expandedModules.add(selected.module.id);
  document.querySelectorAll("[data-curriculum-track]").forEach((button) => {
    const active = button.dataset.curriculumTrack === track.id;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  });
  const activeTab = document.querySelector(`[data-curriculum-track="${CSS.escape(track.id)}"]`);
  el("curriculumWorkspace").setAttribute("aria-labelledby", activeTab?.id || "curriculumEmbodiedTab");
  el("curriculumTrackSummary").textContent = `${track.summary} ${track.outcome}`;
  const trackItems = (state.curriculum.learning?.items || []).filter((item) => item.track_id === track.id);
  const learningStats = state.curriculum.learning?.track_stats?.[track.id] || {
    total: trackItems.length,
    mastered: trackItems.filter((item) => item.status === "mastered").length,
    learning: trackItems.filter((item) => item.status === "learning").length,
    review: trackItems.filter((item) => item.status === "review").length,
    blocked: trackItems.filter((item) => item.blocked).length,
    ready: trackItems.filter((item) => item.ready).length,
  };
  el("curriculumTrackProgress").textContent = `${learningStats.mastered || 0} / ${track.chapter_count} 已掌握`;
  const concepts = track.modules.flatMap((module) => module.chapters).flatMap((chapter) => chapter.concepts || []);
  const paperRefs = new Set(track.modules.flatMap((module) => module.chapters).flatMap((chapter) => (chapter.papers || []).map((paper) => paper.ref)));
  el("curriculumModuleCount").textContent = track.module_count;
  el("curriculumChapterCount").textContent = track.chapter_count;
  el("curriculumLessonCount").textContent = track.course_lesson_count || 0;
  el("curriculumConceptCount").textContent = concepts.length;
  el("curriculumPaperCount").textContent = paperRefs.size;
  el("curriculumVersion").textContent = data.curriculum_version;
  const learningStrip = el("curriculumLearningSummary");
  if (learningStrip) {
    learningStrip.innerHTML = `<div><span>已掌握</span><strong>${learningStats.mastered || 0}</strong></div><div><span>学习中</span><strong>${learningStats.learning || 0}</strong></div><div><span>需复习</span><strong>${learningStats.review || 0}</strong></div><div><span>先修阻塞</span><strong>${learningStats.blocked || 0}</strong></div><div><span>下一步</span><strong>${learningStats.ready || 0}</strong></div>`;
  }
  const queueList = el("curriculumLearningQueue");
  if (queueList) queueList.innerHTML = learningQueueMarkup(track.id);
  el("navCurriculumCount").textContent = data.stats?.chapters || 0;
  el("curriculumTree").innerHTML = track.modules.map((module) => {
    const expanded = state.curriculum.expandedModules.has(module.id);
    return `<details class="curriculum-module" data-curriculum-module="${escapeHtml(module.id)}" ${expanded ? "open" : ""}><summary><span><b>${escapeHtml(String(module.order).padStart(2, "0"))}</b><span><strong>${escapeHtml(module.title)}</strong><small>${escapeHtml(module.summary)}</small></span></span><em>${escapeHtml(module.chapters.length)} 章</em></summary><ol>${module.chapters.map((chapter) => {
      const active = chapter.id === state.curriculum.selectedChapterId;
      const chapterStatus = curriculumStatusDetails(chapter.status);
      const learning = learningChapterState(chapter.id);
      const learningStatus = learningStatusDetails(learning.status);
      return `<li><button class="curriculum-chapter-row${active ? " is-selected" : ""}" type="button" data-curriculum-chapter="${escapeHtml(chapter.id)}" ${active ? 'aria-current="step"' : ""}><span class="curriculum-order"><b>${escapeHtml(chapter.code)}</b><i aria-hidden="true"></i></span><span><strong>${escapeHtml(chapter.title)}</strong><small>${escapeHtml(curriculumKindLabel(chapter.kind))} / ${escapeHtml(chapterStatus.label)} / ${escapeHtml(learningStatus.label)} / ${escapeHtml(chapter.prerequisites.length)} 个先修</small></span></button></li>`;
    }).join("")}</ol></details>`;
  }).join("");
  el("curriculumDetail").innerHTML = curriculumDetailMarkup(selected);
  el("curriculumSourceList").innerHTML = (data.sources || []).map((source) => `<article class="curriculum-source"><div><strong>${escapeHtml(source.id)}</strong><span>${escapeHtml(source.use)}</span></div><dl><div><dt>仓库</dt><dd><a href="${escapeHtml(source.repository)}" target="_blank" rel="noreferrer">${escapeHtml(source.repository)}</a></dd></div><div><dt>Commit</dt><dd>${escapeHtml(source.commit)}</dd></div><div><dt>许可边界</dt><dd>${escapeHtml(source.license)}</dd></div><div><dt>正文导入</dt><dd>${source.content_imported ? "是" : "否"}</dd></div></dl></article>`).join("");
  el("curriculumWorkspace").hidden = false;
  el("curriculumProvenance").hidden = false;
  el("curriculumLoadState").hidden = true;
  el("curriculumError").hidden = true;
  el("curriculumTree").querySelectorAll("details[data-curriculum-module]").forEach((details) => details.addEventListener("toggle", () => {
    if (details.open) state.curriculum.expandedModules.add(details.dataset.curriculumModule);
    else state.curriculum.expandedModules.delete(details.dataset.curriculumModule);
  }));
  if (state.activeView !== "curriculum") return;
  const lessonPath = normalizeCourseLessonPath(state.curriculum.selectedLessonPath);
  if (lessonPath && state.curriculum.lessonCache.has(lessonPath)) void enhanceCurriculumLesson();
  else if (lessonPath && state.curriculum.lessonLoadingPath !== lessonPath && !state.curriculum.lessonError) void loadCurriculumLesson(lessonPath);
}

function enhanceCourseDiagnostics(body) {
  const domainLabels = {
    foundation: "数学与训练",
    model: "Transformer 与模型",
    research: "系统与研究",
  };
  body.querySelectorAll("form[data-diagnostic]").forEach((form, formIndex) => {
    form.querySelectorAll("button:not([data-diagnostic-score])").forEach((button) => button.remove());
    const checkboxes = [...form.querySelectorAll('input[type="checkbox"][data-diagnostic-domain]')];
    checkboxes.forEach((input, inputIndex) => {
      input.id ||= `courseDiagnostic-${formIndex + 1}-${inputIndex + 1}`;
      const label = input.closest("label");
      if (label) label.htmlFor = input.id;
    });
    const scoreButton = form.querySelector("[data-diagnostic-score]");
    const output = form.querySelector("[data-diagnostic-result]");
    if (!scoreButton || !output || !checkboxes.length) return;
    scoreButton.type = "button";
    output.id ||= `courseDiagnosticResult-${formIndex + 1}`;
    output.setAttribute("aria-live", "polite");
    scoreButton.setAttribute("aria-describedby", output.id);
    form.addEventListener("submit", (event) => event.preventDefault());
    scoreButton.addEventListener("click", () => {
      const scores = { foundation: 0, model: 0, research: 0 };
      checkboxes.forEach((input) => {
        const domain = input.dataset.diagnosticDomain;
        if (input.checked && Object.hasOwn(scores, domain)) scores[domain] += 1;
      });
      const total = Object.values(scores).reduce((sum, score) => sum + score, 0);
      let entry = "M4.0";
      if (total <= 6 || scores.foundation < 4) entry = "M1.1";
      else if (total <= 12 || scores.model < 4) entry = "M2.1";
      else if (total <= 15 || Object.values(scores).some((score) => score < 4)) entry = "M3.1";
      const breakdown = Object.entries(scores).map(([domain, score]) => `${domainLabels[domain]} ${score}/6`).join("；");
      output.textContent = `总分 ${total}/18；${breakdown}。建议从 ${entry} 开始；任何低于 4/6 的领域都应先回补。`;
    });
  });
}

async function enhanceCurriculumLesson() {
  const body = el("curriculumLessonBody");
  if (!body || body.dataset.enhanced === "true") return;
  body.dataset.enhanced = "true";
  const currentPath = body.dataset.courseSourcePath || state.curriculum.selectedLessonPath;
  body.querySelectorAll("a[href]").forEach((anchor) => {
    const rawHref = anchor.getAttribute("href") || "";
    if (/^https?:/i.test(rawHref)) {
      anchor.target = "_blank";
      anchor.rel = "noreferrer";
      return;
    }
    const resolved = resolveCourseRelativePath(currentPath, rawHref);
    if (!resolved) return;
    const lessonPath = normalizeCourseLessonPath(resolved);
    if (curriculumLessonLocation(lessonPath)) {
      anchor.dataset.courseLesson = lessonPath;
      anchor.href = curriculumLessonUrl(lessonPath);
      return;
    }
    const rawPath = rawHref.split(/[?#]/, 1)[0];
    const directory = /\/$/.test(rawPath) || !/\.[^/]+$/.test(resolved);
    anchor.href = courseRepositoryUrl(resolved, directory);
    anchor.target = "_blank";
    anchor.rel = "noreferrer";
  });
  body.querySelectorAll("img[src]").forEach((image) => {
    const resolved = resolveCourseRelativePath(currentPath, image.getAttribute("src") || "");
    if (resolved && /\.(?:gif|jpe?g|png|svg|webp)$/i.test(resolved)) image.src = courseContentAssetUrl(resolved);
  });
  body.querySelectorAll("source[srcset]").forEach((source) => {
    const candidates = (source.getAttribute("srcset") || "").split(",").map((candidate) => candidate.trim()).filter(Boolean);
    const rewritten = candidates.map((candidate) => {
      const [url, ...descriptor] = candidate.split(/\s+/);
      const resolved = resolveCourseRelativePath(currentPath, url);
      return resolved && /\.(?:gif|jpe?g|png|svg|webp)$/i.test(resolved)
        ? [courseContentAssetUrl(resolved), ...descriptor].join(" ")
        : candidate;
    });
    if (rewritten.length) source.srcset = rewritten.join(", ");
  });
  enhanceCourseDiagnostics(body);
  body.querySelectorAll("code.language-mermaid").forEach((code) => {
    const container = document.createElement("div");
    container.className = "mermaid";
    container.textContent = code.textContent;
    (code.closest("pre") || code).replaceWith(container);
  });
  const mermaidNodes = [...body.querySelectorAll(".mermaid")];
  const mermaidRuntime = mermaidNodes.length ? ensureCourseMermaidRuntime() : null;
  const mathRuntime = body.dataset.courseHasMath === "true" || body.querySelector(".arithmatex")
    ? ensureCourseMathRuntime()
    : null;
  if (mermaidRuntime) {
    try {
      await mermaidRuntime;
      if (!document.documentElement.dataset.mermaidReady) {
        globalThis.mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "neutral" });
        document.documentElement.dataset.mermaidReady = "true";
      }
      await globalThis.mermaid.run({ nodes: mermaidNodes });
    } catch (error) {
      console.warn("课程 Mermaid 图渲染失败", error);
    }
  }
  if (mathRuntime) {
    try {
      await mathRuntime;
      await globalThis.MathJax.typesetPromise([body]);
    } catch (error) {
      console.warn("课程公式渲染失败", error);
    }
  }
}

async function loadCurriculumLesson(path) {
  const normalized = normalizeCourseLessonPath(path);
  if (!normalized || state.curriculum.lessonLoadingPath === normalized) return;
  if (state.curriculum.lessonCache.has(normalized)) {
    state.curriculum.lessonError = "";
    renderCurriculum();
    return;
  }
  state.curriculum.lessonLoadingPath = normalized;
  state.curriculum.lessonError = "";
  renderCurriculum();
  try {
    const lesson = await api(`/api/curriculum/lesson?path=${encodeURIComponent(normalized)}`);
    state.curriculum.lessonCache.set(normalized, lesson);
  } catch (error) {
    if (state.curriculum.selectedLessonPath === normalized) state.curriculum.lessonError = error.message;
  } finally {
    if (state.curriculum.lessonLoadingPath === normalized) state.curriculum.lessonLoadingPath = "";
    if (state.curriculum.selectedLessonPath === normalized) renderCurriculum();
  }
}

async function loadCurriculum() {
  if (state.curriculum.loading) return;
  state.curriculum.loading = true;
  state.curriculum.error = "";
  el("curriculumLoadState").hidden = false;
  el("curriculumLoadState").textContent = "正在读取课程目录。";
  el("curriculumWorkspace").setAttribute("aria-busy", "true");
  try {
    const [data, learning] = await Promise.all([
      api("/api/curriculum"),
      api("/api/private/learning-progress").catch(() => null),
    ]);
    state.curriculum.data = data;
    state.curriculum.learning = learning;
    const requestedLesson = curriculumLessonLocation(state.curriculum.selectedLessonPath);
    if (requestedLesson) {
      state.curriculum.track = requestedLesson.track.id;
      state.curriculum.selectedChapterId = requestedLesson.chapter.id;
    }
    const requested = curriculumChapterLocation(state.curriculum.selectedChapterId);
    if (requested) state.curriculum.track = requested.track.id;
    const track = curriculumTrack();
    if (!state.curriculum.selectedChapterId) state.curriculum.selectedChapterId = track?.default_chapter_id || "";
    if (!state.curriculum.expandedModules.size) {
      for (const candidateTrack of data.tracks || []) {
        for (const module of candidateTrack.modules || []) state.curriculum.expandedModules.add(module.id);
      }
    }
    renderCurriculum();
    renderRadar();
    renderTerms();
    renderFrontierRadar();
  } catch (error) {
    state.curriculum.error = error.message;
    el("curriculumWorkspace").hidden = true;
    el("curriculumProvenance").hidden = true;
    el("curriculumLoadState").hidden = true;
    el("curriculumError").hidden = false;
    el("curriculumErrorMessage").textContent = error.message;
  } finally {
    state.curriculum.loading = false;
    el("curriculumWorkspace").removeAttribute("aria-busy");
  }
}

function selectCurriculumChapter(chapterId, { updateUrl = true, focus = true } = {}) {
  const location = curriculumChapterLocation(chapterId);
  if (!location) return;
  state.curriculum.track = location.track.id;
  state.curriculum.selectedChapterId = location.chapter.id;
  state.curriculum.selectedLessonPath = location.chapter.course_lessons?.[0]?.path || "";
  state.curriculum.lessonError = "";
  state.curriculum.expandedModules.add(location.module.id);
  renderCurriculum();
  if (!curriculumTreeWideQuery.matches) el("curriculumTreePanel").open = false;
  if (updateUrl) window.history.pushState({}, "", locationForView("curriculum"));
  if (focus) window.requestAnimationFrame(() => el("curriculumDetail").querySelector("h2")?.focus({ preventScroll: true }));
}

function selectCurriculumTrack(trackId) {
  const track = (state.curriculum.data?.tracks || []).find((item) => item.id === trackId);
  if (!track) return;
  state.curriculum.track = track.id;
  state.curriculum.selectedChapterId = track.default_chapter_id;
  const location = curriculumChapterLocation(track.default_chapter_id);
  state.curriculum.selectedLessonPath = location?.chapter.course_lessons?.[0]?.path || "";
  state.curriculum.lessonError = "";
  for (const module of track.modules || []) state.curriculum.expandedModules.add(module.id);
  renderCurriculum();
  window.history.pushState({}, "", locationForView("curriculum"));
}

function selectCurriculumLesson(path, { updateUrl = true, focus = true } = {}) {
  const normalized = normalizeCourseLessonPath(path);
  if (!normalized) return;
  const location = curriculumLessonLocation(normalized);
  if (location) {
    state.curriculum.track = location.track.id;
    state.curriculum.selectedChapterId = location.chapter.id;
    state.curriculum.expandedModules.add(location.module.id);
  } else {
    const trackId = normalized.split("/", 1)[0];
    if (["llm", "embodied"].includes(trackId)) state.curriculum.track = trackId;
  }
  state.curriculum.selectedLessonPath = normalized;
  state.curriculum.lessonError = "";
  renderCurriculum();
  if (updateUrl) window.history.pushState({}, "", curriculumLessonUrl(normalized));
  if (focus) window.requestAnimationFrame(() => el("curriculumLessonTitle")?.focus({ preventScroll: true }));
}

function openCurriculumFrontier(query) {
  const normalized = String(query || "").trim();
  state.frontier.query = normalized;
  showView("radar");
  window.history.replaceState({}, "", locationForView("radar"));
  void loadFrontierRadar();
  window.requestAnimationFrame(() => {
    const target = document.querySelector(".frontier-console") || el("frontierRankedList");
    target?.scrollIntoView({ behavior: globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  });
}

function statusDetails(status) {
  const details = {
    queued: { label: "等待分析", className: "is-primary" },
    running: { label: "正在分析", className: "is-primary" },
    paused: { label: "已暂停", className: "is-warning" },
    partial: { label: "部分完成", className: "is-warning" },
    failed: { label: "分析失败", className: "is-danger" },
    completed: { label: "已完成", className: "is-success" },
    cancelled: { label: "已取消", className: "" },
  };
  return details[status] || { label: status || "状态未知", className: "" };
}

function stageStatusLabel(status) {
  return {
    pending: "等待",
    running: "进行中",
    paused: "已暂停",
    completed: "已完成",
    failed: "失败",
    cancelled: "已取消",
  }[status] || status || "未知";
}

function sourceBasisLabel(value) {
  return {
    metadata: "仅元数据",
    abstract: "摘要材料",
    fulltext: "全文材料",
    supplementary: "补充材料",
    code: "代码材料",
    mixed: "混合材料",
  }[value] || "材料未标注";
}

function materialDetails(material) {
  if (!material) return { label: "材料记录缺失", className: "is-danger", meta: "Atlas 无法确认任务材料边界" };
  const labels = {
    unavailable: ["没有公开 PDF", "is-warning"],
    awaiting_authorization: ["等待材料授权", "is-warning"],
    authorized: [material.external_processing_authorized ? "已授权，等待 worker" : "允许本地解析", "is-primary"],
    downloading: ["正在下载公开 PDF", "is-primary"],
    downloaded: ["PDF 下载完成", "is-primary"],
    parsing: ["正在按页解析", "is-primary"],
    ready: [material.external_processing_authorized ? "全文材料就绪" : "本地解析完成，待外部授权", material.external_processing_authorized ? "is-success" : "is-warning"],
    failed: ["材料处理失败", "is-danger"],
  };
  const [label, className] = labels[material.status] || [material.status || "材料状态未知", ""];
  const facts = [
    material.download_authorized ? "本地下载已授权" : "本地下载未授权",
    material.external_processing_authorized ? "外部处理已授权" : "外部处理未授权",
    material.page_count ? `${material.page_count} 页` : "",
    material.source_sha256 ? `SHA ${material.source_sha256.slice(0, 12)}` : "",
  ].filter(Boolean);
  return { label, className, meta: facts.join(" / ") };
}

function materialAuthorizationAllowed(task) {
  return Boolean(
    task?.material?.source_url
    && !["completed", "cancelled"].includes(task.status)
    && !task.worker_lease?.claimed
  );
}

function sourceKindDetails(value) {
  return {
    paper_claim: { label: "论文主张", className: "is-paper" },
    platform_derivation: { label: "平台推导", className: "is-derivation" },
    editorial_judgment: { label: "编辑判断", className: "is-editorial" },
    insufficient_information: { label: "信息不足", className: "is-unknown" },
  }[value] || { label: "来源未标注", className: "is-unknown" };
}

function confidenceLabel(value) {
  return { high: "高置信", medium: "中置信", low: "低置信", unknown: "置信度未知" }[value] || "置信度未知";
}

function proseMarkup(value) {
  return escapeHtml(value || "").replaceAll("\n", "<br>");
}

function contextRowMarkup(item, type) {
  if (type === "paper") {
    const topics = (item.topics || []).slice(0, 4).map((topic) => `<span class="topic-tag">${escapeHtml(topic)}</span>`).join("");
    return `<button class="context-row" type="button" data-paper-id="${item.id}">
      <span><span class="row-topline"><span>${escapeHtml(displayDate(item.published))}</span><span>${escapeHtml(item.venue || "来源未标注")}</span><span>${escapeHtml(item.canonical_ref)}</span></span><h3>${escapeHtml(item.title || "标题待补充")}</h3><p>${escapeHtml((item.authors || []).slice(0, 4).join("、") || "作者信息待补充")}</p></span>
      <span class="topic-list">${topics}</span>
    </button>`;
  }
  const topics = (item.topics || []).slice(0, 4).map((topic) => `<span class="topic-tag">${escapeHtml(topic)}</span>`).join("");
  return `<button class="context-row" type="button" data-project-name="${escapeHtml(item.full_name)}">
    <span><span class="row-topline"><span>GitHub</span><span>${escapeHtml(item.language || "语言未标注")}</span><span>${escapeHtml(item.source_updated_at ? displayDate(item.source_updated_at) : "更新时间未知")}</span></span><h3>${escapeHtml(item.full_name)}</h3><p>${escapeHtml(item.description || "项目简介待补充")}</p></span>
    <span class="topic-list">${topics}</span>
  </button>`;
}

function filteredContexts() {
  const query = state.search.trim().toLowerCase();
  const remote = state.catalogSearch;
  if (query && remote?.query === state.search.trim()) {
    const papers = (remote.items || [])
      .filter((item) => item.kind === "paper")
      .map((item) => ({
        id: Number(item.ref),
        title: item.title,
        abstract: item.summary,
        authors: [],
        published: item.published,
        updated_at: item.sort_date,
        canonical_ref: item.canonical_ref,
        topics: item.domains || [],
        source_url: item.source_url,
        pdf_url: item.pdf_url,
        paperfield_id: item.paperfield_ref,
        status: item.status,
      }));
    const projects = (remote.items || [])
      .filter((item) => item.kind === "project")
      .map((item) => ({
        full_name: item.ref,
        description: item.summary,
        topics: item.domains || [],
        url: item.source_url,
        source_updated_at: item.published,
        updated_at: item.sort_date,
        status: item.status,
      }));
    return { papers, projects };
  }
  let papers = state.data?.papers || [];
  let projects = state.data?.projects || [];
  if (state.scope === "my-reading") {
    papers = papers.filter((paper) => learningRelevance(paper, "paper").length);
    projects = [];
  }
  if (query) {
    papers = papers.filter((paper) => `${paper.title} ${(paper.authors || []).join(" ")} ${(paper.topics || []).join(" ")}`.toLowerCase().includes(query));
    projects = projects.filter((project) => `${project.full_name} ${project.description} ${(project.topics || []).join(" ")}`.toLowerCase().includes(query));
  }
  return { papers, projects };
}

function filteredCandidates() {
  const query = state.search.trim().toLowerCase();
  let candidates = state.data?.frontier_candidates || [];
  if (state.scope === "my-reading") {
    candidates = candidates.filter((candidate) => learningRelevance(candidate, "candidate").length);
  }
  if (query) {
    candidates = candidates.filter((candidate) => {
      const paper = candidate.paper || {};
      return `${paper.title || ""} ${paper.abstract || ""} ${(paper.authors || []).join(" ")} ${(candidate.categories || []).join(" ")} ${(candidate.matched_queries || []).join(" ")}`.toLowerCase().includes(query);
    });
  }
  return candidates;
}

function candidateRowMarkup(candidate) {
  const paper = candidate.paper || {};
  const titleId = `candidate-${candidate.id}-title`;
  const paperfieldLink = paperfieldPaperUrl(paper);
  const domains = { embodied: "具身智能", llm: "大模型" };
  const tags = [
    ...(candidate.domains || []).map((domain) => domains[domain] || domain),
    ...(candidate.categories || []).slice(0, 3),
  ].map((item) => `<span class="topic-tag">${escapeHtml(item)}</span>`).join("");
  const queryLabels = (candidate.matched_queries || []).map((item) => escapeHtml(item)).join(" / ");
  const authors = (paper.authors || []).slice(0, 6).join("、") || "作者信息待补充";
  const basis = candidate.source_basis === "abstract" ? "公开摘要" : "仅元数据";
  const sourceLink = paper.source_url
    ? `<a class="text-action" href="${escapeHtml(paper.source_url)}" target="_blank" rel="noreferrer" aria-label="在新标签打开 arXiv 外部来源">外部来源 · arXiv</a>`
    : "";
  return `<article class="candidate-row" aria-labelledby="${titleId}">
    <div class="candidate-copy">
      <div class="row-topline"><span class="state-label is-warning">待研判</span><span>arXiv 公开源</span><span>${escapeHtml(basis)}</span><span>更新于 ${escapeHtml(displayDate(candidate.source_updated_at || candidate.published_at))}</span></div>
      <h3 id="${titleId}"><a class="paper-title-link" href="${escapeHtml(paperfieldLink)}">${escapeHtml(paper.title || "标题待补充")}</a></h3>
      <p class="candidate-authors">${escapeHtml(authors)}</p>
      <p class="candidate-abstract">${escapeHtml(textSnippet(paper.abstract || "来源未提供摘要"))}</p>
      <div class="topic-list">${tags}</div>
      ${learningRelevanceMarkup(candidate, "candidate")}
      <p class="candidate-provenance">命中：${queryLabels || "查询标签缺失"} / source SHA ${escapeHtml(String(candidate.payload_sha256 || "").slice(0, 12))}</p>
    </div>
    <div class="candidate-actions">
      <a class="button button-primary" href="${escapeHtml(paperfieldLink)}">在 Paperfield 精读</a>
      <button class="button button-secondary" type="button" data-paper-id="${escapeHtml(paper.id)}">查看 Atlas 档案</button>
      ${sourceLink}
    </div>
  </article>`;
}

function filteredUpdates() {
  const query = state.search.trim().toLowerCase();
  let updates = state.data?.frontier_updates || [];
  if (state.scope === "my-reading") {
    updates = updates.filter((item) => learningRelevance(item, "update").length);
  }
  if (query) {
    updates = updates.filter((item) => `${item.title || ""} ${item.summary || ""} ${item.source_label || ""} ${(item.matched_queries || []).join(" ")}`.toLowerCase().includes(query));
  }
  return updates;
}

function updateRowMarkup(update) {
  const titleId = `update-${update.id}-title`;
  const domains = { embodied: "具身智能", llm: "大模型" };
  const tags = (update.domains || []).map((domain) => `<span class="topic-tag">${escapeHtml(domains[domain] || domain)}</span>`).join("");
  const related = (update.related_paper_refs || []).slice(0, 2).map((reference) => `<a href="${escapeHtml(paperfieldReferenceUrl(reference))}">${escapeHtml(reference)}</a>`).join("、");
  return `<article class="update-row" aria-labelledby="${titleId}">
    <div class="update-copy">
      <div class="row-topline"><span class="state-label is-primary">第一方动态</span><span>${escapeHtml(update.source_label || "来源待补充")}</span><span>${escapeHtml(displayDate(update.source_updated_at || update.published_at))}</span></div>
      <h3 id="${titleId}">${escapeHtml(update.title || "标题待补充")}</h3>
      <p class="update-summary">${escapeHtml(textSnippet(update.summary || "订阅源未提供摘要", 520))}</p>
      <div class="topic-list">${tags}</div>
      ${learningRelevanceMarkup(update, "update")}
      ${related ? `<p class="update-related">明确关联论文：${related}</p>` : ""}
      <p class="candidate-provenance">命中：${escapeHtml((update.matched_queries || []).join(" / ") || "查询标签缺失")} / source SHA ${escapeHtml(String(update.payload_sha256 || "").slice(0, 12))}</p>
    </div>
    <div class="candidate-actions"><a class="button button-secondary" href="${escapeHtml(update.source_url)}" target="_blank" rel="noreferrer">打开官方原文</a></div>
  </article>`;
}

function filteredSignals() {
  const query = state.search.trim().toLowerCase();
  let signals = state.data?.signals || [];
  if (state.scope === "my-reading") {
    signals = signals.filter((signal) => learningRelevance(signal, "signal").length);
  }
  if (query) {
    signals = signals.filter((signal) => {
      const term = signal.source_term || {};
      const evidenceText = (signal.evidence || []).map((item) => `${item.context_text || ""} ${item.paper?.title || ""}`).join(" ");
      return `${signal.title || ""} ${signal.change_summary || ""} ${signal.why_it_matters || ""} ${term.display_term || ""} ${evidenceText}`.toLowerCase().includes(query);
    });
  }
  return signals;
}

function signalEvidenceMarkup(signal) {
  const evidence = (signal.evidence || []).map((item) => {
    const paper = item.paper || {};
    const reference = paper.canonical_ref || item.source_identifier || "";
    const paperLink = reference ? paperfieldReferenceUrl(reference) : "";
    const basis = item.source_basis === "public_abstract" ? "公开摘要" : item.source_basis === "metadata_context" ? "元数据语境" : sourceBasisLabel(item.source_basis);
    return `<li class="signal-evidence-item">
      <div class="signal-evidence-copy">
        <div class="row-topline"><span>${escapeHtml(signalEvidenceRoleLabels[item.evidence_role] || "论文证据")}</span><span>${escapeHtml(basis)}</span><span>${escapeHtml(displayDate(item.source_updated_at || item.published_at))}</span></div>
        <strong>${escapeHtml(paper.title || reference || "论文标题待补充")}</strong>
        <q>${escapeHtml(item.context_text || "来源语境待补充")}</q>
      </div>
      <div class="signal-evidence-actions">
        ${paper.id ? `<button class="button button-secondary" type="button" data-paper-id="${escapeHtml(paper.id)}">查看 Atlas 档案</button>` : ""}
        ${paperLink ? `<a class="button button-secondary" href="${escapeHtml(paperLink)}">在 Paperfield 精读</a>` : ""}
      </div>
    </li>`;
  }).join("");
  return evidence ? `<ul class="signal-evidence-list" aria-label="研究变化论文证据">${evidence}</ul>` : "";
}

function signalRowMarkup(signal) {
  const titleId = `signal-${signal.id}-title`;
  const status = signalStatusDetails(signal.status);
  const term = signal.source_term || {};
  const paperCount = signal.independent_paper_count || 0;
  const review = signal.editor_name ? `${signal.editor_name} / ${displayDate(signal.reviewed_at || signal.updated_at)}` : "审核者待补充";
  return `<article class="signal-row" id="signal-${escapeHtml(signal.id)}" aria-labelledby="${titleId}">
    <div class="row-topline"><span class="state-label ${status.className}">${escapeHtml(status.label)}</span><span>${escapeHtml(signalTypeLabels[signal.signal_type] || signal.signal_type || "变化")}</span><span>${escapeHtml(signalMaturityLabels[signal.maturity] || signal.maturity || "成熟度未知")}</span><span>${escapeHtml(signal.domain === "cross" ? "跨领域" : signal.domain === "embodied" ? "具身智能" : "大模型")}</span><span>截至 ${escapeHtml(displayDate(signal.as_of_date || signal.published_at))}</span></div>
    <h3 id="${titleId}" tabindex="-1">${escapeHtml(signal.title || "研究变化标题待补充")}</h3>
    <p class="signal-source-term">源自术语候选 <strong>${escapeHtml(term.display_term || "未标注")}</strong>，已核对 ${escapeHtml(paperCount)} 篇独立论文。</p>
    <div class="signal-argument-grid">
      <section><h4>发生了什么</h4><p>${proseMarkup(signal.change_summary || "变化说明待补充")}</p></section>
      <section><h4>为什么值得关注</h4><p>${proseMarkup(signal.why_it_matters || "编辑尚未补充关注理由")}</p></section>
    </div>
    <div class="signal-boundary-grid">
      <section><h4>未知项与边界</h4><p>${proseMarkup(signal.known_unknowns || "尚未记录")}</p></section>
      <section><h4>反证或相反证据</h4><p>${proseMarkup(signal.counter_evidence || "尚未检索到；仍需持续核查")}</p></section>
    </div>
    ${learningRelevanceMarkup(signal, "signal")}
    ${signalEvidenceMarkup(signal)}
    <footer class="signal-footer"><span>审核记录：${escapeHtml(review)} / 修订 ${escapeHtml(signal.revision || 1)}</span><button class="text-action" type="button" data-signal-retract-id="${escapeHtml(signal.id)}">撤回发布</button></footer>
  </article>`;
}

function filteredTerms() {
  const query = state.search.trim().toLowerCase();
  let terms = state.data?.terms || [];
  if (state.scope === "my-reading") {
    terms = terms.filter((term) => learningRelevance(term, "term").length);
  }
  if (query) {
    terms = terms.filter((term) => `${term.display_term || ""} ${term.canonical_expansion || ""} ${(term.evidence || []).map((item) => `${item.context_text || ""} ${item.paper?.title || ""}`).join(" ")}`.toLowerCase().includes(query));
  }
  return terms;
}

function termRowMarkup(term) {
  const titleId = `term-${term.id}-title`;
  const kindLabel = term.term_kind === "defined_acronym" ? "作者明示缩写" : "论文标题命名";
  const adoptionLabel = term.adoption_status === "cross_paper" ? "跨论文出现" : "单篇命名";
  const draft = (state.data?.signal_drafts || []).find((signal) => Number(signal.source_term_id) === Number(term.id));
  const published = (state.data?.signals || []).find((signal) => Number(signal.source_term_id) === Number(term.id));
  const termStatus = published
    ? { label: "已发布变化", className: "is-success" }
    : draft
      ? { label: "草稿待审核", className: "is-warning" }
      : { label: "待核查", className: "is-warning" };
  const draftAction = published
    ? `<button class="button button-secondary" type="button" data-signal-focus-id="${escapeHtml(published.id)}">查看已发布变化</button>`
    : draft
      ? `<button class="button button-secondary" type="button" data-signal-edit-id="${escapeHtml(draft.id)}">继续审核草稿</button>`
      : Number(term.independent_paper_count || 0) >= 2
        ? `<button class="button button-primary" type="button" data-term-id="${escapeHtml(term.id)}">起草研究变化</button>`
        : `<button class="button button-secondary" type="button" disabled title="至少需要两篇独立论文证据">证据不足（需 2 篇）</button>`;
  const evidence = (term.evidence || []).map((item) => {
    const paper = item.paper || {};
    const rule = item.extraction_rule === "explicit_acronym" ? "明确括号展开" : item.extraction_rule === "title_prefix" ? "标题主名称" : "标题命名";
    return `<button class="term-evidence" type="button" data-paper-id="${escapeHtml(paper.id)}">
      <span><strong>${escapeHtml(paper.title || "论文标题待补充")}</strong><small>${escapeHtml(displayDate(item.source_updated_at || item.published_at))} / ${escapeHtml(rule)}</small></span>
      <q>${escapeHtml(item.context_text || "来源语境待补充")}</q>
    </button>`;
  }).join("");
  return `<article class="term-row" aria-labelledby="${titleId}">
    <div class="row-topline"><span class="state-label ${termStatus.className}">${escapeHtml(termStatus.label)}</span><span>${escapeHtml(kindLabel)}</span><span>${escapeHtml(adoptionLabel)}</span><span>Atlas 首见 ${escapeHtml(displayDate(term.first_source_published_at))}</span></div>
    <h2 id="${titleId}"><button class="term-title-action" type="button" data-term-detail-id="${escapeHtml(term.id)}">${escapeHtml(term.display_term || "术语待补充")}</button></h2>
    ${term.canonical_expansion ? `<p class="term-expansion"><span>作者给出的展开</span><strong>${escapeHtml(term.canonical_expansion)}</strong></p>` : `<p class="term-expansion"><span>定义状态</span><strong>尚无作者明示的缩写展开</strong></p>`}
    <p class="term-status">关联 ${escapeHtml(term.independent_paper_count || 0)} 篇候选论文。此计数只表示 Atlas 语料中的独立出现，不证明该名称首次提出或已形成共识。</p>
    ${learningRelevanceMarkup(term, "term")}
    <div class="term-evidence-list" aria-label="${escapeHtml(term.display_term)} 的论文语境">${evidence}</div>
    <div class="term-actions"><span class="term-action-note">${draft ? `草稿修订 ${escapeHtml(draft.revision || 1)} / ${escapeHtml(draft.independent_paper_count || 0)} 篇独立论文` : published ? `发布于 ${escapeHtml(displayDate(published.published_at))}` : "证据只来自公开论文候选"}</span>${draftAction}</div>
  </article>`;
}

function filteredSignalDrafts() {
  const query = state.search.trim().toLowerCase();
  let drafts = state.data?.signal_drafts || [];
  if (state.scope === "my-reading") {
    drafts = drafts.filter((draft) => learningRelevance(draft, "signal").length);
  }
  if (query) {
    drafts = drafts.filter((draft) => {
      const term = draft.source_term || {};
      return `${draft.title || ""} ${draft.change_summary || ""} ${term.display_term || ""}`.toLowerCase().includes(query);
    });
  }
  return drafts;
}

function signalDraftRowMarkup(signal) {
  const term = signal.source_term || {};
  const status = signalStatusDetails(signal.status);
  return `<article class="signal-draft-row">
    <div><div class="row-topline"><span class="state-label ${status.className}">${escapeHtml(status.label)}</span><span>${escapeHtml(signalTypeLabels[signal.signal_type] || signal.signal_type || "变化")}</span><span>修订 ${escapeHtml(signal.revision || 1)}</span></div><h3>${escapeHtml(signal.title || "研究变化标题待补充")}</h3><p><strong>${escapeHtml(term.display_term || "术语待补充")}</strong> / ${escapeHtml(signal.independent_paper_count || 0)} 篇独立论文 / 最近更新 ${escapeHtml(displayDate(signal.updated_at))}</p></div>
    <button class="button button-secondary" type="button" data-signal-edit-id="${escapeHtml(signal.id)}">打开审核</button>
  </article>`;
}

function renderSourceNotice() {
  const source = state.data?.frontier_source || { status: "not_connected", candidate_count: 0 };
  const updates = state.data?.frontier_update_source || { status: "not_connected", candidate_count: 0 };
  const latest = source.latest_run;
  const latestUpdates = updates.latest_run;
  const notice = el("sourceNotice");
  const label = el("sourceNoticeLabel");
  const title = el("sourceNoticeTitle");
  const body = el("sourceNoticeBody");
  const action = el("sourceNoticeAction");
  notice.classList.remove("is-success", "is-primary", "is-danger");
  const hasCandidates = Number(source.candidate_count || 0) > 0;
  const hasUpdates = Number(updates.candidate_count || 0) > 0;
  action.dataset.sourceAction = hasCandidates ? "candidates" : hasUpdates ? "updates" : "library";
  action.textContent = hasCandidates ? "查看待研判论文" : hasUpdates ? "查看第一方动态" : "查看已接收内容";
  if (source.status === "connected" && updates.status === "connected") {
    notice.classList.add("is-success");
    label.className = "state-label is-success";
    label.textContent = "公开来源正常";
    title.textContent = "论文与第一方动态已更新";
    body.textContent = `论文扫描于 ${displayDate(latest?.finished_at)} 完成，当前 ${source.candidate_count || 0} 篇待研判；官方订阅源于 ${displayDate(latestUpdates?.finished_at)} 完成，当前 ${updates.candidate_count || 0} 条动态候选。两类内容均不会自动成为趋势结论。`;
    return;
  }
  if (source.status === "scanning" || updates.status === "scanning") {
    notice.classList.add("is-primary");
    label.className = "state-label is-primary";
    label.textContent = "公开来源扫描中";
    title.textContent = "正在获取论文元数据或第一方动态";
    body.textContent = "当前过程只读取公开 Atom/RSS，不下载 PDF，也不调用模型。";
    return;
  }
  if (source.status === "degraded" || updates.status === "degraded") {
    notice.classList.add("is-danger");
    label.className = "state-label is-danger";
    label.textContent = "来源部分可用";
    title.textContent = "最近一次公开来源扫描未完整完成";
    body.textContent = `${textSnippet(latest?.error_text || latestUpdates?.error_text || "部分上游来源未返回可用结果。", 320)}${hasCandidates || hasUpdates ? " 已入库候选仍保留，并继续标注原始来源时间。" : ""}`;
    return;
  }
  if (source.status === "connected" || updates.status === "connected") {
    notice.classList.add("is-primary");
    label.className = "state-label is-primary";
    label.textContent = "部分来源已接入";
    title.textContent = source.status === "connected" ? "论文候选已更新，第一方动态尚未扫描" : "第一方动态已更新，论文来源尚未扫描";
    body.textContent = "已接入内容保持候选状态；缺失来源不会由模型或推测补齐。";
    return;
  }
  label.className = "state-label is-warning";
  label.textContent = "来源未接入";
  title.textContent = "每日论文与第一方动态扫描尚未启动";
  body.textContent = "当前阶段只接收你从 Paperfield 主动发送的论文和项目，不生成前沿结论。";
}

function renderRadar() {
  const data = state.data;
  if (!data) return;
  const candidates = filteredCandidates();
  const updates = filteredUpdates();
  const signals = filteredSignals();
  renderSourceNotice();
  el("radarDate").textContent = `截至 ${displayDate(data.as_of_date)}`;
  el("signalCount").textContent = data.signals.length;
  el("candidateCount").textContent = data.stats.frontier_candidates || 0;
  el("updateCount").textContent = data.stats.frontier_updates || 0;
  el("termCandidateCount").textContent = data.stats.frontier_terms || 0;
  el("signalDraftCount").textContent = data.stats.frontier_signal_drafts || (data.signal_drafts || []).length;
  el("signalResultCount").textContent = state.search || state.scope === "my-reading"
    ? `${signals.length} 条（当前窗口）`
    : `${signals.length} 条`;
  el("signalList").innerHTML = signals.map(signalRowMarkup).join("");
  el("signalEmpty").hidden = signals.length > 0;
  el("signalEmpty").querySelector("strong").textContent = state.search ? "没有匹配的已发布研究变化" : state.scope === "my-reading" ? "当前阅读尚无已发布研究变化" : "尚无可发布的研究变化";
  const candidateTotal = Number(data.stats.frontier_candidates || 0);
  el("candidateResultCount").textContent = state.search || state.scope === "my-reading"
    ? `${candidates.length} 条（当前窗口）`
    : candidateTotal > candidates.length ? `最新 ${candidates.length} / 共 ${candidateTotal} 条` : `${candidateTotal} 条`;
  el("candidateList").innerHTML = candidates.map(candidateRowMarkup).join("");
  el("candidateEmpty").hidden = candidates.length > 0;
  el("candidateEmpty").querySelector("strong").textContent = state.scope === "my-reading"
    ? "没有与当前阅读或学习章节相关的来源候选"
    : state.search ? "没有匹配的来源候选" : "尚无来源候选";

  const updateTotal = Number(data.stats.frontier_updates || 0);
  el("updateResultCount").textContent = state.search || state.scope === "my-reading"
    ? `${updates.length} 条（当前窗口）`
    : updateTotal > updates.length ? `最新 ${updates.length} / 共 ${updateTotal} 条` : `${updateTotal} 条`;
  el("updateList").innerHTML = updates.map(updateRowMarkup).join("");
  el("updateEmpty").hidden = updates.length > 0;
  el("updateEmpty").querySelector("strong").textContent = state.scope === "my-reading"
    ? "没有与当前阅读明确关联的第一方动态"
    : state.search ? "没有匹配的第一方动态" : "尚无匹配的第一方动态";

  const contexts = filteredContexts();
  const recent = [
    ...contexts.papers.map((item) => ({ type: "paper", item, at: item.updated_at })),
    ...contexts.projects.map((item) => ({ type: "project", item, at: item.updated_at })),
  ].sort((left, right) => String(right.at).localeCompare(String(left.at))).slice(0, 6);
  el("recentContextList").innerHTML = recent.map(({ type, item }) => contextRowMarkup(item, type)).join("");
  el("contextEmpty").hidden = recent.length > 0;
  el("contextEmpty").querySelector("strong").textContent = state.scope === "my-reading" ? "没有与当前阅读或学习章节相关的上下文" : "还没有论文上下文";
  renderCompactTasks();
}

function renderTerms() {
  const terms = filteredTerms();
  el("termList").innerHTML = terms.map(termRowMarkup).join("");
  el("termEmpty").hidden = terms.length > 0;
  el("termEmpty").querySelector("strong").textContent = state.search
    ? "没有匹配的术语候选"
    : state.scope === "my-reading" ? "当前阅读尚无术语候选" : "尚无可追溯的术语候选";
  renderSignalDrafts();
}

function renderSignalDrafts() {
  const drafts = filteredSignalDrafts();
  el("signalDraftResultCount").textContent = `${drafts.length} 条`;
  el("signalDraftList").innerHTML = drafts.map(signalDraftRowMarkup).join("");
  el("signalDraftEmpty").hidden = drafts.length > 0;
  el("signalDraftEmpty").querySelector("strong").textContent = state.search ? "没有匹配的审核草稿" : "没有待审核草稿";
}

function taskActionsMarkup(task) {
  const actions = [];
  if (["queued", "running"].includes(task.status)) actions.push(["pause", "暂停", "button-secondary"]);
  if (task.status === "paused") actions.push(["resume", "恢复", "button-primary"]);
  if (["failed", "partial"].includes(task.status)) actions.push(["retry", "重试全部失败阶段", "button-primary"]);
  if (task.status === "cancelled") actions.push(["retry", "重新排队未完成阶段", "button-primary"]);
  if (["queued", "running", "paused", "partial", "failed"].includes(task.status)) actions.push(["cancel", "取消任务", "button-danger"]);
  return actions.map(([action, label, style]) => `<button class="button ${style}" type="button" data-task-action="${action}" data-task-id="${task.id}">${label}</button>`).join("");
}

function taskMarkup(task) {
  const status = statusDetails(task.status);
  const material = materialDetails(task.material);
  const materialAction = materialAuthorizationAllowed(task)
    ? `<button class="button button-secondary" type="button" data-material-authorize data-task-id="${escapeHtml(task.id)}">配置授权</button>`
    : "";
  const lease = task.worker_lease?.claimed
    ? ` / worker ${escapeHtml(task.worker_lease.worker_id || "已领取")} 至 ${escapeHtml(displayDate(task.worker_lease.expires_at))}`
    : "";
  const stages = (task.progress || []).map((stage) => `<div class="task-stage is-${escapeHtml(stage.status)}">
    <span class="task-stage-copy"><strong>${escapeHtml(stage.label)}</strong><small>${escapeHtml(stageStatusLabel(stage.status))} / attempt ${escapeHtml(stage.attempt || 1)}${stage.percent ? ` / ${escapeHtml(stage.percent)}%` : ""}</small>${stage.error_text ? `<em>${escapeHtml(stage.error_text)}</em>` : ""}</span>
    ${stage.status === "failed" ? `<button type="button" data-stage-retry data-task-id="${escapeHtml(task.id)}" data-stage-key="${escapeHtml(stage.key)}" aria-label="重试${escapeHtml(stage.label)}">重试</button>` : ""}
  </div>`).join("");
  return `<article class="task-row" data-task="${task.id}">
    <div class="task-head"><div><h2>${escapeHtml(task.paper?.title || "论文标题待补充")}</h2><p>task ${escapeHtml(shortId(task.id))} / ${escapeHtml(displayDate(task.created_at))}</p></div><span class="state-label ${status.className}">${status.label}</span></div>
    <div class="task-progress"><progress max="100" value="${escapeHtml(task.percent || 0)}" aria-label="分析任务总体进度">${escapeHtml(task.percent || 0)}%</progress><span>${escapeHtml(task.percent || 0)}%</span></div>
    <div class="task-material"><div class="task-material-copy"><strong><span class="state-label ${material.className}">${escapeHtml(material.label)}</span></strong><span>${escapeHtml(material.meta)}${lease}</span>${task.material?.error_text ? `<em>${escapeHtml(task.material.error_text)}</em>` : ""}</div>${materialAction}</div>
    <div class="task-stages" aria-label="分析阶段">${stages}</div>
    <div class="task-actions">${taskActionsMarkup(task)}<button class="button button-secondary" type="button" data-paper-id="${task.canonical_paper_id}">查看档案</button></div>
  </article>`;
}

function renderCompactTasks() {
  const tasks = (state.data?.analysis_requests || []).filter((task) => ["queued", "running", "paused", "partial"].includes(task.status));
  el("queueSummary").textContent = `${tasks.length} 个活动任务`;
  el("compactTaskList").innerHTML = tasks.slice(0, 4).map((task) => {
    const status = statusDetails(task.status);
    const material = materialDetails(task.material);
    return `<button class="compact-task" type="button" data-paper-id="${task.canonical_paper_id}"><strong>${escapeHtml(task.paper?.title || "论文标题待补充")}</strong><span>${escapeHtml(status.label)} / ${escapeHtml(material.label)} / task ${escapeHtml(shortId(task.id))}</span></button>`;
  }).join("");
  el("compactTaskEmpty").hidden = tasks.length > 0;
}

function renderTasks() {
  const tasks = state.data?.analysis_requests || [];
  el("taskList").innerHTML = tasks.map(taskMarkup).join("");
  el("taskEmpty").hidden = tasks.length > 0;
  renderAnalysisReadiness();
}

function renderAnalysisReadiness() {
  if (!state.data) return;
  const stats = state.data.stats || {};
  const tasks = state.data.analysis_requests || [];
  const total = Number(stats.tasks ?? tasks.length);
  const active = Number(stats.active_tasks ?? tasks.filter((task) => ["queued", "running", "paused", "partial"].includes(task.status)).length);
  const awaiting = Number(stats.awaiting_authorization ?? tasks.filter((task) => task.material?.status === "awaiting_authorization").length);
  const partial = Number(stats.partial_dossiers || 0);
  const completed = Number(stats.completed_dossiers || 0);
  const papers = Number(stats.papers || state.data.papers?.length || 0);
  const status = el("analysisWorkerState");
  let label = "尚未加入分析队列";
  let className = "is-warning";
  let message = `Atlas 中已有 ${papers} 篇论文，但没有任何论文被明确加入深度分析。论文导入不会自动调用模型；请先选择论文并确认分析范围与材料授权。`;

  if (total > 0 && awaiting > 0) {
    label = "等待逐篇授权";
    className = "is-warning";
    message = `${awaiting} 个任务仍在等待 PDF 下载或外部模型处理授权。打开对应任务的“配置授权”，确认后才会进入 worker。`;
  } else if (active > 0 && !state.config?.worker_configured) {
    label = "Worker 未配置";
    className = "is-danger";
    message = `已有 ${total} 个分析任务，但独立 worker 尚未配置，因此不会下载 PDF、调用模型或生成档案。普通 OPENAI_API_KEY 不会被自动复用。`;
  } else if (active > 0 && !state.config?.worker_connected) {
    label = "Worker 等待心跳";
    className = "is-warning";
    message = `已有 ${active} 个活动任务；worker 配置存在，但当前没有心跳。任务与授权会保留，worker 恢复后继续处理。`;
  } else if (active > 0) {
    label = "分析进行中";
    className = "is-primary";
    message = `${active} 个任务正在排队或分阶段处理。部分阶段完成后会先形成部分档案，全部阶段完成后升级为完整档案。`;
  } else if (partial > 0) {
    label = "存在部分档案";
    className = "is-warning";
    message = `${partial} 份档案已有可阅读阶段但尚未完整；失败或未覆盖阶段会在任务行和论文档案中分别标明。`;
  } else if (completed > 0) {
    label = "档案已生成";
    className = "is-success";
    message = `${completed} 份完整档案可读。每份档案保留材料哈希、模型、提示版本、证据定位和生成时间。`;
  }

  status.className = `state-label ${className}`;
  status.textContent = label;
  el("analysisWorkerMessage").textContent = message;
  el("analysisTaskTotal").textContent = total;
  el("analysisActiveTotal").textContent = active;
  el("analysisAwaitingTotal").textContent = awaiting;
  el("analysisPartialTotal").textContent = partial;
  el("analysisCompletedTotal").textContent = completed;
  el("taskEmptyMessage").textContent = total
    ? "当前筛选下没有任务。"
    : `论文库已有 ${papers} 篇论文，但 Atlas 不会未经选择批量生成档案。打开论文档案，点击“加入深度分析”并确认材料授权后才会创建任务。`;
  if (el("workerConfigDisclosure")) el("workerConfigDisclosure").open = active > 0 && !state.config?.worker_configured;
}

function renderLibrary() {
  const contexts = filteredContexts();
  const items = state.libraryKind === "papers" ? contexts.papers : contexts.projects;
  el("libraryList")?.setAttribute("aria-labelledby", state.libraryKind === "papers" ? "libraryPapersTab" : "libraryProjectsTab");
  el("libraryList").innerHTML = items.map((item) => contextRowMarkup(item, state.libraryKind === "papers" ? "paper" : "project")).join("");
  el("libraryEmpty").hidden = items.length > 0;
  el("libraryEmpty").querySelector("strong").textContent = state.search ? "没有匹配的已导入内容" : "尚未接收内容";
}

function renderCounts() {
  const data = state.data;
  if (!data) return;
  const stats = data.stats || {};
  // The radar view contains both published signals and source candidates. Show
  // the available radar queue in the rail; the fact strip still distinguishes
  // reviewed signals from unreviewed candidates.
  const radarQueueCount = Number(stats.frontier_candidates || 0) + Number(stats.frontier_updates || 0) + data.signals.length;
  el("navSignalCount").textContent = radarQueueCount;
  el("navThreadCount").textContent = state.researchThreads.loaded
    ? state.researchThreads.items.length
    : data.threads.length;
  el("navTermCount").textContent = data.terms.length;
  el("navLibraryCount").textContent = Number(stats.papers || 0) + Number(stats.projects || 0);
  el("navTaskCount").textContent = Number(stats.tasks || 0);
  if (el("navMethodCount")) el("navMethodCount").textContent = state.knowledge.method.length + state.knowledge.problem.length;
  if (el("navSavedCount")) el("navSavedCount").textContent = (data.saved_items || []).length;
  if (el("navEditorCount")) {
    const activeBatches = state.editor.batches.filter((batch) => ["queued", "previewing", "previewed", "running", "paused", "partial"].includes(batch.status)).length;
    el("navEditorCount").textContent = stats.editor_active_batches ?? activeBatches;
  }
  if (el("navNewsCount")) el("navNewsCount").textContent = state.news.stats?.unread ?? state.news.items.filter((item) => !item.read_at).length;
  el("signalDraftCount").textContent = stats.frontier_signal_drafts || (data.signal_drafts || []).length;
  el("libraryPaperCount").textContent = Number(stats.papers || 0);
  el("libraryProjectCount").textContent = Number(stats.projects || 0);
}

function renderAll() {
  renderCounts();
  renderRadar();
  renderTerms();
  renderLibrary();
  renderTasks();
  renderFrontierRadar();
  renderNews();
  renderKnowledgeViews();
  renderPublicThreads();
  renderLoop();
  if (state.curriculum.data) renderCurriculum();
}

function frontierDomainLabel(value) {
  return { embodied: "具身智能", llm: "大模型", cross: "跨领域" }[value] || value || "未分域";
}

function frontierSourceLabel(value) {
  return {
    arxiv: "论文候选",
    official_updates: "第一方动态",
    first_party: "第一方动态",
  }[value] || value || "来源未标注";
}

function frontierKindLabel(value) {
  return { signal: "已发布研究变化", candidate: "论文候选", update: "第一方动态" }[value] || value;
}

function frontierDate(item) {
  return item.as_of_date || item.source_updated_at || item.published_at || item.published || item.updated_at || "";
}

function frontierTitle(item, kind) {
  if (kind === "candidate") return item.paper?.title || item.title || item.source_identifier || "论文标题待补充";
  return item.title || item.paper?.title || item.source_identifier || "前沿条目待补充";
}

function frontierReference(item, kind) {
  if (kind === "candidate") return item.paper?.canonical_ref || item.canonical_ref || "";
  if (kind === "signal") return item.evidence?.[0]?.paper?.canonical_ref || "";
  return item.related_paper_refs?.[0] || "";
}

function frontierRankingMarkup(ranking) {
  const components = ranking?.components || {};
  return `<span class="ranking-score" title="${escapeHtml(ranking?.policy || "注意力排序，不是质量评分")}">${escapeHtml(ranking?.total ?? 0)} 分</span><span>新鲜度 ${escapeHtml(components.recency ?? 0)}</span><span>独立证据 ${escapeHtml(components.independent_evidence ?? 0)}</span><span>跨查询 ${escapeHtml(components.cross_query ?? 0)}</span>${components.review_maturity !== undefined ? `<span>审核成熟度 ${escapeHtml(components.review_maturity)}</span>` : ""}`;
}

function frontierItemMarkup(item, kind, index) {
  const reference = frontierReference(item, kind);
  const paperLink = kind === "candidate"
    ? paperfieldPaperUrl(item.paper || { canonical_ref: reference })
    : reference ? paperfieldReferenceUrl(reference) : "";
  const source = kind === "candidate" ? "arxiv" : kind === "update" ? (item.source_key || "official_updates") : "signal";
  const saveRef = item.id || item.source_identifier || reference;
  const saveKind = kind === "candidate" ? "paper" : kind === "update" ? "signal" : "signal";
  const sourceBasis = kind === "update" ? "第一方发现层，不替代论文证据" : kind === "candidate" ? (item.source_basis === "abstract" ? "公开摘要" : "仅元数据") : `${item.independent_paper_count || 0} 篇独立论文`;
  const summary = kind === "signal" ? item.change_summary || item.why_it_matters : kind === "candidate" ? item.paper?.abstract : item.summary;
  const detailAction = kind === "signal" && item.id
    ? `<button class="text-action" type="button" data-signal-focus-id="${escapeHtml(item.id)}">查看已发布变化</button>`
    : kind === "candidate" && item.paper?.id
      ? `<button class="text-action" type="button" data-paper-id="${escapeHtml(item.paper.id)}">打开 Atlas 档案</button>`
      : "";
  return `<article class="frontier-ranked-row" data-frontier-index="${index}">
    <div class="frontier-rank-column"><strong>${escapeHtml(index + 1).padStart ? escapeHtml(index + 1) : index + 1}</strong><span>优先级</span></div>
    <div class="frontier-ranked-copy">
      <div class="row-topline"><span class="state-label ${kind === "signal" ? "is-success" : kind === "candidate" ? "is-warning" : "is-primary"}">${escapeHtml(frontierKindLabel(kind))}</span><span>${escapeHtml(frontierDomainLabel(item.domain || item.domains?.[0]))}</span><span>${escapeHtml(frontierSourceLabel(item.source_name || item.source_key || source))}</span><span>${escapeHtml(displayDate(frontierDate(item)))}</span></div>
      <h3>${kind === "candidate" && paperLink ? `<a class="paper-title-link" href="${escapeHtml(paperLink)}">${escapeHtml(frontierTitle(item, kind))}</a>` : escapeHtml(frontierTitle(item, kind))}</h3>
      <p>${escapeHtml(textSnippet(summary || "来源未提供摘要或变化说明", 360))}</p>
      ${learningRelevanceMarkup(item, kind)}
      <div class="frontier-ranking-line">${frontierRankingMarkup(item.ranking)}</div>
      <small class="frontier-provenance">${escapeHtml(sourceBasis)}${item.payload_sha256 ? ` / source SHA ${escapeHtml(String(item.payload_sha256).slice(0, 16))}` : ""}</small>
    </div>
    <div class="frontier-ranked-actions">${paperLink ? `<a class="button button-primary" href="${escapeHtml(paperLink)}">在 Paperfield 精读</a>` : ""}${detailAction}<button class="button button-secondary" type="button" data-save-kind="${escapeHtml(saveKind)}" data-save-ref="${escapeHtml(saveRef)}" data-save-title="${escapeHtml(frontierTitle(item, kind))}">保存</button></div>
  </article>`;
}

function renderFrontierDiagnostics(data) {
  const target = el("frontierSourceDiagnostics");
  if (!target) return;
  const sources = data?.sources || {};
  const rows = Object.entries(sources).map(([key, value]) => {
    const latest = value?.latest_run || {};
    const status = value?.status || "not_connected";
    const cls = status === "connected" ? "is-success" : status === "degraded" ? "is-danger" : status === "scanning" ? "is-primary" : "is-warning";
    const counts = latest.id ? `${latest.fetched_count ?? 0} fetched / ${latest.accepted_count ?? 0} accepted / ${latest.new_count ?? 0} new` : "尚无运行记录";
    return `<div class="source-diagnostic"><span class="state-label ${cls}">${escapeHtml(status)}</span><strong>${escapeHtml(key === "papers" ? "论文源" : "动态源")}</strong><span>${escapeHtml(displayDate(latest.finished_at || latest.started_at))}</span><small>${escapeHtml(counts)}${latest.error_text ? ` / ${escapeHtml(textSnippet(latest.error_text, 120))}` : ""}</small></div>`;
  }).join("");
  target.innerHTML = rows || `<p class="term-action-note">尚未读取来源运行状态。</p>`;
}

function renderFrontierRadar() {
  const target = el("frontierRankedList");
  if (!target) return;
  const data = state.frontier.data;
  if (!data) {
    target.innerHTML = state.frontier.error ? `<p class="inline-error">${escapeHtml(state.frontier.error)}</p>` : "";
    el("frontierRankedEmpty").hidden = Boolean(state.frontier.error);
    return;
  }
  let combined = [
    ...(data.signals || []).map((item) => ({ item, kind: "signal" })),
    ...(data.candidates || []).map((item) => ({ item, kind: "candidate" })),
    ...(data.updates || []).map((item) => ({ item, kind: "update" })),
  ];
  if (state.scope === "my-reading") {
    combined = combined.filter(({ item, kind }) => learningRelevance(item, kind).length);
  }
  combined = combined.sort((left, right) => {
    const score = Number(right.item.ranking?.total || 0) - Number(left.item.ranking?.total || 0);
    return score || String(frontierDate(right.item)).localeCompare(String(frontierDate(left.item))) || String(frontierTitle(left.item, left.kind)).localeCompare(String(frontierTitle(right.item, right.kind)));
  }).slice(0, 18);
  target.innerHTML = combined.map(({ item, kind }, index) => frontierItemMarkup(item, kind, index)).join("");
  el("frontierRankedEmpty").hidden = combined.length > 0;
  el("frontierAsOf").textContent = data.as_of ? `冻结于 ${displayDate(data.as_of)}` : "已加载";
  renderFrontierDiagnostics(data);
}

function frontierQuery() {
  const filters = state.frontier.filters;
  const params = new URLSearchParams({ limit: "60" });
  if (state.frontier.query) params.set("q", state.frontier.query);
  if (filters.domain) params.set("domain", filters.domain);
  if (filters.source) params.set("source", filters.source);
  if (filters.maturity) params.set("maturity", filters.maturity);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  return params.toString();
}

async function loadFrontierRadar() {
  state.frontier.loading = true;
  try {
    state.frontier.data = await api(`/api/frontier/radar?${frontierQuery()}`);
    state.frontier.error = "";
  } catch (error) {
    state.frontier.data = null;
    state.frontier.error = error.message;
  } finally {
    state.frontier.loading = false;
    renderFrontierRadar();
  }
}

const newsTypeLabels = {
  code_release: "代码/架构发布",
  code_change: "代码变更",
  model_release: "模型发布",
  dataset_release: "数据集/基准",
  project_release: "项目发布",
  company: "公司/团队",
  funding: "融资",
  acquisition: "收购",
  research: "研究动态",
  policy: "政策与安全",
  event: "活动",
};
const newsImportanceLabels = { critical: "关键", major: "重要", notable: "值得关注", routine: "常规" };
const newsDomainLabels = { embodied: "具身智能", llm: "大模型", cross: "交叉" };
const newsSourceKindLabels = {
  official_lab: "官方实验室",
  research_org: "研究机构",
  company: "官方团队",
  github_release: "GitHub Release",
  github_commit: "GitHub Commit",
  newsroom: "媒体报道",
};

function newsDomainLabel(value) { return newsDomainLabels[value] || value || "未分域"; }
function newsTypeLabel(value) { return newsTypeLabels[value] || value || "研究动态"; }
function newsImportanceLabel(value) { return newsImportanceLabels[value] || value || "未标注"; }
function newsSourceKindLabel(value) { return newsSourceKindLabels[value] || value || "来源"; }
function newsContentStatusLabel(value) {
  return { cached: "正文已缓存", feed_only: "仅有摘要", unavailable: "正文暂不可用", failed: "抓取失败" }[value] || value || "内容状态未知";
}

function newsFilterQuery() {
  const filters = state.news.filters;
  const params = new URLSearchParams({ limit: "80" });
  Object.entries({ domain: filters.domain, topic: filters.topic, articleType: filters.articleType, source: filters.source, importance: filters.importance, from: filters.from, to: filters.to, q: filters.q }).forEach(([key, value]) => { if (value) params.set(key, value); });
  if (filters.unread) params.set("unread", "1");
  if (filters.saved) params.set("saved", "1");
  return params.toString();
}

function newsItemMarkup(item) {
  const selected = Number(item.id) === Number(state.news.selectedId);
  const domains = (item.domains || []).map(newsDomainLabel).join(" / ");
  const status = newsContentStatusLabel(item.content_status);
  return `<button class="news-row${selected ? " is-selected" : ""}${item.read_at ? " is-read" : ""}" type="button" data-news-id="${escapeHtml(item.id)}" aria-pressed="${String(selected)}">
    <span class="news-row-topline"><span class="state-label ${item.importance === "major" || item.importance === "critical" ? "is-warning" : "is-primary"}">${escapeHtml(newsImportanceLabel(item.importance))}</span><span>${escapeHtml(newsTypeLabel(item.article_type))}</span><span>${escapeHtml(domains)}</span><span>${escapeHtml(displayDate(item.published_at || item.updated_at))}</span></span>
    <strong>${escapeHtml(item.title || "未命名新闻")}</strong>
    <span class="news-row-summary">${escapeHtml(textSnippet(item.summary || item.dek || "来源未提供摘要", 220))}</span>
    <span class="news-row-meta"><span>${escapeHtml(item.source_label || item.source_key)}</span><span>${escapeHtml(newsSourceKindLabel(item.source_kind))}</span><span>${item.trust_tier === "first_party" ? "第一方" : "二手"}</span><span>${escapeHtml(status)}</span>${item.saved ? "<span>已保存</span>" : ""}</span>
  </button>`;
}

function renderNewsSourceOptions() {
  const select = el("newsSourceFilter");
  if (!select) return;
  const current = state.news.filters.source;
  select.innerHTML = `<option value="">全部来源</option>${state.news.sources.map((source) => `<option value="${escapeHtml(source.key)}" ${source.key === current ? "selected" : ""}>${escapeHtml(source.label)}${source.trust_tier === "secondary" ? " · 媒体" : ""}</option>`).join("")}`;
}

function renderNewsSourceHealth() {
  const target = el("newsSourceHealth");
  if (!target) return;
  target.innerHTML = state.news.sources.map((source) => {
    const connected = source.last_success_at && !source.last_error;
    const failed = Boolean(source.last_error);
    const cls = failed ? "is-danger" : connected ? "is-success" : "is-warning";
    const stateLabel = failed ? "失败" : connected ? "已更新" : "未运行";
    return `<span class="news-source-health-item"><span class="state-label ${cls}">${stateLabel}</span><strong>${escapeHtml(source.label)}</strong><small>${failed ? escapeHtml(textSnippet(source.last_error, 100)) : escapeHtml(displayDate(source.last_success_at || source.last_checked_at))}</small></span>`;
  }).join("") || `<p class="term-action-note">尚未配置新闻来源。</p>`;
}

function renderNewsReader() {
  const target = el("newsReader");
  if (!target) return;
  const item = state.news.selected;
  if (!item) {
    target.innerHTML = `<div class="empty-state is-compact"><strong>选择一条新闻</strong><p>${escapeHtml(state.news.error || "新闻正文会在站内加载；如果原文无法缓存，Atlas 会保留摘要并明确标注。")}</p></div>`;
    return;
  }
  const body = item.content_status === "cached" && item.body_html
    ? `<div class="news-reader-body">${item.body_html}</div>`
    : `<div class="news-reader-fallback"><span class="state-label is-warning">${escapeHtml(newsContentStatusLabel(item.content_status))}</span><p>${escapeHtml(item.summary || item.dek || "来源未提供可阅读摘要。")}</p>${item.content_status !== "unavailable" ? `<button class="button button-secondary" type="button" data-news-hydrate="${escapeHtml(item.id)}">重新加载正文</button>` : ""}</div>`;
  const papers = (item.related_paper_refs || []).map((ref) => `<a class="button button-secondary" href="${escapeHtml(paperfieldReferenceUrl(ref))}">精读 ${escapeHtml(ref)}</a>`).join("");
  target.innerHTML = `<header class="news-reader-header"><div><div class="row-topline"><span class="state-label ${item.importance === "major" || item.importance === "critical" ? "is-warning" : "is-primary"}">${escapeHtml(newsImportanceLabel(item.importance))}</span><span>${escapeHtml(newsTypeLabel(item.article_type))}</span><span>${escapeHtml((item.domains || []).map(newsDomainLabel).join(" / "))}</span></div><h2>${escapeHtml(item.title)}</h2><p>${escapeHtml(item.source_label || item.source_key)} · ${escapeHtml(newsSourceKindLabel(item.source_kind))} · ${item.trust_tier === "first_party" ? "第一方" : "二手来源"}${item.author ? ` · ${escapeHtml(item.author)}` : ""} · ${escapeHtml(displayDate(item.published_at || item.updated_at))}</p></div><div class="news-reader-actions"><button class="button button-secondary" type="button" data-news-save="${escapeHtml(item.id)}">${item.saved ? "取消保存" : "保存"}</button><button class="button button-secondary" type="button" data-news-read="${escapeHtml(item.id)}">${item.read_at ? "标为未读" : "标为已读"}</button></div></header>${body}<footer class="news-provenance"><div><strong>来源与缓存</strong><span>${escapeHtml(item.source_url)}</span><span>${escapeHtml(newsContentStatusLabel(item.content_status))} · 抓取于 ${escapeHtml(displayDate(item.fetched_at))}</span>${item.content_sha256 ? `<span>内容 SHA-256 ${escapeHtml(String(item.content_sha256).slice(0, 20))}</span>` : ""}${item.license_note ? `<span>${escapeHtml(item.license_note)}</span>` : ""}</div>${papers ? `<div class="news-related-links"><strong>相关论文</strong>${papers}</div>` : ""}<a class="text-action" href="${escapeHtml(item.source_url)}" target="_blank" rel="noreferrer">查看原文来源</a></footer>`;
}

function renderNews() {
  const target = el("newsList");
  if (!target) return;
  target.innerHTML = state.news.items.map(newsItemMarkup).join("");
  el("newsEmpty").hidden = state.news.items.length > 0;
  el("newsEmptyMessage").textContent = state.news.error || "点击“刷新新闻”读取启用的来源，或调整筛选。";
  el("newsResultCount").textContent = `${state.news.items.length} 条`;
  el("newsListSummary").textContent = state.news.stats ? `${state.news.stats.cached || 0} 条已有站内正文，来源状态见下方。` : "正在读取新闻源。";
  if (state.news.stats) {
    el("newsTotalCount").textContent = state.news.stats.total || 0;
    el("newsCachedCount").textContent = state.news.stats.cached || 0;
    el("newsUnreadCount").textContent = state.news.stats.unread || 0;
    el("newsSavedCount").textContent = state.news.stats.saved || 0;
    el("newsSourceCount").textContent = state.news.stats.enabled_sources || state.news.sources.length || 0;
  }
  const monitorTarget = el("newsMonitorStatus");
  if (monitorTarget) {
    const monitor = state.news.monitor;
    if (!monitor || !monitor.enabled) {
      monitorTarget.textContent = "官方源监控未启动；点击“刷新新闻”可立即读取。";
    } else if (monitor.running) {
      monitorTarget.textContent = `官方源监控正在读取；轮询间隔 ${Math.round(monitor.interval_seconds / 60)} 分钟。`;
    } else if (monitor.last_error) {
      monitorTarget.textContent = `官方源监控上次失败：${monitor.last_error}；仍会继续重试。`;
    } else {
      const count = (monitor.last_runs || []).filter((run) => run.status === "completed" || run.status === "not_modified").length;
      const priorityMinutes = Math.max(1, Math.round((monitor.priority_interval_seconds || monitor.interval_seconds) / 60));
      const fullMinutes = Math.max(priorityMinutes, Math.round(monitor.interval_seconds / 60));
      monitorTarget.textContent = `GitHub release/commit 每 ${priorityMinutes} 分钟检查；其余官方源每 ${fullMinutes} 分钟检查，最近完成 ${count} 个来源。`;
    }
  }
  renderNewsSourceOptions();
  renderNewsSourceHealth();
  renderNewsReader();
}

async function loadNews({ keepSelection = true } = {}) {
  if (state.news.loading) return;
  state.news.loading = true;
  try {
    const [result, sources, monitor] = await Promise.all([api(`/api/news?${newsFilterQuery()}`), api("/api/news/sources"), api("/api/news/monitor")]);
    state.news.items = Array.isArray(result.items) ? result.items : [];
    state.news.stats = result.stats || null;
    state.news.sources = Array.isArray(sources.items) ? sources.items : [];
    state.news.monitor = monitor || null;
    state.news.runs = [];
    state.news.error = "";
    if (!keepSelection || !state.news.items.some((item) => Number(item.id) === Number(state.news.selectedId))) state.news.selectedId = state.activeView === "news" ? (state.news.items[0]?.id || 0) : 0;
    if (state.news.selectedId && state.activeView === "news") {
      try { state.news.selected = await api(`/api/news/${encodeURIComponent(state.news.selectedId)}?hydrate=1`); } catch (error) { state.news.selected = null; state.news.error = error.message; }
    } else state.news.selected = null;
    el("newsAsOf").textContent = `最近一次读取 ${new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date())}`;
    el("newsStatus").className = "state-label is-success";
    el("newsStatus").textContent = "已读取";
  } catch (error) {
    state.news.error = error.message;
    el("newsStatus").className = "state-label is-danger";
    el("newsStatus").textContent = "读取失败";
  } finally {
    state.news.loading = false;
    renderNews();
    renderCounts();
  }
}

async function openNewsItem(id) {
  state.news.selectedId = Number(id);
  renderNews();
  try {
    state.news.selected = await api(`/api/news/${encodeURIComponent(id)}?hydrate=1`);
    await api(`/api/news/${encodeURIComponent(id)}/read`, { method: "POST", body: JSON.stringify({ read: true }) });
    const row = state.news.items.find((item) => Number(item.id) === Number(id));
    if (row) row.read_at = new Date().toISOString();
    state.news.stats = await api("/api/news/stats");
  } catch (error) {
    state.news.error = error.message;
  }
  renderNews();
}

async function toggleNewsSaved(id) {
  const row = state.news.items.find((item) => Number(item.id) === Number(id));
  const saved = !(row?.saved || state.news.selected?.saved);
  try {
    const result = await api(`/api/news/${encodeURIComponent(id)}/save`, { method: "POST", body: JSON.stringify({ saved }) });
    state.news.selected = Number(state.news.selectedId) === Number(id) ? result : state.news.selected;
    if (row) row.saved = saved;
    state.news.stats = await api("/api/news/stats");
    toast(saved ? "已保存新闻" : "已取消保存");
  } catch (error) { toast(error.message, true); }
  renderNews();
}

async function toggleNewsRead(id) {
  const row = state.news.items.find((item) => Number(item.id) === Number(id));
  const read = !row?.read_at;
  try {
    const result = await api(`/api/news/${encodeURIComponent(id)}/read`, { method: "POST", body: JSON.stringify({ read }) });
    state.news.selected = Number(state.news.selectedId) === Number(id) ? { ...state.news.selected, ...result } : state.news.selected;
    if (row) row.read_at = read ? new Date().toISOString() : null;
    state.news.stats = await api("/api/news/stats");
  } catch (error) { toast(error.message, true); }
  renderNews();
}

async function refreshNews() {
  const button = el("newsRefresh");
  button.disabled = true;
  el("newsStatus").className = "state-label is-primary";
  el("newsStatus").textContent = "刷新中";
  try {
    await api("/api/news/refresh", { method: "POST", body: JSON.stringify({ limitPerSource: 20 }) });
    await loadNews({ keepSelection: false });
    toast("新闻源刷新完成");
  } catch (error) {
    state.news.error = error.message;
    el("newsStatus").className = "state-label is-danger";
    el("newsStatus").textContent = "刷新失败";
    renderNews();
    toast(error.message, true);
  } finally { button.disabled = false; }
}

const knowledgeKindLabels = { method: "方法", problem: "问题", thread: "研究线程", term: "术语", paper: "论文", project: "项目" };

function knowledgeEntityRowMarkup(entity) {
  const selected = String(entity.id) === String(state.knowledge.selectedId);
  const aliases = (entity.aliases || []).slice(0, 3).map((alias) => alias.alias).filter(Boolean).join(" / ");
  return `<button class="knowledge-row${selected ? " is-selected" : ""}" type="button" data-knowledge-id="${escapeHtml(entity.id)}" data-knowledge-kind="${escapeHtml(entity.entity_kind)}" aria-pressed="${String(selected)}"><span class="knowledge-row-head"><strong>${escapeHtml(entity.canonical_name || "未命名实体")}</strong><span class="state-label is-success">已审核</span></span><span class="knowledge-row-meta"><span>${escapeHtml(knowledgeKindLabels[entity.entity_kind] || entity.entity_kind)}</span><span>${escapeHtml(entity.relationship_count || 0)} 条关系</span><span>${escapeHtml(displayDate(entity.updated_at))}</span></span>${aliases ? `<small>${escapeHtml(aliases)}</small>` : ""}</button>`;
}

function knowledgeDetailMarkup(detail) {
  if (!detail) return `<div class="empty-state is-compact"><strong>尚未选择节点</strong><p>从左侧列表选择一个已审核节点。</p></div>`;
  const incoming = detail.incoming || [];
  const outgoing = detail.outgoing || [];
  const aliases = detail.aliases || [];
  const graph = detail.graph || {};
  const relationMarkup = (relations, direction) => relations.length
    ? `<ul class="relation-list">${relations.map((relation) => {
      const other = direction === "incoming" ? relation.from_entity : relation.to_entity;
      const otherId = direction === "incoming" ? relation.from_entity_id : relation.to_entity_id;
      return `<li><button class="knowledge-link" type="button" data-knowledge-id="${escapeHtml(otherId)}" data-knowledge-kind="${escapeHtml(other?.entity_kind || "")}">${escapeHtml(other?.canonical_name || otherId)}</button><span>${escapeHtml(relation.relation_type || "related_to")}</span>${relation.evidence?.[0]?.quote ? `<q>${escapeHtml(textSnippet(relation.evidence[0].quote, 180))}</q>` : ""}</li>`;
    }).join("")}</ul>`
    : `<p class="term-action-note">没有${direction === "incoming" ? "入边" : "出边"}。</p>`;
  const paperLink = detail.paperfield_ref ? paperfieldReferenceUrl(detail.paperfield_ref) : "";
  return `<div class="knowledge-detail-inner"><div class="knowledge-detail-header"><div><span class="state-label is-success">${escapeHtml(knowledgeKindLabels[detail.entity_kind] || detail.entity_kind)} / 已审核</span><h2>${escapeHtml(detail.canonical_name || "未命名实体")}</h2><p>${escapeHtml(detail.id)}</p></div><button class="button button-secondary" type="button" data-save-kind="${escapeHtml(detail.entity_kind)}" data-save-ref="${escapeHtml(detail.id)}" data-save-title="${escapeHtml(detail.canonical_name || "未命名实体")}">保存</button></div><section class="knowledge-detail-section"><h3>定义与限制</h3><p>${proseMarkup(detail.description || "尚未补充定义。")}</p><ul class="limitation-list">${(detail.limitations || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section><section class="knowledge-detail-section"><h3>别名</h3>${aliases.length ? `<ul class="alias-inline-list">${aliases.map((alias) => `<li>${escapeHtml(alias.alias)}</li>`).join("")}</ul>` : `<p class="term-action-note">尚无别名。</p>`}</section><section class="knowledge-detail-section"><h3>入边</h3>${relationMarkup(incoming, "incoming")}</section><section class="knowledge-detail-section"><h3>出边</h3>${relationMarkup(outgoing, "outgoing")}</section><section class="knowledge-detail-section"><h3>关系时间线</h3>${detail.timeline?.length ? `<ol class="knowledge-timeline">${detail.timeline.map((item) => `<li><span>${escapeHtml(displayDate(item.source_date || item.updated_at))}</span><strong>${escapeHtml(item.relation_type)}</strong>${item.contradictory ? `<em>限定/反证</em>` : ""}</li>`).join("")}</ol>` : `<p class="term-action-note">尚无可排序的关系证据。</p>`}</section><div class="knowledge-graph-fact"><span>图遍历深度 ${escapeHtml(graph.depth ?? 0)}</span><span>${escapeHtml(graph.nodes?.length || 1)} 个节点</span><span>${escapeHtml(graph.relationships?.length || 0)} 条边</span><span>循环安全 ${graph.cycle_safe ? "是" : "未知"}</span></div>${paperLink ? `<a class="button button-secondary" href="${escapeHtml(paperLink)}">回到 Paperfield</a>` : ""}</div>`;
}

function renderKnowledgeViews() {
  const methodKind = state.knowledge.selectedKind === "problem" ? "problem" : "method";
  el("knowledgePanel")?.setAttribute("aria-labelledby", methodKind === "problem" ? "knowledgeProblemTab" : "knowledgeMethodTab");
  const methodList = el("methodList");
  if (methodList) {
    const query = (el("methodQuery")?.value || "").trim().toLowerCase();
    const items = (state.knowledge[methodKind] || []).filter((item) => !query || `${item.canonical_name} ${(item.aliases || []).map((a) => a.alias).join(" ")}`.toLowerCase().includes(query));
    methodList.innerHTML = items.map(knowledgeEntityRowMarkup).join("");
    el("methodEmpty").hidden = items.length > 0;
    const methodError = state.knowledge.errors[methodKind];
    el("methodEmpty").querySelector("strong").textContent = items.length ? "" : methodError ? "知识节点读取失败" : query ? "没有匹配的知识节点" : `${knowledgeKindLabels[methodKind]}谱系尚未建立`;
    el("methodEmpty").querySelector("p").textContent = methodError
      ? `${methodError}。这不是“0 个已审核节点”的结论，请稍后重新加载。`
      : "完成首批论文档案并通过审核后，方法和问题节点会在这里形成。候选论文不会在未经核查时被自动归纳成理论结论。";
    el("methodCount").textContent = state.knowledge.method.length;
    el("problemCount").textContent = state.knowledge.problem.length;
    el("methodDetail").innerHTML = state.knowledge.selected && ["method", "problem"].includes(state.knowledge.selected.entity_kind)
      ? knowledgeDetailMarkup(state.knowledge.selected)
      : `<div class="empty-state is-compact"><strong>选择一个知识节点</strong><p>查看定义、限制、关系图和论文回链。</p></div>`;
  }
}

async function loadKnowledgeViews() {
  if (state.knowledge.loading) return;
  state.knowledge.loading = true;
  state.knowledge.errors = {};
  const requests = ["method", "problem", "thread"].map(async (kind) => {
    try {
      const result = await api(`/api/knowledge?kind=${encodeURIComponent(kind)}&limit=200`);
      state.knowledge[kind] = Array.isArray(result.items) ? result.items : [];
    } catch (error) {
      state.knowledge.errors[kind] = error.message;
    }
  });
  try {
    await Promise.all(requests);
    state.knowledge.loaded = true;
    renderKnowledgeViews();
    renderCounts();
  } finally {
    state.knowledge.loading = false;
  }
}

const threadClaimRoleLabels = {
  definition: "定义",
  foundation: "基础主张",
  representative: "代表主张",
  benchmark: "评测证据",
  replication: "复现",
  counter_evidence: "反证",
  latest_progress: "近期进展",
};

const threadRelationLabels = {
  supports: "支持",
  extends: "扩展",
  narrows: "限定",
  reproduces: "复现",
  contradicts: "反证",
  unclear: "关系待澄清",
};

function paperfieldPathUrl(path) {
  if (!path) return "";
  try {
    return new URL(path, state.config?.paperfield_base_url || window.location.origin).href;
  } catch {
    return "";
  }
}

function threadSearchText(thread) {
  return [
    thread.title,
    thread.problem_statement,
    thread.change_summary,
    ...(thread.competing_routes || []),
    ...(thread.counter_evidence || []),
    ...(thread.known_unknowns || []),
    ...(thread.claims || []).flatMap((item) => [
      item.claim?.title,
      item.claim?.statement,
      item.claim?.paper?.title,
      item.claim?.paper?.canonical_ref,
    ]),
  ].filter(Boolean).join(" ").toLowerCase();
}

function publicThreadRowMarkup(thread) {
  const selected = String(thread.id) === String(state.researchThreads.selectedId);
  return `<button class="thread-row${selected ? " is-selected" : ""}" type="button" data-public-thread-ref="${escapeHtml(thread.slug || thread.id)}" aria-pressed="${String(selected)}"><span class="thread-row-top"><span class="state-label is-success">已发布 r${escapeHtml(thread.revision)}</span><span>${escapeHtml(displayDate(thread.published_at))}</span></span><strong>${escapeHtml(thread.title || "未命名研究线程")}</strong><span class="thread-row-problem">${escapeHtml(textSnippet(thread.problem_statement, 180))}</span><span class="thread-row-facts"><span>${escapeHtml(thread.claims?.length || 0)} 条主张</span><span>${escapeHtml(thread.relations?.length || 0)} 条关系</span><span>${escapeHtml(thread.representative_papers?.length || 0)} 篇代表论文</span></span></button>`;
}

function threadTextList(items, emptyText) {
  return items?.length
    ? `<ul class="thread-text-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : `<p class="thread-empty-line">${escapeHtml(emptyText)}</p>`;
}

function threadEvidenceMarkup(evidence, paper) {
  const locator = evidence.source_locator || {};
  const facts = [
    locator.page ? `p.${locator.page}` : "",
    locator.section,
    locator.figure,
    locator.table,
  ].filter(Boolean);
  const href = paperfieldPathUrl(evidence.paperfield_path || paper.paperfield_path);
  return `<li class="thread-evidence"><div><span>${escapeHtml(evidence.direction === "contradicts" ? "反证" : evidence.direction === "qualifies" ? "限定" : "支持")}</span><strong>${escapeHtml(facts.join(" / ") || "精确定位")}</strong>${locator.quote ? `<q>${escapeHtml(locator.quote)}</q>` : ""}<small>source SHA-256 ${escapeHtml(String(locator.content_sha256 || "").slice(0, 20))}</small></div>${href ? `<a class="button button-secondary" href="${escapeHtml(href)}">在 Paperfield 定位</a>` : ""}</li>`;
}

function threadClaimMarkup(item) {
  const claim = item.claim || {};
  const paper = claim.paper || {};
  const paperHref = paperfieldPathUrl(paper.paperfield_path);
  return `<article class="thread-claim" id="claim-${escapeHtml(claim.id || item.position)}"><header><div><span class="state-label ${item.role === "counter_evidence" ? "is-danger" : "is-primary"}">${escapeHtml(threadClaimRoleLabels[item.role] || item.role || "主张")}</span><h3>${escapeHtml(claim.title || paper.title || `主张 ${item.position}`)}</h3></div><span class="claim-id">${escapeHtml(shortId(claim.id))}</span></header><p class="thread-claim-statement">${proseMarkup(claim.statement || "主张正文未记录。")}</p><div class="thread-paper-line"><div><strong>${escapeHtml(paper.title || "论文标题未记录")}</strong><span>${escapeHtml([paper.canonical_ref, paper.published].filter(Boolean).join(" / "))}</span></div>${paperHref ? `<a href="${escapeHtml(paperHref)}">打开论文</a>` : ""}</div><ul class="thread-evidence-list">${(claim.evidence || []).map((evidence) => threadEvidenceMarkup(evidence, paper)).join("")}</ul><small class="thread-source-hash">主张来源 SHA-256 ${escapeHtml(claim.source_sha256 || "未记录")}</small></article>`;
}

function publicThreadDetailMarkup(thread) {
  if (!thread) return `<div class="empty-state is-compact"><strong>选择一个已发布线程</strong><p>查看研究问题、变化、路线分歧和逐条论文证据。</p></div>`;
  const claimTitles = new Map((thread.claims || []).map((item) => [item.claim?.id, item.claim?.title || item.claim?.paper?.title || shortId(item.claim?.id)]));
  const relations = (thread.relations || []).map((relation) => `<li><span>${escapeHtml(claimTitles.get(relation.left_claim_id) || shortId(relation.left_claim_id))}</span><strong>${escapeHtml(threadRelationLabels[relation.relation_type] || relation.relation_type)}</strong><span>${escapeHtml(claimTitles.get(relation.right_claim_id) || shortId(relation.right_claim_id))}</span></li>`).join("");
  return `<div class="thread-detail-inner"><header class="thread-detail-header"><div><div class="row-topline"><span class="state-label is-success">已发布 revision ${escapeHtml(thread.revision)}</span><span>${escapeHtml(displayDate(thread.published_at))}</span></div><h2>${escapeHtml(thread.title)}</h2><p>${escapeHtml(thread.problem_statement)}</p></div><div class="thread-detail-actions"><button class="button button-secondary" type="button" data-save-kind="thread" data-save-ref="${escapeHtml(thread.id)}" data-save-title="${escapeHtml(thread.title)}">保存线程</button><button class="button button-primary" type="button" data-thread-flowloom="${escapeHtml(thread.slug || thread.id)}">送到 Flowloom</button></div></header><section class="thread-synthesis"><div><h3>发生了什么变化</h3><p>${proseMarkup(thread.change_summary)}</p></div><div><h3>为什么值得关注</h3><p>${proseMarkup(thread.why_it_matters)}</p></div></section><section class="thread-route-grid"><div><h3>竞争路线</h3>${threadTextList(thread.competing_routes, "尚未记录明确的竞争路线。")}</div><div><h3>反证与限定</h3>${threadTextList(thread.counter_evidence, "当前发布修订未记录反证，不代表不存在反证。")}</div><div><h3>已知未知项</h3>${threadTextList(thread.known_unknowns, "尚未记录开放问题。")}</div></section><section class="thread-relation-section"><div class="section-heading is-tight"><div><h3>人工审核关系</h3><p>方向仅来自当前已发布修订，不展示候选相似度分数。</p></div><span class="section-count">${escapeHtml(thread.relations?.length || 0)} 条</span></div>${relations ? `<ul class="thread-relation-list">${relations}</ul>` : `<p class="thread-empty-line">当前线程只有一条主张，尚无跨主张关系。</p>`}</section><section class="thread-claims-section"><div class="section-heading"><div><h3>论文主张与原文证据</h3><p>每条证据都可回到 Paperfield 的具体页码、章节、图表或引文。</p></div><span class="section-count">${escapeHtml(thread.claims?.length || 0)} 条</span></div>${(thread.claims || []).map(threadClaimMarkup).join("")}</section><footer class="thread-integrity"><span>thread SHA-256</span><code>${escapeHtml(thread.content_sha256)}</code><span>关系只含人工审核项</span><strong>${thread.evidence_boundary?.priority_or_consensus_claimed === false ? "不宣称优先权或共识" : "边界未记录"}</strong></footer></div>`;
}

function renderPublicThreads() {
  if (!el("threadList")) return;
  const query = (el("threadQuery")?.value || "").trim().toLowerCase();
  const items = state.researchThreads.items.filter((item) => !query || threadSearchText(item).includes(query));
  el("threadList").innerHTML = items.map(publicThreadRowMarkup).join("");
  el("threadPublicCount").textContent = `${items.length} 条`;
  el("threadIndexSummary").textContent = state.researchThreads.loading
    ? "正在读取公共投影。"
    : state.researchThreads.error
      ? "公共线程读取失败。"
      : `共 ${state.researchThreads.items.length} 条已发布线程；筛选不会改变证据边界。`;
  el("threadEmpty").hidden = items.length > 0;
  const emptyTitle = el("threadEmpty").querySelector("strong");
  const emptyBody = el("threadEmpty").querySelector("p");
  if (!items.length && state.researchThreads.error) {
    emptyTitle.textContent = "研究线程读取失败";
    emptyBody.textContent = `${state.researchThreads.error}。这不是“当前没有研究线程”的科学结论。`;
  } else if (!items.length && query) {
    emptyTitle.textContent = "没有匹配的已发布线程";
    emptyBody.textContent = "调整标题、问题、主张或论文关键词；未发布候选不会出现在搜索结果中。";
  } else if (!items.length) {
    emptyTitle.textContent = "研究线程尚未发布";
    emptyBody.textContent = "先在 Paperfield 精读并生成深度档案，再由编辑流程导入主张、审核关系并发布不可变修订。Atlas 不会用候选论文自动拼出结论。";
  }
  el("threadDetail").innerHTML = publicThreadDetailMarkup(state.researchThreads.selected);
}

async function openPublicThread(reference, { updateUrl = true } = {}) {
  try {
    const thread = await api(`/api/threads/${encodeURIComponent(reference)}`);
    state.researchThreads.selectedId = thread.id;
    state.researchThreads.selected = thread;
    renderPublicThreads();
    if (updateUrl) window.history.pushState({}, "", locationForView("threads", thread));
  } catch (error) {
    toast(error.message, true);
  }
}

async function loadPublicThreads() {
  if (state.researchThreads.loading) return;
  state.researchThreads.loading = true;
  state.researchThreads.error = "";
  renderPublicThreads();
  try {
    const result = await api("/api/threads?limit=200");
    state.researchThreads.items = Array.isArray(result.items) ? result.items : [];
    state.researchThreads.loaded = true;
    const requested = new URLSearchParams(window.location.search).get("thread");
    const selectedRef = requested
      || state.researchThreads.items.find((item) => item.id === state.researchThreads.selectedId)?.slug
      || state.researchThreads.items[0]?.slug;
    if (selectedRef) await openPublicThread(selectedRef, { updateUrl: false });
    else state.researchThreads.selected = null;
  } catch (error) {
    state.researchThreads.error = error.message;
    state.researchThreads.items = [];
    state.researchThreads.selected = null;
  } finally {
    state.researchThreads.loading = false;
    renderPublicThreads();
    renderCounts();
  }
}

function bridgeIdentifier(prefix) {
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${id}`;
}

function isLocalFlowloomTarget(url) {
  return url.origin === window.location.origin || ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
}

async function sendPaperContextToFlowloom(paper, trigger = null) {
  if (!paper?.id) return;
  const confirmed = window.confirm(
    `Confirm sending the source-bounded dossier for "${paper.title || paper.canonical_ref}" to local Flowloom?\n\nOnly bounded metadata, claims, locators, and provenance are sent. The model is not called until you confirm generation in Flowloom.`,
  );
  if (!confirmed) return;
  if (trigger) trigger.disabled = true;
  try {
    const context = await api(`/api/papers/${encodeURIComponent(paper.id)}/flowloom-context`, {
      method: "POST",
      body: JSON.stringify({
        confirmed: true,
        editorName: storedEditorName(),
        reason: "User explicitly opened the source-bounded paper dossier in Flowloom for semantic figure drafting.",
      }),
    });
    const targetUrl = new URL(state.config?.flowloom_base_url || "/flowloom/", window.location.href);
    if (!/^https?:$/.test(targetUrl.protocol) || !isLocalFlowloomTarget(targetUrl)) {
      throw new Error("For paper dossiers, Flowloom must be the same-origin or loopback editor.");
    }
    const paperfieldBase = state.config?.paperfield_base_url || window.location.origin;
    try {
      context.paperfield_path = new URL(context.paperfield_path || "/", new URL(paperfieldBase, window.location.href)).href;
      if (context.pdf_url) context.pdf_url = new URL(context.pdf_url, new URL(paperfieldBase, window.location.href)).href;
      if (context.source_url) context.source_url = new URL(context.source_url, new URL(paperfieldBase, window.location.href)).href;
    } catch {
      // Keep the server-provided relative locator if a deployment has no absolute base URL.
    }
    state.researchThreads.flowloomCleanup?.();
    const messageId = bridgeIdentifier("atlas-paper");
    const bridgeToken = `${bridgeIdentifier("token")}-${Math.random().toString(36).slice(2)}`;
    targetUrl.searchParams.set("paperfieldBridgeSession", messageId);
    targetUrl.searchParams.set("paperfieldOrigin", window.location.origin);
    targetUrl.hash = `paperfieldBridge=${encodeURIComponent(bridgeToken)}`;
    const target = window.open(targetUrl.href, "paperfield-flowloom");
    if (!target) throw new Error("The browser blocked the Flowloom window; allow pop-ups for Atlas.");
    const packet = { type: "atlas:paper-context", version: 1, messageId, bridgeToken, paperContext: context };
    let finished = false;
    const send = () => {
      try { target.postMessage(packet, targetUrl.origin); } catch { /* target may still be loading */ }
    };
    const cleanup = () => {
      if (finished) return;
      finished = true;
      window.removeEventListener("message", receive);
      window.clearTimeout(timeoutId);
      if (state.researchThreads.flowloomCleanup === cleanup) state.researchThreads.flowloomCleanup = null;
    };
    const receive = (event) => {
      const message = event.data;
      if (event.source !== target || event.origin !== targetUrl.origin || !message || typeof message !== "object") return;
      if (message.messageId !== messageId || message.bridgeToken !== bridgeToken) return;
      if (message.type === "flowloom:ready") { send(); return; }
      if (message.type === "flowloom:error") {
        cleanup();
        toast(`Flowloom rejected the paper context: ${message.error || "unknown error"}`, true);
      } else if (message.type === "flowloom:paper-context-accepted") {
        cleanup();
        toast(`${paper.title || paper.canonical_ref} is loaded in Flowloom. Review the source locators before generating.`);
      }
    };
    const timeoutId = window.setTimeout(() => {
      cleanup();
      toast("Flowloom did not acknowledge the paper context. Check that the editor finished loading.", true);
    }, 15000);
    state.researchThreads.flowloomCleanup = cleanup;
    window.addEventListener("message", receive);
    send();
    window.setTimeout(send, 500);
    window.setTimeout(send, 1500);
    toast("Sending the source-bounded paper dossier to Flowloom…");
  } catch (error) {
    toast(error.message, true);
  } finally {
    if (trigger) trigger.disabled = false;
  }
}

async function sendPublicThreadToFlowloom(reference, trigger = null) {
  const thread = state.researchThreads.selected;
  if (!thread || ![thread.id, thread.slug].includes(reference)) {
    toast("请先打开要发送的已发布线程", true);
    return;
  }
  const confirmed = window.confirm(`确认把“${thread.title}”的已发布 revision ${thread.revision} 送入本机 Flowloom？\n\n将发送已审核主张、关系、论文定位与内容哈希；Flowloom 会创建可编辑图，不会自动上传。`);
  if (!confirmed) return;
  if (trigger) trigger.disabled = true;
  try {
    const context = await api(`/api/editor/threads/${encodeURIComponent(reference)}/flowloom-export`, {
      method: "POST",
      body: JSON.stringify({
        confirmed: true,
        revision: thread.revision,
        editorName: storedEditorName(),
        reason: "用户显式确认把已发布研究线程送到本机 Flowloom 编辑",
      }),
    });
    let targetUrl;
    try {
      targetUrl = new URL(state.config?.flowloom_base_url || "/flowloom/", window.location.href);
      if (!/^https?:$/.test(targetUrl.protocol)) throw new Error("unsupported protocol");
      if (!isLocalFlowloomTarget(targetUrl)) throw new Error("Flowloom must be same-origin or loopback for research context exports");
    } catch {
      throw new Error("Flowloom 地址无效，请检查 Atlas 运行配置");
    }
    state.researchThreads.flowloomCleanup?.();
    const messageId = bridgeIdentifier("atlas-thread");
    const bridgeToken = `${bridgeIdentifier("token")}-${Math.random().toString(36).slice(2)}`;
    targetUrl.searchParams.set("paperfieldBridgeSession", messageId);
    targetUrl.searchParams.set("paperfieldOrigin", window.location.origin);
    targetUrl.hash = `paperfieldBridge=${encodeURIComponent(bridgeToken)}`;
    const target = window.open(targetUrl.href, "paperfield-flowloom");
    if (!target) throw new Error("浏览器阻止了新窗口，请允许 Atlas 打开 Flowloom");
    const packet = {
      type: "atlas:claim-thread",
      version: 1,
      messageId,
      bridgeToken,
      threadContext: context,
    };
    let finished = false;
    const send = () => {
      try { target.postMessage(packet, targetUrl.origin); } catch { /* target may still be loading */ }
    };
    const cleanup = () => {
      if (finished) return;
      finished = true;
      window.removeEventListener("message", receive);
      window.clearTimeout(timeoutId);
      if (state.researchThreads.flowloomCleanup === cleanup) state.researchThreads.flowloomCleanup = null;
    };
    const receive = (event) => {
      const message = event.data;
      if (event.source !== target || event.origin !== targetUrl.origin || !message || typeof message !== "object") return;
      if (message.messageId !== messageId || message.bridgeToken !== bridgeToken) return;
      if (message.type === "flowloom:ready") {
        send();
        return;
      }
      if (message.type === "flowloom:error") {
        cleanup();
        toast(`Flowloom 未接收线程：${message.error || "未知错误"}`, true);
        return;
      }
      if (message.type === "flowloom:thread-accepted") {
        cleanup();
        toast(`${thread.title} 已进入 Flowloom，可编辑主张图谱`);
      }
    };
    const timeoutId = window.setTimeout(() => {
      cleanup();
      toast("Flowloom 未确认接收，请检查编辑器是否已完成加载", true);
    }, 15000);
    state.researchThreads.flowloomCleanup = cleanup;
    window.addEventListener("message", receive);
    send();
    window.setTimeout(send, 500);
    window.setTimeout(send, 1500);
    toast("正在把已发布研究线程送入 Flowloom");
  } catch (error) {
    toast(error.message, true);
  } finally {
    if (trigger) trigger.disabled = false;
  }
}

async function openKnowledgeEntity(id, kind = "", trigger = null) {
  try {
    const detail = await api(`/api/knowledge/${encodeURIComponent(id)}?depth=3&max_nodes=60`);
    state.knowledge.selectedId = id;
    state.knowledge.selected = detail;
    renderKnowledgeViews();
    if (el("knowledgeDialog")) {
      el("knowledgeDialogTitle").textContent = detail.canonical_name || "知识节点详情";
      el("knowledgeDialogSubtitle").textContent = `${knowledgeKindLabels[detail.entity_kind] || kind || "知识节点"} / ${detail.id}`;
      el("knowledgeDialogContent").innerHTML = knowledgeDetailMarkup(detail);
      openManagedDialog(el("knowledgeDialog"), trigger, () => el("knowledgeDialogClose"));
    }
  } catch (error) {
    toast(error.message, true);
  }
}

async function openTermDetail(termId, trigger = null) {
  try {
    const term = await api(`/api/terms/${encodeURIComponent(termId)}`);
    el("termDetailTitle").textContent = term.display_term || "术语详情";
    el("termDetailSubtitle").textContent = `${term.independent_paper_count || 0} 篇独立候选论文 / ${term.adoption_status === "cross_paper" ? "跨论文出现" : "单篇命名"}`;
    const evidence = (term.evidence || []).map((item) => {
      const paper = item.paper || {};
      const ref = paper.canonical_ref || item.source_identifier || "";
      return `<article class="term-detail-evidence"><div><strong>${escapeHtml(paper.title || ref || "论文标题待补充")}</strong><span>${escapeHtml(displayDate(item.source_updated_at || item.published_at))} / ${escapeHtml(item.extraction_rule || "语境")}</span></div><q>${escapeHtml(item.context_text || "来源语境待补充")}</q><div class="inline-actions">${paper.id ? `<button class="button button-secondary" type="button" data-paper-id="${escapeHtml(paper.id)}">查看 Atlas 档案</button>` : ""}${ref ? `<a class="button button-secondary" href="${escapeHtml(paperfieldReferenceUrl(ref))}">在 Paperfield 精读</a>` : ""}</div></article>`;
    }).join("");
    el("termDetailContent").innerHTML = `<div class="term-detail-boundary"><strong>解释边界</strong><p>${escapeHtml(term.terminology_boundary?.first_seen_means || "首次观察不等于领域首次提出。")}</p><p>${escapeHtml(term.terminology_boundary?.adoption_means || "跨论文出现不等于形成共识。")}</p></div><p class="term-expansion"><span>作者展开</span><strong>${escapeHtml(term.canonical_expansion || "尚无作者明示展开")}</strong></p><div class="term-detail-actions"><button class="button button-primary" type="button" data-save-kind="term" data-save-ref="${escapeHtml(term.id)}" data-save-title="${escapeHtml(term.display_term || "术语")}">保存术语</button></div><div class="term-detail-evidence-list">${evidence || `<p class="term-action-note">尚无论文证据。</p>`}</div>`;
    openManagedDialog(el("termDetailDialog"), trigger, () => el("termDetailClose"));
  } catch (error) {
    toast(error.message, true);
  }
}

function splitTokens(value) {
  return [...new Set(String(value || "").split(/[，,\n]/).map((item) => item.trim()).filter(Boolean))];
}

function focusProfile() {
  return state.data?.focus_profile || { domains: [], keywords: [], source_keys: [], method_ids: [], problem_ids: [], thread_ids: [] };
}

function privateRadarEntries() {
  const radar = state.data?.private_radar || {};
  return [
    ...(radar.signals || []).map((item) => ({ item, kind: "signal" })),
    ...(radar.candidates || []).map((item) => ({ item, kind: "candidate" })),
    ...(radar.updates || []).map((item) => ({ item, kind: "update" })),
  ].sort((left, right) => Number(right.item.ranking?.total || 0) - Number(left.item.ranking?.total || 0));
}

function focusNames(ids, kind) {
  const lookup = new Map((state.knowledge[kind] || []).map((item) => [String(item.id), item.canonical_name]));
  return (ids || []).map((id) => lookup.get(String(id)) || id);
}

function renderFocusSummary() {
  const focus = focusProfile();
  const groups = [
    ["领域", (focus.domains || []).map(frontierDomainLabel)],
    ["关键词", focus.keywords || []],
    ["来源", (focus.source_keys || []).map(frontierSourceLabel)],
    ["方法", focusNames(focus.method_ids, "method")],
    ["问题", focusNames(focus.problem_ids, "problem")],
    ["线程", focusNames(focus.thread_ids, "thread")],
  ];
  const active = groups.flatMap(([, values]) => values).length;
  if (el("focusSummary")) el("focusSummary").textContent = active ? `${active} 个显式关注条件` : "尚未设置显式关注范围";
  if (el("focusSummaryGrid")) {
    el("focusSummaryGrid").innerHTML = groups.map(([label, values]) => `<div><span>${escapeHtml(label)}</span><strong>${values.length ? values.map(escapeHtml).join(" / ") : "未设置"}</strong></div>`).join("");
  }
}

function savedItemMarkup(item) {
  const kind = knowledgeKindLabels[item.item_kind] || (item.item_kind === "signal" ? "研究信号" : item.item_kind);
  const paperLink = item.item_kind === "paper" ? paperfieldReferenceUrl(item.item_ref) : "";
  return `<article class="saved-row"><div><div class="row-topline"><span class="state-label is-primary">${escapeHtml(kind)}</span><span>${escapeHtml(displayDate(item.updated_at))}</span></div><h3>${escapeHtml(item.title || item.item_ref)}</h3><p>${escapeHtml(item.note || "未添加备注")}</p>${item.tags?.length ? `<div class="topic-list">${item.tags.map((tag) => `<span class="topic-tag">${escapeHtml(tag)}</span>`).join("")}</div>` : ""}<small>${escapeHtml(item.item_ref)}</small></div><div class="saved-row-actions">${paperLink ? `<a class="button button-secondary" href="${escapeHtml(paperLink)}">在 Paperfield 精读</a>` : ""}<button class="button button-danger" type="button" data-saved-delete="${escapeHtml(item.id)}">取消保存</button></div></article>`;
}

function digestMarkup(digest) {
  const typeLabel = digest.digest_type === "public" ? "公共周报" : "私人周报";
  const sourceCount = digest.source_snapshot?.signal_revisions?.length || digest.content?.signal_revisions?.length || 0;
  return `<article class="digest-row"><header><div><span class="state-label ${digest.digest_type === "public" ? "is-success" : "is-primary"}">${typeLabel}</span><h3>${escapeHtml(digest.period_start)} 至 ${escapeHtml(digest.period_end)}</h3><p>冻结于 ${escapeHtml(displayDate(digest.as_of))} / ${escapeHtml(sourceCount)} 个信号 revision</p></div><span class="digest-hash" title="source SHA-256">${escapeHtml(String(digest.source_sha256 || "").slice(0, 16))}</span></header><details><summary>查看冻结内容</summary><pre>${escapeHtml(digest.markdown || "暂无 Markdown 内容")}</pre></details></article>`;
}

function renderDiagnostics() {
  if (!el("diagnosticsOutput")) return;
  el("diagnosticsOutput").textContent = state.loop.diagnostics
    ? JSON.stringify(state.loop.diagnostics, null, 2)
    : "尚未读取诊断。";
}

function backupMarkup(backup) {
  const manifest = backup.manifest || {};
  return `<article class="backup-row"><div><div class="row-topline"><span class="state-label is-success">manifest v${escapeHtml(manifest.manifest_version || 1)}</span><span>schema ${escapeHtml(manifest.schema_version || "--")}</span><span>${escapeHtml(displayDate(backup.created_at || manifest.created_at))}</span></div><strong>${escapeHtml(backup.path || "备份路径未记录")}</strong><small>SHA-256 ${escapeHtml(String(backup.database_sha256 || manifest.database_sha256 || "").slice(0, 24))} / ${escapeHtml(manifest.database_size || 0)} bytes</small></div><div class="inline-actions"><button class="button button-secondary" type="button" data-backup-validate="${escapeHtml(backup.id)}">验证</button><button class="button button-danger" type="button" data-backup-restore="${escapeHtml(backup.id)}">恢复</button></div></article>`;
}

const researchViewKindLabels = {
  search: "目录搜索",
  radar: "前沿雷达",
  focus: "关注范围",
};

function researchViewDefinitionSummary(view) {
  const definition = view.definition || {};
  if (view.view_kind === "search") {
    const scope = [definition.query ? `“${definition.query}”` : "全部目录", ...(definition.kinds || []), ...(definition.domains || []), ...(definition.statuses || [])];
    return scope.join(" / ");
  }
  if (view.view_kind === "radar") {
    const dates = [definition.date_from, definition.date_to].filter(Boolean).join(" 至 ");
    return [...(definition.domains || []), ...(definition.sources || []), ...(definition.maturity || []), ...(definition.review_status || []), dates].filter(Boolean).join(" / ") || "全部已接入前沿来源";
  }
  return [...(definition.domains || []), ...(definition.keywords || []), ...(definition.source_keys || [])].join(" / ") || "显式关注实体与范围";
}

function researchViewMarkup(view) {
  const latestRun = state.loop.researchViewRuns.find((run) => run.view_id === view.id);
  const runMeta = latestRun
    ? `最近运行 ${displayDate(latestRun.run_at)} / SHA-256 ${String(latestRun.result_sha256 || "").slice(0, 16)}`
    : "尚未运行";
  const delta = latestRun?.delta || {};
  const deltaMeta = latestRun
    ? delta.baseline
      ? "基线运行"
      : `新增 ${delta.added_count || 0} / 移除 ${delta.removed_count || 0} / 变化 ${delta.changed_count || 0}`
    : "";
  return `<article class="research-view-row"><div><div class="row-topline"><span class="state-label is-primary">${escapeHtml(researchViewKindLabels[view.view_kind] || view.view_kind)}</span><span>revision ${escapeHtml(view.revision || 1)}</span>${deltaMeta ? `<span>${escapeHtml(deltaMeta)}</span>` : ""}</div><h3>${escapeHtml(view.name)}</h3><p>${escapeHtml(view.description || researchViewDefinitionSummary(view))}</p><small>${escapeHtml(researchViewDefinitionSummary(view))} / ${escapeHtml(runMeta)}</small></div><div class="research-view-row-actions"><button class="button button-primary" type="button" data-research-view-run="${escapeHtml(view.id)}">运行</button>${latestRun ? `<button class="button button-secondary" type="button" data-research-view-bundle="${escapeHtml(latestRun.id)}">生成证据包</button>` : ""}<button class="button button-secondary" type="button" data-research-view-edit="${escapeHtml(view.id)}">编辑</button><button class="button button-danger" type="button" data-research-view-delete="${escapeHtml(view.id)}">删除</button></div></article>`;
}

function notificationMarkup(item) {
  const lead = ["paper_lead", "first_party_lead"].includes(item.notification_kind) || item.evidence_level === "lead_only";
  const unread = !item.read_at;
  const label = lead ? "待核查线索" : "已审核变化";
  return `<article class="notification-row${unread ? " is-unread" : ""}${lead ? " is-lead" : ""}"><div><div class="row-topline"><span class="state-label ${lead ? "is-warning" : "is-success"}">${label}</span><span>${unread ? "未读" : "已读"}</span><span>${escapeHtml(displayDate(item.last_seen_at || item.created_at))}</span></div><h3>${escapeHtml(item.title || "研究变化")}</h3><p>${escapeHtml(item.body || "来源说明待补充")}</p><small>${escapeHtml(item.source_kind || "source")} / ${escapeHtml(item.source_ref || "ref 未记录")} / revision ${escapeHtml(item.source_revision || "未记录")}</small><p class="notification-evidence-boundary">${lead ? "该条目只用于发现，不提升论文证据等级。" : "来源为已发布信号或已审核知识关系。"}</p></div><div class="notification-row-actions">${unread ? `<button class="button button-secondary" type="button" data-notification-read="${escapeHtml(item.id)}">标为已读</button>` : ""}</div></article>`;
}

function evidenceBundleMarkup(bundle) {
  const manifest = bundle.manifest || {};
  return `<article class="evidence-bundle-row"><div><div class="row-topline"><span class="state-label is-success">bundle v${escapeHtml(manifest.bundle_version || manifest.version || 1)}</span><span>${escapeHtml(displayDate(bundle.created_at))}</span></div><h3>${escapeHtml(manifest.view_name || bundle.view_run_id || "研究证据包")}</h3><p>${escapeHtml(manifest.item_count ?? manifest.paper_count ?? 0)} 个结果 / ${escapeHtml(manifest.locator_boundary || "保留缺失定位与未知项")}</p><small class="bundle-hash">SHA-256 ${escapeHtml(bundle.bundle_sha256 || manifest.bundle_sha256 || "未记录")}</small></div><div class="evidence-bundle-row-actions"><button class="button button-secondary" type="button" data-evidence-bundle-download="${escapeHtml(bundle.id)}" data-bundle-format="json">JSON</button><button class="button button-secondary" type="button" data-evidence-bundle-download="${escapeHtml(bundle.id)}" data-bundle-format="markdown">Markdown</button></div></article>`;
}

function renderResearchWorkspace() {
  if (!el("researchViewList")) return;
  const views = state.loop.researchViews || [];
  const notifications = state.loop.notifications || [];
  const bundles = state.loop.evidenceBundles || [];
  const unread = notifications.filter((item) => !item.read_at).length;
  el("researchViewList").innerHTML = views.map(researchViewMarkup).join("");
  el("researchViewEmpty").hidden = views.length > 0;
  el("notificationList").innerHTML = notifications.map(notificationMarkup).join("");
  el("notificationEmpty").hidden = notifications.length > 0;
  el("evidenceBundleList").innerHTML = bundles.map(evidenceBundleMarkup).join("");
  el("evidenceBundleEmpty").hidden = bundles.length > 0;
  el("researchViewCount").textContent = views.length;
  el("notificationUnreadCount").textContent = unread;
  el("loopNotificationCount").textContent = unread;
  el("evidenceBundleCount").textContent = bundles.length;
  el("searchSnapshotCount").textContent = state.loop.searchSnapshots.filter((item) => !item.expired).length;
}

function renderLoop() {
  if (!el("loopView") || !state.data) return;
  renderFocusSummary();
  const privateEntries = privateRadarEntries();
  el("privateRadarList").innerHTML = privateEntries.slice(0, 20).map(({ item, kind }, index) => frontierItemMarkup(item, kind, index)).join("");
  el("privateRadarEmpty").hidden = privateEntries.length > 0;
  el("privateRadarEmpty").querySelector("p").textContent = state.data.private_radar?.empty_reason || "先设置一个明确的关注范围。";
  const saved = state.data.saved_items || [];
  el("savedList").innerHTML = saved.map(savedItemMarkup).join("");
  el("savedEmpty").hidden = saved.length > 0;
  const digests = [...(state.data.research_digests || []), ...(state.loop.publicDigests || [])]
    .sort((left, right) => String(right.as_of || right.created_at).localeCompare(String(left.as_of || left.created_at)));
  el("digestList").innerHTML = digests.map(digestMarkup).join("");
  el("digestEmpty").hidden = digests.length > 0;
  el("backupList").innerHTML = state.loop.backups.map(backupMarkup).join("");
  el("backupEmpty").hidden = state.loop.backups.length > 0;
  el("savedCount").textContent = saved.length;
  el("privateRadarCount").textContent = privateEntries.length;
  el("digestCount").textContent = digests.length;
  el("navSavedCount").textContent = saved.length;
  renderResearchWorkspace();
  renderDiagnostics();
}

function populateFocusSelect(selectId, items, selectedIds) {
  const selected = new Set((selectedIds || []).map(String));
  el(selectId).innerHTML = items.map((item) => `<option value="${escapeHtml(item.id)}"${selected.has(String(item.id)) ? " selected" : ""}>${escapeHtml(item.canonical_name)}</option>`).join("");
}

function openFocusDialog(trigger = null) {
  const focus = focusProfile();
  el("focusForm").querySelectorAll('input[name="focus-domain"]').forEach((input) => { input.checked = (focus.domains || []).includes(input.value); });
  el("focusKeywords").value = (focus.keywords || []).join(", ");
  el("focusSources").value = (focus.source_keys || []).join(", ");
  populateFocusSelect("focusMethods", state.knowledge.method, focus.method_ids);
  populateFocusSelect("focusProblems", state.knowledge.problem, focus.problem_ids);
  populateFocusSelect("focusThreads", state.knowledge.thread, focus.thread_ids);
  el("focusFormError").hidden = true;
  openManagedDialog(el("focusDialog"), trigger, () => el("focusKeywords"));
}

function selectedOptions(selectId) {
  return [...el(selectId).selectedOptions].map((option) => option.value);
}

async function submitFocus(event) {
  event.preventDefault();
  const submit = el("focusSave");
  submit.disabled = true;
  const payload = {
    domains: [...el("focusForm").querySelectorAll('input[name="focus-domain"]:checked')].map((input) => input.value),
    keywords: splitTokens(el("focusKeywords").value),
    sourceKeys: splitTokens(el("focusSources").value),
    methodIds: selectedOptions("focusMethods"),
    problemIds: selectedOptions("focusProblems"),
    threadIds: selectedOptions("focusThreads"),
    editorName: storedEditorName(),
    reason: "用户显式更新私人研究关注范围",
  };
  try {
    await api("/api/private/focus", { method: "POST", body: JSON.stringify(payload) });
    el("focusDialog").close();
    await loadBootstrap();
    toast("关注范围已更新");
  } catch (error) {
    el("focusFormError").textContent = error.message;
    el("focusFormError").hidden = false;
  } finally {
    submit.disabled = false;
  }
}

async function saveResearchItem(kind, reference, title) {
  if (!kind || !reference) return;
  try {
    await api("/api/private/saved", { method: "POST", body: JSON.stringify({ itemKind: kind, itemRef: reference, title, tags: [], note: "", editorName: storedEditorName(), reason: "用户在 Research Atlas 中显式保存" }) });
    await loadBootstrap();
    toast("已保存到研究回路");
  } catch (error) {
    toast(error.message, true);
  }
}

async function deleteSavedItem(itemId) {
  try {
    await api(`/api/private/saved/${encodeURIComponent(itemId)}`, { method: "DELETE" });
    await loadBootstrap();
    toast("已取消保存");
  } catch (error) {
    toast(error.message, true);
  }
}

function digestPeriod() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  const iso = (date) => date.toISOString().slice(0, 10);
  return { periodStart: iso(start), periodEnd: iso(end), asOf: new Date().toISOString(), editorName: storedEditorName(), reason: "用户显式生成冻结研究周报" };
}

async function createDigest(type) {
  const path = type === "public" ? "/api/editor/digests" : "/api/private/digests";
  try {
    await api(path, { method: "POST", body: JSON.stringify(digestPeriod()) });
    await loadBootstrap();
    await loadLoopOperations(false);
    toast(type === "public" ? "公共周报已冻结" : "私人周报已冻结");
  } catch (error) {
    toast(error.message, true);
  }
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function exportResearchData() {
  try {
    const payload = await api("/api/private/export");
    downloadJson(`research-atlas-private-${new Date().toISOString().slice(0, 10)}.json`, payload);
    toast("私人研究数据已导出");
  } catch (error) {
    toast(error.message, true);
  }
}

function researchViewFieldVisibility() {
  const kind = el("researchViewKind").value;
  document.querySelectorAll("[data-research-view-field]").forEach((field) => {
    const kinds = String(field.dataset.researchViewField || "").split(/\s+/).filter(Boolean);
    field.hidden = !kinds.includes(kind);
    field.querySelectorAll("input, select, textarea").forEach((control) => { control.disabled = field.hidden; });
  });
  el("researchViewStatuses").placeholder = kind === "search"
    ? "例如 catalogued, in_progress, analysed"
    : "例如 emerging, contested, validated";
  el("researchViewBoundary").textContent = kind === "search"
    ? "运行目录搜索会物化当时可见字段，并在快照过期前保持标题、摘要、状态和结果总数不变。"
    : kind === "radar"
      ? "论文候选和第一方动态只作为待核查线索；只有已审核信号与关系可以生成结论级提醒。"
      : "关注范围来自你的显式选择；浏览行为不会自动加入关键词、方法或线程。";
}

function setResearchViewForm(view = null) {
  const definition = view?.definition || {};
  const kind = view?.view_kind || (state.search.trim() ? "search" : "focus");
  el("researchViewName").value = view?.name || "";
  el("researchViewDescription").value = view?.description || "";
  el("researchViewKind").value = kind;
  el("researchViewQuery").value = definition.query ?? state.search ?? "";
  el("researchViewDomains").value = (definition.domains || (kind === "radar" ? [state.frontier.filters.domain].filter(Boolean) : [])).join(", ");
  el("researchViewSources").value = (definition.sources || [state.frontier.filters.source].filter(Boolean)).join(", ");
  el("researchViewStatuses").value = (kind === "search" ? definition.statuses : definition.maturity || [state.frontier.filters.maturity].filter(Boolean)).join(", ");
  const kinds = new Set(definition.kinds || ["paper", "project"]);
  [...el("researchViewKinds").options].forEach((option) => { option.selected = kinds.has(option.value); });
  el("researchViewDateFrom").value = definition.date_from || state.frontier.filters.from || "";
  el("researchViewDateTo").value = definition.date_to || state.frontier.filters.to || "";
  el("researchViewFormError").hidden = true;
  researchViewFieldVisibility();
}

function openResearchViewDialog(view = null, trigger = null) {
  state.loop.editingView = view;
  el("researchViewDialogTitle").textContent = view ? "编辑研究视图" : "保存研究视图";
  el("researchViewSave").textContent = view ? "保存 revision" : "保存视图";
  setResearchViewForm(view);
  openManagedDialog(el("researchViewDialog"), trigger, () => el("researchViewName"));
}

function researchViewDefinitionFromForm(kind) {
  if (kind === "search") {
    return {
      query: el("researchViewQuery").value.trim(),
      kinds: selectedOptions("researchViewKinds"),
      domains: splitTokens(el("researchViewDomains").value),
      statuses: splitTokens(el("researchViewStatuses").value),
      limit: 60,
    };
  }
  if (kind === "radar") {
    return {
      domains: splitTokens(el("researchViewDomains").value),
      sources: splitTokens(el("researchViewSources").value),
      maturity: splitTokens(el("researchViewStatuses").value),
      reviewStatus: [],
      dateFrom: el("researchViewDateFrom").value,
      dateTo: el("researchViewDateTo").value,
      limit: 60,
    };
  }
  const focus = focusProfile();
  return {
    domains: focus.domains || [],
    keywords: focus.keywords || [],
    sourceKeys: focus.source_keys || [],
    methodIds: focus.method_ids || [],
    problemIds: focus.problem_ids || [],
    threadIds: focus.thread_ids || [],
  };
}

async function submitResearchView(event) {
  event.preventDefault();
  const editing = state.loop.editingView;
  const kind = el("researchViewKind").value;
  const payload = {
    name: el("researchViewName").value.trim(),
    description: el("researchViewDescription").value.trim(),
    viewKind: kind,
    definition: researchViewDefinitionFromForm(kind),
    editorName: storedEditorName(),
    reason: editing ? "用户显式更新可复现研究视图" : "用户显式创建可复现研究视图",
  };
  if (editing) payload.expectedRevision = editing.revision;
  const submit = el("researchViewSave");
  submit.disabled = true;
  try {
    await api(editing ? `/api/private/views/${encodeURIComponent(editing.id)}` : "/api/private/views", { method: "POST", body: JSON.stringify(payload) });
    el("researchViewDialog").close();
    await loadResearchWorkspace();
    toast(editing ? "研究视图 revision 已更新" : "研究视图已保存");
  } catch (error) {
    el("researchViewFormError").textContent = error.message;
    el("researchViewFormError").hidden = false;
  } finally {
    submit.disabled = false;
  }
}

async function loadResearchWorkspace() {
  try {
    const [views, runs, notifications, bundles, snapshots] = await Promise.all([
      api("/api/private/views?limit=100"),
      api("/api/private/view-runs?limit=100"),
      api("/api/private/notifications?limit=100"),
      api("/api/private/provenance-bundles?limit=100"),
      api("/api/private/search-snapshots?limit=50"),
    ]);
    state.loop.researchViews = views.items || views.research_views || [];
    state.loop.researchViewRuns = runs.items || runs.runs || [];
    state.loop.notifications = notifications.items || notifications.notifications || [];
    state.loop.evidenceBundles = bundles.items || bundles.bundles || [];
    state.loop.searchSnapshots = snapshots.items || snapshots.snapshots || [];
    renderResearchWorkspace();
  } catch (error) {
    if (![401, 403].includes(error?.status)) toast(error.message, true);
  }
}

async function runResearchView(viewId) {
  const operation = operationIdempotencyKey("view-run", viewId);
  try {
    const response = await api(`/api/private/views/${encodeURIComponent(viewId)}/run`, { method: "POST", body: JSON.stringify({ editorName: storedEditorName(), reason: "用户显式运行保存的研究视图", idempotencyKey: operation.key }) });
    operation.clear();
    await loadResearchWorkspace();
    toast(response.idempotent_replay ? "已恢复先前完成的视图运行" : "研究视图已运行并冻结结果");
  } catch (error) {
    toast(error.message, true);
  }
}

async function deleteResearchView(viewId) {
  const view = state.loop.researchViews.find((item) => item.id === viewId);
  if (!view || !window.confirm(`确认删除研究视图“${view.name}”？历史运行与证据包会继续保留。`)) return;
  try {
    await api(`/api/private/views/${encodeURIComponent(viewId)}`, { method: "DELETE" });
    await loadResearchWorkspace();
    toast("研究视图已删除");
  } catch (error) {
    toast(error.message, true);
  }
}

async function createEvidenceBundle(runId) {
  const operation = operationIdempotencyKey("evidence-bundle", runId);
  try {
    const response = await api("/api/private/provenance-bundles", { method: "POST", body: JSON.stringify({ viewRunId: runId, editorName: storedEditorName(), reason: "用户显式导出研究视图证据包", idempotencyKey: operation.key }) });
    operation.clear();
    await loadResearchWorkspace();
    toast(response.idempotent_replay ? "已恢复先前生成的证据包" : "证据包已生成并计算 SHA-256");
  } catch (error) {
    toast(error.message, true);
  }
}

async function refreshResearchNotifications() {
  try {
    await api("/api/private/notifications/refresh", { method: "POST", body: JSON.stringify({ editorName: storedEditorName(), reason: "用户显式检查已审核研究变化" }) });
    await loadResearchWorkspace();
    toast("变化提醒已检查");
  } catch (error) {
    toast(error.message, true);
  }
}

async function markResearchNotification(notificationId = "") {
  const path = notificationId ? `/api/private/notifications/${encodeURIComponent(notificationId)}/read` : "/api/private/notifications/read-all";
  try {
    await api(path, { method: "POST", body: JSON.stringify({ editorName: storedEditorName(), reason: "用户显式更新变化提醒已读状态" }) });
    await loadResearchWorkspace();
  } catch (error) {
    toast(error.message, true);
  }
}

async function downloadEvidenceBundle(bundleId, format) {
  try {
    const payload = await api(`/api/private/provenance-bundles/${encodeURIComponent(bundleId)}?format=${encodeURIComponent(format)}`);
    if (format === "markdown") {
      const blob = new Blob([payload.markdown || payload.content || ""], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `research-atlas-evidence-${bundleId}.md`;
      anchor.click();
      URL.revokeObjectURL(url);
    } else {
      downloadJson(`research-atlas-evidence-${bundleId}.json`, payload);
    }
    toast("证据包已导出");
  } catch (error) {
    toast(error.message, true);
  }
}

async function loadLoopOperations(includeDiagnostics = true) {
  try {
    const backupsAvailable = !state.config?.mounted_via_proxy;
    const [backups, publicDigests, diagnostics] = await Promise.all([
      backupsAvailable ? api("/api/editor/backups?limit=50") : Promise.resolve({ items: [] }),
      api("/api/digests?limit=20"),
      includeDiagnostics ? api("/api/private/diagnostics") : Promise.resolve(null),
    ]);
    state.loop.backups = backups.items || [];
    state.loop.publicDigests = publicDigests.items || [];
    if (includeDiagnostics) state.loop.diagnostics = diagnostics;
    renderLoop();
  } catch (error) {
    if (![401, 403].includes(error?.status)) toast(error.message, true);
  }
}

async function createBackup() {
  try {
    await api("/api/editor/backups/export", { method: "POST", body: JSON.stringify({ editorName: storedEditorName(), reason: "用户显式创建 Phase 5 本地安全备份" }) });
    await loadLoopOperations();
    toast("数据库备份已创建并生成校验清单");
  } catch (error) {
    toast(error.message, true);
  }
}

async function runBackupAction(backupId, action) {
  const backup = state.loop.backups.find((item) => String(item.id) === String(backupId));
  if (!backup) return;
  if (action === "restore" && !window.confirm(`确认从该备份恢复 Atlas？\n${backup.path}\n恢复前会自动创建当前库安全备份。`)) return;
  const path = action === "restore" ? "/api/editor/backups/restore" : "/api/editor/backups/verify";
  try {
    await api(path, { method: "POST", body: JSON.stringify({ backupId: backup.id, editorName: storedEditorName(), reason: action === "restore" ? "用户显式确认从已验证备份恢复" : "用户显式验证本地备份完整性" }) });
    await loadLoopOperations();
    toast(action === "restore" ? "备份恢复完成" : "备份完整性验证通过");
  } catch (error) {
    toast(error.message, true);
  }
}

async function loadCatalogSearch(query) {
  const normalized = query.trim();
  if (!normalized) {
    state.catalogSearch = null;
    renderLibrary();
    return;
  }
  try {
    const result = await api(`/api/search?q=${encodeURIComponent(normalized)}&limit=60`);
    state.catalogSearch = { ...result, query: normalized };
    renderLibrary();
  } catch (error) {
    state.catalogSearch = { items: [], total: 0, query: normalized, error: error.message };
    renderLibrary();
  }
}

async function fetchBootstrapData() {
  const publicData = await api("/api/bootstrap");
  let privateData = {};
  try {
    privateData = await api("/api/private/bootstrap");
  } catch (error) {
    if (![401, 403].includes(error?.status) && !/本机|来源无效|403/.test(String(error?.message || error))) throw error;
  }
  let learning = privateData.learning || null;
  if (!learning) {
    try {
      learning = await api("/api/private/learning-progress");
    } catch (error) {
      if (![401, 403].includes(error?.status)) throw error;
    }
  }
  const privateStats = privateData.stats || {};
  return {
    ...publicData,
    ...privateData,
    analysis_requests: Array.isArray(privateData.analysis_requests) ? privateData.analysis_requests : [],
    signal_drafts: Array.isArray(privateData.signal_drafts) ? privateData.signal_drafts : [],
    focus_profile: privateData.focus_profile || { owner_id: "local", domains: [], keywords: [], source_keys: [], method_ids: [], problem_ids: [], thread_ids: [] },
    saved_items: Array.isArray(privateData.saved_items) ? privateData.saved_items : [],
    research_digests: Array.isArray(privateData.research_digests) ? privateData.research_digests : [],
    private_radar: privateData.private_radar || { items: [], signals: [], candidates: [], updates: [], empty: true, scope: null },
    learning,
    stats: { ...(publicData.stats || {}), ...privateStats, tasks: Number(privateStats.tasks || 0) },
  };
}

async function loadBootstrap() {
  state.data = await fetchBootstrapData();
  if (state.data.learning) state.curriculum.learning = state.data.learning;
  state.dataFingerprint = JSON.stringify(state.data);
  renderAll();
}

function dossierStageForTab(tab) {
  return { method: "method", math: "math", evidence: "experiments", critique: "critique", lineage: "lineage", artifacts: "code" }[tab] || "";
}

function curriculumChapterUrl(chapter) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("view", "curriculum");
  if (chapter?.track_id) url.searchParams.set("track", chapter.track_id);
  if (chapter?.chapter_id) url.searchParams.set("chapter", chapter.chapter_id);
  return url.href;
}

function paperCurriculumMarkup(paper) {
  const chapters = Array.isArray(paper?.curriculum?.chapters) ? paper.curriculum.chapters : [];
  if (!chapters.length) {
    return `<section class="dossier-section dossier-learning-context"><h2>学习路径</h2><p>这篇论文尚未绑定到固定课程章节。先从方法与数学档案开始，再按前沿雷达补充学习材料。</p><a class="text-action" href="?view=curriculum">打开知识树与课程</a></section>`;
  }
  const items = chapters.map((chapter) => {
    const learning = learningChapterState(chapter.chapter_id);
    const learningStatus = learningStatusDetails(learning.status);
    const formId = `dossierLearningStatus-${paper.id}-${chapter.chapter_id}`;
    const lessons = (chapter.course_lessons || []).slice(0, 3).map((lesson) => (
      `<a class="text-action" href="${escapeHtml(courseLessonUrl(lesson.path))}">${escapeHtml(lesson.label)}</a>`
    )).join("");
    return `<li><div class="dossier-learning-copy"><div class="row-topline"><span class="state-label ${chapter.chapter_status === "active" ? "is-primary" : "is-success"}">${escapeHtml(chapter.chapter_code || "章节")}</span><span class="state-label ${learningStatus.className}">${escapeHtml(learningStatus.label)}</span></div><strong>${escapeHtml(chapter.chapter_title || "课程章节")}</strong><small>${escapeHtml(chapter.module_title || "")} / ${escapeHtml(chapter.paper_role || "代表论文")}</small><p>${escapeHtml(learningGapText(learning))}</p></div><div class="dossier-learning-actions"><form class="dossier-learning-form" data-learning-form="${escapeHtml(chapter.chapter_id)}"><label for="${escapeHtml(formId)}">学习状态<select id="${escapeHtml(formId)}" name="status">${learningStatusOptions(learning.status)}</select></label><button class="button button-primary" type="submit">更新</button></form><div class="inline-actions"><a class="button button-secondary" href="${escapeHtml(curriculumChapterUrl(chapter))}">查看章节</a>${lessons}</div></div></li>`;
  }).join("");
  return `<section class="dossier-section dossier-learning-context"><div class="section-heading is-tight"><div><h2>学习路径</h2><p>这篇论文在 Atlas 知识树中的位置；先修关系和课程正文来自版本化课程目录。</p></div><span class="section-count">${chapters.length} 个章节</span></div><ul class="dossier-learning-list">${items}</ul></section>`;
}

function dossierOverviewMarkup(paper) {
  const task = paper.analysis_requests?.[0];
  const taskStatus = task ? statusDetails(task.status) : null;
  const material = task ? materialDetails(task.material) : null;
  const dossier = paper.dossier;
  const summary = dossier?.content?.claims?.summary || dossier?.content?.method?.summary || dossier?.content?.structure?.summary || "";
  const completed = dossier?.sections || [];
  const coverage = dossier?.coverage || {};
  const coverageValue = (value) => value === null || value === undefined ? "—" : `${Math.round(Number(value) * 100)}%`;
  const current = dossier
    ? `<p>${summary ? proseMarkup(summary) : "档案已有可阅读阶段；尚未生成统一的一句话结论。"}</p><div class="dossier-facts"><span>${escapeHtml(dossier.analysis_level === "abstract" ? "摘要级档案" : "全文级档案")}</span><span>${escapeHtml(completed.length)} 个阶段可读</span><span>${escapeHtml(dossier.visibility === "private" ? "私人" : dossier.visibility)}</span></div>`
    : "<p>该论文的深度档案尚未生成。Atlas 已保存可追溯的论文身份和 Paperfield 别名，不会把快速讲解自动升级为公共知识。</p>";
  const publicAbstract = paper.abstract
    ? `<div class="dossier-section"><h2>公开摘要</h2><p>${proseMarkup(paper.abstract)}</p><p class="section-disclosure">来自论文公开元数据，未经 Atlas 全文核查，不等同于平台结论。</p></div>`
    : "";
  return `<div class="dossier-overview">
     <div><div class="dossier-section"><h2>当前档案</h2>${current}${task ? `<p class="task-inline-state"><span class="state-label ${taskStatus.className}">${taskStatus.label}</span> task ${escapeHtml(shortId(task.id))} / ${escapeHtml(task.percent || 0)}%</p>` : ""}</div>${dossier ? `<div class="dossier-section dossier-coverage"><h2>证据覆盖</h2><p>${escapeHtml(coverage.definition || "主张中至少有一个页码、章节或图表定位的比例。")}</p><div class="coverage-metric-grid"><div><span>可核查主张</span><strong>${escapeHtml(coverage.located_claims ?? 0)} / ${escapeHtml(coverage.claim_denominator ?? 0)}</strong></div><div><span>定位覆盖率</span><strong>${escapeHtml(coverageValue(coverage.locator_ratio))}</strong></div><div><span>材料哈希覆盖</span><strong>${escapeHtml(coverageValue(coverage.material_hash_ratio))}</strong></div><div><span>主张 ID / 证据 ID</span><strong>见下方章节</strong></div></div></div>` : ""}${publicAbstract}</div>
     <div>
      ${task ? `<div class="dossier-section"><h2>材料与授权</h2><p><span class="state-label ${material.className}">${escapeHtml(material.label)}</span></p><dl class="provenance-list"><div><dt>处理权限</dt><dd>${escapeHtml(material.meta)}</dd></div><div><dt>公开 PDF</dt><dd>${escapeHtml(task.material?.source_url || "未提供")}</dd></div><div><dt>解析错误</dt><dd>${escapeHtml(task.material?.error_text || "无")}</dd></div></dl>${materialAuthorizationAllowed(task) ? `<button class="button button-secondary material-config-action" type="button" data-material-authorize data-task-id="${escapeHtml(task.id)}">配置材料授权</button>` : ""}</div>` : ""}
      <div class="dossier-section"><h2>来源与版本</h2><dl class="provenance-list"><div><dt>Canonical ref</dt><dd>${escapeHtml(paper.canonical_ref)}</dd></div><div><dt>论文版本</dt><dd>${escapeHtml(paper.current_version || "未标注")}</dd></div><div><dt>材料基础</dt><dd>${escapeHtml(dossier ? sourceBasisLabel(dossier.source_basis) : "尚无分析材料")}</dd></div><div><dt>分析模型</dt><dd>${escapeHtml(dossier?.model || "尚未记录")}</dd></div><div><dt>提示版本</dt><dd>${escapeHtml(dossier?.prompt_version || "尚未记录")}</dd></div><div><dt>Paperfield ID</dt><dd>${escapeHtml(paper.paperfield_id || "尚未建立别名")}</dd></div><div><dt>Atlas 更新</dt><dd>${escapeHtml(displayDate(dossier?.updated_at || paper.updated_at))}</dd></div></dl></div>
    </div>
  </div>`;
}

function evidenceMarkup(items = []) {
  if (!items.length) return "";
  const direction = { supports: "支持", contradicts: "反证", qualifies: "限定" };
  return `<ul class="evidence-list">${items.map((item) => {
    const locators = [item.page ? `p.${item.page}` : "", item.section, item.figure, item.table].filter(Boolean);
    const label = item.label || locators.join(" / ") || "来源证据";
    const detail = [direction[item.direction] || item.direction, locators.join(" / ")].filter(Boolean).join(" · ");
    let paperfieldUrl = "";
    if (state.currentPaper) {
      paperfieldUrl = paperfieldPaperUrl(state.currentPaper);
      if (item.page) paperfieldUrl += `${paperfieldUrl.includes("?") ? "&" : "?"}page=${encodeURIComponent(item.page)}`;
    }
    const source = paperfieldUrl ? `<a href="${escapeHtml(paperfieldUrl)}">${escapeHtml(label)}</a>` : `<strong>${escapeHtml(label)}</strong>`;
    const externalSource = item.source_url ? `<a class="text-action evidence-external-link" href="${escapeHtml(item.source_url)}${item.page ? `#page=${escapeHtml(item.page)}` : ""}" target="_blank" rel="noreferrer">外部论文来源</a>` : "";
    return `<li><span>${escapeHtml(detail)}</span>${source}${item.quote ? `<q>${escapeHtml(item.quote)}</q>` : ""}<small class="evidence-identifiers">${escapeHtml(item.evidence_id || "evidence-id 未记录")} / source SHA ${escapeHtml(String(item.source_sha256 || "未记录").slice(0, 20))}${item.locator_complete ? " / 定位完整" : " / 定位不完整"}</small>${externalSource}</li>`;
  }).join("")}</ul>`;
}

function dossierStageMarkup(stageData, progress, label) {
  if (!stageData) {
    return `<div class="stage-empty"><strong>${escapeHtml(label)}尚未生成</strong><p>${progress ? `任务阶段状态：${escapeHtml(stageStatusLabel(progress.status))}。` : "当前没有覆盖该章节的分析任务。"} 原文、平台推导与编辑评价将在生成后分开标注。</p>${progress?.status === "failed" ? `<button class="button button-primary" type="button" data-stage-retry data-task-id="${escapeHtml(state.currentPaper?.analysis_requests?.[0]?.id || "")}" data-stage-key="${escapeHtml(progress.key)}">重试此阶段</button>` : ""}</div>`;
  }
  const sections = (stageData.sections || []).map((section) => {
    const source = sourceKindDetails(section.source_kind);
    return `<section class="dossier-argument">
      <header><div><h2>${escapeHtml(section.title)}</h2><p><span class="content-source ${source.className}">${escapeHtml(source.label)}</span><span>${escapeHtml(confidenceLabel(section.confidence))}</span><span class="claim-id">${escapeHtml(section.claim_id || "claim-id 未记录")}</span></p></div></header>
      <div class="research-prose">${proseMarkup(section.body)}</div>
      ${evidenceMarkup(section.evidence || [])}
    </section>`;
  }).join("");
  return `<div class="dossier-stage">
    <header class="stage-provenance"><div><span class="state-label is-success">可阅读</span><strong>${escapeHtml(sourceBasisLabel(stageData.source_basis))}</strong></div><dl><div><dt>模型</dt><dd>${escapeHtml(stageData.model || "未记录")}</dd></div><div><dt>提示版本</dt><dd>${escapeHtml(stageData.prompt_version || "未记录")}</dd></div><div><dt>生成时间</dt><dd>${escapeHtml(displayDate(stageData.generated_at))}</dd></div><div><dt>attempt</dt><dd>${escapeHtml(stageData.attempt || 1)}</dd></div></dl></header>
    ${stageData.summary ? `<p class="stage-summary">${proseMarkup(stageData.summary)}</p>` : ""}
    <div class="dossier-arguments">${sections}</div>
  </div>`;
}

function updateDossierTabs(paper) {
  document.querySelectorAll("[data-dossier-tab]").forEach((button) => {
    const stage = dossierStageForTab(button.dataset.dossierTab);
    const baseLabel = button.textContent.trim();
    if (!stage) {
      button.classList.remove("has-content", "has-error");
      button.setAttribute("aria-label", baseLabel);
      return;
    }
    const progress = paper.analysis_requests?.[0]?.progress?.find((item) => item.key === stage);
    const hasContent = Boolean(stage && paper.dossier?.content?.[stage]);
    const hasError = progress?.status === "failed";
    button.classList.toggle("has-content", hasContent);
    button.classList.toggle("has-error", hasError);
    button.setAttribute("aria-label", `${baseLabel}${hasError ? "，阶段失败" : hasContent ? "，已有内容" : "，尚无内容"}`);
  });
}

function renderDossierContent() {
  const paper = state.currentPaper;
  if (!paper) return;
  const tab = document.querySelector(`[data-dossier-tab="${CSS.escape(state.dossierTab)}"]`);
  el("dossierContent")?.setAttribute("aria-labelledby", tab?.id || "dossierOverviewTab");
  if (state.dossierTab === "overview") {
    el("dossierContent").innerHTML = dossierOverviewMarkup(paper);
    el("dossierContent").insertAdjacentHTML("beforeend", paperCurriculumMarkup(paper));
    return;
  }
  const stage = dossierStageForTab(state.dossierTab);
  const latestTask = paper.analysis_requests?.[0];
  const progress = latestTask?.progress?.find((item) => item.key === stage);
  const label = document.querySelector(`[data-dossier-tab="${CSS.escape(state.dossierTab)}"]`)?.textContent || "当前章节";
  el("dossierContent").innerHTML = dossierStageMarkup(paper.dossier?.content?.[stage], progress, label);
}

async function submitLearningProgress(form) {
  const chapterId = form.dataset.learningForm;
  const formData = new FormData(form);
  const status = String(formData.get("status") || "not_started");
  const payload = {
    chapterId,
    status,
    reason: "用户明确更新课程章节学习状态",
  };
  if (formData.has("confidence")) {
    const rawConfidence = String(formData.get("confidence") || "").trim();
    payload.confidence = rawConfidence ? Number(rawConfidence) : null;
  }
  if (formData.has("note")) payload.note = String(formData.get("note") || "").trim();
  try {
    const result = await api("/api/private/learning-progress", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    state.curriculum.learning = result.projection;
    if (state.curriculum.data) renderCurriculum();
    if (state.currentPaper && state.dossierTab === "overview") renderDossierContent();
    renderRadar();
    renderTerms();
    renderFrontierRadar();
    toast("学习状态已更新；下一步队列和先修缺口已重新计算");
  } catch (error) {
    toast(error.message, true);
  }
}

function applyDossierPaper(paper, resetTab = false) {
    state.currentPaper = paper;
    state.dossierFingerprint = JSON.stringify(paper);
    if (resetTab) state.dossierTab = "overview";
    el("dossierTitle").textContent = paper.title || "标题待补充";
    el("dossierAuthors").textContent = (paper.authors || []).join("、") || "作者信息待补充";
    el("dossierRef").textContent = paper.canonical_ref;
    el("dossierMeta").innerHTML = [displayDate(paper.published), paper.venue || "来源未标注", paper.current_version || "版本未标注"].map((item) => `<span>${escapeHtml(item)}</span>`).join("");
    el("dossierPaperfieldLink").href = paperfieldPaperUrl(paper);
    el("dossierPaperfieldLink").textContent = paper.paperfield_id ? "在 Paperfield 精读" : "导入到 Paperfield";
    el("dossierSourceLink").hidden = !paper.source_url;
    el("dossierSourceLink").href = paper.source_url || "#";
    const latest = paper.analysis_requests?.[0];
    el("dossierAnalyze").hidden = latest?.status === "completed";
    el("dossierAnalyze").disabled = Boolean(latest && (!latest.material?.source_url || latest.worker_lease?.claimed));
    el("dossierFlowloom").disabled = !paper.dossier;
    el("dossierFlowloom").title = paper.dossier
      ? "Send the located paper dossier to local Flowloom"
      : "Complete a deep dossier before sending semantic context";
    el("dossierAnalyze").textContent = latest ? "配置材料授权" : "加入深度分析";
    el("dossierExportJson").disabled = !paper.dossier;
    el("dossierExportMarkdown").disabled = !paper.dossier;
    const status = paper.dossier?.status === "completed"
      ? { label: paper.dossier.analysis_level === "abstract" ? "摘要档案已完成" : "全文档案已完成", className: "is-success" }
      : latest ? statusDetails(latest.status) : { label: "档案未生成", className: "" };
    el("dossierState").className = `state-label ${status.className}`;
    el("dossierState").textContent = status.label;
    updateDossierTabs(paper);
    if (resetTab) activateRovingTab(document.querySelector('[data-dossier-tab="overview"]'), "[data-dossier-tab]");
    renderDossierContent();
}

async function exportCurrentDossier(format) {
  const paper = state.currentPaper;
  if (!paper?.dossier) return;
  try {
    const payload = await api(`/api/papers/${encodeURIComponent(paper.id)}/dossier/export?format=${encodeURIComponent(format)}`);
    const safeName = String(paper.canonical_ref || `paper-${paper.id}`).replace(/[^A-Za-z0-9._-]+/g, "-");
    const content = format === "markdown" ? payload.content : JSON.stringify(payload, null, 2);
    const blob = new Blob([content], { type: format === "markdown" ? "text/markdown;charset=utf-8" : "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeName}-dossier.${format === "markdown" ? "md" : "json"}`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast(`论文档案已导出为 ${format === "markdown" ? "Markdown" : "JSON"}`);
  } catch (error) {
    toast(error.message, true);
  }
}

async function openDossier(paperId, updateUrl = true) {
  try {
    const paper = await api(`/api/papers/${encodeURIComponent(paperId)}/dossier`);
    applyDossierPaper(paper, true);
    showView("dossier", { item: paper, updateUrl });
  } catch (error) {
    toast(error.message, true);
  }
}

async function openProject(fullName, updateUrl = true) {
  try {
    const project = await api(`/api/projects/relations?repo=${encodeURIComponent(fullName)}`);
    state.currentProject = project;
    el("projectTitle").textContent = project.full_name;
    el("projectDescription").textContent = project.description || "项目简介待补充";
    el("projectMeta").innerHTML = [project.language || "语言未标注", project.license || "许可证未标注", project.source_updated_at ? `更新于 ${displayDate(project.source_updated_at)}` : "更新时间未知"].map((item) => `<span>${escapeHtml(item)}</span>`).join("");
    el("projectPaperfieldLink").href = paperfieldProjectUrl(project);
    el("projectGithubLink").href = project.url || `https://github.com/${project.full_name}`;
    showView("project", { item: project, updateUrl });
  } catch (error) {
    toast(error.message, true);
  }
}

function analysisRuntimeNote() {
  if (state.config?.worker_connected) return "执行器在线。只有两项授权同时开启，全文才会发送给已配置的外部模型 API。";
  if (state.config?.worker_configured) return "执行器已配置但当前没有心跳。授权可以先保存，worker 恢复后再处理。";
  return "执行器尚未配置。授权和任务会保留，但不会下载 PDF、调用模型或产生费用。";
}

function syncAnalysisPermissionControls() {
  const download = el("analysisAllowDownload");
  const external = el("analysisAllowExternal");
  const hasSource = Boolean(state.analysisTask?.material?.source_url || state.analysisPaper?.pdf_url);
  if (!download.checked) external.checked = false;
  external.disabled = !hasSource || !download.checked || Boolean(state.analysisTask?.worker_lease?.claimed);
}

function openAnalysisDialog(paper, task = null, trigger = null) {
  state.analysisPaper = paper;
  state.analysisTask = task;
  const existing = Boolean(task);
  el("analysisDialogTitle").textContent = existing ? "配置材料授权" : "加入深度分析";
  el("analysisPaperTitle").textContent = paper.title || "标题待补充";
  el("analysisScopeFieldset").hidden = existing;
  el("analysisForm").querySelectorAll('input[name="analysis-section"]').forEach((input) => {
    input.checked = existing ? (task.requested_sections || []).includes(input.value) : input.value !== "critique";
  });
  const material = task?.material;
  const sourceUrl = material?.source_url || paper.pdf_url || "";
  el("analysisSourceStatus").textContent = sourceUrl ? `公开 PDF：${sourceUrl}` : "当前论文没有可授权下载的公开 PDF URL";
  el("analysisAllowDownload").checked = Boolean(material?.download_authorized);
  el("analysisAllowExternal").checked = Boolean(material?.external_processing_authorized);
  el("analysisAllowDownload").disabled = !sourceUrl || ["downloaded", "parsing", "ready"].includes(material?.status) || Boolean(task?.worker_lease?.claimed);
  el("analysisSubmit").textContent = existing ? "保存授权" : "加入队列";
  el("analysisDialogNote").textContent = analysisRuntimeNote();
  syncAnalysisPermissionControls();
  openManagedDialog(el("analysisDialog"), trigger, () => el("analysisClose"));
}

async function submitAnalysis(event) {
  event.preventDefault();
  const paper = state.analysisPaper;
  if (!paper) return;
  const sections = [...el("analysisForm").querySelectorAll('input[name="analysis-section"]:checked')].map((input) => input.value);
  if (!state.analysisTask && !sections.length) {
    toast("至少选择一个分析范围", true);
    return;
  }
  const materialAuthorization = {
    allowPublicPdfDownload: el("analysisAllowDownload").checked,
    allowExternalModelProcessing: el("analysisAllowExternal").checked,
  };
  const button = el("analysisSubmit");
  button.disabled = true;
  button.textContent = state.analysisTask ? "正在保存" : "正在加入";
  try {
    let result;
    if (state.analysisTask) {
      result = await api(`/api/analysis-requests/${encodeURIComponent(state.analysisTask.id)}/material-authorization`, {
        method: "POST",
        body: JSON.stringify(materialAuthorization),
      });
    } else {
      result = await api("/api/analysis-requests", {
        method: "POST",
        body: JSON.stringify({ paper, sections, trigger: "explicit_button", sourceVersion: paper.current_version, materialAuthorization }),
      });
    }
    el("analysisDialog").close();
    toast(state.analysisTask ? "材料授权已保存" : result.reused ? "相同版本的分析任务已经存在" : "深度分析任务已加入队列");
    await loadBootstrap();
    await openDossier(paper.id, false);
  } catch (error) {
    toast(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = state.analysisTask ? "保存授权" : "加入队列";
  }
}

async function runTaskAction(taskId, action, stage = "") {
  try {
    await api(`/api/analysis-requests/${encodeURIComponent(taskId)}/${action}`, {
      method: "POST",
      body: JSON.stringify(stage ? { stage } : {}),
    });
    const labels = { pause: "任务已暂停", resume: "任务已恢复", cancel: "任务已取消", retry: stage ? "失败阶段已重新排队" : "任务已重新排队" };
    toast(labels[action] || "任务状态已更新");
    await loadBootstrap();
    if (state.activeView === "dossier" && state.currentPaper) await openDossier(state.currentPaper.id, false);
  } catch (error) {
    toast(error.message, true);
  }
}

function signalTermById(termId) {
  return (state.data?.terms || []).find((term) => Number(term.id) === Number(termId)) || null;
}

function signalDraftById(signalId) {
  return (state.data?.signal_drafts || []).find((signal) => String(signal.id) === String(signalId)) || null;
}

function signalForTerm(termId) {
  return (state.data?.signals || []).find((signal) => Number(signal.source_term_id) === Number(termId))
    || signalDraftById((state.data?.signal_drafts || []).find((signal) => Number(signal.source_term_id) === Number(termId))?.id)
    || null;
}

function storedEditorName() {
  try {
    return localStorage.getItem("research-atlas-editor-name") || "本地编辑";
  } catch {
    return "本地编辑";
  }
}

function setStoredEditorName(value) {
  try {
    localStorage.setItem("research-atlas-editor-name", value);
  } catch {
    // Private browsing may disallow local storage; the form still works.
  }
}

function signalFormValue(id, value) {
  const field = el(id);
  if (field) field.value = value == null ? "" : String(value);
}

function signalEvidencePickerMarkup(term, selectedIds = []) {
  const selected = new Set(selectedIds.map((id) => String(id)));
  const items = term?.evidence || [];
  if (!items.length) return `<p class="field-help is-danger">该术语当前没有可选择的论文语境。</p>`;
  return items.map((item, index) => {
    const paper = item.paper || {};
    const candidateId = String(item.candidate_id || "");
    const inputId = `signal-evidence-${term.id}-${candidateId || index}`;
    const reference = paper.canonical_ref || item.source_identifier || "";
    const link = reference ? paperfieldReferenceUrl(reference) : "";
    return `<div class="signal-evidence-option">
      <label for="${escapeHtml(inputId)}"><input id="${escapeHtml(inputId)}" type="checkbox" name="signal-evidence" value="${escapeHtml(candidateId)}" ${selected.has(candidateId) ? "checked" : ""}><span><strong>${escapeHtml(paper.title || reference || "论文标题待补充")}</strong><small>${escapeHtml(displayDate(item.source_updated_at || item.published_at))} / ${escapeHtml(item.extraction_rule === "explicit_acronym" ? "明确括号展开" : "论文命名语境")}</small><q>${escapeHtml(item.context_text || "来源语境待补充")}</q></span></label>
      ${link ? `<a class="text-action" href="${escapeHtml(link)}">Paperfield</a>` : ""}
    </div>`;
  }).join("");
}

function selectedSignalEvidenceIds() {
  return [...el("signalEvidenceList").querySelectorAll('input[name="signal-evidence"]:checked')]
    .map((input) => Number(input.value))
    .filter((value) => Number.isInteger(value) && value > 0);
}

function setSignalFormError(message, fieldIds = []) {
  const error = el("signalFormError");
  error.textContent = message || "";
  error.hidden = !message;
  el("signalForm").querySelectorAll("[aria-invalid]").forEach((field) => field.removeAttribute("aria-invalid"));
  fieldIds.forEach((id) => el(id)?.setAttribute("aria-invalid", "true"));
  if (fieldIds.length) el(fieldIds[0])?.focus({ preventScroll: true });
}

function signalFormPayload() {
  return {
    signalType: el("signalType").value,
    maturity: el("signalMaturity").value,
    title: el("signalTitle").value.trim(),
    changeSummary: el("signalChangeSummary").value.trim(),
    whyItMatters: el("signalWhyItMatters").value.trim(),
    knownUnknowns: el("signalKnownUnknowns").value.trim(),
    counterEvidence: el("signalCounterEvidence").value.trim(),
    evidenceCandidateIds: selectedSignalEvidenceIds(),
    editorName: el("signalEditorName").value.trim(),
    reviewReason: el("signalReviewReason").value.trim(),
  };
}

function validateSignalForm(action) {
  const payload = signalFormPayload();
  const invalid = [];
  if (action !== "retract") {
    if (!payload.title) invalid.push("signalTitle");
    if (payload.changeSummary.length < 20) invalid.push("signalChangeSummary");
    const term = state.signalEditor.term;
    const selected = new Set(payload.evidenceCandidateIds.map((id) => String(id)));
    const independent = new Set((term?.evidence || []).filter((item) => selected.has(String(item.candidate_id)) && item.paper?.id).map((item) => item.paper.id));
    if (independent.size < 2) {
      setSignalFormError("发布和保存草稿都至少需要选择两篇独立论文；当前选中的证据不足。", ["signalEvidenceList"]);
      return null;
    }
  }
  if (!payload.editorName) invalid.push("signalEditorName");
  if (["publish", "retract"].includes(action) && payload.reviewReason.length < 10) invalid.push("signalReviewReason");
  if (action === "publish") {
    if (payload.whyItMatters.length < 20) invalid.push("signalWhyItMatters");
    if (payload.knownUnknowns.length < 10) invalid.push("signalKnownUnknowns");
  }
  if (invalid.length) {
    const first = invalid[0];
    const message = first === "signalChangeSummary"
      ? "请补充至少 20 个字符的变化说明。"
      : first === "signalWhyItMatters"
        ? "发布前请补充至少 20 个字符的关注理由。"
        : first === "signalKnownUnknowns"
          ? "发布前请写清至少 10 个字符的未知项或反证边界。"
          : first === "signalReviewReason"
            ? "发布或撤回时需要至少 10 个字符的审核理由。"
            : "请补充必填的编辑字段。";
    setSignalFormError(message, invalid);
    return null;
  }
  setSignalFormError("");
  return payload;
}

function focusPublishedSignal(signalId) {
  showView("radar");
  window.requestAnimationFrame(() => {
    const target = document.getElementById(`signal-${CSS.escape(String(signalId))}`);
    target?.scrollIntoView({ behavior: globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    target?.querySelector("h3")?.focus({ preventScroll: true });
  });
}

function openSignalEditor(signal, term, trigger = null, mode = "edit") {
  if (!term) {
    toast("找不到该术语的证据上下文", true);
    return;
  }
  state.signalEditor = { mode, signal, term, trigger };
  const dialog = el("signalDialog");
  const isRetract = mode === "retract";
  const isCreate = !signal;
  el("signalDialogTitle").textContent = isRetract ? "撤回研究变化" : isCreate ? "起草研究变化" : "审核研究变化草稿";
  el("signalDialogSubtitle").textContent = isRetract
    ? "撤回会保留在修订历史中，并从公开前沿雷达移除。"
    : "自动扫描只提供术语证据；保存后仍是草稿，必须显式发布才会进入前沿雷达。";
  el("signalSourceTerm").textContent = `来源术语：${term.display_term || "术语待补充"} / ${term.independent_paper_count || 0} 篇独立论文 / 编辑接口：本机或授权账号`;
  ["signalContentFieldset", "signalEvidenceFieldset"].forEach((id) => { el(id).hidden = isRetract; });
  signalFormValue("signalType", signal?.signal_type || "terminology_shift");
  signalFormValue("signalMaturity", signal?.maturity || "candidate");
  signalFormValue("signalTitle", signal?.title || `${term.display_term || "术语"}：跨论文命名证据`);
  signalFormValue("signalChangeSummary", signal?.change_summary || `Atlas 在 ${term.independent_paper_count || 0} 篇候选论文中发现“${term.display_term || "该术语"}”的重复命名语境；这只说明当前语料中出现了跨论文使用，尚不证明形成学界共识。`);
  signalFormValue("signalWhyItMatters", signal?.why_it_matters || "");
  signalFormValue("signalKnownUnknowns", signal?.known_unknowns || "");
  signalFormValue("signalCounterEvidence", signal?.counter_evidence || "");
  signalFormValue("signalEditorName", signal?.editor_name || storedEditorName());
  signalFormValue("signalReviewReason", isRetract ? "" : signal?.review_reason || "");
  const selectedIds = signal ? (signal.evidence || []).map((item) => item.candidate_id) : (term.evidence || []).map((item) => item.candidate_id);
  el("signalEvidenceList").innerHTML = signalEvidencePickerMarkup(term, selectedIds);
  const independentSelected = new Set((term.evidence || []).filter((item) => selectedIds.includes(item.candidate_id) && item.paper?.id).map((item) => item.paper.id));
  el("signalEvidenceCount").textContent = `${independentSelected.size} / 至少 2 篇独立论文`;
  el("signalSave").hidden = false;
  el("signalPublish").hidden = isRetract;
  el("signalSave").dataset.signalSubmit = isRetract ? "retract" : "save";
  el("signalSave").textContent = isRetract ? "确认撤回" : "保存草稿";
  el("signalPublish").textContent = isCreate ? "保存并发布" : "保存并发布";
  el("signalDialogNote").textContent = isRetract
    ? "撤回只允许本机或授权编辑账号操作；修订历史不会被删除。"
    : "编辑接口仅接受本机或授权编辑账号。保存草稿不会改变公开雷达。发布后来源术语会标记为已提升。";
  setSignalFormError("");
  dialog.showModal();
  window.requestAnimationFrame(() => (isRetract ? el("signalEditorName") : el("signalTitle"))?.focus({ preventScroll: true }));
}

function closeSignalEditor() {
  const dialog = el("signalDialog");
  if (dialog.open) dialog.close();
  const trigger = state.signalEditor.trigger;
  state.signalEditor = { mode: "create", signal: null, term: null, trigger: null };
  if (trigger?.isConnected) trigger.focus({ preventScroll: true });
}

function openSignalEditorForTerm(termId, trigger = null) {
  const term = signalTermById(termId);
  if (!term) {
    toast("术语证据尚未加载", true);
    return;
  }
  const existing = (state.data?.signal_drafts || []).find((signal) => Number(signal.source_term_id) === Number(termId)) || null;
  openSignalEditor(existing, term, trigger, "edit");
}

function openSignalEditorForSignal(signalId, trigger = null, mode = "edit") {
  const signal = signalDraftById(signalId) || (state.data?.signals || []).find((item) => String(item.id) === String(signalId));
  const term = signalTermById(signal?.source_term_id);
  if (!signal || !term) {
    toast("研究变化草稿或其来源术语不存在", true);
    return;
  }
  openSignalEditor(signal, term, trigger, mode);
}

function updateSignalEvidenceCount() {
  const term = state.signalEditor.term;
  const selectedIds = new Set(selectedSignalEvidenceIds().map((id) => String(id)));
  const independent = new Set((term?.evidence || []).filter((item) => selectedIds.has(String(item.candidate_id)) && item.paper?.id).map((item) => item.paper.id));
  el("signalEvidenceCount").textContent = `${independent.size} / 至少 2 篇独立论文`;
}

async function submitSignal(event) {
  event.preventDefault();
  const action = event.submitter?.dataset.signalSubmit || "save";
  const payload = validateSignalForm(action);
  if (!payload) return;
  const buttons = [el("signalSave"), el("signalPublish")];
  buttons.forEach((button) => { button.disabled = true; });
  try {
    setStoredEditorName(payload.editorName);
    if (action === "retract") {
      await api(`/api/editor/signals/${encodeURIComponent(state.signalEditor.signal.id)}/retract`, {
        method: "POST",
        body: JSON.stringify({ editorName: payload.editorName, reviewReason: payload.reviewReason }),
      });
      closeSignalEditor();
      toast("研究变化已撤回，并保留修订历史");
      await loadBootstrap();
      return;
    }
    let signal;
    const body = { ...payload };
    if (state.signalEditor.signal) {
      signal = await api(`/api/editor/signals/${encodeURIComponent(state.signalEditor.signal.id)}`, { method: "POST", body: JSON.stringify(body) });
    } else {
      signal = await api("/api/editor/signals", { method: "POST", body: JSON.stringify({ sourceTermId: state.signalEditor.term.id, ...body }) });
    }
    if (action === "publish") {
      signal = await api(`/api/editor/signals/${encodeURIComponent(signal.id)}/publish`, {
        method: "POST",
        body: JSON.stringify({ editorName: payload.editorName, reviewReason: payload.reviewReason }),
      });
    }
    const published = action === "publish";
    closeSignalEditor();
    toast(published ? "研究变化已显式发布到前沿雷达" : "研究变化草稿已保存");
    await loadBootstrap();
    if (published) focusPublishedSignal(signal.id);
  } catch (error) {
    setSignalFormError(error.message || "研究变化保存失败");
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
}

const editorBatchKindLabels = {
  l1_structure: "L1 批量结构化",
  l2_anchor: "L2 锚点扩展",
  coverage_scan: "覆盖缺口扫描",
  recompute: "实体批量重算",
};

const editorEntityKindLabels = {
  paper: "论文",
  project: "项目",
  term: "术语",
  method: "方法",
  problem: "问题",
  thread: "研究线程",
};

const editorRelationTypeLabels = {
  extends: "扩展",
  uses: "使用",
  compares: "比较",
  replicates: "复现",
  contradicts: "反驳",
  qualifies: "限定",
  surveys: "综述",
  implements: "实现",
  related_to: "相关",
};

const editorAuditActionLabels = {
  batch_created: "创建批量作业",
  batch_previewed: "生成批量预览",
  batch_applied: "应用批量作业",
  batch_paused: "暂停批量作业",
  batch_resumed: "恢复批量作业",
  batch_cancelled: "取消批量作业",
  batch_retried: "重试批量作业",
  batch_item_approved: "批准批量候选",
  batch_item_rejected: "拒绝批量候选",
  entity_created: "创建实体",
  entity_updated: "修正实体",
  entity_merged: "合并实体",
  alias_added: "增加别名",
  relationship_created: "创建关系",
  relationship_updated: "修正关系",
  relationship_retired: "停用关系",
  coverage_recomputed: "重算覆盖缺口",
};

function editorBatchStatusDetails(status) {
  return {
    queued: { label: "待预览", className: "is-warning" },
    previewing: { label: "正在生成预览", className: "is-primary" },
    previewed: { label: "等待审核", className: "is-primary" },
    running: { label: "正在应用", className: "is-primary" },
    paused: { label: "已暂停", className: "is-warning" },
    partial: { label: "部分完成", className: "is-warning" },
    completed: { label: "已完成", className: "is-success" },
    failed: { label: "失败", className: "is-danger" },
    cancelled: { label: "已取消", className: "is-danger" },
  }[status] || { label: status || "状态未知", className: "" };
}

function editorItemStatusDetails(status) {
  return {
    pending: { label: "等待预览", className: "is-warning" },
    running: { label: "处理中", className: "is-primary" },
    proposed: { label: "待决策", className: "is-primary" },
    approved: { label: "已批准", className: "is-success" },
    rejected: { label: "已拒绝", className: "is-danger" },
    completed: { label: "已应用", className: "is-success" },
    failed: { label: "失败", className: "is-danger" },
    skipped: { label: "已跳过", className: "is-warning" },
  }[status] || { label: status || "状态未知", className: "" };
}

function editorEntityStatusDetails(status) {
  return {
    candidate: { label: "候选", className: "is-warning" },
    active: { label: "已审核", className: "is-success" },
    merged: { label: "已合并", className: "is-primary" },
    retired: { label: "已停用", className: "is-danger" },
    rejected: { label: "已拒绝", className: "is-danger" },
  }[status] || { label: status || "状态未知", className: "" };
}

function editorOperator() {
  return el("editorOperator")?.value.trim() || storedEditorName();
}

function editorPayloadList(payload, key) {
  if (Array.isArray(payload)) return payload;
  for (const candidate of [key, `${key}s`, "gaps", "events", "items"]) {
    if (Array.isArray(payload?.[candidate])) return payload[candidate];
  }
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

function editorSetStatus(message = "", error = false) {
  const target = el("editorWorkspaceStatus");
  if (!target) return;
  target.hidden = !message;
  target.classList.toggle("is-error", Boolean(error));
  target.textContent = message;
}

function editorJson(value, maximum = 12000) {
  let output;
  if (typeof value === "string") output = value;
  else {
    try {
      output = JSON.stringify(value ?? null, null, 2);
    } catch {
      output = String(value ?? "");
    }
  }
  if (output.length > maximum) return `${output.slice(0, maximum)}\n... 内容已截断`;
  return output;
}

function editorDuration(value) {
  const milliseconds = Number(value || 0);
  if (!milliseconds) return "0 ms";
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;
  if (milliseconds < 60000) return `${(milliseconds / 1000).toFixed(1)} s`;
  return `${(milliseconds / 60000).toFixed(1)} min`;
}

function editorNumber(value, digits = 1) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toLocaleString("zh-CN", { maximumFractionDigits: digits }) : "0";
}

function editorReasonValue(id, fallback = "") {
  const input = el(id);
  const reason = input?.value.trim() || fallback.trim();
  if (reason.length >= 10) return reason;
  if (input) {
    input.setAttribute("aria-invalid", "true");
    input.focus({ preventScroll: true });
  }
  toast("操作理由至少需要 10 个字符", true);
  return "";
}

function activateEditorTab(tab, { focus = true } = {}) {
  const button = document.querySelector(`[data-editor-tab="${CSS.escape(tab)}"]`);
  const panel = document.querySelector(`[data-editor-panel="${CSS.escape(tab)}"]`);
  if (!button || !panel) return;
  state.editor.activeTab = tab;
  activateRovingTab(button, "[data-editor-tab]");
  document.querySelectorAll("[data-editor-panel]").forEach((candidate) => { candidate.hidden = candidate !== panel; });
  if (focus) panel.focus({ preventScroll: true });
}

function editorBatchMetrics(batch) {
  const source = batch?.metrics || {};
  return {
    total: Number(source.total ?? batch?.total_items ?? 0),
    pending: Number(source.pending ?? batch?.pending_items ?? 0),
    proposed: Number(source.proposed ?? batch?.proposed_items ?? 0),
    completed: Number(source.completed ?? batch?.completed_items ?? 0),
    failed: Number(source.failed ?? batch?.failed_items ?? 0),
    rejected: Number(source.rejected ?? batch?.rejected_items ?? 0),
    estimatedWork: Number(source.estimated_work ?? batch?.estimated_work ?? 0),
    actualWork: Number(source.actual_work ?? batch?.actual_work ?? 0),
    durationMs: Number(source.duration_ms ?? batch?.duration_ms ?? 0),
  };
}

function renderEditorMetrics() {
  const batches = state.editor.batches;
  const active = batches.filter((batch) => ["queued", "previewing", "previewed", "running", "paused", "partial"].includes(batch.status));
  const totals = batches.reduce((result, batch) => {
    const metrics = editorBatchMetrics(batch);
    result.total += metrics.total;
    result.failed += metrics.failed;
    result.proposed += metrics.proposed;
    result.work += metrics.actualWork || metrics.estimatedWork;
    return result;
  }, { total: 0, failed: 0, proposed: 0, work: 0 });
  const openGaps = state.editor.coverage.filter((gap) => gap.status === "open").length;
  const failureRate = totals.total ? `${((totals.failed / totals.total) * 100).toFixed(1)}%` : "0%";
  el("editorActiveBatchCount").textContent = active.length;
  el("editorReviewItemCount").textContent = totals.proposed;
  el("editorCoverageGapCount").textContent = openGaps;
  el("editorFailureRate").textContent = failureRate;
  el("editorWorkUnits").textContent = editorNumber(totals.work);
  el("navEditorCount").textContent = active.length || openGaps || 0;
}

function editorBatchRowMarkup(batch) {
  const status = editorBatchStatusDetails(batch.status);
  const metrics = editorBatchMetrics(batch);
  const selected = String(batch.id) === String(state.editor.selectedBatchId);
  return `<button class="editor-list-row${selected ? " is-selected" : ""}" type="button" data-editor-batch-id="${escapeHtml(batch.id)}" aria-pressed="${String(selected)}">
    <span class="editor-list-row-head"><strong>${escapeHtml(editorBatchKindLabels[batch.batch_kind] || batch.batch_kind || "批量作业")}</strong><span class="state-label ${status.className}">${escapeHtml(status.label)}</span></span>
    <span class="editor-row-meta"><span>${escapeHtml(displayDate(batch.updated_at || batch.created_at))}</span><span>${escapeHtml(metrics.completed)} / ${escapeHtml(metrics.total)} 完成</span><span>${escapeHtml(metrics.proposed)} 待审核</span></span>
    <small>${escapeHtml(batch.requested_by || "编辑者未记录")} / ${escapeHtml(shortId(batch.id))}</small>
  </button>`;
}

function editorBatchActionsMarkup(batch) {
  const actions = [];
  if (["queued", "partial", "failed"].includes(batch.status)) actions.push(["preview", "生成差异预览", "button-primary"]);
  if (["previewed", "partial"].includes(batch.status)) actions.push(["apply", "应用已批准项", "button-primary"]);
  if (["queued", "previewing", "previewed", "running", "partial"].includes(batch.status)) actions.push(["pause", "暂停", "button-secondary"]);
  if (batch.status === "paused") actions.push(["resume", "恢复", "button-primary"]);
  // Cancelled batches are terminal by design; only failed/partial batches expose retry.
  if (["failed", "partial"].includes(batch.status)) actions.push(["retry", "重试失败项", "button-secondary"]);
  if (["queued", "previewing", "previewed", "running", "paused", "partial", "failed"].includes(batch.status)) actions.push(["cancel", "取消作业", "button-danger"]);
  return actions.map(([action, label, className]) => `<button class="button ${className}" type="button" data-editor-batch-action="${action}" data-batch-id="${escapeHtml(batch.id)}">${label}</button>`).join("");
}

function editorDiffMarkup(diff = []) {
  if (!Array.isArray(diff) || !diff.length) return `<p class="term-action-note">当前项尚无字段变化，或预览仍未生成。</p>`;
  return `<div class="editor-diff-list">${diff.map((change) => `<div class="editor-diff">
    <strong>${escapeHtml(change.path || "$")}</strong>
    <div class="editor-diff-values"><div class="editor-diff-value"><span>当前值</span><pre>${escapeHtml(editorJson(change.before))}</pre></div><div class="editor-diff-value is-after"><span>建议值</span><pre>${escapeHtml(editorJson(change.after))}</pre></div></div>
  </div>`).join("")}</div>`;
}

function editorBatchItemMarkup(item) {
  const status = editorItemStatusDetails(item.status);
  const canDecide = ["proposed", "approved"].includes(item.status);
  return `<article class="editor-batch-item">
    <header><div><h4>${escapeHtml(item.item_kind || "item")} / ${escapeHtml(item.item_ref || shortId(item.id))}</h4><p>attempt ${escapeHtml(item.attempt || 1)} / ${escapeHtml(editorNumber(item.actual_work ?? item.estimated_work ?? 0))} work units</p></div><span class="state-label ${status.className}">${escapeHtml(status.label)}</span></header>
    ${item.error_text ? `<p class="term-action-note">错误：${escapeHtml(item.error_text)}</p>` : ""}
    ${editorDiffMarkup(item.diff)}
    ${canDecide ? `<div class="editor-item-actions">${item.status !== "approved" ? `<button class="button button-primary" type="button" data-editor-item-action="approve" data-batch-id="${escapeHtml(item.batch_id)}" data-item-id="${escapeHtml(item.id)}">批准候选</button>` : ""}<button class="button button-danger" type="button" data-editor-item-action="reject" data-batch-id="${escapeHtml(item.batch_id)}" data-item-id="${escapeHtml(item.id)}">拒绝候选</button></div>` : ""}
  </article>`;
}

function renderEditorBatchDetail() {
  const batch = state.editor.selectedBatch;
  if (!batch) {
    el("editorBatchDetail").innerHTML = `<div class="empty-state is-compact"><strong>选择一个作业</strong><p>查看指标、逐项差异和审核动作。</p></div>`;
    return;
  }
  const status = editorBatchStatusDetails(batch.status);
  const metrics = editorBatchMetrics(batch);
  const items = Array.isArray(batch.items) ? batch.items : [];
  el("editorBatchDetail").innerHTML = `<div class="editor-detail-header">
    <div><div><h3>${escapeHtml(editorBatchKindLabels[batch.batch_kind] || batch.batch_kind)}</h3><p>${escapeHtml(batch.reason || "未记录作业理由")}</p></div><span class="state-label ${status.className}">${escapeHtml(status.label)}</span></div>
    <div class="editor-detail-actions">${editorBatchActionsMarkup(batch)}</div>
  </div>
  <dl class="editor-metrics"><div><dt>总条目</dt><dd>${escapeHtml(metrics.total)}</dd></div><div><dt>待预览</dt><dd>${escapeHtml(metrics.pending)}</dd></div><div><dt>待审核/批准</dt><dd>${escapeHtml(metrics.proposed)}</dd></div><div><dt>完成/失败</dt><dd>${escapeHtml(metrics.completed)} / ${escapeHtml(metrics.failed)}</dd></div><div><dt>成本单位</dt><dd>${escapeHtml(editorNumber(metrics.actualWork))} / 估算 ${escapeHtml(editorNumber(metrics.estimatedWork))}</dd></div><div><dt>耗时</dt><dd>${escapeHtml(editorDuration(metrics.durationMs))}</dd></div><div><dt>模型</dt><dd>${escapeHtml(batch.model || "未使用")}</dd></div><div><dt>提示版本</dt><dd>${escapeHtml(batch.prompt_version || "未记录")}</dd></div></dl>
  <div class="editor-decision-box"><label for="editorBatchDecisionReason">本次审核理由<textarea id="editorBatchDecisionReason" rows="3" minlength="10" maxlength="4000">${escapeHtml(batch.reason || "")}</textarea></label></div>
  <div class="editor-subheading"><h3>逐项差异</h3><span class="section-count">${escapeHtml(items.length)} 项</span></div>
  <div class="editor-batch-items">${items.length ? items.map(editorBatchItemMarkup).join("") : `<div class="empty-state is-compact"><strong>作业没有条目</strong><p>当前范围内没有可处理对象。</p></div>`}</div>`;
}

function renderEditorBatches() {
  const batches = state.editor.batches;
  el("editorBatchResultCount").textContent = `${batches.length} 个作业`;
  el("editorBatchList").innerHTML = batches.map(editorBatchRowMarkup).join("");
  el("editorBatchEmpty").hidden = batches.length > 0;
  renderEditorBatchDetail();
  renderEditorMetrics();
}

function editorEntityRowMarkup(entity) {
  const status = editorEntityStatusDetails(entity.status);
  const selected = String(entity.id) === String(state.editor.selectedEntityId);
  return `<button class="editor-list-row${selected ? " is-selected" : ""}" type="button" data-editor-entity-id="${escapeHtml(entity.id)}" aria-pressed="${String(selected)}">
    <span class="editor-list-row-head"><strong>${escapeHtml(entity.canonical_name || "未命名实体")}</strong><span class="state-label ${status.className}">${escapeHtml(status.label)}</span></span>
    <span class="editor-row-meta"><span>${escapeHtml(editorEntityKindLabels[entity.entity_kind] || entity.entity_kind)}</span><span>${escapeHtml((entity.aliases || []).length)} 个别名</span><span>${escapeHtml(entity.relationship_count || 0)} 条关系</span></span>
    <small>rev ${escapeHtml(entity.revision || 1)} / ${escapeHtml(shortId(entity.id))}</small>
  </button>`;
}

function editorEntityOptions(selectedId = "", { kind = "", excludeId = "" } = {}) {
  const entities = state.editor.entities.filter((entity) => entity.status !== "merged" && (!kind || entity.entity_kind === kind) && String(entity.id) !== String(excludeId));
  return `<option value="">选择实体</option>${entities.map((entity) => `<option value="${escapeHtml(entity.id)}"${String(entity.id) === String(selectedId) ? " selected" : ""}>${escapeHtml(editorEntityKindLabels[entity.entity_kind] || entity.entity_kind)} / ${escapeHtml(entity.canonical_name)}</option>`).join("")}`;
}

function renderEditorEntityDetail() {
  const entity = state.editor.selectedEntity;
  if (!entity) {
    el("editorEntityDetail").innerHTML = `<div class="empty-state is-compact"><strong>选择一个实体</strong><p>查看别名、关系数量和合并操作。</p></div>`;
    return;
  }
  const status = editorEntityStatusDetails(entity.status);
  const aliases = Array.isArray(entity.aliases) ? entity.aliases : [];
  const relations = Array.isArray(entity.relationships) ? entity.relationships : [];
  const mergeCandidates = state.editor.entities.filter((item) => item.entity_kind === entity.entity_kind && item.status !== "merged" && String(item.id) !== String(entity.id));
  const mergeOptions = editorEntityOptions("", { kind: entity.entity_kind, excludeId: entity.id });
  const editable = entity.status !== "merged";
  el("editorEntityDetail").innerHTML = `<div class="editor-detail-header"><div><div><h3>${escapeHtml(entity.canonical_name || "未命名实体")}</h3><p>${escapeHtml(editorEntityKindLabels[entity.entity_kind] || entity.entity_kind)} / rev ${escapeHtml(entity.revision || 1)} / ${escapeHtml(entity.id)}</p></div><span class="state-label ${status.className}">${escapeHtml(status.label)}</span></div></div>
    <div class="editor-detail-section"><h4>定义与来源</h4><p>${escapeHtml(entity.description || "尚未补充定义。")}</p><div class="editor-row-meta"><span>${escapeHtml(entity.source_kind || "来源未记录")}</span><span>${escapeHtml(entity.source_ref || "ref 未记录")}</span><span>${escapeHtml(entity.reviewed_at ? `审核于 ${displayDate(entity.reviewed_at)}` : "尚未审核")}</span></div></div>
    <div class="editor-detail-section"><h4>别名</h4>${aliases.length ? `<ul class="editor-alias-list">${aliases.map((alias) => `<li>${escapeHtml(alias.alias)}</li>`).join("")}</ul>` : `<p>尚无别名。</p>`}</div>
    <div class="editor-detail-section"><h4>关系</h4><p>${escapeHtml(entity.relationship_count || relations.length || 0)} 条关联关系。${relations.length ? ` 已载入 ${relations.length} 条详细记录。` : ""}</p></div>
    ${editable ? `<form class="editor-detail-form" data-editor-entity-update-form data-entity-id="${escapeHtml(entity.id)}">
      <h4>修正实体</h4>
      <label class="field-label">规范名称<input name="canonicalName" type="text" maxlength="500" value="${escapeHtml(entity.canonical_name || "")}" required></label>
      <label class="field-label">定义或描述<textarea name="description" rows="4" maxlength="12000">${escapeHtml(entity.description || "")}</textarea></label>
      <label class="field-label">状态<select name="status"><option value="candidate"${entity.status === "candidate" ? " selected" : ""}>候选</option><option value="active"${entity.status === "active" ? " selected" : ""}>已审核/启用</option><option value="retired"${entity.status === "retired" ? " selected" : ""}>已停用</option></select></label>
      <label class="field-label">修正理由<textarea name="reason" rows="2" minlength="10" maxlength="4000" required></textarea></label>
      <div class="editor-form-actions"><button class="button button-primary" type="submit">保存修正</button></div>
    </form>
    <form class="editor-detail-form" data-editor-alias-form data-entity-id="${escapeHtml(entity.id)}">
      <h4>增加别名</h4>
      <label class="field-label">别名<input name="alias" type="text" maxlength="500" required></label>
      <label class="field-label">来源标识<input name="sourceRef" type="text" maxlength="500"></label>
      <label class="field-label">操作理由<textarea name="reason" rows="2" minlength="10" maxlength="4000" required></textarea></label>
      <div class="editor-form-actions"><button class="button button-secondary" type="submit">增加别名</button></div>
    </form>
    <form class="editor-detail-form" data-editor-merge-form data-entity-id="${escapeHtml(entity.id)}">
      <h4>合并到保留实体</h4>
      <label class="field-label">保留实体<select name="targetEntityId" required>${mergeOptions}</select></label>
      <label class="field-label">合并理由<textarea name="reason" rows="2" minlength="10" maxlength="4000" required></textarea></label>
      <label class="editor-check"><input name="confirmMerge" type="checkbox" required><span><strong>确认迁移别名与关系</strong><small>来源实体会标记为已合并，重合关系会停用。</small></span></label>
      <div class="editor-form-actions"><button class="button button-danger" type="submit"${mergeCandidates.length ? "" : " disabled"}>合并实体</button></div>
    </form>` : `<div class="system-notice is-primary"><div><span class="state-label is-primary">只读</span><h2>该实体已合并</h2><p>保留实体 ID：${escapeHtml(entity.merged_into_id || "未记录")}</p></div></div>`}`;
}

function renderEditorEntities() {
  const entities = state.editor.entities;
  el("editorEntityResultCount").textContent = `${entities.length} 个实体`;
  el("editorEntityList").innerHTML = entities.map(editorEntityRowMarkup).join("");
  el("editorEntityEmpty").hidden = entities.length > 0;
  renderEditorEntityDetail();
  renderEditorRelationshipOptions();
}

function renderEditorRelationshipOptions() {
  const from = el("editorRelationFrom");
  const to = el("editorRelationTo");
  if (!from || !to) return;
  const fromValue = from.value;
  const toValue = to.value;
  from.innerHTML = editorEntityOptions(fromValue);
  to.innerHTML = editorEntityOptions(toValue);
}

function editorRelationshipRowMarkup(relationship) {
  const status = editorEntityStatusDetails(relationship.status);
  const from = relationship.from_entity?.canonical_name || relationship.from_entity_id || "来源实体缺失";
  const to = relationship.to_entity?.canonical_name || relationship.to_entity_id || "目标实体缺失";
  const evidence = Array.isArray(relationship.evidence) ? relationship.evidence : [];
  return `<article class="editor-relationship-row"><div class="editor-relationship-copy"><strong>${escapeHtml(from)} <span aria-hidden="true">→</span> ${escapeHtml(editorRelationTypeLabels[relationship.relation_type] || relationship.relation_type)} <span aria-hidden="true">→</span> ${escapeHtml(to)}</strong>${evidence[0]?.quote ? `<span>“${escapeHtml(textSnippet(evidence[0].quote, 260))}”</span>` : ""}<small>rev ${escapeHtml(relationship.revision || 1)} / ${escapeHtml(relationship.source_ref || "来源未记录")} / ${escapeHtml(shortId(relationship.id))}</small></div><div class="editor-detail-actions"><span class="state-label ${status.className}">${escapeHtml(status.label)}</span><button class="button button-secondary" type="button" data-editor-relationship-edit-id="${escapeHtml(relationship.id)}">修正</button></div></article>`;
}

function renderEditorRelationships() {
  const relationships = state.editor.relationships;
  el("editorRelationshipResultCount").textContent = `${relationships.length} 条关系`;
  el("editorRelationshipList").innerHTML = relationships.map(editorRelationshipRowMarkup).join("");
  el("editorRelationshipEmpty").hidden = relationships.length > 0;
  renderEditorRelationshipOptions();
}

function coverageSeverityDetails(severity) {
  return {
    high: { label: "高优先级", className: "is-danger" },
    medium: { label: "中优先级", className: "is-warning" },
    low: { label: "低优先级", className: "is-success" },
  }[severity] || { label: severity || "未分级", className: "" };
}

function editorCoverageMarkup(gap) {
  const severity = coverageSeverityDetails(gap.severity);
  const metrics = gap.metrics && typeof gap.metrics === "object" ? gap.metrics : {};
  return `<article class="coverage-gap-row"><header><div><h3>${escapeHtml(gap.label || `${gap.domain} / ${gap.layer}`)}</h3><p>${escapeHtml(gap.description || "缺口说明待补充")}</p></div><span class="state-label ${gap.status === "resolved" ? "is-success" : severity.className}">${escapeHtml(gap.status === "resolved" ? "已覆盖" : severity.label)}</span></header><div class="coverage-metrics"><span>${escapeHtml(gap.domain || "未分域")}</span><span>${escapeHtml(gap.layer || "层级未记录")}</span>${Object.entries(metrics).map(([key, value]) => `<span>${escapeHtml(key)} ${escapeHtml(editorNumber(value, 0))}</span>`).join("")}<span>${escapeHtml(displayDate(gap.updated_at))}</span></div></article>`;
}

function renderEditorCoverage() {
  const coverage = state.editor.coverage;
  el("editorCoverageResultCount").textContent = `${coverage.length} 个缺口`;
  el("editorCoverageList").innerHTML = coverage.map(editorCoverageMarkup).join("");
  el("editorCoverageEmpty").hidden = coverage.length > 0;
  renderEditorMetrics();
}

function editorAuditMarkup(event) {
  const action = editorAuditActionLabels[event.action] || event.action || "编辑操作";
  const identifier = event.entity_id || event.batch_id || "未记录对象";
  return `<article class="audit-row"><header><div><h3>${escapeHtml(action)}</h3><p>${escapeHtml(event.reason || "未记录操作理由")}</p></div><span>${escapeHtml(displayDate(event.created_at))}</span></header><div class="audit-meta"><span>${escapeHtml(event.actor || "操作者未记录")}</span><span>${escapeHtml(event.entity_kind || "object")} ${escapeHtml(shortId(identifier))}</span>${event.model ? `<span>${escapeHtml(event.model)}</span>` : ""}${event.prompt_version ? `<span>prompt ${escapeHtml(event.prompt_version)}</span>` : ""}${Number(event.work_units || 0) ? `<span>${escapeHtml(editorNumber(event.work_units))} work units</span>` : ""}</div><details><summary>查看前后快照</summary><div class="audit-snapshots"><div><span class="sr-only">操作前</span><pre>${escapeHtml(editorJson(event.before))}</pre></div><div><span class="sr-only">操作后</span><pre>${escapeHtml(editorJson(event.after))}</pre></div></div></details></article>`;
}

function renderEditorAudit() {
  const audit = state.editor.audit;
  el("editorAuditList").innerHTML = audit.map(editorAuditMarkup).join("");
  el("editorAuditEmpty").hidden = audit.length > 0;
}

function renderEditorAll() {
  renderEditorBatches();
  renderEditorEntities();
  renderEditorRelationships();
  renderEditorCoverage();
  renderEditorAudit();
}

function editorObject(payload, key) {
  if (payload && typeof payload === "object" && !Array.isArray(payload) && payload[key] && typeof payload[key] === "object") return payload[key];
  return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : null;
}

async function loadEditorBatches({ preserveDetail = true } = {}) {
  const payload = await api("/api/editor/batches?limit=100");
  state.editor.batches = editorPayloadList(payload, "batches");
  if (preserveDetail && state.editor.selectedBatchId) {
    try {
      const detail = await api(`/api/editor/batches/${encodeURIComponent(state.editor.selectedBatchId)}`);
      state.editor.selectedBatch = editorObject(detail, "batch");
    } catch {
      state.editor.selectedBatchId = "";
      state.editor.selectedBatch = null;
    }
  }
  renderEditorBatches();
}

async function loadEditorEntities({ query = "", kind = "", preserveDetail = true } = {}) {
  const parameters = new URLSearchParams({ limit: "250" });
  if (query) parameters.set("query", query);
  if (kind) parameters.set("kind", kind);
  const payload = await api(`/api/editor/entities?${parameters}`);
  state.editor.entities = editorPayloadList(payload, "entities");
  if (preserveDetail && state.editor.selectedEntityId) {
    try {
      const detail = await api(`/api/editor/entities/${encodeURIComponent(state.editor.selectedEntityId)}`);
      state.editor.selectedEntity = editorObject(detail, "entity");
    } catch {
      state.editor.selectedEntityId = "";
      state.editor.selectedEntity = null;
    }
  }
  renderEditorEntities();
}

async function loadEditorRelationships() {
  const payload = await api("/api/editor/relationships?limit=250");
  state.editor.relationships = editorPayloadList(payload, "relationships");
  renderEditorRelationships();
}

async function loadEditorCoverage() {
  const payload = await api("/api/editor/coverage");
  state.editor.coverage = editorPayloadList(payload, "coverage");
  renderEditorCoverage();
}

async function loadEditorAudit() {
  const payload = await api("/api/editor/audit?limit=200");
  state.editor.audit = editorPayloadList(payload, "audit");
  renderEditorAudit();
}

async function loadEditorWorkspace(force = false) {
  if (state.editor.loading || (state.editor.loaded && !force)) return;
  state.editor.loading = true;
  editorSetStatus("正在载入受控编辑数据...");
  const requests = [
    ["批量作业", () => loadEditorBatches()],
    ["知识实体", () => loadEditorEntities()],
    ["实体关系", () => loadEditorRelationships()],
    ["覆盖缺口", () => loadEditorCoverage()],
    ["审计记录", () => loadEditorAudit()],
  ];
  const results = await Promise.allSettled(requests.map(([, request]) => request()));
  const failures = results.map((result, index) => result.status === "rejected" ? `${requests[index][0]}：${result.reason?.message || "请求失败"}` : "").filter(Boolean);
  state.editor.loaded = results.some((result) => result.status === "fulfilled");
  state.editor.loading = false;
  if (failures.length) editorSetStatus(`部分编辑数据未载入。${failures.join("；")}`, true);
  else editorSetStatus("");
  renderEditorMetrics();
}

async function selectEditorBatch(batchId) {
  state.editor.selectedBatchId = String(batchId);
  state.editor.selectedBatch = state.editor.batches.find((batch) => String(batch.id) === String(batchId)) || null;
  renderEditorBatches();
  editorSetStatus("正在载入作业差异...");
  try {
    const payload = await api(`/api/editor/batches/${encodeURIComponent(batchId)}`);
    state.editor.selectedBatch = editorObject(payload, "batch");
    editorSetStatus("");
    renderEditorBatches();
  } catch (error) {
    editorSetStatus(error.message, true);
  }
}

async function submitEditorBatch(event) {
  event.preventDefault();
  const reason = editorReasonValue("editorBatchReason");
  if (!reason) return;
  const kind = el("editorBatchKind").value;
  const limit = Math.max(1, Math.min(500, Number(el("editorBatchLimit").value || 50)));
  const targets = el("editorBatchTargets").value.split(/[\n,，]+/).map((value) => value.trim()).filter(Boolean);
  const scope = { limit };
  if (["l1_structure", "l2_anchor"].includes(kind) && targets.length) scope.paperIds = targets.map((value) => Number(value)).filter(Number.isInteger);
  if (kind === "recompute" && targets.length) scope.entityIds = targets;
  if (kind === "coverage_scan") {
    scope.domains = targets.length ? targets : ["embodied", "llm"];
    scope.layers = ["candidate_ingest", "anchor_depth", "relationship_review"];
  }
  const payload = {
    batchKind: kind,
    scope,
    dryRun: el("editorBatchDryRun").checked,
    editorName: editorOperator(),
    reason,
    model: el("editorBatchModel").value.trim(),
    promptVersion: el("editorBatchPromptVersion").value.trim(),
  };
  const button = el("editorBatchSubmit");
  button.disabled = true;
  try {
    setStoredEditorName(payload.editorName);
    const result = await api("/api/editor/batches", { method: "POST", body: JSON.stringify(payload) });
    const batch = editorObject(result, "batch");
    state.editor.selectedBatchId = String(batch?.id || "");
    state.editor.selectedBatch = batch;
    toast("批量作业已创建，等待生成差异预览");
    el("editorBatchForm").reset();
    el("editorBatchLimit").value = "50";
    el("editorBatchDryRun").checked = true;
    await Promise.all([loadEditorBatches(), loadEditorAudit()]);
  } catch (error) {
    toast(error.message, true);
  } finally {
    button.disabled = false;
  }
}

async function runEditorBatchAction(button) {
  const action = button.dataset.editorBatchAction;
  const batchId = button.dataset.batchId;
  const reason = editorReasonValue("editorBatchDecisionReason", state.editor.selectedBatch?.reason || "");
  if (!reason) return;
  if (action === "cancel" && !window.confirm("确认取消这个批量作业？已产生的审计与候选差异会保留。")) return;
  button.disabled = true;
  try {
    const result = await api(`/api/editor/batches/${encodeURIComponent(batchId)}/${encodeURIComponent(action)}`, {
      method: "POST",
      body: JSON.stringify({ editorName: editorOperator(), reason }),
    });
    const batch = editorObject(result, "batch");
    if (batch?.id) state.editor.selectedBatch = batch;
    toast({ preview: "差异预览已生成", apply: "已批准候选已应用", pause: "作业已暂停", resume: "作业已恢复", retry: "失败项已重新排队", cancel: "作业已取消" }[action] || "作业状态已更新");
    await Promise.all([loadEditorBatches(), loadEditorAudit(), ...(action === "apply" ? [loadEditorEntities(), loadEditorRelationships(), loadEditorCoverage()] : [])]);
  } catch (error) {
    toast(error.message, true);
  } finally {
    if (button.isConnected) button.disabled = false;
  }
}

async function decideEditorBatchItem(button) {
  const decision = button.dataset.editorItemAction;
  const batchId = button.dataset.batchId;
  const itemId = button.dataset.itemId;
  const reason = editorReasonValue("editorBatchDecisionReason", state.editor.selectedBatch?.reason || "");
  if (!reason) return;
  button.disabled = true;
  try {
    await api(`/api/editor/batches/${encodeURIComponent(batchId)}/items/${encodeURIComponent(itemId)}/${encodeURIComponent(decision)}`, {
      method: "POST",
      body: JSON.stringify({ editorName: editorOperator(), reason }),
    });
    toast(decision === "approve" ? "候选项已批准" : "候选项已拒绝");
    await Promise.all([loadEditorBatches(), loadEditorAudit()]);
  } catch (error) {
    toast(error.message, true);
  } finally {
    if (button.isConnected) button.disabled = false;
  }
}

async function selectEditorEntity(entityId) {
  state.editor.selectedEntityId = String(entityId);
  state.editor.selectedEntity = state.editor.entities.find((entity) => String(entity.id) === String(entityId)) || null;
  renderEditorEntities();
  editorSetStatus("正在载入实体详情...");
  try {
    const payload = await api(`/api/editor/entities/${encodeURIComponent(entityId)}`);
    state.editor.selectedEntity = editorObject(payload, "entity");
    editorSetStatus("");
    renderEditorEntities();
  } catch (error) {
    editorSetStatus(error.message, true);
  }
}

async function submitEditorEntity(event) {
  event.preventDefault();
  const reason = editorReasonValue("editorEntityReason");
  if (!reason) return;
  const payload = {
    editorName: editorOperator(),
    reason,
    entityKind: el("editorEntityKind").value,
    canonicalName: el("editorEntityName").value.trim(),
    description: el("editorEntityDescription").value.trim(),
    status: el("editorEntityStatus").value,
    aliases: el("editorEntityAliases").value.split(/[，,]+/).map((value) => value.trim()).filter(Boolean),
    sourceKind: "editor",
    sourceRef: el("editorEntitySourceRef").value.trim(),
  };
  const button = el("editorEntitySubmit");
  button.disabled = true;
  try {
    const result = await api("/api/editor/entities", { method: "POST", body: JSON.stringify(payload) });
    const entity = editorObject(result, "entity");
    state.editor.selectedEntityId = String(entity?.id || "");
    state.editor.selectedEntity = entity;
    el("editorEntityForm").reset();
    toast("知识实体已创建");
    await Promise.all([loadEditorEntities(), loadEditorAudit()]);
  } catch (error) {
    toast(error.message, true);
  } finally {
    button.disabled = false;
  }
}

async function submitEditorEntityUpdate(form) {
  const reasonInput = form.elements.reason;
  const reason = reasonInput.value.trim();
  if (reason.length < 10) {
    reasonInput.setAttribute("aria-invalid", "true");
    reasonInput.focus();
    toast("修正理由至少需要 10 个字符", true);
    return;
  }
  const entityId = form.dataset.entityId;
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    await api(`/api/editor/entities/${encodeURIComponent(entityId)}`, { method: "POST", body: JSON.stringify({ editorName: editorOperator(), reason, canonicalName: form.elements.canonicalName.value.trim(), description: form.elements.description.value.trim(), status: form.elements.status.value }) });
    toast("实体修正已保存");
    await Promise.all([loadEditorEntities(), loadEditorAudit()]);
  } catch (error) {
    toast(error.message, true);
  } finally {
    if (submit.isConnected) submit.disabled = false;
  }
}

async function submitEditorAlias(form) {
  const reason = form.elements.reason.value.trim();
  if (reason.length < 10) {
    form.elements.reason.setAttribute("aria-invalid", "true");
    form.elements.reason.focus();
    toast("增加别名的理由至少需要 10 个字符", true);
    return;
  }
  const entityId = form.dataset.entityId;
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    await api(`/api/editor/entities/${encodeURIComponent(entityId)}/aliases`, { method: "POST", body: JSON.stringify({ editorName: editorOperator(), reason, alias: form.elements.alias.value.trim(), sourceRef: form.elements.sourceRef.value.trim() }) });
    toast("实体别名已增加");
    await Promise.all([loadEditorEntities(), loadEditorAudit()]);
  } catch (error) {
    toast(error.message, true);
  } finally {
    if (submit.isConnected) submit.disabled = false;
  }
}

async function submitEditorMerge(form) {
  if (!form.elements.confirmMerge.checked) {
    form.elements.confirmMerge.focus();
    toast("请先确认实体合并影响", true);
    return;
  }
  const reason = form.elements.reason.value.trim();
  if (reason.length < 10) {
    form.elements.reason.setAttribute("aria-invalid", "true");
    form.elements.reason.focus();
    toast("合并理由至少需要 10 个字符", true);
    return;
  }
  const sourceId = form.dataset.entityId;
  const targetId = form.elements.targetEntityId.value;
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    const result = await api(`/api/editor/entities/${encodeURIComponent(sourceId)}/merge`, { method: "POST", body: JSON.stringify({ editorName: editorOperator(), reason, targetEntityId: targetId }) });
    const merged = editorObject(result, "merge") || result;
    state.editor.selectedEntityId = String(merged?.target?.id || targetId);
    toast("实体已合并，别名和关系已重连");
    await Promise.all([loadEditorEntities(), loadEditorRelationships(), loadEditorAudit()]);
  } catch (error) {
    toast(error.message, true);
  } finally {
    if (submit.isConnected) submit.disabled = false;
  }
}

function resetEditorRelationshipForm() {
  const form = el("editorRelationshipForm");
  form.reset();
  el("editorRelationshipId").value = "";
  el("editorRelationshipSubmit").textContent = "创建关系";
  el("editorRelationshipCancel").hidden = true;
  renderEditorRelationshipOptions();
}

function editEditorRelationship(relationshipId) {
  const relationship = state.editor.relationships.find((item) => String(item.id) === String(relationshipId));
  if (!relationship) return;
  el("editorRelationshipId").value = relationship.id;
  el("editorRelationFrom").value = relationship.from_entity_id || "";
  el("editorRelationTo").value = relationship.to_entity_id || "";
  el("editorRelationType").value = relationship.relation_type || "related_to";
  el("editorRelationStatus").value = relationship.status || "candidate";
  const evidence = relationship.evidence?.[0] || {};
  el("editorRelationEvidenceLabel").value = evidence.label || "";
  el("editorRelationSourceRef").value = relationship.source_ref || evidence.source_ref || "";
  el("editorRelationQuote").value = evidence.quote || "";
  el("editorRelationReason").value = "";
  el("editorRelationshipSubmit").textContent = "保存关系修正";
  el("editorRelationshipCancel").hidden = false;
  el("editorRelationshipForm").scrollIntoView({ behavior: globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  window.requestAnimationFrame(() => el("editorRelationReason").focus({ preventScroll: true }));
}

async function submitEditorRelationship(event) {
  event.preventDefault();
  const form = el("editorRelationshipForm");
  const reason = editorReasonValue("editorRelationReason");
  if (!reason) return;
  const evidenceLabel = el("editorRelationEvidenceLabel").value.trim();
  const quote = el("editorRelationQuote").value.trim();
  const sourceRef = el("editorRelationSourceRef").value.trim();
  const evidence = (evidenceLabel || quote || sourceRef) ? [{ label: evidenceLabel, quote, sourceRef, direction: "supports" }] : [];
  const payload = {
    editorName: editorOperator(),
    reason,
    fromEntityId: el("editorRelationFrom").value,
    toEntityId: el("editorRelationTo").value,
    relationType: el("editorRelationType").value,
    status: el("editorRelationStatus").value,
    evidence,
    sourceKind: "editor",
    sourceRef,
  };
  if (!payload.fromEntityId || !payload.toEntityId || payload.fromEntityId === payload.toEntityId) {
    toast("请选择两个不同的实体", true);
    return;
  }
  const relationshipId = el("editorRelationshipId").value.trim();
  const submit = el("editorRelationshipSubmit");
  submit.disabled = true;
  try {
    const path = relationshipId ? `/api/editor/relationships/${encodeURIComponent(relationshipId)}` : "/api/editor/relationships";
    await api(path, { method: "POST", body: JSON.stringify(relationshipId ? { ...payload, id: relationshipId } : payload) });
    toast(relationshipId ? "关系修正已保存" : "关系已创建");
    resetEditorRelationshipForm();
    await Promise.all([loadEditorRelationships(), loadEditorEntities(), loadEditorAudit()]);
  } catch (error) {
    toast(error.message, true);
  } finally {
    submit.disabled = false;
  }
}

async function submitEditorCoverage(event) {
  event.preventDefault();
  const reason = editorReasonValue("editorCoverageReason");
  if (!reason) return;
  const button = el("editorCoverageRecompute");
  button.disabled = true;
  try {
    const result = await api("/api/editor/coverage/recompute", { method: "POST", body: JSON.stringify({ editorName: editorOperator(), reason }) });
    const gaps = editorPayloadList(result, "coverage");
    if (gaps.length) state.editor.coverage = gaps;
    toast("覆盖缺口已重新检查");
    await Promise.all([loadEditorCoverage(), loadEditorAudit(), loadEditorBatches()]);
  } catch (error) {
    toast(error.message, true);
  } finally {
    button.disabled = false;
  }
}

function bindEditorTabs() {
  document.querySelectorAll("[data-editor-tab]").forEach((button) => button.addEventListener("click", () => {
    activateEditorTab(button.dataset.editorTab, { focus: false });
    if (button.dataset.editorTab === "batches" && !state.editor.batches.length) void loadEditorBatches();
    if (button.dataset.editorTab === "entities" && !state.editor.entities.length) void loadEditorEntities();
    if (button.dataset.editorTab === "relationships" && !state.editor.relationships.length) void loadEditorRelationships();
    if (button.dataset.editorTab === "coverage" && !state.editor.coverage.length) void loadEditorCoverage();
    if (button.dataset.editorTab === "audit" && !state.editor.audit.length) void loadEditorAudit();
  }));
}

function bindEditorEvents() {
  bindEditorTabs();
  el("editorOperator").value = storedEditorName();
  el("editorOperator").addEventListener("input", () => setStoredEditorName(el("editorOperator").value));
  el("editorRefresh").addEventListener("click", () => void loadEditorWorkspace(true));
  el("editorBatchRefresh").addEventListener("click", () => void loadEditorBatches({ preserveDetail: true }));
  el("editorAuditRefresh").addEventListener("click", () => void loadEditorAudit());
  el("editorBatchForm").addEventListener("submit", submitEditorBatch);
  el("editorEntityForm").addEventListener("submit", submitEditorEntity);
  el("editorRelationshipForm").addEventListener("submit", submitEditorRelationship);
  el("editorRelationshipCancel").addEventListener("click", resetEditorRelationshipForm);
  el("editorCoverageForm").addEventListener("submit", submitEditorCoverage);
  el("editorEntityFilterForm").addEventListener("submit", (event) => {
    event.preventDefault();
    void loadEditorEntities({ query: el("editorEntityQuery").value.trim(), kind: el("editorEntityKindFilter").value, preserveDetail: false });
  });
  document.addEventListener("click", (event) => {
    const batchRow = event.target.closest("[data-editor-batch-id]");
    if (batchRow) {
      void selectEditorBatch(batchRow.dataset.editorBatchId);
      return;
    }
    const batchAction = event.target.closest("[data-editor-batch-action]");
    if (batchAction) {
      void runEditorBatchAction(batchAction);
      return;
    }
    const itemAction = event.target.closest("[data-editor-item-action]");
    if (itemAction) {
      void decideEditorBatchItem(itemAction);
      return;
    }
    const entityRow = event.target.closest("[data-editor-entity-id]");
    if (entityRow) {
      void selectEditorEntity(entityRow.dataset.editorEntityId);
      return;
    }
    const relationEdit = event.target.closest("[data-editor-relationship-edit-id]");
    if (relationEdit) {
      editEditorRelationship(relationEdit.dataset.editorRelationshipEditId);
    }
  });
  document.addEventListener("submit", (event) => {
    const learningForm = event.target.closest("form[data-learning-form]");
    if (learningForm) {
      event.preventDefault();
      void submitLearningProgress(learningForm);
    }
  });
  document.addEventListener("submit", (event) => {
    const entityUpdate = event.target.closest("[data-editor-entity-update-form]");
    if (entityUpdate) {
      event.preventDefault();
      void submitEditorEntityUpdate(entityUpdate);
      return;
    }
    const aliasForm = event.target.closest("[data-editor-alias-form]");
    if (aliasForm) {
      event.preventDefault();
      void submitEditorAlias(aliasForm);
      return;
    }
    const mergeForm = event.target.closest("[data-editor-merge-form]");
    if (mergeForm) {
      event.preventDefault();
      void submitEditorMerge(mergeForm);
    }
  });
}

function bridgeQueryContext() {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  state.bridge.session = query.get("paperfieldBridgeSession") || "";
  state.bridge.token = hash.get("paperfieldBridge") || "";
  state.bridge.paperfieldOrigin = query.get("paperfieldOrigin") || "";
  if (state.bridge.token) {
    const clean = new URL(window.location.href);
    clean.hash = "";
    window.history.replaceState({}, "", clean);
  }
}

function postBridgeReady() {
  if (!window.opener || !state.bridge.session || !state.bridge.token || !state.bridge.paperfieldOrigin) return;
  try {
    window.opener.postMessage(
      { type: "atlas:ready", version: 1, messageId: state.bridge.session, bridgeToken: state.bridge.token },
      state.bridge.paperfieldOrigin,
    );
    el("bridgeState").textContent = "已连接 Paperfield，等待上下文";
  } catch {
    el("bridgeState").textContent = "无法回应 Paperfield";
  }
}

async function receiveBridgeMessage(event) {
  const message = event.data;
  if (!message || typeof message !== "object" || !String(message.type || "").startsWith("paperfield:")) return;
  if (!state.bridge.paperfieldOrigin || event.origin !== state.bridge.paperfieldOrigin) return;
  if (window.opener && event.source !== window.opener) return;
  if (!state.bridge.token || message.bridgeToken !== state.bridge.token) return;
  if (state.bridge.session && message.messageId !== state.bridge.session) return;
  state.bridge.sourceWindow = event.source;
  el("bridgeState").textContent = "正在保存 Paperfield 上下文";
  try {
    const result = await api("/api/bridge", { method: "POST", body: JSON.stringify(message) });
    const acknowledgement = { ...result, bridgeToken: state.bridge.token };
    event.source?.postMessage(acknowledgement, event.origin);
    el("bridgeState").textContent = "Paperfield 上下文已保存";
    await loadBootstrap();
    if (result.paper) await openDossier(result.paper.id, true);
    if (result.task?.paper) await openDossier(result.task.paper.id, true);
    if (result.project) await openProject(result.project.full_name, true);
  } catch (error) {
    el("bridgeState").textContent = "Paperfield 上下文接收失败";
    event.source?.postMessage(
      { type: "atlas:error", version: 1, messageId: message.messageId, bridgeToken: state.bridge.token, error: error.message },
      event.origin,
    );
    toast(error.message, true);
  }
}

function bindEvents() {
  window.addEventListener("message", receiveBridgeMessage);
  window.addEventListener("popstate", () => { void openInitialRoute(false); });
  document.addEventListener("keydown", handleNavigationKeydown);
  setNavigation(false, false);
  el("navToggle").addEventListener("click", () => setNavigation(!document.body.classList.contains("is-nav-open")));
  el("navClose").addEventListener("click", () => setNavigation(false));
  el("navBackdrop").addEventListener("click", () => setNavigation(false));
  if (mobileQuery.addEventListener) mobileQuery.addEventListener("change", () => setNavigation(false, false));
  const curriculumTreePanel = el("curriculumTreePanel");
  curriculumTreePanel.open = curriculumTreeWideQuery.matches;
  curriculumTreePanel.addEventListener("toggle", (event) => {
    if (event.isTrusted) curriculumTreePanel.dataset.userDisclosure = "true";
  });
  if (curriculumTreeWideQuery.addEventListener) {
    curriculumTreeWideQuery.addEventListener("change", (event) => {
      if (curriculumTreePanel.dataset.userDisclosure !== "true") curriculumTreePanel.open = event.matches;
    });
  }

  navLinks().forEach((button) => button.addEventListener("click", () => showView(button.dataset.view)));
  document.querySelectorAll("[data-view-target]").forEach((button) => button.addEventListener("click", () => showView(button.dataset.viewTarget)));
  document.querySelectorAll("[data-curriculum-track]").forEach((button) => button.addEventListener("click", () => {
    if (state.curriculum.data) selectCurriculumTrack(button.dataset.curriculumTrack);
    else {
      state.curriculum.track = button.dataset.curriculumTrack;
      void loadCurriculum();
    }
  }));
  el("curriculumRetry").addEventListener("click", () => {
    state.curriculum.data = null;
    void loadCurriculum();
  });
  el("sourceNoticeAction").addEventListener("click", () => {
    if (el("sourceNoticeAction").dataset.sourceAction === "candidates") {
      el("candidatesSection").scrollIntoView({ behavior: globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      return;
    }
    if (el("sourceNoticeAction").dataset.sourceAction === "updates") {
      el("updatesSection").scrollIntoView({ behavior: globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      return;
    }
    showView("library");
  });
  document.querySelectorAll('[role="tablist"]').forEach(bindRovingTablist);

  el("frontierFilterForm").addEventListener("submit", (event) => {
    event.preventDefault();
    state.frontier.filters = {
      domain: el("frontierDomainFilter").value,
      source: el("frontierSourceFilter").value,
      maturity: el("frontierMaturityFilter").value,
      from: el("frontierDateFrom").value,
      to: el("frontierDateTo").value,
    };
    void loadFrontierRadar();
  });
  el("frontierFilterReset").addEventListener("click", () => {
    el("frontierFilterForm").reset();
    state.frontier.filters = { domain: "", source: "", maturity: "", from: "", to: "" };
    void loadFrontierRadar();
  });
  el("newsFilterForm").addEventListener("submit", (event) => {
    event.preventDefault();
    state.news.filters = {
      domain: el("newsDomainFilter").value,
      topic: "",
      articleType: el("newsTypeFilter").value,
      source: el("newsSourceFilter").value,
      importance: el("newsImportanceFilter").value,
      from: "",
      to: "",
      unread: el("newsUnreadFilter").checked,
      saved: el("newsSavedFilter").checked,
      q: el("newsQuery").value.trim(),
    };
    void loadNews({ keepSelection: false });
  });
  el("newsFilterReset").addEventListener("click", () => {
    el("newsFilterForm").reset();
    state.news.filters = { domain: "", topic: "", articleType: "", source: "", importance: "", from: "", to: "", unread: false, saved: false, q: "" };
    void loadNews({ keepSelection: false });
  });
  el("newsRefresh").addEventListener("click", () => void refreshNews());

  ["focusEditButton", "focusEditButtonMain"].forEach((id) => el(id).addEventListener("click", (event) => openFocusDialog(event.currentTarget)));
  ["focusDialog", "researchViewDialog", "termDetailDialog", "knowledgeDialog", "signalDialog", "analysisDialog"].forEach((id) => bindDialogFocusRestore(el(id)));
  el("focusClose").addEventListener("click", () => el("focusDialog").close());
  el("focusCancel").addEventListener("click", () => el("focusDialog").close());
  el("focusForm").addEventListener("submit", submitFocus);
  el("researchViewCreate").addEventListener("click", (event) => openResearchViewDialog(null, event.currentTarget));
  el("researchViewClose").addEventListener("click", () => el("researchViewDialog").close());
  el("researchViewCancel").addEventListener("click", () => el("researchViewDialog").close());
  el("researchViewForm").addEventListener("submit", submitResearchView);
  el("researchViewKind").addEventListener("change", researchViewFieldVisibility);
  el("researchViewDialog").addEventListener("close", () => { state.loop.editingView = null; });
  el("workspaceRefresh").addEventListener("click", () => void loadResearchWorkspace());
  el("notificationRefresh").addEventListener("click", () => void refreshResearchNotifications());
  el("notificationReadAll").addEventListener("click", () => void markResearchNotification());
  el("termDetailClose").addEventListener("click", () => el("termDetailDialog").close());
  el("termDetailCancel").addEventListener("click", () => el("termDetailDialog").close());
  el("knowledgeDialogClose").addEventListener("click", () => el("knowledgeDialog").close());
  el("knowledgeDialogCancel").addEventListener("click", () => el("knowledgeDialog").close());

  document.querySelectorAll("[data-loop-tab]").forEach((button) => button.addEventListener("click", () => {
    state.loop.tab = button.dataset.loopTab;
    activateRovingTab(button, "[data-loop-tab]");
    document.querySelectorAll("[data-loop-panel]").forEach((panel) => { panel.hidden = panel.dataset.loopPanel !== state.loop.tab; });
    if (state.loop.tab === "workspace") void loadResearchWorkspace();
    if (state.loop.tab === "ops") void loadLoopOperations();
  }));
  document.querySelectorAll("[data-knowledge-kind]").forEach((button) => {
    if (!button.closest("#knowledgeKindSwitch")) return;
    button.addEventListener("click", () => {
      state.knowledge.selectedKind = button.dataset.knowledgeKind;
      state.knowledge.selected = null;
      state.knowledge.selectedId = "";
      activateRovingTab(button, "#knowledgeKindSwitch [data-knowledge-kind]");
      el("knowledgePanel")?.setAttribute("aria-labelledby", button.id);
      renderKnowledgeViews();
    });
  });
  el("methodFilterForm").addEventListener("submit", (event) => { event.preventDefault(); renderKnowledgeViews(); });
  el("threadFilterForm").addEventListener("submit", (event) => { event.preventDefault(); renderPublicThreads(); });
  el("methodQuery").addEventListener("input", renderKnowledgeViews);
  el("threadQuery").addEventListener("input", renderPublicThreads);
  el("myRadarButton").addEventListener("click", () => {
    showView("loop");
    const button = document.querySelector('[data-loop-tab="focus"]');
    button?.click();
  });
  el("privateDigestButton").addEventListener("click", () => void createDigest("private"));
  el("createPrivateDigest").addEventListener("click", () => void createDigest("private"));
  el("createPublicDigest").addEventListener("click", () => void createDigest("public"));
  el("exportResearchData").addEventListener("click", () => void exportResearchData());
  el("loopRefresh").addEventListener("click", async () => { await loadBootstrap(); await loadLoopOperations(); });
  el("diagnosticsRefresh").addEventListener("click", () => void loadLoopOperations());
  el("backupCreate").addEventListener("click", () => void createBackup());

  document.querySelectorAll("[data-scope]").forEach((button) => button.addEventListener("click", () => {
    state.scope = button.dataset.scope;
    activateRovingTab(button, "[data-scope]");
    renderRadar();
    renderTerms();
    renderFrontierRadar();
  }));

  document.querySelectorAll("[data-library-kind]").forEach((button) => button.addEventListener("click", () => {
    state.libraryKind = button.dataset.libraryKind;
    activateRovingTab(button, "[data-library-kind]");
    el("libraryList")?.setAttribute("aria-labelledby", button.id);
    renderLibrary();
  }));

  document.querySelectorAll("[data-dossier-tab]").forEach((button) => button.addEventListener("click", () => {
    state.dossierTab = button.dataset.dossierTab;
    activateRovingTab(button, "[data-dossier-tab]");
    el("dossierContent")?.setAttribute("aria-labelledby", button.id);
    renderDossierContent();
  }));

  document.addEventListener("click", (event) => {
    const newsRow = event.target.closest("button[data-news-id]");
    if (newsRow) {
      void openNewsItem(newsRow.dataset.newsId);
      return;
    }
    const newsSave = event.target.closest("[data-news-save]");
    if (newsSave) {
      void toggleNewsSaved(newsSave.dataset.newsSave);
      return;
    }
    const newsRead = event.target.closest("[data-news-read]");
    if (newsRead) {
      void toggleNewsRead(newsRead.dataset.newsRead);
      return;
    }
    const newsHydrate = event.target.closest("[data-news-hydrate]");
    if (newsHydrate) {
      void openNewsItem(newsHydrate.dataset.newsHydrate);
      return;
    }
    const publicThreadButton = event.target.closest("[data-public-thread-ref]");
    if (publicThreadButton) {
      void openPublicThread(publicThreadButton.dataset.publicThreadRef);
      return;
    }
    const threadFlowloom = event.target.closest("[data-thread-flowloom]");
    if (threadFlowloom) {
      void sendPublicThreadToFlowloom(threadFlowloom.dataset.threadFlowloom, threadFlowloom);
      return;
    }
    const courseLesson = event.target.closest("[data-course-lesson]");
    if (courseLesson) {
      event.preventDefault();
      selectCurriculumLesson(courseLesson.dataset.courseLesson);
      return;
    }
    const courseLessonRetry = event.target.closest("[data-course-lesson-retry]");
    if (courseLessonRetry) {
      state.curriculum.lessonError = "";
      void loadCurriculumLesson(courseLessonRetry.dataset.courseLessonRetry);
      return;
    }
    const curriculumChapter = event.target.closest("[data-curriculum-chapter]");
    if (curriculumChapter) {
      selectCurriculumChapter(curriculumChapter.dataset.curriculumChapter);
      return;
    }
    const curriculumFrontier = event.target.closest("[data-curriculum-frontier]");
    if (curriculumFrontier) {
      openCurriculumFrontier(curriculumFrontier.dataset.curriculumFrontier);
      return;
    }
    const researchViewRun = event.target.closest("[data-research-view-run]");
    if (researchViewRun) {
      void runResearchView(researchViewRun.dataset.researchViewRun);
      return;
    }
    const researchViewBundle = event.target.closest("[data-research-view-bundle]");
    if (researchViewBundle) {
      void createEvidenceBundle(researchViewBundle.dataset.researchViewBundle);
      return;
    }
    const researchViewEdit = event.target.closest("[data-research-view-edit]");
    if (researchViewEdit) {
      const view = state.loop.researchViews.find((item) => item.id === researchViewEdit.dataset.researchViewEdit);
      if (view) openResearchViewDialog(view, researchViewEdit);
      return;
    }
    const researchViewDelete = event.target.closest("[data-research-view-delete]");
    if (researchViewDelete) {
      void deleteResearchView(researchViewDelete.dataset.researchViewDelete);
      return;
    }
    const notificationRead = event.target.closest("[data-notification-read]");
    if (notificationRead) {
      void markResearchNotification(notificationRead.dataset.notificationRead);
      return;
    }
    const bundleDownload = event.target.closest("[data-evidence-bundle-download]");
    if (bundleDownload) {
      void downloadEvidenceBundle(bundleDownload.dataset.evidenceBundleDownload, bundleDownload.dataset.bundleFormat || "json");
      return;
    }
    const termDetailButton = event.target.closest("[data-term-detail-id]");
    if (termDetailButton) {
      void openTermDetail(termDetailButton.dataset.termDetailId, termDetailButton);
      return;
    }
    const knowledgeButton = event.target.closest("[data-knowledge-id]");
    if (knowledgeButton) {
      void openKnowledgeEntity(knowledgeButton.dataset.knowledgeId, knowledgeButton.dataset.knowledgeKind || "", knowledgeButton);
      return;
    }
    const saveButton = event.target.closest("[data-save-kind]");
    if (saveButton) {
      void saveResearchItem(saveButton.dataset.saveKind, saveButton.dataset.saveRef, saveButton.dataset.saveTitle);
      return;
    }
    const savedDelete = event.target.closest("[data-saved-delete]");
    if (savedDelete) {
      void deleteSavedItem(savedDelete.dataset.savedDelete);
      return;
    }
    const backupValidate = event.target.closest("[data-backup-validate]");
    if (backupValidate) {
      void runBackupAction(backupValidate.dataset.backupValidate, "validate");
      return;
    }
    const backupRestore = event.target.closest("[data-backup-restore]");
    if (backupRestore) {
      void runBackupAction(backupRestore.dataset.backupRestore, "restore");
      return;
    }
    const termButton = event.target.closest("[data-term-id]");
    if (termButton) {
      openSignalEditorForTerm(termButton.dataset.termId, termButton);
      return;
    }
    const signalEditButton = event.target.closest("[data-signal-edit-id]");
    if (signalEditButton) {
      openSignalEditorForSignal(signalEditButton.dataset.signalEditId, signalEditButton);
      return;
    }
    const signalFocusButton = event.target.closest("[data-signal-focus-id]");
    if (signalFocusButton) {
      focusPublishedSignal(signalFocusButton.dataset.signalFocusId);
      return;
    }
    const signalRetractButton = event.target.closest("[data-signal-retract-id]");
    if (signalRetractButton) {
      openSignalEditorForSignal(signalRetractButton.dataset.signalRetractId, signalRetractButton, "retract");
      return;
    }
    const materialAuthorize = event.target.closest("[data-material-authorize]");
    if (materialAuthorize) {
      const task = (state.data?.analysis_requests || []).find((item) => item.id === materialAuthorize.dataset.taskId)
        || state.currentPaper?.analysis_requests?.find((item) => item.id === materialAuthorize.dataset.taskId);
      if (task?.paper) openAnalysisDialog(task.paper, task, materialAuthorize);
      return;
    }
    const stageRetry = event.target.closest("[data-stage-retry]");
    if (stageRetry) {
      void runTaskAction(stageRetry.dataset.taskId, "retry", stageRetry.dataset.stageKey);
      return;
    }
    const paperButton = event.target.closest("[data-paper-id]");
    if (paperButton) {
      void openDossier(Number(paperButton.dataset.paperId));
      return;
    }
    const projectButton = event.target.closest("[data-project-name]");
    if (projectButton) {
      void openProject(projectButton.dataset.projectName);
      return;
    }
    const actionButton = event.target.closest("[data-task-action]");
    if (actionButton) void runTaskAction(actionButton.dataset.taskId, actionButton.dataset.taskAction);
  });

  document.addEventListener("change", (event) => {
    const lessonSelect = event.target.closest?.("[data-course-lesson-select]");
    if (lessonSelect) selectCurriculumLesson(lessonSelect.value);
  });

  el("globalSearch").addEventListener("input", () => {
    state.search = el("globalSearch").value;
    window.clearTimeout(state.searchTimer);
    state.searchTimer = window.setTimeout(() => { void loadCatalogSearch(state.search); }, 240);
    renderRadar();
    renderTerms();
    renderLibrary();
  });
  el("globalSearch").addEventListener("keydown", (event) => {
    if (event.key === "Enter") showView("library");
  });

  el("dossierBack").addEventListener("click", () => showView(state.previousView === "dossier" ? "library" : state.previousView));
  el("projectBack").addEventListener("click", () => showView(state.previousView === "project" ? "library" : state.previousView));
  el("dossierAnalyze").addEventListener("click", (event) => {
    if (!state.currentPaper) return;
    openAnalysisDialog(state.currentPaper, state.currentPaper.analysis_requests?.[0] || null, event.currentTarget);
  });
  el("dossierExportJson").addEventListener("click", () => void exportCurrentDossier("json"));
  el("dossierFlowloom").addEventListener("click", (event) => {
    if (state.currentPaper) void sendPaperContextToFlowloom(state.currentPaper, event.currentTarget);
  });
  el("dossierExportMarkdown").addEventListener("click", () => void exportCurrentDossier("markdown"));
  el("dossierSave").addEventListener("click", () => {
    if (state.currentPaper) void saveResearchItem("paper", state.currentPaper.canonical_ref || String(state.currentPaper.id), state.currentPaper.title);
  });
  el("analysisAllowDownload").addEventListener("change", syncAnalysisPermissionControls);
  el("analysisClose").addEventListener("click", () => el("analysisDialog").close());
  el("analysisCancel").addEventListener("click", () => el("analysisDialog").close());
  el("analysisForm").addEventListener("submit", submitAnalysis);
  el("signalClose").addEventListener("click", closeSignalEditor);
  el("signalCancel").addEventListener("click", closeSignalEditor);
  el("signalForm").addEventListener("submit", submitSignal);
  el("signalEvidenceList").addEventListener("change", updateSignalEvidenceCount);
  el("signalDialog").addEventListener("close", () => {
    const trigger = state.signalEditor.trigger;
    state.signalEditor = { mode: "create", signal: null, term: null, trigger: null };
    if (trigger?.isConnected) trigger.focus({ preventScroll: true });
  });
  bindEditorEvents();
}

async function openInitialRoute(updateUrl = false) {
  const query = new URLSearchParams(window.location.search);
  const paperId = Number(query.get("paper"));
  const reference = query.get("ref");
  const repo = query.get("repo") || query.get("project");
  const requestedView = query.get("view");
  state.frontier.query = query.get("q") || "";
  const requestedTrack = query.get("track");
  const requestedChapter = query.get("chapter");
  const requestedLesson = normalizeCourseLessonPath(query.get("lesson"));
  const requestedThread = query.get("thread");
  if (paperId) {
    await openDossier(paperId, updateUrl);
    return;
  }
  if (reference) {
    const result = await api(`/api/papers/resolve?ref=${encodeURIComponent(reference)}`);
    if (result.paper) {
      await openDossier(result.paper.id, updateUrl);
      return;
    }
  }
  if (repo) {
    try {
      await openProject(repo, updateUrl);
      return;
    } catch {
      // The Paperfield bridge may still be delivering the project context.
    }
  }
  if (requestedView === "curriculum") {
    if (["llm", "embodied"].includes(requestedTrack)) state.curriculum.track = requestedTrack;
    state.curriculum.selectedChapterId = requestedChapter || "";
    state.curriculum.selectedLessonPath = requestedLesson;
    state.curriculum.lessonError = "";
    if (!state.curriculum.data) await loadCurriculum();
    if (requestedLesson) {
      selectCurriculumLesson(requestedLesson, { updateUrl: false, focus: false });
    } else if (requestedChapter && curriculumChapterLocation(requestedChapter)) {
      selectCurriculumChapter(requestedChapter, { updateUrl: false, focus: false });
    } else if (state.curriculum.data) {
      const track = curriculumTrack();
      state.curriculum.selectedChapterId = track?.default_chapter_id || "";
      renderCurriculum();
    }
    showView("curriculum", { updateUrl });
    return;
  }
  if (requestedView === "threads") {
    showView("threads", { updateUrl: false });
    if (!state.researchThreads.loaded) await loadPublicThreads();
    if (requestedThread) await openPublicThread(requestedThread, { updateUrl: false });
    if (updateUrl) window.history.pushState({}, "", locationForView("threads", state.researchThreads.selected));
    return;
  }
  if (["radar", "news", "threads", "terms", "methods", "library", "analyses", "loop", "editor"].includes(requestedView)) {
    showView(requestedView, { updateUrl });
    return;
  }
  showView("radar", { updateUrl });
}

function applyRuntimeConfig(config) {
  const previousPaperfieldUrl = state.config?.paperfield_base_url || "";
  state.config = config;
  el("backupOperations").hidden = Boolean(config.mounted_via_proxy);
  const paperfieldUrl = config.paperfield_base_url;
  ["paperfieldRailLink", "paperfieldCommandLink", "emptyPaperfieldLink"].forEach((id) => { el(id).href = paperfieldUrl; });
  if (!state.bridge.paperfieldOrigin) state.bridge.paperfieldOrigin = new URL(paperfieldUrl, window.location.href).origin;
  el("analysisDialogNote").textContent = analysisRuntimeNote();
  renderAnalysisReadiness();
  const workerLabel = config.worker_connected
    ? "执行器在线"
    : config.worker_configured
      ? "执行器等待心跳"
      : "执行器未配置";
  setServiceState("live", "Atlas 已就绪", `v${state.data?.version || "--"} / ${workerLabel}`);
  if (state.data && previousPaperfieldUrl !== paperfieldUrl) {
    renderRadar();
    renderTerms();
  }
}

async function refreshOperationalState() {
  if (state.refreshInFlight || document.hidden || el("analysisDialog").open) return;
  state.refreshInFlight = true;
  try {
    const [config, data] = await Promise.all([api("/api/config"), fetchBootstrapData()]);
    const dataFingerprint = JSON.stringify(data);
    if (dataFingerprint !== state.dataFingerprint) {
      state.data = data;
      if (data.learning) state.curriculum.learning = data.learning;
      state.dataFingerprint = dataFingerprint;
      renderAll();
      void loadFrontierRadar();
    }
    applyRuntimeConfig(config);
    if (state.activeView === "dossier" && state.currentPaper) {
      const paper = await api(`/api/papers/${encodeURIComponent(state.currentPaper.id)}/dossier`);
      const dossierFingerprint = JSON.stringify(paper);
      if (dossierFingerprint !== state.dossierFingerprint) applyDossierPaper(paper, false);
    }
  } catch (error) {
    setServiceState("error", "Atlas 刷新失败", error.message);
  } finally {
    state.refreshInFlight = false;
  }
}

async function init() {
  bridgeQueryContext();
  bindEvents();
  try {
    const [config] = await Promise.all([api("/api/config"), loadBootstrap()]);
    applyRuntimeConfig(config);
    await Promise.all([loadFrontierRadar(), loadKnowledgeViews(), loadCurriculum()]);
    await loadNews();
    if (state.activeView === "loop") await loadLoopOperations();
    el("loadingShell").hidden = true;
    await openInitialRoute(false);
    postBridgeReady();
    if (state.bridge.session) {
      window.setTimeout(postBridgeReady, 400);
      window.setTimeout(postBridgeReady, 1200);
    }
    window.setInterval(() => { void refreshOperationalState(); }, 10000);
  } catch (error) {
    el("loadingShell").hidden = true;
    setServiceState("error", "Atlas 连接失败", error.message);
    toast(error.message, true);
    showView("radar", { updateUrl: false });
  }
}

init();
