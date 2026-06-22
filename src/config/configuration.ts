export interface AppConfig {
  nodeEnv: string;
  port: number;
  database: {
    path: string;
    synchronize: boolean;
    logging: boolean;
  };
  hcm: {
    baseUrl: string;
    apiKey: string;
    timeoutMs: number;
  };
}

const toBool = (value: string | undefined, fallback: boolean): boolean =>
  value === undefined ? fallback : ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());

const toInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: toInt(process.env.PORT, 3000),
  database: {
    path: process.env.DB_PATH ?? './data/timeoff.sqlite',
    synchronize: toBool(process.env.DB_SYNCHRONIZE, true),
    logging: toBool(process.env.DB_LOGGING, false),
  },
  hcm: {
    baseUrl: process.env.HCM_BASE_URL ?? 'http://localhost:4000',
    apiKey: process.env.HCM_API_KEY ?? 'dev-placeholder-key',
    timeoutMs: toInt(process.env.HCM_TIMEOUT_MS, 5000),
  },
});
