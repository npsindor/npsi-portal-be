import { plainToInstance } from "class-transformer";
import { IsOptional, IsString, Matches, validateSync } from "class-validator";

const NUMERIC = /^\d*$/;

// Same variable names as the legacy app. Everything is optional because the
// legacy code falls back to defaults for each one; validation only rejects
// values the old code could never have used correctly (non-numeric ports).
export class EnvironmentVariables {
  @IsOptional() @IsString() MYSQL_HOST?: string;
  @IsOptional() @Matches(NUMERIC, { message: "MYSQL_PORT must be a number" }) MYSQL_PORT?: string;
  @IsOptional() @IsString() MYSQL_DATABASE?: string;
  @IsOptional() @IsString() MYSQL_USER?: string;
  @IsOptional() @IsString() MYSQL_PASSWORD?: string;
  @IsOptional() @Matches(NUMERIC, { message: "API_PORT must be a number" }) API_PORT?: string;
  @IsOptional() @IsString() FRONTEND_URL?: string;
  @IsOptional() @IsString() CORS_ORIGINS?: string;
  @IsOptional() @IsString() UPLOADS_DIR?: string;
  @IsOptional() @IsString() TRUST_PROXY?: string;
  @IsOptional() @IsString() APP_ENV?: string;
  @IsOptional() @IsString() RECAPTCHA_SECRET_KEY?: string;
  @IsOptional() @IsString() SMTP_HOST?: string;
  @IsOptional() @Matches(NUMERIC, { message: "SMTP_PORT must be a number" }) SMTP_PORT?: string;
  @IsOptional() @IsString() SMTP_USER?: string;
  @IsOptional() @IsString() SMTP_PASS?: string;
  @IsOptional() @IsString() SMTP_FROM?: string;
  @IsOptional() @IsString() ADMIN_NOTIFICATION_EMAILS?: string;
  // MSG91 (WhatsApp OTP and notices, SMS OTP fallback). All optional: without them OTPs go by email.
  @IsOptional() @IsString() MSG91_AUTH_KEY?: string;
  @IsOptional() @IsString() MSG91_WHATSAPP_NUMBER?: string;
  @IsOptional() @IsString() MSG91_WHATSAPP_NAMESPACE?: string;
  @IsOptional() @IsString() MSG91_WHATSAPP_LANGUAGE?: string;
  @IsOptional() @IsString() MSG91_WHATSAPP_OTP_TEMPLATE?: string;
  @IsOptional() @IsString() MSG91_WHATSAPP_OTP_BUTTON?: string;
  @IsOptional() @IsString() MSG91_WHATSAPP_NOTICE_TEMPLATE?: string;
  @IsOptional() @IsString() MSG91_SMS_OTP_TEMPLATE_ID?: string;
  @IsOptional() @IsString() MSG91_SMS_OTP_VAR?: string;
  @IsOptional() @IsString() PAYMENTS_PRIVATE_DIR?: string;
}

export const validateEnv = (config: Record<string, unknown>): EnvironmentVariables => {
  const validated = plainToInstance(EnvironmentVariables, config);
  const errors = validateSync(validated, { skipMissingProperties: true });
  if (errors.length) throw new Error(`Invalid environment: ${errors.map((e) => Object.values(e.constraints ?? {}).join(", ")).join("; ")}`);
  return validated;
};
