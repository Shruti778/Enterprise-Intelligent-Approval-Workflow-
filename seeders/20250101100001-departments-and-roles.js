'use strict';

const DEPARTMENTS = [
  'Engineering',
  'Finance',
  'Legal & Compliance',
  'Executive',
  'IT Operations',
  'Human Resources',
  'Sales',
];

const ROLES = ['EMPLOYEE', 'MANAGER', 'FINANCE', 'COMPLIANCE', 'DIRECTOR', 'IT', 'ADMIN'];

module.exports = {
  async up(queryInterface) {
    const now = new Date();

    await queryInterface.bulkInsert(
      'departments',
      DEPARTMENTS.map((name) => ({ name, created_at: now, updated_at: now })),
      {}
    );

    await queryInterface.bulkInsert(
      'roles',
      ROLES.map((name) => ({ name, created_at: now, updated_at: now })),
      {}
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('roles', null, {});
    await queryInterface.bulkDelete('departments', null, {});
  },
};
