import { Difficulty, Option, Subject } from "../../../generated/prisma/enums";

export interface IStartExamPayload {
  examSession: string;
  questionCount?: number;
  durationMinutes?: number;
}

export interface IExamAnswerSubmission {
  questionId: string;
  selectedOption?: Option | null;
}

export interface ISubmitExamPayload {
  timeTakenSeconds: number;
  answers: IExamAnswerSubmission[];
}

export interface IExamQuestionDto {
  id: string;
  subject: Subject;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  topic?: string | null;
  difficulty?: Difficulty | null;
}

export interface IExamSessionDto {
  id: string;
  examSession: string;
  totalQuestions: number;
  durationMinutes: number;
  questions: IExamQuestionDto[];
  startedAt: string;
}

export interface IExamQuestionResultDto {
  questionId: string;
  subject: Subject;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  selectedOption: Option | null;
  correctOption: Option;
  isCorrect: boolean;
  explanation?: string | null;
  topic?: string | null;
}

export interface IExamResultDto {
  sessionId: string;
  examSession: string;
  totalQuestions: number;
  correctCount: number;
  incorrectCount: number;
  skippedCount: number;
  score: number;
  timeTakenSeconds: number;
  questions: IExamQuestionResultDto[];
}

export interface ILeaderboardEntryDto {
  rank: number;
  userId: string;
  userName: string;
  avatarId?: string | null;
  score: number;
  timeTakenSeconds: number;
  finishedAt: string;
}
