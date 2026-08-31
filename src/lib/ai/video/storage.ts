import { mkdir, writeFile, unlink } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type DownloadedVideo = {
  videoUrl: string;
  fileName: string;
  filePath: string;
  size: number;
  duration: number;
};

// เช็คความยาวไฟล์วิดีโอจริงด้วย ffprobe (เครื่องมือชุดเดียวกับที่ render.ts/timeline.ts ใช้อยู่แล้ว
// ไม่ใช่ dependency ใหม่) — STEP 15: ยืนยันว่าไฟล์ที่ดาวน์โหลดมาเป็นวิดีโอที่เล่นได้จริง มี duration
// เป็นบวกจริง ไม่ใช่แค่ไฟล์ที่มีขนาด > 0 เฉยๆ (ไฟล์เสียหาย/ไม่ใช่วิดีโอจริงก็มีขนาด > 0 ได้เหมือนกัน)
function probeVideoDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `ffprobe อ่านความยาววิดีโอไม่สำเร็จ (exit code ${code})\n${stderr.slice(-2000)}`
          )
        );
        return;
      }

      const duration = Number(stdout.trim());

      if (!Number.isFinite(duration) || duration <= 0) {
        reject(new Error("ไฟล์วิดีโอที่ดาวน์โหลดมาไม่ใช่วิดีโอที่เล่นได้จริง (duration ไม่ถูกต้อง)"));
        return;
      }

      resolve(duration);
    });
  });
}

/**
 * ดาวน์โหลดวิดีโอที่ provider สร้างเสร็จแล้ว (URL ภายนอกที่ provider ยืนยันว่าใช้งานได้จริง)
 * มาเก็บไว้ใน public/generated/ai-video/ ตาม convention เดียวกับไฟล์ที่สร้างในระบบทุกจุด
 * (voice/, video/, ai-images/) — ห้ามคืนค่าสำเร็จถ้าดาวน์โหลดไม่ได้จริง ไฟล์ว่างเปล่า หรือ ffprobe
 * อ่าน duration จริงไม่ได้ (STEP 15 — กันไฟล์เสียหาย/ไม่ใช่วิดีโอจริงหลุดเข้า product_media)
 */
export async function downloadVideoToDisk(remoteUrl: string): Promise<DownloadedVideo> {
  const response = await fetch(remoteUrl);

  if (!response.ok) {
    throw new Error(`ไม่สามารถดาวน์โหลดวิดีโอจาก provider ได้ (HTTP ${response.status})`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (buffer.length === 0) {
    throw new Error("ไฟล์วิดีโอที่ดาวน์โหลดมาว่างเปล่า");
  }

  const directory = path.join(process.cwd(), "public", "generated", "ai-video");

  await mkdir(directory, { recursive: true });

  const fileName = `ai-video-${Date.now()}-${randomUUID()}.mp4`;
  const filePath = path.join(directory, fileName);

  await writeFile(filePath, buffer);

  let duration: number;

  try {
    duration = await probeVideoDuration(filePath);
  } catch (error) {
    // ไฟล์เสียหาย/ไม่ใช่วิดีโอจริง — ลบทิ้งทันที ไม่ปล่อยให้ไฟล์ขยะค้างอยู่ใน product_media ที่ยังไม่ถูก insert
    await unlink(filePath).catch(() => {});
    throw error;
  }

  return {
    videoUrl: `/generated/ai-video/${fileName}`,
    fileName,
    filePath,
    size: buffer.length,
    duration,
  };
}
