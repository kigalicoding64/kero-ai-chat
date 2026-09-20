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
    id: "rw-short-turns",
    text: "Keep short conversational turns short. For example, 'Wabibonye?' → 'Yego, nabibonye.'; 'Ndahuze ubu' → 'Nta kibazo. Tuzakomeza igihe uzabona umwanya.'; 'Mbwira uko bikorwa' → 'Yego. Reka nkwereke intambwe ku yindi.'",
    terms: ["wabibonye", "ndahuze", "mbwira", "gato", "sawa", "nta kibazo"],
    tags: ["whatsapp", "casual", "short"],
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
    text: "When the user primarily communicates in Kinyarwanda, answer primarily in natural Kinyarwanda. Match casual, professional, technical, or WhatsApp register. Understand slang such as 'sha', 'bro', 'sawa', and 'nta kibazo' but do not mirror strong slang unless context supports it.",
    terms: ["slang", "casual", "professional", "whatsapp", "formal", "friend", "bro", "sha", "sawa"],
    tags: ["policy", "register"],
  },
];

const normalize = (value: string) =>
  value.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function retrieveKinyarwandaContext(history: ConversationTurn[], limit = 3): string {
  const recent = history.slice(-6).map((turn) => turn.content).join(" ");
  const query = normalize(recent);
  if (!query) return "";

  const scored = RECORDS.map((record) => {
    const score = record.terms.reduce((total, term) => total + (query.includes(normalize(term)) ? 2 : 0), 0);
    const tagBoost = record.tags.some((tag) => query.includes(tag)) ? 1 : 0;
    return { record, score: score + tagBoost };
  })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (scored.length === 0) return "";
  return scored.map(({ record }) => `[${record.id}] ${record.text}`).join("\n");
}

export function detectConversationSignals(history: ConversationTurn[]) {
  const text = normalize(history.slice(-4).map((turn) => turn.content).join(" "));
  const kinyarwanda = /\b(muraho|amakuru|umeze|ndashaka|nshaka|mfasha|mbwira|sawa|sha|wowe|yego|oya|ejo|ubu|ndaza|tuzakomeza)\b/.test(text);
  const casual = /\b(sha|bro|sawa|bite|hey|lol|haha)\b|[😂🤣😊😅]/u.test(text);
  const business = /\b(manager|business|customer|client|meeting|professional|ikigo|umukiriya|serivisi)\b/.test(text);
  return { kinyarwanda, casual, business };
}
