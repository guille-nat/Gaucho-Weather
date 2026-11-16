import { ApiError } from '../api/client';

/** The server's first message for one field, if it sent any. */
export const fieldError = (error: unknown, field: string) =>
  error instanceof ApiError ? error.fieldErrors[field]?.[0] : undefined;

/** A form-level message only when no field shows the error itself. */
export const formError = (error: unknown) =>
  error instanceof ApiError && !Object.keys(error.fieldErrors).length ? error.message : null;
