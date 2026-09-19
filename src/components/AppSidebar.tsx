"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import DashboardLogoutButton from "./DashboardLogoutButton";
import {
  HomeIcon,
  PackageIcon,
  ReceiptIcon,
  UsersIcon,
  WalletIcon,
  LandmarkIcon,
  FileTextIcon,
  BotIcon,
  BarChartIcon,
  SettingsIcon,
  MegaphoneIcon,
  BriefcaseIcon,
  MessageCircleIcon,
  FacebookIcon,
  FlagIcon,
  ChevronDownIcon,
} from "./icons";

const menuItems = [
  { icon: HomeIcon, title: "Dashboard", desc: "ภาพรวมระบบ", href: "/" },
  { icon: PackageIcon, title: "สินค้า", desc: "จัดการข้อมูลสินค้า", href: "/products" },
  { icon: ReceiptIcon, title: "ออเดอร์", desc: "จัดการคำสั่งซื้อ", href: "/orders" },
  { icon: UsersIcon, title: "ลูกค้า", desc: "รายชื่อลูกค้า", href: "/customers" },
  { icon: WalletIcon, title: "การเงิน", desc: "รายรับ-รายจ่าย", href: "/finance" },
  { icon: LandmarkIcon, title: "บัญชีธนาคาร", desc: "จัดการบัญชีธนาคาร", href: "/bank" },
  { icon: FileTextIcon, title: "สรุปภาษี", desc: "รายงานสำหรับทำบัญชี", href: "/tax" },
  { icon: BotIcon, title: "ผู้ช่วย AI", desc: "ถามข้อมูลร้านค้า", href: "/assistant" },
  { icon: BarChartIcon, title: "ยอดขาย", desc: "ดูสถิติการขาย", href: "/sales" },
  { icon: SettingsIcon, title: "ตั้งค่า", desc: "ตั้งค่าระบบ", href: "/settings" },
];

// "การตลาด (Marketing & Meta)" group — plain external shortcut links straight to the real
// Facebook/Meta business tools, no backend/API integration of any kind. Each opens in a new tab.
const marketingItems = [
  {
    icon: FlagIcon,
    title: "เพจ",
    desc: "Facebook Page",
    href: "https://www.facebook.com/pages/",
  },
  {
    icon: MegaphoneIcon,
    title: "ตัวจัดการโฆษณา",
    desc: "Ads Manager",
    href: "https://adsmanager.facebook.com/",
  },
  {
    icon: BriefcaseIcon,
    title: "Business Suite",
    desc: "จัดการเพจ/บัญชีธุรกิจ",
    href: "https://business.facebook.com/",
  },
  {
    icon: MessageCircleIcon,
    title: "ระบบตอบข้อความแชท",
    desc: "รวมแชทลูกค้า",
    href: "https://business.facebook.com/latest/inbox/",
  },
];

export default function AppSidebar() {
  const pathname = usePathname();
  const [isFacebookOpen, setIsFacebookOpen] = useState(false);

  return (
    <aside className="hidden min-h-[calc(100vh-73px)] w-64 border-r border-neutral-800 bg-black p-4 md:block">
      <p className="mb-3 px-3 text-[11px] font-bold uppercase tracking-wider text-neutral-500">
        เมนูการจัดการ
      </p>

      <nav className="space-y-1">
        {menuItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.title}
              href={item.href}
              className={`group flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all hover:bg-amber-500/10 hover:text-amber-500 hover:shadow-[0_0_15px_rgba(245,158,11,0.15)] ${
                isActive
                  ? "bg-neutral-900 text-amber-400 border border-neutral-800"
                  : "text-neutral-400"
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon
                  className={`h-5 w-5 transition-all group-hover:drop-shadow-[0_0_8px_rgba(245,158,11,0.6)] ${
                    isActive ? "drop-shadow-[0_0_8px_rgba(245,158,11,0.6)]" : ""
                  }`}
                />
                <span>{item.title}</span>
              </div>
              <span className="text-[11px] text-neutral-600">{item.desc}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-6">
        <button
          type="button"
          onClick={() => setIsFacebookOpen((current) => !current)}
          className="flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium text-neutral-400 transition-colors hover:bg-amber-500/10 hover:text-amber-500"
        >
          <div className="flex items-center gap-3">
            <FacebookIcon className="h-5 w-5" />
            <span>การตลาด (Facebook)</span>
          </div>
          <ChevronDownIcon
            className={`h-4 w-4 transition-transform duration-200 ${
              isFacebookOpen ? "rotate-0" : "-rotate-90"
            }`}
          />
        </button>

        {isFacebookOpen && (
          <nav className="mt-1 space-y-1">
            {marketingItems.map((item) => {
              const Icon = item.icon;

              return (
                <a
                  key={item.title}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex cursor-pointer items-center justify-between rounded-xl py-2 pl-11 pr-3.5 text-xs font-medium text-neutral-400 transition-colors hover:text-amber-500"
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </div>
                  <span className="text-[10px] text-neutral-600">{item.desc}</span>
                </a>
              );
            })}
          </nav>
        )}
      </div>

      <div className="mt-4 border-t border-neutral-800 pt-4">
        <DashboardLogoutButton />
      </div>
    </aside>
  );
}
