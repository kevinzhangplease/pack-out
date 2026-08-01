import {
  action,
  activity,
  always,
  anyOf,
  driveHours,
  low,
  nights,
  role,
  site,
  style,
  transport,
  when,
  whenAny,
} from '../dsl';
import type { Item } from '../types';

/**
 * Packing is a schedule, not a list. These are the tasks that have to happen at
 * a particular time, and they are ordinary rule-driven items — the timeline view
 * groups by `phase` exactly the way the container view groups by container.
 */
export const ACTION_ITEMS: Item[] = [
  // ---- weeks out ---------------------------------------------------------
  action({
    id: 'act-reserve-site',
    name: 'Reserve the site',
    rule: when(site('reservationBooked', false)),
    phase: 'weeks-out',
  }),
  action({
    id: 'act-book-ferry',
    name: 'Book the ferry',
    rule: when(site('ferryCrossing')),
    phase: 'weeks-out',
    note: 'Reservations for a long weekend go months out.',
  }),
  action({
    id: 'act-fishing-licence',
    name: 'Buy a fishing licence',
    rule: when(activity('fishing')),
    phase: 'weeks-out',
  }),
  action({
    id: 'act-check-jurisdiction',
    name: 'Check the rules for this jurisdiction',
    rule: when(always()),
    phase: 'weeks-out',
    note: 'BC Parks, rec sites, Crown land and First Nations territory differ on fires, dogs and stay limits. Confirm which one you are actually on.',
  }),
  action({
    id: 'act-replace-failures',
    name: 'Replace what failed last trip',
    rule: when(always()),
    phase: 'weeks-out',
    note: 'Reads the post-trip review from the last trip.',
  }),

  // ---- T-3 days ----------------------------------------------------------
  action({
    id: 'act-check-gear-condition',
    name: 'Check gear condition',
    rule: when(always()),
    phase: 't-3-days',
    note: 'Anything marked needs-repair is still on this list. Fix it or change the rule.',
  }),
  action({
    id: 'act-charge-power-banks',
    name: 'Charge power banks and headlamps',
    rule: when(nights('atLeast', 1)),
    phase: 't-3-days',
  }),
  action({
    id: 'act-freeze-meals',
    name: 'Freeze meals flat',
    rule: when(transport('vehicle')),
    phase: 't-3-days',
    note: 'Flat freezes faster, thaws slower and stacks. Frozen chili is also your ice.',
  }),
  action({
    id: 'act-avalanche-forecast',
    name: 'Read the avalanche forecast',
    rule: when(low('atMost', 0), transport('carried')),
    phase: 't-3-days',
    note: 'This app cannot assess avalanche terrain. Check avalanche.ca and make your own call.',
  }),
  action({
    id: 'act-test-tent',
    name: 'Pitch the tent in the yard',
    rule: when(nights('atLeast', 3)),
    phase: 't-3-days',
    note: 'Finding the missing pole at the trailhead is a different kind of evening.',
  }),

  // ---- night before ------------------------------------------------------
  action({
    id: 'act-buy-fuel-ice',
    name: 'Buy fuel and ice',
    rule: when(transport('vehicle')),
    phase: 'night-before',
  }),
  action({
    id: 'act-load-heavy-bins',
    name: 'Load the heavy bins',
    rule: when(transport('vehicle')),
    phase: 'night-before',
    note: 'Heavy low and forward. See the load plan.',
  }),
  action({
    id: 'act-prechop',
    name: 'Pre-chop and portion',
    rule: when(transport('vehicle')),
    phase: 'night-before',
    note: 'Generated from the meal plan once meals exist.',
  }),
  action({
    id: 'act-fit-racks',
    name: 'Fit the racks',
    rule: whenAny(style('paddle'), activity('biking')),
    phase: 'night-before',
  }),

  // ---- morning of --------------------------------------------------------
  action({
    id: 'act-fire-ban-check',
    name: 'Check for a fire ban',
    rule: when(site('picnicTableAndFireRing')),
    phase: 'morning-of',
    note: 'Category 1 bans move fast in July and August.',
  }),
  action({
    id: 'act-trip-plan',
    name: 'Send the trip plan',
    rule: when(always()),
    phase: 'morning-of',
    note: 'Where, when back, what vehicle, bail-out points, nearest hospital, who to call and when.',
  }),
  action({
    id: 'act-tire-pressures',
    name: 'Check tire pressures',
    rule: when(transport('vehicle')),
    phase: 'morning-of',
  }),
  action({
    id: 'act-cooler-topup',
    name: 'Top up the cooler',
    rule: when(transport('vehicle')),
    phase: 'morning-of',
  }),
  action({
    id: 'act-road-conditions',
    name: 'Check forest service road conditions',
    rule: when(style('crown-land')),
    phase: 'morning-of',
    note: 'Active hauling, washouts, deactivated bridges. Call the licensee if you can.',
  }),

  // ---- en route ----------------------------------------------------------
  action({
    id: 'act-buy-firewood',
    name: 'Buy firewood',
    rule: when(site('picnicTableAndFireRing'), site('firewoodSoldOnSite', false)),
    phase: 'en-route',
    note: 'Do not move firewood far. Buy it near where you burn it.',
  }),
  action({
    id: 'act-fill-water',
    name: 'Fill the water jugs',
    rule: when(site('drinkingWater', false), transport('vehicle')),
    phase: 'en-route',
  }),
  action({
    id: 'act-last-groceries',
    name: 'Last groceries',
    rule: when(transport('vehicle')),
    phase: 'en-route',
  }),
  action({
    id: 'act-kid-break',
    name: 'Plan a stop for the kids',
    rule: when(driveHours('atLeast', 3), role('kid', 'toddler')),
    phase: 'en-route',
    note: 'One real stop beats three roadside ones.',
  }),

  // ---- last thing out the door ------------------------------------------
  action({
    id: 'act-comfort-objects',
    name: 'Collect the comfort objects',
    rule: when(role('kid', 'toddler')),
    phase: 'last-out-door',
    note: 'They are in the beds. This is the last sweep, and it is the one that ends trips.',
  }),
  action({
    id: 'act-final-sweep',
    name: 'Final sweep: phones, wallets, keys, meds',
    rule: when(always()),
    phase: 'last-out-door',
  }),

  // ---- at camp -----------------------------------------------------------
  action({
    id: 'act-setup-tarp',
    name: 'Tarp up first',
    rule: whenAny(transport('vehicle'), anyOf(site('picnicTableAndFireRing'))),
    phase: 'at-camp',
    note: 'Before the tents. If it starts raining you want a dry place to work.',
  }),
  action({
    id: 'act-setup-shelters',
    name: 'Pitch the shelters',
    rule: when(always()),
    phase: 'at-camp',
  }),
  action({
    id: 'act-bear-storage',
    name: 'Set up bear storage',
    rule: when(site('bearCountry')),
    phase: 'at-camp',
    note: 'Everything scented, not just food: toothpaste, sunscreen, bug spray, the garbage bag.',
  }),
  action({
    id: 'act-kid-boundaries',
    name: 'Walk the site boundaries with the kids',
    rule: when(role('kid', 'toddler')),
    phase: 'at-camp',
    note: 'Where the water is, where the road is, where the toilet is, what to do if lost.',
  }),

  // ---- pack-down ---------------------------------------------------------
  action({
    id: 'act-dry-tent',
    name: 'Dry the tent at home',
    rule: when(always()),
    phase: 'pack-down',
    note: 'Within two days. A tent packed wet is a tent you replace.',
  }),
  action({
    id: 'act-restock',
    name: 'Restock consumables',
    rule: when(always()),
    phase: 'pack-down',
  }),
  action({
    id: 'act-post-trip-review',
    name: 'Log what went unused, what was missing, what broke',
    rule: when(always()),
    phase: 'pack-down',
    note: 'This is the only part of the app that compounds. The review proposes rule edits.',
  }),
  action({
    id: 'act-return-borrowed',
    name: 'Return borrowed gear',
    rule: when(always()),
    phase: 'pack-down',
  }),
];
