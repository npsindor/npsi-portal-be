import { HttpException } from "@nestjs/common";

// The one error shape the API has always used: `{ "error": "<message>" }`.
export interface ErrorBody {
  error: string;
}

export class ApiError extends HttpException {
  constructor(status: number, message: string) {
    super({ error: message } satisfies ErrorBody, status);
  }
}
