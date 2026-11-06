/** Explicit mathematical input grammar. PDF text is untrusted data, NOT TeX to execute. */
export type MathNode =
  | { kind: 'row'; children: MathNode[] }
  | { kind: 'text'; value: string }
  | { kind: 'fraction'; numerator: MathNode; denominator: MathNode }
  | { kind: 'root'; radicand: MathNode }
  | { kind: 'script'; base: MathNode; super?: MathNode; sub?: MathNode };

export type ParseResult =
  | { ok: true; original: string; ast: MathNode }
  | { ok: false; original: string; reason: string; offset: number };

class ParseFailure extends Error {
  constructor(message: string, readonly offset: number) { super(message); }
}

/**
 * Safe, narrow input: basic ASCII maths, \\frac{a}{b}, \\sqrt{x}, a^{b}, a_{b}.
 * No TeX macros beyond the allowlist and no "best guess" character substitutions.
 * Unrecognised formulae MUST be rendered from the immutable original PDF crop.
 */
export function parseMath(original: string): ParseResult {
  const source = original.normalize('NFC');
  if (!source.trim()) return { ok: false, original, reason: 'Empty mathematical selection', offset: 0 };
  if (source.length > 1500) return { ok: false, original, reason: 'Expression too long', offset: 1500 };
  // A standalone ASCII integer quotient has unambiguous numerator/denominator.
  const ratio = /^\s*([+-]?\d+)\s*\/\s*(\d+)\s*$/.exec(source);
  if (ratio) return {ok:true,original,ast:{kind:'fraction',numerator:{kind:'text',value:ratio[1]!},denominator:{kind:'text',value:ratio[2]!}}};
  let i = 0;
  const parseGroup = (): MathNode => {
    if (source[i] !== '{') throw new ParseFailure('Expected {', i);
    i++;
    const node = parseRow(true);
    if (source[i] !== '}') throw new ParseFailure('Unclosed group', i);
    i++;
    return node;
  };
  const parseAtom = (): MathNode => {
    const at = i;
    if (source[i] === '{') return parseGroup();
    if (source[i] === '\\') {
      i++;
      const m = /^[a-zA-Z]+/.exec(source.slice(i));
      if (!m) throw new ParseFailure('Unrecognised command', at);
      i += m[0].length;
      switch (m[0]) {
        case 'frac': return { kind: 'fraction', numerator: parseGroup(), denominator: parseGroup() };
        case 'sqrt': return { kind: 'root', radicand: parseGroup() };
        case 'times': return { kind: 'text', value: '×' };
        case 'div': return { kind: 'text', value: '÷' };
        case 'cdot': return { kind: 'text', value: '·' };
        case 'leq': return { kind: 'text', value: '≤' };
        case 'geq': return { kind: 'text', value: '≥' };
        case 'pi': return { kind: 'text', value: 'π' };
        default: throw new ParseFailure(`Unsupported command \\${m[0]}`, at);
      }
    }
    const char = source[i];
    if (char === undefined) throw new ParseFailure('Expected mathematical symbol', i);
    if (!/[A-Za-z0-9()+\-=.,:|<>×÷·≤≥π% ]/.test(char)) throw new ParseFailure(`Unsupported character ${JSON.stringify(char)}`, i);
    i++;
    return { kind: 'text', value: char };
  };
  const parseRow = (group: boolean): MathNode => {
    const children: MathNode[] = [];
    while (i < source.length && !(group && source[i] === '}')) {
      if (source[i] === '}' && !group) throw new ParseFailure('Unexpected }', i);
      if (source[i] === '^' || source[i] === '_') {
        if (!children.length) throw new ParseFailure('Script requires a base', i);
        const sup = source[i] === '^';
        i++;
        if (source[i] !== '{') throw new ParseFailure('Scripts must use braces: x^{2}', i);
        const script = parseGroup();
        const prev = children.pop()!;
        const node: MathNode = prev.kind === 'script' ? prev : { kind: 'script', base: prev };
        if (sup && node.super) throw new ParseFailure('Duplicate superscript', i);
        if (!sup && node.sub) throw new ParseFailure('Duplicate subscript', i);
        if (sup) node.super = script;
        else node.sub = script;
        children.push(node);
      } else {
        children.push(parseAtom());
      }
    }
    if (group && source[i] !== '}') throw new ParseFailure('Unclosed group', i);
    return { kind: 'row', children };
  };
  try {
    const ast = parseRow(false);
    return { ok: true, original, ast };
  } catch (e) {
    if (e instanceof ParseFailure) return { ok: false, original, reason: e.message, offset: e.offset };
    throw e;
  }
}

/** Returns true only for expressions whose source can be represented without changing maths. */
export function isSupportedMath(text: string): boolean { return parseMath(text).ok; }
