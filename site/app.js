document.documentElement.classList.add("js");

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const revealItems = document.querySelectorAll(".reveal");

if (reduceMotion || !("IntersectionObserver" in window)) {
  revealItems.forEach((item) => item.classList.add("is-visible"));
} else {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -6%" });

  revealItems.forEach((item) => observer.observe(item));
}

const workspaceTabs = [...document.querySelectorAll("[data-workspace]")];
const workspacePanels = [...document.querySelectorAll("[data-panel]")];

function activateWorkspace(workspace, moveFocus = false) {
  workspaceTabs.forEach((tab) => {
    const active = tab.dataset.workspace === workspace;
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
    if (active && moveFocus) tab.focus();
  });

  workspacePanels.forEach((panel) => {
    panel.hidden = panel.dataset.panel !== workspace;
  });
}

workspaceTabs.forEach((tab, index) => {
  tab.addEventListener("click", () => activateWorkspace(tab.dataset.workspace));
  tab.addEventListener("keydown", (event) => {
    let nextIndex = index;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % workspaceTabs.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + workspaceTabs.length) % workspaceTabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = workspaceTabs.length - 1;
    if (nextIndex === index) return;
    event.preventDefault();
    activateWorkspace(workspaceTabs[nextIndex].dataset.workspace, true);
  });
});

const requestedWorkspace = window.location.hash.match(/^#workspace-(paperfield|atlas|flowloom)$/)?.[1];
if (requestedWorkspace) activateWorkspace(requestedWorkspace);

const year = document.querySelector("#copyright-year");
if (year) year.textContent = String(new Date().getFullYear());
