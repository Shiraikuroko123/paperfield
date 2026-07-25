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
  }, { threshold: 0.14, rootMargin: "0px 0px -7%" });
  revealItems.forEach((item) => observer.observe(item));
}

const sourceContent = {
  arxiv: ["论文预印本", "arXiv", "发现最新工作并核对公开全文入口。元数据和 PDF 可用性分别记录。"],
  openalex: ["开放学术图谱", "OpenAlex", "补充作者、机构、概念和引用关系，用于跨来源发现与聚合。"],
  crossref: ["出版元数据", "Crossref", "核验 DOI、出版信息与规范化题名，不把元数据接口当作全文来源。"],
  pmlr: ["开放会议论文", "PMLR", "为机器学习会议论文提供稳定的公开页面和合法 PDF 入口。"],
  cvf: ["计算机视觉论文", "CVF Open Access", "定位 CVPR、ICCV 与 WACV 的开放论文页面和补充材料。"],
  github: ["开源实现", "GitHub", "沿 README、关键入口、依赖和源码路径继续验证论文实现。"]
};

document.querySelectorAll("[data-source]").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll("[data-source]").forEach((item) => item.setAttribute("aria-selected", String(item === tab)));
    const [kind, name, description] = sourceContent[tab.dataset.source];
    document.querySelector("#source-kind").textContent = kind;
    document.querySelector("#source-name").textContent = name;
    document.querySelector("#source-description").textContent = description;
  });
});
