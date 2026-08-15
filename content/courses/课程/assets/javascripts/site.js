window.MathJax = {
  tex: {
    inlineMath: [["\\(", "\\)"], ["$", "$"]],
    displayMath: [["\\[", "\\]"], ["$$", "$$"]],
    processEscapes: true,
    processEnvironments: true,
  },
  options: {
    ignoreHtmlClass: ".*|",
    processHtmlClass: "arithmatex",
  },
  chtml: {
    adaptiveCSS: false,
  },
  startup: {
    typeset: false,
  },
};

const progressKey = "ai-systems-courses-progress-v1";
const legacyLlmProgressKey = "llm-course-progress-v1";
const courseConfig = {
  llm: { label: "LLM 系统课程", total: 54 },
  embodied: { label: "具身智能课程", total: 34 },
};

let currentPath = window.location.pathname;

const getCourseFromPath = (path = window.location.pathname) => {
  if (path.includes("/embodied/")) return "embodied";
  if (path.includes("/llm/")) return "llm";
  return "hub";
};

const setCourseContext = () => {
  document.documentElement.dataset.course = getCourseFromPath();
};

const labelScrollableRegion = (region, label) => {
  region.tabIndex = 0;
  region.setAttribute("role", "region");
  region.setAttribute("aria-label", label);
};

const prepareMermaidDiagrams = () => {
  document.querySelectorAll("pre.mermaid").forEach((source, index) => {
    const region = document.createElement("div");
    const diagram = document.createElement("div");

    region.className = "mermaid-scroll";
    labelScrollableRegion(region, `可横向滚动的流程图 ${index + 1}`);

    diagram.className = "mermaid";
    diagram.textContent = source.textContent.trim();
    region.appendChild(diagram);
    source.replaceWith(region);
  });

  return [...document.querySelectorAll(".mermaid-scroll > .mermaid:not([data-processed])")];
};

const renderMermaidDiagrams = () => {
  const diagrams = prepareMermaidDiagrams();
  if (!diagrams.length) return;

  if (!window.mermaid) {
    window.addEventListener("load", renderMermaidDiagrams, { once: true });
    return;
  }

  window.mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: document.body.dataset.mdColorScheme === "slate" ? "dark" : "neutral",
    flowchart: { useMaxWidth: true },
    sequence: { useMaxWidth: true },
  });

  window.mermaid.run({ nodes: diagrams }).catch((error) => {
    console.error("Mermaid rendering failed:", error);
  });
};

const labelOverflowingMath = () => {
  document.querySelectorAll("div.arithmatex").forEach((region, index) => {
    if (region.scrollWidth > region.clientWidth + 1) {
      labelScrollableRegion(region, `可横向滚动的公式 ${index + 1}`);
    } else {
      region.removeAttribute("tabindex");
      region.removeAttribute("role");
      region.removeAttribute("aria-label");
    }
  });
};

const typesetMath = async () => {
  const mathJax = window.MathJax;
  if (!document.querySelector(".arithmatex") || !mathJax?.typesetPromise || !mathJax?.startup?.promise) {
    return;
  }

  try {
    await mathJax.startup.promise;
    const regions = [...document.querySelectorAll(".arithmatex")].filter(
      (region) => !region.querySelector(":scope > mjx-container")
    );
    if (regions.length) await mathJax.typesetPromise(regions);
    labelOverflowingMath();
  } catch (error) {
    console.error("MathJax typesetting failed:", error);
  }
};

const emptyProgressState = () => ({ llm: [], embodied: [] });

const readProgressState = () => {
  try {
    const stored = JSON.parse(window.localStorage.getItem(progressKey) || "null");
    const state = stored && typeof stored === "object" && !Array.isArray(stored)
      ? {
          llm: Array.isArray(stored.llm) ? stored.llm : [],
          embodied: Array.isArray(stored.embodied) ? stored.embodied : [],
        }
      : emptyProgressState();

    if (!state.llm.length) {
      const legacy = JSON.parse(window.localStorage.getItem(legacyLlmProgressKey) || "[]");
      if (Array.isArray(legacy) && legacy.length) {
        state.llm = legacy;
        window.localStorage.setItem(progressKey, JSON.stringify(state));
      }
    }
    return state;
  } catch {
    return emptyProgressState();
  }
};

const writeProgressState = (state) => {
  try {
    const serialized = {
      llm: [...new Set(state.llm)].sort(),
      embodied: [...new Set(state.embodied)].sort(),
    };
    window.localStorage.setItem(progressKey, JSON.stringify(serialized));
    return true;
  } catch {
    return false;
  }
};

const ensureEmbodiedLessonControl = () => {
  if (getCourseFromPath() !== "embodied" || document.querySelector(".lesson-meta[data-lesson-id]")) return;

  const decodedPath = decodeURIComponent(window.location.pathname).replace(/\/+$/, "");
  const marker = "/embodied/";
  const markerIndex = decodedPath.indexOf(marker);
  if (markerIndex < 0) return;

  const relativePath = decodedPath.slice(markerIndex + marker.length);
  if (!/^0[0-6]-[^/]+\/[^/]+$/.test(relativePath)) return;

  const heading = document.querySelector(".md-content__inner > h1");
  if (!heading) return;

  const region = document.createElement("div");
  const code = document.createElement("span");
  const standard = document.createElement("strong");
  const button = document.createElement("button");

  region.className = "lesson-meta";
  region.dataset.lessonId = relativePath;
  region.dataset.course = "embodied";
  code.textContent = relativePath.split("/")[0].slice(0, 2).replace(/^0/, "M");
  standard.textContent = "完成本节验收后再标记";
  button.className = "lesson-complete";
  button.type = "button";
  button.textContent = "标记为已完成";

  region.append(code, standard, button);
  heading.insertAdjacentElement("afterend", region);
};

const updateProgressSummary = (state = readProgressState()) => {
  document.querySelectorAll("[data-course-progress-total]").forEach((region) => {
    const course = region.dataset.courseProgressCourse || getCourseFromPath();
    if (!courseConfig[course]) return;

    const total = Number(region.dataset.courseProgressTotal || courseConfig[course].total);
    const completed = Math.min(new Set(state[course] || []).size, total);
    const label = region.querySelector("[data-course-progress]");
    const meter = region.querySelector("progress");
    if (label) label.textContent = `${completed} / ${total}`;
    if (meter) {
      meter.max = total;
      meter.value = completed;
      meter.setAttribute("aria-valuetext", `已完成 ${completed} 个，共 ${total} 个单元`);
    }
  });
};

const enhanceLessonProgress = () => {
  ensureEmbodiedLessonControl();
  const state = readProgressState();

  document.querySelectorAll(".lesson-meta[data-lesson-id]").forEach((region) => {
    const course = region.dataset.course || getCourseFromPath();
    const lessonId = region.dataset.lessonId;
    const button = region.querySelector(".lesson-complete");
    if (!courseConfig[course] || !lessonId || !button) return;

    const progress = new Set(state[course] || []);
    const render = () => {
      const complete = progress.has(lessonId);
      button.setAttribute("aria-pressed", String(complete));
      button.setAttribute("aria-live", "polite");
      button.textContent = complete ? "已完成，点击撤销" : "标记为已完成";
    };

    render();
    if (button.dataset.progressBound === "true") return;
    button.dataset.progressBound = "true";
    button.addEventListener("click", () => {
      if (progress.has(lessonId)) progress.delete(lessonId);
      else progress.add(lessonId);
      state[course] = [...progress];
      writeProgressState(state);
      render();
      updateProgressSummary(state);
    });
  });

  updateProgressSummary(state);
};

const enhanceDiagnostic = () => {
  document.querySelectorAll("[data-diagnostic]").forEach((form) => {
    const button = form.querySelector("[data-diagnostic-score]");
    const result = form.querySelector("[data-diagnostic-result]");
    if (!button || !result || button.dataset.diagnosticBound === "true") return;
    button.dataset.diagnosticBound = "true";

    button.addEventListener("click", () => {
      const domains = { foundation: 0, model: 0, research: 0 };
      form.querySelectorAll("input[data-diagnostic-domain]").forEach((input) => {
        if (input.checked) domains[input.dataset.diagnosticDomain] += 1;
      });
      const total = domains.foundation + domains.model + domains.research;
      let route = "从 M1.1 开始，完整完成数学、PyTorch 和训练循环。";
      if (total >= 16 && Object.values(domains).every((score) => score >= 4)) {
        route = "完成 M1-M3 的验收实验后，可从 M4.0 进入 35 题主线。";
      } else if (total >= 13 && Object.values(domains).every((score) => score >= 4)) {
        route = "从 M3.1 开始；M1-M2 先做自测与 labs，未通过的单元立即回补。";
      } else if (total >= 7 && domains.foundation >= 4) {
        route = "从 M2.1 开始；先运行 M1 labs，任何失败都回到对应基础章。";
      }
      result.textContent = `数学与训练 ${domains.foundation}/6，模型 ${domains.model}/6，系统与研究 ${domains.research}/6，总分 ${total}/18。${route}`;
    });
  });
};

const enhancePage = () => {
  const nextPath = window.location.pathname;
  if (nextPath !== currentPath && !window.location.hash) {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }
  currentPath = nextPath;
  setCourseContext();

  document.querySelectorAll("a[href^='http']").forEach((link) => {
    if (link.hostname !== window.location.hostname) {
      link.rel = "noopener noreferrer";
    }
  });

  document.querySelectorAll(".md-typeset__scrollwrap").forEach((region, index) => {
    labelScrollableRegion(region, `可横向滚动的表格 ${index + 1}`);
  });

  enhanceLessonProgress();
  enhanceDiagnostic();
  void typesetMath();
  renderMermaidDiagrams();
};

setCourseContext();

if (typeof document$ !== "undefined") {
  document$.subscribe(enhancePage);
} else {
  document.addEventListener("DOMContentLoaded", enhancePage);
}

window.addEventListener("load", () => {
  void typesetMath();
});
