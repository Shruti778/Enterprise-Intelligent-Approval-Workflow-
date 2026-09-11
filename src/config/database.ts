import { Sequelize } from 'sequelize';
import { env } from './env';

export const sequelize = new Sequelize(env.db.name, env.db.user, env.db.password, {
  host: env.db.host,
  port: env.db.port,
  dialect: env.db.dialect,
  logging: env.nodeEnv === 'development' ? false : false,
  define: { underscored: true, timestamps: true },
  pool: { max: env.db.poolMax, min: 0, acquire: 30000, idle: 10000 },
  ...(env.db.ssl
    ? { dialectOptions: { ssl: { require: true, rejectUnauthorized: false } } }
    : {}),
});
