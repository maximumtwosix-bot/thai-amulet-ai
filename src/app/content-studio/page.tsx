"use client";

import { useEffect, useState } from "react";

type ContentType = "facebook" | "reels" | "tiktok" | "script";
type Tone = "premium" | "friendly" | "sacred" | "sales";

type Product = {
  id: number;
  name: string;
  model: string | null;
  master: string | null;
  year: string | null;
  description: string | null;
  price: number;
  cost: number;
  stock: number;
  category: string | null;
  status: string;
};

const contentTypes = [
  ["facebook", "Facebook Post"],
  ["reels", "Reels"],
  ["tiktok", "TikTok"],
  ["script", "สคริปต์"],
] as const;

const tones = [
  ["premium", "พรีเมียม"],
  ["friendly", "เป็นกันเอง"],
  ["sacred", "เข้มขลัง"],
  ["sales", "เน้นการขาย"],
] as const;

function display(value: string | null | undefined) {
  return value || "-";
}

function numberText(value: number) {
  return Number(value || 0).toLocaleString("th-TH");
}

function createContent(
  product: Product,
  type: ContentType,
  tone: Tone
) {
  const name = display(product.name);
  const model = display(product.model);
  const master = display(product.master);
  const year = display(product.year);
  const price = numberText(product.price);
  const stock = numberText(product.stock);

  const modelLine = model === "-" ? "" : "รุ่น " + model;

  if (type === "facebook") {
    return [
      "✨ " + name + " " + modelLine + " ✨",
      "",
      "วัตถุมงคลสำหรับผู้ที่ศรัทธาและชื่นชอบการสะสม",
      "",
      "📌 รายละเอียด",
      "• ชื่อ: " + name,
      "• รุ่น: " + model,
      "• พระอาจารย์/สำนัก: " + master,
      "• ปี: " + year,
      "• ราคา: " + price + " บาท",
      "• คงเหลือ: " + stock + " ชิ้น",
      "",
      "จุดเด่น",
      "• เหมาะสำหรับผู้ศรัทธาและนักสะสม",
      "• เหมาะสำหรับเก็บสะสมหรือบูชาตามความเชื่อส่วนบุคคล",
      "",
      "🙏 โปรดศึกษาข้อมูลก่อนตัดสินใจ",
      "",
      "สนใจสอบถามรายละเอียดเพิ่มเติม สามารถทักข้อความได้ครับ",
      "",
      "#THAIAMULETTH #วัตถุมงคล #พระเครื่อง #สายมู",
      "",
      "โทน: " + tone,
    ].join("\n");
  }

  if (type === "reels") {
    return [
      "🎬 สคริปต์ Reels: " + name,
      "",
      "HOOK",
      "วันนี้พามาชม " + name + " " + modelLine,
      "",
      "รายละเอียด",
      "พระอาจารย์/สำนัก: " + master,
      "ปี: " + year,
      "",
      "อีกหนึ่งชิ้นที่น่าสนใจสำหรับผู้ที่ชื่นชอบวัตถุมงคลและการสะสม",
      "",
      "ปิดคลิป",
      "สนใจรายละเอียดเพิ่มเติม สามารถสอบถามข้อมูลได้ครับ",
      "",
      "📌 ราคา " + price + " บาท",
      "📦 เหลือ " + stock + " ชิ้น",
      "",
      "#THAIAMULETTH #วัตถุมงคล #Reels",
      "",
      "โทน: " + tone,
    ].join("\n");
  }

  if (type === "tiktok") {
    return [
      "🎵 TikTok: " + name,
      "",
      "สายวัตถุมงคลห้ามพลาด ✨",
      "",
      "วันนี้พามาชม " + name,
      modelLine,
      "พระอาจารย์/สำนัก: " + master,
      "ปี: " + year,
      "",
      "เหมาะสำหรับผู้ที่ชื่นชอบการสะสมวัตถุมงคล",
      "",
      "💰 ราคา " + price + " บาท",
      "",
      "สนใจรายละเอียดเพิ่มเติม ทักข้อความเข้ามาสอบถามได้ครับ",
      "",
      "#THAIAMULETTH #พระเครื่อง #วัตถุมงคล #TikTok",
      "",
      "โทน: " + tone,
    ].join("\n");
  }

  return [
    "🎙️ สคริปต์พูด: " + name,
    "",
    "สวัสดีครับ วันนี้พามาชม " + name,
    "",
    modelLine,
    "พระอาจารย์หรือสำนัก: " + master,
    "จัดสร้างในปี: " + year,
    "",
    "เหมาะสำหรับผู้ที่ศรัทธาและชื่นชอบการสะสมวัตถุมงคล",
    "",
    "ราคา " + price + " บาท",
    "",
    "หากสนใจสามารถสอบถามข้อมูลเพิ่มเติมได้ครับ",
    "",
    "ขอบคุณที่ติดตาม THAI AMULET TH ครับ",
    "",
    "โทน: " + tone,
  ].join("\n");
}

export default function ContentStudioPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedId, setSelectedId] = useState<number | "">("");
  const [contentType, setContentType] =
    useState<ContentType>("facebook");
  const [tone, setTone] = useState<Tone>("premium");
  const [result, setResult] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/products")
      .then(function (response) {
        if (!response.ok) {
          throw new Error("โหลดสินค้าไม่สำเร็จ");
        }

        return response.json();
      })
      .then(function (data) {
        if (!Array.isArray(data)) {
          throw new Error("ข้อมูลสินค้าไม่ถูกต้อง");
        }

        setProducts(data);

        if (data.length > 0) {
          setSelectedId(data[0].id);
        }
      })
      .catch(function (err) {
        console.error(err);
        setError("ไม่สามารถโหลดข้อมูลสินค้าได้");
      })
      .finally(function () {
        setLoading(false);
      });
  }, []);

  const selectedProduct =
    products.find(function (product) {
      return product.id === selectedId;
    }) || null;

  async function generate() {
  if (!selectedProduct) {
    setResult("กรุณาเลือกสินค้าก่อนสร้างคอนเทนต์");
    return;
  }

  try {
    setResult("กำลังให้ AI สร้างคอนเทนต์...");
    setCopied(false);

    const response = await fetch("/api/content/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        product: selectedProduct,
        tone: tone,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || "ไม่สามารถสร้างคอนเทนต์ด้วย AI ได้"
      );
    }

    const content = data.content;

    const facebook =
      typeof content?.facebook === "string"
        ? content.facebook
        : "";

    const reels =
      typeof content?.reels === "string"
        ? content.reels
        : "";

    const tiktok =
      typeof content?.tiktok === "string"
        ? content.tiktok
        : "";

    const script =
      typeof content?.script === "string"
        ? content.script
        : "";

    const contentMap: Record<ContentType, string> = {
      facebook,
      reels,
      tiktok,
      script,
    };

    const result =
      contentMap[contentType] ||
      "AI ไม่ได้สร้างเนื้อหาประเภทนี้";
    setResult(result);
  } catch (error) {
    console.error(error);

    setResult(
      error instanceof Error
        ? error.message
        : "เกิดข้อผิดพลาดในการสร้างคอนเทนต์"
    );
  }
}

  function sendToVoiceStudio() {
    if (!result) {
      return;
    }

    const scriptMarker = "===== SCRIPT =====";
    const markerIndex = result.indexOf(scriptMarker);

    const voiceScript =
      markerIndex >= 0
        ? result
            .slice(markerIndex + scriptMarker.length)
            .trim()
        : result.trim();

    const encodedScript = encodeURIComponent(voiceScript);

    window.location.href =
      "/voice-studio?script=" + encodedScript;
  }

  function copyResult() {
    if (!result) {
      return;
    }

    navigator.clipboard
      .writeText(result)
      .then(function () {
        setCopied(true);

        window.setTimeout(function () {
          setCopied(false);
        }, 2000);
      })
      .catch(function (err) {
        console.error(err);
      });
  }

  async function saveContent() {
    if (!result || !selectedProduct) {
      return;
    }

    setError("");

    try {
      const response = await fetch("/api/content/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: selectedProduct.name + " - " + contentType,
          contentType,
          platform: contentType,
          caption: result,
          productId: selectedProduct.id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error || "ไม่สามารถบันทึกคอนเทนต์ได้"
        );
      }

      setError("บันทึกคอนเทนต์ลงฐานข้อมูลสำเร็จ");
    } catch (error) {
      console.error("saveContent error:", error);

      setError(
        error instanceof Error
          ? error.message
          : "ไม่สามารถบันทึกคอนเทนต์ได้"
      );
    }
  }
  return (
    <main className="min-h-screen bg-neutral-800 p-6 text-white">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl font-bold">
          THAI AMULET TH
        </h1>

        <p className="mb-6 text-neutral-500">
          Content Studio
        </p>

        {error && (
          <div className="mb-6 rounded-xl bg-red-950/40 p-4 text-red-400">
            {error}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-2xl bg-neutral-900 p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-bold">
              เลือกสินค้า
            </h2>

            <select
              value={selectedId}
              disabled={loading}
              onChange={function (event) {
                const value = event.target.value;

                setSelectedId(
                  value === "" ? "" : Number(value)
                );
              }}
              className="w-full rounded-xl border p-3"
            >
              <option value="">
                {loading
                  ? "กำลังโหลด..."
                  : "เลือกสินค้า"}
              </option>

              {products.map(function (product) {
                return (
                  <option
                    key={product.id}
                    value={product.id}
                  >
                    {product.name}
                  </option>
                );
              })}
            </select>

            {selectedProduct && (
              <div className="mt-5 space-y-3">
                <div className="rounded-xl bg-black p-4">
                  <p className="text-sm text-neutral-500">
                    สินค้า
                  </p>
                  <p className="font-bold">
                    {selectedProduct.name}
                  </p>
                </div>

                <p>
                  รุ่น: {display(selectedProduct.model)}
                </p>

                <p>
                  พระอาจารย์:{" "}
                  {display(selectedProduct.master)}
                </p>

                <p>
                  ปี: {display(selectedProduct.year)}
                </p>

                <p>
                  ราคา:{" "}
                  {numberText(selectedProduct.price)} บาท
                </p>

                <p>
                  สต็อก:{" "}
                  {numberText(selectedProduct.stock)} ชิ้น
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={generate}
              disabled={!selectedProduct}
              className="mt-5 w-full rounded-xl bg-slate-900 p-3 font-bold text-white disabled:opacity-40"
            >
              ✨ สร้างคอนเทนต์
            </button>
          </div>

          <div className="rounded-2xl bg-neutral-900 p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-bold">
              รูปแบบคอนเทนต์
            </h2>

            <div className="space-y-2">
              {contentTypes.map(function (item) {
                const value = item[0];
                const label = item[1];

                return (
                  <button
                    key={value}
                    type="button"
                    onClick={function () {
                      setContentType(value);
                    }}
                    className={
                      "w-full rounded-xl border p-3 text-left " +
                      (contentType === value
                        ? "bg-slate-900 text-white"
                        : "bg-neutral-900")
                    }
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <h2 className="mb-4 mt-8 text-xl font-bold">
              โทนภาษา
            </h2>

            <div className="space-y-2">
              {tones.map(function (item) {
                const value = item[0];
                const label = item[1];

                return (
                  <button
                    key={value}
                    type="button"
                    onClick={function () {
                      setTone(value);
                    }}
                    className={
                      "w-full rounded-xl border p-3 text-left " +
                      (tone === value
                        ? "bg-slate-900 text-white"
                        : "bg-neutral-900")
                    }
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl bg-neutral-900 p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold">
                ผลลัพธ์
              </h2>

              <button
                type="button"
                onClick={copyResult}
                disabled={!result}
                className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40"
              >
                {copied ? "✓ คัดลอกแล้ว" : "คัดลอก"}
              </button>

              <button
                type="button"
                onClick={saveContent}
                disabled={!result || !selectedProduct}
                className="rounded-lg bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
              >
                บันทึก
              </button>
              <button
                type="button"
                onClick={sendToVoiceStudio}
                disabled={!result}
                className="rounded-lg bg-neutral-900 px-4 py-2 text-black disabled:opacity-50"
              >
                🎙️ ส่งไป Voice Studio
              </button>
            </div>

            <textarea
              value={result}
              onChange={function (event) {
                setResult(event.target.value);
              }}
              placeholder="กดสร้างคอนเทนต์..."
              className="min-h-[600px] w-full rounded-xl border p-4 leading-7"
            />
          </div>
        </div>
      </div>
    </main>
  );
}
    






