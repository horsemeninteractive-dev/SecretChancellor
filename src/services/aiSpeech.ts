
let voices: SpeechSynthesisVoice[] = [];

export interface VoiceProfile {
  voice: SpeechSynthesisVoice;
  pitch: number;
  rate: number;
}

const aiProfileMap = new Map<string, VoiceProfile>();

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

export const getVoiceProfileForAi = (aiName: string): VoiceProfile | undefined => {
  if (aiProfileMap.has(aiName)) return aiProfileMap.get(aiName);
  
  if (voices.length === 0) return undefined;
  
  // Filter for English voices or current locale
  const lang = navigator.language || 'en-US';
  const langPrefix = lang.split('-')[0];
  let preferredVoices = voices.filter(v => v.lang.startsWith(langPrefix));
  if (preferredVoices.length === 0) preferredVoices = voices;

  // Use a simple hash of the name to pick a voice and variations
  let hash = 0;
  for (let i = 0; i < aiName.length; i++) {
    hash = aiName.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Try to pick a voice not already used by another AI
  const usedVoiceNames = Array.from(aiProfileMap.values()).map(p => p.voice.name);
  let availableVoices = preferredVoices.filter(v => !usedVoiceNames.includes(v.name));
  
  // If all preferred voices are used, just use the preferred list
  if (availableVoices.length === 0) availableVoices = preferredVoices;

  const voice = availableVoices[Math.abs(hash) % availableVoices.length];
  
  // Stable variations based on hash to make the voice sound unique
  // Pitch: 0.8 (deep) to 1.3 (high)
  const pitch = 0.8 + (Math.abs(hash % 50) / 100); 
  // Rate: 0.9 (slow) to 1.2 (fast)
  const rate = 0.9 + (Math.abs((hash >> 2) % 30) / 100);

  const profile: VoiceProfile = { voice, pitch, rate };
  aiProfileMap.set(aiName, profile);
  return profile;
};

export const speakAiMessage = (
  text: string, 
  aiName: string, 
  profile: VoiceProfile,
  onStart: () => void,
  onEnd: () => void
) => {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = profile.voice;
  utterance.pitch = profile.pitch;
  utterance.rate = profile.rate;
  
  utterance.onstart = onStart;
  utterance.onend = onEnd;
  utterance.onerror = (e) => {
    console.error('Speech error:', e);
    onEnd();
  };
  
  window.speechSynthesis.speak(utterance);
};
