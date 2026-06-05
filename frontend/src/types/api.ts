export interface ValidationErrorItem {
  field: string;
  code: string;
  message: string;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details: ValidationErrorItem[];
  request_id: string;
}

export interface ApiError {
  error: ApiErrorBody;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}
