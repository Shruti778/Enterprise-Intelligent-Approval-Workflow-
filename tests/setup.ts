import { sequelize } from '../src/models';

afterAll(async () => {
  await sequelize.close();
});
