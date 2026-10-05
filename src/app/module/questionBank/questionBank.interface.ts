import { Difficulty, Option, Subject } from "../../../generated/prisma/enums";

export interface IBcsSessionSummaryDto {
  sessionName: string;
  totalQuestions: number;
  durationMinutes: number;
  totalMarks: number;
  negativeMarkingPerQuestion: number;
}

export interface IQuestionBankItemDto {
  id: string;
  subject: Subject;
  examSession: string;
  topic?: string | null;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: Option;
  explanation?: string | null;
  difficulty?: Difficulty | null;
}

export interface IQuestionBankQuery {
  examSession?: string;
  subject?: Subject;
  page?: number;
  pageSize?: number;
}

export interface IQuestionBankPageResponse {
  items: IQuestionBankItemDto[];
  page: number;
  pageSize: number;
  total: number;
}
