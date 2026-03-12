
let voices: SpeechSynthesisVoice[] = [];
const aiVoiceMap = new Map<string, SpeechSynthesisVoice>();

export const initVoices = () => {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  
  const loadVoices = () => {
    voices = window.speechSynthesis.getVoices();
  };
  
  loadVoices();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }
};

export const getVoiceForAi = (aiName: string): SpeechSynthesisVoice | undefined => {
  if (aiVoiceMap.has(aiName)) return aiVoiceMap.get(aiName);
  
  if (voices.length === 0) return undefined;
  
  // Assign a random voice
  const voice = voices[Math.floor(Math.random() * voices.length)];
  aiVoiceMap.set(aiName, voice);
  return voice;
};

export const speakAiMessage = (
  text: string, 
  aiName: string, 
  voice: SpeechSynthesisVoice,
  onStart: () => void,
  onEnd: () => void
) => {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice;
  utterance.onstart = onStart;
  utterance.onend = onEnd;
  utterance.onerror = onEnd;
  window.speechSynthesis.speak(utterance);
};
