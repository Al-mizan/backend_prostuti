import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { prisma } from "../src/app/lib/prisma";
import { QuestionType } from "../src/generated/prisma/enums";

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeCsvValue(val: string | null | undefined): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (
    str.includes(",") ||
    str.includes('"') ||
    str.includes("\n") ||
    str.includes("\r")
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Map of possible stripped prefixes
const POSSIBLE_PREFIXES = ["ক", "খ", "গ", "ঘ", "A", "B", "C", "D", "a", "b", "c", "d"];

export function recoverOptionWord(rawQt: string, opt: string): string {
  if (!opt || opt.trim().length === 0) return opt;
  const trimmed = opt.trim();

  // If option is already intact or starts with punctuation, return
  for (const p of POSSIBLE_PREFIXES) {
    const candidate = p + trimmed;
    // Check if candidate appears as a distinct word or substring in the original question text
    if (rawQt.includes(candidate)) {
      return candidate;
    }
    // Also check with space (e.g. "B Lymphocyte" when opt was "Lymphocyte")
    const candidateWithSpace = p + " " + trimmed;
    if (rawQt.includes(candidateWithSpace)) {
      return candidateWithSpace;
    }
  }

  // Targeted manual recoveries for words with known stripped characters:
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
    "+b+c": "a+b+c",
    "+b−ca−b+c": "\\frac{a + b - c}{a - b + c}",
    "−b+ca+b−c": "\\frac{a - b + c}{a + b - c}",
    "+b−ca+b+c": "\\frac{a + b - c}{a + b + c}",
  };

  if (MANUAL_OPT_MAP[trimmed]) {
    return MANUAL_OPT_MAP[trimmed];
  }

  return trimmed;
}

export function cleanStemPunctuation(stem: string): string {
  let s = stem.trim();
  // Strip trailing markers like " ক", " ক.", " a", " a."
  s = s.replace(/(?:[\s\-:–—−ঃ]+)(?:\([ক-ঘa-dA-D]\)|[ক-ঘa-dA-D][\.\)]?)$/, "");
  s = s.trim();
  return s;
}

export function extractAuthenticStem(
  rawQt: string,
  optA: string,
  optB: string,
  optC: string,
  optD: string,
  explanation: string
): string {
  let text = rawQt.trim();

  // If explanation is present at the end of rawQt, slice it off safely
  // ONLY slice if explanation starts after the options
  const exp = (explanation || "").trim();
  if (exp && exp.length > 5) {
    const expIdx = text.lastIndexOf(exp);
    if (expIdx > 15) {
      text = text.substring(0, expIdx).trim();
    }
  }

  // Find where option A begins in text
  // Option A followed by Option B
  let cutIdx = -1;
  if (optA && optB) {
    let pos = 0;
    while (true) {
      const idx = text.indexOf(optA, pos);
      if (idx === -1) break;
      if (idx >= 3) {
        // Look ahead for optB
        const after = text.slice(idx + optA.length, idx + optA.length + optB.length + 80);
        if (after.includes(optB)) {
          cutIdx = idx;
          break;
        }
      }
      pos = idx + 1;
    }
  }

  // If not found, check optA followed by optC or optD
  if (cutIdx === -1 && optA) {
    let pos = 0;
    while (true) {
      const idx = text.indexOf(optA, pos);
      if (idx === -1) break;
      if (idx >= 3) {
        const after = text.slice(idx + optA.length, idx + optA.length + 100);
        if ((optC && after.includes(optC)) || (optD && after.includes(optD))) {
          cutIdx = idx;
          break;
        }
      }
      pos = idx + 1;
    }
  }

  // If still not found, check optB followed by optC
  if (cutIdx === -1 && optB && optC) {
    let pos = 0;
    while (true) {
      const idx = text.indexOf(optB, pos);
      if (idx === -1) break;
      if (idx >= 3) {
        const after = text.slice(idx + optB.length, idx + optB.length + optC.length + 80);
        if (after.includes(optC)) {
          cutIdx = idx;
          break;
        }
      }
      pos = idx + 1;
    }
  }

  if (cutIdx > 3) {
    return cleanStemPunctuation(text.substring(0, cutIdx));
  }

  return cleanStemPunctuation(text);
}

// Math and LaTeX sanitizer function
export function cleanMathFormulas(text: string): string {
  if (!text) return text;
  let s = text.replace(/[\u200b\u200c\ufeff]/g, "").trim();

  // 1. Arrows
  s = s.replace(/→\s*\\rightarrow\s*→/g, "→");
  s = s.replace(/\\rightarrow/g, "→");

  // 2. Triplicated KaTeX formulas in stem or options
  s = s.replace(/O\(n2\)\s*O\(n\^2\)\s*O\(n2\)/g, "$O(n^2)$");
  s = s.replace(/nC8\s*=\s*nC12\s*\^nC_8\s*=\s*\^nC_\{12\}\s*nC8\s*=\s*nC12/g, "$^nC_8 = ^nC_{12}$");
  s = s.replace(/22Cn\s*\^\{22\}C_n\s*22Cn/g, "$^{22}C_n$");
  s = s.replace(/x\s*=\s*5\s*\+\s*3\s*x\s*=\s*\\sqrt\{5\}\s*\+\s*\\sqrt\{3\}\s*x\s*=\s*5\s*\+\s*3/g, "$x = \\sqrt{5} + \\sqrt{3}$");
  s = s.replace(/x3\s*\+\s*8x3\s*x\^3\s*\+\s*\\frac\{8\}\{x\^3\}\s*x3\s*\+\s*x38/g, "$x^3 + \\frac{8}{x^3}$");
  s = s.replace(/\|x[−\-]5x\s*-\s*5x[−\-]5\|\s*<\s*2\s*,\s*x∈IN\s*x\s*\\in\s*IN\s*x∈IN/g, "$|x - 5| < 2, x \\in \\mathbb{N}$");
  s = s.replace(/log[⁡x]*324\s*=\s*4\s*\\log_x\s*324\s*=\s*4\s*logx[⁡\s]*=\s*4/g, "$\\log_x 324 = 4$");
  s = s.replace(/x2[−\-]7x\+12≤0\s*x\^\{2\}\s*-\s*7\s*x\s*\+\s*12\s*\\leq\s*0\s*x2[−\-]7x\+12≤0/g, "$x^2 - 7x + 12 \\le 0$");
  s = s.replace(/6x2[−\-]7x[−\-]4=0\s*6x\^2-7x-4=0\s*6x2[−\-]7x[−\-]4=0/g, "$6x^2 - 7x - 4 = 0$");
  s = s.replace(/238U\s*\^\{238\}\s*U\s*238U/g, "$^{238}U$");

  // Recurring decimals
  s = s.replace(/0\.6˙\s*0\.\\dot\{6\}\s*0\.6˙/g, "$0.\\dot{6}$");
  s = s.replace(/0\.9˙\s*0\.\\dot\{9\}\s*0\.9˙/g, "$0.\\dot{9}$");
  s = s.replace(/0\.2˙3˙\s*0\.\\dot\{2\}\\dot\{3\}\s*0\.2˙3˙/g, "$0.\\dot{2}\\dot{3}$");
  s = s.replace(/0\.3˙\s*0\.\\dot\{3\}\s*0\.3˙/g, "$0.\\dot{3}$");

  // Scraped KaTeX fractions in question texts or options:
  // e.g. a2+b2−c2... \frac{...}{...} ... =?
  const fracPattern = /[a-zA-Z0-9\+\−\-\s]{3,}(\\frac\{[^{}]+\}\{[^{}]+\})[a-zA-Z0-9\+\−\-\s]{3,}/g;
  s = s.replace(fracPattern, "$$1$");

  // Underscore underline artifacts in English questions
  // e.g. Reading‾isanexcellenthabit.Here,Theunderlinedwordisa−\underline {\mathrm {Reading}}...
  if (s.includes("\\underline") && s.includes("Reading")) {
    s = "‘Reading’ is an excellent habit. Here, the underlined word is a/an";
  }
  if (s.includes("\\underline") && s.includes("herd")) {
    s = "‘A herd of cattle is passing.’ Here ‘herd’ is a/an";
  }

  // Fraction options cleaning
  // 5115\over11115 -> $\frac{5}{11}$
  s = s.replace(/(\d+)\s*\\over\s*(\d+)/g, "\\frac{$1}{$2}");
  // Bengali fraction: ২৫৪৯\mathrm{২৫ \over ৪৯}৪৯২৫ -> $\frac{২৫}{৪৯}$
  s = s.replace(/[০-৯\d]+\s*\\mathrm\{([০-৯\d]+)\s*\\over\s*([০-৯\d]+)\}[০-৯\d]+/g, "$\\frac{$1}{$2}$");
  // Mixed fraction: ৭১২\mathrm{৭ {১\over ২}}৭২১ -> $৭\\frac{১}{২}$
  s = s.replace(/[০-৯\d]+\\mathrm\{([০-৯\d]+)\s*\{([০-৯\d]+)\\over\s*([০-৯\d]+)\}\}[০-৯\d]+/g, "$$1\\frac{$2}{$3}$");
  // Percentage with fraction: ১২১২%\mathrm{১২ {১ \over ২}\%}... -> $১২\frac{১}{২}\%$
  s = s.replace(/[০-৯\d]+%?\\mathrm\{([০-৯\d]+)\s*\{([০-৯\d]+)\s*\\over\s*([০-৯\d]+)\}\\%?\}[০-৯\d]+%?/g, "$$1\\frac{$2}{$3}\\%$");

  // Clean radical triplications in options:
  // ২১৩২১\sqrt ৩২১৩ বর্গ সে.মি. -> $২১\sqrt{৩}\text{ বর্গ সে.মি.}$
  s = s.replace(/([০-৯\d]+)\s*\\sqrt\s*([০-৯\d]+)[০-৯\d]*\s*বর্গ\s*সে\.মি\./g, "$$1\\sqrt{$2}\\text{ বর্গ সে.মি.}$");
  // Clean English radicals: 185 18\sqrt{5} 185 -> $18\sqrt{5}$
  s = s.replace(/\d+\s*(\d+\\sqrt\{[^{}]+\})\s*\d+/g, "$$1$");

  // Chemical formulas
  s = s.replace(/\(H2O\)\s*\\left\(\\right\.\s*H_\{2\}\s*O\s*\\left\.\\right\)\s*\(H2O\)/g, "($H_2O$)");
  s = s.replace(/\(CO2\)\s*\\left\(C\s*O_\{2\}\\right\)\s*\(CO2\)/g, "($CO_2$)");
  s = s.replace(/\(CH4\)\s*\\left\(\\right\.\s*C\s*H_\{4\}\s*\\left\.\\right\)\s*\(CH4\)/g, "($CH_4$)");
  s = s.replace(/\(N2O\)/g, "($N_2O$)");

  // Octal/Binary subscript KaTeX: ((111 101))2 \left(\left(\right. 111 101... -> $(111101)_2$
  s = s.replace(/\(\(([01\s]+)\)\)2[^\$]*/g, "($1)_2");

  return s.trim();
}

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

export async function runFullRestorationAndSanitization() {
  console.log("==================================================================");
  console.log("EXECUTION: Full Authentic Question & Math Database Restoration");
  console.log("==================================================================");

  const archiveCsvPath = path.resolve(process.cwd(), "../app/original_harvested_bcs.csv");
  if (!fs.existsSync(archiveCsvPath)) {
    throw new Error(`Archive CSV not found at: ${archiveCsvPath}`);
  }

  const archiveContent = fs.readFileSync(archiveCsvPath, "utf-8");
  const archiveRecords: Record<string, string>[] = parse(archiveContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });

  console.log(`[1/5] Loaded ${archiveRecords.length} authentic records from git archive.`);

  // Load existing questions from DB
  const dbQuestions = await prisma.question.findMany({
    where: { type: QuestionType.BANK },
    select: {
      id: true,
      examSession: true,
      subject: true,
      questionText: true,
      optionA: true,
      optionB: true,
      optionC: true,
      optionD: true,
      explanation: true,
      correctOption: true,
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`[2/5] Loaded ${dbQuestions.length} BANK questions from PostgreSQL.`);

  // Build map or match by examSession + index / text
  const updates: Array<{
    id: string;
    questionText: string;
    optionA: string;
    optionB: string;
    optionC: string;
    optionD: string;
    explanation?: string | null;
  }> = [];

  const cleanRecordsForCsv: any[] = [];

  // Manual known full stems for questions that had complex structures:
  const KNOWN_EXPLICIT_STEMS: Record<string, string> = {
    "৫জন ব্যক্তি গোল হয়ে বসে আছে":
      "পাঁচজন ব্যক্তি গোল হয়ে বসে আছে এবং মাঝখানে তাকিয়ে তাস খেলছে। রাজিবের বামদিকে রয়েছে মুকুল, বিজয় রয়েছে অনিকের বামদিকে এবং অনিক এবং মুকুলের মাঝে রয়েছে রবিন। রবিনের ডানদিকে কে রয়েছে?",
    "একটি ছবি দেখিয়ে তিন্নী বললো":
      "একটি ছবি দেখিয়ে তিন্নী বললো, ‘সে আমার দাদার একমাত্র ছেলের ছেলে’। ছবির ছেলেটির সাথে তিন্নীর সম্পর্ক কী?",
    "যদিx4−x":
      "যদি $x^4 - x^2 + 1 = 0$ হয়, তবে $x^3 + \\frac{1}{x^3}$ এর মান কত?",
    "বার্ষিক পরীক্ষায় একটি ছাত্র ক সংখ্যক প্রশ্নের":
      "বার্ষিক পরীক্ষায় একটি ছাত্র ক সংখ্যক প্রশ্নের প্রথম ২০টির মধ্যে ১৫টি শুদ্ধ উত্তর দিল এবং বাকি প্রশ্নের এক-তৃতীয়াংশ শুদ্ধ উত্তর দিল। এতে সে শতকরা ৫০ নম্বর পেল। পরীক্ষায় প্রশ্নের সংখ্যা কত ছিল?",
    "0.6˙0.\\dot{6}0.6˙কে0.9˙0.\\dot{9}0.9˙দ্বারা ভাগ করলে":
      "$0.\\dot{6}$ কে $0.\\dot{9}$ দ্বারা ভাগ করলে, নিচের কোনটি সঠিক?",
    "টেস্ট ক্রিকেটে প্রথম বাংলাদেশি হিসেবে ডাবল সেঞ্চুরি করেন":
      "টেস্ট ক্রিকেটে প্রথম বাংলাদেশি হিসেবে ডাবল সেঞ্চুরি করেন কে?",
    "গৌড়ী প্রাকৃত বলতে বোঝায়":
      "গৌড়ী প্রাকৃত বলতে বোঝায়-",
    "সেরিকালচার বলতে বোঝায়":
      "সেরিকালচার বলতে বোঝায়-",
    "ক্ষুদ্রঋণ কার্যক্রম বাংলাদেশের গ্রামীণ অর্থনীতিতে প্রধানত":
      "ক্ষুদ্রঋণ কার্যক্রম বাংলাদেশের গ্রামীণ অর্থনীতিতে প্রধানত কী ভূমিকা রাখে?",
    "বাংলাদেশের মতো উন্নয়নশীল দেশগুলোর ক্ষেত্রে মূল্যস্ফীতির সহনশীল মাত্রা হলো":
      "বাংলাদেশের মতো উন্নয়নশীল দেশগুলোর ক্ষেত্রে মূল্যস্ফীতির সহনশীল মাত্রা হলো-",
    "বাংলাদেশ ব্যাংকের রিজার্ভ থেকে চুরি করা অর্থ পাচার করা হয়":
      "বাংলাদেশ ব্যাংকের রিজার্ভ থেকে চুরি করা অর্থ পাচার করা হয় কোথায়?",
    "জাতিসংঘের অভিমত অনুসারে সুশাসনের লক্ষ্য ও উদ্দেশ্য হলো":
      "জাতিসংঘের অভিমত অনুসারে সুশাসনের লক্ষ্য ও উদ্দেশ্য হলো-",
    "অর্থনৈতিক ক্ষেত্রে সুশাসন প্রতিষ্ঠিত হলে":
      "অর্থনৈতিক ক্ষেত্রে সুশাসন প্রতিষ্ঠিত হলে কী ঘটে?",
    "সুশাসন প্রতিষ্ঠায় নাগরিকের কর্তব্য হলো":
      "সুশাসন প্রতিষ্ঠায় নাগরিকের কর্তব্য হলো-",
    "সভ্য সমাজের মানদণ্ড হলো":
      "সভ্য সমাজের মানদণ্ড হলো-",
    "গোল্ডেন মিন (Golden Mean) হলো":
      "গোল্ডেন মিন (Golden Mean) হলো-",
    "QR কোডে ব্যবহৃত হয়":
      "QR কোডে ব্যবহৃত হয় কোনটি?",
    "‘বিপরীত বৈষম্য’ –এর নীতিটি প্রয়োগ করা হয়":
      "‘বিপরীত বৈষম্য’ –এর নীতিটি প্রয়োগ করা হয় কার ক্ষেত্রে?",
  };

  for (let i = 0; i < archiveRecords.length; i++) {
    const r = archiveRecords[i];
    const rawQt = r.question_text || "";

    // 1. Recover unstripped options
    let optA = recoverOptionWord(rawQt, r.option_a);
    let optB = recoverOptionWord(rawQt, r.option_b);
    let optC = recoverOptionWord(rawQt, r.option_c);
    let optD = recoverOptionWord(rawQt, r.option_d);

    // 2. Extract authentic stem
    let stem = extractAuthenticStem(rawQt, optA, optB, optC, optD, r.explanation || "");

    // 3. Apply known overrides if any
    for (const [key, full] of Object.entries(KNOWN_EXPLICIT_STEMS)) {
      if (rawQt.includes(key) || stem.includes(key)) {
        stem = full;
        break;
      }
    }

    // 4. Clean math & LaTeX formulas
    stem = cleanMathFormulas(stem);
    optA = cleanMathFormulas(optA);
    optB = cleanMathFormulas(optB);
    optC = cleanMathFormulas(optC);
    optD = cleanMathFormulas(optD);

    const cleanExp = cleanMathFormulas(r.explanation || "");

    cleanRecordsForCsv.push({
      exam_session: r.exam_session,
      subject: r.subject,
      topic: r.topic,
      question_text: stem,
      option_a: optA,
      option_b: optB,
      option_c: optC,
      option_d: optD,
      correct_option: r.correct_option,
      explanation: cleanExp,
      difficulty: r.difficulty || "MEDIUM",
    });

    // Match with dbQuestions
    if (i < dbQuestions.length) {
      const dbQ = dbQuestions[i];
      updates.push({
        id: dbQ.id,
        questionText: stem,
        optionA: optA,
        optionB: optB,
        optionC: optC,
        optionD: optD,
        explanation: cleanExp || null,
      });
    }
  }

  console.log(`[3/5] Prepared ${updates.length} clean updates for PostgreSQL.`);

  // Print sample transformations
  console.log("\nSample Restored Records:");
  for (let i = 0; i < 5; i++) {
    const u = updates[i];
    console.log(`[#${i + 1}] ID: ${u.id}`);
    console.log(`  Stem: "${u.questionText}"`);
    console.log(`  A: "${u.optionA}" | B: "${u.optionB}" | C: "${u.optionC}" | D: "${u.optionD}"`);
  }

  // Update PostgreSQL in parallel pool
  console.log(`\n[4/5] Updating PostgreSQL in batch pool of 10...`);
  let completed = 0;
  const startTime = Date.now();

  await asyncPool(10, updates, async (item) => {
    await prisma.question.update({
      where: { id: item.id },
      data: {
        questionText: item.questionText,
        optionA: item.optionA,
        optionB: item.optionB,
        optionC: item.optionC,
        optionD: item.optionD,
        explanation: item.explanation,
      },
    });
    completed++;
    if (completed % 1000 === 0 || completed === updates.length) {
      console.log(`Updated ${completed} / ${updates.length} questions in PostgreSQL.`);
    }
  });

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`Database updates finished in ${durationSec}s.`);

  // Synchronize app/.scratch/bcs_full_database.csv
  console.log(`\n[5/5] Synchronizing app/.scratch/bcs_full_database.csv...`);
  const targetCsvPath = path.resolve(process.cwd(), "../app/.scratch/bcs_full_database.csv");
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

  const headerLine = columns.join(",");
  const dataLines = cleanRecordsForCsv.map((r) =>
    columns.map((c) => escapeCsvValue(r[c] ?? "")).join(",")
  );
  fs.writeFileSync(targetCsvPath, [headerLine, ...dataLines].join("\n") + "\n", "utf-8");
  console.log(`Successfully synchronized ${cleanRecordsForCsv.length} records into ${targetCsvPath}.`);

  console.log("==================================================================");
  console.log("SUCCESS: 100% Data Hygiene & Restoration Complete!");
  console.log("==================================================================");
}

if (process.argv[1]?.includes("restoreAndSanitizeAll")) {
  runFullRestorationAndSanitization()
    .catch((err) => {
      console.error("Error during restoration:", err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
