import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { JSDOM } from 'jsdom';

const ROOT = new URL('../', import.meta.url);
const OUTPUT_DIR = new URL('../output/research/', import.meta.url);
const CACHE_DIR = new URL('../output/research/cache/', import.meta.url);
const FIGURE_DIR = new URL('../output/research/figures/', import.meta.url);
const CORPUS_PATH = new URL('../docs/research/arxiv-figure-corpus.json', import.meta.url);
const REPORT_PATH = new URL('../docs/research/ARXIV_FIGURE_ATLAS.md', import.meta.url);
const REFRESH = process.argv.includes('--refresh');
const DOWNLOAD_IMAGES = !process.argv.includes('--no-download');
const LIMIT_ARG = process.argv.find((arg) => arg.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? Math.max(1, Number(LIMIT_ARG.split('=')[1])) : 50;
const USER_AGENT = 'FlowloomResearch/0.5 (https://github.com/Shiraikuroko123/paperfield; public academic figure study)';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const normalize = (value = '') => value.replace(/\s+/g, ' ').trim();
const stripVersion = (id) => id.replace(/v\d+$/i, '');
const escapeCell = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const truncate = (value, max = 180) => value.length <= max ? value : `${value.slice(0, max - 1)}...`;

const SEEDS = {
  llm: [
    '1706.03762', '1810.04805', '1910.10683', '2001.08361', '2005.14165',
    '2005.11401', '2101.03961', '2103.00020', '2106.09685', '2109.01652',
    '2112.04426', '2201.11903', '2203.02155', '2203.15556', '2204.02311',
    '2204.14198', '2205.01068', '2205.14135', '2210.03629', '2211.05100',
    '2212.08073', '2301.12597', '2302.04761', '2302.13971', '2303.08774',
    '2304.08485', '2305.14314', '2305.18290', '2307.03172', '2307.09288',
    '2309.16609', '2310.06825', '2310.11511', '2312.00752', '2401.04088',
    '2401.02954', '2403.08295', '2404.14219', '2405.04434', '2407.10671',
    '2407.21783', '2412.19437', '2501.12948',
  ],
  embodied: [
    '1912.01734', '2010.14406', '2108.03332', '2109.12098',
    '2112.03227', '2202.02005', '2203.12601', '2204.01691', '2205.06175',
    '2206.08853', '2207.05608', '2207.04429', '2209.05451', '2209.07753',
    '2210.03094', '2210.05714', '2212.06817', '2303.03378', '2303.04137',
    '2304.13705', '2305.15021', '2305.16291', '2306.11706', '2307.15818',
    '2308.12952', '2310.08864', '2311.01378', '2311.10692', '2312.13139',
    '2401.02117', '2403.09631', '2403.12945', '2405.12213', '2406.09246',
    '2409.12514', '2410.07864', '2410.24164', '2411.19650', '2501.15830',
  ],
};

const TOPICS = {
  llm: [
    { id: 'architecture-scaling', label: 'Architecture and scaling', query: 'cat:cs.CL AND (all:"language model" AND (all:architecture OR all:scaling))' },
    { id: 'alignment-tuning', label: 'Alignment and instruction tuning', query: 'cat:cs.CL AND (all:"language model" AND (all:alignment OR all:"instruction tuning"))' },
    { id: 'reasoning-agents', label: 'Reasoning, tools, and agents', query: 'cat:cs.CL AND (all:"language model" AND (all:reasoning OR all:"tool use" OR all:agent))' },
    { id: 'retrieval-memory', label: 'Retrieval and memory', query: 'cat:cs.CL AND (all:"language model" AND (all:retrieval OR all:memory))' },
    { id: 'multimodal', label: 'Multimodal language models', query: '(cat:cs.CL OR cat:cs.CV) AND (all:"multimodal language model" OR all:"vision language model")' },
    { id: 'efficiency-context', label: 'Efficiency and long context', query: 'cat:cs.CL AND (all:"language model" AND (all:efficient OR all:quantization OR all:"long context"))' },
  ],
  embodied: [
    { id: 'vla-generalist', label: 'VLA and generalist policies', query: '(cat:cs.RO OR cat:cs.AI) AND (all:"vision language action" OR all:"generalist robot policy")' },
    { id: 'manipulation', label: 'Language-conditioned manipulation', query: 'cat:cs.RO AND (all:manipulation AND (all:language OR all:vision))' },
    { id: 'navigation-agents', label: 'Navigation and embodied agents', query: '(cat:cs.RO OR cat:cs.AI) AND (all:"embodied agent" OR all:"vision language navigation")' },
    { id: 'world-models-planning', label: 'World models and planning', query: 'cat:cs.RO AND (all:"world model" OR all:planning)' },
    { id: 'datasets-benchmarks', label: 'Datasets and benchmarks', query: 'cat:cs.RO AND (all:dataset OR all:benchmark) AND (all:robot OR all:embodied)' },
    { id: 'robot-platforms', label: 'Humanoids and mobile robots', query: 'cat:cs.RO AND (all:humanoid OR all:"mobile manipulation" OR all:locomotion)' },
  ],
};

function hash(value) {
  return createHash('sha1').update(value).digest('hex');
}

async function ensureDirectories() {
  await Promise.all([
    mkdir(CACHE_DIR, { recursive: true }),
    mkdir(FIGURE_DIR, { recursive: true }),
    mkdir(new URL('../docs/research/', import.meta.url), { recursive: true }),
  ]);
}

async function fetchWithRetry(url, options = {}, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: options.signal ?? AbortSignal.timeout(30000),
        headers: { 'User-Agent': USER_AGENT, Accept: '*/*', ...(options.headers ?? {}) },
      });
      if (response.ok) return response;
      if (![429, 500, 502, 503, 504].includes(response.status)) {
        const error = new Error(`${response.status} ${response.statusText} for ${url}`);
        error.nonRetryable = true;
        throw error;
      }
      lastError = new Error(`${response.status} ${response.statusText} for ${url}`);
    } catch (error) {
      if (error.nonRetryable) throw error;
      lastError = error;
    }
    await sleep(1200 * attempt ** 2);
  }
  throw lastError;
}

async function cachedText(url, namespace, options = {}) {
  const path = new URL(`${namespace}-${hash(`${url}:${options.body ?? ''}`)}.txt`, CACHE_DIR);
  if (!REFRESH) {
    try {
      return await readFile(path, 'utf8');
    } catch {
      // Cache miss.
    }
  }
  const response = await fetchWithRetry(url, options);
  const body = await response.text();
  await writeFile(path, body, 'utf8');
  return body;
}

function parseAtom(xml) {
  const document = new JSDOM(xml, { contentType: 'text/xml' }).window.document;
  return [...document.getElementsByTagName('entry')].map((entry) => {
    const idUrl = normalize(entry.getElementsByTagName('id')[0]?.textContent);
    const id = stripVersion(idUrl.split('/').pop() ?? '');
    const categories = [...entry.getElementsByTagName('category')]
      .map((category) => category.getAttribute('term'))
      .filter(Boolean);
    const links = [...entry.getElementsByTagName('link')];
    return {
      arxivId: id,
      title: normalize(entry.getElementsByTagName('title')[0]?.textContent),
      abstract: normalize(entry.getElementsByTagName('summary')[0]?.textContent),
      published: normalize(entry.getElementsByTagName('published')[0]?.textContent),
      updated: normalize(entry.getElementsByTagName('updated')[0]?.textContent),
      year: Number(normalize(entry.getElementsByTagName('published')[0]?.textContent).slice(0, 4)),
      authors: [...entry.getElementsByTagName('author')]
        .map((author) => normalize(author.getElementsByTagName('name')[0]?.textContent))
        .filter(Boolean),
      categories,
      primaryCategory: entry.getElementsByTagName('arxiv:primary_category')[0]?.getAttribute('term') ?? categories[0] ?? '',
      absUrl: `https://arxiv.org/abs/${id}`,
      pdfUrl: links.find((link) => link.getAttribute('title') === 'pdf')?.getAttribute('href') ?? `https://arxiv.org/pdf/${id}`,
    };
  }).filter((paper) => paper.arxivId && paper.title);
}

async function fetchSeedPapers(ids) {
  const papers = [];
  for (let index = 0; index < ids.length; index += 45) {
    const chunk = ids.slice(index, index + 45);
    const url = `https://export.arxiv.org/api/query?id_list=${chunk.join(',')}&max_results=${chunk.length}`;
    const xml = await cachedText(url, 'arxiv-seeds');
    papers.push(...parseAtom(xml));
    if (index + 45 < ids.length) await sleep(3100);
  }
  return papers;
}

async function searchTopic(topic) {
  const params = new URLSearchParams({
    search_query: topic.query,
    start: '0',
    max_results: '35',
    sortBy: 'relevance',
    sortOrder: 'descending',
  });
  const url = `https://export.arxiv.org/api/query?${params}`;
  const xml = await cachedText(url, 'arxiv-search');
  return parseAtom(xml).map((paper) => ({ ...paper, matchedTopics: [topic.id] }));
}

async function fetchSemanticScholar(ids) {
  const map = new Map();
  for (let index = 0; index < ids.length; index += 400) {
    const chunk = ids.slice(index, index + 400);
    const url = 'https://api.semanticscholar.org/graph/v1/paper/batch?fields=title,year,citationCount,influentialCitationCount,externalIds';
    const body = JSON.stringify({ ids: chunk.map((id) => `ARXIV:${id}`) });
    let records;
    try {
      const text = await cachedText(url, 'semantic-scholar', {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/json' },
      });
      records = JSON.parse(text);
    } catch (error) {
      console.warn(`Semantic Scholar metadata unavailable for batch ${index / 400 + 1}: ${error.message}`);
      records = [];
    }
    records.forEach((record, recordIndex) => {
      if (!record) return;
      map.set(chunk[recordIndex], {
        semanticScholarId: record.paperId,
        citationCount: record.citationCount ?? 0,
        influentialCitationCount: record.influentialCitationCount ?? 0,
      });
    });
  }
  return map;
}

function inferTopics(domain, paper) {
  const haystack = `${paper.title} ${paper.abstract}`.toLowerCase();
  const rules = domain === 'llm' ? {
    'architecture-scaling': /architect|scal|mixture.of.expert|transformer|foundation model/,
    'alignment-tuning': /align|instruction|preference|rlhf|fine.tun|constitutional/,
    'reasoning-agents': /reason|agent|tool|chain.of.thought|planning|self-reflect/,
    'retrieval-memory': /retriev|memory|knowledge|rag|search/,
    multimodal: /multimodal|vision.language|image|visual|audio/,
    'efficiency-context': /efficien|quantiz|context|attention|compress|lora|flash/,
  } : {
    'vla-generalist': /vision.language.action|vla|generalist|foundation model|robot transformer/,
    manipulation: /manipulat|grasp|pick|place|dexter|policy/,
    'navigation-agents': /navigat|embodied agent|habitat|indoor|explor/,
    'world-models-planning': /world model|planning|reason|simulation|predict/,
    'datasets-benchmarks': /dataset|benchmark|evaluation|corpus|demonstration/,
    'robot-platforms': /humanoid|mobile|locomotion|quadruped|embodiment|robot/,
  };
  const inferred = Object.entries(rules).filter(([, expression]) => expression.test(haystack)).map(([id]) => id);
  return [...new Set([...(paper.matchedTopics ?? []), ...inferred])];
}

function mergePapers(domain, seedPapers, searchedPapers, citations) {
  const seedRanks = new Map(SEEDS[domain].map((id, index) => [id, index]));
  const merged = new Map();
  [...seedPapers, ...searchedPapers].forEach((paper) => {
    const previous = merged.get(paper.arxivId);
    merged.set(paper.arxivId, {
      ...(previous ?? paper),
      ...paper,
      matchedTopics: [...new Set([...(previous?.matchedTopics ?? []), ...(paper.matchedTopics ?? [])])],
    });
  });
  const relevant = [...merged.values()].filter((paper) => {
    const haystack = `${paper.title} ${paper.abstract}`;
    if (domain === 'llm') return /language model|llm|transformer|multimodal|vision.language/i.test(haystack);
    const guiOnly = /gui|graphical user interface|screen interaction|web agent/i.test(haystack)
      && !/robot|physical world|manipulat|humanoid|locomot|grasp|visuomotor/i.test(haystack);
    return !guiOnly && /robot|embodied|manipulat|navigation|locomot|humanoid|grasp|visuomotor|household activit|minecraft|task and motion|pddlstream|vision.language.action/i.test(haystack);
  });
  return relevant.map((paper) => {
    const citation = citations.get(paper.arxivId) ?? { citationCount: 0, influentialCitationCount: 0 };
    const seedRank = seedRanks.get(paper.arxivId);
    const matchedTopics = inferTopics(domain, paper);
    const recency = Math.max(0, (paper.year || 2017) - 2017);
    const score = Math.log10((citation.citationCount ?? 0) + 1) * 140
      + Math.log10((citation.influentialCitationCount ?? 0) + 1) * 45
      + recency * 7
      + (seedRank === undefined ? 0 : 900 - seedRank * 2);
    return { ...paper, ...citation, seed: seedRank !== undefined, matchedTopics, score };
  });
}

function selectBalanced(domain, candidates, count) {
  const topics = TOPICS[domain];
  const selected = new Map();
  const sorted = [...candidates].sort((a, b) => b.score - a.score || b.year - a.year || a.arxivId.localeCompare(b.arxivId));
  const baseQuota = Math.floor(count / topics.length);
  let remainder = count % topics.length;
  topics.forEach((topic) => {
    const quota = baseQuota + (remainder-- > 0 ? 1 : 0);
    const matching = sorted.filter((paper) => paper.matchedTopics.includes(topic.id));
    let added = 0;
    for (const paper of matching) {
      if (selected.has(paper.arxivId)) continue;
      selected.set(paper.arxivId, { ...paper, selectedTopic: topic.id });
      added += 1;
      if (added >= quota) break;
    }
  });
  for (const paper of sorted) {
    if (selected.size >= count) break;
    if (!selected.has(paper.arxivId)) {
      selected.set(paper.arxivId, { ...paper, selectedTopic: paper.matchedTopics[0] ?? topics[0].id });
    }
  }
  return [...selected.values()].slice(0, count).sort((a, b) => b.year - a.year || b.citationCount - a.citationCount);
}

function classifyFigure(caption, title, domain) {
  const text = `${caption} ${title}`.toLowerCase();
  const composition = [];
  const elements = [];
  const add = (array, value, condition) => condition && array.push(value);

  add(composition, 'system-overview', /overview|overall|our framework|our approach|system diagram|illustration of/.test(text));
  add(composition, 'model-architecture', /architect|network|encoder|decoder|transformer|model structure|module/.test(text));
  add(composition, 'training-pipeline', /training|pretrain|fine-tun|optimization|learning pipeline|loss/.test(text));
  add(composition, 'data-pipeline', /dataset|data mixture|data collection|curation|demonstration/.test(text));
  add(composition, 'agent-loop', /agent|environment|feedback|closed.loop|interaction|rollout/.test(text));
  add(composition, 'temporal-storyboard', /sequence|trajectory|time step|rollout|episode|frames/.test(text));
  add(composition, 'qualitative-montage', /qualitative|examples|visualization|case stud|sample|prediction/.test(text));
  add(composition, 'quantitative-chart', /result|performance|accuracy|score|scaling|comparison|ablation|evaluation/.test(text));
  add(composition, 'taxonomy-benchmark', /taxonomy|benchmark|task suite|categories|capabilities/.test(text));

  add(elements, 'module-blocks', /model|module|encoder|decoder|policy|network|pipeline/.test(text));
  add(elements, 'token-sequence', /token|embedding|prompt|instruction|language/.test(text));
  add(elements, 'attention-bridge', /attention|q-former|projector|adapter|fusion|cross.modal/.test(text));
  add(elements, 'frozen-trainable-state', /frozen|freeze|trainable|fixed|parameter/.test(text));
  add(elements, 'dataset-stack', /dataset|data mixture|corpus|demonstration/.test(text));
  add(elements, 'loss-objective', /loss|objective|reward|preference/.test(text));
  add(elements, 'image-strip', /image|video|visual|frame|camera/.test(text));
  add(elements, 'robot-embodiment', domain === 'embodied' && /robot|embod|manipulat|humanoid|arm|gripper/.test(text));
  add(elements, 'environment-scene', domain === 'embodied' && /environment|scene|navigation|workspace|simulation/.test(text));
  add(elements, 'action-trajectory', domain === 'embodied' && /action|trajectory|motion|control|policy|rollout/.test(text));
  add(elements, 'feedback-arrow', /feedback|closed.loop|iterative|interaction|cycle/.test(text));
  add(elements, 'chart-axes', /plot|curve|accuracy|performance|score|scaling|result/.test(text));
  add(elements, 'heatmap-matrix', /heatmap|matrix|confusion|attention map/.test(text));
  add(elements, 'legend-encoding', /color|legend|denote|dashed|solid|shade/.test(text));
  add(elements, 'stage-containers', /stage|phase|step|pipeline|workflow/.test(text));
  add(elements, 'annotations-callouts', /highlight|shown|indicate|denote|zoom|inset/.test(text));

  return {
    composition: composition.length ? composition : ['other'],
    elements: elements.length ? elements : ['module-blocks'],
  };
}

function parseDimension(value) {
  if (!value) return undefined;
  const match = String(value).match(/[\d.]+/);
  return match ? Number(match[0]) : undefined;
}

function parseFigures(html, baseUrl, paper, domain) {
  const document = new JSDOM(html, { url: baseUrl }).window.document;
  const nodes = [...document.querySelectorAll('figure')];
  const seen = new Set();
  return nodes.map((figure, index) => {
    const id = figure.id || `figure-${index + 1}`;
    const captionNode = figure.querySelector(':scope > figcaption, :scope > .ltx_caption') ?? figure.querySelector('figcaption, .ltx_caption');
    const caption = normalize(captionNode?.textContent ?? '');
    const label = normalize(captionNode?.querySelector('.ltx_tag_figure')?.textContent ?? caption.match(/^Figure\s+[\w.-]+/i)?.[0] ?? `Figure ${index + 1}`);
    const tableLabel = normalize(captionNode?.querySelector('.ltx_tag_table')?.textContent ?? '');
    const isTable = Boolean(tableLabel)
      || figure.matches('.ltx_table, table, [role="table"]')
      || /^Table\s+[\w.-]+/i.test(caption)
      || /^Table\s+[\w.-]+/i.test(label);
    const resourceBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const images = [...figure.querySelectorAll('img')].map((image) => ({
      url: new URL(image.getAttribute('src'), resourceBaseUrl).href,
      alt: normalize(image.getAttribute('alt') ?? ''),
      width: parseDimension(image.getAttribute('width')),
      height: parseDimension(image.getAttribute('height')),
    })).filter((image) => image.url && !image.url.startsWith('data:'));
    const uniqueKey = `${id}:${caption}:${images.map((image) => image.url).join(',')}`;
    if (seen.has(uniqueKey)) return null;
    seen.add(uniqueKey);
    const tags = classifyFigure(caption, paper.title, domain);
    const keywordScore = /overview|architecture|framework|pipeline|approach|system|illustration|method/i.test(caption) ? 80 : 0;
    const imageAreaScore = Math.min(24, images.reduce((sum, image) => sum + Math.log10(Math.max(1, (image.width ?? 1) * (image.height ?? 1))), 0));
    const score = keywordScore
      + Math.max(0, 50 - index * 3)
      + Math.min(24, images.length * 6)
      + imageAreaScore
      + (caption.length > 80 ? 8 : 0);
    return { id, label, caption, images, tags, score, order: index + 1, isTable };
  }).filter(Boolean).filter((figure) => !figure.isTable && figure.images.length > 0);
}

async function fetchPaperFigures(paper, domain) {
  const sources = [
    `https://ar5iv.labs.arxiv.org/html/${paper.arxivId}`,
    `https://arxiv.org/html/${paper.arxivId}`,
  ];
  let lastError;
  for (const sourceUrl of sources) {
    try {
      const html = await cachedText(sourceUrl, 'paper-html');
      const figures = parseFigures(html, sourceUrl, paper, domain);
      if (!figures.length) throw new Error('No figure elements found');
      const representative = [...figures]
        .filter((figure) => figure.images.length > 0 && !figure.isTable)
        .sort((a, b) => b.score - a.score || a.order - b.order)[0];
      if (!representative) throw new Error('No renderable non-table figure found');
      return { sourceUrl, figures, representative };
    } catch (error) {
      lastError = error;
    }
  }
  return { sourceUrl: null, figures: [], representative: null, error: lastError?.message ?? 'HTML unavailable' };
}

function imageExtension(url, contentType) {
  const fromUrl = extname(new URL(url).pathname).toLowerCase();
  if (/^\.(png|jpe?g|gif|webp|svg)$/.test(fromUrl)) return fromUrl === '.jpeg' ? '.jpg' : fromUrl;
  if (contentType?.includes('svg')) return '.svg';
  if (contentType?.includes('jpeg')) return '.jpg';
  if (contentType?.includes('webp')) return '.webp';
  if (contentType?.includes('gif')) return '.gif';
  return '.png';
}

async function downloadRepresentative(paper, domain, representative) {
  if (!DOWNLOAD_IMAGES || !representative?.images.length) return [];
  const directory = new URL(`${domain}/`, FIGURE_DIR);
  await mkdir(directory, { recursive: true });
  const label = representative.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'figure';
  const existingFiles = await readdir(directory);
  const downloaded = [];
  for (const [index, image] of representative.images.slice(0, 4).entries()) {
    const existing = existingFiles.find((name) => name.startsWith(`${paper.arxivId}-${label}-${index + 1}.`));
    if (existing) {
      downloaded.push(`output/research/figures/${domain}/${existing}`);
      continue;
    }
    try {
      const response = await fetchWithRetry(image.url);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > 16 * 1024 * 1024) throw new Error('image exceeds 16 MB');
      const extension = imageExtension(image.url, response.headers.get('content-type'));
      const path = new URL(`${paper.arxivId}-${label}-${index + 1}${extension}`, directory);
      await writeFile(path, bytes);
      downloaded.push(relative(new URL('.', ROOT).pathname, path.pathname).replace(/^\/+/, ''));
    } catch (error) {
      console.warn(`  image failed ${paper.arxivId}: ${error.message}`);
    }
  }
  return downloaded;
}

function countTags(papers, key) {
  const counts = new Map();
  papers.forEach((paper) => paper.representativeFigure?.tags[key]?.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)));
  return Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function summarizeDomain(papers) {
  return {
    paperCount: papers.length,
    paperWithFiguresCount: papers.filter((paper) => paper.figureCount > 0).length,
    totalFigureCount: papers.reduce((sum, paper) => sum + paper.figureCount, 0),
    representativeComposition: countTags(papers, 'composition'),
    representativeElements: countTags(papers, 'elements'),
    topicCounts: Object.fromEntries(Object.entries(papers.reduce((acc, paper) => {
      acc[paper.selectedTopic] = (acc[paper.selectedTopic] ?? 0) + 1;
      return acc;
    }, {})).sort((a, b) => b[1] - a[1])),
  };
}

async function researchDomain(domain) {
  console.log(`\n[${domain}] validating ${SEEDS[domain].length} curated seeds`);
  const seedPapers = await fetchSeedPapers(SEEDS[domain]);
  const missingSeeds = SEEDS[domain].filter((id) => !seedPapers.some((paper) => paper.arxivId === id));
  if (missingSeeds.length) console.warn(`[${domain}] invalid/unavailable seeds: ${missingSeeds.join(', ')}`);

  const searchedPapers = [];
  for (const [index, topic] of TOPICS[domain].entries()) {
    console.log(`[${domain}] search ${index + 1}/${TOPICS[domain].length}: ${topic.label}`);
    searchedPapers.push(...await searchTopic(topic));
    if (index + 1 < TOPICS[domain].length) await sleep(3100);
  }
  const candidateIds = [...new Set([...seedPapers, ...searchedPapers].map((paper) => paper.arxivId))];
  console.log(`[${domain}] enriching ${candidateIds.length} candidates with citation metadata`);
  const citations = await fetchSemanticScholar(candidateIds);
  const candidatePoolSize = Math.min(candidateIds.length, LIMIT + Math.max(20, Math.ceil(LIMIT * 0.4)));
  const selected = selectBalanced(domain, mergePapers(domain, seedPapers, searchedPapers, citations), candidatePoolSize);
  console.log(`[${domain}] selected ${selected.length} candidates to secure ${LIMIT} valid representative figures`);

  const papers = new Array(selected.length);
  let nextIndex = 0;
  let completed = 0;
  async function worker() {
    while (nextIndex < selected.length) {
      const index = nextIndex;
      nextIndex += 1;
      const paper = selected[index];
      console.log(`[${domain}] start ${String(index + 1).padStart(2, '0')}/${selected.length} ${paper.arxivId} ${truncate(paper.title, 62)}`);
      const extracted = await fetchPaperFigures(paper, domain);
      const localRepresentativeImages = await downloadRepresentative(paper, domain, extracted.representative);
      papers[index] = {
        ...paper,
        score: Number(paper.score.toFixed(2)),
        figureHtmlUrl: extracted.sourceUrl,
        figureCount: extracted.figures.length,
        representativeFigure: extracted.representative ? {
          ...extracted.representative,
          localAnalysisImages: localRepresentativeImages,
        } : null,
        figures: extracted.figures.map(({ score, ...figure }) => figure),
        extractionError: extracted.error,
      };
      completed += 1;
      console.log(`[${domain}] done  ${String(completed).padStart(2, '0')}/${selected.length} ${paper.arxivId} (${extracted.figures.length} figures${extracted.error ? ', fallback failed' : ''})`);
      await sleep(180);
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, selected.length) }, () => worker()));
  const valid = papers.filter((paper) => {
    const representative = paper.representativeFigure;
    if (!representative?.images?.length || representative.isTable) return false;
    return !DOWNLOAD_IMAGES || representative.localAnalysisImages.length > 0;
  });
  if (valid.length < LIMIT) {
    throw new Error(`[${domain}] only ${valid.length}/${LIMIT} papers have a renderable non-table representative figure`);
  }
  return valid.slice(0, LIMIT);
}

function markdownTable(counts) {
  return Object.entries(counts).map(([name, count]) => `| ${name} | ${count} |`).join('\n');
}

function buildReport(corpus) {
  const sections = Object.entries(corpus.domains).map(([domain, value]) => {
    const label = domain === 'llm' ? 'LLM' : '具身智能 / VLA';
    const paperRows = value.papers.map((paper, index) => {
      const figure = paper.representativeFigure;
      return `| ${index + 1} | [${escapeCell(truncate(paper.title, 62))}](${paper.absUrl}) | ${paper.year} | ${paper.citationCount} | ${paper.figureCount} | ${escapeCell(figure?.label ?? '未提取')} | ${escapeCell(truncate(figure?.caption ?? paper.extractionError ?? '', 160))} |`;
    }).join('\n');
    return `## ${label}\n\n论文数：${value.summary.paperCount}；成功提取 Figure 的论文：${value.summary.paperWithFiguresCount}；解析到的 Figure 总数：${value.summary.totalFigureCount}。\n\n### 代表图构图类型\n\n| 类型 | 论文数 |\n| --- | ---: |\n${markdownTable(value.summary.representativeComposition)}\n\n### 代表图视觉元素\n\n| 元素 | 论文数 |\n| --- | ---: |\n${markdownTable(value.summary.representativeElements)}\n\n### 论文与 Figure 证据\n\n| # | 论文 | 年份 | 引用 | Figure 数 | 代表 Figure | Caption |\n| ---: | --- | ---: | ---: | ---: | --- | --- |\n${paperRows}`;
  }).join('\n\n');
  return `# arXiv LLM 与具身智能 Figure Atlas\n\n生成时间：${corpus.generatedAt}。本报告由可重复运行的 \`scripts/research-arxiv-figures.mjs\` 生成。引用数来自 Semantic Scholar 快照，仅用于候选排序；Figure 与 caption 来自 ar5iv，失败时回退 arXiv HTML。论文图片只下载到被 Git 忽略的 \`output/research\` 用于人工观察，不进入产品素材库。\n\n## 方法边界\n\n- 样本按六个主题检索并加入奠基性种子，再按主题配额、引用与时间进行分层选择；它是设计语料，不是系统综述或学术排名。\n- 自动标签来自 caption 关键词，后续必须结合 contact sheet 人工复核；统计不能替代对原图的视觉检查。\n- 产品只吸收构图语法和通用视觉模式，不复制论文原图、品牌资产或受限许可素材。\n\n${sections}\n`;
}

async function main() {
  await ensureDirectories();
  const llm = await researchDomain('llm');
  await sleep(3100);
  const embodied = await researchDomain('embodied');
  const generatedAt = new Date().toISOString();
  const corpus = {
    schemaVersion: 1,
    generatedAt,
    methodology: {
      targetPerDomain: LIMIT,
      arxivApi: 'https://export.arxiv.org/api/query',
      figureHtml: ['https://ar5iv.labs.arxiv.org/html/{id}', 'https://arxiv.org/html/{id}'],
      citationSource: 'Semantic Scholar Graph API batch endpoint',
      selection: 'Curated foundational seeds plus six topic searches; topic quotas and citation/recency scoring; representatives require a renderable non-table image.',
      licenseBoundary: 'Original images are local analysis artifacts only. Product assets are independently drawn native vectors.',
    },
    topics: TOPICS,
    domains: {
      llm: { summary: summarizeDomain(llm), papers: llm },
      embodied: { summary: summarizeDomain(embodied), papers: embodied },
    },
  };
  await writeFile(CORPUS_PATH, `${JSON.stringify(corpus, null, 2)}\n`, 'utf8');
  await writeFile(REPORT_PATH, buildReport(corpus), 'utf8');
  console.log(`\nWrote ${CORPUS_PATH.pathname}`);
  console.log(`Wrote ${REPORT_PATH.pathname}`);
  console.log(JSON.stringify({ llm: corpus.domains.llm.summary, embodied: corpus.domains.embodied.summary }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
