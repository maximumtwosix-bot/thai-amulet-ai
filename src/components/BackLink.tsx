import Link from "next/link";
import { ArrowLeftIcon } from "./icons";

export default function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-xl border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-300 transition-all hover:bg-amber-500/10 hover:text-amber-500 hover:shadow-[0_0_15px_rgba(245, 158, 11,0.15)]"
    >
      <ArrowLeftIcon className="h-4 w-4" />
      {label}
    </Link>
  );
}
