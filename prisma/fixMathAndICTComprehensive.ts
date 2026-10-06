import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { prisma } from "../src/app/lib/prisma";
import { Subject, Option, Difficulty } from "../src/generated/prisma/enums";

function escapeCsv(val: any): string {
  const s = String(val ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// Prefixes stripped in scraping
const STRIPPED_PREFIXES = ["ক", "খ", "গ", "ঘ", "A", "B", "C", "D", "a", "b", "c", "d"];

export function recoverOptionWord(rawQt: string, opt: string): string {
  if (!opt || opt.trim().length === 0) return opt;
  const trimmed = opt.trim();

  for (const p of STRIPPED_PREFIXES) {
    const candidate = p + trimmed;
    if (rawQt.includes(candidate)) {
      return candidate;
    }
    const candidateWithSpace = p + " " + trimmed;
    if (rawQt.includes(candidateWithSpace)) {
      return candidateWithSpace;
    }
  }

  const MANUAL_OPT_MAP: Record<string, string> = {
    "dverb": "adverb",
    "djective": "adjective",
    "on't drive so fast!": "Don't drive so fast!",
    "ritish Council": "British Council",
    "anada": "Canada",
    "খনও নয়": "কখনও নয়",
    "লকাতা": "কলকাতা",
    "াজীপুর": "গাজীপুর",
    "োড়া": "ঘোড়া",
    "োবিন্দদাস": "গোবিন্দদাস",
    "ুদামজাত": "গুদামজাত",
    "ৌড় অঞ্চলের মুখের ভাষা": "গৌড় অঞ্চলের মুখের ভাষা",
    "ৌড় সাহিত্যের স্বাভাবিক রীতি": "গৌড় সাহিত্যের স্বাভাবিক রীতি",
    "ৌড় ভাষার লিখিত নমুনা": "গৌড় ভাষার লিখিত নমুনা",
    "ৌড় ভাষার বিকৃত উচ্চারণ": "গৌড় ভাষার বিকৃত উচ্চারণ",
    "ল্যাণ মিত্র": "কল্যাণ মিত্র",
    "ৃষ্ণচন্দ্র মজুমদার": "কৃষ্ণচন্দ্র মজুমদার",
    "ার্বন ডাইঅক্সাইড": "কার্বন ডাইঅক্সাইড",
    "সভাবে ব্যবসা-বাণিজ্য করা": "সৎভাবে ব্যবসা-বাণিজ্য করা",
    "োনোটিই নয়": "কোনোটিই নয়",
    "োয়ান্টাম কম্পিউটিং": "কোয়ান্টাম কম্পিউটিং",
    "্লাউডে ডেটা সংরক্ষণের জন্য": "ক্লাউডে ডেটা সংরক্ষণের জন্য",
    "lgorithm A, Algorithm B এর চেয়ে ধীর গতির": "Algorithm A, Algorithm B এর চেয়ে ধীর গতির",
    "lgorithm A, Algorithm B এর চেয়ে দ্রুত গতির": "Algorithm A, Algorithm B এর চেয়ে দ্রুত গতির",
    "lgorithm A, Algorithm B এর চেয়ে asymptotically ধীর গতির": "Algorithm A, Algorithm B এর চেয়ে asymptotically ধীর গতির",
    "lgorithm B সর্বদা Algorithm A এর চেয়ে দ্রুত চলে": "Algorithm B সর্বদা Algorithm A এর চেয়ে দ্রুত চলে",
    "lexei Kitaev": "Alexei Kitaev",
    "avid Deutsch": "David Deutsch",
    "2bc a^{2} b c a2bc": "$a^2bc$",
    "2a2bc 2 \\mathrm{a}^{2} \\mathrm{bc} 2a2bc": "$2a^2bc$",
    "2a2b2c2 2 a^{2} b^{2} c^{2} 2a2b2c2": "$2a^2b^2c^2$",
    "+b+c": "$a+b+c$",
    "+b−ca−b+c": "$\\frac{a + b - c}{a - b + c}$",
    "−b+ca+b−c": "$\\frac{a - b + c}{a + b - c}$",
    "+b−ca+b+c": "$\\frac{a + b - c}{a + b + c}$",
  };

  if (MANUAL_OPT_MAP[trimmed]) {
    return MANUAL_OPT_MAP[trimmed];
  }

  return trimmed;
}

export function cleanStemPunctuation(stem: string): string {
  let s = stem.trim();
  s = s.replace(/(?:[\s\-:–—−ঃ]+)(?:\([ক-ঘa-dA-D]\)|[ক-ঘa-dA-D][\.\)]?)$/, "");
  s = s.trim();

  // If question ends with interrogative words without ?, add ?
  if (
    s.endsWith("কোনটি") ||
    s.endsWith("কার") ||
    s.endsWith("কী") ||
    s.endsWith("কোথায়") ||
    s.endsWith("কত") ||
    s.endsWith("কে")
  ) {
    s = s + "?";
  }

  return s;
}

export function findOptionCutIndex(qt: string, optA: string, optB: string, optC: string): number {
  if (!qt) return -1;
  const clean = (s: string) => s.replace(/[\s\u200b\u200c\ufeff]/g, "").toLowerCase();
  const cQt = clean(qt);
  const cA = clean(optA);
  const cB = clean(optB);
  const cC = clean(optC);

  const lastQMark = qt.lastIndexOf("?");
  const lastDdari = qt.lastIndexOf("।");
  const lastHyphen = qt.lastIndexOf("-");
  const minSearchPos = Math.max(lastQMark, lastDdari, lastHyphen);

  let targetNormIndex = -1;

  if (cA.length >= 1 && cB.length >= 1) {
    let searchPos = 0;
    while (true) {
      const idxA = cQt.indexOf(cA, searchPos);
      if (idxA === -1) break;
      if (idxA >= 5) {
        let allowed = true;
        if (cA.length === 1 && minSearchPos > 0) {
          let normCount = 0;
          let origPos = 0;
          for (let i = 0; i < qt.length; i++) {
            if (!/[\s\u200b\u200c\ufeff]/.test(qt[i])) {
              if (normCount === idxA) { origPos = i; break; }
              normCount++;
            }
          }
          if (origPos < minSearchPos) {
            allowed = false;
          }
        }

        if (allowed) {
          const after = cQt.slice(idxA + cA.length, idxA + cA.length + cB.length + 80);
          if (after.includes(cB) || (cC.length >= 1 && after.includes(cC))) {
            targetNormIndex = idxA;
            break;
          }
        }
      }
      searchPos = idxA + 1;
    }
  }

  if (targetNormIndex === -1 && cB.length >= 1 && cC.length >= 1) {
    let searchPos = 0;
    while (true) {
      const idxB = cQt.indexOf(cB, searchPos);
      if (idxB === -1) break;
      if (idxB >= 5) {
        let allowed = true;
        if (cB.length === 1 && minSearchPos > 0) {
          let normCount = 0;
          let origPos = 0;
          for (let i = 0; i < qt.length; i++) {
            if (!/[\s\u200b\u200c\ufeff]/.test(qt[i])) {
              if (normCount === idxB) { origPos = i; break; }
              normCount++;
            }
          }
          if (origPos < minSearchPos) allowed = false;
        }
        if (allowed) {
          const after = cQt.slice(idxB + cB.length, idxB + cB.length + cC.length + 80);
          if (after.includes(cC)) {
            targetNormIndex = idxB;
            break;
          }
        }
      }
      searchPos = idxB + 1;
    }
  }

  if (targetNormIndex === -1) return -1;

  let normCount = 0;
  for (let i = 0; i < qt.length; i++) {
    if (!/[\s\u200b\u200c\ufeff]/.test(qt[i])) {
      if (normCount === targetNormIndex) return i;
      normCount++;
    }
  }
  return -1;
}

function replaceBraced(str: string, prefix: string, replacer: (inner: string) => string): string {
  let s = str;
  while (true) {
    const idx = s.indexOf(prefix);
    if (idx === -1) break;
    const start = idx + prefix.length;
    if (start >= s.length || s[start] !== "{") break;
    let depth = 1;
    let end = -1;
    for (let i = start + 1; i < s.length; i++) {
      if (s[i] === "{") depth++;
      else if (s[i] === "}") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === -1) break;
    const inner = s.substring(start + 1, end);
    const replacement = replacer(inner);

    let replaceStart = idx;
    let replaceEnd = end + 1;

    // Only trim digit or latin tokens without trimming Bengali words
    const before = s.substring(Math.max(0, idx - 40), idx);
    const matchBefore = before.match(/([০-৯\d]+)$/);
    if (matchBefore && matchBefore[1].length >= 1) {
      replaceStart = idx - matchBefore[1].length;
    }

    const after = s.substring(end + 1, Math.min(s.length, end + 45));
    const matchAfter = after.match(/^([০-৯\d]+)/);
    if (matchAfter && matchAfter[1].length >= 1) {
      replaceEnd = end + 1 + matchAfter[1].length;
    }

    s = s.substring(0, replaceStart) + replacement + s.substring(replaceEnd);
  }
  return s;
}

export function cleanMathAndICTText(text: string): string {
  if (!text) return "";
  let s = text.replace(/[\u200b\u200c\ufeff]/g, "").trim();

  // 1. Arrows
  s = s.replace(/→\s*\\rightarrow\s*→/g, "→");
  s = s.replace(/\\rightarrow/g, "→");

  // 2. Degree triplications:
  s = s.replace(/([০-৯\d]+)[০∘]\s*([০-৯\d\s]+)\^?\{?\\circ\}?\s*\1[০∘]?/g, (_, d1, d2) => `$${d2.replace(/\s+/g, "")}^\\circ$`);
  s = s.replace(/([০-৯\d]+)\s*\\circ\s*([০-৯\d]+)/g, (_, d1) => `$${d1}^\\circ$`);
  s = s.replace(/([০-৯\d]+)[০∘]২\s*৮\^?\{?\\circ\}?[০-৯\d]+[০∘]/g, "$২৮^\\circ$");
  s = s.replace(/([০-৯\d]+)[০∘]৬\s*২\^?\{?\\circ\}?[০-৯\d]+[০∘]/g, "$৬২^\\circ$");

  // 3. Binary & Number bases:
  s = s.replace(/([01]{4,})2?\s*([01]{4,})_\{?2\}?\s*([01]{4,})2?/g, (_, b1) => `$(${b1})_2$`);
  s = s.replace(/\(([01]+)\)2\s*\{?\(\1\)\}?_\{?2\}?\s*\(\1\)2/g, (_, b1) => `$(${b1})_2$`);
  s = s.replace(/([01]+)\(2\)\s*\1_\{?\(?2\)?\}\s*\1\(2\)/g, (_, b1) => `$(${b1})_2$`);
  s = s.replace(/\(\(([01\s]+)\)\)2[^\$]*/g, (_, b1) => `$(${b1.replace(/\s+/g, "")})_2$`);
  // Hexadecimal:
  s = s.replace(/([০-৯\d]+)\(১৬\)\s*\1_\{?\(?১৬\)?\}\s*\1\(১৬\)/g, (_, h1) => `$(${h1})_{16}$`);
  s = s.replace(/([০-৯\d]+)\(16\)\s*\1_\{?\(?16\)?\}\s*\1\(16\)/g, (_, h1) => `$(${h1})_{16}$`);
  s = s.replace(/\(2FA\)16[^\(]*\(2FA\)16/g, "$(2FA)_{16}$");
  // Octal:
  s = s.replace(/\(([০-৯\d]+)\)৮/g, (_, o1) => `$(${o1})_8$`);
  s = s.replace(/\(([০-৯\d]+)\)8\s*\*\1_8\s*\1/g,(_, o1) => `$(${o1})_8$`);

  // 4. Algorithm O notation:
  s = s.replace(/O\(n2\)\s*O\(n\^2\)\s*O\(n2\)/g, "$O(n^2)$");
  s = s.replace(/O\(n\)\s*O\(n\)\s*O\(n\)/g, "$O(n)$");

  // 5. Permutation & Combination:
  s = s.replace(/nC8\s*=\s*nC12\s*\^nC_8\s*=\s*\^nC_\{12\}\s*nC8[​\s]*=nC12/g, "$^nC_8 = ^nC_{12}$");
  s = s.replace(/22Cn\s*\^\{22\}C_n\s*22Cn/g, "$^{22}C_n$");
  s = s.replace(/\^\{22\}C_n/g, "$^{22}C_n$");

  // 6. Pi:
  s = s.replace(/22π\s*2\\sqrt\{2\}\\pi\s*22​?π/g, "$2\\sqrt{2}\\pi$");
  s = s.replace(/2π\s*\\sqrt\{2\}\s*\\pi\s*2​?π/g, "$2\\sqrt{2}\\pi$");
  s = s.replace(/^π\s*\\pi\s*π$/g, "$\\pi$");
  s = s.replace(/^2π\s*2\\pi\s*2π$/g, "$2\\pi$");
  s = s.replace(/^4π\s*4\\pi\s*4π$/g, "$4\\pi$");
  s = s.replace(/^π\s*π\s*π$/g, "$\\pi$");
  s = s.replace(/^2π\s*2π\s*2π$/g, "$2\\pi$");
  s = s.replace(/^2π\s*√\(2\)π\s*2π$/g, "$2\\sqrt{2}\\pi$");
  s = s.replace(/^2√\(2\)π$/g, "$2\\sqrt{2}\\pi$");
  s = s.replace(/([০-৯\d]+)\s*π\s*\\pi\s*π/g, (_, n) => `$${n}\\pi$`);
  s = s.replace(/([০-৯\d]+)\s*π\s*\\pi/g, (_, n) => `$${n}\\pi$`);
  s = s.replace(/\$([^\$]+)\$\s*(বর্গ\s*সে\.?মি\.?)/g, (_, m, u) => `$${m}\\text{ ${u}}$`);

  // 7. Fractions:
  s = s.replace(/[০-৯\d]+\s*\\frac\{([^{}]+)\}\{([^{}]+)\}\s*[০-৯\d]*/g, (_, n, d) => {
    return `$\\frac{${n.replace(/\s+/g, "")}}{${d.replace(/\s+/g, "")}}$`;
  });
  s = s.replace(/^\\frac\{([^{}]+)\}\{([^{}]+)\}$/g, (_, n, d) => `$\\frac{${n.trim()}}{${d.trim()}}$`);
  s = s.replace(/[০-৯\d]*\s*([০-৯\d]+)\s*\\over\s*([০-৯\d]+)\s*[০-৯\d]*/g, (_, n, d) => `$\\frac{${n}}{${d}}$`);
  s = s.replace(/[০-৯\d]*\s*\\mathrm\{([০-৯\d]+)\s*\\over\s*([০-৯\d]+)\}[০-৯\d]*/g, (_, n, d) => `$\\frac{${n}}{${d}}$`);
  s = s.replace(/[০-৯\d]*\s*\\mathrm\{([০-৯\d]+)\s*\{([০-৯\d]+)\\over\s*([০-৯\d]+)\}\}[০-৯\d]*/g, (_, w, n, d) => `$${w}\\frac{${n}}{${d}}$`);
  s = s.replace(/[০-৯\d]+%?\\mathrm\{([০-৯\d]+)\s*\{([০-৯\d]+)\s*\\over\s*([০-৯\d]+)\}\\%?\}[০-৯\d]+%?/g, (_, w, n, d) => `$${w}\\frac{${n}}{${d}}\\%$`);

  // Algebraic fractions:
  const fracMatch = s.match(/\\frac\{([^{}]+)\}\{([^{}]+)\}/);
  if (fracMatch && (s.includes("+") || s.includes("−") || s.includes("-"))) {
    if (s.length > fracMatch[0].length + 4) {
      s = `$\\frac{${fracMatch[1].trim()}}{${fracMatch[2].trim()}}$`;
    }
  }

  // 8. Radicals:
  s = s.replace(/[০-৯\d]*\s*([০-৯\d]*\s*\\sqrt\{[^{}]+\})\s*[০-৯\d]*/g, (_, r) => `$${r.trim()}$`);
  s = s.replace(/[০-৯\d]*\s*([০-৯\d]*\s*\\sqrt\s*[০-৯\d]+)\s*[০-৯\d]*/g, (_, r) => {
    const cleanR = r.replace(/\\sqrt\s*/, "\\sqrt{") + "}";
    return `$${cleanR.trim()}$`;
  });
  s = s.replace(/([০-৯\d]+)\s*\\sqrt\s*([০-৯\d]+)[০-৯\d]*\s*বর্গ\s*সে\.মি\./g, (_, n, r) => `$${n}\\sqrt{${r}}\\text{ বর্গ সে.মি.}$`);

  // 9. De Morgan / Boolean:
  s = s.replace(/\(\\overline\s*\{\\mathrm\s*\{([^{}]+)\}\}\)\s*=\s*\\mathrm\s*\{([^{}]+)\}[^\$]*/g, (_, l, r) => `$\\overline{${l.trim()}} = ${r.trim()}$`);
  s = s.replace(/^\+?A‾\\overline\{A\}A\+1$/g, "$A + \\overline{A} = 1$");
  s = s.replace(/^\.?A\.A=1$/g, "$A \\cdot A = 1$");
  s = s.replace(/^\+?A\+A=2A$/g, "$A + A = 2A$");

  // 10. Specific triplications:
  s = s.replace(/x\s*=\s*5\s*\+\s*3\s*x\s*=\s*\\sqrt\{5\}\s*\+\s*\\sqrt\{3\}\s*x\s*=\s*5[​\s]*\+3[​\s]*/g, "$x = \\sqrt{5} + \\sqrt{3}$");
  s = s.replace(/x3\s*\+\s*8x3\s*x\^3\s*\+\s*\\frac\{8\}\{x\^3\}\s*x3\s*\+\s*x38/g, "$x^3 + \\frac{8}{x^3}$");
  s = s.replace(/12×2x[−\-]3\+1=5\s*\\frac\{1\}\{2\}\s*\\times\s*2\^\{x\s*-\s*3\}\s*\+\s*1\s*=\s*5\s*21[​\s]*×2x[−\-]3\+1=5/g, "$\\frac{1}{2} \\times 2^{x - 3} + 1 = 5$");
  s = s.replace(/log[⁡x]*324\s*=\s*4\s*\\log_x\s*324\s*=\s*4\s*logx[⁡\s]*=?[0-9]*/g, "$\\log_x 324 = 4$");
  s = s.replace(/xxxএর/g, "$x$ এর");
  s = s.replace(/kkkএর/g, "$k$ এর");
  s = s.replace(/5x3−2x2\+x\+k=0\s*5x\^3\s*-\s*2x\^2\s*\+\s*x\s*\+\s*k\s*=\s*0\s*5x3−2x2\+x\+k=0/g, "$5x^3 - 2x^2 + x + k = 0$");
  s = s.replace(/\(x−3\)\(x\s*-\s*3\)\(x−3\)/g, "$(x - 3)");
  s = s.replace(/\|x[−\-]5x\s*-\s*5x[−\-]5\|\s*<\s*2\s*,\s*x∈IN\s*x\s*\\in\s*IN\s*x∈IN/g, "$|x - 5| < 2, x \\in \\mathbb{N}$");
  s = s.replace(/A=\{x∈IN:2<x≤6\}\s*A\s*=\s*\\\{x\s*\\in\s*IN\s*:\s*2\s*<\s*x\s*\\le\s*6\\\}\s*A=\{x∈IN:2<x≤6\}/g, "$A = \\{x \\in \\mathbb{N} : 2 < x \\le 6\\}$");
  s = s.replace(/B=\{x∈IN:xB\s*=\s*\\\{x\s*\\in\s*IN\s*:\s*xB=\{x∈IN:xজোর\s*সংখ্যাx≤8\}\s*x\s*\\le\s*8\\\}\s*x≤8\}/g, "$B = \\{x \\in \\mathbb{N} : x \\text{ জোড় সংখ্যা}, x \\le 8\\}$");
  s = s.replace(/A∩B\s*A\s*\\cap\s*B\s*A∩B/g, "$A \\cap B$");
  s = s.replace(/y=xy\s*=\s*xy=x/g, "$y = x$");
  s = s.replace(/y=3xy\s*=\s*3xy=3x/g, "$y = 3x$");
  s = s.replace(/y=x\+3y\s*=\s*x\s*\+\s*3y=x\+3/g, "$y = x + 3$");
  s = s.replace(/y=3x\+3y\s*=\s*3x\s*\+\s*3y=3x\+3/g, "$y = 3x + 3$");

  // 11. Quadratic inequality triplication
  s = s.replace(/x2[−\-]7x\+12≤0\s*x\^\{2\}\s*-\s*7\s*x\s*\+\s*12\s*\\leq\s*0\s*x2[−\-]7x\+12≤0/g, "$x^2 - 7x + 12 \\le 0$");

  // 12. Interval triplications:
  s = s.replace(/\([^\)]+\)\s*\\left\(\\right\.\s*-\s*\\infty\s*,\s*([0-9\+\-]+)\s*\\left\.\s*\\right\)\s*\([^\)]+\)/g, (_, val) => `$(-\\infty, ${val.trim()})$`);
  s = s.replace(/\[[^\],]+,\s*∞\)\s*\\left\[\\right\.\s*([0-9\+\-]+)\s*,\s*\\infty\s*\\left\.\s*\\right\)\s*\[[^\],]+,\s*∞\)/g, (_, val) => `$[${val.trim()}, \\infty)$`);
  s = s.replace(/\[[0-9\s,]+\]\s*\\left\[\s*([0-9]+)\s*,\s*([0-9]+)\s*\\right\]\s*\[[0-9\s,]+\]/g, (_, a, b) => `$[${a.trim()}, ${b.trim()}]$`);

  // 13. Deep balanced \mathrm conversion:
  s = replaceBraced(s, "\\mathrm", (inner) => {
    let clean = inner.trim();
    clean = clean.replace(/\{\{([^{}]+)\}\\over\{([^{}]+)\}\}/g, "\\frac{$1}{$2}");
    clean = clean.replace(/\{([^{}]+)\\over([^{}]+)\}/g, "\\frac{$1}{$2}");
    clean = clean.replace(/\\over/g, "/");
    clean = clean.replace(/\$/g, "");
    return `$${clean}$`;
  });

  // 14. Sets & intervals:
  s = s.replace(/A=\{x∈N:x2−5x−14=0\}A=\\left\\\{x\\in N:x\^2-5x-14=0\\right\\\}A=\{x∈N:x2−5x−14=0\}/g, "$A = \\{x \\in \\mathbb{N} : x^2 - 5x - 14 = 0\\}$");
  s = s.replace(/\{([^{}]+)\}\s*\\left\\\{\s*([^{}]+)\s*\\right\\\}\s*\{\1\}/g, (_, p, f) => `$\\{${f.trim()}\\}$`);
  s = s.replace(/\\left\\\{\s*([^{}]+)\s*\\right\\\}/g, (_, inSet) => `$\\{${inSet.trim()}\\}$`);
  s = s.replace(/\\left\[\s*([^\[\]]+)\s*\\right\]/g, (_, inInt) => `$[${inInt.trim()}]$`);
  s = s.replace(/\\left\(\s*([^()]+)\s*\\right\)/g, (_, inP) => `$(${inP.trim()})$`);
  s = s.replace(/\\left\(\\right\.\s*([^,]+)\s*,\s*([^,\s\\]+)\s*\\left\.\s*\\right\)/g, (_, a, b) => `$(${a.trim()}, ${b.trim()})$`);
  s = s.replace(/\\left\[\\right\.\s*([^,]+)\s*,\s*([^,\s\\]+)\s*\\left\.\s*\\right\)/g, (_, a, b) => `$[$1, $2]$`);
  s = s.replace(/\\left\./g, "").replace(/\\right\./g, "").replace(/\\left/g, "").replace(/\\right/g, "");

  // Variables like x\mathrm{x}x
  s = s.replace(/([a-zA-Z])\s*\\mathrm\s*\{?\1\}?\s*\1/g, (_, v) => `$${v}$`);

  // Fix redundant $$
  s = s.replace(/\$\$+/g, "$");

  return s.trim();
}

// Explicit verified overrides
interface QuestionOverride {
  subject?: Subject;
  stem?: string;
  optionA?: string;
  optionB?: string;
  optionC?: string;
  optionD?: string;
  correctOption?: Option;
  explanation?: string;
}

const VERIFIED_OVERRIDES: Record<string, QuestionOverride> = {
  // 47th BCS Q11 (Math)
  "c45ffce5-7823-4982-81eb-a663e1711bcc": {
    subject: Subject.MATH,
    stem: "যদি $x = \\sqrt{5} + \\sqrt{3}$ হয়, তবে $x^3 + \\frac{8}{x^3}$ এর মান কত?",
    optionA: "$18\\sqrt{5}$",
    optionB: "$22\\sqrt{5}$",
    optionC: "$28\\sqrt{5}$",
    optionD: "$32\\sqrt{5}$",
    correctOption: Option.C,
  },
  // 47th BCS Q12 (Math - Ball Probability)
  "ab8e8b9a-94b5-492b-af1e-c99e59ecef58": {
    subject: Subject.MATH,
    stem: "একটি ব্যাগে 2টি লাল, 3টি সবুজ এবং 2টি নীল বল আছে। যদি দৈবভাবে 2টি বল নেওয়া হয়, তাহলে বল দুটির কোনটিই নীল না হওয়ার সম্ভাবনা কত?",
    optionA: "$\\frac{10}{21}$",
    optionB: "$\\frac{11}{21}$",
    optionC: "$\\frac{2}{7}$",
    optionD: "$\\frac{5}{7}$",
    correctOption: Option.A,
  },
  // 47th BCS Q9 (Math - Geometric series)
  "6452fe12-dc48-468d-9165-ac6a51b2e9a0": {
    subject: Subject.MATH,
    stem: "একটি গুণোত্তর ধারার প্রথম ও দ্বিতীয় পদ যথাক্রমে 27 এবং 9, তাহলে ধারাটির দশম পদ কত?",
    optionA: "$\\frac{1}{3}$",
    optionB: "$\\frac{1}{525}$",
    optionC: "$\\frac{1}{729}$",
    optionD: "$\\frac{1}{615}$",
    correctOption: Option.C,
  },
  // 47th BCS Q (Math - Circle Square)
  "edf7cda1-7e99-43a7-b5f2-55f39af48ba6": {
    subject: Subject.MATH,
    stem: "একটি বৃত্তে বর্গ এর প্রত্যেক বাহুর দৈর্ঘ্য 2 সেমি. হলে, ঐ বৃত্তের ক্ষেত্রফল কত?",
    optionA: "$\\pi$",
    optionB: "$2\\pi$",
    optionC: "$2\\sqrt{2}\\pi$",
    optionD: "$4\\pi$",
    correctOption: Option.B,
  },
  // 47th BCS Q (Math - Logarithm)
  "f4a8bf97-17c6-4c38-8e47-cf9b85665ae8": {
    subject: Subject.MATH,
    stem: "যদি $\\log_x 324 = 4$ হয়, তবে $x$ এর মান কত?",
    optionA: "$3\\sqrt{2}$",
    optionB: "$4\\sqrt{2}$",
    optionC: "$5\\sqrt{2}$",
    optionD: "$2\\sqrt{2}$",
    correctOption: Option.A,
  },
  // 47th BCS Q (Math - Combinations misclassified as IT)
  "04d14960-2a8b-497e-9a7e-3484b6b661ba": {
    subject: Subject.MATH,
    stem: "যদি $^nC_8 = ^nC_{12}$ হয়, তবে $^{22}C_n$ এর মান কত?",
    optionA: "230",
    optionB: "231",
    optionC: "232",
    optionD: "233",
    correctOption: Option.B,
  },
  // 47th BCS Q5 (IT - Binary signed/unsigned)
  "e6d76355-4160-406b-8aa6-63950e0afa5c": {
    subject: Subject.IT,
    stem: "একটি কম্পিউটার সিস্টেমে $(11001011)_2$ বাইনারি সংখ্যাটির মান ডেসিমেলে কত হবে?",
    optionA: "-৫২",
    optionB: "-৫৩",
    optionC: "২০৩",
    optionD: "উপরের সবকটি হতে পারে",
    correctOption: Option.C,
  },
  // 47th BCS Q15 (IT - Boot Order)
  "b7cfdb8c-4cab-4421-8b88-e038f15708e3": {
    subject: Subject.IT,
    stem: "কম্পিউটার টার্ন অন এর সময় সঠিক অর্ডার নিচের কোনটি?",
    optionA: "POST → Kernel → Bootloader",
    optionB: "Kernel → POST → Bootloader",
    optionC: "Kernel → Bootloader → POST",
    optionD: "POST → Bootloader → Kernel",
    correctOption: Option.D,
  },
  // 46th BCS Q19 (Math - Triangle angles)
  "b0da29be-64c0-4b26-bc8a-55114f3eb489": {
    subject: Subject.MATH,
    stem: "কোনো একটি ত্রিভুজের দুইটি কোণের পরিমাণ $২৮^\\circ$ ও $৬২^\\circ$। ত্রিভুজটি কোন ধরনের?",
    optionA: "সমকোণী",
    optionB: "সূক্ষ্মকোণী",
    optionC: "স্থূলকোণী",
    optionD: "সমদ্বিবাহু সমকোণী",
    correctOption: Option.A,
  },
  // 46th BCS Q15 (Math - Exponential equation)
  "54ace80a-c3bd-4b82-af9f-be1de77b185e": {
    subject: Subject.MATH,
    stem: "$\\frac{1}{2} \\times 2^{x - 3} + 1 = 5$ হলে $x$ এর মান কত?",
    optionA: "3",
    optionB: "4",
    optionC: "5",
    optionD: "6",
    correctOption: Option.D,
  },
  // 46th BCS Q (Math - Bag ball probability)
  "e68d4c03-e74b-4222-a669-c04ce50adcb2": {
    subject: Subject.MATH,
    stem: "একটি থলিতে 5টি নীল, 10টি সাদা, 20টি কালো বল আছে। দৈব চয়নের মাধ্যমে একটি বল তুললে সেটি সাদা না হওয়ার সম্ভাবনা কত?",
    optionA: "$\\frac{3}{10}$",
    optionB: "$\\frac{5}{7}$",
    optionC: "$\\frac{7}{5}$",
    optionD: "$\\frac{7}{10}$",
    correctOption: Option.B,
  },
  // 46th BCS Q (Math - Logarithm base sqrt(8))
  "f6a270f5-3a58-4f55-b9bd-ac41ad663501": {
    subject: Subject.MATH,
    stem: "$\\log_{\\sqrt{8}} x = 3\\frac{1}{3}$ হলে $x$ এর মান কত?",
    optionA: "32",
    optionB: "8",
    optionC: "3",
    optionD: "$\\sqrt{8}$",
    correctOption: Option.A,
  },
  // 46th BCS IT (Octal to binary)
  "f1f5e8aa-941b-4db4-a2ad-c096f2c63dde": {
    subject: Subject.IT,
    stem: "নিচের কোনটি অক্টাল সংখ্যা $(২৪)_8$ এর সঠিক বাইনারি রূপ?",
    optionA: "$(111101)_2$",
    optionB: "$(010100)_2$",
    optionC: "$(111100)_2$",
    optionD: "$(101010)_2$",
    correctOption: Option.B,
  },
  // 45th BCS Q (Math - Geometric series)
  "4e3bf18e-5eb4-4ff3-b176-001e4a9530a9": {
    subject: Subject.MATH,
    stem: "$\\frac{1}{\\sqrt{3}}, -1, \\sqrt{3}, \\dots$ ধারাটির পঞ্চম পদ কত?",
    optionA: "$-\\sqrt{3}$",
    optionB: "9",
    optionC: "$-9\\sqrt{3}$",
    optionD: "$3\\sqrt{3}$",
    correctOption: Option.D,
  },
  // 45th BCS IT (Hex to Octal)
  "e6d42df9-c990-4824-a2c6-d444498ec517": {
    subject: Subject.IT,
    stem: "$(2FA)_{16}$ এই হেক্সাডেসিমেল সংখ্যাটিকে অক্টালে রূপান্তর করুন:",
    optionA: "$(762)_8$",
    optionB: "$(1372)_8$",
    optionC: "$(228)_8$",
    optionD: "$(1482)_8$",
    correctOption: Option.B,
  },
  // 44th BCS Q (Math - Probability independent events)
  "c7299244-fe43-484b-a578-6c380ea6d8e6": {
    subject: Subject.MATH,
    stem: "$P(A) = \\frac{1}{3}, P(B) = \\frac{3}{4}$, $A$ ও $B$ স্বাধীন হলে, $P(A \\cup B)$ এর মান কত?",
    optionA: "$\\frac{3}{4}$",
    optionB: "$\\frac{1}{3}$",
    optionC: "$\\frac{5}{6}$",
    optionD: "এর কোনোটিই নয়",
    correctOption: Option.C,
  },
  // 44th BCS Q (Math - Function inverse)
  "e1823eb2-cbcf-4fa7-aa7e-976214be2fc3": {
    subject: Subject.MATH,
    stem: "যদি একটি ফাংশন $f: \\mathbb{R} \\to \\mathbb{R}$, $f(x) = 2x + 1$ দ্বারা সংজ্ঞায়িত হয়, তবে $f^{-1}(2)$ এর মান কত?",
    optionA: "0",
    optionB: "$\\frac{1}{2}$",
    optionC: "5",
    optionD: "1",
    correctOption: Option.B,
    explanation: "দেওয়া আছে $f(x) = 2x + 1$। ধরি $y = 2x + 1 \\implies x = \\frac{y-1}{2}$। সুতরাং $f^{-1}(y) = \\frac{y-1}{2}$। অতএব $f^{-1}(2) = \\frac{2-1}{2} = \\frac{1}{2}$।",
  },
  // 44th BCS Q (Math - Alternating series sum)
  "35960d2b-e60f-463e-acc6-95c7a0ceb56f": {
    subject: Subject.MATH,
    stem: "$1 - 1 + 1 - 1 + 1 - 1 + \\dots + n$ সংখ্যক পদের যোগফল হবে-",
    optionA: "0",
    optionB: "1",
    optionC: "$\\left[1+(-1)^n\\right]$",
    optionD: "$\\frac{1}{2}\\left[1-(-1)^n\\right]$",
    correctOption: Option.D,
  },
  // 43rd BCS Q (Math - Circle angle)
  "c63b7d30-b385-45a8-b64d-ec6bb8b50f75": {
    subject: Subject.MATH,
    stem: "চিত্রে $O$ কেন্দ্রবিশিষ্ট বৃত্তে কেন্দ্রস্থ কোণ $\\angle BOC = 108^\\circ$ হলে, বৃত্তস্থ কোণ $x$ এর মান কত?",
    optionA: "54°",
    optionB: "72°",
    optionC: "108°",
    optionD: "126°",
    correctOption: Option.D,
    explanation: "বৃত্তস্থ কোণ কেন্দ্রস্থ কোণের অর্ধেক। চিত্রে প্রবৃদ্ধ কোণ $\\angle BOC = 360^\\circ - 108^\\circ = 252^\\circ$। সুতরাং $x = \\frac{1}{2} \\times 252^\\circ = 126^\\circ$।",
  },
  // 43rd BCS Q (Math - Inequality)
  "c1d89c57-d013-459d-a9f3-7bf004339fde": {
    subject: Subject.MATH,
    stem: "বাস্তব সংখ্যায় $\\frac{1}{3x-5} < \\frac{1}{3}$ অসমতাটির সমাধান কোনটি?",
    optionA: "$-\\infty < x < \\frac{5}{3}$",
    optionB: "$\\frac{8}{3} < x < \\infty$",
    optionC: "$-\\infty < x < \\frac{5}{2}$ অথবা $\\frac{8}{3} < x < \\infty$",
    optionD: "$-\\infty < x < \\frac{5}{2}$ এবং $\\frac{8}{3} < x < \\infty$",
    correctOption: Option.B,
  },
  // 41st BCS IT (De Morgan)
  "d012e8aa-00b8-47c3-bb52-0fb308cf2262": {
    subject: Subject.IT,
    stem: "নিচের কোনটি সঠিক নয়?",
    optionA: "$\\overline{A + B} = \\bar{A} \\cdot \\bar{B}$",
    optionB: "$\\overline{A + B} = \\bar{A} + \\bar{B}$",
    optionC: "$\\overline{A \\cdot B \\cdot C} = \\bar{A} + \\bar{B} + \\bar{C}$",
    optionD: "$\\overline{A + B + C} = \\bar{A} \\cdot \\bar{B} \\cdot \\bar{C}$",
    correctOption: Option.B,
  },
  // 40th BCS Q (Math - Geometry angles)
  "28ca0f9b-640a-4da2-811c-c76a5b6f38fe": {
    subject: Subject.MATH,
    stem: "চিত্রে $PQ \\parallel MR$, $PQ = PR$ এবং $\\angle PQR = 55^\\circ$ হলে, $\\angle NRP$ এর মান কত?",
    optionA: "90°",
    optionB: "55°",
    optionC: "45°",
    optionD: "35°",
    correctOption: Option.D,
    explanation: "দেওয়া আছে $PQ \\parallel MR$ এবং $PQ = PR$। সমদ্বিবাহু ত্রিভুজ $PQR$-এ $\\angle PRQ = \\angle PQR = 55^\\circ$। একান্তর কোণ $\\angle QRM = \\angle PQR = 55^\\circ$। সুতরাং $\\angle PRM = 55^\\circ + 55^\\circ = 110^\\circ$। সরলরেখায় $\\angle MRN = 180^\\circ$ হওয়ায় $\\angle LRN = 90^\\circ$ বিবেচনা করলে $\\angle NRP = 35^\\circ$।",
  },
  // 40th BCS IT (Hexadecimal to Binary)
  "b2881fdb-65fe-4bb5-8a74-79165153e945": {
    subject: Subject.IT,
    stem: "নিচের কোনটি $(৫২)_{16}$ এর বাইনারি রূপ?",
    optionA: "$(01010010)_2$",
    optionB: "$(01110011)_2$",
    optionC: "$(00001100)_2$",
    optionD: "$(11110000)_2$",
    correctOption: Option.A,
  },
  // 36th BCS Q (Math - Algebraic identity)
  "8a6ec5df-37ac-4bdf-9f2b-741b8b93a7b6": {
    subject: Subject.MATH,
    stem: "$x - \\frac{1}{x} = 1$ হলে, $x^3 - \\frac{1}{x^3}$ এর মান কত?",
    optionA: "1",
    optionB: "2",
    optionC: "3",
    optionD: "4",
    correctOption: Option.D,
  },
  // 36th BCS IT (Binary addition)
  "56b3e232-a5ec-4581-8bfe-30887df57cf8": {
    subject: Subject.IT,
    stem: "$(1011)_2 + (0101)_2 = ?$",
    optionA: "$(1100)_2$",
    optionB: "$(11000)_2$",
    optionC: "$(01100)_2$",
    optionD: "কোনোটিই নয়",
    correctOption: Option.D,
  },
  // 36th BCS IT (Boolean algebra)
  "58bcf7b2-3be9-45d2-9706-e7e0e7a274dc": {
    subject: Subject.IT,
    stem: "Boolean Algebra-এর নিচের কোনটি সঠিক?",
    optionA: "$A + \\overline{A} = 1$",
    optionB: "$A \\cdot A = 1$",
    optionC: "$A + A = 2A$",
    optionD: "উপরের কোনোটিই নয়",
    correctOption: Option.A,
  },
  // 35th BCS Q (Math - Logarithm identity)
  "a64aab05-9fa3-49df-9951-f32a6b2c703f": {
    subject: Subject.MATH,
    stem: "$\\log_a x = 1, \\log_a y = 2$ এবং $\\log_a z = 3$ হলে, $\\log_a \\left(\\frac{x^3 y^2}{z}\\right)$ এর মান কত?",
    optionA: "1",
    optionB: "2",
    optionC: "4",
    optionD: "5",
    correctOption: Option.C,
  },
  // 31st BCS Q (Math - Function evaluation)
  "ffd9ff30-e0c6-4991-ab83-ec51eda5cf62": {
    subject: Subject.MATH,
    stem: "$f(x) = x^3 - 2x + 10$ হলে $f(0)$ কত?",
    optionA: "1",
    optionB: "5",
    optionC: "8",
    optionD: "10",
    correctOption: Option.D,
  },
  // 16th BCS Q (Math - Algebraic fraction)
  "529f1e40-f8cb-4fcf-a287-4aba988a9e30": {
    subject: Subject.MATH,
    stem: "$\\frac{a^2 + b^2 - c^2 + 2ab}{a^2 - b^2 + c^2 + 2ac} = ?$ এর মান কত?",
    optionA: "$a + b + c$",
    optionB: "$\\frac{a + b - c}{a - b + c}$",
    optionC: "$\\frac{a - b + c}{a + b - c}$",
    optionD: "$\\frac{a + b - c}{a + b + c}$",
    correctOption: Option.B,
  },
  // 11th BCS Q (Math - Square)
  "98f9c8a7-42dd-4472-8b75-3753e1f111f1": {
    subject: Subject.MATH,
    stem: "$(-15)^2$ এর মান কত?",
    optionA: "0",
    optionB: "1",
    optionC: "225",
    optionD: "$\\frac{1}{225}$",
    correctOption: Option.C,
  },
  // 11th BCS Q (Math - Vinculum simplification)
  "ef3a90b3-d599-43cc-a825-da5d778fb224": {
    subject: Subject.MATH,
    stem: "$a - [a - \\{a - (a - \\overline{a - 1})\\}] = ?$ এর মান কত?",
    optionA: "1",
    optionB: "-1",
    optionC: "a - 1",
    optionD: "a + 1",
    correctOption: Option.C,
  },
};

async function asyncPool<T>(
  concurrency: number,
  items: T[],
  fn: (item: T, index: number) => Promise<void>
): Promise<void> {
  let index = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (index < items.length) {
      const currentIndex = index++;
      await fn(items[currentIndex], currentIndex);
    }
  });
  await Promise.all(workers);
}

export async function main() {
  console.log("==================================================================");
  console.log("COMPREHENSIVE RESTORATION: MATH & ICT DATA, FORMULAS & SYMBOLS");
  console.log("==================================================================");

  const origCsvPath = path.resolve(process.cwd(), "../app/.scratch/original_harvested_bcs.csv");
  if (!fs.existsSync(origCsvPath)) {
    throw new Error(`Original CSV not found at: ${origCsvPath}`);
  }
  const origContent = fs.readFileSync(origCsvPath, "utf-8");
  const origRecords: Record<string, string>[] = parse(origContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });
  console.log(`[1/5] Loaded ${origRecords.length} authentic records from original CSV.`);

  const fullCsvPath = path.resolve(process.cwd(), "../app/.scratch/bcs_full_database.csv");
  const fullContent = fs.readFileSync(fullCsvPath, "utf-8");
  const fullRecords: Record<string, string>[] = parse(fullContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });
  console.log(`[2/5] Loaded ${fullRecords.length} records from current bcs_full_database.csv.`);

  const dbQuestions = await prisma.question.findMany({
    where: { type: "BANK" },
  });
  console.log(`[3/5] Loaded ${dbQuestions.length} BANK questions from PostgreSQL.`);

  const norm = (s: string) => (s || "").replace(/[\s\$\\\{\}\(\)\–\—\-]+/g, "").toLowerCase();

  const fullMap = new Map<string, number>();
  fullRecords.forEach((r: any, idx: number) => {
    fullMap.set(`${r.exam_session}___${norm(r.question_text)}`, idx);
  });

  const dbUpdates: Array<{
    id: string;
    subject?: Subject;
    questionText: string;
    optionA: string;
    optionB: string;
    optionC: string;
    optionD: string;
    correctOption?: Option;
    explanation?: string | null;
  }> = [];

  let countMathFixed = 0;
  let countItFixed = 0;
  let countStemFixed = 0;

  for (const q of dbQuestions) {
    if (VERIFIED_OVERRIDES[q.id]) {
      const ov = VERIFIED_OVERRIDES[q.id];
      dbUpdates.push({
        id: q.id,
        subject: ov.subject,
        questionText: ov.stem ?? q.questionText,
        optionA: ov.optionA ?? q.optionA,
        optionB: ov.optionB ?? q.optionB,
        optionC: ov.optionC ?? q.optionC,
        optionD: ov.optionD ?? q.optionD,
        correctOption: ov.correctOption,
        explanation: ov.explanation ?? q.explanation,
      });
      continue;
    }

    let recordIdx = -1;
    const directKey = `${q.examSession}___${norm(q.questionText)}`;
    if (fullMap.has(directKey)) {
      recordIdx = fullMap.get(directKey)!;
    } else {
      recordIdx = fullRecords.findIndex(
        (r: any) =>
          r.exam_session === q.examSession &&
          (norm(r.option_a) === norm(q.optionA) || norm(r.option_b) === norm(q.optionB)) &&
          r.correct_option === q.correctOption
      );
    }

    let rawR = recordIdx !== -1 ? origRecords[recordIdx] : null;

    if (!rawR) {
      const newQt = cleanMathAndICTText(q.questionText);
      const newA = cleanMathAndICTText(q.optionA);
      const newB = cleanMathAndICTText(q.optionB);
      const newC = cleanMathAndICTText(q.optionC);
      const newD = cleanMathAndICTText(q.optionD);

      dbUpdates.push({
        id: q.id,
        questionText: newQt,
        optionA: newA,
        optionB: newB,
        optionC: newC,
        optionD: newD,
        explanation: q.explanation,
      });
      continue;
    }

    const rawQt = rawR.question_text || "";
    let optA = recoverOptionWord(rawQt, rawR.option_a);
    let optB = recoverOptionWord(rawQt, rawR.option_b);
    let optC = recoverOptionWord(rawQt, rawR.option_c);
    let optD = recoverOptionWord(rawQt, rawR.option_d);

    const cutIdx = findOptionCutIndex(rawQt, optA, optB, optC);
    let stem = cutIdx > 5 ? rawQt.substring(0, cutIdx).trim() : rawQt.trim();

    const exp = (rawR.explanation || "").trim();
    if (exp && exp.length > 5) {
      const expIdx = stem.lastIndexOf(exp);
      if (expIdx > 15) {
        stem = stem.substring(0, expIdx).trim();
      }
    }

    stem = cleanStemPunctuation(stem);

    stem = cleanMathAndICTText(stem);
    optA = cleanMathAndICTText(optA);
    optB = cleanMathAndICTText(optB);
    optC = cleanMathAndICTText(optC);
    optD = cleanMathAndICTText(optD);

    const cleanExp = rawR.explanation ? cleanMathAndICTText(rawR.explanation) : q.explanation;

    let sub = q.subject;
    if (stem.includes("^nC_8") || stem.includes("^{22}C_n") || stem.includes("22Cn")) {
      sub = Subject.MATH;
    }

    if (q.subject === "MATH" || sub === Subject.MATH) countMathFixed++;
    if (q.subject === "IT") countItFixed++;
    if (stem !== q.questionText) countStemFixed++;

    dbUpdates.push({
      id: q.id,
      subject: sub,
      questionText: stem,
      optionA: optA,
      optionB: optB,
      optionC: optC,
      optionD: optD,
      explanation: cleanExp,
    });
  }

  console.log(`[4/5] Prepared ${dbUpdates.length} updates for PostgreSQL.`);

  // Apply to PostgreSQL in pool of 10
  console.log(`\nExecuting database updates...`);
  let updatedCount = 0;
  const startTime = Date.now();

  await asyncPool(10, dbUpdates, async (item) => {
    const data: any = {
      questionText: item.questionText,
      optionA: item.optionA,
      optionB: item.optionB,
      optionC: item.optionC,
      optionD: item.optionD,
      explanation: item.explanation,
    };
    if (item.subject) {
      data.subject = item.subject;
    }
    if (item.correctOption) {
      data.correctOption = item.correctOption;
    }

    await prisma.question.update({
      where: { id: item.id },
      data,
    });
    updatedCount++;
    if (updatedCount % 1000 === 0 || updatedCount === dbUpdates.length) {
      console.log(`Updated ${updatedCount} / ${dbUpdates.length} questions in PostgreSQL.`);
    }
  });

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`Database updates finished in ${durationSec}s.`);

  // 5. Synchronize app/.scratch/bcs_full_database.csv
  console.log(`\n[5/5] Synchronizing app/.scratch/bcs_full_database.csv...`);
  const finalDbQuestions = await prisma.question.findMany({
    where: { type: "BANK" },
    orderBy: { createdAt: "asc" },
  });

  const columns = [
    "exam_session",
    "subject",
    "topic",
    "question_text",
    "option_a",
    "option_b",
    "option_c",
    "option_d",
    "correct_option",
    "explanation",
    "difficulty",
  ];

  const csvRows = finalDbQuestions.map((q) => {
    return columns
      .map((col) => {
        switch (col) {
          case "exam_session": return escapeCsv(q.examSession);
          case "subject": return escapeCsv(q.subject);
          case "topic": return escapeCsv(q.topic ?? "");
          case "question_text": return escapeCsv(q.questionText);
          case "option_a": return escapeCsv(q.optionA);
          case "option_b": return escapeCsv(q.optionB);
          case "option_c": return escapeCsv(q.optionC);
          case "option_d": return escapeCsv(q.optionD);
          case "correct_option": return escapeCsv(q.correctOption);
          case "explanation": return escapeCsv(q.explanation ?? "");
          case "difficulty": return escapeCsv(q.difficulty);
          default: return "";
        }
      })
      .join(",");
  });

  const finalCsvContent = [columns.join(","), ...csvRows].join("\n");
  fs.writeFileSync(fullCsvPath, finalCsvContent, "utf-8");
  console.log(`Synchronized ${finalDbQuestions.length} records to ${fullCsvPath}.`);

  console.log("\nRestoration complete!");
}

if (process.argv[1]?.endsWith("fixMathAndICTComprehensive.ts")) {
  main().catch(console.error).finally(() => process.exit(0));
}
