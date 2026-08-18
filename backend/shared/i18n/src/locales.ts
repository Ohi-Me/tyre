/**
 * @tyre/i18n — 100+ language registry for TYRE v3.
 *
 * INDIA-FIRST: 50+ Indian languages and dialects (Tier 1 launch + Tier 2 regional)
 * GLOBAL: 60+ additional languages for cross-border expansion.
 *
 * Categorizes locales into 4 tiers based on coverage:
 *   - Tier 1 (P0): Human-translated, full UI + voice + agents. Launch set.
 *   - Tier 2 (P1): Human-translated UI, MT for voice/agents. Regional Indian languages.
 *   - Tier 3 (P2): MT-translated UI (NLLB-200), fallback to English voice.
 *   - Tier 4 (P3): MT-translated UI only, voice uses Tier 1 fallback.
 *
 * Total: ~115 locales covering 50+ Indian languages + 60+ global languages.
 */

export type LocaleTier = 1 | 2 | 3 | 4;
export type TextDirection = "ltr" | "rtl";

/** v3.2 wedge — which year/quarter each locale goes live. */
export type LocalePhase =
  | "Y1-H1"   // Launch: Hindi, Bhojpuri, English (Bihar-Jharkhand-UP wedge)
  | "Y1-H2"   // H2 2026: Bengali, Marathi (West Bengal + Maharashtra expansion)
  | "Y2"      // 2027: Tamil, Telugu, Punjabi, Gujarati, Odia, Assamese, Urdu, Kannada, Malayalam
  | "Y3"      // 2028: Regional dialects (Magahi, Angika, Maithili, etc.) + global Tier 3
  | "FUTURE"; // Beyond Y3 — registered but not actively built

export interface LocaleConfig {
  /** BCP-47 tag, e.g. "hi", "pt-BR", "zh-Hans-CN" */
  code: string;
  /** English name, e.g. "Hindi" */
  name: string;
  /** Native name, e.g. "हिन्दी" */
  native_name: string;
  /** ISO 639-3 language code (used for NLLB-200 mapping) */
  iso639_3: string;
  /** Region this locale is primarily spoken in */
  region: string;
  /** Indian state(s) where this language is primarily spoken (for Indian languages only) */
  indian_states?: string[];
  /** Whether this is a dialect rather than a standardized language */
  is_dialect?: boolean;
  /** Script: Devanagari, Latin, Arabic, Bengali, etc. */
  script: string;
  tier: LocaleTier;
  /** v3.2 wedge phase — when this locale goes live. */
  phase: LocalePhase;
  direction: TextDirection;
  /** Voice TTS available (Coqui/ElevenLabs/Azure) */
  voice_enabled: boolean;
  /** Whisper STT model supports this locale */
  stt_enabled: boolean;
  /** NLLB-200 supports this locale for translation */
  mt_enabled: boolean;
  /** Language detection (fastText) supports this locale */
  detection_enabled: boolean;
  /** Transliteration available (AI4Bharat IndicTrans2 / Google Transliteration) */
  transliteration_enabled: boolean;
  /** Fallback locale if a key is missing */
  fallback?: string;
}

export const LOCALES: LocaleConfig[] = [
  // ============================================================
  // TIER 1 — Full coverage (13 Indian launch languages + 9 global)
  // ============================================================
  // --- Indian Tier 1 (per spec) ---
  { code: "hi", name: "Hindi", native_name: "हिन्दी", iso639_3: "hin", region: "IN", indian_states: ["UP", "MP", "Bihar", "Rajasthan", "Jharkhand", "Uttarakhand", "Chhattisgarh", "Haryana", "HP"], script: "Devanagari", tier: 1, phase: "Y1-H1", direction: "ltr", voice_enabled: true, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: true, fallback: "en" },
  { code: "en", name: "English", native_name: "English", iso639_3: "eng", region: "IN", script: "Latin", tier: 1, phase: "Y1-H1", direction: "ltr", voice_enabled: true, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: true },
  { code: "bn", name: "Bengali", native_name: "বাংলা", iso639_3: "ben", region: "IN", indian_states: ["WB", "Tripura", "Assam"], script: "Bengali", tier: 1, phase: "Y1-H2", direction: "ltr", voice_enabled: true, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: true, fallback: "en" },
  { code: "te", name: "Telugu", native_name: "తెలుగు", iso639_3: "tel", region: "IN", indian_states: ["AP", "Telangana"], script: "Telugu", tier: 1, phase: "Y2", direction: "ltr", voice_enabled: true, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: true, fallback: "en" },
  { code: "mr", name: "Marathi", native_name: "मराठी", iso639_3: "mar", region: "IN", indian_states: ["Maharashtra", "Goa"], script: "Devanagari", tier: 1, phase: "Y1-H2", direction: "ltr", voice_enabled: true, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: true, fallback: "en" },
  { code: "ta", name: "Tamil", native_name: "தமிழ்", iso639_3: "tam", region: "IN", indian_states: ["TN", "Puducherry"], script: "Tamil", tier: 1, phase: "Y2", direction: "ltr", voice_enabled: true, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: true, fallback: "en" },
  { code: "ur", name: "Urdu", native_name: "اُردُو", iso639_3: "urd", region: "IN", indian_states: ["J&K", "Telangana", "UP", "Bihar"], script: "Arabic", tier: 1, phase: "Y2", direction: "rtl", voice_enabled: true, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: true, fallback: "en" },
  { code: "gu", name: "Gujarati", native_name: "ગુજરાતી", iso639_3: "guj", region: "IN", indian_states: ["Gujarat", "DD", "DNH"], script: "Gujarati", tier: 1, phase: "Y2", direction: "ltr", voice_enabled: true, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: true, fallback: "en" },
  { code: "kn", name: "Kannada", native_name: "ಕನ್ನಡ", iso639_3: "kan", region: "IN", indian_states: ["Karnataka"], script: "Kannada", tier: 1, phase: "Y2", direction: "ltr", voice_enabled: true, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: true, fallback: "en" },
  { code: "or", name: "Odia", native_name: "ଓଡ଼ିଆ", iso639_3: "ory", region: "IN", indian_states: ["Odisha"], script: "Odia", tier: 1, phase: "Y2", direction: "ltr", voice_enabled: true, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: true, fallback: "en" },
  { code: "ml", name: "Malayalam", native_name: "മലയാളം", iso639_3: "mal", region: "IN", indian_states: ["Kerala", "Lakshadweep", "Puducherry"], script: "Malayalam", tier: 1, phase: "Y2", direction: "ltr", voice_enabled: true, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: true, fallback: "en" },
  { code: "pa", name: "Punjabi", native_name: "ਪੰਜਾਬੀ", iso639_3: "pan", region: "IN", indian_states: ["Punjab", "Chandigarh", "Haryana", "Delhi"], script: "Gurmukhi", tier: 1, phase: "Y2", direction: "ltr", voice_enabled: true, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: true, fallback: "en" },
  { code: "as", name: "Assamese", native_name: "অসমীয়া", iso639_3: "asm", region: "IN", indian_states: ["Assam"], script: "Bengali-Assamese", tier: 1, phase: "Y2", direction: "ltr", voice_enabled: true, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: true, fallback: "en" },
  // --- Global Tier 1 ---
  { code: "sw", name: "Swahili", native_name: "Kiswahili", iso639_3: "swh", region: "KE", script: "Latin", tier: 1, phase: "Y2", direction: "ltr", voice_enabled: true, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "en" },
  { code: "ha", name: "Hausa", native_name: "Hausa", iso639_3: "hau", region: "NG", script: "Latin", tier: 1, phase: "Y2", direction: "ltr", voice_enabled: true, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "en" },
  { code: "pt-BR", name: "Portuguese (Brazil)", native_name: "Português (Brasil)", iso639_3: "por", region: "BR", script: "Latin", tier: 1, phase: "Y2", direction: "ltr", voice_enabled: true, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "en" },
  { code: "es-MX", name: "Spanish (Mexico)", native_name: "Español (México)", iso639_3: "spa", region: "MX", script: "Latin", tier: 1, phase: "Y2", direction: "ltr", voice_enabled: true, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "en" },
  { code: "ar", name: "Arabic", native_name: "العربية", iso639_3: "arb", region: "AE", script: "Arabic", tier: 1, phase: "Y2", direction: "rtl", voice_enabled: true, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "en" },
  { code: "ne", name: "Nepali", native_name: "नेपाली", iso639_3: "npi", region: "NP", script: "Devanagari", tier: 1, phase: "Y2", direction: "ltr", voice_enabled: true, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: true, fallback: "hi" },
  { code: "si", name: "Sinhala", native_name: "සිංහල", iso639_3: "sin", region: "LK", script: "Sinhala", tier: 1, phase: "Y2", direction: "ltr", voice_enabled: true, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "en" },

  // ============================================================
  // TIER 2 — Regional Indian languages & dialects (35 locales)
  // Per spec: Bhojpuri, Magahi, Angika, Maithili, Chhattisgarhi, Awadhi,
  // Haryanvi, Bundeli, Marwari, Rajasthani, Garhwali, Kumaoni, Tulu, Kodava,
  // Konkani, Kashmiri, Dogri, Manipuri, Nepali (also above), Santali, Bodo,
  // Garo, Khasi, Mizo, Nagamese, Kokborok, Bhili, Gondi, Ho, Mundari,
  // Kurukh, Sadri, Surjapuri, Dakhini, Lambadi
  // ============================================================
  { code: "bho", name: "Bhojpuri", native_name: "भोजपुरी", iso639_3: "bho", region: "IN", indian_states: ["UP", "Bihar", "Jharkhand"], is_dialect: true, script: "Devanagari", tier: 2, phase: "Y1-H1", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: true, fallback: "hi" },
  { code: "mag", name: "Magahi", native_name: "मगही", iso639_3: "mag", region: "IN", indian_states: ["Bihar", "Jharkhand"], is_dialect: true, script: "Devanagari", tier: 2, phase: "Y3", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: true, fallback: "hi" },
  { code: "ang", name: "Angika", native_name: "अंगिका", iso639_3: "anp", region: "IN", indian_states: ["Bihar", "Jharkhand"], is_dialect: true, script: "Devanagari", tier: 2, phase: "Y3", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: true, fallback: "bho" },
  { code: "mai", name: "Maithili", native_name: "मैथिली", iso639_3: "mai", region: "IN", indian_states: ["Bihar", "Jharkhand"], script: "Devanagari", tier: 2, phase: "Y3", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: true, fallback: "hi" },
  { code: "hne", name: "Chhattisgarhi", native_name: "छत्तीसगढ़ी", iso639_3: "hne", region: "IN", indian_states: ["Chhattisgarh"], is_dialect: true, script: "Devanagari", tier: 2, phase: "Y3", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: true, fallback: "hi" },
  { code: "awa", name: "Awadhi", native_name: "अवधी", iso639_3: "awa", region: "IN", indian_states: ["UP"], is_dialect: true, script: "Devanagari", tier: 2, phase: "Y3", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: true, fallback: "hi" },
  { code: "bgc", name: "Haryanvi", native_name: "हरियाणवी", iso639_3: "bgc", region: "IN", indian_states: ["Haryana", "Delhi"], is_dialect: true, script: "Devanagari", tier: 2, phase: "Y3", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: true, fallback: "hi" },
  { code: "bns", name: "Bundeli", native_name: "बुन्देली", iso639_3: "bns", region: "IN", indian_states: ["MP", "UP"], is_dialect: true, script: "Devanagari", tier: 2, phase: "Y3", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: true, fallback: "hi" },
  { code: "mwr", name: "Marwari", native_name: "मारवाड़ी", iso639_3: "mwr", region: "IN", indian_states: ["Rajasthan"], is_dialect: true, script: "Devanagari", tier: 2, phase: "Y3", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: true, fallback: "hi" },
  { code: "raj", name: "Rajasthani", native_name: "राजस्थानी", iso639_3: "raj", region: "IN", indian_states: ["Rajasthan"], script: "Devanagari", tier: 2, phase: "Y3", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: true, fallback: "hi" },
  { code: "gbm", name: "Garhwali", native_name: "गढ़वाली", iso639_3: "gbm", region: "IN", indian_states: ["Uttarakhand"], is_dialect: true, script: "Devanagari", tier: 2, phase: "Y3", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: true, fallback: "hi" },
  { code: "kfy", name: "Kumaoni", native_name: "कुमाऊँनी", iso639_3: "kfy", region: "IN", indian_states: ["Uttarakhand"], is_dialect: true, script: "Devanagari", tier: 2, phase: "Y3", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: true, fallback: "hi" },
  { code: "tcy", name: "Tulu", native_name: "ತುಳು", iso639_3: "tcy", region: "IN", indian_states: ["Karnataka", "Kerala"], is_dialect: true, script: "Kannada", tier: 2, phase: "Y3", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: true, fallback: "kn" },
  { code: "kfa", name: "Kodava", native_name: "ಕೊಡವ", iso639_3: "kfa", region: "IN", indian_states: ["Karnataka"], is_dialect: true, script: "Kannada", tier: 2, phase: "Y3", direction: "ltr", voice_enabled: false, stt_enabled: false, mt_enabled: true, detection_enabled: false, transliteration_enabled: true, fallback: "kn" },
  { code: "kok", name: "Konkani", native_name: "कोंकणी", iso639_3: "kok", region: "IN", indian_states: ["Goa", "Karnataka", "Maharashtra", "Kerala"], script: "Devanagari", tier: 2, phase: "Y3", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: true, fallback: "mr" },
  { code: "ks", name: "Kashmiri", native_name: "कॉशुर", iso639_3: "kas", region: "IN", indian_states: ["J&K"], script: "Devanagari", tier: 2, phase: "Y3", direction: "rtl", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: true, fallback: "ur" },
  { code: "dgo", name: "Dogri", native_name: "डोगरी", iso639_3: "dgo", region: "IN", indian_states: ["J&K", "HP"], script: "Devanagari", tier: 2, phase: "Y3", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: true, fallback: "hi" },
  { code: "mni", name: "Manipuri", native_name: "মেইতেই লোন্", iso639_3: "mni", region: "IN", indian_states: ["Manipur"], script: "Meitei", tier: 2, phase: "Y3", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: true, fallback: "bn" },
  { code: "sat", name: "Santali", native_name: "ᱥᱟᱱᱛᱟᱲᱤ", iso639_3: "sat", region: "IN", indian_states: ["Jharkhand", "WB", "Odisha", "Bihar"], script: "Ol Chiki", tier: 2, phase: "Y3", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "bn" },
  { code: "brx", name: "Bodo", native_name: "बड़ो", iso639_3: "brx", region: "IN", indian_states: ["Assam"], script: "Devanagari", tier: 2, phase: "Y3", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: true, fallback: "as" },
  { code: "grt", name: "Garo", native_name: "A·chik", iso639_3: "grt", region: "IN", indian_states: ["Meghalaya"], script: "Latin", tier: 2, phase: "Y3", direction: "ltr", voice_enabled: false, stt_enabled: false, mt_enabled: true, detection_enabled: false, transliteration_enabled: false, fallback: "en" },
  { code: "kha", name: "Khasi", native_name: "Ka Ktien Khasi", iso639_3: "kha", region: "IN", indian_states: ["Meghalaya"], script: "Latin", tier: 2, phase: "Y3", direction: "ltr", voice_enabled: false, stt_enabled: false, mt_enabled: true, detection_enabled: false, transliteration_enabled: false, fallback: "en" },
  { code: "lus", name: "Mizo", native_name: "Mizo ṭawng", iso639_3: "lus", region: "IN", indian_states: ["Mizoram"], script: "Latin", tier: 2, phase: "Y3", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "en" },
  { code: "nag", name: "Nagamese", native_name: "Nagamese", iso639_3: "nag", region: "IN", indian_states: ["Nagaland"], script: "Latin", tier: 2, phase: "Y3", direction: "ltr", voice_enabled: false, stt_enabled: false, mt_enabled: true, detection_enabled: false, transliteration_enabled: false, fallback: "en" },
  { code: "trp", name: "Kokborok", native_name: "ককবরক", iso639_3: "trp", region: "IN", indian_states: ["Tripura"], script: "Bengali", tier: 2, phase: "Y3", direction: "ltr", voice_enabled: false, stt_enabled: false, mt_enabled: true, detection_enabled: false, transliteration_enabled: true, fallback: "bn" },
  { code: "bhb", name: "Bhili", native_name: "भीली", iso639_3: "bhb", region: "IN", indian_states: ["Gujarat", "MP", "Rajasthan", "Maharashtra"], is_dialect: true, script: "Devanagari", tier: 2, phase: "Y3", direction: "ltr", voice_enabled: false, stt_enabled: false, mt_enabled: true, detection_enabled: false, transliteration_enabled: true, fallback: "gu" },
  { code: "gon", name: "Gondi", native_name: "గోండి", iso639_3: "gon", region: "IN", indian_states: ["MP", "Maharashtra", "Chhattisgarh", "AP", "Telangana"], script: "Devanagari", tier: 2, phase: "Y3", direction: "ltr", voice_enabled: false, stt_enabled: false, mt_enabled: true, detection_enabled: false, transliteration_enabled: false, fallback: "te" },
  { code: "hoc", name: "Ho", native_name: "ᱦᱚ", iso639_3: "hoc", region: "IN", indian_states: ["Jharkhand", "Odisha", "WB"], script: "Ol Chiki", tier: 2, phase: "Y3", direction: "ltr", voice_enabled: false, stt_enabled: false, mt_enabled: true, detection_enabled: false, transliteration_enabled: false, fallback: "sat" },
  { code: "unr", name: "Mundari", native_name: "ᱢᱩᱱᱰᱟᱹᱨᱤ", iso639_3: "unr", region: "IN", indian_states: ["Jharkhand", "Odisha", "WB"], script: "Ol Chiki", tier: 2, phase: "Y3", direction: "ltr", voice_enabled: false, stt_enabled: false, mt_enabled: true, detection_enabled: false, transliteration_enabled: false, fallback: "sat" },
  { code: "kru", name: "Kurukh", native_name: "कुड़ुख", iso639_3: "kru", region: "IN", indian_states: ["Jharkhand", "Chhattisgarh", "Odisha", "WB"], script: "Devanagari", tier: 2, phase: "Y3", direction: "ltr", voice_enabled: false, stt_enabled: false, mt_enabled: true, detection_enabled: false, transliteration_enabled: false, fallback: "hi" },
  { code: "sck", name: "Sadri", native_name: "सदरी", iso639_3: "sck", region: "IN", indian_states: ["Jharkhand", "Bihar", "Chhattisgarh", "Odisha", "WB", "Assam"], is_dialect: true, script: "Devanagari", tier: 2, phase: "Y3", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: true, fallback: "hi" },
  { code: "sjp", name: "Surjapuri", native_name: "सुरजापुरी", iso639_3: "sjp", region: "IN", indian_states: ["Bihar", "WB"], is_dialect: true, script: "Devanagari", tier: 2, phase: "Y3", direction: "ltr", voice_enabled: false, stt_enabled: false, mt_enabled: true, detection_enabled: false, transliteration_enabled: true, fallback: "bho" },
  { code: "dak", name: "Dakhini", native_name: "دکنی", iso639_3: "dak", region: "IN", indian_states: ["Telangana", "AP", "Karnataka", "Maharashtra"], is_dialect: true, script: "Arabic", tier: 2, phase: "Y3", direction: "rtl", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: true, fallback: "ur" },
  { code: "lmn", name: "Lambadi", native_name: "लम्बाडी", iso639_3: "lmn", region: "IN", indian_states: ["AP", "Telangana", "Karnataka", "Maharashtra"], is_dialect: true, script: "Devanagari", tier: 2, phase: "Y3", direction: "ltr", voice_enabled: false, stt_enabled: false, mt_enabled: true, detection_enabled: false, transliteration_enabled: true, fallback: "te" },
  // Additional Indian languages from 8th Schedule not yet listed
  { code: "sa", name: "Sanskrit", native_name: "संस्कृतम्", iso639_3: "san", region: "IN", indian_states: [], script: "Devanagari", tier: 2, phase: "Y3", direction: "ltr", voice_enabled: false, stt_enabled: false, mt_enabled: true, detection_enabled: true, transliteration_enabled: true, fallback: "hi" },
  { code: "sd", name: "Sindhi", native_name: "سنڌي", iso639_3: "snd", region: "IN", indian_states: ["Gujarat", "Rajasthan", "MP"], script: "Arabic", tier: 2, phase: "Y3", direction: "rtl", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: true, fallback: "ur" },

  // ============================================================
  // TIER 3 — Global emerging-market languages (MT UI + English voice)
  // ============================================================
  // South Asia neighbors
  { code: "bn-BD", name: "Bengali (Bangladesh)", native_name: "বাংলা (বাংলাদেশ)", iso639_3: "ben", region: "BD", script: "Bengali", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "bn" },
  { code: "ps", name: "Pashto", native_name: "پښتو", iso639_3: "pus", region: "PK", script: "Arabic", tier: 3, phase: "FUTURE", direction: "rtl", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "ur" },
  { code: "si-LK", name: "Sinhala (LK)", native_name: "සිංහල", iso639_3: "sin", region: "LK", script: "Sinhala", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "si" },
  { code: "dv", name: "Dhivehi", native_name: "ދިވެހި", iso639_3: "div", region: "MV", script: "Thaana", tier: 3, phase: "FUTURE", direction: "rtl", voice_enabled: false, stt_enabled: false, mt_enabled: true, detection_enabled: false, transliteration_enabled: false, fallback: "en" },
  // Africa
  { code: "yo", name: "Yoruba", native_name: "Yorùbá", iso639_3: "yor", region: "NG", script: "Latin", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: true, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "en" },
  { code: "ig", name: "Igbo", native_name: "Igbo", iso639_3: "ibo", region: "NG", script: "Latin", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "en" },
  { code: "am", name: "Amharic", native_name: "አማርኛ", iso639_3: "amh", region: "ET", script: "Ethiopic", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: true, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "en" },
  { code: "zu", name: "Zulu", native_name: "isiZulu", iso639_3: "zul", region: "ZA", script: "Latin", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "en" },
  { code: "xh", name: "Xhosa", native_name: "isiXhosa", iso639_3: "xho", region: "ZA", script: "Latin", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "en" },
  { code: "af", name: "Afrikaans", native_name: "Afrikaans", iso639_3: "afr", region: "ZA", script: "Latin", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "en" },
  { code: "rw", name: "Kinyarwanda", native_name: "Kinyarwanda", iso639_3: "kin", region: "RW", script: "Latin", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "en" },
  { code: "fr", name: "French", native_name: "Français", iso639_3: "fra", region: "CI", script: "Latin", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: true, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "en" },
  { code: "fr-CI", name: "French (Côte d'Ivoire)", native_name: "Français (Côte d'Ivoire)", iso639_3: "fra", region: "CI", script: "Latin", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "fr" },
  { code: "fr-SN", name: "French (Senegal)", native_name: "Français (Sénégal)", iso639_3: "fra", region: "SN", script: "Latin", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "fr" },
  { code: "wo", name: "Wolof", native_name: "Wolof", iso639_3: "wol", region: "SN", script: "Latin", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: false, mt_enabled: true, detection_enabled: false, transliteration_enabled: false, fallback: "fr-SN" },
  { code: "so", name: "Somali", native_name: "Soomaali", iso639_3: "som", region: "SO", script: "Latin", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "ar" },
  // LatAm
  { code: "es-CO", name: "Spanish (Colombia)", native_name: "Español (Colombia)", iso639_3: "spa", region: "CO", script: "Latin", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "es-MX" },
  { code: "es-PE", name: "Spanish (Peru)", native_name: "Español (Perú)", iso639_3: "spa", region: "PE", script: "Latin", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "es-MX" },
  { code: "es-AR", name: "Spanish (Argentina)", native_name: "Español (Argentina)", iso639_3: "spa", region: "AR", script: "Latin", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "es-MX" },
  { code: "qu", name: "Quechua", native_name: "Runa Simi", iso639_3: "que", region: "PE", script: "Latin", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: false, mt_enabled: true, detection_enabled: false, transliteration_enabled: false, fallback: "es-PE" },
  // MENA
  { code: "fa", name: "Persian", native_name: "فارسی", iso639_3: "fas", region: "IR", script: "Arabic", tier: 3, phase: "FUTURE", direction: "rtl", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "ar" },
  { code: "tr", name: "Turkish", native_name: "Türkçe", iso639_3: "tur", region: "TR", script: "Latin", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: true, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "en" },
  { code: "he", name: "Hebrew", native_name: "עברית", iso639_3: "heb", region: "IL", script: "Hebrew", tier: 3, phase: "FUTURE", direction: "rtl", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "en" },
  // SEA
  { code: "id", name: "Indonesian", native_name: "Bahasa Indonesia", iso639_3: "ind", region: "ID", script: "Latin", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: true, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "en" },
  { code: "vi", name: "Vietnamese", native_name: "Tiếng Việt", iso639_3: "vie", region: "VN", script: "Latin", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: true, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "en" },
  { code: "th", name: "Thai", native_name: "ภาษาไทย", iso639_3: "tha", region: "TH", script: "Thai", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: true, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "en" },
  { code: "fil", name: "Filipino", native_name: "Filipino", iso639_3: "fil", region: "PH", script: "Latin", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: true, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "en" },
  { code: "ms", name: "Malay", native_name: "Bahasa Melayu", iso639_3: "msa", region: "MY", script: "Latin", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "id" },
  { code: "km", name: "Khmer", native_name: "ខ្មែរ", iso639_3: "khm", region: "KH", script: "Khmer", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "en" },
  { code: "lo", name: "Lao", native_name: "ລາວ", iso639_3: "lao", region: "LA", script: "Lao", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "en" },
  { code: "my", name: "Burmese", native_name: "ဗမာ", iso639_3: "mya", region: "MM", script: "Myanmar", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "en" },
  { code: "jv", name: "Javanese", native_name: "Basa Jawa", iso639_3: "jav", region: "ID", script: "Latin", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: false, mt_enabled: true, detection_enabled: false, transliteration_enabled: false, fallback: "id" },
  { code: "su", name: "Sundanese", native_name: "Basa Sunda", iso639_3: "sun", region: "ID", script: "Latin", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: false, mt_enabled: true, detection_enabled: false, transliteration_enabled: false, fallback: "id" },
  // Central Asia
  { code: "kk", name: "Kazakh", native_name: "Қазақ", iso639_3: "kaz", region: "KZ", script: "Cyrillic", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: false, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "tr" },
  { code: "ky", name: "Kyrgyz", native_name: "Кыргызча", iso639_3: "kir", region: "KG", script: "Cyrillic", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: false, mt_enabled: true, detection_enabled: false, transliteration_enabled: false, fallback: "kk" },
  { code: "uz", name: "Uzbek", native_name: "Oʻzbek", iso639_3: "uzb", region: "UZ", script: "Latin", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: false, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "tr" },
  { code: "tk", name: "Turkmen", native_name: "Türkmen", iso639_3: "tuk", region: "TM", script: "Latin", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: false, mt_enabled: true, detection_enabled: false, transliteration_enabled: false, fallback: "uz" },
  { code: "tg", name: "Tajik", native_name: "Тоҷикӣ", iso639_3: "tgk", region: "TJ", script: "Cyrillic", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: false, mt_enabled: true, detection_enabled: false, transliteration_enabled: false, fallback: "fa" },
  // Additional African
  { code: "ak", name: "Akan", native_name: "Akan", iso639_3: "aka", region: "GH", script: "Latin", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: false, mt_enabled: true, detection_enabled: false, transliteration_enabled: false, fallback: "en" },
  { code: "ee", name: "Ewe", native_name: "Eʋegbe", iso639_3: "ewe", region: "GH", script: "Latin", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: false, mt_enabled: true, detection_enabled: false, transliteration_enabled: false, fallback: "ak" },
  { code: "bm", name: "Bambara", native_name: "Bamanankan", iso639_3: "bam", region: "ML", script: "Latin", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: false, mt_enabled: true, detection_enabled: false, transliteration_enabled: false, fallback: "fr" },
  { code: "ff", name: "Fula", native_name: "Fulfulde", iso639_3: "ful", region: "NG", script: "Latin", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: false, mt_enabled: true, detection_enabled: false, transliteration_enabled: false, fallback: "ha" },
  { code: "om", name: "Oromo", native_name: "Afaan Oromoo", iso639_3: "orm", region: "ET", script: "Latin", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: false, mt_enabled: true, detection_enabled: false, transliteration_enabled: false, fallback: "am" },
  { code: "ti", name: "Tigrinya", native_name: "ትግርኛ", iso639_3: "tir", region: "ET", script: "Ethiopic", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: false, mt_enabled: true, detection_enabled: false, transliteration_enabled: false, fallback: "am" },
  { code: "lg", name: "Luganda", native_name: "Luganda", iso639_3: "lug", region: "UG", script: "Latin", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: false, mt_enabled: true, detection_enabled: false, transliteration_enabled: false, fallback: "en" },
  { code: "sn", name: "Shona", native_name: "chiShona", iso639_3: "sna", region: "ZW", script: "Latin", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: false, mt_enabled: true, detection_enabled: false, transliteration_enabled: false, fallback: "en" },
  { code: "ny", name: "Chewa", native_name: "Chichewa", iso639_3: "nya", region: "MW", script: "Latin", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: false, mt_enabled: true, detection_enabled: false, transliteration_enabled: false, fallback: "en" },
  { code: "ln", name: "Lingala", native_name: "Lingála", iso639_3: "lin", region: "CD", script: "Latin", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: false, mt_enabled: true, detection_enabled: false, transliteration_enabled: false, fallback: "fr-CD" },
  { code: "fr-CD", name: "French (DRC)", native_name: "Français (RDC)", iso639_3: "fra", region: "CD", script: "Latin", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "fr" },
  // LatAm extras
  { code: "es-ES", name: "Spanish (Spain)", native_name: "Español (España)", iso639_3: "spa", region: "ES", script: "Latin", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "es-MX" },
  { code: "es-CL", name: "Spanish (Chile)", native_name: "Español (Chile)", iso639_3: "spa", region: "CL", script: "Latin", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "es-MX" },
  { code: "es-EC", name: "Spanish (Ecuador)", native_name: "Español (Ecuador)", iso639_3: "spa", region: "EC", script: "Latin", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "es-MX" },
  { code: "es-VE", name: "Spanish (Venezuela)", native_name: "Español (Venezuela)", iso639_3: "spa", region: "VE", script: "Latin", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "es-MX" },
  { code: "es-BO", name: "Spanish (Bolivia)", native_name: "Español (Bolivia)", iso639_3: "spa", region: "BO", script: "Latin", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "es-MX" },
  { code: "ay", name: "Aymara", native_name: "Aymar aru", iso639_3: "aym", region: "BO", script: "Latin", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: false, mt_enabled: true, detection_enabled: false, transliteration_enabled: false, fallback: "es-BO" },
  { code: "gn", name: "Guarani", native_name: "Avañeẽ", iso639_3: "grn", region: "PY", script: "Latin", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: false, mt_enabled: true, detection_enabled: false, transliteration_enabled: false, fallback: "es-MX" },
  { code: "ht", name: "Haitian Creole", native_name: "Kreyòl ayisyen", iso639_3: "hat", region: "HT", script: "Latin", tier: 3, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: false, mt_enabled: true, detection_enabled: false, transliteration_enabled: false, fallback: "fr" },

  // ============================================================
  // TIER 4 — MT UI only, voice uses Tier 1 fallback (10 locales)
  // ============================================================
  { code: "zh-Hans", name: "Chinese (Simplified)", native_name: "简体中文", iso639_3: "zho", region: "CN", script: "Simplified Chinese", tier: 4, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "en" },
  { code: "ja", name: "Japanese", native_name: "日本語", iso639_3: "jpn", region: "JP", script: "Kanji", tier: 4, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "en" },
  { code: "ko", name: "Korean", native_name: "한국어", iso639_3: "kor", region: "KR", script: "Hangul", tier: 4, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "en" },
  { code: "ru", name: "Russian", native_name: "Русский", iso639_3: "rus", region: "RU", script: "Cyrillic", tier: 4, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "en" },
  { code: "uk", name: "Ukrainian", native_name: "Українська", iso639_3: "ukr", region: "UA", script: "Cyrillic", tier: 4, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "ru" },
  { code: "pl", name: "Polish", native_name: "Polski", iso639_3: "pol", region: "PL", script: "Latin", tier: 4, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "en" },
  { code: "de", name: "German", native_name: "Deutsch", iso639_3: "deu", region: "DE", script: "Latin", tier: 4, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "en" },
  { code: "it", name: "Italian", native_name: "Italiano", iso639_3: "ita", region: "IT", script: "Latin", tier: 4, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "en" },
  { code: "nl", name: "Dutch", native_name: "Nederlands", iso639_3: "nld", region: "NL", script: "Latin", tier: 4, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "en" },
  { code: "sv", name: "Swedish", native_name: "Svenska", iso639_3: "swe", region: "SE", script: "Latin", tier: 4, phase: "FUTURE", direction: "ltr", voice_enabled: false, stt_enabled: true, mt_enabled: true, detection_enabled: true, transliteration_enabled: false, fallback: "en" },
];

export const LOCALE_CODES: string[] = LOCALES.map((l) => l.code);
export const TIER1_LOCALES = LOCALES.filter((l) => l.tier === 1);
export const TIER2_LOCALES = LOCALES.filter((l) => l.tier === 2);
export const TIER3_LOCALES = LOCALES.filter((l) => l.tier === 3);
export const TIER4_LOCALES = LOCALES.filter((l) => l.tier === 4);
export const RTL_LOCALES = LOCALES.filter((l) => l.direction === "rtl").map((l) => l.code);
export const VOICE_LOCALES = LOCALES.filter((l) => l.voice_enabled).map((l) => l.code);
export const STT_LOCALES = LOCALES.filter((l) => l.stt_enabled).map((l) => l.code);
export const MT_LOCALES = LOCALES.filter((l) => l.mt_enabled).map((l) => l.code);
export const DETECTION_LOCALES = LOCALES.filter((l) => l.detection_enabled).map((l) => l.code);
export const TRANSLITERATION_LOCALES = LOCALES.filter((l) => l.transliteration_enabled).map((l) => l.code);

// v3.2 wedge — phase-filtered locale sets
export const Y1_H1_LOCALES = LOCALES.filter((l) => l.phase === "Y1-H1");  // 3: hi, bho, en
export const Y1_H2_LOCALES = LOCALES.filter((l) => l.phase === "Y1-H2");  // 2: bn, mr
export const Y1_LOCALES = LOCALES.filter((l) => l.phase === "Y1-H1" || l.phase === "Y1-H2");  // 5
export const Y2_LOCALES = LOCALES.filter((l) => l.phase === "Y2");
export const Y3_LOCALES = LOCALES.filter((l) => l.phase === "Y3");
export const FUTURE_LOCALES = LOCALES.filter((l) => l.phase === "FUTURE");

/**
 * Y1 active locale codes — only these 5 are loaded in Y1 builds.
 * Used by next-intl routing config + AI gateway locale registry.
 */
export const Y1_ACTIVE_LOCALE_CODES = Y1_LOCALES.map((l) => l.code);  // ["hi", "bho", "en", "bn", "mr"]

// Indian-only subsets (for India-first product positioning)
export const INDIAN_LOCALES = LOCALES.filter((l) => l.region === "IN");
export const INDIAN_TIER1_LOCALES = INDIAN_LOCALES.filter((l) => l.tier === 1);
export const INDIAN_TIER2_LOCALES = INDIAN_LOCALES.filter((l) => l.tier === 2);

// Dialect vs language split
export const DIALECT_LOCALES = LOCALES.filter((l) => l.is_dialect);
export const STANDARDIZED_LOCALES = LOCALES.filter((l) => !l.is_dialect);

export function getLocaleConfig(code: string): LocaleConfig | undefined {
  return LOCALES.find((l) => l.code === code);
}

/** Returns true if locale is Y1-active (loaded in Y1 build). */
export function isY1Active(code: string): boolean {
  return Y1_ACTIVE_LOCALE_CODES.includes(code);
}

export function isRTL(code: string): boolean {
  return RTL_LOCALES.includes(code);
}

export function voiceLocaleAvailable(code: string): boolean {
  const cfg = getLocaleConfig(code);
  if (!cfg) return false;
  if (cfg.voice_enabled) return true;
  return cfg.fallback ? voiceLocaleAvailable(cfg.fallback) : false;
}

export function resolveVoiceLocale(code: string): string {
  const cfg = getLocaleConfig(code);
  if (!cfg) return "en";
  if (cfg.voice_enabled) return cfg.code;
  return cfg.fallback ? resolveVoiceLocale(cfg.fallback) : "en";
}

export function resolveSTTLocale(code: string): string {
  const cfg = getLocaleConfig(code);
  if (!cfg) return "en";
  if (cfg.stt_enabled) return cfg.code;
  return cfg.fallback ? resolveSTTLocale(cfg.fallback) : "en";
}

export function resolveMTLocale(code: string): string {
  const cfg = getLocaleConfig(code);
  if (!cfg) return "en";
  if (cfg.mt_enabled) return cfg.code;
  return cfg.fallback ? resolveMTLocale(cfg.fallback) : "en";
}

export const TOTAL_LOCALE_COUNT = LOCALES.length;
export const INDIAN_LOCALE_COUNT = INDIAN_LOCALES.length;
