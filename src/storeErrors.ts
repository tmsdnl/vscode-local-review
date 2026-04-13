export function isFileMissingError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const candidate = error as { code?: unknown; message?: unknown };
  if (candidate.code === 'FileNotFound' || candidate.code === 'ENOENT') {
    return true;
  }
  if (typeof candidate.code === 'string' && candidate.code !== 'Unknown') {
    return false;
  }

  return typeof candidate.message === 'string' && /\b(?:FileNotFound|ENOENT)\b/i.test(candidate.message);
}
