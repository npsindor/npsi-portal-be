import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsArray, IsIn, IsOptional, ValidateNested } from "class-validator";
import { ListQueryDto, orderValues } from "../../common/dto/list-query.dto.js";
import { OptionalBoolean, OptionalDate, OptionalText, RequiredText } from "../../common/validation/fields.js";

export class CreateNotificationDto {
  @RequiredText("Title is required.")
  title!: string;

  @RequiredText("Message is required.")
  message!: string;

  @RequiredText("Type is required.", 255, { description: "e.g. Registration, Event, Approval, Announcement" })
  type!: string;

  @OptionalText(255, { description: "Family (or application) display id; empty or omitted = everyone (admins only)" })
  recipientFamilyId?: string | null;

  @OptionalBoolean({ notNull: true })
  read?: boolean;

  @OptionalDate()
  date?: string | null;

  @OptionalText(undefined, { description: "In-app link (admins only)" })
  deepLink?: string | null;
}

export class UpdateNotificationDto extends PartialType(CreateNotificationDto) {}

export class NotificationBatchDto {
  @ApiProperty({ type: CreateNotificationDto, isArray: true })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateNotificationDto)
  records?: CreateNotificationDto[];
}

export const NOTIFICATION_ORDERS = orderValues(["date", "createdAt"] as const);

export class NotificationListQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: NOTIFICATION_ORDERS, default: "-createdAt" })
  @IsOptional()
  @IsIn(NOTIFICATION_ORDERS)
  order?: (typeof NOTIFICATION_ORDERS)[number];
}
