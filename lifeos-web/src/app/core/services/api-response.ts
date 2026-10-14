/** Mirrors LifeOS.Core's ApiResponse<T> envelope returned by every API endpoint. */
export interface ApiResponse<T> {
  success: boolean;
  message: string | null;
  data: T | null;
  errors: string[] | null;
}
