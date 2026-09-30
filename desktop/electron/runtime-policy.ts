// Retrieval is a separate, isolated run. All other requests keep native tools disabled.
export function geminiTools(webSearch = false) {
  return { core: webSearch ? ['google_web_search'] : [] };
}
