import type { BuildResult, ListLine } from './build';

/**
 * "+4 items, -2". Shown whenever trip inputs change, so the model becomes
 * legible instead of something you just trust.
 */
export interface ListDiff {
  added: ListLine[];
  removed: ListLine[];
  changed: { before: ListLine; after: ListLine }[];
  summary: string;
}

export function diffLists(before: BuildResult, after: BuildResult): ListDiff {
  const beforeByKey = new Map(before.lines.map((l) => [l.key, l]));
  const afterByKey = new Map(after.lines.map((l) => [l.key, l]));

  const added = after.lines.filter((l) => !beforeByKey.has(l.key));
  const removed = before.lines.filter((l) => !afterByKey.has(l.key));
  const changed: ListDiff['changed'] = [];

  for (const [key, afterLine] of afterByKey) {
    const beforeLine = beforeByKey.get(key);
    if (beforeLine && beforeLine.qty !== afterLine.qty) {
      changed.push({ before: beforeLine, after: afterLine });
    }
  }

  const parts: string[] = [];
  if (added.length) parts.push(`+${added.length}`);
  if (removed.length) parts.push(`-${removed.length}`);
  if (changed.length) parts.push(`${changed.length} changed`);

  return {
    added,
    removed,
    changed,
    summary: parts.length ? parts.join(', ') : 'no change',
  };
}
