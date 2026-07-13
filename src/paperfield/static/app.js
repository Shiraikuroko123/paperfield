const state = {
  papers: [],
  projects: [],
  weeklyProjects: [],
  weeklyProjectCandidateTotal: 0,
  weeklyKind: "papers",
  weeklyPreparation: null,
  weeklyPreparationPoll: null,
  selectedId: null,
  selectedProject: null,
  readerPaper: null,
  readerAsset: null,
  readerPdfObjectUrl: "",
  readerPdfImageUrls: [],
  readerPdfImageQueue: Promise.resolve(),
  readerPdfDocument: null,
  readerPdfLoadingTask: null,
  readerPdfObserver: null,
  readerPdfToken: 0,
  translationPageText: "",
  translationSelection: null,
  translationLoadRequestId: 0,
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
  projectWorkspaceToken: 0,
  auth: null,
  aiModels: null,
  recommendationWeights: null,
  appliedRecommendationWeights: null,
  streamRequestId: 0,
  streamRequest: null,
  authorRequestId: 0,
};

const SCORE_DIMENSIONS = [
  { key: "academic", label: "学术质量", color: "oklch(0.66 0.17 145)" },
  { key: "relevance", label: "方向匹配", color: "oklch(0.68 0.14 225)" },
  { key: "freshness", label: "时效性", color: "oklch(0.78 0.15 85)" },
  { key: "evidence", label: "证据完整度", color: "oklch(0.68 0.12 190)" },
  { key: "impact_reproducibility", label: "影响与复现", color: "oklch(0.68 0.16 25)" },
];

const DEFAULT_SCORE_WEIGHTS = {
  academic: 30,
  relevance: 25,
  freshness: 20,
  evidence: 15,
  impact_reproducibility: 10,
};

const SCORE_WEIGHT_PRESETS = {
  balanced: { academic: 20, relevance: 20, freshness: 20, evidence: 20, impact_reproducibility: 20 },
  academic: { academic: 40, relevance: 22, freshness: 14, evidence: 14, impact_reproducibility: 10 },
  fresh: { academic: 18, relevance: 22, freshness: 36, evidence: 14, impact_reproducibility: 10 },
  readable: { academic: 20, relevance: 20, freshness: 14, evidence: 26, impact_reproducibility: 20 },
};

const el = (id) => document.getElementById(id);
const NGROK_BYPASS_HEADERS = { "ngrok-skip-browser-warning": "paperfield" };
const SHARED_REQUEST_NONCE = Math.random().toString(36).slice(2);
const PDF_LOAD_TIMEOUT_MS = 90000;
const PDF_PAGE_IMAGE_TIMEOUT_MS = 75000;
const CUSTOM_AI_MODEL_VALUE = "__paperfield_custom_model__";
const prefersCompatiblePdfPages = () => {
  const userAgent = navigator.userAgent || "";
  const appleTouch = /iPad|iPhone|iPod/.test(userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const coarsePointer = typeof globalThis.matchMedia === "function" && globalThis.matchMedia("(pointer: coarse)").matches;
  return appleTouch || (navigator.maxTouchPoints > 0 && coarsePointer);
};
if (globalThis.pdfjsLib) globalThis.pdfjsLib.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.js?v=3.11.174";

const escapeHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

function escapedTextMarkup(value = "") {
  return escapeHtml(value).replace(/\r?\n/g, "<br>");
}

function normalizedLegacyEquation(expression) {
  return expression
    .trim()
    .replaceAll("−", "-")
    .replaceAll("–", "-")
    .replaceAll("…", "\\ldots ")
    .replaceAll("∏", "\\prod ")
    .replaceAll("∑", "\\sum ")
    .replaceAll("∫", "\\int ")
    .replaceAll("×", "\\times ")
    .replaceAll("÷", "\\div ")
    .replaceAll("ᵀ", "^{\\mathsf{T}}")
    .replaceAll("⊤", "^{\\mathsf{T}}")
    .replace(/([A-Za-zΑ-Ωα-ω])_([A-Za-z0-9]+)/g, "$1_{$2}")
    .replace(/(^|[^_{A-Za-z0-9])([A-Za-z])([ijk]{2})(?=[^A-Za-z0-9]|$)/g, "$1$2_{$3}")
    .replace(/(^|[^_{A-Za-z0-9])([A-Za-z])([ijk])(?=[^A-Za-z0-9]|$)/g, "$1$2_{$3}")
    .replace(/\b([A-Za-z])(\d)(?=[^A-Za-z0-9]|$)/g, "$1_{$2}")
    .replace(/log(\d+)/g, "\\log_{$1}")
    .replace(/\bmax\b/g, "\\max")
    .replaceAll("·", "\\cdot ")
    .replace(/\\prod\s*([A-Za-z0-9])/g, "\\prod_{$1}")
    .replace(/\\sum\s*([A-Za-z0-9])/g, "\\sum_{$1}");
}

function findUnescapedDelimiter(text, delimiter, from) {
  let searchFrom = from;
  while (searchFrom < text.length) {
    const found = text.indexOf(delimiter, searchFrom);
    if (found < 0) return -1;
    let backslashes = 0;
    for (let index = found - 1; index >= 0 && text[index] === "\\"; index -= 1) backslashes += 1;
    if (backslashes % 2 === 0) return found;
    searchFrom = found + delimiter.length;
  }
  return -1;
}

function mathExpressionMarkup(expression, displayMode) {
  const source = String(expression || "").trim();
  if (!source) return "";
  if (!globalThis.katex?.renderToString) return `<code class="math-source">${escapeHtml(source)}</code>`;
  try {
    const rendered = globalThis.katex.renderToString(source, {
      displayMode,
      output: "htmlAndMathml",
      strict: "ignore",
      throwOnError: true,
      trust: false,
    });
    return `<span class="${displayMode ? "math-display" : "math-inline"}">${rendered}</span>`;
  } catch (error) {
    return `<code class="math-source">${escapeHtml(source)}</code>`;
  }
}

function legacyEquationTextMarkup(value = "") {
  const text = String(value);
  const pattern = /([A-Za-z0-9Α-ω\\∏∑∫√∞∂∇][^\u3400-\u9fff，。；、！？\r\n]*?(?:=|≈|≠|≤|≥|∈|∉|∝|→|←)[^\u3400-\u9fff，。；、！？\r\n]+)/g;
  let markup = "";
  let textStart = 0;

  for (const match of text.matchAll(pattern)) {
    const index = match.index || 0;
    const equation = normalizedLegacyEquation(match[0]);
    const displayMode = equation.length > 34 || /\\(?:prod|sum|int)\b/.test(equation) || equation.includes("|");
    markup += escapedTextMarkup(text.slice(textStart, index));
    markup += mathExpressionMarkup(equation, displayMode);
    textStart = index + match[0].length;
  }
  return `${markup}${escapedTextMarkup(text.slice(textStart))}`;
}

function mathTextMarkup(value = "", autoDetectLegacyEquations = false) {
  const text = String(value);
  let markup = "";
  let textStart = 0;
  const plainTextMarkup = autoDetectLegacyEquations ? legacyEquationTextMarkup : escapedTextMarkup;

  for (let index = 0; index < text.length; index += 1) {
    let closing = "";
    let displayMode = false;
    if (text.startsWith("\\[", index)) {
      closing = "\\]";
      displayMode = true;
    } else if (text.startsWith("\\(", index)) {
      closing = "\\)";
    } else if (text.startsWith("$$", index) && (index === 0 || text[index - 1] !== "\\")) {
      closing = "$$";
      displayMode = true;
    } else if (text[index] === "$" && (index === 0 || text[index - 1] !== "\\")) {
      closing = "$";
    } else {
      continue;
    }

    const formulaStart = index + (closing.startsWith("\\") ? 2 : closing.length);
    const end = findUnescapedDelimiter(text, closing, formulaStart);
    if (end < 0 || end === formulaStart) continue;
    const formula = text.slice(formulaStart, end);
    markup += plainTextMarkup(text.slice(textStart, index));
    markup += mathExpressionMarkup(formula, displayMode);
    index = end + closing.length - 1;
    textStart = end + closing.length;
  }

  return `${markup}${plainTextMarkup(text.slice(textStart))}`;
}

function sharedRequestUrl(path, attempt = 0) {
  const url = new URL(path, window.location.origin);
  if (url.hostname.endsWith(".ngrok-free.dev")) {
    url.searchParams.set("_pf", `${SHARED_REQUEST_NONCE}-${attempt}`);
  }
  return url.toString();
}

async function isNgrokWarningResponse(response) {
  const contentType = response.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().includes("text/html")) return false;
  const raw = await response.clone().text();
  return raw.includes("ERR_NGROK_6024") || raw.includes("ngrok-free");
}

async function fetchShared(path, options = {}) {
  const { headers = {}, ...requestOptions } = options;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(sharedRequestUrl(path, attempt), {
      credentials: "same-origin",
      ...requestOptions,
      cache: "no-store",
      headers: { ...NGROK_BYPASS_HEADERS, ...headers },
    });
    if (!(await isNgrokWarningResponse(response)) || attempt === 1) return response;
    await new Promise((resolve) => window.setTimeout(resolve, 180));
  }
  throw new Error("ngrok 请求重试失败");
}

const api = async (path, options = {}) => {
  const { headers = {}, ...requestOptions } = options;
  const response = await fetchShared(path, {
    ...requestOptions,
    headers: { "Content-Type": "application/json", Accept: "application/json", ...headers },
  });
  const raw = await response.text();
  let payload;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    const ngrokWarning = raw.includes("ERR_NGROK_6024") || raw.includes("ngrok-free");
    throw new Error(ngrokWarning ? "ngrok 访问确认页拦截了接口请求，请刷新页面后重试" : "服务返回了网页而不是接口数据");
  }
  if (response.status === 401 && payload.auth_required) {
    const next = `${window.location.pathname}${window.location.search}`;
    window.location.replace(`/login?next=${encodeURIComponent(next)}`);
  }
  if (!response.ok) throw new Error(payload.error || `请求失败：${response.status}`);
  return payload;
};

async function loadAuthUser() {
  const response = await fetchShared("/api/auth/me", { headers: { Accept: "application/json" } });
  const raw = await response.text();
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error(raw.includes("ERR_NGROK_6024") ? "请先通过 ngrok 访问确认页" : "登录状态接口返回异常");
  }
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
  if (state.recommendationWeights) renderScoreEditor();
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

const weightTotal = (weights) => SCORE_DIMENSIONS.reduce((sum, { key }) => sum + Number(weights?.[key] || 0), 0);
const roundWeight = (value) => Math.round(Math.max(0, Math.min(100, Number(value) || 0)) * 100) / 100;
const formatWeight = (value) => {
  const rounded = roundWeight(value);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
};
const weightsAreComplete = (weights) => Math.abs(weightTotal(weights) - 100) < 0.005;
const sameWeights = (left, right) => SCORE_DIMENSIONS.every(({ key }) => Math.abs(Number(left?.[key]) - Number(right?.[key])) < 0.005);

function setScoreWeight(key, value) {
  const nextValue = Number(value);
  if (!Number.isFinite(nextValue)) return;
  state.recommendationWeights = {
    ...(state.recommendationWeights || DEFAULT_SCORE_WEIGHTS),
    [key]: roundWeight(nextValue),
  };
  updateScoreEditorVisuals();
}

function updateScoreEditorVisuals() {
  const weights = state.recommendationWeights || DEFAULT_SCORE_WEIGHTS;
  const controls = el("scoreWeightControls");
  SCORE_DIMENSIONS.forEach(({ key }) => {
    const value = formatWeight(weights[key]);
    const slider = controls.querySelector(`[data-score-weight="${key}"]`);
    const number = controls.querySelector(`[data-score-weight-number="${key}"]`);
    const output = controls.querySelector(`[data-score-output="${key}"]`);
    if (slider && document.activeElement !== slider) slider.value = value;
    if (number && document.activeElement !== number) number.value = value;
    if (output) output.textContent = `${value}%`;
  });

  let cursor = 0;
  const segments = SCORE_DIMENSIONS.map(({ key, color }) => {
    const start = cursor;
    cursor += Number(weights[key] || 0);
    return `${color} ${start}% ${cursor}%`;
  });
  const total = weightTotal(weights);
  el("scoreWeightRing").style.background = `conic-gradient(${segments.join(", ")})`;
  el("scoreWeightTotal").textContent = formatWeight(total);
  el("scoreGuideSummary").textContent = SCORE_DIMENSIONS.map(({ key }) => formatWeight(weights[key])).join(" / ");

  const locked = Boolean(state.auth?.enabled && !state.auth.host_ai_allowed);
  const complete = weightsAreComplete(weights);
  const dirty = !sameWeights(weights, state.appliedRecommendationWeights || weights);
  controls.querySelectorAll("input").forEach((input) => { input.disabled = locked; });
  el("scoreWeightPresets").querySelectorAll("button").forEach((button) => {
    const preset = SCORE_WEIGHT_PRESETS[button.dataset.scorePreset];
    button.disabled = locked;
    button.classList.toggle("is-active", Boolean(preset && sameWeights(weights, preset)));
  });
  el("resetScoreWeights").disabled = locked;
  el("applyScoreWeights").disabled = locked || !dirty || !complete;
  el("scoreWeightStatus").textContent = locked
    ? "当前账户只读"
    : !complete
      ? `当前合计 ${formatWeight(total)}%，需为 100%`
      : dirty ? "尚未应用" : "已应用";
  el("scoreWeightStatus").className = locked ? "" : !complete || dirty ? "is-dirty" : "is-applied";
}

function renderScoreEditor() {
  const weights = state.recommendationWeights || DEFAULT_SCORE_WEIGHTS;
  const controls = el("scoreWeightControls");
  controls.innerHTML = SCORE_DIMENSIONS.map(({ key, label, color }) => `
    <div class="score-weight-row" style="--weight-color:${color}">
      <div class="score-weight-label"><i aria-hidden="true"></i><b>${label}</b><output data-score-output="${key}">${formatWeight(weights[key])}%</output></div>
      <div class="score-weight-inputs">
        <input id="score-weight-${key}" type="range" min="0" max="100" step="0.1" value="${formatWeight(weights[key])}" data-score-weight="${key}" aria-label="${label}权重">
        <label class="score-weight-number"><span class="sr-only">${label}权重百分比</span><input type="number" min="0" max="100" step="0.1" inputmode="decimal" value="${formatWeight(weights[key])}" data-score-weight-number="${key}" aria-label="${label}权重百分比"><span aria-hidden="true">%</span></label>
      </div>
    </div>`).join("");
  updateScoreEditorVisuals();
}

async function loadScoreWeights() {
  const payload = await api("/api/recommendation-weights");
  state.appliedRecommendationWeights = { ...payload.weights };
  state.recommendationWeights = { ...payload.weights };
  renderScoreEditor();
}

async function applyScoreWeights() {
  if (!weightsAreComplete(state.recommendationWeights)) {
    toast("五项权重合计需为 100%", true);
    updateScoreEditorVisuals();
    return;
  }
  const button = el("applyScoreWeights");
  button.disabled = true;
  button.textContent = "正在重排";
  try {
    const payload = await api("/api/recommendation-weights", {
      method: "POST",
      body: JSON.stringify({ weights: state.recommendationWeights }),
    });
    state.appliedRecommendationWeights = { ...payload.weights };
    state.recommendationWeights = { ...payload.weights };
    el("sortFilter").value = "recommendation";
    renderScoreEditor();
    button.textContent = "应用并重排";
    el("scoreGuide").open = false;
    toast(`评分标准已应用，${payload.recalculated} 篇本周候选已重新排序`);
    await loadPapers({ preserveSelection: false });
  } catch (error) {
    toast(error.message, true);
    renderScoreEditor();
  } finally {
    button.textContent = "应用并重排";
  }
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

const isProjectMode = () => state.view === "projects";

function streamLoadLabel(view = state.view, topic = state.topic) {
  if (view === "projects") return "正在切换到 GitHub 项目";
  if (view === "recommended") return "正在准备每周精选";
  if (view === "favorites") return "正在读取收藏";
  if (view === "top") return "正在筛选顶会顶刊";
  if (topic) return `正在载入${topic}`;
  return "正在载入论文流";
}

function streamElapsed(request) {
  return `${Math.max(0.1, (performance.now() - request.startedAt) / 1000).toFixed(1)}s`;
}

function isCurrentStreamRequest(request) {
  return Boolean(
    request
    && state.streamRequest?.id === request.id
    && !request.controller?.signal.aborted,
  );
}

function updateStreamLoadStatus(request, label, phase = "loading") {
  if (!request.visible || !isCurrentStreamRequest(request)) return;
  const status = el("streamLoadStatus");
  status.hidden = false;
  status.dataset.state = phase;
  el("streamLoadLabel").textContent = label;
  el("streamLoadTime").textContent = streamElapsed(request);
}

function clearStreamRequestTimer(request) {
  if (request?.timer) {
    window.clearInterval(request.timer);
    request.timer = null;
  }
}

function beginStreamRequest(label = streamLoadLabel(), { append = false } = {}) {
  const previous = state.streamRequest;
  if (previous) {
    clearStreamRequestTimer(previous);
    previous.controller?.abort();
  }
  const request = {
    id: ++state.streamRequestId,
    label,
    visible: !append,
    startedAt: performance.now(),
    timer: null,
    controller: typeof AbortController === "function" ? new AbortController() : null,
  };
  state.streamRequest = request;
  if (request.visible) {
    el("resultCount").textContent = label;
    renderSkeleton(label);
    updateStreamLoadStatus(request, label);
    request.timer = window.setInterval(() => updateStreamLoadStatus(request, request.label), 100);
  }
  return request;
}

function finishStreamRequest(request, message = "已就绪") {
  if (!isCurrentStreamRequest(request)) return;
  clearStreamRequestTimer(request);
  if (!request.visible) {
    state.streamRequest = null;
    return;
  }
  el("paperList").setAttribute("aria-busy", "false");
  updateStreamLoadStatus(request, `${message} · ${streamElapsed(request)}`, "ready");
  state.streamRequest = null;
  window.setTimeout(() => {
    if (state.streamRequestId === request.id && !state.streamRequest) el("streamLoadStatus").hidden = true;
  }, 900);
}

function failStreamRequest(request, message) {
  if (!isCurrentStreamRequest(request)) return;
  clearStreamRequestTimer(request);
  if (!request.visible) {
    state.streamRequest = null;
    return;
  }
  el("paperList").setAttribute("aria-busy", "false");
  updateStreamLoadStatus(request, `${message} · ${streamElapsed(request)}`, "error");
  state.streamRequest = null;
  window.setTimeout(() => {
    if (state.streamRequestId === request.id && !state.streamRequest) el("streamLoadStatus").hidden = true;
  }, 2400);
}

const isRequestAbort = (error) => error?.name === "AbortError";

function applyViewMode() {
  const projectMode = isProjectMode();
  const recommendedMode = state.view === "recommended";
  const topicMode = Boolean(state.topic) && !projectMode && !recommendedMode;
  document.querySelector(".filter-strip").hidden = recommendedMode && state.weeklyKind === "projects";
  const contentGrid = document.querySelector(".content-grid");
  contentGrid.classList.toggle("is-recommended", recommendedMode);
  contentGrid.classList.toggle("is-projects", projectMode);
  if (projectMode) el("readingPane").classList.remove("is-open");
  document.querySelectorAll(".paper-only-filter").forEach((item) => { item.hidden = projectMode || recommendedMode; });
  document.querySelectorAll(".project-only-filter").forEach((item) => { item.hidden = !projectMode; });
  el("dateFilter").closest("label").hidden = recommendedMode;
  document.querySelector(".score-guide").hidden = projectMode || (recommendedMode && state.weeklyKind === "projects");
  el("streamTitle").textContent = projectMode ? "GitHub 项目" : recommendedMode ? "每周精选" : topicMode ? `${state.topic}论文` : "论文流";
  el("loadMoreButton").textContent = projectMode ? "加载更多项目" : "加载更多论文";
  el("weeklyKindTabs").hidden = !recommendedMode;
  el("weeklyPreparation").hidden = !recommendedMode || state.weeklyKind !== "papers" || !state.weeklyPreparation;
  el("readingStatusTabs").hidden = projectMode || recommendedMode;
  document.querySelectorAll("[data-weekly-kind]").forEach((button) => {
    const active = button.dataset.weeklyKind === state.weeklyKind;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  el("overviewTitle").textContent = projectMode ? "今天有哪些项目在更新" : recommendedMode ? "本周先读与复现" : topicMode ? `${state.topic}论文流` : "今天值得读什么";
  el("overviewMessage").textContent = projectMode ? "开源仓库变更与论文关联信号" : recommendedMode ? "自然周研究队列 · 资料后台预处理" : topicMode ? `浏览全部${state.topic}论文，不受每周精选数量限制` : "公开论文元数据与阅读状态";
  el("statTotalLabel").textContent = projectMode ? "GitHub 项目" : recommendedMode ? "论文精选" : "收录论文";
  el("statUnreadLabel").textContent = projectMode ? "今日更新" : recommendedMode ? "候选论文" : "未读";
  el("statFavoriteLabel").textContent = projectMode ? "论文关联" : recommendedMode ? "项目精选" : "已收藏";
  if (state.stats) {
    el("statTotal").textContent = projectMode ? state.stats.project_total : recommendedMode ? state.total : state.stats.total;
    el("statUnread").textContent = projectMode ? state.stats.project_updated_today : recommendedMode ? state.stats.total : state.stats.unread;
    el("statFavorite").textContent = projectMode ? state.stats.project_link_count : recommendedMode ? state.weeklyProjects.length : state.stats.favorites;
    if (!state.stats.refresh.running) el("refreshButton").textContent = projectMode ? "更新全部" : "更新论文";
  }
}

function renderSkeleton(label = streamLoadLabel()) {
  el("emptyState").hidden = true;
  el("loadMoreWrap").hidden = true;
  const detail = isProjectMode() ? "正在读取仓库活跃度与论文关联" : "正在整理公开研究条目";
  el("paperList").setAttribute("aria-busy", "true");
  el("paperList").innerHTML = `<div class="stream-loading-copy"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(detail)}</span></div>${Array.from({ length: 5 }, () => `
    <div class="skeleton-row" aria-hidden="true">
      <div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div>
    </div>`).join("")}`;
}

async function loadProjects({ append = false, request = null } = {}) {
  const expectedView = state.view;
  const activeRequest = request || beginStreamRequest(streamLoadLabel(expectedView, state.topic), { append });
  try {
    const params = projectParams();
    params.set("limit", state.pageSize);
    params.set("offset", append ? state.projects.length : 0);
    const payload = await api(`/api/projects?${params.toString()}`, { signal: activeRequest.controller?.signal });
    if (!isCurrentStreamRequest(activeRequest) || state.view !== expectedView) return;
    state.projects = append ? [...state.projects, ...payload.items] : payload.items;
    state.total = payload.total;
    renderProjects();
    el("resultCount").textContent = `${payload.total} 个`;
    el("loadMoreWrap").hidden = !payload.has_more;
    if (!append && !state.projects.some((project) => project.full_name === state.selectedProject)) {
      state.selectedProject = null;
      showReadingEmpty();
    }
    finishStreamRequest(activeRequest, "GitHub 项目已就绪");
  } catch (error) {
    if (isRequestAbort(error) || !isCurrentStreamRequest(activeRequest)) return;
    if (append) {
      toast(error.message, true);
      failStreamRequest(activeRequest, "项目加载失败");
      return;
    }
    el("paperList").innerHTML = "";
    el("emptyState").hidden = false;
    el("emptyState").querySelector("strong").textContent = "GitHub 项目加载失败";
    el("emptyState").querySelector("p").textContent = error.message;
    toast(error.message, true);
    failStreamRequest(activeRequest, "项目加载失败");
  }
}

function createProjectRow(project, weekly = false) {
    const row = document.createElement("article");
    row.className = `paper-row project-row${weekly ? " is-recommended" : ""}${project.full_name === state.selectedProject ? " is-selected" : ""}`;
    row.tabIndex = 0;
    row.setAttribute("aria-label", `打开项目：${project.full_name}`);
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
        <b>${project.recommendation_score ? `${project.stars} Stars · ${project.linked_paper_count} 篇论文` : `${project.linked_paper_count} 篇论文`}</b>
      </div>`;
    row.addEventListener("click", () => openProjectReader(project.full_name));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openProjectReader(project.full_name);
      }
    });
    return row;
}

function renderProjects() {
  const list = el("paperList");
  list.innerHTML = "";
  list.setAttribute("aria-busy", "false");
  el("emptyState").hidden = state.projects.length > 0;
  if (!state.projects.length) {
    el("emptyState").querySelector("strong").textContent = "当前筛选没有 GitHub 项目";
    el("emptyState").querySelector("p").textContent = "调整主题、语言或起始日期后重试。";
  }
  for (const project of state.projects) {
    const row = createProjectRow(project);
    list.append(row);
  }
}

async function openProject(fullName) {
  return openProjectReader(fullName);
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
          </button>`).join("")}</div>` : `<p>暂未找到高置信度论文关联。项目仍会保留在 GitHub 项目流中。</p>`}
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
      ? `<ul>${value.map((item) => `<li class="math-rich-text">${mathTextMarkup(item)}</li>`).join("")}</ul>`
      : `<p class="math-rich-text">${mathTextMarkup(value || "暂无")}</p>`;
    return `<section class="project-explain-block"><h4>${title}</h4>${content}</section>`;
  };
  return `<div class="explain-head"><h3>代码讲解</h3><div class="explain-actions"><span class="explain-mode">${explanation.mode === "ai" ? `AI 讲解 · ${escapeHtml(explanation.model || "")}` : "元数据导读"}</span><button class="text-button" type="button" data-project-explain>重新生成</button></div></div>
    ${explanation.notice ? `<p class="math-rich-text" style="color:var(--warning)">${mathTextMarkup(explanation.notice)}</p>` : ""}
    <div class="project-explain-grid">
      ${block("项目目标", explanation.overview)}${block("代码架构", explanation.architecture)}${block("关键入口", explanation.entry_points)}
      ${block("代码流程", explanation.code_flow)}${block("安装与运行", explanation.setup)}${block("值得学习", explanation.strengths)}
      ${block("风险与边界", explanation.risks)}${block("阅读顺序", explanation.learning_path)}
    </div>`;
}

function projectFileItemMarkup(item, showReason = false) {
  return `<button class="project-file-item" type="button" title="${escapeHtml(item.path)}" data-project-file="${escapeHtml(item.path)}">
    <span class="project-file-name"><strong>${escapeHtml(item.name)}</strong>${item.important_document ? `<b class="project-file-trilingual">中/英/日</b>` : ""}</span>
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
    metadata: { en: { label: "原文" } },
    language: "en",
  };
  el("projectDocumentPath").textContent = path || "README";
  el("projectDocumentLanguages").hidden = !important;
  el("projectDocumentTranslationStatus").hidden = !important;
  document.querySelectorAll("[data-project-doc-lang]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.projectDocLang === "en");
    button.disabled = false;
  });
  el("projectReadmeContent").innerHTML = htmlContent || "<p>文档内容为空。</p>";
  updateProjectDocumentTranslationStatus("en");
}

function projectDocumentLanguageLabel(target) {
  return { en: "英文", zh: "中文", ja: "日文" }[target] || target;
}

function updateProjectDocumentTranslationStatus(target, phase = "") {
  const status = el("projectDocumentTranslationStatus");
  const documentState = state.projectDocument;
  if (!documentState?.important) {
    status.hidden = true;
    return;
  }
  status.hidden = false;
  status.dataset.state = phase;
  if (phase === "loading") {
    status.textContent = `正在生成${projectDocumentLanguageLabel(target)}`;
    return;
  }
  if (phase === "error") {
    status.textContent = `${projectDocumentLanguageLabel(target)}翻译失败`;
    return;
  }
  const metadata = documentState.metadata?.[target] || {};
  if (target === "en") {
    status.textContent = "原文";
    return;
  }
  status.textContent = `${projectDocumentLanguageLabel(target)} · ${metadata.provider || "翻译已就绪"}${metadata.cached ? " · 已缓存" : ""}`;
}

async function setProjectDocumentLanguage(target) {
  const workspace = state.projectWorkspace;
  const documentState = state.projectDocument;
  if (!workspace || !documentState?.important || !["en", "zh", "ja"].includes(target)) return;
  document.querySelectorAll("[data-project-doc-lang]").forEach((button) => { button.disabled = true; });
  try {
    if (!documentState.html[target]) {
      el("projectReadmeContent").innerHTML = `<div class="reader-explain-empty"><strong>正在生成${target === "zh" ? "中文" : "日文"}文档</strong><p>保留标题、列表、链接与代码块</p></div>`;
      updateProjectDocumentTranslationStatus(target, "loading");
      const payload = await api(`/api/projects/${encodeURIComponent(workspace.project.full_name)}/document`, {
        method: "POST",
        body: JSON.stringify({ path: documentState.path, target }),
      });
      documentState.html[target] = payload.html;
      documentState.metadata[target] = { provider: payload.provider, cached: payload.cached };
    }
    documentState.language = target;
    el("projectReadmeContent").innerHTML = documentState.html[target];
    document.querySelectorAll("[data-project-doc-lang]").forEach((button) => button.classList.toggle("is-active", button.dataset.projectDocLang === target));
    updateProjectDocumentTranslationStatus(target);
  } catch (error) {
    el("projectReadmeContent").innerHTML = documentState.html.en;
    documentState.language = "en";
    document.querySelectorAll("[data-project-doc-lang]").forEach((button) => button.classList.toggle("is-active", button.dataset.projectDocLang === "en"));
    updateProjectDocumentTranslationStatus(target, "error");
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
    content.className = "math-rich-text";
    content.innerHTML = mathTextMarkup(item.content);
    message.append(label, content);
    history.append(message);
  });
  history.scrollTop = history.scrollHeight;
}

async function loadProjectChatHistory(fullName, force = false) {
  try {
    const payload = await api(`/api/projects/${encodeURIComponent(fullName)}/chat`);
    if (state.projectWorkspace?.project?.full_name !== fullName) return;
    if (!force && el("projectChatSubmit").dataset.busy === "1") return;
    renderProjectChatHistory(payload.items);
  } catch (error) {
    if (!force && el("projectChatSubmit").dataset.busy === "1") return;
    renderProjectChatHistory([]);
  }
}

function appendProjectChatMessage(role, content, pending = false) {
  const history = el("projectChatHistory");
  history.querySelector(".chat-empty")?.remove();
  const message = document.createElement("div");
  message.className = `chat-message is-${role}${pending ? " is-pending" : ""}`;
  message.innerHTML = `<strong>${role === "user" ? "你" : "代码导师"}</strong><p class="math-rich-text">${mathTextMarkup(content)}</p>`;
  history.append(message);
  history.scrollTop = history.scrollHeight;
  return message;
}

async function submitProjectQuestion(event) {
  event?.preventDefault();
  const workspace = state.projectWorkspace;
  const input = el("projectChatQuestion");
  const button = el("projectChatSubmit");
  const question = input.value.trim();
  if (button.dataset.busy === "1") return;
  if (!workspace) {
    toast("项目源码尚未载入", true);
    return;
  }
  if (!question) {
    input.focus();
    return;
  }
  button.dataset.busy = "1";
  button.disabled = true;
  button.textContent = "正在回答";
  input.value = "";
  appendProjectChatMessage("user", question);
  const pending = appendProjectChatMessage("assistant", "正在读取当前文件与项目源码…", true);
  try {
    await api(`/api/projects/${encodeURIComponent(workspace.project.full_name)}/chat`, {
      method: "POST",
      body: JSON.stringify({ question, selected_path: state.projectSelectedPath }),
    });
    await loadProjectChatHistory(workspace.project.full_name, true);
    monitorProjectReadingBackup(workspace.project.full_name);
  } catch (error) {
    pending.classList.remove("is-pending");
    pending.querySelector("p").textContent = `发送失败：${error.message}`;
    toast(error.message, true);
  } finally {
    delete button.dataset.busy;
    button.disabled = false;
    button.textContent = "发送问题";
    input.focus();
  }
}

function renderProjectWorkspace(workspace) {
  state.projectWorkspace = workspace;
  const project = workspace.project;
  el("projectReaderTitle").textContent = project.full_name;
  const preparation = workspace.preparation || {};
  el("projectReaderMeta").textContent = `${project.language || "语言未标注"} · ${project.stars} Stars · ${workspace.file_count} 个源码文件 · ${project.linked_paper_count} 篇关联论文${project.size_kb ? ` · 仓库约 ${Math.max(1, Math.round(project.size_kb / 1024))} MB` : ""}${workspace.preparing ? " · 后台准备中" : ""}`;
  el("projectGithubLink").href = project.url;
  el("projectRefreshSource").disabled = Boolean(workspace.preparing);
  renderReadingBackupStatus("projectBackupStatus", workspace.reading_backup_available, workspace.reading_backup_pending);
  if (workspace.preparing && !workspace.ready) {
    const message = preparation.message || "正在后台获取公开仓库源码";
    el("projectFileTree").innerHTML = "";
    el("projectCurrentPath").textContent = "后台准备中";
    el("projectCodeMeta").textContent = "";
    el("projectCodeContent").textContent = `${message}\n\n大型仓库会优先整理 README、依赖配置、入口与核心文本文件。完成后会自动显示。`;
    el("projectReadmeContent").textContent = message;
    el("projectDocumentPath").textContent = "README";
    el("projectDocumentLanguages").hidden = true;
    el("projectRootReadme").hidden = true;
    el("projectExplanation").innerHTML = `<div class="reader-explain-empty"><strong>源码正在准备</strong><p>${escapeHtml(message)}</p></div>`;
    return;
  }
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

async function monitorProjectWorkspace(fullName, token) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 1200));
    if (token !== state.projectWorkspaceToken || !el("projectReaderDialog").open || state.selectedProject !== fullName) return;
    try {
      const workspace = await api(`/api/projects/${encodeURIComponent(fullName)}/workspace`);
      if (token !== state.projectWorkspaceToken || state.selectedProject !== fullName) return;
      renderProjectWorkspace(workspace);
      if (!workspace.preparing) {
        await loadProjectChatHistory(fullName);
        if (!workspace.ready && workspace.error) toast(workspace.error, true);
        return;
      }
    } catch (error) {
      if (attempt >= 3) {
        el("projectCodeContent").textContent = `后台读取状态失败：${error.message}`;
        el("projectReadmeContent").textContent = error.message;
        toast(error.message, true);
        return;
      }
    }
  }
  if (token === state.projectWorkspaceToken) {
    el("projectCodeContent").textContent = "仓库仍在后台准备。请稍后点击“更新源码”重新读取状态。";
  }
}

async function openProjectReader(fullName, force = false) {
  const dialog = el("projectReaderDialog");
  const token = ++state.projectWorkspaceToken;
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
    if (workspace.preparing) monitorProjectWorkspace(fullName, token);
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

async function loadPapers({ preserveSelection = true, append = false, request = null } = {}) {
  const expectedView = state.view;
  const expectedTopic = state.topic;
  const activeRequest = request || beginStreamRequest(streamLoadLabel(expectedView, expectedTopic), { append });
  if (expectedView === "projects") return loadProjects({ append, request: activeRequest });
  try {
    if (expectedView === "recommended") {
      const params = new URLSearchParams();
      const topic = expectedTopic || el("topicFilter").value;
      if (topic) params.set("topic", topic);
      const [payload, projectPayload] = await Promise.all([
        api(`/api/recommendations?${params.toString()}`, { signal: activeRequest.controller?.signal }),
        api("/api/project-recommendations", { signal: activeRequest.controller?.signal }),
      ]);
      if (!isCurrentStreamRequest(activeRequest) || state.view !== expectedView || state.topic !== expectedTopic) return;
      state.papers = payload.items;
      state.weeklyProjects = projectPayload.items;
      state.weeklyProjectCandidateTotal = projectPayload.candidate_total;
      updateWeeklyPreparation(payload.preparation);
      el("weeklyPaperCount").textContent = payload.total;
      el("weeklyProjectCount").textContent = projectPayload.total;
      state.total = payload.total;
      renderPapers();
      el("resultCount").textContent = `${payload.total} 篇论文 · ${projectPayload.total} 个项目 · ${payload.rotation_week_start} 至 ${payload.rotation_week_end}`;
      el("loadMoreWrap").hidden = true;
      el("navRecommendedCount").textContent = payload.total + projectPayload.total;
      if (state.stats) el("statTotal").textContent = payload.total;
      applyViewMode();
      finishStreamRequest(activeRequest, "每周精选已就绪");
      return;
    }
    const params = currentParams();
    params.set("limit", state.pageSize);
    params.set("offset", append ? state.papers.length : 0);
    const payload = await api(`/api/papers?${params.toString()}`, { signal: activeRequest.controller?.signal });
    if (!isCurrentStreamRequest(activeRequest) || state.view !== expectedView || state.topic !== expectedTopic) return;
    state.papers = append ? [...state.papers, ...payload.items] : payload.items;
    state.total = payload.total;
    renderPapers();
    el("resultCount").textContent = `${payload.total} 篇`;
    if (state.stats && state.topic) el("statTotal").textContent = payload.total;
    el("loadMoreWrap").hidden = !payload.has_more;
    if (append) {
      finishStreamRequest(activeRequest);
      return;
    }
    if (!preserveSelection || !state.papers.some((paper) => paper.id === state.selectedId)) {
      state.selectedId = null;
      showReadingEmpty();
    } else if (state.selectedId) {
      await openPaper(state.selectedId, false);
    }
    finishStreamRequest(activeRequest, "论文流已就绪");
  } catch (error) {
    if (isRequestAbort(error) || !isCurrentStreamRequest(activeRequest)) return;
    if (append) {
      toast(error.message, true);
      failStreamRequest(activeRequest, "论文加载失败");
      return;
    }
    el("paperList").innerHTML = "";
    el("emptyState").hidden = false;
    el("emptyState").querySelector("strong").textContent = "论文列表加载失败";
    el("emptyState").querySelector("p").textContent = error.message;
    toast(error.message, true);
    failStreamRequest(activeRequest, "论文加载失败");
  }
}

function weeklyPreparationText(preparation) {
  if (!preparation?.enabled) return { label: "自动备课已关闭", detail: "" };
  const pdf = `${preparation.pdf_ready}/${preparation.pdf_target} PDF`;
  const explanations = `${preparation.explanation_ready}/${preparation.explanation_target} 精读`;
  if (preparation.running) return { label: "本周资料准备中", detail: `${pdf} · ${explanations}` };
  if (preparation.status === "completed") return { label: "本周资料已就绪", detail: `${pdf} · ${explanations}` };
  if (preparation.status === "partial") return { label: "本周资料部分就绪", detail: `${pdf} · ${explanations}` };
  return { label: "本周资料已排队", detail: `${pdf} · ${explanations}` };
}

function updateWeeklyPreparation(preparation, rerender = false) {
  const wasRunning = Boolean(state.weeklyPreparation?.running);
  state.weeklyPreparation = preparation || null;
  const status = el("weeklyPreparation");
  status.hidden = state.view !== "recommended" || state.weeklyKind !== "papers" || !preparation;
  if (!preparation) return;
  const text = weeklyPreparationText(preparation);
  status.dataset.state = preparation.running ? "running" : preparation.status || "scheduled";
  el("weeklyPreparationLabel").textContent = text.label;
  el("weeklyPreparationDetail").textContent = text.detail;
  status.title = preparation.current_title ? `正在处理：${preparation.current_title}` : `更新于 ${preparation.updated_at || "尚未开始"}`;
  for (const paper of state.papers) paper.weekly_preparation = preparation.items?.[paper.id] || paper.weekly_preparation || {};
  if (rerender && state.view === "recommended" && state.weeklyKind === "papers") renderPapers();
  if (state.weeklyPreparationPoll) window.clearInterval(state.weeklyPreparationPoll);
  state.weeklyPreparationPoll = null;
  if (rerender && wasRunning && !preparation.running && state.view === "recommended" && state.weeklyKind === "papers") {
    loadPapers({ preserveSelection: false }).catch((error) => toast(error.message, true));
    return;
  }
  if (preparation.running) {
    state.weeklyPreparationPoll = window.setInterval(async () => {
      try {
        const next = await api("/api/weekly-preparation");
        updateWeeklyPreparation(next, true);
      } catch (error) {
        window.clearInterval(state.weeklyPreparationPoll);
        state.weeklyPreparationPoll = null;
      }
    }, 5000);
  }
}

function renderPapers() {
  const list = el("paperList");
  list.innerHTML = "";
  list.setAttribute("aria-busy", "false");
  const showingWeeklyProjects = state.view === "recommended" && state.weeklyKind === "projects";
  const visibleItems = showingWeeklyProjects ? state.weeklyProjects : state.papers;
  el("emptyState").hidden = visibleItems.length > 0;
  if (!visibleItems.length) {
    el("emptyState").querySelector("strong").textContent = showingWeeklyProjects ? "本周暂无项目精选" : "当前筛选没有论文";
    el("emptyState").querySelector("p").textContent = showingWeeklyProjects ? "更新 GitHub 项目后，下周候选会自动补充。" : "清除部分条件，或点击更新论文拉取最新公开元数据。";
  }
  let currentGroup = "";
  for (const paper of showingWeeklyProjects ? [] : state.papers) {
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
        <span>${paper.is_recommended ? "精选分" : "综合分"}</span>
        ${paper.is_recommended ? weeklyPaperAssetStatus(paper) : ""}
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
  if (showingWeeklyProjects && state.weeklyProjects.length) {
    const group = document.createElement("div");
    group.className = "recommendation-group recommendation-project-group";
    group.innerHTML = `<strong>本周开源项目</strong><span>${state.weeklyProjects.length} 个 · 从 ${state.weeklyProjectCandidateTotal} 个近期候选中筛选</span>`;
    list.append(group);
    state.weeklyProjects.forEach((project) => list.append(createProjectRow(project, true)));
  }
}

function weeklyPaperAssetStatus(paper) {
  const preparation = paper.weekly_preparation || {};
  let label = "等待预处理";
  let stateClass = "";
  if (preparation.explanation_status === "ready") {
    label = "全文精读已就绪";
    stateClass = "is-ready";
  } else if (preparation.fulltext_available || paper.fulltext_cached) {
    label = "全文已缓存";
    stateClass = "is-cached";
  } else if (preparation.pdf_status === "ready" || paper.pdf_cached) {
    label = "PDF 已缓存";
    stateClass = "is-cached";
  } else if (preparation.pdf_status === "unavailable") {
    label = "暂无公开 PDF";
    stateClass = "is-unavailable";
  } else if (paper.public_pdf?.state === "verified") {
    label = paper.public_pdf.label;
    stateClass = "is-ready";
  } else if (paper.public_pdf?.state === "source") {
    label = paper.public_pdf.label;
    stateClass = "is-source";
  } else if (paper.public_pdf?.state === "unavailable") {
    label = paper.public_pdf.label;
    stateClass = "is-unavailable";
  } else if (state.weeklyPreparation?.running && state.weeklyPreparation.current_paper_id === paper.id) {
    label = "后台准备中";
    stateClass = "is-running";
  }
  return `<b class="pdf-state ${stateClass}">${label}</b>`;
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
  const list = (value, autoDetectLegacyEquations = false) => Array.isArray(value)
    ? `<ul>${value.map((item) => `<li class="math-rich-text">${mathTextMarkup(item, autoDetectLegacyEquations)}</li>`).join("")}</ul>`
    : `<p class="math-rich-text">${mathTextMarkup(value || "暂无", autoDetectLegacyEquations)}</p>`;
  return `
    <div class="explain-head">
      <h3>中文讲解</h3>
      <div class="explain-actions">
        <span class="explain-mode">${explanation.mode === "ai" ? `${explanation.reading_basis === "fulltext" ? "全文精读" : "摘要讲解"}${explanation.model ? ` · ${escapeHtml(explanation.model)}` : ""}` : "摘要导读"}</span>
        <button class="text-button" type="button" data-explain>重新生成</button>
      </div>
    </div>
    ${explanation.notice ? `<p class="math-rich-text" style="color:var(--warning);margin-bottom:12px">${mathTextMarkup(explanation.notice)}</p>` : ""}
    <div class="explain-grid">
      <div class="explain-block"><h4>一句话理解</h4>${list(explanation.one_sentence)}</div>
      <div class="explain-block"><h4>论文结构</h4>${list(explanation.paper_structure)}</div>
      <div class="explain-block"><h4>研究背景</h4>${list(explanation.background)}</div>
      <div class="explain-block"><h4>解决的问题</h4>${list(explanation.problem)}</div>
      <div class="explain-block"><h4>方法路线</h4>${list(explanation.method)}</div>
      <div class="explain-block"><h4>算法流程</h4>${list(explanation.algorithm_flow)}</div>
      <div class="explain-block"><h4>公式与推导</h4>${list(explanation.derivation, true)}</div>
      <div class="explain-block"><h4>实验怎么看</h4>${list(explanation.experiments)}</div>
      <div class="explain-block"><h4>结论链条</h4>${list(explanation.conclusions)}</div>
      <div class="explain-block"><h4>主要贡献</h4>${list(explanation.contributions)}</div>
      <div class="explain-block"><h4>局限与核查点</h4>${list(explanation.limitations)}</div>
      <div class="explain-block"><h4>阅读前置</h4>${list(explanation.prerequisites)}</div>
      <div class="explain-block"><h4>是否适合你</h4>${list(explanation.fit)}</div>
      ${Array.isArray(explanation.evidence) && explanation.evidence.length ? `
        <div class="explain-block"><h4>原文证据</h4><ul>${explanation.evidence.map((item) => `<li class="math-rich-text">${mathTextMarkup(item.claim || "")}${item.pages ? ` <b>${escapeHtml(Array.isArray(item.pages) ? item.pages.join("、") : item.pages)}</b>` : ""}</li>`).join("")}</ul></div>` : ""}
      ${Array.isArray(explanation.glossary) && explanation.glossary.length ? `
        <div class="explain-block"><h4>术语表</h4><dl class="glossary">${explanation.glossary.map((item) => `<div><dt class="math-rich-text">${mathTextMarkup(item.term)}</dt><dd class="math-rich-text">${mathTextMarkup(item.explanation)}</dd></div>`).join("")}</dl></div>` : ""}
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
  return state.papers.find((paper) => paper.id === paperId && paper.score_breakdown?.length) || null;
}

function renderReaderScore(paper) {
  const recommendation = recommendationFor(paper.id);
  if (!recommendation?.score_breakdown?.length) {
    el("readerScore").innerHTML = "";
    return;
  }
  el("readerScore").innerHTML = `
    <section class="reader-score-block">
      <div class="reader-score-total"><strong>${Math.round(recommendation.recommendation_score)}</strong><span>${recommendation.is_recommended ? `${escapeHtml(recommendation.recommendation_topic)}精选分` : "综合评分"}</span></div>
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
  if (tab === "translate" && state.readerAsset?.fulltext_available && !state.translationPageText) {
    loadTranslationPage(Number(el("translationPage").value) || 1);
  }
}

function readerSelectionContainer(node) {
  if (!node) return null;
  if (node.nodeType === Node.ELEMENT_NODE) return node;
  return node.parentElement || null;
}

function updateTranslationSelectionUi() {
  const selection = state.translationSelection;
  const status = el("translationSelectionStatus");
  const button = el("translateSelectionButton");
  button.disabled = !selection?.text;
  status.hidden = !selection?.text;
  if (!selection?.text) {
    el("translationSelectionMeta").textContent = "";
    return;
  }
  const page = selection.page ? ` · 第 ${selection.page} 页` : "";
  const truncation = selection.truncated ? " · 已截取前 16,000 字" : "";
  el("translationSelectionMeta").textContent = `已选 ${selection.text.length.toLocaleString()} 字${page}${truncation}`;
}

function clearTranslationSelection({ clearNativeSelection = true } = {}) {
  state.translationSelection = null;
  updateTranslationSelectionUi();
  if (clearNativeSelection) globalThis.getSelection?.()?.removeAllRanges();
}

function setTranslationSelection(value, page = 0) {
  const normalized = String(value || "").replace(/\u00a0/g, " ").trim();
  if (!normalized) return;
  const text = normalized.slice(0, 16000);
  state.translationSelection = {
    text,
    page: Number(page) || 0,
    truncated: normalized.length > text.length,
  };
  updateTranslationSelectionUi();
}

function currentPdfPageNumber() {
  const viewer = el("pdfCanvasViewer");
  const pages = [...viewer.querySelectorAll(".pdf-page")];
  if (!pages.length) return Number(el("translationPage").value) || 1;
  const viewerTop = viewer.getBoundingClientRect().top;
  return Number(pages.reduce((closest, page) => {
    const distance = Math.abs(page.getBoundingClientRect().top - viewerTop);
    return distance < closest.distance ? { page, distance } : closest;
  }, { page: pages[0], distance: Number.POSITIVE_INFINITY }).page.dataset.page) || 1;
}

function captureReaderTextSelection() {
  if (!el("readerDialog").open) return;
  const selection = globalThis.getSelection?.();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return;
  const container = readerSelectionContainer(selection.getRangeAt(0).commonAncestorContainer);
  if (!container) return;
  const source = el("translationSource");
  const pdfViewer = el("pdfCanvasViewer");
  if (!source.contains(container) && !pdfViewer.contains(container)) return;
  const page = source.contains(container)
    ? Number(el("translationPage").value) || 1
    : Number(container.closest(".pdf-page")?.dataset.page) || 1;
  setTranslationSelection(selection.toString(), page);
  setReaderTab("translate");
  if (state.readerAsset?.fulltext_available && Number(el("translationPage").value) !== page) {
    loadTranslationPage(page);
  }
}

function openReaderText() {
  const page = currentPdfPageNumber();
  setReaderTab("translate");
  if (state.readerAsset?.fulltext_available) loadTranslationPage(page);
}

function setPdfStatus(title, detail = "", retry = false) {
  el("pdfStatus").hidden = false;
  el("pdfStatus").innerHTML = `<strong>${escapeHtml(title)}</strong>${detail ? `<span>${escapeHtml(detail)}</span>` : ""}`;
  el("pdfRetryButton").hidden = !retry;
  el("pdfFrame").hidden = true;
  el("pdfActions").hidden = true;
  el("pdfUnavailable").hidden = true;
}

function releaseReaderPdf() {
  state.readerPdfToken += 1;
  state.readerPdfObserver?.disconnect();
  state.readerPdfObserver = null;
  const loadingTask = state.readerPdfLoadingTask;
  state.readerPdfLoadingTask = null;
  if (loadingTask?.destroy) Promise.resolve(loadingTask.destroy()).catch(() => {});
  const documentTask = state.readerPdfDocument;
  state.readerPdfDocument = null;
  if (documentTask?.destroy) Promise.resolve(documentTask.destroy()).catch(() => {});
  el("pdfCanvasViewer").replaceChildren();
  el("pdfCanvasViewer").hidden = true;
  el("pdfFrame").src = "about:blank";
  el("pdfFrame").hidden = true;
  el("pdfActions").hidden = true;
  el("pdfRetryButton").hidden = true;
  el("pdfOpenButton").href = "#";
  el("pdfOpenButton").textContent = "新窗口打开";
  if (state.readerPdfObjectUrl) URL.revokeObjectURL(state.readerPdfObjectUrl);
  state.readerPdfObjectUrl = "";
  state.readerPdfImageUrls.forEach((url) => URL.revokeObjectURL(url));
  state.readerPdfImageUrls = [];
  state.readerPdfImageQueue = Promise.resolve();
}

async function renderPdfTextLayer(page, viewport, surface, canvas, token) {
  if (!globalThis.pdfjsLib?.Util) return;
  try {
    const textContent = await page.getTextContent();
    if (state.readerPdfToken !== token) return;
    const layer = document.createElement("div");
    layer.className = "pdf-text-layer";
    layer.setAttribute("aria-label", "可选择的论文正文");
    const fragment = document.createDocumentFragment();
    const context = canvas.getContext("2d");
    for (const item of textContent.items) {
      if (!item.str) continue;
      const transform = globalThis.pdfjsLib.Util.transform(viewport.transform, item.transform);
      const angle = Math.atan2(transform[1], transform[0]);
      const fontHeight = Math.max(1, Math.hypot(transform[2], transform[3]));
      const style = textContent.styles[item.fontName] || {};
      const ascent = style.ascent ? style.ascent * fontHeight : fontHeight;
      const expectedWidth = Math.abs((item.width || 0) * viewport.scale);
      context.font = `${fontHeight}px sans-serif`;
      const measuredWidth = context.measureText(item.str).width || expectedWidth || 1;
      const span = document.createElement("span");
      span.textContent = item.str;
      span.style.left = `${transform[4] + ascent * Math.sin(angle)}px`;
      span.style.top = `${transform[5] - ascent * Math.cos(angle)}px`;
      span.style.fontSize = `${fontHeight}px`;
      span.style.transform = `rotate(${angle}rad) scaleX(${expectedWidth / measuredWidth || 1})`;
      fragment.append(span);
    }
    layer.append(fragment);
    surface.append(layer);
  } catch {
    // The visual PDF remains usable when a document does not expose a text layer.
  }
}

async function renderPdfPage(pdfDocument, pageNumber, shell, token) {
  if (shell.dataset.rendered || shell.dataset.rendering || state.readerPdfToken !== token) return;
  shell.dataset.rendering = "1";
  shell.classList.add("is-rendering");
  try {
    const page = await pdfDocument.getPage(pageNumber);
    if (state.readerPdfToken !== token) return;
    const baseViewport = page.getViewport({ scale: 1 });
    const viewerWidth = Math.max(280, el("pdfCanvasViewer").clientWidth - 36);
    const viewport = page.getViewport({ scale: viewerWidth / baseViewport.width });
    const outputScale = Math.min(2, window.devicePixelRatio || 1);
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;
    shell.style.minHeight = `${Math.floor(viewport.height)}px`;
    const surface = document.createElement("div");
    surface.className = "pdf-page-surface";
    surface.style.width = `${Math.floor(viewport.width)}px`;
    surface.style.height = `${Math.floor(viewport.height)}px`;
    surface.append(canvas);
    shell.prepend(surface);
    await Promise.all([
      page.render({
        canvasContext: canvas.getContext("2d", { alpha: false }),
        viewport,
        transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0],
      }).promise,
      renderPdfTextLayer(page, viewport, surface, canvas, token),
    ]);
    shell.dataset.rendered = "1";
  } finally {
    delete shell.dataset.rendering;
    shell.classList.remove("is-rendering");
  }
}

function pdfPageImageUrl(asset, pageNumber) {
  return `/api/papers/${encodeURIComponent(asset.paper_id)}/page-image?page=${pageNumber}`;
}

function renderPdfImageError(asset, pageNumber, shell, token, error) {
  if (state.readerPdfToken !== token) return;
  shell.dataset.failed = "1";
  const message = document.createElement("span");
  message.className = "pdf-page-error";
  message.textContent = `第 ${pageNumber} 页兼容图像读取失败：${String(error?.message || error).slice(0, 90)}`;
  const retry = document.createElement("button");
  retry.className = "pdf-page-retry";
  retry.type = "button";
  retry.textContent = "重试此页";
  retry.addEventListener("click", () => {
    delete shell.dataset.failed;
    message.remove();
    retry.remove();
    queuePdfImagePage(asset, pageNumber, shell, token).catch(() => {});
  });
  shell.append(message, retry);
}

function queuePdfImagePage(asset, pageNumber, shell, token) {
  if (shell.dataset.rendered) return Promise.resolve(true);
  if (shell.dataset.queued || shell.dataset.rendering || shell.dataset.failed || state.readerPdfToken !== token) {
    return Promise.resolve(false);
  }
  shell.dataset.queued = "1";
  const task = state.readerPdfImageQueue.catch(() => {}).then(async () => {
    delete shell.dataset.queued;
    return renderPdfImagePage(asset, pageNumber, shell, token);
  });
  state.readerPdfImageQueue = task.catch(() => {});
  return task;
}

async function renderPdfImagePage(asset, pageNumber, shell, token) {
  if (shell.dataset.rendered) return true;
  if (shell.dataset.rendering || shell.dataset.failed || state.readerPdfToken !== token) return false;
  shell.dataset.rendering = "1";
  shell.classList.add("is-rendering");
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), PDF_PAGE_IMAGE_TIMEOUT_MS);
  let objectUrl = "";
  try {
    const response = await fetchShared(pdfPageImageUrl(asset, pageNumber), {
      headers: { Accept: "image/jpeg", ...NGROK_BYPASS_HEADERS },
      signal: controller.signal,
    });
    if (!response.ok) {
      const raw = await response.text();
      let message = `请求失败：${response.status}`;
      try { message = JSON.parse(raw).error || message; } catch {}
      throw new Error(message);
    }
    const imageBlob = await response.blob();
    if (!imageBlob.type.startsWith("image/")) throw new Error("服务没有返回页面图像");
    objectUrl = URL.createObjectURL(imageBlob);
    const image = new Image();
    image.alt = `论文第 ${pageNumber} 页`;
    image.decoding = "async";
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("页面图像解码失败"));
      image.src = objectUrl;
    });
    if (state.readerPdfToken !== token) {
      URL.revokeObjectURL(objectUrl);
      return false;
    }
    state.readerPdfImageUrls.push(objectUrl);
    shell.prepend(image);
    shell.dataset.rendered = "1";
    return true;
  } catch (error) {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    if (state.readerPdfToken === token) renderPdfImageError(asset, pageNumber, shell, token, error);
    return false;
  } finally {
    window.clearTimeout(timeout);
    delete shell.dataset.rendering;
    shell.classList.remove("is-rendering");
  }
}

async function renderPdfImageDocument(asset, token) {
  const pageCount = Math.max(0, Number(asset.page_count) || 0);
  if (!pageCount) return false;
  const viewer = el("pdfCanvasViewer");
  const fragment = document.createDocumentFragment();
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const shell = document.createElement("section");
    shell.className = "pdf-page";
    shell.dataset.page = String(pageNumber);
    shell.innerHTML = `<span class="pdf-page-label">${pageNumber} / ${pageCount}</span>`;
    fragment.append(shell);
  }
  viewer.replaceChildren(fragment);
  viewer.hidden = false;
  const firstPage = viewer.querySelector('[data-page="1"]');
  await queuePdfImagePage(asset, 1, firstPage, token);
  state.readerPdfObserver = new IntersectionObserver((entries) => {
    entries.filter((entry) => entry.isIntersecting).forEach((entry) => {
      const shell = entry.target;
      queuePdfImagePage(asset, Number(shell.dataset.page), shell, token).then((rendered) => {
        if (rendered) state.readerPdfObserver?.unobserve(shell);
      }).catch(() => {});
    });
  }, { root: viewer, rootMargin: "240px 0px" });
  viewer.querySelectorAll('.pdf-page:not([data-page="1"])').forEach((shell) => state.readerPdfObserver.observe(shell));
  return true;
}

async function renderPdfDocument(url, token) {
  if (!globalThis.pdfjsLib) return false;
  const loadingTask = globalThis.pdfjsLib.getDocument({
    url,
    httpHeaders: NGROK_BYPASS_HEADERS,
    withCredentials: true,
    rangeChunkSize: 256 * 1024,
  });
  state.readerPdfLoadingTask = loadingTask;
  let timedOut = false;
  const timeout = window.setTimeout(() => {
    timedOut = true;
    if (state.readerPdfLoadingTask === loadingTask) loadingTask.destroy();
  }, PDF_LOAD_TIMEOUT_MS);
  let pdfDocument;
  try {
    pdfDocument = await loadingTask.promise;
  } catch (error) {
    if (timedOut) throw new Error("从云端读取 PDF 超时，请检查网络后重试。");
    throw error;
  } finally {
    window.clearTimeout(timeout);
    if (state.readerPdfLoadingTask === loadingTask) state.readerPdfLoadingTask = null;
  }
  if (state.readerPdfToken !== token) {
    await pdfDocument.destroy();
    return true;
  }
  state.readerPdfDocument = pdfDocument;
  const viewer = el("pdfCanvasViewer");
  const fragment = document.createDocumentFragment();
  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
    const shell = document.createElement("section");
    shell.className = "pdf-page";
    shell.dataset.page = String(pageNumber);
    shell.innerHTML = `<span class="pdf-page-label">${pageNumber} / ${pdfDocument.numPages}</span>`;
    fragment.append(shell);
  }
  viewer.replaceChildren(fragment);
  viewer.hidden = false;
  const firstPage = viewer.querySelector('[data-page="1"]');
  await renderPdfPage(pdfDocument, 1, firstPage, token);
  state.readerPdfObserver = new IntersectionObserver((entries) => {
    entries.filter((entry) => entry.isIntersecting).forEach((entry) => {
      const shell = entry.target;
      renderPdfPage(pdfDocument, Number(shell.dataset.page), shell, token).catch(() => {});
      state.readerPdfObserver?.unobserve(shell);
    });
  }, { root: viewer, rootMargin: "1200px 0px" });
  viewer.querySelectorAll(".pdf-page:not([data-rendered])").forEach((shell) => state.readerPdfObserver.observe(shell));
  return true;
}

function pdfLoadErrorMessage(error) {
  const message = String(error?.message || error || "未知错误");
  if (/401/.test(message)) {
    const next = `${window.location.pathname}${window.location.search}`;
    window.location.replace(`/login?next=${encodeURIComponent(next)}`);
    return "登录已失效，正在返回登录页。";
  }
  if (/timeout|超时/i.test(message)) return "从云端读取超时。网络稳定后可点击重试。";
  if (/503|network|fetch|unexpected server response/i.test(message)) {
    return "云端 PDF 暂时无法读取。请稍后重试；服务会自动复用已恢复的本地缓存。";
  }
  return `PDF 载入失败：${message.slice(0, 160)}`;
}

async function loadReaderPdf(asset) {
  const requestedPaperId = asset.paper_id;
  releaseReaderPdf();
  const token = state.readerPdfToken;
  setPdfStatus("正在载入 PDF", asset.cloud_available && !asset.local_cached ? "正在从云端读取" : "正在读取已缓存文件");
  try {
    if (!el("readerDialog").open || state.readerPaper?.id !== requestedPaperId || state.readerPdfToken !== token) return;
    const nativeUrl = `${asset.pdf_url}#view=FitH`;
    el("pdfOpenButton").href = nativeUrl;
    if (prefersCompatiblePdfPages()) {
      // Avoid WebKit canvas stalls by delivering rasterized pages lazily from the host.
      el("pdfOpenButton").textContent = "系统阅读器打开";
      const renderedWithPageImages = await renderPdfImageDocument(asset, token);
      if (!renderedWithPageImages) {
        el("pdfFrame").src = nativeUrl;
        el("pdfFrame").hidden = false;
      }
      if (!el("readerDialog").open || state.readerPaper?.id !== requestedPaperId || state.readerPdfToken !== token) return;
      el("pdfStatus").hidden = true;
      el("pdfRetryButton").hidden = true;
      el("pdfUnavailable").hidden = true;
      el("pdfActions").hidden = false;
      return;
    }
    const renderedWithPdfJs = await renderPdfDocument(asset.pdf_url, token);
    if (!renderedWithPdfJs) throw new Error("当前浏览器无法启动 PDF 阅读器");
    if (!el("readerDialog").open || state.readerPaper?.id !== requestedPaperId || state.readerPdfToken !== token) return;
    el("pdfStatus").hidden = true;
    el("pdfRetryButton").hidden = true;
    el("pdfUnavailable").hidden = true;
    el("pdfActions").hidden = false;
  } catch (error) {
    if (!el("readerDialog").open || state.readerPdfToken !== token) return;
    setPdfStatus("PDF 载入失败", pdfLoadErrorMessage(error), true);
  }
}

function updateReaderStorageAction() {
  const button = el("readerCloudButton");
  const asset = state.readerAsset;
  const selectedMode = el("readerStorageMode").value;
  el("readerShareConfirmWrap").hidden = !state.storage?.shared_library || selectedMode === "local";
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
  if (asset.cloud_available && selectedMode === asset.storage_mode) {
    button.disabled = true;
    button.textContent = "保存位置已应用";
    return;
  }
  button.disabled = !asset.local_cached && !asset.cloud_available;
  button.textContent = asset.cloud_available ? "应用保存位置" : "立即转存云端";
}

function confirmSharedPdfUpload() {
  if (!state.storage?.shared_library || el("readerStorageMode").value === "local" || el("readerShareConfirmed").checked) return true;
  toast("请先确认你有权把这份 PDF 上传到共享库", true);
  el("readerShareConfirmed").focus();
  return false;
}

function renderReaderAsset(paper, asset, reloadPdf = true) {
  state.readerAsset = asset;
  el("translationPage").max = Math.max(1, asset.page_count || 1);
  el("translationPageCount").textContent = `/ ${asset.page_count || 0}`;
  el("readerStorageMode").value = asset.storage_mode || el("readerStorageMode").value;
  updateReaderStorageAction();
  if (asset.pdf_available) {
    el("pdfUnavailable").hidden = true;
    if (reloadPdf) loadReaderPdf(asset);
    else if (state.readerPdfObjectUrl) {
      el("pdfStatus").hidden = true;
      if (state.readerPdfDocument) el("pdfCanvasViewer").hidden = false;
      else el("pdfFrame").hidden = false;
      el("pdfActions").hidden = false;
    }
    el("readerCacheButton").textContent = asset.cloud_available && !asset.local_cached ? "从云端读取" : "PDF 已缓存";
    if (asset.fulltext_available) loadTranslationPage(1);
  } else {
    releaseReaderPdf();
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
    const response = await fetchShared(`/api/papers/${encodeURIComponent(paper.id)}/import`, {
      method: "POST",
      headers: {
        "Content-Type": "application/pdf",
        ...NGROK_BYPASS_HEADERS,
        "X-Paperfield-Filename": encodeURIComponent(file.name),
        "X-Paperfield-Storage": el("readerStorageMode").value,
        "X-Paperfield-Share-Confirmed": el("readerShareConfirmed").checked ? "1" : "0",
      },
      body: file,
    });
    const raw = await response.text();
    let asset;
    try { asset = JSON.parse(raw); } catch {
      throw new Error(raw.includes("ERR_NGROK_6024") ? "ngrok 访问确认页拦截了上传请求" : "上传接口返回了非 JSON 内容");
    }
    if (response.status === 401 && asset.auth_required) {
      const next = `${window.location.pathname}${window.location.search}`;
      window.location.replace(`/login?next=${encodeURIComponent(next)}`);
    }
    if (!response.ok) throw new Error(asset.error || `导入失败：${response.status}`);
    renderReaderAsset(paper, asset);
    toast(`已导入 ${asset.page_count} 页 PDF`);
    if (state.auth?.host_ai_allowed !== false) await generateReaderExplanation();
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
  if (!confirmSharedPdfUpload()) return;
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
        body: JSON.stringify({ remove_local: mode === "cloud", share_confirmed: el("readerShareConfirmed").checked }),
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
  el("sharedStorageLimitRow").hidden = !payload.shared_library;
  el("sharedStorageMaxMb").value = settings.shared_storage_max_mb || 2048;
  el("r2BillingCycleDay").value = settings.r2_billing_cycle_day || 1;
  updateReaderStorageAction();
  el("storageEntryStatus").textContent = payload.shared_library ? "共享 R2" : payload.configured ? payload.provider : "本地";
  const usage = payload.usage || {};
  el("cloudUsageMeta").textContent = payload.configured
    ? `${payload.provider} · ${payload.bucket}${payload.namespace ? ` / ${payload.namespace}` : ""} · ${usage.period_start || ""} 至 ${usage.period_end || ""} · ${usage.object_count || 0} 个对象`
    : `尚未配置对象存储${payload.missing_configuration?.length ? ` · 缺少 ${payload.missing_configuration.join("、")}` : ""}`;
  const meters = [
    [
      payload.shared_library ? "共享库容量" : "存储容量",
      payload.shared_library ? usage.shared_storage_percent || 0 : usage.storage_percent || 0,
      payload.shared_library
        ? `${formatStorageBytes(usage.shared_storage_bytes || 0)} / ${formatStorageBytes(usage.shared_storage_limit_bytes || 0)}`
        : `${formatStorageBytes(usage.storage_bytes || 0)} / 10 GB`,
    ],
    ["A 类操作", usage.class_a_percent || 0, `${Number(usage.class_a || 0).toLocaleString()} / 1,000,000`],
    ["B 类操作", usage.class_b_percent || 0, `${Number(usage.class_b || 0).toLocaleString()} / 10,000,000`],
  ];
  el("storageUsageMeters").innerHTML = meters.map(([label, percent, detail]) => `<div class="usage-meter"><div><strong>${label}</strong><span>${detail}</span></div><progress max="100" value="${Math.min(100, percent)}"></progress><small>${percent.toFixed(3)}% ${payload.shared_library && label === "共享库容量" ? "共享上限" : "免费额度"}</small></div>`).join("");
  const estimate = Number(usage.estimated_overage_usd || 0);
  el("storageUsageNotice").textContent = payload.configured
    ? `${usage.estimate_notice || ""} 当前估算超额费用：$${estimate.toFixed(4)}。${usage.inventory_error ? ` 清点失败：${usage.inventory_error}` : ""}`
    : "配置后，Paperfield 会每天清点一次桶容量，并统计自身产生的 A/B 类操作。";
}

async function loadStorageStatus(refresh = false) {
  const payload = await api(`/api/storage${refresh ? "?refresh=1" : ""}`);
  renderStorageStatus(payload);
}

function renderAiModels(payload) {
  state.aiModels = payload;
  const section = el("aiSettingsSection");
  section.hidden = false;
  const provider = payload.provider || "当前 API";
  const baseHost = payload.base_host ? ` · ${payload.base_host}` : "";
  const wire = payload.wire_api === "chat_completions" ? "Chat Completions" : "Responses";
  el("aiModelMeta").textContent = payload.available
    ? `${provider}${baseHost} · ${wire}`
    : "当前没有可用的大模型配置";
  const overrideActive = payload.model_source === "Paperfield 网页选择";
  const activeModel = overrideActive ? payload.model || "" : "";
  const models = [...new Set((payload.models || []).filter((model) => model && model !== CUSTOM_AI_MODEL_VALUE))];
  const selector = el("aiModelSelect");
  const listedActiveModel = activeModel && models.includes(activeModel);
  selector.innerHTML = [
    `<option value="">跟随 CC Switch 默认模型${payload.configured_model || payload.model ? `：${escapeHtml(payload.configured_model || payload.model)}` : ""}</option>`,
    ...models.map((model) => `<option value="${escapeHtml(model)}">${escapeHtml(model)}</option>`),
    `<option value="${CUSTOM_AI_MODEL_VALUE}">自定义模型名称...</option>`,
  ].join("");
  selector.value = activeModel ? (listedActiveModel ? activeModel : CUSTOM_AI_MODEL_VALUE) : "";
  el("aiCustomModelInput").value = activeModel && !listedActiveModel ? activeModel : "";
  updateAiModelCustomField();
  const availableEfforts = new Set(["", "low", "medium", "high", "xhigh", "max", "ultra"]);
  el("aiReasoningEffort").value = availableEfforts.has(payload.reasoning_effort || "") ? payload.reasoning_effort || "" : "";
  const modelCount = models.length;
  el("aiModelNotice").textContent = payload.error
    ? `${payload.error}。当前仍可选择默认模型或手动填写模型名称。`
    : `已读取 ${modelCount} 个可调用模型。推理强度会按当前模型和 API 传递；不支持的档位会自动降级。`;
}

function selectedAiModel() {
  return el("aiModelSelect").value === CUSTOM_AI_MODEL_VALUE
    ? el("aiCustomModelInput").value.trim()
    : el("aiModelSelect").value;
}

function updateAiModelCustomField({ focus = false } = {}) {
  const custom = el("aiModelSelect").value === CUSTOM_AI_MODEL_VALUE;
  const row = el("aiCustomModelRow");
  row.hidden = !custom;
  if (custom && focus) el("aiCustomModelInput").focus();
}

async function loadAiModels() {
  const section = el("aiSettingsSection");
  if (state.auth?.enabled && !state.auth.host_ai_allowed) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  el("aiModelMeta").textContent = "正在读取当前 API 可调用的模型";
  el("aiModelNotice").textContent = "模型名称和密钥不会发送到其他账户。";
  try {
    renderAiModels(await api("/api/ai/models"));
  } catch (error) {
    el("aiModelMeta").textContent = "无法读取模型列表";
    el("aiModelNotice").textContent = error.message;
  }
}

async function saveAiModel() {
  const button = el("saveAiModel");
  button.disabled = true;
  try {
    const payload = await api("/api/ai/model", {
      method: "POST",
      body: JSON.stringify({
        model: selectedAiModel(),
        reasoning_effort: el("aiReasoningEffort").value,
      }),
    });
    await loadAiModels();
    await loadStats();
    const reasoningLabels = { "": "自动", low: "轻度", medium: "中", high: "高", xhigh: "极高", max: "最高", ultra: "极限" };
    const modelLabel = payload.selected_model || "CC Switch 默认模型";
    toast(`已应用 ${modelLabel} · 推理${reasoningLabels[payload.selected_reasoning_effort || ""] || "自动"}`);
  } catch (error) {
    toast(error.message, true);
  } finally {
    button.disabled = false;
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
    content.className = "math-rich-text";
    content.innerHTML = mathTextMarkup(item.content);
    message.append(label, content);
    history.append(message);
  });
  history.scrollTop = history.scrollHeight;
}

async function loadChatHistory(paperId) {
  try {
    const payload = await api(`/api/papers/${encodeURIComponent(paperId)}/chat`);
    renderChatHistory(payload.items);
    return true;
  } catch (error) {
    renderChatHistory([]);
    return false;
  }
}

function appendPaperChatMessage(role, content, options = {}) {
  const history = el("chatHistory");
  if (history.querySelector(".chat-empty")) history.innerHTML = "";
  const message = document.createElement("div");
  message.className = `chat-message is-${role}${options.pending ? " is-pending" : ""}${options.error ? " is-error" : ""}`;
  const label = document.createElement("strong");
  label.textContent = role === "user" ? "你" : "论文导师";
  message.append(label);
  if (options.meta) {
    const meta = document.createElement("span");
    meta.className = "chat-message-meta";
    meta.textContent = options.meta;
    message.append(meta);
  }
  const body = document.createElement("p");
  body.className = "math-rich-text";
  body.innerHTML = mathTextMarkup(content);
  message.append(body);
  history.append(message);
  history.scrollTop = history.scrollHeight;
  return message;
}

async function openReader(paperId) {
  const dialog = el("readerDialog");
  releaseReaderPdf();
  state.selectedId = paperId;
  state.readerPaper = null;
  state.readerAsset = null;
  state.translationPageText = "";
  state.translationLoadRequestId += 1;
  clearTranslationSelection({ clearNativeSelection: false });
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
    el("readerShareConfirmed").checked = false;
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
  const requestId = ++state.translationLoadRequestId;
  try {
    const page = await api(`/api/papers/${encodeURIComponent(paper.id)}/text?page=${pageNumber}`);
    if (requestId !== state.translationLoadRequestId || state.readerPaper?.id !== paper.id) return;
    el("translationPage").value = page.page;
    el("translationPageCount").textContent = `/ ${page.page_count}`;
    state.translationPageText = page.text || "";
    el("translationSource").textContent = state.translationPageText || "该页没有提取到可翻译文本。";
    el("translationResult").textContent = "";
    if (state.translationSelection?.page !== page.page) clearTranslationSelection({ clearNativeSelection: false });
  } catch (error) {
    if (requestId !== state.translationLoadRequestId || state.readerPaper?.id !== paper.id) return;
    state.translationPageText = "";
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

function translationSourceLanguage(text) {
  const latin = (String(text).match(/[A-Za-z]/g) || []).length;
  const cjk = (String(text).match(/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || []).length;
  return latin >= cjk ? "en" : "auto";
}

async function translateText(text) {
  const source = translationSourceLanguage(text);
  const local = source === "en" ? await localBrowserTranslate(text) : null;
  if (local) return { text: local, provider: "浏览器本机翻译" };
  const payload = await api("/api/translate", {
    method: "POST",
    body: JSON.stringify({ text, source, target: "zh" }),
  });
  return { text: payload.text, provider: payload.provider };
}

async function translateCurrentPage() {
  if (!state.translationPageText) {
    await loadTranslationPage(Number(el("translationPage").value) || 1);
  }
  const text = state.translationPageText.trim();
  if (!text) return;
  el("translatePageButton").disabled = true;
  el("translationResult").textContent = "正在翻译…";
  try {
    const result = await translateText(text);
    el("translationResult").textContent = result.text;
    el("translationProvider").textContent = `${result.provider} · 未使用 GPT`;
  } catch (error) {
    el("translationResult").textContent = error.message;
  } finally {
    el("translatePageButton").disabled = false;
  }
}

async function translateSelectedText() {
  const selection = state.translationSelection;
  if (!selection?.text) return;
  el("translateSelectionButton").disabled = true;
  el("translationResult").textContent = "正在翻译选中文字…";
  try {
    const result = await translateText(selection.text);
    el("translationResult").textContent = result.text;
    el("translationProvider").textContent = `选中文字 · ${result.provider} · 未使用 GPT`;
  } catch (error) {
    el("translationResult").textContent = error.message;
  } finally {
    el("translateSelectionButton").disabled = !state.translationSelection?.text;
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
  if (state.topic && options.topics.includes(state.topic)) el("topicFilter").value = state.topic;
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
  el("authorOptions").innerHTML = "";
}

async function loadAuthorOptions(value) {
  const query = value.trim();
  if (query.length < 2) {
    el("authorOptions").innerHTML = "";
    return;
  }
  const requestId = ++state.authorRequestId;
  try {
    const payload = await api(`/api/authors?q=${encodeURIComponent(query)}`);
    if (requestId !== state.authorRequestId) return;
    el("authorOptions").innerHTML = (payload.items || [])
      .map((author) => `<option value="${escapeHtml(author)}"></option>`)
      .join("");
  } catch {
    if (requestId === state.authorRequestId) el("authorOptions").innerHTML = "";
  }
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
  const authorSuggestions = debounce(() => loadAuthorOptions(el("authorFilter").value), 180);
  el("scoreWeightControls").addEventListener("input", (event) => {
    const input = event.target.closest("[data-score-weight], [data-score-weight-number]");
    if (!input || input.value === "") return;
    const key = input.dataset.scoreWeight || input.dataset.scoreWeightNumber;
    if (key) setScoreWeight(key, input.value);
  });
  el("scoreWeightPresets").addEventListener("click", (event) => {
    const button = event.target.closest("[data-score-preset]");
    const preset = button && SCORE_WEIGHT_PRESETS[button.dataset.scorePreset];
    if (!preset) return;
    state.recommendationWeights = { ...preset };
    renderScoreEditor();
  });
  el("resetScoreWeights").addEventListener("click", () => {
    state.recommendationWeights = { ...DEFAULT_SCORE_WEIGHTS };
    renderScoreEditor();
  });
  el("applyScoreWeights").addEventListener("click", applyScoreWeights);
  el("searchInput").addEventListener("input", reload);
  el("authorFilter").addEventListener("input", () => {
    reload();
    authorSuggestions();
  });
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
    loadAiModels();
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
  el("refreshAiModels").addEventListener("click", async () => {
    const button = el("refreshAiModels");
    button.disabled = true;
    button.textContent = "正在刷新";
    try {
      await loadAiModels();
    } finally {
      button.disabled = false;
      button.textContent = "刷新模型";
    }
  });
  el("aiModelSelect").addEventListener("change", () => updateAiModelCustomField({ focus: true }));
  el("saveAiModel").addEventListener("click", saveAiModel);
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
          shared_storage_max_mb: Number(el("sharedStorageMaxMb").value),
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

  document.querySelectorAll("[data-weekly-kind]").forEach((button) => button.addEventListener("click", () => {
    state.weeklyKind = button.dataset.weeklyKind;
    document.querySelectorAll("[data-weekly-kind]").forEach((item) => {
      const active = item === button;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-selected", String(active));
    });
    const url = new URL(window.location.href);
    if (state.weeklyKind === "projects") url.searchParams.set("weekly", "projects");
    else url.searchParams.delete("weekly");
    window.history.replaceState({}, "", url);
    applyViewMode();
    renderPapers();
  }));

  document.querySelectorAll(".rail-link").forEach((button) => button.addEventListener("click", () => {
    const topic = button.dataset.topic || "";
    state.topic = topic;
    state.view = topic ? "all" : button.dataset.view || "recommended";
    state.selectedId = null;
    state.selectedProject = null;
    el("topicFilter").value = topic;
    applyViewMode();
    document.querySelectorAll(".rail-link").forEach((item) => item.classList.toggle("is-active", item === button));
    showReadingEmpty();
    const request = beginStreamRequest(streamLoadLabel());
    loadPapers({ preserveSelection: false, request });
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
    releaseReaderPdf();
    state.readerPaper = null;
    state.readerAsset = null;
  });
  document.querySelectorAll("[data-reader-tab]").forEach((button) => button.addEventListener("click", () => setReaderTab(button.dataset.readerTab)));
  el("readerCacheButton").addEventListener("click", () => state.readerPaper && resolveReaderAsset(state.readerPaper, true));
  el("pdfRetryButton").addEventListener("click", () => state.readerAsset && loadReaderPdf(state.readerAsset));
  el("readerImportButton").addEventListener("click", () => confirmSharedPdfUpload() && el("readerPdfInput").click());
  el("pdfUnavailableImportButton").addEventListener("click", () => confirmSharedPdfUpload() && el("readerPdfInput").click());
  el("readerPdfInput").addEventListener("change", () => importReaderPdf(el("readerPdfInput").files?.[0]));
  el("readerCloudButton").addEventListener("click", archiveReaderPdf);
  el("readerStorageMode").addEventListener("change", updateReaderStorageAction);
  el("projectReaderClose").addEventListener("click", () => el("projectReaderDialog").close());
  el("projectReaderDialog").addEventListener("close", () => { state.projectWorkspaceToken += 1; });
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
  el("projectChatForm").addEventListener("submit", submitProjectQuestion);
  el("projectChatSubmit").addEventListener("click", submitProjectQuestion);
  el("projectChatQuestion").addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") submitProjectQuestion(event);
  });
  el("translationPage").addEventListener("change", () => loadTranslationPage(Number(el("translationPage").value) || 1));
  el("translatePageButton").addEventListener("click", translateCurrentPage);
  el("translateSelectionButton").addEventListener("click", translateSelectedText);
  el("clearTranslationSelection").addEventListener("click", () => clearTranslationSelection());
  el("pdfTextButton").addEventListener("click", openReaderText);
  let readerSelectionFrame = 0;
  document.addEventListener("selectionchange", () => {
    if (readerSelectionFrame) return;
    readerSelectionFrame = window.requestAnimationFrame(() => {
      readerSelectionFrame = 0;
      captureReaderTextSelection();
    });
  });
  el("chatForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const paper = state.readerPaper;
    const question = el("chatQuestion").value.trim();
    if (!paper || !question) return;
    const button = event.submitter || el("chatForm").querySelector("button[type=submit]");
    const idleLabel = button.textContent;
    button.disabled = true;
    button.textContent = "正在回答";
    el("chatQuestion").value = "";
    appendPaperChatMessage("user", question);
    const pending = appendPaperChatMessage("assistant", "正在基于已缓存的论文材料组织回答", { pending: true });
    try {
      const answer = await api(`/api/papers/${encodeURIComponent(paper.id)}/chat`, { method: "POST", body: JSON.stringify({ question }) });
      pending.remove();
      const basisLabels = {
        fulltext: "基于全文精读",
        fulltext_excerpt: "基于全文摘录",
        abstract: "基于论文摘要",
      };
      appendPaperChatMessage("assistant", answer.answer || "模型没有返回可显示的回答。", {
        meta: basisLabels[answer.reading_basis] || "基于论文材料",
      });
      monitorPaperReadingBackup(paper.id);
    } catch (error) {
      pending.classList.remove("is-pending");
      pending.classList.add("is-error");
      const label = pending.querySelector("strong");
      const body = pending.querySelector("p");
      if (label) label.textContent = "论文导师";
      if (body) body.textContent = `本次回答失败：${error.message}`;
      const retry = document.createElement("button");
      retry.className = "text-button chat-retry";
      retry.type = "button";
      retry.textContent = "重新填写问题";
      retry.addEventListener("click", () => {
        el("chatQuestion").value = question;
        el("chatQuestion").focus();
      });
      pending.append(retry);
      el("chatQuestion").value = question;
      toast(error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = idleLabel;
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
  if (initialParams.get("weekly") === "projects") state.weeklyKind = "projects";
  if (requestedView === "project-recommended") state.view = "recommended";
  else if (requestedView === "projects" || (initialProject && requestedView !== "recommended")) state.view = "projects";
  el("overviewDate").textContent = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(now);
  state.recommendationWeights = { ...DEFAULT_SCORE_WEIGHTS };
  state.appliedRecommendationWeights = { ...DEFAULT_SCORE_WEIGHTS };
  renderScoreEditor();
  bindEvents();
  applyViewMode();
  document.querySelectorAll(".rail-link").forEach((item) => item.classList.toggle("is-active", item.dataset.view === state.view));
  const initialRequest = beginStreamRequest("正在初始化研究工作台");
  try {
    await Promise.all([
      loadAuthUser(),
      loadOptions(),
      loadStats(),
      loadStorageStatus(),
      loadScoreWeights(),
      loadPapers({ preserveSelection: false, request: initialRequest }),
    ]);
    if (initialPaperId) await openPaper(initialPaperId, false);
    if (initialProject) await openProjectReader(initialProject);
  } catch (error) {
    toast(error.message, true);
  }
}

init();
