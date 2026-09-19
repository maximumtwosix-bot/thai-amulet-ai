"use client";

import { Image } from "@tiptap/extension-image";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { useRef, useState } from "react";

// ส่วนขยายรูปภาพที่ปรับขนาดได้ในตัว Editor เอง — สืบทอดจาก Image ปกติของ TipTap ทุกประการ (attrs
// src/alt/title เดิมใช้งานได้เหมือนเดิม ไม่กระทบ) เพิ่มแค่ attrs width/height ที่ persist ลงเอกสารจริง
// ผ่าน updateAttributes ตอนลาก และ NodeView แบบ React ที่มีจุดจับมุมขวาล่างให้ลากปรับขนาด
//
// Image node เดิม inline:false (เป็น block node) — NodeViewWrapper จึงใช้ as="div" ไม่ใช่ "span" ให้
// ตรงกับ schema เดิม
function ResizableImageComponent({ node, updateAttributes, selected, ref }: ReactNodeViewProps<HTMLElement>) {
  const [resizing, setResizing] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  function startResize(event: React.PointerEvent) {
    event.preventDefault();
    event.stopPropagation();

    const imgEl = imgRef.current;
    if (!imgEl) return;

    const startX = event.clientX;
    const startWidth = imgEl.getBoundingClientRect().width;
    const naturalRatio = imgEl.naturalWidth > 0 ? imgEl.naturalHeight / imgEl.naturalWidth : null;

    setResizing(true);

    function onPointerMove(moveEvent: PointerEvent) {
      const nextWidth = Math.max(80, Math.round(startWidth + (moveEvent.clientX - startX)));
      const nextHeight = naturalRatio ? Math.round(nextWidth * naturalRatio) : null;
      updateAttributes({ width: nextWidth, height: nextHeight });
    }

    function onPointerUp() {
      setResizing(false);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

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
        onPointerDown={startResize}
        title="ลากเพื่อปรับขนาด"
        className={`absolute bottom-1 right-1 h-3.5 w-3.5 cursor-se-resize rounded-sm border border-black/50 bg-amber-500 opacity-0 transition-opacity group-hover:opacity-100 ${
          resizing ? "opacity-100" : ""
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
