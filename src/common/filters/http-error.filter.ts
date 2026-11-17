import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from "@nestjs/common";
import type { Response } from "express";
import { logServerError, type RequestWithId } from "../logging/request-logger.js";
import type { ErrorBody } from "./api-error.js";

// Converts every error to the legacy `{ "error": message }` body. HTTP
// exceptions keep their status and message. Anything else (a library or runtime error) keeps a 4xx
// status from body parsing, but its text never reaches the client: internal messages (stack overflows,
// crypto argument errors, parser details) are logged with the request id instead.
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
  // A write that points at a family/samiti that doesn't exist (foreign key, Prisma P2003).
  if ((exception as { code?: unknown } | null)?.code === "P2003") return { status: 400, body: { error: "A referenced record does not exist." } };
  const { status, type } = (exception ?? {}) as { status?: unknown; type?: unknown };
  const code = typeof status === "number" && status >= 400 && status < 600 ? status : 500;
  if (code >= 500) return { status: code, body: { error: INTERNAL_ERROR } };
  return { status: code, body: { error: BODY_ERRORS[String(type)] ?? "The request could not be processed." } };
};

export const INTERNAL_ERROR = "Internal Server Error";
// Fixed texts for the JSON body parser's errors (its own messages quote parser internals).
const BODY_ERRORS: Record<string, string> = {
  "entity.parse.failed": "The request body is not valid JSON.",
  "entity.too.large": "The request body is too large.",
  "encoding.unsupported": "Unsupported request body encoding.",
  "charset.unsupported": "Unsupported request body charset.",
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
