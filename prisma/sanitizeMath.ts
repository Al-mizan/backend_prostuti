import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { prisma } from "../src/app/lib/prisma";
import { QuestionType } from "../src/generated/prisma/enums";

function escapeCsvValue(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n") || val.includes("\r")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export function cleanMathText(text: string): string {
  if (!text) return text;

  let s = text.replace(/[\u200b\u200c\ufeff]/g, "").trim();

  // 1. Arrows
  s = s.replace(/→\s*\\rightarrow\s*→/g, "→");
  s = s.replace(/\\rightarrow/g, "→");

  // 2. Specific known triplications
  // O(n2)O(n^2)O(n2)
  s = s.replace(/O\(n2\)\s*O\(n\^2\)\s*O\(n2\)/g, "$O(n^2)$");
  // nC8=nC12^nC_8 = ^nC_{12}nC8=nC12
  s = s.replace(/nC8\s*=\s*nC12\s*\^nC_8\s*=\s*\^nC_\{12\}\s*nC8\s*=\s*nC12/g, "$^nC_8 = ^nC_{12}$");
  // 22Cn^{22}C_n22Cn
  s = s.replace(/22Cn\s*\^\{22\}C_n\s*22Cn/g, "$^{22}C_n$");
  // x=5+3x = \sqrt{5} + \sqrt{3}x=5+3
  s = s.replace(/x\s*=\s*5\s*\+\s*3\s*x\s*=\s*\\sqrt\{5\}\s*\+\s*\\sqrt\{3\}\s*x\s*=\s*5\s*\+\s*3/g, "$x = \\sqrt{5} + \\sqrt{3}$");
  // x3+8x3x^3 + \frac{8}{x^3}x3+x38
  s = s.replace(/x3\s*\+\s*8x3\s*x\^3\s*\+\s*\\frac\{8\}\{x\^3\}\s*x3\s*\+\s*x38/g, "$x^3 + \\frac{8}{x^3}$");
  // |x−5x - 5x−5| < 2,x∈INx \in INx∈IN
  s = s.replace(/\|x[−\-]5x\s*-\s*5x[−\-]5\|\s*<\s*2\s*,\s*x∈IN\s*x\s*\\in\s*IN\s*x∈IN/g, "$|x - 5| < 2, x \\in \\mathbb{N}$");
  // logx324=4\log_x 324 = 4logx=4
  s = s.replace(/log[⁡x]*324\s*=\s*4\s*\\log_x\s*324\s*=\s*4\s*logx[⁡\s]*=\s*4/g, "$\\log_x 324 = 4$");
  s = s.replace(/xxxএর/g, "$x$ এর");
  // x2−7x+12≤0x^{2} - 7 x + 12 \leq 0x2−7x+12≤0
  s = s.replace(/x2[−\-]7x\+12≤0\s*x\^\{2\}\s*-\s*7\s*x\s*\+\s*12\s*\\leq\s*0\s*x2[−\-]7x\+12≤0/g, "$x^2 - 7x + 12 \\le 0$");
  // 238U^{238} U238U
  s = s.replace(/238U\s*\^\{238\}\s*U\s*238U/g, "$^{238}U$");
  // 6x2−7x−4=06x^2-7x-4=06x2−7x−4=0
  s = s.replace(/6x2[−\-]7x[−\-]4=0\s*6x\^2-7x-4=0\s*6x2[−\-]7x[−\-]4=0/g, "$6x^2 - 7x - 4 = 0$");
  // 0.6˙0.\dot{6}0.6˙
  s = s.replace(/0\.6˙\s*0\.\\dot\{6\}\s*0\.6˙/g, "$0.\\dot{6}$");
  s = s.replace(/0\.9˙\s*0\.\\dot\{9\}\s*0\.9˙/g, "$0.\\dot{9}$");
  s = s.replace(/0\.2˙3˙\s*0\.\\dot\{2\}\\dot\{3\}\s*0\.2˙3˙/g, "$0.\\dot{2}\\dot{3}$");
  s = s.replace(/0\.3˙\s*0\.\\dot\{3\}\s*0\.3˙/g, "$0.\\dot{3}$");

  // Sets
  // A={x∈IN:2<x≤6}A = \{x \in IN : 2 < x \le 6\}A={x∈IN:2<x≤6}
  s = s.replace(/A=\{x∈IN:2<x≤6\}\s*A\s*=\s*\\\{x\s*\\in\s*IN\s*:\s*2\s*<\s*x\s*\\le\s*6\\\}\s*A=\{x∈IN:2<x≤6\}/g, "$A = \\{x \\in \\mathbb{N} : 2 < x \\le 6\\}$");
  s = s.replace(/B=\{x∈IN:xB\s*=\s*\\\{x\s*\\in\s*IN\s*:\s*xB=\{x∈IN:xজোর\s*সংখ্যাx≤8\}\s*x\s*\\le\s*8\\\}\s*x≤8\}/g, "$B = \\{x \\in \\mathbb{N} : x \\text{ জোড় সংখ্যা}, x \\le 8\\}$");
  s = s.replace(/A∩B\s*A\s*\\cap\s*B\s*A∩B/g, "$A \\cap B$");

  // Options cleaning:
  // Numbers + \frac{num}{den} + numbers -> $\frac{num}{den}$
  s = s.replace(/\b\d+\s*\\frac\{(\d+)\}\{(\d+)\}\s*\d+\b/g, "$\\frac{$1}{$2}$");
  // Simple fraction without garbled numbers
  s = s.replace(/^\\frac\{(\d+)\}\{(\d+)\}$/g, "$\\frac{$1}{$2}$");
  // Radical: 185 18\sqrt{5} 185 -> $18\sqrt{5}$
  s = s.replace(/\b\d+\s*(\d*\s*\\sqrt\{[^{}]+\})\s*\d+\b/g, "$$1$");
  // Radical with space: 32 3\sqrt{2} 32 -> $3\sqrt{2}$
  s = s.replace(/\b\d+\s*(\d*\s*\\sqrt\{[^{}]+\})\b/g, "$$1$");
  // 2 \sqrt{2} 2 -> $2\sqrt{2}$
  s = s.replace(/\b(\d*\s*\\sqrt\{[^{}]+\})\s*\d+\b/g, "$$1$");

  // Pi in options: π \pi π -> $\pi$, 2π 2\pi 2π -> $2\pi$
  s = s.replace(/(?:[0-9]*π\s+)+([0-9]*\s*\\pi)(?:\s+[0-9]*π)?/g, "$$1$");
  s = s.replace(/\b(\d*\\sqrt\{\d+\}\\pi)\b/g, "$$1$");
  s = s.replace(/22π\s*2\\sqrt\{2\}\\pi\s*22π/g, "$2\\sqrt{2}\\pi$");

  // Chemical formulas in options:
  // জলীয় বাষ্প (H2O) \left(\right. H_{2} O \left.\right) (H2O)
  s = s.replace(/\(H2O\)\s*\\left\(\\right\.\s*H_\{2\}\s*O\s*\\left\.\\right\)\s*\(H2O\)/g, "($H_2O$)");
  s = s.replace(/\(CO2\)\s*\\left\(C\s*O_\{2\}\\right\)\s*\(CO2\)/g, "($CO_2$)");
  s = s.replace(/\(CH4\)\s*\\left\(\\right\.\s*C\s*H_\{4\}\s*\\left\.\\right\)\s*\(CH4\)/g, "($CH_4$)");
  s = s.replace(/([A-Za-z]+)\s*\\left\(\\right\.\s*([A-Za-z0-9_\{\}\s]+)\s*\\left\.\\right\)\s*([A-Za-z0-9]+)/g, "$$2$");

  // Intervals:
  // [3,4] \left[3 , 4\right] [3,4]
  s = s.replace(/\[3,4\]\s*\\left\[3\s*,\s*4\\right\]\s*\[3,4\]/g, "[3, 4]");
  s = s.replace(/\(–?−?∞,3\)\s*\\left\(\\right\.\s*-\s*\\infty\s*,\s*3\s*\\left\.\\right\)\s*\(–?−?∞,3\)/g, "$(-\\infty, 3)$");
  s = s.replace(/\[4,∞\)\s*\\left\[\\right\.\s*4\s*,\s*\\infty\s*\\left\.\\right\)\s*\[4,∞\)/g, "$[4, \\infty)$");

  return s.trim();
}

async function main() {
  console.log("=================================================");
  console.log("TICKET-FUNC-010: Math & LaTeX Database Sanitization");
  console.log("=================================================");

  const questions = await prisma.question.findMany({
    where: { type: QuestionType.BANK },
  });
  console.log(`Analyzing ${questions.length} questions for math/latex formatting...`);

  let dbUpdates = 0;
  for (const q of questions) {
    const cleanQ = cleanMathText(q.questionText);
    const cleanA = cleanMathText(q.optionA);
    const cleanB = cleanMathText(q.optionB);
    const cleanC = cleanMathText(q.optionC);
    const cleanD = cleanMathText(q.optionD);

    if (
      cleanQ !== q.questionText ||
      cleanA !== q.optionA ||
      cleanB !== q.optionB ||
      cleanC !== q.optionC ||
      cleanD !== q.optionD
    ) {
      await prisma.question.update({
        where: { id: q.id },
        data: {
          questionText: cleanQ,
          optionA: cleanA,
          optionB: cleanB,
          optionC: cleanC,
          optionD: cleanD,
        },
      });
      dbUpdates++;
    }
  }

  console.log(`Updated ${dbUpdates} math questions/options in PostgreSQL.`);

  // Synchronize CSV
  const csvPath = path.resolve(process.cwd(), "../app/.scratch/bcs_full_database.csv");
  if (fs.existsSync(csvPath)) {
    const csvContent = fs.readFileSync(csvPath, "utf-8");
    const records: Record<string, string>[] = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
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

    let csvUpdated = 0;
    for (const r of records) {
      const q = cleanMathText(r.question_text);
      const a = cleanMathText(r.option_a);
      const b = cleanMathText(r.option_b);
      const c = cleanMathText(r.option_c);
      const d = cleanMathText(r.option_d);

      if (
        q !== r.question_text ||
        a !== r.option_a ||
        b !== r.option_b ||
        c !== r.option_c ||
        d !== r.option_d
      ) {
        r.question_text = q;
        r.option_a = a;
        r.option_b = b;
        r.option_c = c;
        r.option_d = d;
        csvUpdated++;
      }
    }

    const headerLine = columns.join(",");
    const dataLines = records.map((r) =>
      columns.map((c) => escapeCsvValue(r[c] ?? "")).join(",")
    );
    fs.writeFileSync(csvPath, [headerLine, ...dataLines].join("\n") + "\n", "utf-8");
    console.log(`Synchronized ${csvUpdated} records in ${csvPath}.`);
  }

  console.log("SUCCESS: Math formulas sanitized!");
}

main()
  .catch((err) => {
    console.error("Error sanitizing math:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
