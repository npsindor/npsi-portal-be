import { ApiProperty } from "@nestjs/swagger";
import type { Notification } from "../../generated/prisma/client.js";

export class NotificationVo {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() message!: string;
  @ApiProperty() type!: string;
  @ApiProperty({ type: "string", nullable: true, description: "null = everyone" }) recipientFamilyId!: string | null;
  @ApiProperty() read!: boolean;
  @ApiProperty({ type: "string", format: "date-time", nullable: true }) date!: Date | null;
  @ApiProperty({ type: "string", nullable: true }) deepLink!: string | null;
  @ApiProperty({ type: "string", format: "date-time" }) createdAt!: Date;
  @ApiProperty({ type: "string", format: "date-time" }) updatedAt!: Date;
}

export const toNotificationVo = (row: Notification): NotificationVo => ({
  id: row.id,
  title: row.title,
  message: row.message,
  type: row.type,
  recipientFamilyId: row.recipientFamilyId,
  read: row.read,
  date: row.date,
  deepLink: row.deepLink,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});
