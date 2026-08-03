const fs = require("fs");
const path = require("path");

const PUBLIC_DISCORD_PLACEHOLDER = "https://discord.com/api/webhooks/secure-server-endpoint";

module.exports = function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Method not allowed");
    return;
  }

  const loaderPath = path.join(process.cwd(), "assets", "js", "exam-loader-x8p2.js");
  const source = fs.readFileSync(loaderPath, "utf8");
  const sanitizedSource = source.replace(
    /const EXAM_RESULTS_WEBHOOK_URL = "https:\/\/discord\.com\/api\/webhooks\/[^"]+";/,
    `const EXAM_RESULTS_WEBHOOK_URL = "${PUBLIC_DISCORD_PLACEHOLDER}";`
  );

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(sanitizedSource);
};
