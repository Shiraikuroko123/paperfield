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
};

const progressKey = "llm-course-progress-v1";
let currentPath = window.location.pathname;

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
    theme: "neutral",
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
    }
  });
};

const readProgress = () => {
  try {
    const value = JSON.parse(window.localStorage.getItem(progressKey) || "[]");
    return new Set(Array.isArray(value) ? value : []);
  } catch {
    return new Set();
  }
};

const writeProgress = (progress) => {
  try {
    window.localStorage.setItem(progressKey, JSON.stringify([...progress].sort()));
    return true;
  } catch {
    return false;
  }
};

const updateProgressSummary = (progress) => {
  document.querySelectorAll("[data-course-progress-total]").forEach((region) => {
    const total = Number(region.dataset.courseProgressTotal || 54);
    const completed = Math.min(progress.size, total);
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
  const progress = readProgress();
  document.querySelectorAll(".lesson-meta[data-lesson-id]").forEach((region) => {
    const lessonId = region.dataset.lessonId;
    const button = region.querySelector(".lesson-complete");
    if (!lessonId || !button) return;

    const render = () => {
      const complete = progress.has(lessonId);
      button.setAttribute("aria-pressed", String(complete));
      button.textContent = complete ? "已完成，点击撤销" : "标记为已完成";
    };

    render();
    if (button.dataset.progressBound === "true") return;
    button.dataset.progressBound = "true";
    button.addEventListener("click", () => {
      if (progress.has(lessonId)) progress.delete(lessonId);
      else progress.add(lessonId);
      writeProgress(progress);
      render();
      updateProgressSummary(progress);
    });
  });
  updateProgressSummary(progress);
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

  if (window.MathJax?.typesetPromise) {
    window.MathJax.typesetPromise().then(labelOverflowingMath).catch((error) => {
      console.error("MathJax rendering failed:", error);
    });
  }

  renderMermaidDiagrams();
};

if (typeof document$ !== "undefined") {
  document$.subscribe(enhancePage);
} else {
  document.addEventListener("DOMContentLoaded", enhancePage);
}
