import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ReadAloudButtonProps {
  text: string;
}

/** Reads assistant replies with the browser's built-in speech engine. */
export function ReadAloudButton({ text }: ReadAloudButtonProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  const toggle = () => {
    if (!window.speechSynthesis || !text.trim()) return;
    if (isPlaying) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      return;
    }
    const cleanText = text.replace(/```[\s\S]*?```/g, "Code block omitted.").replace(/`([^`]+)`/g, "$1").slice(0, 3000);
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = navigator.language || "en-US";
    utterance.onend = () => setIsPlaying(false);
    utterance.onerror = () => setIsPlaying(false);
    utteranceRef.current = utterance;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setIsPlaying(true);
  };

  return (
    <Button type="button" size="icon" variant="ghost" onClick={toggle} title={isPlaying ? "Stop reading aloud" : "Read message aloud"} aria-label="Read message aloud" className="size-7 rounded-md text-muted-foreground hover:text-foreground">
      {isPlaying ? <VolumeX className="size-3.5 text-destructive" /> : <Volume2 className="size-3.5" />}
    </Button>
  );
}
