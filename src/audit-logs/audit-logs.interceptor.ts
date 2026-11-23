import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from "@nestjs/common";
import type { Request } from "express";
import { catchError, concatMap, from, map, type Observable, of, switchMap } from "rxjs";
import type { UserRow } from "../common/session/session.service.js";
import { NOT_AUDITED, resourceOf } from "./audit-logs.rules.js";
import { AuditLogsService } from "./audit-logs.service.js";

const PREFIX = /^\/api\/v\d+/;

// Records every successful DELETE (any module, any member or administrator) in the audit log, with a copy of the
// record taken just before it is removed. The answer goes back only once the entry is written, so a deletion the
// client sees as done is already in the log. A failed delete is not logged; a problem writing the log never undoes
// the deletion (it is reported in the server log).
@Injectable()
export class AuditLogsInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditLogsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") return next.handle();
    const request = context.switchToHttp().getRequest<Request & { user?: UserRow }>();
    if (request.method !== "DELETE") return next.handle();
    const pattern = String((request.route as { path?: string } | undefined)?.path ?? request.path).replace(PREFIX, "");
    if (NOT_AUDITED.includes(pattern)) return next.handle();
    const params = (request.params ?? {}) as Record<string, string>;
    const recordId = Object.values(params).at(-1) ?? null;
    const path = request.path;
    return from(this.audit.snapshot(pattern, params)).pipe(
      switchMap((row) =>
        next.handle().pipe(
          concatMap((value) =>
            from(this.audit.record({ resource: resourceOf(pattern), recordId, path, user: request.user, row })).pipe(
              catchError((error: unknown) => {
                console.error("[audit] could not record a deletion:", error instanceof Error ? error.message : error);
                return of(undefined);
              }),
              map(() => value),
            ),
          ),
        ),
      ),
    );
  }
}
