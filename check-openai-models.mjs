import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";

const envPath = path.join(process.cwd(), ".env");
const env = fs.readFileSync(envPath, "utf8");

const match = env.match(/^OPENAI_API_KEY\s*=\s*(.+)$/m);

if (!match) {
  console.error("ไม่พบ OPENAI_API_KEY ใน .env");
  process.exit(1);
}

const apiKey = match[1].trim().replace(/^["']|["']$/g, "");

const openai = new OpenAI({ apiKey });

try {
  const models = await openai.models.list();

  for await (const model of models) {
    if (
      model.id.includes("tts") ||
      model.id.includes("audio") ||
      model.id.includes("gpt-4o-mini")
    ) {
      console.log(model.id);
    }
  }
} catch (error) {
  console.error("OpenAI API error:", error.message);
  process.exit(1);
}
