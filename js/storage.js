export const STUDIES_KEY = "textlab.studies.v1";
export const SETTINGS_KEY = "textlab.settings.v1";

const READING_SIZES = new Set(["s", "m", "l", "xl"]);

export function readingSizeOf(value) {
  return READING_SIZES.has(value) ? value : "m";
}

export function defaultSettings() {
  return { esvApiKey: "", theme: "system", activeStudyId: null, readingSize: "m", helpDismissed: false };
}

export function loadSettings(storage) {
  try {
    const raw = storage.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings();
    const parsed = JSON.parse(raw);
    const theme = parsed.theme === "light" || parsed.theme === "dark" || parsed.theme === "system" ? parsed.theme : "system";
    return {
      esvApiKey: typeof parsed.esvApiKey === "string" ? parsed.esvApiKey : "",
      theme,
      activeStudyId: typeof parsed.activeStudyId === "string" ? parsed.activeStudyId : null,
      readingSize: readingSizeOf(parsed.readingSize),
      helpDismissed: parsed.helpDismissed === true,
    };
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(settings, storage) {
  storage.setItem(
    SETTINGS_KEY,
    JSON.stringify({
      esvApiKey: typeof settings.esvApiKey === "string" ? settings.esvApiKey : "",
      theme: settings.theme || "system",
      activeStudyId: settings.activeStudyId || null,
      readingSize: readingSizeOf(settings.readingSize),
      helpDismissed: settings.helpDismissed === true,
    }),
  );
}

export function loadStudies(storage) {
  try {
    const raw = storage.getItem(STUDIES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveStudies(studies, storage) {
  storage.setItem(STUDIES_KEY, JSON.stringify(studies));
}

export function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
  };
}
