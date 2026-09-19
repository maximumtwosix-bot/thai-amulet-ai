"use client";

import { Image } from "@tiptap/extension-image";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { useRef, useState } from "react";

// ส่วนขยายรูปภาพที่ปรับขนาดได้ในตัว Editor เอง — สืบทอดจาก Image ปกติของ TipTap ทุกประการ (attrs
// src/alt/title เดิมใช้งานได้เหมือนเดิม ไม่กระทบ) เพิ่มแค่ attrs width/height ที่ persist ลงเอกสารจริง
// ผ่าน updateAttributes ตอนลาก และ NodeView แบบ React ที่มีจุดจับ 4 มุมให้ลากปรับขนาด
//
// การลากปรับ width/height เป็นอิสระจากกันโดยเจตนา (ไม่ล็อกสัดส่วนภาพต้นฉบับ) ตามที่ผู้ใช้ระบุไว้ชัดเจน
// ("เปลี่ยนขนาด width/height ได้อย่างอิสระ") — ผู้ใช้ที่ต้องการคงสัดส่วนสามารถลากคร่าวๆ ตามสายตาเองได้
//
// Image node เดิม inline:false (เป็น block node) — NodeViewWrapper จึงใช้ as="div" ไม่ใช่ "span" ให้
// ตรงกับ schema เดิม
type ResizeCorner = "se" | "sw" | "ne" | "nw";

function ResizableImageComponent({ node, updateAttributes, selected, ref }: ReactNodeViewProps<HTMLElement>) {
  const [resizing, setResizing] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  function startResize(corner: ResizeCorner) {
    return function handlePointerDown(event: React.PointerEvent) {
      event.preventDefault();
      event.stopPropagation();

      const imgEl = imgRef.current;
      if (!imgEl) return;

      const startX = event.clientX;
      const startY = event.clientY;
      const startWidth = imgEl.getBoundingClientRect().width;
      const startHeight = imgEl.getBoundingClientRect().height;

      const xSign = corner === "se" || corner === "ne" ? 1 : -1;
      const ySign = corner === "se" || corner === "sw" ? 1 : -1;

      setResizing(true);

      function onPointerMove(moveEvent: PointerEvent) {
        const nextWidth = Math.max(40, Math.round(startWidth + xSign * (moveEvent.clientX - startX)));
        const nextHeight = Math.max(40, Math.round(startHeight + ySign * (moveEvent.clientY - startY)));
        updateAttributes({ width: nextWidth, height: nextHeight });
      }

      function onPointerUp() {
        setResizing(false);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
      }

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    };
  }

  const showHandles = selected || resizing;

  const handleBaseClass =
    "absolute h-3 w-3 rounded-full border-2 border-black bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.8)] transition-opacity";

  return (
    <NodeViewWrapper
      ref={ref}
      as="div"
      className={`group relative my-2 inline-block leading-none ${
        selected ? "outline outline-2 outline-offset-2 outline-amber-500/60" : ""
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={node.attrs.src}
        alt={node.attrs.alt || ""}
        title={node.attrs.title || ""}
        width={node.attrs.width || undefined}
        height={node.attrs.height || undefined}
        draggable={false}
        className="max-w-full rounded-xl border border-amber-500/20"
      />

      <span
        role="presentation"
        onPointerDown={startResize("nw")}
        title="ลากเพื่อปรับขนาด"
        className={`${handleBaseClass} -left-1.5 -top-1.5 cursor-nw-resize ${
          showHandles ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      />
      <span
        role="presentation"
        onPointerDown={startResize("ne")}
        title="ลากเพื่อปรับขนาด"
        className={`${handleBaseClass} -right-1.5 -top-1.5 cursor-ne-resize ${
          showHandles ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      />
      <span
        role="presentation"
        onPointerDown={startResize("sw")}
        title="ลากเพื่อปรับขนาด"
        className={`${handleBaseClass} -bottom-1.5 -left-1.5 cursor-sw-resize ${
          showHandles ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      />
      <span
        role="presentation"
        onPointerDown={startResize("se")}
        title="ลากเพื่อปรับขนาด"
        className={`${handleBaseClass} -bottom-1.5 -right-1.5 cursor-se-resize ${
          showHandles ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      />
    </NodeViewWrapper>
  );
}

export const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        renderHTML: (attributes: { width?: number | string | null }) =>
          attributes.width ? { width: attributes.width } : {},
      },
      height: {
        default: null,
        renderHTML: (attributes: { height?: number | string | null }) =>
          attributes.height ? { height: attributes.height } : {},
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageComponent);
  },
});
