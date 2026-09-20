import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ร้านค้าพระเครื่อง | THAI AMULET TH",
  description: "เลือกชมพระเครื่องแท้ คัดสรรจากวัดชื่อดังทั่วประเทศ",
};

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return children;
}
