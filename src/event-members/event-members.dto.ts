import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { ArrayMaxSize, Equals, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from "class-validator";

// Error texts are codes; the frontend shows them in English or Hindi.
const blankToUndefined = ({ value }: { value: unknown }) =>
  typeof value === "string" && !value.trim() ? undefined : typeof value === "string" ? value.replace(/\s+/g, " ").trim() : value;
const MOBILE = /^(\+?91[\s-]?)?[6-9]\d{9}$/;

export const OTHER_SECTION = "OTHER";
export const APPLICATION_STATUSES = ["PENDING", "APPROVED", "REJECTED", "REMOVED", "WITHDRAWN"] as const;

// The one "Become a Member" form, from the public footer and from the member/student dashboards.
export class EventMemberApplyDto {
  @ApiProperty({ example: "DEEPOTSAV", description: "Section key from GET /event-member-sections, or OTHER" })
  @Transform(blankToUndefined)
  @IsString({ message: "EM_SECTION" })
  @MaxLength(40)
  sectionKey!: string;

  @ApiPropertyOptional({ description: "Event / team name; required with OTHER" })
  @Transform(blankToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(150, { message: "EM_OTHER_NAME" })
  customEventName?: string;

  @ApiPropertyOptional({ enum: ["MEMBER", "STUDENT"], description: "Logged-in: which own record applies (GET /event-member-applications/candidates)" })
  @IsOptional()
  @IsIn(["MEMBER", "STUDENT"])
  personKind?: "MEMBER" | "STUDENT";

  @ApiPropertyOptional({ description: "Family member id or student id of that record" })
  @Transform(blankToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  personId?: string;

  @ApiPropertyOptional({ description: "URL returned by POST /uploads, or the record's own photo" })
  @Transform(blankToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  photoUrl?: string;

  // Name, mobile, email, village and area are required without a linked record. With personKind/personId (a registered
  // member or student) any of them may be left out and is taken from the record (area stays empty).
  @ApiPropertyOptional({ example: "Ram Patidar" })
  @Transform(blankToUndefined)
  @IsOptional()
  @IsString({ message: "EM_NAME" })
  @MinLength(2, { message: "EM_NAME" })
  @MaxLength(120, { message: "EM_NAME" })
  name?: string;

  @ApiPropertyOptional({ example: "9876543210" }) @Transform(blankToUndefined) @IsOptional() @Matches(MOBILE, { message: "EM_MOBILE" }) mobile?: string;
  @ApiPropertyOptional({ example: "ram@example.com" })
  @Transform(blankToUndefined)
  @IsOptional()
  @IsEmail({}, { message: "EM_EMAIL" })
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({ example: "Kasrawad" })
  @Transform(blankToUndefined)
  @IsOptional()
  @IsString({ message: "EM_VILLAGE" })
  @MaxLength(255)
  village?: string;

  @ApiPropertyOptional({ example: "Vijay Nagar", description: "Indore area / locality" })
  @Transform(blankToUndefined)
  @IsOptional()
  @IsString({ message: "EM_AREA" })
  @MaxLength(150)
  area?: string;

  @ApiPropertyOptional({ description: "Show the mobile number on the public card (default no)" }) @IsOptional() @IsBoolean() mobilePublic?: boolean;
  @ApiPropertyOptional({ description: "Show the email on the public card (default no)" }) @IsOptional() @IsBoolean() emailPublic?: boolean;
  @ApiProperty({ description: "Agrees that name, photo, village and area are shown on the team page once approved" })
  @Equals(true, { message: "EM_CONSENT" })
  consent!: boolean;

  @ApiPropertyOptional({ description: "reCAPTCHA token (required when not logged in)" }) @IsOptional() @IsString() recaptchaToken?: string;

  @ApiPropertyOptional({
    description:
      "Admins only: add the person to the team at once (APPROVED). An admin adding someone without a linked record needs only the name and village; mobile, email and area are optional.",
  })
  @IsOptional()
  @IsBoolean()
  approveNow?: boolean;

  @ApiPropertyOptional({ description: "Admins only: the name in Hindi, shown when the site is in Hindi" })
  @Transform(blankToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  nameHi?: string;

  @ApiPropertyOptional({ description: "Admins only: the village in Hindi, shown when the site is in Hindi" })
  @Transform(blankToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  villageHi?: string;

  @ApiPropertyOptional({ description: "Admins only: role shown on the card, e.g. Coordinator" })
  @Transform(blankToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(150)
  designation?: string;
  @ApiPropertyOptional({ description: "Admins only: the role in Hindi" })
  @Transform(blankToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(150)
  designationHi?: string;
}

export class EventMemberReviewDto {
  @ApiProperty({ enum: ["APPROVED", "REJECTED"] }) @IsIn(["APPROVED", "REJECTED"]) decision!: "APPROVED" | "REJECTED";
  @ApiPropertyOptional({ description: "Required when rejecting" }) @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @ApiPropertyOptional({ description: "Section key; required to approve an OTHER request (maps it to a section)" })
  @Transform(blankToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(40)
  sectionKey?: string;
}

// Admin edits: public-profile details only (the member's master record is never changed).
export class EventMemberUpdateDto {
  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsString() @MinLength(2, { message: "EM_NAME" }) @MaxLength(120) name?: string;
  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(150) designation?: string | null;
  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(150) designationHi?: string | null;
  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(255) village?: string;
  @ApiPropertyOptional({ description: "Name in Hindi" }) @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(255) nameHi?: string;
  @ApiPropertyOptional({ description: "Village in Hindi" }) @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(255) villageHi?: string;
  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(150) area?: string;
  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(500) photoUrl?: string | null;
  @ApiPropertyOptional({ description: "Move to another section (maps an OTHER request)" })
  @Transform(blankToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(40)
  sectionKey?: string;
  @ApiPropertyOptional({ description: "Public card shown or hidden" }) @IsOptional() @IsBoolean() showOnWebsite?: boolean;
  @ApiPropertyOptional({ description: "Can only be turned off by an admin (consent belongs to the member)" }) @IsOptional() @IsBoolean() mobilePublic?: boolean;
  @ApiPropertyOptional({ description: "Can only be turned off by an admin" }) @IsOptional() @IsBoolean() emailPublic?: boolean;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100000) sortOrder?: number;
}

export class EventMemberRemoveDto {
  @ApiProperty({ description: "Why the membership ends (kept in the history)" })
  @Transform(blankToUndefined)
  @IsString({ message: "EM_REASON" })
  @MaxLength(500)
  reason!: string;
}

export class EventMemberOrderDto {
  @ApiProperty({ type: String, isArray: true, description: "The team's members in the order the website shows them (first = 1)" })
  @IsArray()
  @ArrayMaxSize(2000)
  @IsString({ each: true })
  ids!: string[];
}

export class EventMemberSectionDto {
  @ApiPropertyOptional({ description: "Shown in the form dropdown" }) @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(150) label?: string;
  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(150) labelHi?: string | null;
  @ApiPropertyOptional({ description: "Heading on the public page, e.g. Holi Milan Team" })
  @Transform(blankToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(150)
  heading?: string;
  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(150) headingHi?: string | null;
  @ApiPropertyOptional({ description: "Event whose page shows this team (null: own team page)" })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  eventId?: string | null;
  @ApiPropertyOptional({ description: "Shown in the Become a Member dropdown" }) @IsOptional() @IsBoolean() accepting?: boolean;
  @ApiPropertyOptional({ enum: ["ACTIVE", "INACTIVE"] }) @IsOptional() @IsIn(["ACTIVE", "INACTIVE"]) status?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1000) sortOrder?: number;
}
