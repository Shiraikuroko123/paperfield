import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  BookOpenCheck,
  Boxes,
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  Paperclip,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type {
  AiAttachment,
  AiConfig,
  AiPaperContext,
  DiagramProvenance,
  FlowEdge,
  FlowNode,
  ScientificSchematicTemplateId,
} from '../types';
import { generateDiagram, isLocalAiEndpoint, isScientificAiScenario, readAiAttachment } from '../lib/aiClient';
import { aiPayloadToGraph } from '../lib/fileAdapters';
import { layoutGraph, normalizeGraph } from '../lib/diagram';
import { createId } from '../lib/id';
import { SCIENTIFIC_SCHEMATIC_TEMPLATES } from '../lib/scientificSchematics';
import { FLAGSHIP_TEMPLATE_IDS } from '../lib/flagshipQuality';
import { IconButton } from './IconButton';

const CONFIG_KEY = 'flowloom.ai.config.v1';
const SECRET_KEY = 'flowloom.ai.key.v1';
const FLAGSHIP_TEMPLATE_ID_SET = new Set<ScientificSchematicTemplateId>(FLAGSHIP_TEMPLATE_IDS);

const scenarioOptions = [
  '通用业务流程',
  '软件架构与数据流',
  '审批与权限',
  '故障响应与运维',
  '客户旅程与服务蓝图',
  '教学与决策树',
  '大模型 / 多模态论文示意图',
  'VLA / 具身智能系统图',
  '训练、推理与数据闭环',
];

function loadConfig(): AiConfig {
  const defaults: AiConfig = {
    baseUrl: import.meta.env.VITE_AI_BASE_URL || 'http://127.0.0.1:3000/v1',
    apiKey: '',
    model: import.meta.env.VITE_AI_MODEL || '',
    rememberKey: false,
  };
  try {
    const stored = JSON.parse(localStorage.getItem(CONFIG_KEY) ?? '{}') as Partial<AiConfig>;
    const rememberKey = Boolean(stored.rememberKey);
    return {
      ...defaults,
      ...stored,
      rememberKey,
      apiKey: rememberKey ? localStorage.getItem(SECRET_KEY) ?? '' : '',
    };
  } catch {
    return defaults;
  }
}

function saveConfig(config: AiConfig) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify({
    baseUrl: config.baseUrl,
    model: config.model,
    rememberKey: config.rememberKey,
  }));
  if (config.rememberKey && config.apiKey) localStorage.setItem(SECRET_KEY, config.apiKey);
  else localStorage.removeItem(SECRET_KEY);
}

interface AiDialogProps {
  open: boolean;
  initialMode?: 'general' | 'paper';
  initialPaperContext?: AiPaperContext;
  referenceNode?: FlowNode;
  onClose: () => void;
  onApply: (title: string, nodes: FlowNode[], edges: FlowEdge[]) => void;
}

export function AiDialog({
  open,
  initialMode = 'paper',
  initialPaperContext,
  referenceNode,
  onClose,
  onApply,
}: AiDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [scenario, setScenario] = useState(scenarioOptions[0]);
  const [prompt, setPrompt] = useState('');
  const [attachments, setAttachments] = useState<AiAttachment[]>([]);
  const [templateId, setTemplateId] = useState<ScientificSchematicTemplateId>('vla-policy');
  const [paperRef, setPaperRef] = useState('');
  const [paperTitle, setPaperTitle] = useState('');
  const [paperPage, setPaperPage] = useState('');
  const [paperFigure, setPaperFigure] = useState('');
  const [evidenceQuote, setEvidenceQuote] = useState('');
  const [config, setConfig] = useState<AiConfig>(loadConfig);
  const [showSettings, setShowSettings] = useState(false);
  const [status, setStatus] = useState<'idle' | 'reading' | 'generating' | 'success'>('idle');
  const [error, setError] = useState('');
  const scientificScenario = isScientificAiScenario(scenario);
  const referenceLocator = referenceNode?.data.researchSourceLocator;
  const selectedTemplate = SCIENTIFIC_SCHEMATIC_TEMPLATES.find((template) => template.id === templateId) ?? SCIENTIFIC_SCHEMATIC_TEMPLATES[0];

  useEffect(() => {
    if (!open || !referenceNode) return;
    const locator = referenceNode.data.researchSourceLocator;
    if (locator?.canonicalPaperRef && !paperRef) setPaperRef(locator.canonicalPaperRef);
    if (referenceNode.data.label && !paperTitle) setPaperTitle(referenceNode.data.label.replace(/\s*[·•]\s*p\.\d+\s*$/i, ''));
    if (locator?.page && !paperPage) setPaperPage(String(locator.page));
    if (locator?.figure && !paperFigure) setPaperFigure(locator.figure);
    if (locator?.quote && !evidenceQuote) setEvidenceQuote(locator.quote);
  }, [evidenceQuote, open, paperFigure, paperPage, paperRef, paperTitle, referenceNode]);

  useEffect(() => {
    if (!open || !initialPaperContext) return;
    const firstEvidence = initialPaperContext.claims
      ?.flatMap((claim) => claim.evidence)
      .find((item) => item.quote || item.page || item.figure || item.section);
    const firstClaim = initialPaperContext.claims?.find((claim) => claim.statement);
    setPaperRef(initialPaperContext.paperRef || '');
    setPaperTitle(initialPaperContext.title || '');
    setPaperPage(initialPaperContext.page ? String(initialPaperContext.page) : firstEvidence?.page ? String(firstEvidence.page) : '');
    setPaperFigure(initialPaperContext.figure || firstEvidence?.figure || '');
    setEvidenceQuote(initialPaperContext.quote || firstEvidence?.quote || firstClaim?.statement.slice(0, 2400) || '');
    const requestedTemplate = initialPaperContext.templateIds?.find((candidate) => (
      SCIENTIFIC_SCHEMATIC_TEMPLATES.some((template) => template.id === candidate)
    ));
    if (requestedTemplate) setTemplateId(requestedTemplate as ScientificSchematicTemplateId);
  }, [initialPaperContext, open]);

  useEffect(() => {
    if (!open) return;
    setScenario(initialMode === 'paper' ? 'VLA / 具身智能系统图' : scenarioOptions[0]);
  }, [initialMode, open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const referenceAttachment = useMemo<AiAttachment | null>(() => {
    if (!referenceNode?.data.imageUrl) return null;
    const mimeType = referenceNode.data.imageUrl.match(/^data:([^;,]+)/)?.[1] ?? 'image/png';
    if (!mimeType.startsWith('image/')) return null;
    return {
      name: referenceNode.data.sourceRef ?? referenceNode.data.label,
      mimeType,
      content: referenceNode.data.imageUrl,
      kind: 'image',
    };
  }, [referenceNode]);

  const handleFiles = async (files: FileList | File[]) => {
    setStatus('reading');
    setError('');
    try {
      const next = await Promise.all(Array.from(files).slice(0, 8).map(readAiAttachment));
      setAttachments((current) => [...current, ...next].slice(0, 8));
      setStatus('idle');
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : '附件读取失败。');
      setStatus('idle');
    }
  };

  const submit = async () => {
    if (!prompt.trim() && !evidenceQuote.trim() && attachments.length === 0 && !referenceAttachment && !initialPaperContext) {
      setError('请输入流程场景或添加来源文件。');
      return;
    }
    saveConfig(config);
    setError('');
    setStatus('generating');
    abortRef.current = new AbortController();
    try {
      const requestPrompt = prompt.trim() || (scientificScenario
        ? evidenceQuote.trim() || (initialPaperContext
          ? 'Create an original editable scientific system schematic from the source-bounded Atlas dossier. Preserve verified claims and mark every unsupported bridge as inferred.'
          : 'Reconstruct the supplied source as an original editable scientific system schematic.')
        : 'Reconstruct the supplied source as an editable flowchart.');
      const requestAttachments = referenceAttachment ? [referenceAttachment, ...attachments] : attachments;
      const hasPaperContext = Boolean(initialPaperContext || paperRef.trim() || evidenceQuote.trim());
      const attachmentTransferConfirmed = (!requestAttachments.length && !hasPaperContext) || isLocalAiEndpoint(config.baseUrl)
        ? true
        : window.confirm(
          `The selected paper material will be sent to ${config.baseUrl}.\n\nFiles: ${requestAttachments.map((item) => item.name).join(', ') || 'none'}\nAtlas dossier context: ${hasPaperContext ? 'included' : 'none'}\n\nContinue for this request?`,
        );
      if (!attachmentTransferConfirmed) {
        setStatus('idle');
        return;
      }
      const paperContext: AiPaperContext | undefined = scientificScenario ? {
        ...initialPaperContext,
        paperRef: paperRef.trim() || referenceLocator?.canonicalPaperRef,
        paperfieldId: referenceLocator?.paperfieldId || initialPaperContext?.paperfieldId,
        title: paperTitle.trim() || undefined,
        page: Number(paperPage) || referenceLocator?.page,
        figure: paperFigure.trim() || referenceLocator?.figure,
        section: referenceLocator?.section || initialPaperContext?.section,
        quote: evidenceQuote.trim() || referenceLocator?.quote,
        sourceHash: referenceLocator?.contentSha256 || initialPaperContext?.sourceHash,
        templateIds: [...new Set([...(initialPaperContext?.templateIds || []), templateId])],
        libraryElements: [
          ...(initialPaperContext?.libraryElements || []),
          `template:${selectedTemplate.id}`,
          `focus:${selectedTemplate.focus}`,
          ...selectedTemplate.references.map((reference) => `${reference.title} ${reference.figure}: ${reference.pattern}`),
        ].filter((item, index, values) => values.indexOf(item) === index),
      } : undefined;
      const diagramProvenance: DiagramProvenance | undefined = scientificScenario ? {
        schemaVersion: 1,
        sourceType: 'paper-semantic-generation',
        paperRef: paperContext?.paperRef,
        paperfieldId: paperContext?.paperfieldId,
        page: paperContext?.page,
        figure: paperContext?.figure,
        quote: paperContext?.quote,
        sourceHash: paperContext?.sourceHash,
        model: config.model,
        templateIds: paperContext?.templateIds,
        libraryElements: paperContext?.libraryElements,
        confidence: 0.72,
        warnings: [
          'The selected library template is a layout prior, not evidence for paper-specific claims.',
          ...(!paperContext?.paperRef && !attachments.some((item) => item.kind === 'pdf')
            ? ['No canonical paper reference or PDF was supplied; verify all paper-specific labels.']
            : []),
        ],
      } : undefined;
      const payload = await generateDiagram({
        prompt: requestPrompt,
        scenario,
        attachments: requestAttachments,
        config,
        paperContext,
        attachmentTransferConfirmed,
        signal: abortRef.current.signal,
      });
      const parsed = aiPayloadToGraph(payload, diagramProvenance);
      const positioned = parsed.nodes.some((node) => node.position.x || node.position.y)
        ? normalizeGraph(parsed.nodes, parsed.edges)
        : layoutGraph(parsed.nodes, parsed.edges, parsed.direction);
      const scientificRootIndex = positioned.nodes.findIndex((node) => node.data.schematicRole === 'frame');
      const rootIndex = scientificRootIndex >= 0 ? scientificRootIndex : 0;
      const finalNodes = scientificScenario ? positioned.nodes.map((node, index) => index === rootIndex ? {
        ...node,
        data: {
          ...node.data,
          scientificRole: 'schematic-root' as const,
          schematicRole: node.data.schematicRole ?? 'frame',
          provenance: {
            id: createId('provenance'),
            kind: 'scientific-schematic' as const,
            sourceName: 'CCSwitch AI scientific schematic',
            sourceFormat: 'OpenAI-compatible structured JSON',
            sourceData: JSON.stringify({ scenario, prompt: requestPrompt, paperContext, attachments: requestAttachments.map((item) => item.name) }),
            engine: config.model,
            generatedAt: new Date().toISOString(),
            schematic: {
              templateId,
              style: 'conference' as const,
              density: 'detailed' as const,
              language: /[\p{Script=Han}]/u.test(requestPrompt) ? 'zh' as const : 'en' as const,
              generatedBy: 'ai' as const,
              prompt: requestPrompt,
              references: selectedTemplate.references.map((reference) => reference.arxivId),
            },
          },
        },
      } : node) : positioned.nodes;
      onApply(parsed.title, finalNodes, positioned.edges);
      setStatus('success');
      window.setTimeout(() => {
        setStatus('idle');
        onClose();
      }, 420);
    } catch (generationError) {
      if ((generationError as Error).name === 'AbortError') {
        setStatus('idle');
        return;
      }
      const message = generationError instanceof Error ? generationError.message : 'AI 生成失败。';
      setError(/Failed to fetch/i.test(message) ? '无法访问 AI 接口。请检查 CCSwitch 端点、服务状态与浏览器 CORS 设置。' : message);
      setStatus('idle');
    }
  };

  const close = () => {
    abortRef.current?.abort();
    setError('');
    setStatus('idle');
    onClose();
  };

  return (
    <dialog ref={dialogRef} className="app-dialog ai-dialog" onClose={onClose} onCancel={(event) => { event.preventDefault(); close(); }}>
      <div className="dialog-header">
        <div className="dialog-title"><span className="dialog-title__icon"><Sparkles size={18} /></span><div><h2>{scientificScenario ? '论文语义绘图' : 'AI 图形设计'}</h2><p>{scientificScenario ? '论文证据 + 科研图库 + 已训练模型' : '结构化流程图 · OpenAI 兼容接口'}</p></div></div>
        <IconButton label="关闭" icon={<X size={18} />} onClick={close} />
      </div>

      <div className="ai-dialog__content">
        <div className="ai-compose">
          <label className="field-stack">
            <span className="field-label">场景</span>
            <select value={scenario} onChange={(event) => setScenario(event.target.value)}>
              {scenarioOptions.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          {scientificScenario && (
            <section className="ai-paper-grounding" aria-label="Paper grounding and library template">
              {initialPaperContext && (
                <div className="ai-paper-context-banner" role="status">
                  <BookOpenCheck size={17} />
                  <div>
                    <strong>已载入 Atlas 深度档案</strong>
                    <span>
                      {initialPaperContext.claims?.length || 0} 条来源约束主张 · {initialPaperContext.sourceBasis || '来源层级未标注'} · 生成前仍需人工确认
                    </span>
                  </div>
                  {initialPaperContext.paperfieldPath && (
                    <a href={initialPaperContext.paperfieldPath} target="_blank" rel="noreferrer">回 Paperfield 精读</a>
                  )}
                </div>
              )}
              <div className="ai-paper-grounding__title">
                <BookOpenCheck size={17} />
                <div><strong>论文证据与构图库</strong><span>模板只约束布局，论文内容决定事实</span></div>
              </div>
              <div className="ai-paper-grid">
                <label className="field-stack"><span className="field-label">论文标题</span><input value={paperTitle} onChange={(event) => setPaperTitle(event.target.value)} placeholder="Paper title" /></label>
                <label className="field-stack"><span className="field-label">Canonical ref</span><input value={paperRef} onChange={(event) => setPaperRef(event.target.value)} placeholder="arxiv:2406.09246 / DOI" /></label>
                <label className="field-stack"><span className="field-label">页码</span><input type="number" min="1" value={paperPage} onChange={(event) => setPaperPage(event.target.value)} placeholder="Page" /></label>
                <label className="field-stack"><span className="field-label">图号</span><input value={paperFigure} onChange={(event) => setPaperFigure(event.target.value)} placeholder="Figure 1" /></label>
              </div>
              <label className="field-stack">
                <span className="field-label"><Boxes size={14} /> 论文库构图模板</span>
                <select value={templateId} onChange={(event) => setTemplateId(event.target.value as ScientificSchematicTemplateId)}>
                  {SCIENTIFIC_SCHEMATIC_TEMPLATES.map((template) => (
                    <option key={template.id} value={template.id}>{template.nameEn}{FLAGSHIP_TEMPLATE_ID_SET.has(template.id) ? ' · Flagship' : ''}</option>
                  ))}
                </select>
                <small>{selectedTemplate.focus}</small>
              </label>
              <label className="field-stack">
                <span className="field-label">证据摘录</span>
                <textarea rows={3} value={evidenceQuote} onChange={(event) => setEvidenceQuote(event.target.value)} placeholder="Paste a supporting method sentence or figure caption. Inferred nodes will be marked for review." />
              </label>
            </section>
          )}
          <label className="field-stack">
            <span className="field-label">需求与上下文</span>
            <textarea
              rows={8}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={scientificScenario
                ? '例如：绘制一个 VLA 机器人策略图。双视觉编码器与语言指令进入 VLM 主干，动作专家预测 16 步动作块，并显示机器人环境反馈回路。'
                : '例如：为企业客户退款申请设计审批流程，包含金额分级、风控复核、超时升级和失败回退。'}
              autoFocus
            />
          </label>

          <div className="attachment-list">
            {referenceAttachment && (
              <div className="attachment-chip is-reference"><ImageIcon size={15} /><span>{referenceAttachment.name}</span><small>当前参考图</small></div>
            )}
            {attachments.map((attachment, index) => (
              <div className="attachment-chip" key={`${attachment.name}-${index}`}>
                {attachment.kind === 'image' ? <ImageIcon size={15} /> : <FileText size={15} />}
                <span>{attachment.name}</span>
                {attachment.kind === 'pdf' && <small>{attachment.pageCount ?? '?'} pages · local text extraction</small>}
                <button aria-label={`移除 ${attachment.name}`} onClick={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>

          <label className="file-drop compact-file-drop">
            <Paperclip size={17} />
            <span>{status === 'reading' ? '正在读取…' : scientificScenario ? '添加论文 PDF、摘录或参考图' : '添加文本、数据或图片'}</span>
            <input type="file" multiple accept="image/*,application/pdf,.pdf,.txt,.md,.csv,.json,.yaml,.yml,.xml,.mmd,.dot,.puml" onChange={(event) => event.target.files && handleFiles(event.target.files)} />
          </label>

          {error && <div className="inline-message inline-message--error" role="alert">{error}</div>}
        </div>

        <div className={`ai-settings ${showSettings ? 'is-open' : ''}`}>
          <button className="settings-toggle" onClick={() => setShowSettings((value) => !value)} aria-expanded={showSettings}>
            接口设置 <span>{config.model || '未配置模型'}</span>
          </button>
          {showSettings && (
            <div className="ai-settings__fields">
              <label className="field-stack"><span className="field-label">Base URL</span><input value={config.baseUrl} onChange={(event) => setConfig({ ...config, baseUrl: event.target.value })} placeholder="http://127.0.0.1:3000/v1" /></label>
              <label className="field-stack"><span className="field-label">模型</span><input value={config.model} onChange={(event) => setConfig({ ...config, model: event.target.value })} placeholder="模型名称" /></label>
              <label className="field-stack"><span className="field-label">API Key</span><input type="password" value={config.apiKey} onChange={(event) => setConfig({ ...config, apiKey: event.target.value })} autoComplete="off" placeholder="可留空" /></label>
              <label className="toggle-row"><input type="checkbox" checked={config.rememberKey} onChange={(event) => setConfig({ ...config, rememberKey: event.target.checked })} /> 在此浏览器保存 Key</label>
            </div>
          )}
        </div>
      </div>

      <div className="dialog-footer">
        <button className="secondary-button" onClick={close}>取消</button>
        {status === 'generating' ? (
          <button className="primary-button" onClick={() => abortRef.current?.abort()}><LoaderCircle className="spin" size={16} /> 停止生成</button>
        ) : status === 'success' ? (
          <button className="primary-button" disabled><Check size={16} /> 已生成</button>
        ) : (
          <button className="primary-button" onClick={submit}><Sparkles size={16} /> {scientificScenario ? '生成论文示意图' : '生成流程图'}</button>
        )}
      </div>
    </dialog>
  );
}
