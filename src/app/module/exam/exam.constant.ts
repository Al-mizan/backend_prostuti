import { Subject } from "../../../generated/prisma/enums";

export const DEFAULT_EXAM_QUESTION_COUNT = 50;
export const DEFAULT_EXAM_DURATION_MINUTES = 30;
export const MIN_EXAM_QUESTION_COUNT = 5;
export const MAX_EXAM_QUESTION_COUNT = 200;
export const MIN_EXAM_DURATION_MINUTES = 5;
export const MAX_EXAM_DURATION_MINUTES = 180;
export const BCS_NEGATIVE_MARKING_PENALTY = 0.5;
export const BCS_CORRECT_MARK = 1.0;
export const LEADERBOARD_LIMIT = 50;

export const BCS_SYLLABUS_DISTRIBUTION: Record<Subject, number> = {
  [Subject.BENGALI]: 35,
  [Subject.ENGLISH]: 35,
  [Subject.BD_INTERNATIONAL_AFFAIRS]: 50,
  [Subject.GEOGRAPHY]: 10,
  [Subject.SCIENCE]: 15,
  [Subject.IT]: 15,
  [Subject.MATH]: 15,
  [Subject.MENTAL_ABILITY]: 15,
  [Subject.ETHICS]: 10,
};
