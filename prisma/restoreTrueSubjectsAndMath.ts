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
    "hristopher Marlowe": "Christopher Marlowe",
    "en Jonson": "Ben Jonson",
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

  const cleanQt = clean(qt);
  const cleanA = clean(optA);
  const cleanB = clean(optB);
  const cleanC = clean(optC);

  let targetNormIndex = -1;

  if (cleanA.length >= 2) {
    let searchPos = 0;
    while (searchPos < cleanQt.length) {
      const idxA = cleanQt.indexOf(cleanA, searchPos);
      if (idxA === -1) break;

      const afterA = cleanQt.substring(idxA + cleanA.length);
      if (cleanB.length >= 2 && afterA.includes(cleanB)) {
        if (idxA > 5) {
          targetNormIndex = idxA;
          break;
        }
      }
      searchPos = idxA + 1;
    }
  }

  if (targetNormIndex === -1 && cleanB.length >= 2 && cleanC.length >= 2) {
    let searchPos = 0;
    while (searchPos < cleanQt.length) {
      const idxB = cleanQt.indexOf(cleanB, searchPos);
      if (idxB === -1) break;
      const afterB = cleanQt.substring(idxB + cleanB.length);
      if (afterB.includes(cleanC)) {
        if (idxB > 8) {
          targetNormIndex = idxB;
          break;
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

export function cleanMathAndICTText(text: string): string {
  if (!text) return "";
  let s = text.replace(/[\u200b\u200c\ufeff]/g, "").trim();

  // Strip standalone currency dollar marks
  s = s.replace(/^\$\s*([০-৯\d]+(?:\,[০-৯\d]+)*)\s*(মার্কিন ডলার|ডলার)/g, "$1 $2");
  s = s.replace(/^\$\s*$/g, "");

  // 1. Arrows
  s = s.replace(/→\s*\\rightarrow\s*→/g, "→");
  s = s.replace(/\\rightarrow/g, "→");

  // 2. Degree triplications:
  s = s.replace(/([০-৯\d]+)[০∘]\s*([০-৯\d\s]+)\^?\{?\\circ\}?\s*\1[০∘]?/g, (_, d1, d2) => `$${d2.replace(/\s+/g, "")}^\\circ$`);
  s = s.replace(/([০-৯\d]+)\s*\\circ\s*([০-৯\d]+)/g, (_, d1) => `$${d1}^\\circ$`);
  s = s.replace(/([০-৯\d]+)[০∘]২\s*৮\^?\{?\\circ\}?[০-৯\d]+[০∘]/g, "$২৮^\\circ$");
  s = s.replace(/([০-৯\d]+)[০∘]৬\s*২\^?\{?\\circ\}?[০-৯\d]+[০∘]/g, "$৬২^\\circ$");
  s = s.replace(/(\d+)\^?\s*\\mathrm\s*o\s*\1o?/g, (_, d) => `$${d}^\\circ$`);
  s = s.replace(/\{(\d+)\}\^\s*\\mathrm\s*o\s*\1o?/g, (_, d) => `$${d}^\\circ$`);

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
  s = s.replace(/\(([০-৯\d]+)\)8\s*\1_8\s*\18/g, (_, o1) => `$(${o1})_8$`);

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
  s = s.replace(/\\\$\\sqrt\{2\}\\pi\$/g, "$\\sqrt{2}\\pi$");
  s = s.replace(/\$\\sqrt\{2\}\\pi\$/g, "$\\sqrt{2}\\pi$");

  // 7. Fractions:
  s = s.replace(/[০-৯\d]+\s*\\frac\{([^{}]+)\}\{([^{}]+)\}\s*[০-৯\d]*/g, (_, n, d) => {
    return `$\\frac{${n.replace(/\s+/g, "")}}{${d.replace(/\s+/g, "")}}$`;
  });
  s = s.replace(/^\\frac\{([^{}]+)\}\{([^{}]+)\}$/g, (_, n, d) => `$\\frac{${n.trim()}}{${d.trim()}}$`);
  s = s.replace(/[০-৯\d]*\s*([০-৯\d]+)\s*\\over\s*([০-৯\d]+)\s*[০-৯\d]*/g, (_, n, d) => `$\\frac{${n}}{${d}}$`);
  s = s.replace(/[০-৯\d]*\s*\\mathrm\s*\{([০-৯\d]+)\s*\\over\s*([০-৯\d]+)\}[০-৯\d]*/g, (_, n, d) => `$\\frac{${n}}{${d}}$`);
  s = s.replace(/[০-৯\d]*\s*\\mathrm\s*\{([০-৯\d]+)\s*\{([০-৯\d]+)\\over\s*([০-৯\d]+)\}\}[০-৯\d]*/g, (_, w, n, d) => `$${w}\\frac{${n}}{${d}}$`);
  s = s.replace(/[০-৯\d]+%?\\mathrm\s*\{([০-৯\d]+)\s*\{([০-৯\d]+)\s*\\over\s*([০-৯\d]+)\}\\%?\}[০-৯\d]+%?/g, (_, w, n, d) => `$${w}\\frac{${n}}{${d}}\\%$`);

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

  // 10. Specific formulas:
  s = s.replace(/x\s*=\s*5\s*\+\s*3\s*x\s*=\s*\\sqrt\{5\}\s*\+\s*\\sqrt\{3\}\s*x\s*=\s*5[​\s]*\+3[​\s]*/g, "$x = \\sqrt{5} + \\sqrt{3}$");
  s = s.replace(/x3\s*\+\s*8x3\s*x\^3\s*\+\s*\\frac\{8\}\{x\^3\}\s*x3\s*\+\s*x38/g, "$x^3 + \\frac{8}{x^3}$");
  s = s.replace(/12×2x[−\-]3\+1=5\s*\\frac\{1\}\{2\}\s*\\times\s*2\^\{x\s*-\s*3\}\s*\+\s*1\s*=\s*5\s*21[​\s]*×2x[−\-]3\+1=5/g, "$\\frac{1}{2} \\times 2^{x - 3} + 1 = 5$");
  s = s.replace(/log[⁡x]*324\s*=\s*4\s*\\log_x\s*324\s*=\s*4\s*logx[⁡\s]*=?[0-9]*/g, "$\\log_x 324 = 4$");
  s = s.replace(/xxxএর/g, "$x$ এর");
  s = s.replace(/kkkএর/g, "$k$ এর");
  s = s.replace(/5x3−2x2\+x\+k=0\s*5x\^3\s*-\s*2x\^2\s*\+\s*x\s*\+\s*k\s*=\s*0\s*5x3−2x2\+x\+k=0/g, "$5x^3 - 2x^2 + x + k = 0$");
  s = s.replace(/উৎপাদক\s*\(x\s*-\s*3\)হয়/g, "উৎপাদক $(x - 3)$ হয়");
  s = s.replace(/\(x−3\)\(x\s*-\s*3\)\(x−3\)/g, "$(x - 3)");
  s = s.replace(/\|x[−\-]5x\s*-\s*5x[−\-]5\|\s*<\s*2\s*,\s*x∈IN\s*x\s*\\in\s*IN\s*x∈IN/g, "$|x - 5| < 2, x \\in \\mathbb{N}$");
  s = s.replace(/A=\{x∈IN:2<x≤6\}\s*A\s*=\s*\\\{x\s*\\in\s*IN\s*:\s*2\s*<\s*x\s*\\le\s*6\\\}\s*A=\{x∈IN:2<x≤6\}/g, "$A = \\{x \\in \\mathbb{N} : 2 < x \\le 6\\}$");
  s = s.replace(/B=\{x∈IN:xB\s*=\s*\\\{x\s*\\in\s*IN\s*:\s*xB=\{x∈IN:xজোর\s*সংখ্যাx≤8\}\s*x\s*\\le\s*8\\\}\s*x≤8\}/g, "$B = \\{x \\in \\mathbb{N} : x \\text{ জোড় সংখ্যা}, x \\le 8\\}$");
  s = s.replace(/A∩B\s*A\s*\\cap\s*B\s*A∩B/g, "$A \\cap B$");
  s = s.replace(/y=xy\s*=\s*xy=x/g, "$y = x$");
  s = s.replace(/y=3xy\s*=\s*3xy=3x/g, "$y = 3x$");
  s = s.replace(/y=x\+3y\s*=\s*x\s*\+\s*3y=x\+3/g, "$y = x + 3$");
  s = s.replace(/y=3x\+3y\s*=\s*3x\s*\+\s*3y=3x\+3/g, "$y = 3x + 3$");

  // 11. Sets and intervals:
  s = s.replace(/A=\{x∈N:x2−5x−14=0\}A=\\left\\\{x\\in N:x\^2-5x-14=0\\right\\\}A=\{x∈N:x2−5x−14=0\}/g, "$A = \\{x \\in \\mathbb{N} : x^2 - 5x - 14 = 0\\}$");
  s = s.replace(/\{([^{}]+)\}\s*\\left\\\{\s*([^{}]+)\s*\\right\\\}\s*\{\1\}/g, (_, p, f) => `$\\{${f.trim()}\\}$`);
  s = s.replace(/\\left\\\{\s*([^{}]+)\s*\\right\\\}/g, (_, inSet) => `$\\{${inSet.trim()}\\}$`);
  s = s.replace(/\\left\[\s*([^\[\]]+)\s*\\right\]/g, (_, inInt) => `$[${inInt.trim()}]$`);
  s = s.replace(/\\left\(\s*([^()]+)\s*\\right\)/g, (_, inP) => `$(${inP.trim()})$`);
  s = s.replace(/\\left\(\\right\.\s*([^,]+)\s*,\s*([^,\s\\]+)\s*\\left\.\s*\\right\)/g, (_, a, b) => `$(${a.trim()}, ${b.trim()})$`);
  s = s.replace(/\\left\[\\right\.\s*([^,]+)\s*,\s*([^,\s\\]+)\s*\\left\.\s*\\right\)/g, (_, a, b) => `$[$1, $2]$`);
  s = s.replace(/\\left\./g, "").replace(/\\right\./g, "").replace(/\\left/g, "").replace(/\\right/g, "");

  // 12. KaTeX triplications cleanup:
  // e.g. "x+y=0\mathrm {x+y}=0x+y=0" -> "$x+y=0$"
  s = s.replace(/([a-zA-Z0-9\+\-\=\>\<\^\.\,]+)\s*\\mathrm\s*\{([^{}]+)\}\s*\1/g, (_, r, m) => `$${m.trim()}$`);
  s = s.replace(/\{\s*\\mathrm\s*\{([^{}]+)\}\s*\}/g, "$1");
  s = s.replace(/\\underline\s*\{\s*\\mathrm\s*\{([^{}]+)\}\s*\}/g, "$1");
  s = s.replace(/\\underline\s*\{([^{}]+)\}/g, "$1");
  s = s.replace(/\\mathrm\s*\{([^{}]+)\}/g, "$1");
  s = s.replace(/\\mathrm\s+([a-zA-Z0-9০-৯]+)/g, "$1");
  s = s.replace(/\\space/g, " ");

  // Clean double dollars or stray dollars
  s = s.replace(/\${2,}/g, "$");
  s = s.replace(/\$\s*\$/g, "");

  return s;
}

// Special overrides for truncated or damaged questions
export const KNOWN_QUESTION_OVERRIDES: Record<string, { stem: string; optA?: string; optB?: string; optC?: string; optD?: string; correct?: Option; subject?: Subject }> = {
  // secA + tanA = 5/2
  "5238dc58-9a58-4b29-bf00-43a21f195d79": {
    stem: "$\\sec A + \\tan A = \\frac{5}{2}$ হলে $\\sec A - \\tan A$ এর মান কত?",
    optA: "$\\frac{1}{2}$",
    optB: "$\\frac{1}{5}$",
    optC: "$\\frac{2}{5}$",
    optD: "$\\frac{5}{2}$",
    correct: Option.C,
    subject: Subject.MATH,
  },
  // 34th BCS Mental Ability T,X series
  "720d032a-6a5c-4cff-b686-d6ab2ccce3fa": {
    stem: "প্রশ্নবোধক স্থানে কোনটি বসবে? P, U | Q, V | R, W | ?",
    optA: "T, X",
    optB: "X, T",
    optC: "S, T",
    optD: "T, B",
    correct: Option.A,
    subject: Subject.MENTAL_ABILITY,
  },
  // 47th BCS Binary question (ID e6d76355-4160-406b-8aa6-63950e0afa5c)
  "e6d76355-4160-406b-8aa6-63950e0afa5c": {
    stem: "একটি কম্পিউটার সিস্টেমে $(11001011)_2$ বাইনারি সংখ্যাটির মান ডেসিমেলে কত হবে?",
    optA: "-৫২",
    optB: "-৫৩",
    optC: "২০৩",
    optD: "উপরের সবকটি হতে পারে",
    correct: Option.C,
    subject: Subject.IT,
  },
  // 46th BCS 28 deg triangle (ID b0da29be-64c0-4b26-bc8a-55114f3eb489)
  "b0da29be-64c0-4b26-bc8a-55114f3eb489": {
    stem: "কোনো একটি ত্রিভুজের দুইটি কোণের পরিমাণ $২৮^\\circ$ ও $৬২^\\circ$। ত্রিভুজটি কোন ধরনের?",
    optA: "সমকোণী",
    optB: "সূক্ষ্মকোণী",
    optC: "স্থূলকোণী",
    optD: "সমদ্বিবাহু সমকোণী",
    correct: Option.A,
    subject: Subject.MATH,
  },
  // 47th BCS geometric sequence (ID 6452fe12-dc48-468d-9165-ac6a51b2e9a0)
  "6452fe12-dc48-468d-9165-ac6a51b2e9a0": {
    stem: "একটি গুণোত্তর ধারার প্রথম ও দ্বিতীয় পদ যথাক্রমে 27 এবং 9, তাহলে ধারাটির দশম পদ কত?",
    optA: "$\\frac{1}{3}$",
    optB: "$\\frac{1}{525}$",
    optC: "$\\frac{1}{729}$",
    optD: "$\\frac{1}{615}$",
    correct: Option.C,
    subject: Subject.MATH,
  },
  // 47th BCS Circle/Square (ID edf7cda1-7e99-43a7-b5f2-55f39af48ba6)
  "edf7cda1-7e99-43a7-b5f2-55f39af48ba6": {
    stem: "একটি বৃত্তে বর্গ এর প্রত্যেক বাহুর দৈর্ঘ্য 2 সেমি. হলে, ঐ বৃত্তের ক্ষেত্রফল কত?",
    optA: "$\\pi$",
    optB: "$2\\pi$",
    optC: "$2\\sqrt{2}\\pi$",
    optD: "$4\\pi$",
    correct: Option.B,
    subject: Subject.MATH,
  },
  // 46th BCS 1/2 * 2^{x-3} (ID 54ace80a-c3bd-4b82-af9f-be1de77b185e)
  "54ace80a-c3bd-4b82-af9f-be1de77b185e": {
    stem: "$\\frac{1}{2} \\times 2^{x - 3} + 1 = 5$ হলে $x$ এর মান কত?",
    optA: "3",
    optB: "4",
    optC: "5",
    optD: "6",
    correct: Option.D,
    subject: Subject.MATH,
  },
  // 47th BCS x = sqrt(5) + sqrt(3) (ID c45ffce5-7823-4982-81eb-a663e1711bcc)
  "c45ffce5-7823-4982-81eb-a663e1711bcc": {
    stem: "যদি $x = \\sqrt{5} + \\sqrt{3}$ হয়, তবে $x^3 + \\frac{8}{x^3}$ এর মান কত?",
    optA: "$18\\sqrt{5}$",
    optB: "$22\\sqrt{5}$",
    optC: "$28\\sqrt{5}$",
    optD: "$32\\sqrt{5}$",
    correct: Option.C,
    subject: Subject.MATH,
  },
  // 47th BCS Ball probability (ID ab8e8b9a-94b5-492b-af1e-c99e59ecef58)
  "ab8e8b9a-94b5-492b-af1e-c99e59ecef58": {
    stem: "একটি ব্যাগে 2টি লাল, 3টি সবুজ এবং 2টি নীল বল আছে। যদি দৈবভাবে 2টি বল নেওয়া হয়, তাহলে বল দুটির কোনটিই নীল না হওয়ার সম্ভাবনা কত?",
    optA: "$\\frac{10}{21}$",
    optB: "$\\frac{11}{21}$",
    optC: "$\\frac{2}{7}$",
    optD: "$\\frac{5}{7}$",
    correct: Option.A,
    subject: Subject.MATH,
  },
  // 44th BCS 1 - 1 + 1 - 1 (ID 35960d2b-e60f-463e-acc6-95c7a0ceb56f)
  "35960d2b-e60f-463e-acc6-95c7a0ceb56f": {
    stem: "$1 - 1 + 1 - 1 + 1 - 1 + \\dots + n$ সংখ্যক পদের যোগফল হবে-",
    optA: "0",
    optB: "1",
    optC: "$[1 + (-1)^n]$",
    optD: "$\\frac{1}{2}[1 - (-1)^n]$",
    correct: Option.D,
    subject: Subject.MATH,
  },
  // 43rd BCS inequality (ID c1d89c57-d013-459d-a9f3-7bf004339fde)
  "c1d89c57-d013-459d-a9f3-7bf004339fde": {
    stem: "বাস্তব সংখ্যায় $\\frac{1}{3x-5} < \\frac{1}{3}$ অসমতাটির সমাধান কোনটি?",
    optA: "$-\\infty < x < \\frac{5}{3}$",
    optB: "$\\frac{8}{3} < x < \\infty$",
    optC: "$-\\infty < x < \\frac{5}{3}$ অথবা $\\frac{8}{3} < x < \\infty$",
    optD: "$-\\infty < x < \\frac{5}{3}$ এবং $\\frac{8}{3} < x < \\infty$",
    correct: Option.C,
    subject: Subject.MATH,
  },
  // 46th BCS log (ID f6a270f5-3a58-4f55-b9bd-ac41ad663501)
  "f6a270f5-3a58-4f55-b9bd-ac41ad663501": {
    stem: "$\\log_{\\sqrt{8}} x = 3\\frac{1}{3}$ হলে $x$ এর মান কত?",
    optA: "32",
    optB: "8",
    optC: "3",
    optD: "$\\sqrt{8}$",
    correct: Option.A,
    subject: Subject.MATH,
  },
  // 35th BCS mental ability 4 7 2 9
  "566ef57e-0569-402c-8819-df7f31544a35": {
    stem: "কোন সংখ্যাটি অন্যগুলো থেকে আলাদা? ৪ ৭ ২ ৯",
    optA: "৪",
    optB: "৭",
    optC: "২",
    optD: "৯",
    correct: Option.D,
    subject: Subject.MENTAL_ABILITY,
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
  console.log("ALIGNING DATABASE: RESTORING TRUE SUBJECTS, EXAM SESSIONS & MATH");
  console.log("==================================================================");

  // 1. Read authentic records from original CSV
  const origCsvPath = path.resolve(process.cwd(), "../app/.scratch/original_harvested_bcs.csv");
  const fullCsvPath = path.resolve(process.cwd(), "../app/.scratch/bcs_full_database.csv");

  const orig: any[] = parse(fs.readFileSync(origCsvPath, "utf-8"), {
    columns: true,
    trim: true,
  });
  console.log(`[1/5] Loaded ${orig.length} authentic records from original CSV.`);

  function norm(s: string): string {
    return (s || "")
      .replace(/[\s\u200b\u200c\ufeff\$\\\{\}\(\)\.\,\:\-\–\—\?\'\"।\_\^\/\[\]\<\>\+\=\*\&\#\@\!]+/g, "")
      .toLowerCase();
  }

  function getWords(s: string): string[] {
    return (s || "")
      .replace(/[\$\\\{\}\(\)\.\,\:\-\–\—\?\'\"।\_\^\/\[\]\<\>\+\=\*\&\#\@\!]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 2);
  }

  const origPrepared = orig.map((r, i) => ({
    i,
    r,
    normQt: norm(r.question_text),
    normA: norm(r.option_a),
    normB: norm(r.option_b),
    normC: norm(r.option_c),
    normD: norm(r.option_d),
    words: new Set(getWords(r.question_text)),
  }));

  // 2. Load all BANK questions from PostgreSQL
  console.log(`[2/5] Fetching all BANK questions from PostgreSQL...`);
  const dbQuestions = await prisma.question.findMany({
    where: { type: "BANK" },
    orderBy: { createdAt: "asc" },
  });
  console.log(`Fetched ${dbQuestions.length} BANK questions from DB.`);

  // 3. Match each DB question to authentic orig record
  console.log(`[3/5] Matching DB questions to authentic records...`);
  let matchedCount = 0;
  const updates: any[] = [];

  for (const q of dbQuestions) {
    // Check known override first
    const ov = KNOWN_QUESTION_OVERRIDES[q.id];

    let matchOrig: any = null;

    if (q.id === "5238dc58-9a58-4b29-bf00-43a21f195d79") {
      matchOrig = orig.find((r) => r.exam_session === "42nd BCS Preliminary" && r.question_text.includes("secA+tanA"));
    } else if (q.id === "720d032a-6a5c-4cff-b686-d6ab2ccce3fa") {
      matchOrig = orig.find((r) => r.exam_session === "34th BCS Preliminary" && r.question_text.includes("T,X"));
    } else {
      const qNormQt = norm(q.questionText);
      const qNormA = norm(q.optionA);
      const qNormB = norm(q.optionB);
      const qNormC = norm(q.optionC);
      const qNormD = norm(q.optionD);
      const qWords = getWords(q.questionText);

      // Strategy 1: normQt contained in orig.normQt
      let found = origPrepared.find((o) => qNormQt.length >= 6 && o.normQt.includes(qNormQt));

      // Strategy 2: orig.normQt contained in qNormQt
      if (!found) {
        found = origPrepared.find((o) => o.normQt.length >= 6 && qNormQt.includes(o.normQt));
      }

      // Strategy 3: 3 or 4 options match exactly
      if (!found) {
        found = origPrepared.find((o) => {
          let optCount = 0;
          if (o.normA && o.normA === qNormA) optCount++;
          if (o.normB && o.normB === qNormB) optCount++;
          if (o.normC && o.normC === qNormC) optCount++;
          if (o.normD && o.normD === qNormD) optCount++;
          if (optCount >= 3) {
            const hasWord = qWords.some((w) => o.words.has(w));
            return hasWord || optCount === 4;
          }
          return false;
        });
      }

      // Strategy 4: High word overlap (>= 3 words)
      if (!found) {
        let maxOverlap = 0;
        let bestO: any = null;
        for (const o of origPrepared) {
          let overlap = 0;
          for (const w of qWords) {
            if (o.words.has(w)) overlap++;
          }
          if (overlap >= 2 && overlap > maxOverlap) {
            const optMatch =
              (o.normA && o.normA === qNormA) ||
              (o.normB && o.normB === qNormB) ||
              (o.normC && o.normC === qNormC) ||
              (o.normD && o.normD === qNormD);
            if (optMatch || overlap >= 4) {
              maxOverlap = overlap;
              bestO = o;
            }
          }
        }
        found = bestO;
      }

      // Strategy 5: 2 options match (when options have length >= 3)
      if (!found) {
        found = origPrepared.find((o) => {
          let optCount = 0;
          if (qNormA.length >= 3 && o.normA === qNormA) optCount++;
          if (qNormB.length >= 3 && o.normB === qNormB) optCount++;
          if (qNormC.length >= 3 && o.normC === qNormC) optCount++;
          if (qNormD.length >= 3 && o.normD === qNormD) optCount++;
          return optCount >= 2;
        });
      }

      if (found) {
        matchOrig = found.r;
      }
    }

    if (matchOrig) matchedCount++;

    // Prepare clean fields
    let stem = ov?.stem ?? "";
    let optA = ov?.optA ?? "";
    let optB = ov?.optB ?? "";
    let optC = ov?.optC ?? "";
    let optD = ov?.optD ?? "";
    let correct = ov?.correct ?? (matchOrig?.correct_option as Option) ?? q.correctOption;
    let subject = ov?.subject ?? (matchOrig?.subject as Subject) ?? q.subject;
    let examSession = matchOrig?.exam_session ?? q.examSession;
    let topic = matchOrig?.topic || q.topic || null;
    let diff = (matchOrig?.difficulty as Difficulty) || q.difficulty || Difficulty.MEDIUM;
    let explanation = matchOrig?.explanation ? cleanMathAndICTText(matchOrig.explanation) : q.explanation;

    if (!stem) {
      const rawQt = matchOrig ? matchOrig.question_text : q.questionText;
      let rawA = matchOrig ? matchOrig.option_a : q.optionA;
      let rawB = matchOrig ? matchOrig.option_b : q.optionB;
      let rawC = matchOrig ? matchOrig.option_c : q.optionC;
      let rawD = matchOrig ? matchOrig.option_d : q.optionD;

      optA = recoverOptionWord(rawQt, rawA);
      optB = recoverOptionWord(rawQt, rawB);
      optC = recoverOptionWord(rawQt, rawC);
      optD = recoverOptionWord(rawQt, rawD);

      const cutIdx = findOptionCutIndex(rawQt, optA, optB, optC);
      stem = cutIdx > 5 ? rawQt.substring(0, cutIdx).trim() : rawQt.trim();

      const exp = (matchOrig?.explanation || "").trim();
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
    }

    // Reclassification if combination question
    if (stem.includes("^nC_8") || stem.includes("^{22}C_n") || stem.includes("22Cn")) {
      subject = Subject.MATH;
    }

    updates.push({
      id: q.id,
      subject,
      examSession,
      topic,
      questionText: stem,
      optionA: optA,
      optionB: optB,
      optionC: optC,
      optionD: optD,
      correctOption: correct,
      explanation,
      difficulty: diff,
    });
  }

  console.log(`Matched ${matchedCount} / ${dbQuestions.length} DB questions to authentic records.`);
  console.log(`[4/5] Updating ${updates.length} questions in PostgreSQL...`);

  let completed = 0;
  const startTime = Date.now();

  await asyncPool(10, updates, async (item) => {
    await prisma.question.update({
      where: { id: item.id },
      data: {
        subject: item.subject,
        examSession: item.examSession,
        topic: item.topic,
        questionText: item.questionText,
        optionA: item.optionA,
        optionB: item.optionB,
        optionC: item.optionC,
        optionD: item.optionD,
        correctOption: item.correctOption,
        explanation: item.explanation,
        difficulty: item.difficulty,
      },
    });
    completed++;
    if (completed % 1000 === 0 || completed === updates.length) {
      console.log(`Updated ${completed} / ${updates.length} questions in PostgreSQL.`);
    }
  });

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`PostgreSQL updates completed in ${durationSec}s.`);

  // 5. Synchronize bcs_full_database.csv
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

  console.log("\nSubject alignment and math formula cleaning complete!");
}

if (process.argv[1]?.endsWith("restoreTrueSubjectsAndMath.ts")) {
  main().catch(console.error).finally(() => process.exit(0));
}
