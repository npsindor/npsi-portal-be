import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from "@nestjs/common";
import type { Response } from "express";
import { logServerError, type RequestWithId } from "../logging/request-logger.js";
import type { ErrorBody } from "./api-error.js";

// Converts every error to the legacy `{ "error": message }` body. HTTP
// exceptions keep their status; anything else uses `error.status` or 500 and
// exposes `error.message`, exactly like the legacy Express error handler.
export const toErrorResponse = (exception: unknown): { status: number; body: ErrorBody } => {
  if (exception instanceof HttpException) {
    const payload = exception.getResponse();
    if (typeof payload === "string") return { status: exception.getStatus(), body: { error: payload } };
    const { error, message } = payload as { error?: unknown; message?: unknown };
    // Our own errors already carry the final body (`{ error }`, or e.g. the
    // health check's `{ ok: false, error }`); Nest's built-ins carry `message`.
    if (typeof error === "string" && message === undefined) return { status: exception.getStatus(), body: payload as ErrorBody };
    const text = Array.isArray(message) ? message.join("; ") : String(message ?? error ?? exception.message);
    return { status: exception.getStatus(), body: { error: text } };
  }
  const { status, message } = (exception ?? {}) as { status?: unknown; message?: unknown };
  return { status: typeof status === "number" ? status : 500, body: { error: String(message ?? "Internal Server Error") } };
};

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const { status, body } = toErrorResponse(exception);
    logServerError(http.getRequest<RequestWithId>(), status, exception);
    response.status(status).json(body);
  }
}
