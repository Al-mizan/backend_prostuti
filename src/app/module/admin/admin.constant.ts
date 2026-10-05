export const HEADER_BANK = [
  "exam_session",
  "subject",
  "topic",
  "question_text",
  "option_a",
  "option_b",
  "option_c",
  "option_d",
  "correct_option",
  "explanation",
  "difficulty",
] as const;

export const HEADER_PRACTICE = [
  "subject",
  "topic",
  "question_text",
  "option_a",
  "option_b",
  "option_c",
  "option_d",
  "correct_option",
  "explanation",
  "difficulty",
] as const;

export const MAX_QUESTION_LENGTH = 5000;
export const MAX_OPTION_LENGTH = 1000;
export const CSV_CHUNK_SIZE = 250;
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
