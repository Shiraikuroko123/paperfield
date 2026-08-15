import { describe, expect, it } from 'vitest';
import { generateDiagram, isLocalAiEndpoint } from './aiClient';

describe('AI attachment transfer policy', () => {
  it('recognizes only loopback model endpoints as local', () => {
    expect(isLocalAiEndpoint('http://127.0.0.1:3000/v1')).toBe(true);
    expect(isLocalAiEndpoint('http://localhost:3000/v1')).toBe(true);
    expect(isLocalAiEndpoint('https://models.example.com/v1')).toBe(false);
  });

  it('blocks paper attachments to a remote endpoint without per-request confirmation', async () => {
    await expect(generateDiagram({
      prompt: 'Draw the method.',
      scenario: 'scientific paper',
      attachments: [{ name: 'draft.pdf', mimeType: 'application/pdf', content: '[Page 1] private draft', kind: 'pdf' }],
      config: { baseUrl: 'https://models.example.com/v1', apiKey: '', model: 'vision-model', rememberKey: false },
    })).rejects.toThrow('explicit confirmation');
  });
});
