export type ModelTestStatus = "UPCOMING" | "LIVE" | "EXPIRED";

export interface IModelTestDto {
  id: string;
  title: string;
  description: string | null;
  examSession: string;
  durationMinutes: number;
  totalMarks: number;
  totalQuestions: number;
  startTime: string;
  endTime: string;
  isPublished: boolean;
  status: ModelTestStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ICreateModelTestPayload {
  title: string;
  description?: string | null;
  examSession: string;
  durationMinutes?: number;
  totalMarks?: number;
  totalQuestions?: number;
  startTime: string | Date;
  endTime: string | Date;
  isPublished?: boolean;
}

export interface IUpdateModelTestPayload {
  title?: string;
  description?: string | null;
  examSession?: string;
  durationMinutes?: number;
  totalMarks?: number;
  totalQuestions?: number;
  startTime?: string | Date;
  endTime?: string | Date;
  isPublished?: boolean;
}
