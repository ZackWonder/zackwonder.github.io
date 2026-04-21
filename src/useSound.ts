import { useCallback, useRef } from "react";

export default function useSound(
  url: string,
  options?: { volume?: number }
): [() => void] {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const play = useCallback(() => {
    const audio = new Audio(url);
    audio.volume = options?.volume ?? 1;
    audio.play().catch(() => {});
    audioRef.current = audio;
  }, [url, options?.volume]);

  return [play];
}
