import type { ReviewAnchor, ReviewRange } from './model';

export interface AnchorResolution {
  range: ReviewRange;
  stale: boolean;
}

export function createAnchor(lines: readonly string[], range: ReviewRange, contextWindow = 3): ReviewAnchor {
  const excerpt = getRangeText(lines, range);
  const beforeStart = Math.max(0, range.startLine - contextWindow);
  const afterEnd = Math.min(lines.length - 1, range.endLine + contextWindow);

  return {
    excerpt,
    before: lines.slice(beforeStart, range.startLine),
    after: lines.slice(range.endLine + 1, afterEnd + 1)
  };
}

export function resolveAnchor(lines: readonly string[], range: ReviewRange, anchor: ReviewAnchor): AnchorResolution {
  if (rangeStillMatches(lines, range, anchor)) {
    return { range, stale: false };
  }

  if (anchor.excerpt.length === 0) {
    const emptyMatches = findEmptyExcerptMatches(lines, range, anchor);
    if (emptyMatches.length === 1) {
      return { range: emptyMatches[0], stale: false };
    }
    return { range, stale: true };
  }

  const matches = findExcerptMatches(lines, anchor.excerpt);
  if (matches.length === 1) {
    return { range: matches[0], stale: false };
  }

  const contextualMatches = matches.filter((match) => contextMatches(lines, match, anchor));
  if (contextualMatches.length === 1) {
    return { range: contextualMatches[0], stale: false };
  }

  return { range, stale: true };
}

export function getRangeText(lines: readonly string[], range: ReviewRange): string {
  if (range.startLine >= lines.length || range.endLine >= lines.length) {
    return '';
  }

  if (range.startLine === range.endLine) {
    return lines[range.startLine].slice(range.startCharacter, range.endCharacter);
  }

  const selected = lines.slice(range.startLine, range.endLine + 1);
  selected[0] = selected[0].slice(range.startCharacter);
  selected[selected.length - 1] = selected[selected.length - 1].slice(0, range.endCharacter);
  return selected.join('\n');
}

function rangeStillMatches(lines: readonly string[], range: ReviewRange, anchor: ReviewAnchor): boolean {
  if (!rangeIsInBounds(lines, range)) {
    return false;
  }

  const text = getRangeText(lines, range);
  if (anchor.excerpt.length > 0) {
    return text === anchor.excerpt;
  }

  return text === '' && contextMatches(lines, range, anchor);
}

function findExcerptMatches(lines: readonly string[], excerpt: string): ReviewRange[] {
  const text = lines.join('\n');
  const ranges: ReviewRange[] = [];
  let index = text.indexOf(excerpt);
  while (index !== -1) {
    ranges.push(offsetsToRange(lines, index, index + excerpt.length));
    index = text.indexOf(excerpt, index + Math.max(excerpt.length, 1));
  }
  return ranges;
}

function findEmptyExcerptMatches(lines: readonly string[], originalRange: ReviewRange, anchor: ReviewAnchor): ReviewRange[] {
  const matches: ReviewRange[] = [];
  for (let line = 0; line < lines.length; line += 1) {
    const character = Math.min(originalRange.startCharacter, lines[line].length);
    const candidate = { startLine: line, startCharacter: character, endLine: line, endCharacter: character };
    if (contextMatches(lines, candidate, anchor)) {
      matches.push(candidate);
    }
  }
  return matches;
}

function offsetsToRange(lines: readonly string[], startOffset: number, endOffset: number): ReviewRange {
  let offset = 0;
  let startLine = 0;
  let startCharacter = 0;
  let endLine = 0;
  let endCharacter = 0;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const lineLengthWithBreak = lines[lineIndex].length + (lineIndex < lines.length - 1 ? 1 : 0);
    if (startOffset >= offset && startOffset <= offset + lines[lineIndex].length) {
      startLine = lineIndex;
      startCharacter = startOffset - offset;
    }
    if (endOffset >= offset && endOffset <= offset + lines[lineIndex].length) {
      endLine = lineIndex;
      endCharacter = endOffset - offset;
      break;
    }
    offset += lineLengthWithBreak;
  }

  return { startLine, startCharacter, endLine, endCharacter };
}

function contextMatches(lines: readonly string[], range: ReviewRange, anchor: ReviewAnchor): boolean {
  const before = anchor.before.length === 0
    || anchor.before.every((line, index) => lines[range.startLine - anchor.before.length + index] === line);
  const after = anchor.after.length === 0
    || anchor.after.every((line, index) => lines[range.endLine + 1 + index] === line);
  return before && after;
}

function rangeIsInBounds(lines: readonly string[], range: ReviewRange): boolean {
  if (range.startLine < 0 || range.endLine < range.startLine || range.endLine >= lines.length) {
    return false;
  }
  if (range.startCharacter < 0 || range.endCharacter < 0) {
    return false;
  }

  const startLine = lines[range.startLine];
  const endLine = lines[range.endLine];
  if (range.startCharacter > startLine.length || range.endCharacter > endLine.length) {
    return false;
  }
  if (range.startLine === range.endLine && range.startCharacter > range.endCharacter) {
    return false;
  }

  return true;
}
