import { AIPersonality } from "../src/types.ts";

export const AI_BOTS: { name: string; avatarUrl: string; personality: AIPersonality }[] = [
  { name: "Bismarck",    avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Bismarck",    personality: "Strategic"  },
  { name: "Metternich",  avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Metternich",  personality: "Strategic"  },
  { name: "Talleyrand",  avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Talleyrand",  personality: "Deceptive"  },
  { name: "Cavour",      avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Cavour",      personality: "Honest"     },
  { name: "Disraeli",    avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Disraeli",    personality: "Strategic"  },
  { name: "Gladstone",   avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Gladstone",   personality: "Honest"     },
  { name: "Churchill",   avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Churchill",   personality: "Aggressive" },
  { name: "Roosevelt",   avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Roosevelt",   personality: "Honest"     },
  { name: "Lincoln",     avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Lincoln",     personality: "Honest"     },
  { name: "Washington",  avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Washington",  personality: "Honest"     },
  { name: "Napoleon",    avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Napoleon",    personality: "Aggressive" },
  { name: "Caesar",      avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Caesar",      personality: "Aggressive" },
  { name: "Cleopatra",   avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Cleopatra",   personality: "Strategic"  },
  { name: "Genghis",     avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Genghis",     personality: "Aggressive" },
  { name: "Sun Tzu",     avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=SunTzu",      personality: "Strategic"  },
  { name: "Machiavelli", avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Machiavelli", personality: "Deceptive"  },
  { name: "Catherine",   avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Catherine",   personality: "Strategic"  },
  { name: "Elizabeth",   avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Elizabeth",   personality: "Strategic"  },
  { name: "Victoria",    avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Victoria",    personality: "Honest"     },
  { name: "Joan",        avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Joan",        personality: "Honest"     },
  { name: "Spartacus",   avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Spartacus",   personality: "Aggressive" },
  { name: "Leonidas",    avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Leonidas",    personality: "Aggressive" },
  { name: "Boudica",     avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Boudica",     personality: "Aggressive" },
  { name: "Nero",        avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Nero",        personality: "Chaotic"    },
  { name: "Caligula",    avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Caligula",    personality: "Chaotic"    },
];

export const CHAT = {
  // Chancellor after fascist enacted — liberal chancellor deflects to president
  chanLibFascistEnacted: [
    "I was handed two Fascist cards. The President needs to explain.",
    "There was no Liberal in what I received. Ask the President.",
    "I played what I was given. Look at what the President discarded.",
  ],
  // Chancellor after fascist enacted — fascist chancellor deflects blame
  chanFasFascistEnacted: [
    "The draw was unkind to everyone. This is the deck's doing.",
    "I had no usable alternative. The President can confirm.",
    "Sometimes the deck decides for us.",
  ],
  // President after fascist enacted — liberal president pins chancellor
  presLibFascistEnacted: [
    "I passed a Liberal policy. The Chancellor made their own choice.",
    "There was a Liberal in that hand. Make of that what you will.",
    "I gave them options. They chose Fascist.",
  ],
  // President after fascist enacted — fascist president deflects
  presFasFascistEnacted: [
    "Three Fascist draws. Neither of us had a choice.",
    "The deck was against us this round.",
    "I passed on what I could. The hand was grim.",
  ],
  // After a failed government vote
  governmentFailed: [
    "A wasted round. We cannot keep stalling.",
    "Deadlock helps no one here.",
    "We need to find a government that works.",
  ],
  // After investigation — liberal result
  investigateLiberal: [
    "The investigation clears them. Liberal.",
    "Nothing of concern found.",
    "They appear to be on our side.",
  ],
  // After investigation — fascist result
  investigateFascist: [
    "The investigation is… troubling. Watch them.",
    "I've learned something important. Be wary.",
    "Things are not what they seem with that one.",
  ],
  // Suspicious nomination comment (liberal AI)
  suspiciousNominee: [
    "Interesting choice of Chancellor.",
    "I'll be watching this government carefully.",
    "That nomination raises questions for me.",
  ],
} as const;
