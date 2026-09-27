const { DataTypes, Sequelize } = require("sequelize");

const tables = ["announcements", "applications", "events", "event_registrations", "families", "family_members", "student_applications", "students", "transactions", "notifications", "rules", "principles", "samitis", "samiti_members", "feedback", "transfer_requests", "users"];
const timestamp = (updated) => ({ type: DataTypes.DATE, allowNull: false, defaultValue: updated ? Sequelize.literal("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP") : Sequelize.literal("CURRENT_TIMESTAMP") });

module.exports = {
  async up(queryInterface) {
    for (const table of tables) {
      await queryInterface.changeColumn(table, "created_at", timestamp(false));
      await queryInterface.changeColumn(table, "updated_at", timestamp(true));
    }
  },
  async down(queryInterface) {
    for (const table of tables) {
      await queryInterface.changeColumn(table, "created_at", { type: DataTypes.DATE, allowNull: false });
      await queryInterface.changeColumn(table, "updated_at", { type: DataTypes.DATE, allowNull: false });
    }
  },
};