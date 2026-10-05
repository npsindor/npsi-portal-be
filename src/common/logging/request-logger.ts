import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

// One JSON log line per request, written through console so Hostinger's
// runtime log viewer (which captures console output) shows it. Every response
// carries an X-Request-Id (the caller's, if it sent a sane one) that also
// appears on the matching error log line. Query strings are not logged: some
// carry emails or mobile numbers.
const INCOMING_ID = /^[\w-]{1,64}$/;

export type RequestWithId = Request & { requestId?: string };

export const requestLogger = (request: RequestWithId, response: Response, next: NextFunction): void => {
  const incoming = request.get("x-request-id");
  const id = incoming && INCOMING_ID.test(incoming) ? incoming : randomUUID();
  request.requestId = id;
  response.setHeader("X-Request-Id", id);
  if (process.env.LOG_REQUESTS === "false") {
    next();
    return;
  }
  const started = process.hrtime.bigint();
  response.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    const path = request.originalUrl.split("?")[0];
    console.log(
      JSON.stringify({ level: "info", msg: "request", id, method: request.method, path, status: response.statusCode, ms: Math.round(ms), ip: request.ip }),
    );
  });
  next();
};

export const logServerError = (request: RequestWithId | undefined, status: number, error: unknown): void => {
  if (status < 500 || process.env.LOG_REQUESTS === "false") return;
  const detail = error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) };
  console.error(
    JSON.stringify({
      level: "error",
      msg: "request failed",
      id: request?.requestId,
      method: request?.method,
      path: request?.originalUrl?.split("?")[0],
      status,
      ...detail,
    }),
  );
};
