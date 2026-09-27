const { DataTypes } = require("sequelize");

// Existing `title`/`description`/`body` stay the English (default/fallback)
// text — these new columns are the optional Hindi translation. Adding a
// separate column per language (rather than replacing the field) means
// every existing event/announcement keeps working exactly as before with no
// backfill needed; admins just start filling in the Hindi field going
// forward, and the public-facing pages fall back to the English text
// whenever no Hindi version has been entered yet.
module.exports = {
  async up(queryInterface) {
    await queryInterface.addColumn("events", "title_hi", { type: DataTypes.TEXT });
    await queryInterface.addColumn("events", "description_hi", { type: DataTypes.TEXT });
    await queryInterface.addColumn("announcements", "title_hi", { type: DataTypes.TEXT });
    await queryInterface.addColumn("announcements", "body_hi", { type: DataTypes.TEXT });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn("events", "title_hi");
    await queryInterface.removeColumn("events", "description_hi");
    await queryInterface.removeColumn("announcements", "title_hi");
    await queryInterface.removeColumn("announcements", "body_hi");
  },
};
