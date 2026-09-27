const { DataTypes } = require("sequelize");

module.exports = {
  async up(queryInterface) {
    await queryInterface.addColumn("users", "phone", { type: DataTypes.STRING(20) });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn("users", "phone");
  },
};
