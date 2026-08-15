import { describe, expect, it } from 'vitest';
import { buildAtlasThreadGraph } from './atlasThreadGraph';
import type { AtlasClaimThreadMessage } from './paperfieldBridge';

const message: AtlasClaimThreadMessage = {
  type: 'atlas:claim-thread',
  version: 1,
  messageId: 'session-1',
  bridgeToken: 'token-1',
  threadContext: {
    schema_version: 1,
    thread_id: 'thread-1',
    thread_slug: 'action-conditioned-models',
    title: 'Action-conditioned models',
    revision: 2,
    content_sha256: 'a'.repeat(64),
    published_at: '2026-08-13T00:00:00Z',
    claims: [1, 2].map((index) => ({
      position: index,
      role: index === 1 ? 'foundation' : 'latest_progress',
      claim_id: `claim-${index}`,
      title: `Claim ${index}`,
      statement: `Source-bounded statement ${index}.`,
      source_sha256: String(index).repeat(64),
      paper: {
        canonical_ref: `arxiv:2608.1000${index}`,
        title: `Paper ${index}`,
        paperfield_path: `/?paper=arxiv%3A2608.1000${index}`,
      },
      evidence: [
        {
          evidence_id: `evidence-${index}-method`,
          label: 'method evidence',
          direction: 'supports',
          paperfield_path: `/?paper=arxiv%3A2608.1000${index}&page=${index + 2}`,
          source_locator: {
            kind: 'paper' as const,
            canonical_paper_ref: `arxiv:2608.1000${index}`,
            page: index + 2,
            figure: `Figure ${index}`,
            quote: `Source-bounded statement ${index}.`,
            content_sha256: String(index).repeat(64),
          },
        },
        {
          evidence_id: `evidence-${index}-experiment`,
          label: 'experiment evidence',
          direction: 'qualifies',
          paperfield_path: `/?paper=arxiv%3A2608.1000${index}&page=${index + 6}`,
          source_locator: {
            kind: 'paper' as const,
            canonical_paper_ref: `arxiv:2608.1000${index}`,
            page: index + 6,
            table: `Table ${index}`,
            quote: `Evaluation boundary ${index}.`,
            content_sha256: String(index).repeat(64),
          },
        },
      ],
    })),
    relations: [{
      position: 1,
      relation_id: 'relation-1',
      left_claim_id: 'claim-1',
      right_claim_id: 'claim-2',
      relation_type: 'extends',
    }],
    provenance: {
      producer: 'research-atlas',
      produced_at: '2026-08-13T00:01:00Z',
      reviewed_revision_only: true,
    },
  },
};

describe('Atlas thread graph conversion', () => {
  it('preserves claim, revision, locator, and reviewed relation provenance', () => {
    const graph = buildAtlasThreadGraph(message);
    expect(graph.title).toBe('Action-conditioned models · r2');
    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(1);
    expect(graph.nodes[0].data.researchClaimContext).toMatchObject({
      threadId: 'thread-1',
      threadRevision: 2,
      claimId: 'claim-1',
      evidenceIds: ['evidence-1-method', 'evidence-1-experiment'],
    });
    expect(graph.nodes[0].data.researchSourceLocator).toMatchObject({
      canonicalPaperRef: 'arxiv:2608.10001',
      page: 3,
      figure: 'Figure 1',
      contentSha256: '1'.repeat(64),
    });
    expect(graph.nodes[0].data.researchClaimContext?.evidence).toHaveLength(2);
    expect(graph.nodes[0].data.researchClaimContext?.evidence[1]).toMatchObject({
      evidenceId: 'evidence-1-experiment',
      paperfieldPath: '/?paper=arxiv%3A2608.10001&page=7',
      sourceLocator: {
        page: 7,
        table: 'Table 1',
        quote: 'Evaluation boundary 1.',
      },
    });
    expect(graph.edges[0].data?.researchRelationContext).toMatchObject({
      relationId: 'relation-1',
      relationType: 'extends',
      leftClaimId: 'claim-1',
      rightClaimId: 'claim-2',
    });
    expect(graph.edges[0].data?.researchRelationContext?.leftEvidence).toHaveLength(2);
    expect(graph.edges[0].data?.researchRelationContext?.rightEvidence[1]).toMatchObject({
      evidenceId: 'evidence-2-experiment',
      sourceLocator: { page: 8, table: 'Table 2' },
    });
    expect(graph.nodes[0].position).not.toEqual(graph.nodes[1].position);
  });
});
