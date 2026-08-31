"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

function VoiceStudioContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [script, setScript] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");

  useEffect(() => {
    const scriptFromUrl = searchParams.get("script");

    if (scriptFromUrl) {
      setScript(scriptFromUrl);
    }
  }, [searchParams]);

  useEffect(() => {
    return () => {
      if (audioUrl && audioUrl.startsWith("blob:")) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  async function prepareVoice() {
    if (!script.trim()) {
      setStatus("กรุณาใส่สคริปต์ก่อน");
      return;
    }

    setLoading(true);
    setStatus("");

    if (audioUrl && audioUrl.startsWith("blob:")) {
      URL.revokeObjectURL(audioUrl);
    }

    setAudioUrl("");

    try {
      const response = await fetch("/api/voice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
          script: script.trim(),
        }),
      });

      if (!response.ok) {
        let errorMessage = "ไม่สามารถสร้างเสียงพากย์ได้";

        try {
          const data = await response.json();
          errorMessage = data.error || errorMessage;
        } catch {
          // Response ไม่ใช่ JSON
        }

        throw new Error(errorMessage);
      }

      const contentType = response.headers.get("Content-Type") || "";

      if (!contentType.includes("audio/mpeg")) {
        throw new Error(
          `เซิร์ฟเวอร์ส่งข้อมูลไม่ใช่ MP3 (${contentType || "ไม่ทราบชนิดไฟล์"})`
        );
      }

      const serverAudioUrl =
        response.headers.get("X-Audio-Url") || "";

      const audioBlob = await response.blob();
      const previewUrl = URL.createObjectURL(audioBlob);

      setAudioUrl(serverAudioUrl || previewUrl);

      setStatus(
        serverAudioUrl
          ? "✅ สร้างเสียงพากย์ภาษาไทยและบันทึกไฟล์เรียบร้อยแล้ว"
          : "✅ สร้างเสียงพากย์ภาษาไทยเรียบร้อยแล้ว"
      );
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "เกิดข้อผิดพลาดในการสร้างเสียงพากย์"
      );
    } finally {
      setLoading(false);
    }
  }

  function sendToVideoStudio() {
    if (!audioUrl) {
      setStatus("กรุณาสร้างเสียงพากย์ก่อน");
      return;
    }

    const params = new URLSearchParams({
      script: script.trim(),
      audioUrl,
    });

    router.push(`/video-studio?${params.toString()}`);
  }

  return (
    <main className="min-h-screen bg-black p-6 text-white">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-3xl font-bold">
          🎙️ Voice Studio
        </h1>

        <p className="mt-2 text-gray-400">
          สร้างเสียงพากย์ภาษาไทยสำหรับ THAI AMULET TH
        </p>

        <div className="mt-8">
          <label className="mb-2 block font-medium">
            สคริปต์เสียงพากย์
          </label>

          <textarea
            value={script}
            onChange={(event) => setScript(event.target.value)}
            placeholder="นำสคริปต์จาก Content Studio มาวางที่นี่..."
            className="min-h-[300px] w-full rounded-xl border border-gray-700 bg-gray-900 p-4 text-white outline-none focus:border-gray-400"
          />
        </div>

        <button
          type="button"
          onClick={prepareVoice}
          disabled={loading}
          className="mt-4 rounded-xl bg-white px-6 py-3 font-semibold text-black disabled:opacity-50"
        >
          {loading ? "กำลังสร้างเสียง..." : "🎙️ สร้างเสียงพากย์"}
        </button>

        {status && (
          <div className="mt-6 rounded-xl border border-gray-700 bg-gray-900 p-4">
            {status}
          </div>
        )}

        {audioUrl && (
          <div className="mt-6 rounded-xl border border-gray-700 bg-gray-900 p-5">
            <h2 className="mb-3 text-lg font-semibold">
              🔊 เสียงพากย์ที่สร้างแล้ว
            </h2>

            <audio
              controls
              src={audioUrl}
              className="w-full"
            />

            <div className="mt-4 flex flex-wrap gap-3">
              <a
                href={audioUrl}
                download="thai-amulet-voice.mp3"
                className="rounded-xl bg-white px-5 py-3 font-semibold text-black"
              >
                ⬇️ ดาวน์โหลด MP3
              </a>

              <button
                type="button"
                onClick={sendToVideoStudio}
                className="rounded-xl bg-gray-800 px-5 py-3 font-semibold text-white hover:bg-gray-700"
              >
                🎬 ส่งไป Video Studio
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
export default function VoiceStudioPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-black p-6 text-white">
          <div className="mx-auto max-w-5xl">
            <p className="text-gray-400">กำลังโหลด Voice Studio...</p>
          </div>
        </main>
      }
    >
      <VoiceStudioContent />
    </Suspense>
  );
}


