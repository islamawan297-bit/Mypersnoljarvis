/**
 * Sanitizes Markdown, code blocks, URLs, and formatting symbols from text
 * so it can be spoken naturally by Text-to-Speech (TTS) engines without
 * reading raw symbols aloud.
 */
export function sanitizeTextForSpeech(text: string): string {
  if (!text) return '';

  let cleaned = text;

  // 1. Remove code blocks (fenced by ``` or ~~~), replace with a brief verbal indicator
  cleaned = cleaned.replace(/```[\s\S]*?```/g, ' [code snippet omitted] ');
  cleaned = cleaned.replace(/~~~[\s\S]*?~~~/g, ' [code snippet omitted] ');

  // 2. Remove inline code backticks: `code` -> code
  cleaned = cleaned.replace(/`([^`]+)`/g, '$1');

  // 3. Remove Markdown images: ![alt](url) -> ''
  cleaned = cleaned.replace(/!\[([^\]]*)\]\([^)]+\)/g, '');

  // 4. Convert Markdown links: [anchor text](url) -> anchor text
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // 5. Remove HTML tags
  cleaned = cleaned.replace(/<[^>]+>/g, ' ');

  // 6. Remove headings (#, ##, ###, etc.) at start of line
  cleaned = cleaned.replace(/^#{1,6}\s+/gm, '');

  // 7. Remove blockquote markers (>) at start of line
  cleaned = cleaned.replace(/^>\s+/gm, '');

  // 8. Remove list markers (-, *, +, numbers) at start of lines, replace with natural comma/pause
  cleaned = cleaned.replace(/^[\s]*[-*+]\s+/gm, '');
  cleaned = cleaned.replace(/^[\s]*\d+\.\s+/gm, '');

  // 9. Remove bold and italic markers: **, *, __, _
  cleaned = cleaned.replace(/(\*\*|__)(.*?)\1/g, '$2');
  cleaned = cleaned.replace(/(\*|_)(.*?)\1/g, '$2');

  // 10. Remove strikethrough: ~~text~~
  cleaned = cleaned.replace(/~~(.*?)~~/g, '$1');

  // 11. Remove horizontal rules: ---, ===, ***
  cleaned = cleaned.replace(/^[ \t]*[-=*]{3,}[ \t]*$/gm, '');

  // 12. Convert table delimiters (|) to commas for natural pauses
  cleaned = cleaned.replace(/\|/g, ', ');

  // 13. Remove LaTeX formulas: $...$ or $$...$$
  cleaned = cleaned.replace(/\$\$[\s\S]*?\$\$/g, ' ');
  cleaned = cleaned.replace(/\$([^$]+)\$/g, '$1');

  // 14. Clean emoji & special technical glyphs that sound jarring
  cleaned = cleaned.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]/gu, '');

  // 15. Normalize whitespace and line breaks
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
}

