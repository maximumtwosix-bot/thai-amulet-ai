export type SubtitleCue = {
  start: number;
  end: number;
  text: string;
};

function formatAssTime(seconds: number): string {
  const safe = Math.max(0, Number(seconds) || 0);

  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remaining = safe % 60;

  const wholeSeconds = Math.floor(remaining);
  const centiseconds = Math.floor(
    (remaining - wholeSeconds) * 100
  );

  return `${hours}:${String(minutes).padStart(2, "0")}:${String(
    wholeSeconds
  ).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
}

function escapeAssText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\r?\n/g, "\\N");
}

export function createSubtitleCues(
  script: string,
  duration: number
): SubtitleCue[] {
  const cleanScript = script
    .replace(/\s+/g, " ")
    .trim();

  if (!cleanScript || !Number.isFinite(duration) || duration <= 0) {
    return [];
  }

  const sentences =
    cleanScript
      .split(/(?<=[.!?。！？])\s*/)
      .map((text) => text.trim())
      .filter(Boolean);

  const chunks =
    sentences.length > 0
      ? sentences
      : cleanScript
          .split(/\s+/)
          .reduce<string[]>((result, word, index) => {
            const chunkIndex = Math.floor(index / 8);

            result[chunkIndex] =
              `${result[chunkIndex] || ""} ${word}`.trim();

            return result;
          }, []);

  const totalCharacters = chunks.reduce(
    (total, text) => total + text.length,
    0
  );

  if (totalCharacters === 0) {
    return [];
  }

  let currentTime = 0;

  return chunks.map((text, index) => {
    const proportionalDuration =
      (text.length / totalCharacters) * duration;

    const start = currentTime;

    const end =
      index === chunks.length - 1
        ? duration
        : Math.min(
            duration,
            currentTime + proportionalDuration
          );

    currentTime = end;

    return {
      start,
      end,
      text,
    };
  });
}

export function createAssSubtitle(
  cues: SubtitleCue[]
): string {
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Noto Sans,72,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,4,2,2,60,60,180,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events = cues.map((cue) => {
    return `Dialogue: 0,${formatAssTime(
      cue.start
    )},${formatAssTime(cue.end)},Default,,0,0,0,,${escapeAssText(
      cue.text
    )}`;
  });

  return header + events.join("\n") + "\n";
}
