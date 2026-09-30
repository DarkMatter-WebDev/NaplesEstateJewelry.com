import { describe, expect, it } from 'vitest';
import { MAX_AI_SPEECH_TEXT_LENGTH, parseAiSpeechText } from '@/lib/ai-speech';

describe('AI assistant speech input', () => {
  it('normalizes a readable assistant response', () => {
    expect(parseAiSpeechText('  I updated the title.\n\nWhat is the weight?  ')).toEqual({
      ok: true,
      text: 'I updated the title. What is the weight?',
    });
  });

  it('rejects empty input', () => {
    expect(parseAiSpeechText(' \u0000 ')).toEqual({
      ok: false,
      error: 'A response is required for read aloud.',
    });
  });

  it('rejects text above the read-aloud limit', () => {
    const result = parseAiSpeechText('x'.repeat(MAX_AI_SPEECH_TEXT_LENGTH + 1));
    expect(result.ok).toBe(false);
  });
});
