import { createApp } from './app';
import { env } from './config/env';
import { sequelize } from './models';

async function bootstrap() {
  try {
    await sequelize.authenticate();
    // eslint-disable-next-line no-console
    console.log(`[db] connected to ${env.db.name}@${env.db.host}:${env.db.port}`);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[db] connection failed:', error);
    process.exit(1);
  }

  const app = createApp();
  app.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[api] listening on http://localhost:${env.port}/api`);
  });
}

bootstrap();
