#!/usr/bin/env node
/*
 * Stylesheet audit. Runs in `npm run check` and in CI.
 *
 * Two jobs, both of which exist because eyeballing them does not work:
 *
 * 1. SPECIFICITY. A type selector (button, a, input) outside a :where() wrapper
 *    contributes specificity, which lets a shared reset outrank the component
 *    rules written against it. That failure is silent — no console error, no
 *    build warning, just an invisible navigation tab. So it is a build error here.
 *
 * 2. CONTRAST. WCAG AA verified by arithmetic rather than by eye, across every
 *    theme, including the red-light mode where intuition is worst.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STYLE_DIR = join(ROOT, 'src', 'styles');

const errors = [];
const notes = [];

// ---------------------------------------------------------------------------
// 1. Specificity
// ---------------------------------------------------------------------------

/** Strip :where(...) and its contents — that is the whole point of :where(). */
function stripWhere(selector) {
  let out = selector;
  for (;;) {
    const start = out.indexOf(':where(');
    if (start === -1) return out;
    let depth = 0;
    let i = start + ':where('.length - 1;
    for (; i < out.length; i += 1) {
      if (out[i] === '(') depth += 1;
      else if (out[i] === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    out = out.slice(0, start) + out.slice(i + 1);
  }
}

const TYPE_SELECTOR = /(^|[\s>+~,(])([a-zA-Z][a-zA-Z0-9-]*)(?![\w-]*\s*\()/g;

// Element names we care about. Anything here, unwrapped, is the bug.
const HTML_ELEMENTS = new Set([
  'html', 'body', 'div', 'span', 'p', 'a', 'button', 'input', 'select', 'textarea',
  'label', 'form', 'fieldset', 'legend', 'ul', 'ol', 'li', 'table', 'thead', 'tbody',
  'tr', 'td', 'th', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'footer', 'main',
  'nav', 'section', 'article', 'aside', 'img', 'svg', 'code', 'kbd', 'samp', 'pre',
  'small', 'strong', 'em', 'hr', 'details', 'summary', 'dialog', 'figure', 'figcaption',
]);

/**
 * Split a selector list on commas that are NOT inside parentheses.
 * `:where(h1, h2)` is one selector, not two — splitting naively reports every
 * correctly-wrapped element in a grouped :where() as a violation.
 */
function splitTopLevel(selector) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const char of selector) {
    if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts;
}

function auditSpecificity(file, css) {
  // Strip comments and at-rule preludes, then walk selector blocks.
  const cleaned = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const blocks = cleaned.matchAll(/([^{}]+)\{([^{}]*)\}/g);

  for (const [, rawSelector] of blocks) {
    const selector = rawSelector.trim();
    if (!selector || selector.startsWith('@') || selector.startsWith('%')) continue;

    for (const part of splitTopLevel(selector)) {
      const one = part.trim();
      if (!one || one.startsWith('@')) continue;

      const bare = stripWhere(one);
      TYPE_SELECTOR.lastIndex = 0;
      let match;
      while ((match = TYPE_SELECTOR.exec(bare)) !== null) {
        const name = match[2];
        if (!HTML_ELEMENTS.has(name.toLowerCase())) continue;
        errors.push(
          `${file}: type selector "${name}" outside :where() in \`${one}\`.\n` +
            `    A bare element selector adds specificity, so this rule can outrank the\n` +
            `    component classes written against it. Wrap it: :where(${name}).`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Contrast
// ---------------------------------------------------------------------------

function parseHex(hex) {
  const h = hex.trim().replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}

function relativeLuminance([r, g, b]) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Read one `:root...{}` block's custom properties, resolving var() aliases. */
function readTheme(css, blockSelector) {
  const escaped = blockSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`));
  if (!match) return null;
  const vars = {};
  for (const [, name, value] of match[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    vars[name] = value.trim();
  }
  return vars;
}

function resolve(vars, base, name, seen = new Set()) {
  const raw = vars[name] ?? base[name];
  if (raw === undefined || seen.has(name)) return null;
  const alias = raw.match(/^var\((--[\w-]+)\)$/);
  if (alias) return resolve(vars, base, alias[1], new Set([...seen, name]));
  return parseHex(raw);
}

/*
 * Pairs that actually appear together in the UI. AA is 4.5:1 for body text and
 * 3:1 for large text and interface boundaries.
 */
const PAIRS = [
  ['--fg', '--bg', 4.5, 'body text on page'],
  ['--fg', '--bg-panel', 4.5, 'body text on a panel'],
  ['--fg', '--bg-sunk', 4.5, 'body text on a sunk surface'],
  ['--fg-muted', '--bg', 4.5, 'muted text on page'],
  ['--fg-muted', '--bg-panel', 4.5, 'muted text on a panel'],
  ['--accent-fg', '--accent', 4.5, 'text on an accent button'],
  ['--flag-fg', '--flag', 4.5, 'text on a hi-vis flag'],
  ['--accent', '--bg', 3, 'accent against page'],
  ['--accent', '--bg-panel', 3, 'accent against a panel'],
  ['--ok', '--bg-panel', 3, 'ok state'],
  ['--warn', '--bg-panel', 3, 'warning state'],
  ['--danger', '--bg-panel', 3, 'danger state'],
  ['--line-strong', '--bg', 3, 'strong rules and borders'],
  ['--topbar-fg', '--topbar-bg', 4.5, 'top bar text'],
  ['--topbar-muted', '--topbar-bg', 4.5, 'top bar dates'],
  ['--flag', '--topbar-bg', 3, 'hi-vis edge on the top bar'],
];

const THEMES = [
  [':root', 'day'],
  [":root[data-theme='night']", 'night'],
  [":root[data-theme='redlight']", 'red light'],
];

function auditContrast(css) {
  const base = readTheme(css, ':root');
  if (!base) {
    errors.push('tokens.css: could not find the :root token block.');
    return;
  }
  for (const [selector, label] of THEMES) {
    const vars = readTheme(css, selector);
    if (!vars) {
      errors.push(`tokens.css: theme "${label}" (${selector}) is missing.`);
      continue;
    }
    for (const [fgName, bgName, min, description] of PAIRS) {
      const fg = resolve(vars, base, fgName);
      const bg = resolve(vars, base, bgName);
      if (!fg || !bg) {
        errors.push(`tokens.css [${label}]: cannot resolve ${fgName} on ${bgName}.`);
        continue;
      }
      const ratio = contrast(fg, bg);
      if (ratio < min) {
        errors.push(
          `tokens.css [${label}]: ${description} — ${fgName} on ${bgName} is ${ratio.toFixed(2)}:1, ` +
            `below the ${min}:1 required.`,
        );
      } else {
        notes.push(`  ${label}: ${description} ${ratio.toFixed(2)}:1`);
      }
    }
  }
}

// ---------------------------------------------------------------------------

const files = readdirSync(STYLE_DIR).filter((f) => f.endsWith('.css'));
if (files.length === 0) errors.push('No stylesheets found in src/styles.');

for (const file of files) {
  const css = readFileSync(join(STYLE_DIR, file), 'utf8');
  auditSpecificity(file, css);
  if (file === 'tokens.css') auditContrast(css);
}

if (process.argv.includes('--verbose')) console.log(notes.join('\n'));

if (errors.length) {
  console.error(`\nCSS audit failed — ${errors.length} problem${errors.length === 1 ? '' : 's'}:\n`);
  for (const error of errors) console.error(`  ${error}\n`);
  process.exit(1);
}

console.log(
  `CSS audit passed: ${files.length} stylesheet${files.length === 1 ? '' : 's'}, ` +
    `${PAIRS.length * THEMES.length} contrast pairs, no unwrapped type selectors.`,
);
