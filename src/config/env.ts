import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function bool(name: string, fallback = false): boolean {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return value.toLowerCase() === 'true' || value === '1';
}

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  db: {
    host: required('DB_HOST', 'localhost'),
    port: Number(required('DB_PORT', '5432')),
    name: required('DB_NAME'),
    user: required('DB_USER'),
    password: required('DB_PASSWORD'),
    dialect: (process.env.DB_DIALECT ?? 'postgres') as 'postgres',
    // Hosted Postgres (Neon/Supabase/RDS) requires TLS; local development does not.
    ssl: bool('DB_SSL', false),
    // Serverless runtimes open one pool per warm instance, so keep it small there.
    poolMax: Number(process.env.DB_POOL_MAX ?? 10),
  },
  jwt: {
    secret: required('JWT_SECRET'),
    expiresIn: process.env.JWT_EXPIRES_IN ?? '12h',
  },
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
};
