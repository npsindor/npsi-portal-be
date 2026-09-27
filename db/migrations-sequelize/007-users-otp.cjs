const { DataTypes } = require("sequelize");

module.exports = {
  async up(queryInterface) {
    await queryInterface.addColumn("users", "otp_hash", { type: DataTypes.STRING(255) });
    await queryInterface.addColumn("users", "otp_expires_at", { type: DataTypes.DATE });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn("users", "otp_hash");
    await queryInterface.removeColumn("users", "otp_expires_at");
  },
};
