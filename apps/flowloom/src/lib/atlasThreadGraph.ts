import type {
  FlowEdge,
  FlowNode,
  ResearchEvidenceReference,
  ResearchSourceLocator,
  ShapeKind,
} from '../types';
import { createFlowEdge, createFlowNode, layoutGraph } from './diagram';
import type { AtlasClaimThreadMessage } from './paperfieldBridge';

const ROLE_SHAPES: Record<string, ShapeKind> = {
  definition: 'note',
  foundation: 'document',
  representative: 'process',
  benchmark: 'data',
  replication: 'multiple-documents',
  counter_evidence: 'decision',
  latest_progress: 'rounded-rectangle',
};

const RELATION_LABELS: Record<string, string> = {
  supports: '支持',
  extends: '扩展',
  narrows: '限定',
  reproduces: '复现',
  contradicts: '反证',
  unclear: '关系待澄清',
};

const RELATION_COLORS: Record<string, string> = {
  supports: 'oklch(0.430 0.105 172)',
  extends: 'oklch(0.500 0.110 245)',
  narrows: 'oklch(0.560 0.155 72)',
  reproduces: 'oklch(0.500 0.085 205)',
  contradicts: 'oklch(0.520 0.185 28)',
  unclear: 'oklch(0.500 0.018 70)',
};

export interface AtlasThreadGraph {
  title: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

type AtlasClaim = AtlasClaimThreadMessage['threadContext']['claims'][number];

function sourceLocator(claim: AtlasClaim, index: number): ResearchSourceLocator {
  const locator = claim.evidence[index].source_locator;
  return {
    kind: 'paper',
    canonicalPaperRef: locator.canonical_paper_ref,
    paperfieldId: locator.paperfield_id,
    url: locator.url,
    page: locator.page,
    section: locator.section,
    figure: locator.figure,
    table: locator.table,
    equation: locator.equation,
    quote: locator.quote,
    contentSha256: locator.content_sha256,
  };
}

function evidenceReferences(claim: AtlasClaim): ResearchEvidenceReference[] {
  return claim.evidence.map((item, index) => ({
    evidenceId: item.evidence_id,
    label: item.label,
    direction: item.direction,
    paperfieldPath: item.paperfield_path,
    sourceLocator: sourceLocator(claim, index),
  }));
}

export function buildAtlasThreadGraph(message: AtlasClaimThreadMessage): AtlasThreadGraph {
  const context = message.threadContext;
  const nodeIds = new Map<string, string>();
  const evidenceByClaim = new Map<string, ResearchEvidenceReference[]>();
  const nodes = context.claims.map((claim) => {
    const nodeId = `atlas-claim-${claim.claim_id}`;
    nodeIds.set(claim.claim_id, nodeId);
    const primaryEvidence = claim.evidence[0];
    const evidence = evidenceReferences(claim);
    evidenceByClaim.set(claim.claim_id, evidence);
    const node = createFlowNode(
      ROLE_SHAPES[claim.role] ?? 'document',
      { x: 0, y: 0 },
      claim.title || claim.statement,
      {
        id: nodeId,
        style: { width: 320, height: 164 },
      },
    );
    node.data = {
      ...node.data,
      description: claim.statement,
      sourceRef: primaryEvidence.paperfield_path || claim.paper.paperfield_path,
      textAlign: 'left',
      verticalAlign: 'top',
      scientificTextPaddingX: 18,
      scientificTextPaddingY: 16,
      researchSourceLocator: evidence[0].sourceLocator,
      researchClaimContext: {
        schemaVersion: 1,
        threadId: context.thread_id,
        threadSlug: context.thread_slug,
        threadRevision: context.revision,
        threadContentSha256: context.content_sha256,
        claimId: claim.claim_id,
        role: claim.role,
        canonicalPaperRef: claim.paper.canonical_ref,
        paperfieldPath: claim.paper.paperfield_path,
        sourceSha256: claim.source_sha256,
        evidenceIds: claim.evidence
          .map((item) => item.evidence_id || '')
          .filter(Boolean),
        evidence,
      },
    };
    return node;
  });

  const edges = context.relations.map((relation) => {
    const source = nodeIds.get(relation.left_claim_id);
    const target = nodeIds.get(relation.right_claim_id);
    if (!source || !target) {
      throw new Error(`研究关系 ${relation.relation_id} 引用了缺失的主张`);
    }
    const edge = createFlowEdge(
      source,
      target,
      RELATION_LABELS[relation.relation_type],
      relation.relation_type === 'contradicts' ? 'bezier' : 'smoothstep',
    );
    const color = RELATION_COLORS[relation.relation_type];
    edge.id = `atlas-relation-${relation.relation_id}`;
    edge.data = {
      label: edge.data?.label,
      color,
      width: edge.data?.width ?? 1.75,
      lineStyle: relation.relation_type === 'unclear' ? 'dashed' : 'solid',
      routing: edge.data?.routing ?? 'smoothstep',
      arrowStart: edge.data?.arrowStart ?? 'none',
      arrowEnd: edge.data?.arrowEnd ?? 'closed',
      researchRelationContext: {
        schemaVersion: 1,
        threadId: context.thread_id,
        threadRevision: context.revision,
        threadContentSha256: context.content_sha256,
        relationId: relation.relation_id,
        leftClaimId: relation.left_claim_id,
        rightClaimId: relation.right_claim_id,
        relationType: relation.relation_type,
        leftEvidence: evidenceByClaim.get(relation.left_claim_id) ?? [],
        rightEvidence: evidenceByClaim.get(relation.right_claim_id) ?? [],
      },
    };
    edge.style = {
      ...edge.style,
      stroke: color,
      strokeDasharray: relation.relation_type === 'unclear' ? '8 6' : undefined,
    };
    if (edge.markerEnd && typeof edge.markerEnd === 'object') {
      edge.markerEnd = { ...edge.markerEnd, color };
    }
    return edge;
  });

  const graph = layoutGraph(nodes, edges, 'LR');
  return {
    title: `${context.title} · r${context.revision}`,
    nodes: graph.nodes,
    edges: graph.edges,
  };
}
