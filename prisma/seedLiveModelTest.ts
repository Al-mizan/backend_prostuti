import { prisma } from "../src/app/lib/prisma";

export async function seedLiveModelTest() {
  console.log("Starting 15-Day Live Model Test seeding...");

  const now = new Date();
  const fifteenDaysLater = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);

  const title = "৪৭তম বিসিএস লাইভ মডেল টেস্ট - ০১";
  const examSession = "47th BCS Preliminary";

  const existing = await prisma.modelTest.findFirst({
    where: {
      title,
      isPublished: true,
    },
  });

  if (existing) {
    console.log(`Live Model Test already exists with ID: ${existing.id}`);
    const updated = await prisma.modelTest.update({
      where: { id: existing.id },
      data: {
        startTime: now,
        endTime: fifteenDaysLater,
        durationMinutes: 120,
        totalMarks: 200.0,
        totalQuestions: 200,
        examSession,
        isPublished: true,
      },
    });
    console.log(`Updated active window for Live Model Test ID: ${updated.id}`);
    return updated;
  }

  const modelTest = await prisma.modelTest.create({
    data: {
      title,
      description: "১৫ দিনব্যাপী বিসিএস প্রিলিমিনারি পূর্ণাঙ্গ লাইভ মডেল টেস্ট। নির্ধারিত ১২০ মিনিটে ২০০ নম্বরের পরীক্ষা সম্পন্ন করুন।",
      examSession,
      durationMinutes: 120,
      totalMarks: 200.0,
      totalQuestions: 200,
      startTime: now,
      endTime: fifteenDaysLater,
      isPublished: true,
    },
  });

  console.log(`Successfully created 15-Day Live Model Test with ID: ${modelTest.id}`);
  return modelTest;
}

if (process.argv[1]?.includes("seedLiveModelTest")) {
  seedLiveModelTest()
    .catch((err) => {
      console.error("Live Model Test seeding error:", err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
