/* Config consumed by sequelize-cli for migrations and seeders. */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const ssl = ['true', '1'].includes(String(process.env.DB_SSL || '').toLowerCase());

const base = {
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  dialect: process.env.DB_DIALECT || 'postgres',
  logging: false,
  define: { underscored: true, timestamps: true },
  ...(ssl ? { dialectOptions: { ssl: { require: true, rejectUnauthorized: false } } } : {}),
};

/**
 * dotenv never overwrites an existing process.env value, so inline variables
 * (DB_HOST=... npx sequelize-cli ...) always win over the local .env file.
 * This guard exists because that is the only thing standing between a
 * production migration and the local development database: if the production
 * environment still points at localhost, the inline variables were not passed.
 */
function productionConfig() {
  const host = base.host || '';
  if (host === 'localhost' || host === '127.0.0.1' || host === '') {
    throw new Error(
      `Refusing to run in production against host "${host || '(unset)'}". ` +
        'Pass the cloud database credentials inline, e.g. ' +
        'DB_HOST=... DB_NAME=... DB_USER=... DB_PASSWORD=... DB_SSL=true NODE_ENV=production npx sequelize-cli db:migrate'
    );
  }
  // eslint-disable-next-line no-console
  console.log(`[sequelize-cli] target: ${base.database}@${host} (ssl=${ssl})`);
  return base;
}

module.exports = {
  development: base,
  test: { ...base, database: `${process.env.DB_NAME}_test` },
  get production() {
    return productionConfig();
  },
};
