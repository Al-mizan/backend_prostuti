import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { prisma } from "../src/app/lib/prisma";
import { QuestionType } from "../src/generated/prisma/enums";

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getTokenRegexPattern(str: string): string | null {
  const tokens = str.match(/\S+/g);
  if (!tokens || tokens.length === 0) return null;
  return tokens.map((t) => escapeRegex(t)).join("\\s*");
}

export function cleanTrailingPunctuationAndMarkers(text: string): string {
  let prev = "";
  let current = text.trim();

  while (prev !== current) {
    prev = current;
    current = current.trim();

    // Strip trailing option markers, e.g.:
    // " ক", " ক.", " ক)", "(ক)", " a", " a.", " a)", "(a)", " A", etc.
    // Also markers preceded by hyphen/colon like "- ক", ": a."
    current = current.replace(
      /(?:[\s\-:–—−ঃ]+)(?:\([ক-ঘa-dA-D]\)|[ক-ঘa-dA-D][\.\)]?|[ক-ঘa-dA-D])$/,
      ""
    );

    // Strip trailing colons, dashes (do not strip underscore '_' to protect fill-in-the-blank)
    current = current.replace(/[\s\-:–—−ঃ]+$/, "");
    current = current.trim();
  }

  return current;
}

export function findCutIndex(
  qt: string,
  oa: string,
  ob: string,
  oc: string,
  od: string,
  exp: string
): number {
  // Strategy 1: exact oa followed by ob within small gap (15 chars)
  if (oa && ob) {
    let start = 0;
    while (true) {
      const idx = qt.indexOf(oa, start);
      if (idx === -1) break;
      if (idx > 3) {
        const gap = qt.slice(idx + oa.length, idx + oa.length + ob.length + 15);
        if (gap.includes(ob)) {
          return idx;
        }
      }
      start = idx + 1;
    }
  }

  // Strategy 2: exact oa followed by oc, od, or exp
  if (oa) {
    let start = 0;
    while (true) {
      const idx = qt.indexOf(oa, start);
      if (idx === -1) break;
      if (idx > 3) {
        const gap = qt.slice(idx + oa.length, idx + oa.length + 30);
        if (
          (oc && gap.includes(oc)) ||
          (od && gap.includes(od)) ||
          (exp && gap.includes(exp))
        ) {
          return idx;
        }
      }
      start = idx + 1;
    }
  }

  // Strategy 3: ob followed closely by oc (within 15 chars)
  if (ob && oc) {
    let start = 0;
    while (true) {
      const idx = qt.indexOf(ob, start);
      if (idx === -1) break;
      if (idx > 3) {
        const gap = qt.slice(idx + ob.length, idx + ob.length + oc.length + 15);
        if (gap.includes(oc)) {
          return idx;
        }
      }
      start = idx + 1;
    }
  }

  // Strategy 4: regex token match for oa followed by ob (handles LaTeX formula spacing)
  if (oa && ob) {
    const patA = getTokenRegexPattern(oa);
    const patB = getTokenRegexPattern(ob);
    if (patA && patB) {
      const fullPat = new RegExp(`(${patA})[\\s,]{0,10}(${patB})`);
      const m = fullPat.exec(qt);
      if (m && m.index > 3) {
        return m.index;
      }
    }
  }

  // Strategy 5: single oa regex token match if oa is at least 3 chars
  if (oa && oa.length >= 3) {
    const patA = getTokenRegexPattern(oa);
    if (patA) {
      const regexA = new RegExp(patA);
      const m = regexA.exec(qt);
      if (m && m.index > 3) {
        return m.index;
      }
    }
  }

  // Strategy 6: single ob regex token match if ob is at least 3 chars
  if (ob && ob.length >= 3) {
    const patB = getTokenRegexPattern(ob);
    if (patB) {
      const regexB = new RegExp(patB);
      const m = regexB.exec(qt);
      if (m && m.index > 3) {
        return m.index;
      }
    }
  }

  // Strategy 7: fallback to lastIndexOf if option length > 3
  if (oa && oa.length > 3) {
    const idx = qt.lastIndexOf(oa);
    if (idx > 3) return idx;
  }
  if (ob && ob.length > 3) {
    const idx = qt.lastIndexOf(ob);
    if (idx > 3) return idx;
  }
  if (oc && oc.length > 3) {
    const idx = qt.lastIndexOf(oc);
    if (idx > 3) return idx;
  }
  if (od && od.length > 3) {
    const idx = qt.lastIndexOf(od);
    if (idx > 3) return idx;
  }

  return -1;
}

export function sanitizeQuestionText(
  questionText: string,
  optionA: string | null | undefined,
  optionB: string | null | undefined,
  optionC: string | null | undefined,
  optionD: string | null | undefined,
  explanation: string | null | undefined
): string {
  let qt = (questionText || "").trim();
  const oa = (optionA || "").trim();
  const ob = (optionB || "").trim();
  const oc = (optionC || "").trim();
  const od = (optionD || "").trim();
  const exp = (explanation || "").trim();

  // Step 1: Slice before explanation if present
  if (exp && exp.length > 3) {
    const expIdx = qt.indexOf(exp);
    if (expIdx > 3) {
      qt = qt.substring(0, expIdx).trim();
    } else {
      // Check prefix of explanation (first 25 characters)
      const prefix = exp.substring(0, 25).trim();
      if (prefix.length > 10) {
        const pIdx = qt.indexOf(prefix);
        if (pIdx > 3) {
          qt = qt.substring(0, pIdx).trim();
        }
      }
    }
  }

  // Step 2: Slice before options if present
  const cutIdx = findCutIndex(qt, oa, ob, oc, od, exp);
  let stem = cutIdx > 3 ? qt.substring(0, cutIdx) : qt;

  // Step 3: Strip trailing colons, dashes or leftover option markers
  const cleanedStem = cleanTrailingPunctuationAndMarkers(stem);

  // Preserve original if clean result was destroyed/empty on a stemless question
  if (cleanedStem.length < 3 && qt.length >= 3) {
    return qt;
  }

  return cleanedStem;
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

async function main() {
  console.log("=================================================");
  console.log("TICKET-FUNC-009: Database Question Table Hygiene");
  console.log("=================================================");

  // 1. Fetch BANK questions from DB
  console.log("\n[1/4] Fetching BANK questions from PostgreSQL...");
  const questions = await prisma.question.findMany({
    where: { type: QuestionType.BANK },
    select: {
      id: true,
      questionText: true,
      optionA: true,
      optionB: true,
      optionC: true,
      optionD: true,
      explanation: true,
      examSession: true,
      subject: true,
    },
  });
  console.log(`Fetched ${questions.length} BANK questions from DB.`);

  // 2. Identify and sanitize questions needing updates
  console.log("\n[2/4] Sanitizing question text...");
  const updates: { id: string; oldText: string; newText: string }[] = [];

const KNOWN_OVERRIDES: Record<string, string> = {
  "পাঁচজন ব্যক্তি গোল হয়ে বসে আছে":
    "পাঁচজন ব্যক্তি গোল হয়ে বসে আছে এবং মাঝখানে তাকিয়ে তাস খেলছে। রাজিবের বামদিকে রয়েছে মুকুল, বিজয় রয়েছে অনিকের বামদিকে এবং অনিক এবং মুকুলের মাঝে রয়েছে রবিন। রবিনের ডানদিকে কে রয়েছে?",
  "একটি ছবি দেখিয়ে তিন্নী বললো":
    "একটি ছবি দেখিয়ে তিন্নী বললো, ‘সে আমার দাদার একমাত্র ছেলের ছেলে’। ছবির ছেলেটির সাথে তিন্নীর সম্পর্ক কী?",
  "যদিx4−x":
    "যদি $x^4 - x^2 + 1 = 0$ হয়, তবে $x^3 + \\frac{1}{x^3}$ এর মান কত?",
  "বার্ষিক পরীক্ষায় একটি ছাত্র ক সংখ্যক প্রশ্নের":
    "বার্ষিক পরীক্ষায় একটি ছাত্র ক সংখ্যক প্রশ্নের প্রথম ২০টির মধ্যে ১৫টি শুদ্ধ উত্তর দিল এবং বাকি প্রশ্নের এক-তৃতীয়াংশ শুদ্ধ উত্তর দিল। এতে সে শতকরা ৫০ নম্বর পেল। পরীক্ষায় প্রশ্নের সংখ্যা কত ছিল?",
};

  for (const q of questions) {
    let sanitized = q.questionText;
    
    // Check known overrides
    let matchedOverride = false;
    for (const [key, fullText] of Object.entries(KNOWN_OVERRIDES)) {
      if (q.questionText.includes(key)) {
        sanitized = fullText;
        matchedOverride = true;
        break;
      }
    }

    if (!matchedOverride) {
      sanitized = sanitizeQuestionText(
        q.questionText,
        q.optionA,
        q.optionB,
        q.optionC,
        q.optionD,
        q.explanation
      );
    }

    if (sanitized !== q.questionText) {
      updates.push({
        id: q.id,
        oldText: q.questionText,
        newText: sanitized,
      });
    }
  }

  console.log(`Identified ${updates.length} questions needing sanitization.`);

  // Print first 5 sample transformations
  console.log("\nSample sanitization diffs (first 5):");
  for (let i = 0; i < Math.min(5, updates.length); i++) {
    const u = updates[i];
    console.log(`--- [Sample ${i + 1}] ---`);
    console.log(`BEFORE: ${u.oldText.substring(0, 100)}...`);
    console.log(`AFTER:  ${u.newText}`);
  }

  // Execute database updates
  console.log(`\nExecuting DB updates for ${updates.length} questions...`);
  const startTime = Date.now();
  let completed = 0;

  await asyncPool(10, updates, async (item) => {
    await prisma.question.update({
      where: { id: item.id },
      data: { questionText: item.newText },
    });
    completed++;
    if (completed % 500 === 0 || completed === updates.length) {
      console.log(
        `Updated ${completed} / ${updates.length} questions (${Math.round(
          (completed / updates.length) * 100
        )}%)`
      );
    }
  });

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`Database update complete in ${durationSec}s.`);

  // 3. Synchronize CSV file
  console.log("\n[3/4] Synchronizing app/.scratch/bcs_full_database.csv...");
  const csvPath = path.resolve(
    process.cwd(),
    "../app/.scratch/bcs_full_database.csv"
  );
  if (!fs.existsSync(csvPath)) {
    console.warn(`CSV file not found at ${csvPath}. Skipping CSV sync.`);
  } else {
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

    let csvUpdatedCount = 0;
    for (const record of records) {
      let sanitized = record.question_text;
      let matched = false;
      for (const [key, fullText] of Object.entries(KNOWN_OVERRIDES)) {
        if (record.question_text.includes(key)) {
          sanitized = fullText;
          matched = true;
          break;
        }
      }

      if (!matched) {
        sanitized = sanitizeQuestionText(
          record.question_text,
          record.option_a,
          record.option_b,
          record.option_c,
          record.option_d,
          record.explanation
        );
      }

      if (sanitized !== record.question_text) {
        record.question_text = sanitized;
        csvUpdatedCount++;
      }
    }

    const headerLine = columns.join(",");
    const dataLines = records.map((r) =>
      columns.map((c) => escapeCsvValue(r[c] ?? "")).join(",")
    );
    const newCsvContent = [headerLine, ...dataLines].join("\n") + "\n";
    fs.writeFileSync(csvPath, newCsvContent, "utf-8");
    console.log(
      `Synchronized CSV file: ${csvUpdatedCount} / ${records.length} records updated.`
    );
  }

  // 4. Verification Check
  console.log("\n[4/4] Running Verification Check...");
  const verifyQuestions = await prisma.question.findMany({
    where: { type: QuestionType.BANK },
    select: {
      id: true,
      questionText: true,
      optionA: true,
      optionB: true,
      optionC: true,
      optionD: true,
      explanation: true,
    },
  });

  let trailingViolations = 0;
  for (const q of verifyQuestions) {
    if (q.questionText.length <= 10) continue;

    // Check if optionB, C, D or explanation is trailing inside questionText
    for (const opt of [q.optionB, q.optionC, q.optionD, q.explanation]) {
      const trimmedOpt = (opt || "").trim();
      if (trimmedOpt && trimmedOpt.length >= 4) {
        const normQt = q.questionText.replace(/[\s\.\?!,।]+$/, "");
        const normOpt = trimmedOpt.replace(/[\s\.\?!,।]+$/, "");
        if (normQt.endsWith(normOpt)) {
          console.error(
            `Verification violation: Question ${q.id} ends with option/explanation: "${trimmedOpt}"`
          );
          trailingViolations++;
        }
      }
    }
  }

  console.log("-------------------------------------------------");
  console.log(`Verification Result: ${trailingViolations} trailing violations.`);
  if (trailingViolations === 0) {
    console.log("SUCCESS: 0 questions have trailing options or explanations!");
  } else {
    console.error(
      `FAILURE: ${trailingViolations} questions still have trailing options/explanations!`
    );
    process.exit(1);
  }
  console.log("=================================================");
}

main()
  .catch((err) => {
    console.error("Sanitization error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
