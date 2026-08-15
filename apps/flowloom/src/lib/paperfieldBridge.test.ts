import { describe, expect, it } from 'vitest';
import {
  classifyPaperfieldBridgeEvent,
  isAtlasClaimThreadMessage,
  isAtlasPaperContextMessage,
  isPaperfieldFigureMessage,
  parsePaperfieldBridgeContext,
  resolvePaperfieldPdfUrl,
  resolvePaperfieldOrigin,
  type PaperfieldBridgeContext,
  type PaperfieldFigureMessage,
  type AtlasClaimThreadMessage,
  type AtlasPaperContextMessage,
} from './paperfieldBridge';

const context: PaperfieldBridgeContext = {
  session: 'session-123',
  origin: 'https://papers.example:8443/library?ignored=1',
  token: 'token-456',
};
const opener = {} as MessageEventSource;
const message: PaperfieldFigureMessage = {
  type: 'paperfield:pdf-page',
  version: 1,
  messageId: context.session,
  bridgeToken: context.token,
  imageDataUrl: 'data:image/png;base64,AA==',
  pdfUrl: '/api/papers/arxiv%3A2608.10001/pdf',
  page: 4,
};
const threadMessage: AtlasClaimThreadMessage = {
  type: 'atlas:claim-thread',
  version: 1,
  messageId: context.session,
  bridgeToken: context.token,
  threadContext: {
    schema_version: 1,
    thread_id: 'thread-1',
    thread_slug: 'world-models',
    title: 'Action-conditioned world models',
    revision: 3,
    content_sha256: 'a'.repeat(64),
    published_at: '2026-08-13T00:00:00Z',
    claims: [{
      position: 1,
      role: 'foundation',
      claim_id: 'claim-1',
      title: 'World model claim',
      statement: 'The model predicts action-conditioned latent dynamics.',
      source_sha256: 'b'.repeat(64),
      paper: {
        canonical_ref: 'arxiv:2608.10001',
        title: 'Paper one',
        paperfield_path: '/?paper=arxiv%3A2608.10001',
      },
      evidence: [{
        evidence_id: 'evidence-1',
        paperfield_path: '/?paper=arxiv%3A2608.10001&page=4',
        source_locator: {
          kind: 'paper',
          canonical_paper_ref: 'arxiv:2608.10001',
          page: 4,
          section: '3. Method',
          content_sha256: 'b'.repeat(64),
        },
      }],
    }],
    relations: [],
    provenance: {
      producer: 'research-atlas',
      produced_at: '2026-08-13T00:01:00Z',
      reviewed_revision_only: true,
    },
  },
};
const paperContextMessage: AtlasPaperContextMessage = {
  type: 'atlas:paper-context',
  version: 1,
  messageId: context.session,
  bridgeToken: context.token,
  paperContext: {
    schema_version: 1,
    canonical_paper_ref: 'arxiv:2608.10001',
    paperfield_id: 'arxiv:2608.10001',
    title: 'Paper one',
    paperfield_path: '/?paper=arxiv%3A2608.10001&reader=1',
    source_sha256: 'b'.repeat(64),
    dossier: {
      id: 'dossier-1',
      status: 'completed',
      analysis_level: 'fulltext',
      source_basis: 'fulltext',
      source_sha256: 'b'.repeat(64),
      coverage: { locator_ratio: 1 },
      stages: {},
    },
    claims: [{
      claim_id: 'claim-1',
      stage: 'method',
      title: 'Action-conditioned dynamics',
      statement: 'The model predicts action-conditioned latent dynamics.',
      source_kind: 'paper_claim',
      confidence: 'high',
      source_sha256: 'b'.repeat(64),
      evidence: [{
        evidence_id: 'evidence-1',
        paperfield_path: '/?paper=arxiv%3A2608.10001&reader=1&page=4',
        source_locator: {
          kind: 'paper',
          canonical_paper_ref: 'arxiv:2608.10001',
          page: 4,
          section: '3. Method',
          content_sha256: 'b'.repeat(64),
        },
      }],
    }],
    provenance: {
      producer: 'research-atlas',
      produced_at: '2026-08-14T00:01:00Z',
      source_bounded: true,
    },
  },
};

function event(overrides: Partial<Pick<MessageEvent, 'source' | 'origin' | 'data'>> = {})
  : Pick<MessageEvent, 'source' | 'origin' | 'data'> {
  return {
    source: opener,
    origin: 'https://papers.example:8443',
    data: message,
    ...overrides,
  };
}

describe('Paperfield bridge context', () => {
  it('keeps the token in the URL fragment and canonicalizes an HTTP source origin', () => {
    expect(parsePaperfieldBridgeContext({
      search: '?paperfieldBridgeSession=session-123&paperfieldOrigin=https%3A%2F%2Fpapers.example%3A8443%2Flibrary%3Fignored%3D1',
      hash: '#paperfieldBridge=token-456',
    } as Pick<Location, 'search' | 'hash'>)).toEqual(context);
    expect(resolvePaperfieldOrigin(context)).toBe('https://papers.example:8443');
  });

  it('rejects missing credentials and non-HTTP origins', () => {
    expect(resolvePaperfieldOrigin({ ...context, token: '' })).toBeNull();
    expect(resolvePaperfieldOrigin({ ...context, origin: 'javascript:alert(1)' })).toBeNull();
    expect(resolvePaperfieldOrigin({ ...context, origin: 'not a URL' })).toBeNull();
  });
});

describe('Paperfield bridge message validation', () => {
  it('accepts the bound opener, origin, session, token, and supported image payload', () => {
    expect(classifyPaperfieldBridgeEvent(
      event(), opener, 'https://papers.example:8443', context, new Set(),
    )).toEqual({ kind: 'accept', message });
  });

  it.each([
    ['different opener', event({ source: {} as MessageEventSource })],
    ['different origin', event({ origin: 'https://attacker.example' })],
    ['different session', event({ data: { ...message, messageId: 'wrong-session' } })],
    ['different token', event({ data: { ...message, bridgeToken: 'wrong-token' } })],
  ])('rejects a message with a %s', (_label, candidate) => {
    expect(classifyPaperfieldBridgeEvent(
      candidate, opener, 'https://papers.example:8443', context, new Set(),
    )).toEqual({ kind: 'reject' });
  });

  it('classifies an authenticated duplicate as an idempotent replay', () => {
    expect(classifyPaperfieldBridgeEvent(
      event(), opener, 'https://papers.example:8443', context, new Set([context.session]),
    )).toEqual({ kind: 'replay', message });
  });

  it('requires a duplicate to pass every authentication check before replay acknowledgement', () => {
    const received = new Set([context.session]);
    expect(classifyPaperfieldBridgeEvent(
      event({ origin: 'https://attacker.example' }), opener, 'https://papers.example:8443', context, received,
    )).toEqual({ kind: 'reject' });
    expect(classifyPaperfieldBridgeEvent(
      event({ data: { ...message, bridgeToken: 'wrong-token' } }), opener,
      'https://papers.example:8443', context, received,
    )).toEqual({ kind: 'reject' });
  });

  it('rejects malformed and unsupported image payloads', () => {
    expect(isPaperfieldFigureMessage({ ...message, imageDataUrl: 'https://example.test/page.png' })).toBe(false);
    expect(isPaperfieldFigureMessage({ ...message, imageDataUrl: 'data:image/svg+xml;base64,PHN2Zy8+' })).toBe(false);
  });

  it('only resolves an authenticated PDF endpoint on the Paperfield origin', () => {
    expect(resolvePaperfieldPdfUrl(message, 'https://papers.example:8443')).toBe(
      'https://papers.example:8443/api/papers/arxiv%3A2608.10001/pdf',
    );
    expect(resolvePaperfieldPdfUrl({ ...message, pdfUrl: 'https://attacker.example/paper.pdf' }, 'https://papers.example:8443')).toBeNull();
    expect(resolvePaperfieldPdfUrl({ ...message, pdfUrl: 'javascript:alert(1)' }, 'https://papers.example:8443')).toBeNull();
  });

  it('accepts a source-bounded Atlas thread through the same authenticated bridge', () => {
    expect(isAtlasClaimThreadMessage(threadMessage)).toBe(true);
    expect(classifyPaperfieldBridgeEvent(
      event({ data: threadMessage }), opener, 'https://papers.example:8443', context, new Set(),
    )).toEqual({ kind: 'accept', message: threadMessage });
  });

  it('rejects Atlas claims without exact evidence or a source hash', () => {
    const claim = threadMessage.threadContext.claims[0];
    expect(isAtlasClaimThreadMessage({
      ...threadMessage,
      threadContext: {
        ...threadMessage.threadContext,
        claims: [{
          ...claim,
          evidence: [{
            ...claim.evidence[0],
            source_locator: {
              kind: 'paper',
              canonical_paper_ref: claim.paper.canonical_ref,
              content_sha256: 'b'.repeat(64),
            },
          }],
        }],
      },
    })).toBe(false);
  });

  it('classifies an authenticated Atlas duplicate as a replay', () => {
    expect(classifyPaperfieldBridgeEvent(
      event({ data: threadMessage }), opener, 'https://papers.example:8443', context,
      new Set([context.session]),
    )).toEqual({ kind: 'replay', message: threadMessage });
  });

  it('accepts a source-bounded Atlas paper dossier through the authenticated bridge', () => {
    expect(isAtlasPaperContextMessage(paperContextMessage)).toBe(true);
    expect(classifyPaperfieldBridgeEvent(
      event({ data: paperContextMessage }), opener, 'https://papers.example:8443', context, new Set(),
    )).toEqual({ kind: 'accept', message: paperContextMessage });
  });

  it('rejects Atlas paper claims whose evidence has no source locator', () => {
    const claim = paperContextMessage.paperContext.claims[0];
    expect(isAtlasPaperContextMessage({
      ...paperContextMessage,
      paperContext: {
        ...paperContextMessage.paperContext,
        claims: [{
          ...claim,
          evidence: [{
            paperfield_path: '/?paper=arxiv%3A2608.10001&reader=1',
            source_locator: { kind: 'paper' },
          }],
        }],
      },
    })).toBe(false);
  });

  it('rejects Atlas paper claims with empty evidence or missing content hashes', () => {
    const claim = paperContextMessage.paperContext.claims[0];
    expect(isAtlasPaperContextMessage({
      ...paperContextMessage,
      paperContext: {
        ...paperContextMessage.paperContext,
        claims: [{ ...claim, evidence: [] }],
      },
    })).toBe(false);
    expect(isAtlasPaperContextMessage({
      ...paperContextMessage,
      paperContext: {
        ...paperContextMessage.paperContext,
        claims: [{ ...claim, source_sha256: '' }],
      },
    })).toBe(false);
    expect(isAtlasPaperContextMessage({
      ...paperContextMessage,
      paperContext: {
        ...paperContextMessage.paperContext,
        claims: [{
          ...claim,
          evidence: [{
            ...claim.evidence[0],
            source_locator: { ...claim.evidence[0].source_locator, content_sha256: '' },
          }],
        }],
      },
    })).toBe(false);
  });
});
