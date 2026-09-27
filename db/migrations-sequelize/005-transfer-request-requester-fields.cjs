const { DataTypes } = require("sequelize");

module.exports = {
  async up(queryInterface) {
    await queryInterface.addColumn("transfer_requests", "requester_name", { type: DataTypes.STRING(255) });
    await queryInterface.addColumn("transfer_requests", "requester_email", { type: DataTypes.STRING(255) });
    await queryInterface.addColumn("transfer_requests", "requester_mobile", { type: DataTypes.STRING(255) });
    await queryInterface.addColumn("transfer_requests", "target_family_name", { type: DataTypes.TEXT });
    await queryInterface.addColumn("transfer_requests", "requested_date", { type: DataTypes.DATE });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn("transfer_requests", "requester_name");
    await queryInterface.removeColumn("transfer_requests", "requester_email");
    await queryInterface.removeColumn("transfer_requests", "requester_mobile");
    await queryInterface.removeColumn("transfer_requests", "target_family_name");
    await queryInterface.removeColumn("transfer_requests", "requested_date");
  },
};
