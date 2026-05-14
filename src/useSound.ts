import { useCallback, useRef } from "react";

export default function useSound(
  url: string,
  options?: { volume?: number }
): [() => void] {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const volume = options?.volume ?? 1;

  const play = useCallback(() => {
    let audio = audioRef.current;
    if (!audio) {
      audio = new Audio(url);
      audio.volume = volume;
      audioRef.current = audio;
    } else {
      audio.currentTime = 0;
    }
    audio.play().catch(() => {});
  }, [url, volume]);

  return [play];
}
