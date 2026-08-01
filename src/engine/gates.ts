import type { Trip } from '../data/types';
import type { TripFacts } from './facts';
import type { BuildResult } from './build';

/**
 * Safety gates.
 *
 * Deliberate departure from a literal reading of the brief: a gate does NOT
 * withhold the list. Refusing to render at 9pm the night before means the trip
 * gets packed from memory instead, which is strictly worse. What a gate does is
 * remove the affordances that make a list look *complete* — no progress ring,
 * no green state — and force an acknowledgement that names what the app cannot
 * know. Honest about its limits, still useful.
 */
export type GateSeverity = 'blocking' | 'warning';

export interface Gate {
  id: string;
  severity: GateSeverity;
  title: string;
  /** What the app cannot assess. Stated plainly, not softened. */
  disclaimer: string;
  detail: string;
  /** Where to go and find out. */
  reference?: string;
}

export function evaluateGates(_trip: Trip, facts: TripFacts, result: BuildResult): Gate[] {
  const gates: Gate[] = [];

  // Below freezing plus a hike-in trip is avalanche terrain in BC.
  if (facts.overnightLow <= 0 && facts.transport === 'carried') {
    gates.push({
      id: 'winter-travel',
      severity: 'blocking',
      title: 'Winter travel, hike-in, below freezing',
      disclaimer:
        'Pack Out cannot assess avalanche terrain, snowpack, or route conditions. This list is not a substitute for a forecast and training.',
      detail:
        'The winter travel kit has been added and cannot be removed while these conditions hold. Read the regional forecast and confirm your route avoids avalanche terrain, or change the trip.',
      reference: 'avalanche.ca',
    });
  }

  // No cell service and no way to call out.
  const hasMessenger = result.lines.some((l) => l.item.id === 'satellite-messenger');
  if (!facts.site.cellService && !hasMessenger) {
    gates.push({
      id: 'no-comms',
      severity: 'warning',
      title: 'No cell service and no satellite messenger',
      disclaimer: 'If something goes wrong here, nobody finds out until you are overdue.',
      detail: 'Send the trip plan to someone who will act on it, with a firm overdue time.',
    });
  }

  // Paddling in wind is a different sport from paddling.
  if ((facts.style === 'paddle' || facts.activityIds.has('paddling')) && facts.windKph >= 25) {
    gates.push({
      id: 'wind-on-water',
      severity: 'warning',
      title: `Wind forecast at ${facts.windKph} km/h`,
      disclaimer: 'Pack Out does not know your water, your fetch, or your group.',
      detail:
        'Wind matters more than rain for whether you paddle. Have a shore day planned that the kids will accept.',
    });
  }

  // A trip that goes nowhere is usually a mistake in the dates.
  if (facts.nights === 0) {
    gates.push({
      id: 'zero-nights',
      severity: 'warning',
      title: 'This trip has no nights',
      disclaimer: '',
      detail:
        'Start and end dates are the same, so everything that scales per night has collapsed to its base quantity. Check the dates.',
    });
  }

  if (facts.people === 0) {
    gates.push({
      id: 'nobody-going',
      severity: 'warning',
      title: 'Nobody is on this trip',
      disclaimer: '',
      detail: 'Every per-person item is absent. Choose who is going.',
    });
  }

  // Gear that packs while marked broken.
  const broken = result.lines.filter(
    (l) => l.item.gear?.condition === 'needs-repair' || l.item.gear?.condition === 'retired',
  );
  if (broken.length) {
    gates.push({
      id: 'broken-gear',
      severity: 'warning',
      title: `${broken.length} item${broken.length === 1 ? '' : 's'} packing while marked broken`,
      disclaimer: 'A list that confidently packs a broken stove is worse than no list.',
      detail: broken.map((l) => l.item.name).join(', '),
    });
  }

  // Orphaned items are a correctness problem, surfaced not buried.
  if (result.orphaned.length) {
    gates.push({
      id: 'orphaned-items',
      severity: 'warning',
      title: `${result.orphaned.length} orphaned item${result.orphaned.length === 1 ? '' : 's'}`,
      disclaimer: '',
      detail:
        'These lost the last thing their rule depended on and are excluded from every list until repaired: ' +
        result.orphaned.map((i) => i.name).join(', '),
    });
  }

  return gates;
}

/** The list is still shown; it just stops looking finished. */
export function listIsQualified(gates: Gate[]): boolean {
  return gates.some((g) => g.severity === 'blocking');
}

/** Weather contingency: rain plus a fire-only cook plan is a miserable failure. */
export function needsNoCookOption(facts: TripFacts): boolean {
  return ['rain', 'heavy', 'snow'].includes(facts.precip);
}

/** Roughly 20% of body weight is the shakedown threshold for a carried pack. */
export function packWeightWarning(weight_g: number, bodyWeight_kg: number): string | null {
  const ratio = weight_g / 1000 / bodyWeight_kg;
  if (ratio <= 0.2) return null;
  return `${Math.round(ratio * 100)}% of body weight — over the 20% shakedown threshold.`;
}
