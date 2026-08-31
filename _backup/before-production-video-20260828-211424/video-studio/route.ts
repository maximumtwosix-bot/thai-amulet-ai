import { NextResponse } from "next/server";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

export const runtime = "nodejs";

type TimelineItem = {
  id?: string;
  fileName: string;
  start: number;
  duration: number;
  index: number;
};

function runFFmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, {
      windowsHide: true,
    });

    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `FFmpeg ทำงานไม่สำเร็จ (exit code ${code})\n${stderr.slice(-6000)}`
        )
      );
    });
  });
}

function formatSrtTime(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = Math.floor(safeSeconds % 60);
  const milliseconds = Math.floor(
    (safeSeconds - Math.floor(safeSeconds)) * 1000
  );

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(milliseconds).padStart(3, "0")}`;
}

function escapeSrtText(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/\n+/g, " ")
    .trim();
}

function createSrt(
  script: string,
  timeline: TimelineItem[]
): string {
  const cleanScript = escapeSrtText(script);

  if (!cleanScript) {
    return "";
  }

  const words = cleanScript.split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return "";
  }

  const totalDuration = timeline.reduce(
    (total, item) => total + Number(item.duration),
    0
  );

  if (!Number.isFinite(totalDuration) || totalDuration <= 0) {
    return "";
  }

  const wordsPerSecond = words.length / totalDuration;

  const entries: string[] = [];
  let wordCursor = 0;

  timeline.forEach((item, index) => {
    const start = Number(item.start);
    const duration = Number(item.duration);
    const end = start + duration;

    if (
      !Number.isFinite(start) ||
      !Number.isFinite(duration) ||
      duration <= 0
    ) {
      return;
    }

    const estimatedWords = Math.max(
      1,
      Math.round(duration * wordsPerSecond)
    );

    const sceneWords = words.slice(
      wordCursor,
      wordCursor + estimatedWords
    );

    wordCursor += sceneWords.length;

    if (sceneWords.length === 0) {
      return;
    }

    entries.push(
      `${index + 1}\n` +
        `${formatSrtTime(start)} --> ${formatSrtTime(end)}\n` +
        `${sceneWords.join(" ")}\n`
    );
  });

  if (wordCursor < words.length && entries.length > 0) {
    const lastEntry = entries[entries.length - 1];
    const remainingWords = words.slice(wordCursor);

    entries[entries.length - 1] =
      lastEntry.trimEnd() +
      " " +
      remainingWords.join(" ") +
      "\n";
  }

  return entries.join("\n");
}
function getPublicFilePath(publicUrl: string): string {
  if (!publicUrl || !publicUrl.startsWith("/")) {
    throw new Error("audioUrl ไม่ถูกต้อง");
  }

  const cleanUrl = decodeURIComponent(publicUrl.split("?")[0]);

  if (
    cleanUrl.includes("..") ||
    !cleanUrl.startsWith("/generated/")
  ) {
    throw new Error("ไม่อนุญาตให้เข้าถึงไฟล์เสียงนี้");
  }

  return path.join(
    process.cwd(),
    "public",
    cleanUrl.replace(/^\/+/, "")
  );
}

export async function POST(request: Request) {
  const jobId = randomUUID();

  const workDir = path.join(
    process.cwd(),
    ".tmp",
    "video-render",
    jobId
  );

  const outputDir = path.join(
    process.cwd(),
    "public",
    "generated",
    "video"
  );

  try {
    const formData = await request.formData();

    const timelineRaw = formData.get("timeline");
    const audioUrlRaw = formData.get("audioUrl");
    const scriptRaw = formData.get("script");

    if (typeof timelineRaw !== "string") {
      return NextResponse.json(
        { error: "ไม่พบ Timeline สำหรับสร้างวิดีโอ" },
        { status: 400 }
      );
    }

    if (typeof scriptRaw !== "string" || !scriptRaw.trim()) {
      return NextResponse.json(
        { error: "ไม่พบ Script สำหรับสร้าง Subtitle" },
        { status: 400 }
      );
    }
    if (typeof audioUrlRaw !== "string" || !audioUrlRaw.trim()) {
      return NextResponse.json(
        { error: "ไม่พบเสียงพากย์สำหรับสร้างวิดีโอ" },
        { status: 400 }
      );
    }

    let timeline: TimelineItem[];

    try {
      timeline = JSON.parse(timelineRaw);
    } catch {
      return NextResponse.json(
        { error: "รูปแบบ Timeline ไม่ถูกต้อง" },
        { status: 400 }
      );
    }

    if (!Array.isArray(timeline) || timeline.length === 0) {
      return NextResponse.json(
        { error: "กรุณาระบุ Timeline อย่างน้อย 1 Scene" },
        { status: 400 }
      );
    }

    const mediaFiles = formData
      .getAll("media")
      .filter((value): value is File => value instanceof File);

    if (mediaFiles.length === 0) {
      return NextResponse.json(
        { error: "กรุณาเลือกไฟล์รูปภาพหรือวิดีโออย่างน้อย 1 ไฟล์" },
        { status: 400 }
      );
    }

    await mkdir(workDir, { recursive: true });
    await mkdir(outputDir, { recursive: true });
    const subtitlePath = path.join(
      workDir,
      "subtitles.srt"
    );

    const subtitleContent = createSrt(
      scriptRaw,
      timeline
    );

    if (!subtitleContent) {
      throw new Error(
        "ไม่สามารถสร้าง Subtitle จาก Script ได้"
      );
    }

    await writeFile(
      subtitlePath,
      subtitleContent,
      "utf8"
    );

    console.log("สร้าง Subtitle SRT สำเร็จ");
    console.log(subtitlePath);
    const inputFiles: string[] = [];

    for (let index = 0; index < mediaFiles.length; index++) {
      const file = mediaFiles[index];

      if (
        !file.type.startsWith("image/") &&
        !file.type.startsWith("video/")
      ) {
        throw new Error(
          `ไฟล์ ${file.name} ไม่ใช่รูปภาพหรือวิดีโอ`
        );
      }

      const extension =
        path.extname(file.name).toLowerCase() ||
        (file.type.startsWith("image/") ? ".jpg" : ".mp4");

      const inputPath = path.join(
        workDir,
        `input-${index}${extension}`
      );

      const buffer = Buffer.from(await file.arrayBuffer());

      await writeFile(inputPath, buffer);

      inputFiles.push(inputPath);
    }

    const audioPath = getPublicFilePath(audioUrlRaw);

    const outputFileName = `video-${Date.now()}-${jobId}.mp4`;

    const outputPath = path.join(
      outputDir,
      outputFileName
    );

    /*
     * สร้าง FFmpeg inputs ตาม Timeline
     *
     * รูปภาพ:
     *   -loop 1
     *
     * วิดีโอ:
     *   -stream_loop -1
     *
     * จากนั้นทุก Scene จะถูก normalize เป็น
     * 1080x1920 / 30fps / yuv420p
     * แล้ว concat เข้าด้วยกัน
     */

    const ffmpegArgs: string[] = ["-y"];

    for (const item of timeline) {
      const inputIndex = item.index - 1;

      if (
        !Number.isInteger(inputIndex) ||
        inputIndex < 0 ||
        inputIndex >= inputFiles.length
      ) {
        throw new Error(
          `Scene ${item.index} ไม่พบไฟล์สื่อที่ตรงกัน`
        );
      }

      const duration = Number(item.duration);

      if (!Number.isFinite(duration) || duration <= 0) {
        throw new Error(
          `Scene ${item.index} มีระยะเวลาไม่ถูกต้อง`
        );
      }

      const file = mediaFiles[inputIndex];
      const isImage = file.type.startsWith("image/");

      if (isImage) {
        ffmpegArgs.push(
          "-loop",
          "1",
          "-t",
          duration.toFixed(3),
          "-i",
          inputFiles[inputIndex]
        );
      } else {
        ffmpegArgs.push(
          "-stream_loop",
          "-1",
          "-i",
          inputFiles[inputIndex]
        );
      }
    }

    const audioInputIndex = timeline.length;

    ffmpegArgs.push(
      "-i",
      audioPath
    );

    const filters: string[] = [];
    const concatLabels: string[] = [];

    timeline.forEach((item, index) => {
      const duration = Number(item.duration);

      const label = `v${index}`;

      filters.push(
        `[${index}:v]` +
          `scale=1080:1920:force_original_aspect_ratio=decrease,` +
          `pad=1080:1920:(ow-iw)/2:(oh-ih)/2,` +
          `fps=30,` +
          `trim=duration=${duration.toFixed(3)},` +
          `setpts=PTS-STARTPTS,` +
          `format=yuv420p` +
          `[${label}]`
      );

      concatLabels.push(`[${label}]`);
    });

    filters.push(
      `${concatLabels.join("")}` +
        `concat=n=${timeline.length}:v=1:a=0[concatv]`
    );

    filters.push(
      `[concatv]subtitles='${subtitlePath.replace(/\\/g, "/").replace(/:/g, "\\:")}'[outv]`
    );

    ffmpegArgs.push(
      "-filter_complex",
      filters.join(";"),
      "-map",
      "[outv]",
      "-map",
      `${audioInputIndex}:a:0`,
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ar",
      "48000",
      "-shortest",
      "-movflags",
      "+faststart",
      outputPath
    );

    await runFFmpeg(ffmpegArgs);

    await rm(workDir, {
      recursive: true,
      force: true,
    });

    return NextResponse.json({
      success: true,
      videoUrl: `/generated/video/${outputFileName}`,
      fileName: outputFileName,
      scenes: timeline.length,
      duration: timeline.reduce(
        (total, item) => total + Number(item.duration),
        0
      ),
      message: "สร้างวิดีโอ MP4 พร้อมเสียงพากย์สำเร็จ",
    });
  } catch (error) {
    console.error(
      "POST /api/video/render error:",
      error
    );

    await rm(workDir, {
      recursive: true,
      force: true,
    }).catch(() => {});

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "ไม่สามารถสร้างวิดีโอได้",
      },
      { status: 500 }
    );
  }
}







