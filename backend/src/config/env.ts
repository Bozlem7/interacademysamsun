import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "8h",
  tcEncryptionKey: required("TC_ENCRYPTION_KEY"),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  whatsapp: {
    apiToken: process.env.WHATSAPP_API_TOKEN ?? "",
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
  },
  seedAdminPasswords: {
    admin1: process.env.SEED_ADMIN1_PASSWORD ?? "inter_pass_10",
    admin2: process.env.SEED_ADMIN2_PASSWORD ?? "inter_pass_20",
    admin3: process.env.SEED_ADMIN3_PASSWORD ?? "inter_pass_30",
  },
};
