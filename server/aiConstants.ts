import { AIPersonality } from "../src/types.ts";

export const AI_BOTS: { name: string; avatarUrl: string; personality: AIPersonality }[] = [
  { name: "Arbiter",    avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Arbiter",    personality: "Strategic"  },
  { name: "Voss",       avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Voss",       personality: "Strategic"  },
  { name: "Calloway",   avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Calloway",   personality: "Deceptive"  },
  { name: "Holt",       avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Holt",       personality: "Honest"     },
  { name: "Rhys",       avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Rhys",       personality: "Strategic"  },
  { name: "Maren",      avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Maren",      personality: "Honest"     },
  { name: "Crane",      avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Crane",      personality: "Aggressive" },
  { name: "Osei",       avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Osei",       personality: "Honest"     },
  { name: "Sable",      avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Sable",      personality: "Honest"     },
  { name: "Thorn",      avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Thorn",      personality: "Honest"     },
  { name: "Vesper",     avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Vesper",     personality: "Aggressive" },
  { name: "Kovacs",     avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Kovacs",     personality: "Aggressive" },
  { name: "Nyx",        avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Nyx",        personality: "Strategic"  },
  { name: "Drevik",     avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Drevik",     personality: "Aggressive" },
  { name: "Lorn",       avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Lorn",       personality: "Strategic"  },
  { name: "Cipher",     avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Cipher",     personality: "Deceptive"  },
  { name: "Auren",      avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Auren",      personality: "Strategic"  },
  { name: "Pell",       avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Pell",       personality: "Strategic"  },
  { name: "Sora",       avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Sora",       personality: "Honest"     },
  { name: "Wren",       avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Wren",       personality: "Honest"     },
  { name: "Axis",       avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Axis",       personality: "Aggressive" },
  { name: "Rook",       avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Rook",       personality: "Aggressive" },
  { name: "Fenn",       avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Fenn",       personality: "Aggressive" },
  { name: "Crest",      avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Crest",      personality: "Chaotic"    },
  { name: "Null",       avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Null",       personality: "Chaotic"    },
];

export const CHAT = {
  // Chancellor after State directive enacted — Civil chancellor deflects to president
  chanCivilStateEnacted: [
    "I was handed two State directives. The President owes the Assembly an explanation.",
    "There was no Civil directive in what I received. Direct your questions to the President.",
    "I enacted what I was given. The President controls the discard.",
  ],
  // Chancellor after State directive enacted — State chancellor deflects blame
  chanStateStateEnacted: [
    "The draw was against us. This is the deck's doing, not mine.",
    "I had no viable alternative. The President can verify.",
    "Sometimes the Secretariat decides for us.",
  ],
  // President after State directive enacted — Civil president pins chancellor
  presCivilStateEnacted: [
    "I passed a Civil directive. The Chancellor exercised their own discretion.",
    "There was a Civil option in that hand. Make of that what you will.",
    "I gave them a choice. They chose the State.",
  ],
  // President after State directive enacted — State president deflects
  presStateStateEnacted: [
    "Three State draws. Neither of us had a choice.",
    "The deck was working against the Charter this round.",
    "I passed on what I could. The hand was compromised.",
  ],
  // After a failed government vote
  governmentFailed: [
    "A wasted session. We cannot keep stalling the Secretariat.",
    "Deadlock serves no one here. The Crisis does not wait.",
    "We need to form a functional government. Now.",
  ],
  // After investigation — Civil result
  investigateCivil: [
    "The investigation confirms their alignment, {name} is Civil.",
    "Nothing of concern found. They are Charter-loyal.",
    "They appear to stand with the Assembly.",
  ],
  // After investigation — State result
  investigateState: [
    "The investigation confirms their alignment, {name} is State.",
    "The investigation is… troubling. Watch {name} closely.",
    "I have learned something critical about {name}. Proceed with caution.",
    "{name}'s allegiance is not to the Charter.",
  ],
  // Suspicious nomination comment (Civil AI)
  suspiciousNominee: [
    "Interesting choice of Chancellor.",
    "I will be monitoring this government carefully.",
    "That nomination raises questions within the Secretariat.",
  ],
} as const;

