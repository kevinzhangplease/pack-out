import type { Library, Trip } from '../data/types';
import { PHASE_LABELS } from '../data/types';
import { groupLines, type BuildResult, type GroupBy } from './build';
import { ruleToEnglish, namesFrom } from './english';
import type { Gate } from './gates';

/** Plain text for the fridge or a group chat. No markup, no app required. */
export function listToText(
  trip: Trip,
  library: Library,
  result: BuildResult,
  by: GroupBy,
  gates: Gate[] = [],
): string {
  const out: string[] = [];
  const rule = '='.repeat(52);

  out.push(trip.name.toUpperCase());
  out.push(rule);
  out.push(`${trip.startDate} to ${trip.endDate}  (${result.facts.nights} nights)`);
  if (trip.location) out.push(`Location: ${trip.location}`);
  out.push(`Style: ${trip.style}   Going: ${result.facts.attendees.map((p) => p.name).join(', ') || 'nobody'}`);
  out.push(
    `Weather: ${trip.weather.precip}, ${trip.weather.overnightLow}-${trip.weather.daytimeHigh} C, wind ${trip.weather.windKph} km/h`,
  );
  out.push('');

  for (const gate of gates) {
    out.push(`[${gate.severity === 'blocking' ? '!!' : '!'}] ${gate.title}`);
    if (gate.disclaimer) out.push(`     ${gate.disclaimer}`);
    out.push(`     ${gate.detail}`);
    if (gate.reference) out.push(`     See: ${gate.reference}`);
    out.push('');
  }

  for (const group of groupLines(result.lines, by, library)) {
    out.push(`-- ${group.label.toUpperCase()} ${'-'.repeat(Math.max(0, 46 - group.label.length))}`);
    for (const line of group.lines) {
      const qty = line.qty > 1 ? ` x${line.qty}` : '';
      const who = line.person && by !== 'person' ? ` (${line.person.name})` : '';
      const kind = line.item.kind === 'vehicle-resident' ? ' [lives in the vehicle]' : '';
      out.push(`[ ] ${line.item.name}${qty}${who}${kind}`);
    }
    out.push('');
  }

  out.push(rule);
  out.push(`${result.lines.length} lines, ${(result.totalWeight_g / 1000).toFixed(1)} kg total`);
  return out.join('\n');
}

/**
 * A human-readable export of the rule library itself. This is the document that
 * outlives the app — it should be legible with nothing but a text editor.
 */
export function libraryToText(library: Library): string {
  const names = namesFrom(library);
  const out: string[] = [];
  out.push('PACK OUT — RULE LIBRARY');
  out.push('='.repeat(52));
  out.push(`${library.items.length} items, schema version ${library.schemaVersion}`);
  out.push('');

  const byCategory = new Map<string, typeof library.items>();
  for (const item of library.items) {
    const bucket = byCategory.get(item.category);
    if (bucket) bucket.push(item);
    else byCategory.set(item.category, [item]);
  }

  for (const [category, items] of [...byCategory].sort((a, b) => a[0].localeCompare(b[0]))) {
    out.push(`-- ${category.toUpperCase()} ${'-'.repeat(Math.max(0, 46 - category.length))}`);
    for (const item of items) {
      out.push(`${item.name}${item.orphaned ? '  [ORPHANED]' : ''}`);
      out.push(`    ${ruleToEnglish(item.rule, names)}`);
      out.push(
        `    Quantity: ${item.qty.base}${item.qty.rate ? ` + ${item.qty.rate} ${item.qty.unit}` : ''}` +
          `${item.qty.cap !== undefined ? ` (max ${item.qty.cap})` : ''}` +
          `${item.qty.perPerson ? ', per person' : ''}`,
      );
      out.push(
        `    ${item.category} / ${item.container} / ${PHASE_LABELS[item.phase]} / ${item.kind}` +
          `${item.scented ? ' / scented' : ''}`,
      );
      if (item.note) out.push(`    Note: ${item.note}`);
      out.push('');
    }
  }
  return out.join('\n');
}
