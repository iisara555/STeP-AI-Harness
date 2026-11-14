// Syntax colours for code in AI answers. Loaded on demand by chat-markdown.tsx the first time an answer shows a code
// block, so highlight.js stays out of the bundle the app starts with.
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import python from 'highlight.js/lib/languages/python';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

for (const [name, language] of Object.entries({ bash, css, javascript, json, markdown, python, sql, typescript, xml, yaml }))
  hljs.registerLanguage(name, language);

/** HTML with <span class="hljs-..."> around tokens; highlight.js escapes the code itself. Empty when the language is unknown. */
export const highlight = (code: string, language: string) =>
  language && hljs.getLanguage(language) ? hljs.highlight(code, { language, ignoreIllegals: true }).value : '';
