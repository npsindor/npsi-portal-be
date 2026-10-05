import path from "node:path";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvironmentVariables } from "./env.validation.js";
import { PROJECT_ROOT } from "./project-root.js";

// Typed accessors with exactly the legacy defaults. Values are read on every
// call (not cached) so tests can change process.env between cases.
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<EnvironmentVariables, true>) {}

  private get(key: keyof EnvironmentVariables): string | undefined {
    return this.config.get(key, { infer: true }) ?? process.env[key];
  }

  get port(): number {
    return Number(this.get("API_PORT") || 4000);
  }
  get frontendUrl(): string {
    return (this.get("FRONTEND_URL") || "http://localhost:5173").replace(/\/+$/, "");
  }
  get adminEmails(): string[] {
    return (this.get("ADMIN_NOTIFICATION_EMAILS") || "info@npsindore.org,npsindor@gmail.com")
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);
  }
  get uploadsDir(): string {
    const dir = this.get("UPLOADS_DIR");
    return dir ? path.resolve(dir) : path.join(PROJECT_ROOT, "uploads");
  }
  get trustProxy(): number | string {
    const value = this.get("TRUST_PROXY") || "1";
    return /^\d+$/.test(value) ? Number(value) : value;
  }
  get appEnv(): string {
    return this.get("APP_ENV") || "development";
  }
  get recaptchaSecret(): string | undefined {
    return this.get("RECAPTCHA_SECRET_KEY");
  }
  get database() {
    return {
      name: this.get("MYSQL_DATABASE") || "patidar_samaj",
      user: this.get("MYSQL_USER") || "root",
      password: this.get("MYSQL_PASSWORD") || "cdn123",
      host: this.get("MYSQL_HOST") || "localhost",
      port: Number(this.get("MYSQL_PORT") || 3306),
    };
  }
  get smtp() {
    const port = Number(this.get("SMTP_PORT") || 587);
    return {
      host: this.get("SMTP_HOST"),
      port,
      secure: port === 465,
      user: this.get("SMTP_USER"),
      pass: this.get("SMTP_PASS"),
      from: this.get("SMTP_FROM") || this.get("SMTP_USER"),
    };
  }
}
