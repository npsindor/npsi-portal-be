import { Module } from "@nestjs/common";
import { AnnouncementsModule } from "./announcements/announcements.module.js";
import { ApplicationsModule } from "./applications/applications.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { CommonModule } from "./common/common.module.js";
import { AppConfigModule } from "./config/config.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { EventRegistrationsModule } from "./event-registrations/event-registrations.module.js";
import { EventsModule } from "./events/events.module.js";
import { FamiliesModule } from "./families/families.module.js";
import { FamilyMembersModule } from "./family-members/family-members.module.js";
import { FeedbackModule } from "./feedback/feedback.module.js";
import { HealthModule } from "./health/health.module.js";
import { LookupsModule } from "./lookups/lookups.module.js";
import { MeModule } from "./me/me.module.js";
import { NotificationsModule } from "./notifications/notifications.module.js";
import { PrinciplesModule } from "./principles/principles.module.js";
import { RulesModule } from "./rules/rules.module.js";
import { SamitiMembersModule } from "./samiti-members/samiti-members.module.js";
import { SamitisModule } from "./samitis/samitis.module.js";
import { StudentApplicationsModule } from "./student-applications/student-applications.module.js";
import { StudentsModule } from "./students/students.module.js";
import { TransactionsModule } from "./transactions/transactions.module.js";
import { TransferRequestsModule } from "./transfer-requests/transfer-requests.module.js";
import { UploadsModule } from "./uploads/uploads.module.js";

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    CommonModule,
    HealthModule,
    AuthModule,
    MeModule,
    LookupsModule,
    UploadsModule,
    AnnouncementsModule,
    ApplicationsModule,
    EventRegistrationsModule,
    EventsModule,
    FamiliesModule,
    FamilyMembersModule,
    FeedbackModule,
    NotificationsModule,
    PrinciplesModule,
    RulesModule,
    SamitiMembersModule,
    SamitisModule,
    StudentApplicationsModule,
    StudentsModule,
    TransactionsModule,
    TransferRequestsModule,
  ],
})
export class AppModule {}
