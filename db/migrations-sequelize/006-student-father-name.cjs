const { DataTypes } = require("sequelize");

module.exports = {
  async up(queryInterface) {
    await queryInterface.addColumn("student_applications", "father_name", { type: DataTypes.STRING(255) });
    await queryInterface.addColumn("students", "father_name", { type: DataTypes.STRING(255) });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn("student_applications", "father_name");
    await queryInterface.removeColumn("students", "father_name");
  },
};
