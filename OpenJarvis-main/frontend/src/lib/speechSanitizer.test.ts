import { describe, it, expect } from 'vitest';
import { sanitizeTextForSpeech } from './speechSanitizer';

describe('sanitizeTextForSpeech', () => {
  it('strips markdown headers and bold/italics', () => {
    const input = '### Header Title\nThis is **bold** and *italic* text.';
    const result = sanitizeTextForSpeech(input);
    expect(result).toBe('Header Title This is bold and italic text.');
  });

  it('omits code blocks without reading syntax aloud', () => {
    const input = 'Here is the function:\n```python\ndef hello():\n    print("world")\n```\nAll done.';
    const result = sanitizeTextForSpeech(input);
    expect(result).toContain('[code snippet omitted]');
    expect(result).not.toContain('def hello');
  });

  it('preserves link text and removes URLs', () => {
    const input = 'Check out [OpenJarvis Documentation](https://github.com/openjarvis/openjarvis) today.';
    const result = sanitizeTextForSpeech(input);
    expect(result).toBe('Check out OpenJarvis Documentation today.');
    expect(result).not.toContain('https://');
  });

  it('handles bullet lists and table pipes smoothly', () => {
    const input = '- Item 1\n- Item 2\n| Col A | Col B |';
    const result = sanitizeTextForSpeech(input);
    expect(result).toBe('Item 1 Item 2 , Col A , Col B ,');
  });

  it('handles empty input gracefully', () => {
    expect(sanitizeTextForSpeech('')).toBe('');
  });

  it('preserves Urdu text correctly', () => {
    const urdu = 'السلام علیکم! آپ کیسے ہیں؟';
    expect(sanitizeTextForSpeech(urdu)).toBe(urdu);
  });
});

