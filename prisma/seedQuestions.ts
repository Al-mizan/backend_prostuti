import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { prisma } from "../src/app/lib/prisma";
import { QuestionType, Subject, Option, Difficulty } from "../src/generated/prisma/enums";

async function main() {
  console.log("Starting BCS questions seeding...");

  const user = await prisma.user.findFirst({
    where: { isDeleted: false },
    orderBy: { createdAt: "asc" },
  });

  if (!user) {
    console.error("No active user found in database to assign createdBy.");
    process.exit(1);
  }

  const csvPath = path.resolve(process.cwd(), "../app/.scratch/bcs_full_database.csv");
  if (!fs.existsSync(csvPath)) {
    console.error("CSV file not found at:", csvPath);
    process.exit(1);
  }

  const fileContent = fs.readFileSync(csvPath, "utf-8");
  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });

  console.log(`Parsed ${records.length} records from CSV.`);

  // Clean up existing dummy questions if any
  const existingCount = await prisma.question.count();
  console.log(`Current questions in database: ${existingCount}`);

  const validQuestions: any[] = [];
  const validSubjects = new Set(Object.values(Subject));
  const validOptions = new Set(Object.values(Option));
  const validDifficulties = new Set(Object.values(Difficulty));

  for (const r of records) {
    const rawSubject = r.subject?.trim().toUpperCase();
    const rawOption = r.correct_option?.trim().toUpperCase();
    const rawDiff = r.difficulty?.trim().toUpperCase();

    if (!validSubjects.has(rawSubject as Subject)) {
      continue;
    }
    if (!validOptions.has(rawOption as Option)) {
      continue;
    }

    const difficulty = validDifficulties.has(rawDiff as Difficulty)
      ? (rawDiff as Difficulty)
      : Difficulty.MEDIUM;

    validQuestions.push({
      type: QuestionType.BANK,
      subject: rawSubject as Subject,
      examSession: r.exam_session?.trim() || null,
      topic: r.topic?.trim() || null,
      questionText: r.question_text?.trim() || "",
      optionA: r.option_a?.trim() || "",
      optionB: r.option_b?.trim() || "",
      optionC: r.option_c?.trim() || "",
      optionD: r.option_d?.trim() || "",
      correctOption: rawOption as Option,
      explanation: r.explanation?.trim() || null,
      difficulty,
      createdBy: user.id,
    });
  }

  console.log(`Prepared ${validQuestions.length} valid questions to insert.`);

  // Insert in chunks of 250
  const CHUNK_SIZE = 250;
  let inserted = 0;

  for (let i = 0; i < validQuestions.length; i += CHUNK_SIZE) {
    const chunk = validQuestions.slice(i, i + CHUNK_SIZE);
    const result = await prisma.question.createMany({
      data: chunk,
    });
    inserted += result.count;
    console.log(`Inserted chunk ${Math.floor(i / CHUNK_SIZE) + 1} / ${Math.ceil(validQuestions.length / CHUNK_SIZE)} (Total: ${inserted})`);
  }

  console.log(`Successfully seeded ${inserted} questions!`);

  const summary = await prisma.question.groupBy({
    by: ["subject"],
    _count: { id: true },
  });
  console.log("Questions per subject:", summary);

  const sessionSummary = await prisma.question.groupBy({
    by: ["examSession"],
    _count: { id: true },
  });
  console.log(`Total sessions covered: ${sessionSummary.length}`);

  // Seed 15-day active Live Model Test
  const { seedLiveModelTest } = await import("./seedLiveModelTest");
  await seedLiveModelTest();
}

main()
  .catch((err) => {
    console.error("Seeding error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
