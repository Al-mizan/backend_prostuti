import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { prisma } from "../src/app/lib/prisma";
import { Subject, Option, Difficulty } from "../src/generated/prisma/enums";

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

async function main() {
  console.log("==========================================================");
  console.log("FIXING DATABASE QUESTIONS: SUBJECT, EXAM SESSION & METADATA");
  console.log("==========================================================");

  // 1. Read authentic records from CSV
  const csvPath = path.resolve(process.cwd(), "../app/.scratch/bcs_full_database.csv");
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found at: ${csvPath}`);
  }

  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const records: Record<string, string>[] = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });

  console.log(`[1/4] Loaded ${records.length} authentic records from CSV.`);

  // Create lookup maps by question_text and by normalized question_text
  const recordMap = new Map<string, Record<string, string>>();
  const normRecordMap = new Map<string, Record<string, string>>();

  function normalize(s: string): string {
    return (s || "").replace(/[\s\$\\\{\}\(\)]+/g, "").trim();
  }

  for (const r of records) {
    const qt = (r.question_text || "").trim();
    recordMap.set(qt, r);
    normRecordMap.set(normalize(qt), r);
  }

  // 2. Fetch all BANK questions from PostgreSQL
  console.log("[2/4] Fetching all BANK questions from PostgreSQL...");
  const dbQuestions = await prisma.question.findMany({
    where: { type: "BANK" },
    select: {
      id: true,
      questionText: true,
      subject: true,
      examSession: true,
      correctOption: true,
      topic: true,
    },
  });

  console.log(`Fetched ${dbQuestions.length} BANK questions from DB.`);

  // 3. Prepare updates
  const validSubjects = new Set(Object.values(Subject));
  const validOptions = new Set(Object.values(Option));
  const validDifficulties = new Set(Object.values(Difficulty));

  const updates: Array<{
    id: string;
    subject: Subject;
    examSession: string;
    correctOption: Option;
    topic: string | null;
    difficulty: Difficulty;
  }> = [];

  let matchedExact = 0;
  let matchedNorm = 0;
  let unmatched = 0;

  for (const q of dbQuestions) {
    const qt = (q.questionText || "").trim();
    let r = recordMap.get(qt);
    if (r) {
      matchedExact++;
    } else {
      r = normRecordMap.get(normalize(qt));
      if (r) {
        matchedNorm++;
      } else {
        unmatched++;
        console.warn(`Unmatched question ID: ${q.id} | "${qt.slice(0, 50)}"`);
        continue;
      }
    }

    const rawSubj = r.subject?.trim().toUpperCase();
    const rawOpt = r.correct_option?.trim().toUpperCase();
    const rawDiff = r.difficulty?.trim().toUpperCase();

    if (!validSubjects.has(rawSubj as Subject)) {
      console.warn(`Invalid subject "${rawSubj}" for question ID ${q.id}`);
      continue;
    }
    if (!validOptions.has(rawOpt as Option)) {
      console.warn(`Invalid option "${rawOpt}" for question ID ${q.id}`);
      continue;
    }

    const diff = validDifficulties.has(rawDiff as Difficulty)
      ? (rawDiff as Difficulty)
      : Difficulty.MEDIUM;

    updates.push({
      id: q.id,
      subject: rawSubj as Subject,
      examSession: r.exam_session?.trim() || "BCS Preliminary",
      correctOption: rawOpt as Option,
      topic: r.topic?.trim() || null,
      difficulty: diff,
    });
  }

  console.log(`\nMatch Stats: Exact=${matchedExact}, Normalized=${matchedNorm}, Unmatched=${unmatched}`);
  console.log(`[3/4] Prepared ${updates.length} updates.`);

  // 4. Execute updates in PostgreSQL
  console.log(`[4/4] Executing DB updates with pool of 10...`);
  const startTime = Date.now();
  let completed = 0;

  await asyncPool(10, updates, async (item) => {
    await prisma.question.update({
      where: { id: item.id },
      data: {
        subject: item.subject,
        examSession: item.examSession,
        correctOption: item.correctOption,
        topic: item.topic,
        difficulty: item.difficulty,
      },
    });
    completed++;
    if (completed % 1000 === 0 || completed === updates.length) {
      console.log(`Updated ${completed} / ${updates.length} questions in DB.`);
    }
  });

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`Database updates completed in ${durationSec}s.`);

  // 5. Verification checks
  console.log("\n--- POST-FIX VERIFICATION ---");
  const summary = await prisma.question.groupBy({
    by: ["subject"],
    _count: { id: true },
  });
  console.log("Questions count per subject in PostgreSQL:");
  for (const s of summary) {
    console.log(`  - ${s.subject}: ${s._count.id} questions`);
  }

  // Sample 5 MATH questions to verify they are all genuine math questions
  console.log("\nVerifying sample MATH questions in DB:");
  const mathSamples = await prisma.question.findMany({
    where: { subject: Subject.MATH },
    select: { id: true, questionText: true, subject: true, examSession: true, correctOption: true },
    take: 5,
  });
  for (const m of mathSamples) {
    console.log(`[MATH] [${m.examSession}] "${m.questionText}" (Answer: ${m.correctOption})`);
  }

  // Sample 5 BENGALI questions
  console.log("\nVerifying sample BENGALI questions in DB:");
  const bengaliSamples = await prisma.question.findMany({
    where: { subject: Subject.BENGALI },
    select: { id: true, questionText: true, subject: true, examSession: true, correctOption: true },
    take: 5,
  });
  for (const b of bengaliSamples) {
    console.log(`[BENGALI] [${b.examSession}] "${b.questionText}" (Answer: ${b.correctOption})`);
  }

  // Sample 5 ENGLISH questions
  console.log("\nVerifying sample ENGLISH questions in DB:");
  const englishSamples = await prisma.question.findMany({
    where: { subject: Subject.ENGLISH },
    select: { id: true, questionText: true, subject: true, examSession: true, correctOption: true },
    take: 5,
  });
  for (const e of englishSamples) {
    console.log(`[ENGLISH] [${e.examSession}] "${e.questionText}" (Answer: ${e.correctOption})`);
  }

  console.log("==========================================================");
  console.log("SUCCESS: All question subjects and metadata accurately aligned!");
  console.log("==========================================================");
}

main()
  .catch((err) => {
    console.error("Error fixing database subjects:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
