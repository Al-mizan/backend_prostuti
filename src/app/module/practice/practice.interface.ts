import { Difficulty, Option, Subject } from "../../../generated/prisma/enums";

export interface IStartPracticePayload {
  subject: Subject;
  count?: number;
}

export interface IPracticeSessionQuestionDto {
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

export interface IPracticeSessionDto {
  id: string;
  subject: Subject;
  questions: IPracticeSessionQuestionDto[];
  startedAt: string;
}

export interface ISubmitAnswerPayload {
  questionId: string;
  selectedOption: Option;
}

export interface IPracticeAnswerResultDto {
  questionId: string;
  selectedOption: Option;
  isCorrect: boolean;
  correctOption: Option;
  explanation?: string | null;
}

export interface IFinishPracticeSessionResponse {
  sessionId: string;
  subject: Subject;
  totalQuestions: number;
  correctCount: number;
  incorrectCount: number;
  score: number;
}
