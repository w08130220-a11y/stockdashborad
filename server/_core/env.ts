export const ENV = {
  appId: process.env.VITE_APP_ID ?? "stock-dashboard",
  cookieSecret: process.env.JWT_SECRET ?? "dev-secret-change-in-production",
  databaseUrl: process.env.DATABASE_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "local-owner",
  isProduction: process.env.NODE_ENV === "production",
  yfinanceUrl: process.env.YFINANCE_API_URL ?? "http://localhost:5001",
};
