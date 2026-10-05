import {
  Difficulty,
  Option,
  QuestionType,
  Role,
  Subject,
} from "../../../generated/prisma/enums";

export interface IRejectedRow {
  rowNumber: number;
  reason: string;
  row?: number;
  message?: string;
}

export interface IImportSummary {
  imported: number;
  rejected: IRejectedRow[];
}

export interface IAdminQuestionDto {
  id: string;
  type: QuestionType;
  subject: Subject;
  examSession?: string | null;
  topic?: string | null;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: Option;
  explanation?: string | null;
  difficulty?: Difficulty | null;
  createdAt: string;
}

export interface IAdminUserDto {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
}

export interface IUpdateQuestionPayload {
  subject: Subject;
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

export interface IUpdateUserRolePayload {
  role: Role;
}

export interface IListQuestionsQuery {
  type?: QuestionType;
  examSession?: string;
  subject?: Subject;
  page?: number;
  pageSize?: number;
}

export interface IPaginatedQuestionsResult {
  items: IAdminQuestionDto[];
  page: number;
  pageSize: number;
  total: number;
}
