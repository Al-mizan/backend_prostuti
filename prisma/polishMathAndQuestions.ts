import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { prisma } from "../src/app/lib/prisma";

export function cleanSpecificMathAndQuestions(text: string): string {
  if (!text) return text;
  let s = text.trim();

  // Clean variable triplications like b{\mathrm b}b or b{\mathrm{b}}b -> $b$
  s = s.replace(/([a-zA-Z])\{\\mathrm\s*\{?([a-zA-Z])\}?\}\1/g, "$$$1$");
  s = s.replace(/([a-zA-Z])\\mathrm\{([a-zA-Z])\}\1/g, "$$$1$");

  // Clean π triplications: e.g. 8π \pi π -> $8\pi$
  s = s.replace(/(\d+)\s*π\s*\\pi\s*π/g, "$$$1\\pi$");
  s = s.replace(/(\d+)\s*π\s*\\pi/g, "$$$1\\pi$");
  s = s.replace(/22\s*π\s*2\s*\\sqrt\{2\}\s*\\pi\s*22\s*π/g, "$2\\sqrt{2}\\pi$");

  // Clean a2+b2-c2 ... \frac{...}{...} ... =?
  if (s.includes("\\frac{a^{2} + b^{2} - c^{2} + 2 a b}{a^{2} - b^{2} + c^{2} + 2 a c}")) {
    s = "$\\frac{a^2 + b^2 - c^2 + 2ab}{a^2 - b^2 + c^2 + 2ac} = ?$";
  }

  // Clean option fractions with triplications:
  // e.g. +b−ca−b+c \frac{a + b - c}{a - b + c} a−b+ca+b−c -> $\frac{a + b - c}{a - b + c}$
  const optFracMatch = s.match(/\\frac\{([^{}]+)\}\{([^{}]+)\}/);
  if (optFracMatch && (s.includes("+") || s.includes("−") || s.includes("-"))) {
    if (s.length > optFracMatch[0].length + 5) {
      s = `$\\frac{${optFracMatch[1].trim()}}{${optFracMatch[2].trim()}}$`;
    }
  }

  // Clean options like =g\mathrm{b = g}b=g -> $b = g$
  s = s.replace(/^=g\\mathrm\{b\s*=\s*g\}b=g$/, "$b = g$");
  s = s.replace(/^=g5\\mathrm\{b\s*=\s*\{g\\over5\}\}b=5g$/, "$b = \\frac{g}{5}$");
  s = s.replace(/^=g[−\-]4\\mathrm\{b\s*=\s*g[−\-]4\}b=g[−\-]4$/, "$b = g - 4$");
  s = s.replace(/^=g[−\-]5\\mathrm\{b\s*=\s*g[−\-]5\}b=g[−\-]5$/, "$b = g - 5$");

  // Fix "+b+c" option
  if (s === "+b+c") s = "$\\frac{a + b + c}{a - b + c}$";

  // Clean repeated question ending in 4 se.mi...
  if (s.startsWith("4 সেমি বাহুবিশিষ্ট বর্গক্ষেত্রে পরিলিখিত বৃত্তের ক্ষেত্রফল কত?")) {
    s = "৪ সেমি বাহুবিশিষ্ট বর্গক্ষেত্রে পরিলিখিত বৃত্তের ক্ষেত্রফল কত?";
  }

  // Ensure fill-in-the-blank questions end with appropriate punctuation "-"
  const fillInTheBlankEndings = [
    "ছদ্মনাম হলো",
    "ফারমেন্টেশন প্রক্রিয়ায় উৎপন্ন হয়",
    "প্রথম প্রকাশিত হয়",
    "তাকে বলা হয়",
    "গঠিত হয়েছিল",
    "কার্যক্রম স্থাপিত হয়",
    "সমুদ্র সৈকত",
    "চাষ আরম্ভ হয়",
    "সম্মেলন অনুষ্ঠিত হয়েছিল",
    "দেশে আনা হয়েছিল",
    "বলা যায়",
    "উল্লেখযোগ্য হলো",
    "প্রস্তাব করেন",
    "উপাদান হলো",
    "চিহ্নিত করা হয়",
    "প্রবর্তন করেন",
    "বসবাস করে",
    "স্থানান্তর করা হয়",
    "উদ্বোধন করা হয়",
  ];

  for (const ending of fillInTheBlankEndings) {
    if (s.endsWith(ending)) {
      s = s + "-";
      break;
    }
  }

  // Questions ending with interrogative words without "?"
  if (s.endsWith("কোনটি") || s.endsWith("কার") || s.endsWith("কী") || s.endsWith("কোথায়") || s.endsWith("কত") || s.endsWith("কে")) {
    s = s + "?";
  }

  return s;
}

async function main() {
  console.log("=== Polishing remaining math and question stems ===");
  const questions = await prisma.question.findMany({
    where: { type: "BANK" },
  });

  let updated = 0;
  for (const q of questions) {
    const newQt = cleanSpecificMathAndQuestions(q.questionText);
    const newA = cleanSpecificMathAndQuestions(q.optionA);
    const newB = cleanSpecificMathAndQuestions(q.optionB);
    const newC = cleanSpecificMathAndQuestions(q.optionC);
    const newD = cleanSpecificMathAndQuestions(q.optionD);

    if (
      newQt !== q.questionText ||
      newA !== q.optionA ||
      newB !== q.optionB ||
      newC !== q.optionC ||
      newD !== q.optionD
    ) {
      await prisma.question.update({
        where: { id: q.id },
        data: {
          questionText: newQt,
          optionA: newA,
          optionB: newB,
          optionC: newC,
          optionD: newD,
        },
      });
      updated++;
    }
  }

  console.log(`Polished ${updated} questions in PostgreSQL.`);

  // Also sync bcs_full_database.csv
  const csvPath = path.resolve(process.cwd(), "../app/.scratch/bcs_full_database.csv");
  if (fs.existsSync(csvPath)) {
    const csvContent = fs.readFileSync(csvPath, "utf-8");
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });

    for (const r of records) {
      r.question_text = cleanSpecificMathAndQuestions(r.question_text);
      r.option_a = cleanSpecificMathAndQuestions(r.option_a);
      r.option_b = cleanSpecificMathAndQuestions(r.option_b);
      r.option_c = cleanSpecificMathAndQuestions(r.option_c);
      r.option_d = cleanSpecificMathAndQuestions(r.option_d);
    }

    const columns = Object.keys(records[0]);
    function escapeCsv(val: any) {
      const s = String(val ?? "");
      if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    }
    const header = columns.join(",");
    const lines = records.map((r: any) => columns.map((c: any) => escapeCsv(r[c])).join(","));
    fs.writeFileSync(csvPath, [header, ...lines].join("\n") + "\n", "utf-8");
    console.log(`Synchronized polish to CSV.`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
