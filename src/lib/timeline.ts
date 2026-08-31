import { spawn } from "node:child_process";
import type { MediaItem } from "@/lib/media";

/**
 * โครงสร้างเดียวกับ TimelineItem ที่ src/app/video-studio/page.tsx และ
 * src/app/api/video/render/route.ts ใช้อยู่แล้ว (id, fileName, start, duration, index)
 * — ต้องเข้ากันได้ 100% เพราะ Render API รับ timeline ตรงๆ ผ่าน FormData
 */
export type TimelineItem = {
  id: string;
  fileName: string;
  start: number;
  duration: number;
  index: number;
};

export type CreateTimelineResult = {
  items: TimelineItem[];
  duration: number;
  status: "ready" | "no_media";
};

/**
 * อ่านความยาวไฟล์เสียงจริงด้วย ffprobe (เครื่องมือชุดเดียวกับที่ /api/video/render ใช้ ffmpeg อยู่แล้ว
 * ไม่ใช่ dependency ใหม่) เพื่อให้ timeline ที่สร้างขึ้นอิง duration จริงของเสียงพากย์ ไม่ใช่ค่าประมาณ
 */
function probeAudioDuration(filePath: string): Promise<number> {
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
            `ffprobe อ่านความยาวไฟล์เสียงไม่สำเร็จ (exit code ${code})\n${stderr.slice(-2000)}`
          )
        );
        return;
      }

      const duration = Number(stdout.trim());

      if (!Number.isFinite(duration) || duration <= 0) {
        reject(new Error("ไม่สามารถอ่านความยาวไฟล์เสียงพากย์ได้"));
        return;
      }

      resolve(duration);
    });
  });
}

/**
 * สร้าง Timeline จากความยาวเสียงพากย์จริง + รายการ media ที่มีอยู่ (จาก src/lib/media.ts)
 *
 * ถ้ายังไม่มี media (STEP 4 คืน no_media) จะไม่สร้าง TimelineItem ปลอมที่อ้างอิงไฟล์ที่ไม่มีจริง —
 * คืน items ว่างเปล่าพร้อม status "no_media" แต่ยังคง duration จริงของเสียงไว้ให้ ขั้นตอนถัดไปใช้งานได้
 * เมื่อมี media จริงเข้ามา (ใน STEP ถัดไป) ฟังก์ชันนี้จะแบ่งเวลาเท่าๆ กันตามจำนวน media เหมือนกับ
 * createTimeline() ฝั่ง Video Studio (src/app/video-studio/page.tsx) ทุกประการ เพื่อให้ผลลัพธ์เข้ากันได้
 */
export async function createTimeline(
  audioFilePath: string,
  media: MediaItem[]
): Promise<CreateTimelineResult> {
  const audioDuration = await probeAudioDuration(audioFilePath);

  if (media.length === 0) {
    return {
      items: [],
      duration: audioDuration,
      status: "no_media",
    };
  }

  const durationPerItem = audioDuration / media.length;

  const items: TimelineItem[] = media.map((item, index) => ({
    id: `${item.fileName}-${index}`,
    fileName: item.fileName,
    start: index * durationPerItem,
    duration: durationPerItem,
    index: index + 1,
  }));

  return {
    items,
    duration: audioDuration,
    status: "ready",
  };
}
