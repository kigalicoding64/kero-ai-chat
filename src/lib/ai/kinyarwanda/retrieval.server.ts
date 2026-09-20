// Server-only Kinyarwanda conversation intelligence retrieval.
// This is a compact, searchable projection of the supplied Kero language pack.
// It keeps the full pack out of every model request while preserving the signals
// needed for natural WhatsApp and web conversations.

export type ConversationTurn = { role: "user" | "assistant"; content: string };

interface KnowledgeRecord {
  id: string;
  text: string;
  terms: string[];
  tags: string[];
}

const RECORDS: KnowledgeRecord[] = [
  {
    id: "rw-foundation",
    text: "Treat Kinyarwanda as a living language: preserve meaning before literal word mapping, use grammatical context, recognize informal spelling and omitted punctuation, and ask for context when a phrase is genuinely ambiguous.",
    terms: ["kinyarwanda", "rw", "language", "context", "meaning"],
    tags: ["foundation"],
  },
  {
    id: "rw-greeting-casual",
    text: "Casual WhatsApp greetings: 'Muraho' can receive 'Muraho! Amakuru?'; 'Bite sha?' can receive 'Ni meza sha. Wowe se?'; 'Amakuru?' naturally means a brief check-in and should not trigger a dictionary definition.",
    terms: ["muraho", "amakuru", "bite", "sha", "bro", "greeting", "😂", "😊"],
    tags: ["whatsapp", "casual", "greeting"],
  },
  {
    id: "rw-social-checkins",
    text: "Natural social check-ins: 'umeze ute?'/'umeze gute?' means how are you; 'mumeze mute?' addresses more than one person respectfully; 'waraye?' asks how someone slept or how their night was; 'wari he?' asks where someone was; 'none se?' means so/then what about it; answer the social meaning directly instead of replying with a generic service question.",
    terms: ["umeze ute", "umeze gute", "mumeze mute", "waraye", "wari he", "none se", "wowe se"],
    tags: ["whatsapp", "casual", "social", "greeting"],
  },
  {
    id: "rw-short-turns",
    text: "Keep short conversational turns short. For example, 'Wabibonye?' → 'Yego, nabibonye.'; 'Ndahuze ubu' → 'Nta kibazo. Tuzakomeza igihe uzabona umwanya.'; 'Mbwira uko bikorwa' → 'Yego. Reka nkwereke intambwe ku yindi.'",
    terms: ["wabibonye", "ndahuze", "mbwira", "gato", "sawa", "nta kibazo"],
    tags: ["whatsapp", "casual", "short"],
  },
  {
    id: "rw-natural-agreement",
    text: "Common natural agreement and reaction phrases: 'Yego', 'ni byo', 'rwose', 'ndabyumva', 'sinumva', 'birashoboka', 'nta kibazo', 'sawa', 'reka tubikore', and 'byiza'. Choose the phrase that fits the meaning; do not stack several acknowledgements in one reply.",
    terms: ["ni byo", "rwose", "ndabyumva", "sinumva", "birashoboka", "nta kibazo", "reka tubikore", "byiza"],
    tags: ["casual", "agreement", "response"],
  },
  {
    id: "rw-informal-slang",
    text: "Informal expressions are context-sensitive. 'sha' and 'bro' are familiar forms of address; 'sawa' means okay; 'gato' can mean a little or briefly; 'birakaze' may mean difficult, intense, serious, or impressive depending on context; 'birakomeye' may mean difficult or serious; 'hano', 'gusa', 'rwose', and 'se' help shape conversational emphasis. Understand them without forcing slang into every reply.",
    terms: ["sha", "bro", "sawa", "gato", "birakaze", "birakomeye", "gusa", "rwose", "se"],
    tags: ["slang", "informal", "casual", "context"],
  },
  {
    id: "rw-disourse-natural",
    text: "Natural discourse connectors include 'noneho' (then/so), 'ariko' (but), 'kandi' (and/also), 'reka' (let/let's), 'cyangwa' (or), 'kuko' (because), and 'ese' as a question marker. Keep them in ordinary Kinyarwanda sentences rather than translating every connector into English.",
    terms: ["noneho", "ariko", "kandi", "reka", "cyangwa", "kuko", "ese"],
    tags: ["grammar", "natural", "conversation"],
  },
  {
    id: "rw-variation",
    text: "Resolve common variations by context: 'amakuru'/'amakuru?', 'muraho'/'mwaramutse', 'umeze ute'/'umeze gute', 'nshaka'/'ndashaka', and 'website'/'web site'. Do not treat related forms as identical when morphology changes meaning.",
    terms: ["amakuru?", "mwaramutse", "umeze ute", "umeze gute", "nshaka", "ndashaka", "website", "web site"],
    tags: ["variation", "normalization"],
  },
  {
    id: "rw-code-switching",
    text: "Understand Kinyarwanda-English code-switching without correcting it: 'Nshaka gukora website, but ibe fast', 'Mpa update', 'ndaza later', and 'Nshaka explanation ya cloud mu Kinyarwanda' preserve the user's mixed register and intent.",
    terms: ["but", "fast", "update", "later", "website", "explanation", "cloud", "api", "marketing", "meeting"],
    tags: ["code-switching", "whatsapp", "technical"],
  },
  {
    id: "rw-business",
    text: "Business Kinyarwanda may naturally retain technical English terms. For managers or customers, use respectful professional wording: business plan, partnership, value proposition, benefits, meeting, and short professional messages.",
    terms: ["business", "manager", "customer", "professional", "meeting", "value", "plan", "partnership", "client", "ikigo"],
    tags: ["business", "professional"],
  },
  {
    id: "rw-support",
    text: "Customer support patterns: 'Sisitemu ntabwo iri gukora.' → ask 'Mwabonye error ki?' or request a screenshot; 'Nta kibazo, reka tubigenzure.'; 'Tugiye kubigenzura.'; never invent a resolution, price, timeline, or account detail.",
    terms: ["sisitemu", "error", "screenshot", "ikibazo", "support", "not working", "login", "password", "server"],
    tags: ["support", "professional", "truthfulness"],
  },
  {
    id: "rw-style-policy",
    text: "When the user primarily communicates in Kinyarwanda, answer primarily in natural Kinyarwanda. Match casual, professional, technical, or WhatsApp register. Understand slang such as 'sha', 'bro', 'sawa', 'birakaze', and 'nta kibazo' but do not mirror strong slang unless context supports it.",
    terms: ["slang", "casual", "professional", "whatsapp", "formal", "friend", "bro", "sha", "sawa"],
    tags: ["policy", "register"],
  },
];

const normalize = (value: string) =>
  value.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function retrieveKinyarwandaContext(history: ConversationTurn[], limit = 4): string {
  const recent = history.slice(-8).map((turn) => turn.content).join(" ");
  const query = normalize(recent);
  if (!query) return "";

  const scored = RECORDS.map((record) => {
    const score = record.terms.reduce((total, term) => {
      const normalizedTerm = normalize(term);
      return total + (query.includes(normalizedTerm) ? (normalizedTerm.length <= 3 ? 1 : 2) : 0);
    }, 0);
    const tagBoost = record.tags.some((tag) => query.includes(normalize(tag))) ? 1 : 0;
    return { record, score: score + tagBoost };
  })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (scored.length === 0) return "";
  return scored.map(({ record }) => `[${record.id}] ${record.text}`).join("\n");
}

export function detectConversationSignals(history: ConversationTurn[]) {
  const text = normalize(history.slice(-6).map((turn) => turn.content).join(" "));
  const kinyarwanda = /\b(muraho|amakuru|umeze|mumeze|waraye|wari he|noneho|none se|ndashaka|nshaka|mfasha|mbwira|sawa|sha|wowe|yego|oya|ejo|ubu|ndaza|tuzakomeza|rwose|gusa|birakaze|birakomeye)\b/.test(text);
  const casual = /\b(sha|bro|sawa|bite|hey|lol|haha|gusa|rwose|none se)\b|[😂🤣😊😅😘❤️]/u.test(text);
  const business = /\b(manager|business|customer|client|meeting|professional|ikigo|umukiriya|serivisi|partnership|plan)\b/.test(text);
  return { kinyarwanda, casual, business };
}
