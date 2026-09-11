'use strict';

const bcrypt = require('bcryptjs');

const DEMO_PASSWORD = 'password123';

const USERS = [
  { name: 'Aarav Sharma', email: 'employee@company.com', role: 'EMPLOYEE', department: 'Engineering' },
  { name: 'Priya Nair', email: 'manager@company.com', role: 'MANAGER', department: 'Engineering' },
  { name: 'Rohit Verma', email: 'finance@company.com', role: 'FINANCE', department: 'Finance' },
  { name: 'Ananya Iyer', email: 'compliance@company.com', role: 'COMPLIANCE', department: 'Legal & Compliance' },
  { name: 'Vikram Rao', email: 'director@company.com', role: 'DIRECTOR', department: 'Executive' },
  { name: 'Sameer Khan', email: 'it@company.com', role: 'IT', department: 'IT Operations' },
  { name: 'Meera Joshi', email: 'admin@company.com', role: 'ADMIN', department: 'IT Operations' },
  { name: 'Kavya Menon', email: 'employee2@company.com', role: 'EMPLOYEE', department: 'Sales' },
];

module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

    const [roles] = await queryInterface.sequelize.query('SELECT id, name FROM roles');
    const [departments] = await queryInterface.sequelize.query('SELECT id, name FROM departments');

    const roleId = (name) => roles.find((r) => r.name === name).id;
    const departmentId = (name) => departments.find((d) => d.name === name).id;

    await queryInterface.bulkInsert(
      'users',
      USERS.map((user) => ({
        name: user.name,
        email: user.email,
        password_hash: passwordHash,
        department_id: departmentId(user.department),
        role_id: roleId(user.role),
        status: 'ACTIVE',
        created_at: now,
        updated_at: now,
      })),
      {}
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete(
      'users',
      { email: { [Sequelize.Op.in]: USERS.map((u) => u.email) } },
      {}
    );
  },
};
