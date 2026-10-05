import { Option, SessionType, Subject } from "../../../generated/prisma/enums";

export interface IUserAttemptSummaryDto {
  id: string;
  sessionType: SessionType;
  title: string;
  subject?: Subject | null;
  examSession?: string | null;
  score: number;
  totalQuestions: number;
  timeTakenSeconds?: number | null;
  startedAt: string;
  finishedAt?: string | null;
}

export interface IWrongAnswerItemDto {
  answerId: string;
  sessionId: string;
  sessionType: SessionType;
  questionId: string;
  subject: Subject;
  topic?: string | null;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  selectedOption: Option;
  correctOption: Option;
  explanation?: string | null;
  answeredAt: string;
}
