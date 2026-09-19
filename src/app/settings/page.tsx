"use client";

import { useState, type FormEvent } from "react";
import AppSidebar from "@/components/AppSidebar";

const inputClass =
  "w-full rounded-xl border border-neutral-800 bg-black px-3 py-2 text-white placeholder-neutral-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500";
const submitButtonClass =
  "rounded-xl bg-amber-500 px-4 py-2 font-bold text-black transition-all hover:bg-amber-400 hover:shadow-[0_0_15px_rgba(245, 158, 11,0.4)]";
const cardClass =
  "rounded-2xl border border-amber-500/20 bg-neutral-950/60 backdrop-blur-lg shadow-[0_0_15px_rgba(245,158,11,0.05)] p-6 transition-all duration-300 hover:border-amber-500/50 hover:shadow-[0_0_20px_rgba(245, 158, 11,0.15)]";

export default function SettingsPage() {
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  return (
    <main className="min-h-screen bg-black bg-[linear-gradient(to_right,#f59e0b08_1px,transparent_1px),linear-gradient(to_bottom,#f59e0b08_1px,transparent_1px)] bg-[size:24px_24px] text-neutral-200">
      <header className="border-b border-neutral-800 bg-black text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <h1 className="text-2xl font-bold tracking-wide">THAI AMULET TH</h1>
            <p className="text-sm text-neutral-400">AI Content &amp; Business System</p>
          </div>

          <div className="rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-300">
            ระบบใช้งานภายใน
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl">
        <AppSidebar />

        <section className="flex-1 p-6 md:p-10">
          <div className="mb-8">
            <p className="text-sm text-neutral-400">ยินดีต้อนรับ</p>
            <h2 className="mt-1 text-3xl font-bold text-white">ตั้งค่า</h2>
            <p className="mt-2 text-neutral-400">
              จัดการข้อมูลร้านค้าและบัญชีผู้ดูแลระบบ
            </p>
          </div>

          <div className="space-y-6">
            <div className={cardClass}>
              <h3 className="text-lg font-bold text-white">🏪 ข้อมูลร้านค้า</h3>
              <p className="mt-1 text-sm text-neutral-400">
                ข้อมูลพื้นฐานของร้านที่แสดงในระบบและเอกสาร
              </p>

              <form onSubmit={handleSubmit} className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-neutral-400">
                    ชื่อร้าน
                  </label>
                  <input type="text" defaultValue="THAI AMULET TH" className={inputClass} />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-400">
                    เบอร์โทรศัพท์
                  </label>
                  <input type="tel" placeholder="0XX-XXX-XXXX" className={inputClass} />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-400">
                    อีเมลติดต่อ
                  </label>
                  <input type="email" placeholder="shop@example.com" className={inputClass} />
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-neutral-400">
                    ที่อยู่ร้าน
                  </label>
                  <textarea
                    rows={3}
                    placeholder="ที่อยู่สำหรับจัดส่งเอกสาร/ติดต่อกลับ"
                    className={inputClass}
                  />
                </div>

                <div className="sm:col-span-2">
                  <button type="submit" className={submitButtonClass}>
                    บันทึกข้อมูลร้านค้า
                  </button>
                </div>
              </form>
            </div>

            <div className={cardClass}>
              <h3 className="text-lg font-bold text-white">👤 การจัดการบัญชี</h3>
              <p className="mt-1 text-sm text-neutral-400">
                เปลี่ยนรหัสผ่านสำหรับผู้ดูแลระบบ
              </p>

              <form onSubmit={handleSubmit} className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-neutral-400">
                    รหัสผ่านปัจจุบัน
                  </label>
                  <div className="relative">
                    <input
                      type={showCurrentPassword ? "text" : "password"}
                      placeholder="••••••••"
                      className={inputClass}
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword((current) => !current)}
                      aria-label={showCurrentPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-amber-500"
                    >
                      {showCurrentPassword ? "🙈" : "👁️"}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-400">
                    รหัสผ่านใหม่
                  </label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? "text" : "password"}
                      placeholder="••••••••"
                      className={inputClass}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((current) => !current)}
                      aria-label={showNewPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-amber-500"
                    >
                      {showNewPassword ? "🙈" : "👁️"}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-400">
                    ยืนยันรหัสผ่านใหม่
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="••••••••"
                      className={inputClass}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((current) => !current)}
                      aria-label={showConfirmPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-amber-500"
                    >
                      {showConfirmPassword ? "🙈" : "👁️"}
                    </button>
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <button type="submit" className={submitButtonClass}>
                    บันทึกการเปลี่ยนแปลง
                  </button>
                </div>
              </form>
            </div>

            <div className={cardClass}>
              <h3 className="text-lg font-bold text-white">🔌 การเชื่อมต่อระบบ (API &amp; Notifications)</h3>
              <p className="mt-1 text-sm text-neutral-400">
                คีย์และโทเคนสำหรับเชื่อมต่อบริการ AI และการแจ้งเตือนภายนอก
              </p>

              <form onSubmit={handleSubmit} className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-neutral-400">
                    LINE Notify Token
                  </label>
                  <input
                    type="password"
                    placeholder="ใส่ Token สำหรับส่งการแจ้งเตือนเข้า LINE"
                    className={inputClass}
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-neutral-400">
                    OpenAI API Key
                  </label>
                  <input
                    type="password"
                    placeholder="sk-..."
                    className={inputClass}
                  />
                </div>

                <div className="sm:col-span-2">
                  <button type="submit" className={submitButtonClass}>
                    บันทึกการเชื่อมต่อ
                  </button>
                </div>
              </form>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
