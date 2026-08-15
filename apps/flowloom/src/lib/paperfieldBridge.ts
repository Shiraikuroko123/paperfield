const PAPERFIELD_IMAGE_DATA_PATTERN = /^data:image\/(?:png|jpeg|webp);base64,/i;
const MAX_PAPERFIELD_IMAGE_DATA_LENGTH = 64 * 1024 * 1024;

export interface PaperfieldBridgeContext {
  session: string;
  origin: string;
  token: string;
}

export interface PaperfieldFigureMessage {
  type: 'paperfield:pdf-page';
  version: 1;
  messageId: string;
  bridgeToken: string;
  imageDataUrl: string;
  /** Authenticated, same-origin PDF endpoint used for editable operator extraction. */
  pdfUrl?: string;
  pdfFileName?: string;
  paperTitle?: string;
  rasterWidthPx?: number;
  rasterHeightPx?: number;
  pageWidth?: number;
  pageHeight?: number;
  sourceSha256?: string;
  paperId?: string;
  title?: string;
  sourceRef?: string;
  page?: number;
  citation?: string;
  figureContext?: {
    schema_version?: number;
    figure_id?: string;
    title?: string;
    asset_kind?: string;
    asset_sha256?: string;
    source_locator?: {
      kind?: string;
      canonical_paper_ref?: string;
      paperfield_id?: string;
      url?: string;
      page?: number;
      section?: string;
      figure?: string;
      table?: string;
      equation?: string;
      quote?: string;
      content_sha256?: string;
    };
    provenance?: { producer?: string; produced_at?: string };
  };
}

export interface AtlasClaimThreadMessage {
  type: 'atlas:claim-thread';
  version: 1;
  messageId: string;
  bridgeToken: string;
  threadContext: {
    schema_version: 1;
    thread_id: string;
    thread_slug: string;
    title: string;
    revision: number;
    content_sha256: string;
    published_at: string;
    claims: Array<{
      position: number;
      role: string;
      claim_id: string;
      title: string;
      statement: string;
      source_sha256: string;
      paper: {
        canonical_ref: string;
        paperfield_id?: string;
        title: string;
        published?: string;
        paperfield_path: string;
      };
      evidence: Array<{
        evidence_id?: string;
        label?: string;
        direction?: string;
        paperfield_path: string;
        source_locator: {
          kind: 'paper';
          canonical_paper_ref: string;
          paperfield_id?: string;
          url?: string;
          page?: number;
          section?: string;
          figure?: string;
          table?: string;
          equation?: string;
          quote?: string;
          content_sha256: string;
        };
      }>;
    }>;
    relations: Array<{
      position: number;
      relation_id: string;
      left_claim_id: string;
      right_claim_id: string;
      relation_type: 'supports' | 'extends' | 'narrows' | 'reproduces' | 'contradicts' | 'unclear';
    }>;
    provenance: {
      producer: 'research-atlas';
      produced_at: string;
      reviewed_revision_only: true;
    };
  };
}

export interface PaperSemanticEvidence {
  evidence_id?: string;
  label?: string;
  direction?: string;
  paperfield_path: string;
  source_locator: {
    kind: 'paper';
    canonical_paper_ref?: string;
    paperfield_id?: string;
    url?: string;
    page?: number;
    section?: string;
    figure?: string;
    table?: string;
    equation?: string;
    quote?: string;
    content_sha256?: string;
  };
}

export interface PaperSemanticClaim {
  claim_id: string;
  stage: string;
  title: string;
  statement: string;
  source_kind: string;
  confidence: string;
  source_sha256?: string;
  evidence: PaperSemanticEvidence[];
}

export interface PaperSemanticStage {
  stage: string;
  summary?: string;
  source_basis?: string;
  source_sha256?: string;
  sections: Array<{
    claim_id: string;
    title: string;
    body: string;
    source_kind: string;
    confidence: string;
    evidence: PaperSemanticEvidence[];
  }>;
}

export interface AtlasPaperSemanticContext {
  schema_version: 1;
  canonical_paper_ref?: string;
  paperfield_id?: string;
  title: string;
  abstract?: string;
  authors?: string[];
  venue?: string;
  published?: string;
  version?: string;
  source_url?: string;
  pdf_url?: string;
  paperfield_path: string;
  topics?: string[];
  source_sha256?: string;
  dossier: {
    id: string;
    status: string;
    analysis_level: string;
    source_basis: string;
    source_sha256?: string;
    coverage: Record<string, unknown>;
    stages: Record<string, PaperSemanticStage>;
  };
  claims: PaperSemanticClaim[];
  terms?: string[];
  curriculum?: Record<string, unknown>;
  insufficient_information?: string[];
  template_ids?: string[];
  library_elements?: string[];
  provenance: {
    producer: 'research-atlas';
    produced_at: string;
    source_owner?: string;
    source_bounded: true;
  };
}

export interface AtlasPaperContextMessage {
  type: 'atlas:paper-context';
  version: 1;
  messageId: string;
  bridgeToken: string;
  paperContext: AtlasPaperSemanticContext;
}

export type ResearchBridgeMessage = PaperfieldFigureMessage | AtlasClaimThreadMessage | AtlasPaperContextMessage;

export type PaperfieldBridgeDecision =
  | { kind: 'accept'; message: ResearchBridgeMessage }
  | { kind: 'replay'; message: ResearchBridgeMessage }
  | { kind: 'reject' };

export function parsePaperfieldBridgeContext(location: Pick<Location, 'search' | 'hash'>): PaperfieldBridgeContext {
  const query = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  return {
    session: query.get('paperfieldBridgeSession') || '',
    origin: query.get('paperfieldOrigin') || '',
    token: hash.get('paperfieldBridge') || '',
  };
}

export function resolvePaperfieldOrigin(context: PaperfieldBridgeContext): string | null {
  if (!context.session || !context.token || !context.origin) return null;
  try {
    const source = new URL(context.origin);
    return /^https?:$/.test(source.protocol) ? source.origin : null;
  } catch {
    return null;
  }
}

export function isPaperfieldFigureMessage(value: unknown): value is PaperfieldFigureMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<PaperfieldFigureMessage>;
  return message.type === 'paperfield:pdf-page'
    && message.version === 1
    && typeof message.messageId === 'string'
    && typeof message.bridgeToken === 'string'
    && typeof message.imageDataUrl === 'string'
    && PAPERFIELD_IMAGE_DATA_PATTERN.test(message.imageDataUrl)
    && message.imageDataUrl.length <= MAX_PAPERFIELD_IMAGE_DATA_LENGTH;
}

export function resolvePaperfieldPdfUrl(
  message: PaperfieldFigureMessage,
  allowedOrigin: string,
): string | null {
  if (!message.pdfUrl) return null;
  try {
    const source = new URL(message.pdfUrl, allowedOrigin);
    return source.origin === allowedOrigin && /^https?:$/.test(source.protocol) ? source.href : null;
  } catch {
    return null;
  }
}

export function isAtlasClaimThreadMessage(value: unknown): value is AtlasClaimThreadMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<AtlasClaimThreadMessage>;
  const context = message.threadContext;
  if (message.type !== 'atlas:claim-thread'
    || message.version !== 1
    || typeof message.messageId !== 'string'
    || typeof message.bridgeToken !== 'string'
    || !context
    || context.schema_version !== 1
    || typeof context.thread_id !== 'string'
    || typeof context.thread_slug !== 'string'
    || typeof context.title !== 'string'
    || !Number.isInteger(context.revision)
    || !/^[a-f0-9]{64}$/.test(context.content_sha256)
    || !Array.isArray(context.claims)
    || context.claims.length === 0
    || !Array.isArray(context.relations)
    || context.provenance?.producer !== 'research-atlas'
    || context.provenance?.reviewed_revision_only !== true) return false;
  const claimIds = new Set<string>();
  for (const claim of context.claims) {
    if (!claim
      || typeof claim.claim_id !== 'string'
      || claimIds.has(claim.claim_id)
      || typeof claim.statement !== 'string'
      || !claim.statement.trim()
      || !/^[a-f0-9]{64}$/.test(claim.source_sha256)
      || typeof claim.paper?.canonical_ref !== 'string'
      || !Array.isArray(claim.evidence)
      || claim.evidence.length === 0
      || claim.evidence.some((item) => (
        item?.source_locator?.kind !== 'paper'
        || item.source_locator.canonical_paper_ref !== claim.paper.canonical_ref
        || !/^[a-f0-9]{64}$/.test(item.source_locator.content_sha256)
        || !(
          item.source_locator.page
          || item.source_locator.section
          || item.source_locator.figure
          || item.source_locator.table
          || item.source_locator.equation
          || item.source_locator.quote
        )
      ))) return false;
    claimIds.add(claim.claim_id);
  }
  return context.relations.every((relation) => (
    relation
    && typeof relation.relation_id === 'string'
    && claimIds.has(relation.left_claim_id)
    && claimIds.has(relation.right_claim_id)
    && ['supports', 'extends', 'narrows', 'reproduces', 'contradicts', 'unclear'].includes(relation.relation_type)
  ));
}

function hasPaperLocator(locator: PaperSemanticEvidence['source_locator']): boolean {
  return Boolean(
    locator.page
      || locator.section
      || locator.figure
      || locator.table
      || locator.equation
      || locator.quote,
  );
}

export function isAtlasPaperContextMessage(value: unknown): value is AtlasPaperContextMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<AtlasPaperContextMessage>;
  const context = message.paperContext;
  if (message.type !== 'atlas:paper-context'
    || message.version !== 1
    || typeof message.messageId !== 'string'
    || typeof message.bridgeToken !== 'string'
    || !context
    || context.schema_version !== 1
    || typeof context.title !== 'string'
    || !context.title.trim()
    || typeof context.paperfield_path !== 'string'
    || !context.paperfield_path.trim()
    || (!context.canonical_paper_ref && !context.paperfield_id)
    || context.provenance?.producer !== 'research-atlas'
    || context.provenance?.source_bounded !== true
    || typeof context.provenance?.produced_at !== 'string'
    || !context.dossier
    || typeof context.dossier.id !== 'string'
    || typeof context.dossier.status !== 'string'
    || typeof context.dossier.analysis_level !== 'string'
    || !Array.isArray(context.claims)
    || context.claims.length > 80) return false;
  const optionalHash = (candidate: unknown) => (
    candidate === undefined
      || candidate === ''
      || (typeof candidate === 'string' && /^[a-f0-9]{64}$/.test(candidate))
  );
  const requiredHash = (candidate: unknown) => (
    typeof candidate === 'string' && /^[a-f0-9]{64}$/.test(candidate)
  );
  if (!optionalHash(context.source_sha256) || !optionalHash(context.dossier.source_sha256)) return false;
  const claimIds = new Set<string>();
  for (const claim of context.claims) {
    if (!claim
      || typeof claim.claim_id !== 'string'
      || !claim.claim_id.trim()
      || claimIds.has(claim.claim_id)
      || typeof claim.stage !== 'string'
      || typeof claim.title !== 'string'
      || typeof claim.statement !== 'string'
      || !claim.statement.trim()
      || typeof claim.source_kind !== 'string'
      || !['paper_claim', 'platform_derivation'].includes(claim.source_kind)
      || typeof claim.confidence !== 'string'
      || !requiredHash(claim.source_sha256)
      || !Array.isArray(claim.evidence)
      || claim.evidence.length === 0
      || claim.evidence.length > 8
      || claim.evidence.some((item) => (
        !item
        || typeof item.paperfield_path !== 'string'
        || !item.paperfield_path.trim()
        || item.source_locator?.kind !== 'paper'
        || !hasPaperLocator(item.source_locator)
        || !requiredHash(item.source_locator.content_sha256)
      ))) return false;
    claimIds.add(claim.claim_id);
  }
  return true;
}

export function classifyPaperfieldBridgeEvent(
  event: Pick<MessageEvent, 'source' | 'origin' | 'data'>,
  opener: MessageEventSource | null,
  allowedOrigin: string,
  context: PaperfieldBridgeContext,
  receivedMessageIds: ReadonlySet<string>,
): PaperfieldBridgeDecision {
  if (event.source !== opener || event.origin !== allowedOrigin) return { kind: 'reject' };
  if (!isPaperfieldFigureMessage(event.data)
    && !isAtlasClaimThreadMessage(event.data)
    && !isAtlasPaperContextMessage(event.data)) {
    return { kind: 'reject' };
  }
  if (event.data.messageId !== context.session || event.data.bridgeToken !== context.token) {
    return { kind: 'reject' };
  }
  return {
    kind: receivedMessageIds.has(event.data.messageId) ? 'replay' : 'accept',
    message: event.data,
  };
}
