import { Module } from "@nestjs/common";
import { AddressOptionsModule } from "./address-options/address-options.controller.js";
import { AdminAccessModule } from "./admin-access/admin-access.controller.js";
import { AdminDashboardModule } from "./admin-dashboard/admin-dashboard.controller.js";
import { AnnouncementsModule } from "./announcements/announcements.module.js";
import { ApplicationsModule } from "./applications/applications.module.js";
import { AuditLogsModule } from "./audit-logs/audit-logs.controller.js";
import { AuthModule } from "./auth/auth.module.js";
import { BloodHelpModule } from "./blood-help/blood-help.controller.js";
import { CommonModule } from "./common/common.module.js";
import { CommunityPostsModule } from "./community-posts/community-posts.module.js";
import { AppConfigModule } from "./config/config.module.js";
import { ContactInfoModule } from "./contact-info/contact-info.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { EventFinanceModule } from "./event-finance/event-finance.module.js";
import { EventMembersModule } from "./event-members/event-members.controller.js";
import { EventRegistrationsModule } from "./event-registrations/event-registrations.module.js";
import { EventsModule } from "./events/events.module.js";
import { FamiliesModule } from "./families/families.module.js";
import { FamilyMembersModule } from "./family-members/family-members.module.js";
import { FeedbackModule } from "./feedback/feedback.module.js";
import { HealthModule } from "./health/health.module.js";
import { HomeHighlightsModule } from "./home-highlights/home-highlights.module.js";
import { HomeMembersModule } from "./home-members/home-members.controller.js";
import { LookupsModule } from "./lookups/lookups.module.js";
import { MeModule } from "./me/me.module.js";
import { NotificationsModule } from "./notifications/notifications.module.js";
import { PageBlocksModule } from "./page-blocks/page-blocks.module.js";
import { PrinciplesModule } from "./principles/principles.module.js";
import { RegistrationsModule } from "./registrations/registrations.controller.js";
import { RoomHuntingModule } from "./room-hunting/room-hunting.controller.js";
import { RulesModule } from "./rules/rules.module.js";
import { SafarModule } from "./safar-saathi/safar.controller.js";
import { SagunModule } from "./sagun/sagun.controller.js";
import { SagunCardsModule } from "./sagun-cards/sagun-cards.controller.js";
import { SamitiMembersModule } from "./samiti-members/samiti-members.module.js";
import { SamitisModule } from "./samitis/samitis.module.js";
import { SearchModule } from "./search/search.controller.js";
import { SehatModule } from "./sehat-saathi/sehat.controller.js";
import { SeniorDisciplineCommitteeModule } from "./senior-discipline-committee/senior-discipline-committee.module.js";
import { SiteVisibilityModule } from "./site-visibility/site-visibility.controller.js";
import { StudentApplicationsModule } from "./student-applications/student-applications.module.js";
import { StudentsModule } from "./students/students.module.js";
import { TransactionsModule } from "./transactions/transactions.module.js";
import { TransferRequestsModule } from "./transfer-requests/transfer-requests.module.js";
import { UploadsModule } from "./uploads/uploads.module.js";

@Module({
  imports: [
    AppConfigModule,
    SagunModule,
    RegistrationsModule,
    AddressOptionsModule,
    SiteVisibilityModule,
    AdminDashboardModule,
    AdminAccessModule,
    HomeHighlightsModule,
    CommunityPostsModule,
    PageBlocksModule,
    SehatModule,
    SafarModule,
    RoomHuntingModule,
    BloodHelpModule,
    AuditLogsModule,
    HomeMembersModule,
    SagunCardsModule,
    EventMembersModule,
    SearchModule,
    DatabaseModule,
    CommonModule,
    HealthModule,
    ContactInfoModule,
    AuthModule,
    MeModule,
    LookupsModule,
    UploadsModule,
    AnnouncementsModule,
    ApplicationsModule,
    EventRegistrationsModule,
    EventFinanceModule,
    EventsModule,
    FamiliesModule,
    FamilyMembersModule,
    FeedbackModule,
    NotificationsModule,
    PrinciplesModule,
    RulesModule,
    SamitiMembersModule,
    SamitisModule,
    SeniorDisciplineCommitteeModule,
    StudentApplicationsModule,
    StudentsModule,
    TransactionsModule,
    TransferRequestsModule,
  ],
})
export class AppModule {}
