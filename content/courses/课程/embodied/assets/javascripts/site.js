window.MathJax = {
  tex: {
    inlineMath: [["\\(", "\\)"], ["$", "$"]],
    displayMath: [["\\[", "\\]"], ["$$", "$$"]],
    processEscapes: true,
    processEnvironments: true
  },
  options: {
    ignoreHtmlClass: ".*|",
    processHtmlClass: "arithmatex"
  },
  chtml: {
    adaptiveCSS: false
  },
  startup: {
    typeset: false
  }
};

let currentPath = window.location.pathname;

const labelScrollableMath = () => {
  document.querySelectorAll("div.arithmatex").forEach((region, index) => {
    if (region.scrollWidth > region.clientWidth) {
      region.tabIndex = 0;
      region.setAttribute("role", "region");
      region.setAttribute("aria-label", `可横向滚动的数学公式 ${index + 1}`);
    } else {
      region.removeAttribute("tabindex");
      region.removeAttribute("role");
      region.removeAttribute("aria-label");
    }
  });
};

const typesetMath = async (reset = false) => {
  const mathJax = window.MathJax;

  if (!document.querySelector(".arithmatex") || !mathJax?.typesetPromise || !mathJax?.startup?.promise) {
    return;
  }

  try {
    await mathJax.startup.promise;

    const mathRegions = Array.from(document.querySelectorAll(".arithmatex")).filter(
      (region) => !region.querySelector(":scope > mjx-container")
    );

    if (!mathRegions.length) {
      labelScrollableMath();
      return;
    }

    if (reset && mathJax.typesetClear) {
      mathJax.typesetClear();
    }

    await mathJax.typesetPromise(mathRegions);
    labelScrollableMath();
  } catch (error) {
    console.error("MathJax typesetting failed", error);
  }
};

const enhancePage = () => {
  const nextPath = window.location.pathname;
  const pathChanged = nextPath !== currentPath;

  if (pathChanged && !window.location.hash) {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }

  currentPath = nextPath;

  document.querySelectorAll("a[href^='http']").forEach((link) => {
    if (link.hostname !== window.location.hostname) {
      link.rel = "noopener noreferrer";
    }
  });

  document.querySelectorAll(".md-typeset__scrollwrap").forEach((region, index) => {
    region.tabIndex = 0;
    region.setAttribute("role", "region");
    region.setAttribute("aria-label", `可横向滚动的表格 ${index + 1}`);
  });

  void typesetMath(pathChanged);
};

if (typeof document$ !== "undefined") {
  document$.subscribe(enhancePage);
} else {
  document.addEventListener("DOMContentLoaded", enhancePage);
}

window.addEventListener("load", () => {
  void typesetMath();
});
