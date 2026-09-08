const path = require("node:path");
const { execSync } = require("node:child_process");
const dotenv = require("dotenv");

module.exports = async () => {
  dotenv.config({ path: path.join(__dirname, "..", ".env.test"), override: true });
  // Ensure the isolated test database schema is up to date before the suite runs.
  execSync("npx prisma migrate deploy", {
    cwd: path.join(__dirname, ".."),
    env: process.env,
    stdio: "inherit",
  });
};
