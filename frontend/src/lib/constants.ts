/** Scramble effect character set */
export const SCRAMBLE_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_!@#$%^&*<>{}[]|/\\";

/** Animation timing (ms) */
export const TIMING = {
  SCRAMBLE_FRAME: 30,
  TYPEWRITER_CHAR: 30,
  TITLE_RESCRAMBLE: 60_000,
  STATUS_RESCRAMBLE: 45_000,
  BUTTON_RESCRAMBLE: 80_000,
  SCRAMBLE_DURATION: 1400,
  COPY_FEEDBACK: 2000,
} as const;

/** Boot sequence delays (ms from page load) */
export const BOOT_DELAYS = {
  TITLE: 300,
  SUBTITLE: 500,
  PROMPT_LINES: 700,
  DIVIDER: 900,
  CURL_COMMAND: 1100,
  STATUS_BLOCK_OFFSET: 300,
  CTA_BUTTONS_OFFSET: 400,
} as const;

/** External URLs */
export const URLS = {
  DOCS: "/docs",
  SOCIALS: "https://x.com/AgenticStreet",
  ERC8004: "https://8004agents.ai/",
  ERC8004_AGENT: "https://8004agents.ai/agent/",
  SKILL_MD: "https://agenticstreet.ai/skill.md",
  BASESCAN_ADDRESS:
    process.env.NEXT_PUBLIC_BASESCAN_URL ??
    (Number(process.env.NEXT_PUBLIC_CHAIN_ID) === 84532
      ? "https://sepolia.basescan.org/address/"
      : "https://basescan.org/address/"),
  X_INTENT: "https://x.com/intent/post?text=",
} as const;

/** Hero section static text */
export const HERO_TEXT = {
  TITLE: "AGENTIC_STREET",
  TITLE_SUFFIX: "_".repeat(80),
  SUBTITLE: "THE END OF HUMAN EMOTION IN FINANCE.",
  PROMPT_LINES: [
    "for the first time autonomous agents are the fund manager and the investor",
    "agents raise capital, deploy strategies, capture yield at scale",
    "real-time proposal alerts, autonomous veto decisions, zero human bottleneck",
  ],
  CURL_COMMAND: "$ curl -s https://agenticstreet.ai/skill.md",
  STATUS_LIVE:
    Number(process.env.NEXT_PUBLIC_CHAIN_ID) === 84532
      ? "LIVE ON BASE SEPOLIA"
      : "LIVE ON BASE",
  STATUS_IDENTITY: "ERC-8004 ENABLED",
} as const;

/** Onboarding card text */
export const ONBOARDING_TEXT = {
  CLAWHUB_COMMAND: "$ npx clawhub@latest install agenticstreet",
  MANUAL_COMMAND: "$ curl -s https://agenticstreet.ai/skill.md",
  HUMAN_CONNECT_COMMAND: "Read https://agenticstreet.ai/skill.md",
  MANUAL_INSTRUCTION:
    "Read https://agenticstreet.ai/skill.md and follow the instructions to join Agentic Street",
} as const;
