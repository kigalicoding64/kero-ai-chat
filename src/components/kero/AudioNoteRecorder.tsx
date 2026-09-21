import { useEffect, useRef, useState } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface AudioNoteRecorderProps {
  onTranscribed: (text: string) => void;
  disabled?: boolean;
}

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

/** Browser-native voice typing. It intentionally avoids introducing an audio API or secret. */
export function AudioNoteRecorder({ onTranscribed, disabled }: AudioNoteRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const transcriptRef = useRef("");

  useEffect(() => () => recognitionRef.current?.abort(), []);

  const startRecording = () => {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      toast.error("Voice typing is not supported in this browser.");
      return;
    }

    try {
      const recognition = new Recognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = navigator.language || "en-US";
      transcriptRef.current = "";
      recognition.onresult = (event) => {
        let text = "";
        for (let i = 0; i < event.results.length; i += 1) text += event.results[i]?.[0]?.transcript ?? "";
        transcriptRef.current = text;
      };
      recognition.onerror = (event) => {
        if (event.error !== "aborted" && event.error !== "no-speech") toast.error("Voice typing failed.");
        setIsRecording(false);
        setIsStarting(false);
      };
      recognition.onend = () => {
        const text = transcriptRef.current.trim();
        setIsRecording(false);
        setIsStarting(false);
        recognitionRef.current = null;
        if (text) onTranscribed(text);
      };
      recognitionRef.current = recognition;
      setIsStarting(true);
      recognition.start();
      setIsRecording(true);
      setIsStarting(false);
    } catch {
      setIsRecording(false);
      setIsStarting(false);
      toast.error("Unable to start the microphone.");
    }
  };

  const stopRecording = () => {
    recognitionRef.current?.stop();
  };

  return (
    <Button
      type="button"
      size="icon"
      variant={isRecording ? "destructive" : "ghost"}
      disabled={disabled || isStarting}
      onClick={isRecording ? stopRecording : startRecording}
      title={isRecording ? "Stop voice note" : "Dictate a voice note"}
      aria-label={isRecording ? "Stop voice note" : "Record voice note"}
      className="size-8 rounded-full"
    >
      {isStarting ? <Loader2 className="size-4 animate-spin" /> : isRecording ? <Square className="size-3.5" /> : <Mic className="size-4" />}
    </Button>
  );
}
