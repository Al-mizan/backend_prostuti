export interface IqueryParams {
  searchTerm?: string;
  page?: string | number;
  limit?: string | number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  fields?: string;
  include?: string;
  [key: string]: unknown;
}
