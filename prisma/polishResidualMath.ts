import fs from "fs";
import path from "path";
import { prisma } from "../src/app/lib/prisma";

export function deepCleanFormula(text: string): string {
  if (!text) return "";
  let s = text.replace(/[\u200b\u200c\ufeff]/g, "").trim();

  // Pattern: ২৩\mathrm{$\frac{২}{৩}$}৩২ -> $\frac{২}{৩}$
  s = s.replace(/[০-৯\d]*\s*\\mathrm\s*\{\s*(\$?\\frac\{[^{}]+\}\{[^{}]+\}\$?)\s*\}[০-৯\d]*/g, (_, f) => {
    const cleanF = f.replace(/\$/g, "");
    return `$${cleanF}$`;
  });

  // Pattern: ২০০2\mathrm{{$\sqrt{2}$}}২০০2 -> $200\sqrt{2}$ or $\sqrt{2}$
  s = s.replace(/([০-৯\d]*)\s*\\mathrm\s*\{\s*\{?\$?\\sqrt\{([^{}]+)\}\$?\}?\s*\}[০-৯\d]*/g, (_, p, inner) => {
    if (p) return `$${p}\\sqrt{${inner}}$`;
    return `$\\sqrt{${inner}}$`;
  });

  // Pattern: n+2{\mathrm{n +$\sqrt{2}$}}n+2 -> $n + \sqrt{2}$
  s = s.replace(/[^\s{}]*\{\s*\\mathrm\s*\{\s*([^{}]+)\s*\}\s*\}[^\s{}]*/g, (_, inner) => {
    let clean = inner.replace(/\$/g, "").trim();
    clean = clean.replace(/\\over/g, "/");
    return `$${clean}$`;
  });

  // Pattern: \mathrm{\Big({$\frac{১}{৩}$}\Big), \Big({$\frac{১}{৩}$}\Big)}
  s = s.replace(/\\mathrm\s*\{\s*\\Big\(\s*\{?\$?\\frac\{([^{}]+)\}\{([^{}]+)\}\$?\}?\s*\\Big\)\s*,\s*\\Big\(\s*\{?\$?\\frac\{([^{}]+)\}\{([^{}]+)\}\$?\}?\s*\\Big\)\s*\}/g,
    "$\\Big(\\frac{$1}{$2}\\Big), \\Big(\\frac{$3}{$4}\\Big)$"
  );

  // Pattern: [২−৩(২−৩)−১]−১\mathrm{{[২-৩(২-৩)^-{^১}]^-{^১}}}[২−৩(২−৩)−১]−১
  s = s.replace(/\[[০-৯\d\-\(\)]+\][০-৯\d\-]*\s*\\mathrm\s*\{\s*\{?(\[[^\]]+\]\^?\{?[^{}]*\}?)\}?\s*\}[^\s]*/g,
    "$$1$"
  );

  // Pattern: ৩৪a2\mathrm{{$\sqrt{৩}$\over ৪} a^2}৪৩a2 -> $\frac{\sqrt{৩}}{৪} a^2$
  s = s.replace(/[০-৯\d]*a\^?2?\s*\\mathrm\s*\{\s*\{?\$?\\sqrt\{([^{}]+)\}\$?\\over\s*([০-৯\d]+)\}?\s*a\^?2?\}?[০-৯\d]*a\^?2?/g,
    "$\\frac{\\sqrt{$1}}{$2} a^2$"
  );

  // Pattern: ১২a2\mathrm{\sqrt{{{১} \over ২}a^2}}২১a2 -> $\sqrt{\frac{১}{২} a^2}$
  s = s.replace(/[০-৯\d]*a\^?2?\s*\\mathrm\s*\{\s*\\sqrt\s*\{\s*\{?([^{}]+)\s*\\over\s*([^{}]+)\}?\s*a\^?2?\}\s*\}[০-৯\d]*a\^?2?/g,
    "$\\sqrt{\\frac{$1}{$2} a^2}$"
  );

  // Pattern: ৩৫০{১৩৫^{০}}১৩৫০ -> $১৩৫^\circ$
  s = s.replace(/([০-৯\d]+)০\s*\{([০-৯\d]+)\^?\{?([০∘0]+)\}?\}\s*\1০?/g, (_, d1, d2) => `$${d2}^\\circ$`);

  // Pattern: ০∘\mathrm{০^{\circ}}০∘ সেন্টিগ্রেড -> $০^\circ$
  s = s.replace(/([০-৯\d]+)[∘০]\s*\\mathrm\s*\{\s*([০-৯\d]+)\^?\{?\\circ\}?\s*\}\s*\1[∘০]?/g, (_, d1, d2) => `$${d2}^\\circ$`);

  // Pattern: ১৪\mathrm{{১}\over{৪}}৪১ -> $\frac{১}{৪}$
  s = s.replace(/[০-৯\d]*\s*\\mathrm\s*\{\s*\{?([০-৯\d]+)\}?\s*\\over\s*\{?([০-৯\d]+)\}?\s*\}\s*[০-৯\d]*/g, (_, n, d) => `$\\frac{${n}}{${d}}$`);

  // Pattern: ৩৬২৩%\mathrm{৩৬{$\frac{২}{৩}$}\%}৩৬৩২% -> $৩৬\frac{২}{৩}\%$
  s = s.replace(/[০-৯\d]+%?\s*\\mathrm\s*\{\s*([০-৯\d]+)\s*\{?\$?\\frac\{([^{}]+)\}\{([^{}]+)\}\$?\}?\\%?\s*\}\s*[০-৯\d]+%?/g, (_, w, n, d) => `$${w}\\frac{${n}}{${d}}\\%$`);
  s = s.replace(/[০-৯\d]+%?\s*\\mathrm\s*\{\s*\{?\$?\\frac\{([^{}]+)\}\{([^{}]+)\}\$?\}?\\%?\s*\}\s*[০-৯\d]+%?/g, (_, n, d) => `$\\frac{${n}}{${d}}\\%$`);

  // Pattern: 4x+41−x=4\mathrm{4^x+4^{1-x}=4 }4x+41−x=4 -> $4^x + 4^{1-x} = 4$
  s = s.replace(/([a-zA-Z0-9\+\-\=\>\<\^\.\,]+)\s*\\mathrm\s*\{\s*([^{}]+)\s*\}\s*\1/g, (_, r, m) => {
    let clean = m.trim().replace(/\$/g, "");
    return `$${clean}$`;
  });

  // Pattern: b=g5\mathrm{b = {g\over5}}b=5g -> $b = \frac{g}{5}$
  s = s.replace(/[a-zA-Z0-9\=]+\s*\\mathrm\s*\{\s*([a-zA-Z]+)\s*=\s*\{?([a-zA-Z0-9]+)\\over([a-zA-Z0-9]+)\}?\s*\}\s*[a-zA-Z0-9\=]+/g,
    (_, v, n, d) => `$${v} = \\frac{${n}}{${d}}$`
  );

  // Pattern: n2−1{\mathrm{n\over$\sqrt{2}$-1}}2−1n -> $\frac{n}{\sqrt{2} - 1}$
  s = s.replace(/[^\s]*\{\s*\\mathrm\s*\{\s*([a-zA-Z0-9]+)\s*\\over\s*\$?([^\$}]+)\$?\s*\}\s*\}[^\s]*/g,
    (_, n, d) => `$\\frac{${n}}{${d.replace(/\$/g, "")}}$`
  );

  // Pattern: 2log2⁡3+log2⁡5\mathrm{2^{log_{2⁡}3+log_2⁡5}} -> $2^{\log_2 3 + \log_2 5}$
  s = s.replace(/2log2[^\\]*\\mathrm\s*\{\s*2\^\{[^}]+\}\s*\}[^\s]*/g, "$2^{\\log_2 3 + \\log_2 5}$");

  // Pattern: am.an=am+n\mathrm {a^m.a^n=a^{m+n}} -> $a^m \\cdot a^n = a^{m+n}$
  s = s.replace(/am\.an=am\+n\s*\\mathrm\s*\{\s*a\^m\.a\^n=a\^\{m\+n\}\s*\}[^\s]*/g, "$a^m \\cdot a^n = a^{m+n}$");

  // Pattern: (2+x)+3=3(x+2){\mathrm...}
  s = s.replace(/\(2\+x\)\+3=3\(x\+2\)\s*\{\s*\\mathrm[^\}]+\}\s*\(2\+x\)\+3=3\(x\+2\)/g, "$(2 + x) + 3 = 3(x + 2)");

  // Pattern: x2+y2=185\mathrm{x^{2}+ \mathrm {y^{2}}}=185 -> $x^2 + y^2 = 185$
  s = s.replace(/x2\+y2=185[^\$]*x2\+y2=185/g, "$x^2 + y^2 = 185$");

  // Pattern: ১১N\mathrm{$\sqrt{১১}$N}১১N -> $\sqrt{১১}N$
  s = s.replace(/[০-৯\d]+N\s*\\mathrm\s*\{\s*\$?(\\sqrt\{[^{}]+\})\$?N\s*\}\s*[০-৯\d]+N/g, (_, r) => `$${r}N$`);

  // General \mathrm cleanup
  s = s.replace(/\\mathrm\s*\{([^{}]+)\}/g, (m, inner) => {
    let clean = inner.replace(/\$/g, "").trim();
    if (clean.includes("\\frac") || clean.includes("\\sqrt") || clean.includes("^") || clean.includes("_") || clean.includes("=")) {
      return `$${clean}$`;
    }
    return clean;
  });

  s = s.replace(/\\mathrm\s+([a-zA-Z0-9০-৯]+)/g, "$1");

  // Clean double dollars or empty dollars
  s = s.replace(/\${2,}/g, "$");
  s = s.replace(/\$\s*\$/g, "");

  // Clean stray dollar after question
  s = s.replace(/\$\s*(\$)/g, "$1");

  return s.trim();
}

async function polish() {
  console.log("Deep cleaning remaining LaTeX markup in database...");
  const questions = await prisma.question.findMany({
    where: { type: "BANK" },
  });

  let changedCount = 0;
  const updates: any[] = [];

  for (const q of questions) {
    const newQt = deepCleanFormula(q.questionText);
    const newA = deepCleanFormula(q.optionA);
    const newB = deepCleanFormula(q.optionB);
    const newC = deepCleanFormula(q.optionC);
    const newD = deepCleanFormula(q.optionD);
    const newExp = q.explanation ? deepCleanFormula(q.explanation) : null;

    if (
      newQt !== q.questionText ||
      newA !== q.optionA ||
      newB !== q.optionB ||
      newC !== q.optionC ||
      newD !== q.optionD ||
      newExp !== q.explanation
    ) {
      changedCount++;
      updates.push({
        id: q.id,
        questionText: newQt,
        optionA: newA,
        optionB: newB,
        optionC: newC,
        optionD: newD,
        explanation: newExp,
      });
    }
  }

  console.log(`Identified ${changedCount} questions with residual markup to polish.`);

  let done = 0;
  for (const u of updates) {
    await prisma.question.update({
      where: { id: u.id },
      data: {
        questionText: u.questionText,
        optionA: u.optionA,
        optionB: u.optionB,
        optionC: u.optionC,
        optionD: u.optionD,
        explanation: u.explanation,
      },
    });
    done++;
    if (done % 50 === 0 || done === updates.length) {
      console.log(`Polished ${done} / ${updates.length}...`);
    }
  }

  console.log("Deep cleaning complete!");
}

polish().catch(console.error).finally(() => process.exit(0));
