export function parsePorcelainStatus(output: string): string[] {
  const records = output.split('\0').filter(Boolean);
  const changedFiles: string[] = [];

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const status = record.slice(0, 2);
    const filePath = record.slice(3);
    if (filePath.length === 0) {
      continue;
    }

    changedFiles.push(filePath);
    if ((status.includes('R') || status.includes('C')) && index + 1 < records.length) {
      index += 1;
    }
  }

  return changedFiles;
}
