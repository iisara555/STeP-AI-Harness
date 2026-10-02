import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

export type CatalogEntry = { id: string; title: string; path: string; owner?: string; status?: string };
export type KnowledgeSection = { id: string; title: string; path: string; heading: string; text: string; score: number };
type Section = Omit<KnowledgeSection, 'score'> & { headGrams: Set<string>; bodyGrams: Set<string> };

// Thai has no spaces between words, so documents and questions are compared as character trigrams.
const normalize = (text: string) => text.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
function trigrams(text: string) {
  const value = normalize(text),
    grams = new Set<string>();
  for (let i = 0; i + 3 <= value.length; i++) grams.add(value.slice(i, i + 3));
  return grams;
}
const share = (query: string[], grams: Set<string>) => query.filter(g => grams.has(g)).length / Math.max(query.length, 1);

/** Below this a question is about something the organization documents do not cover (tested on staff questions). */
export const MATCH_THRESHOLD = 0.3;
/** A match this strong answers from the documents alone; weaker matches still allow a public web search afterwards. */
export const STRONG_MATCH = 0.5;
const MAX_SECTIONS = 4,
  MAX_CHARS = 9000,
  SECTION_CHARS = 4000;

/**
 * Finds the organization's own registered documents that answer a question, so the assistant reads them before it
 * searches the web or answers from general knowledge. Local only: documents are read from the harness, never sent
 * anywhere by this class.
 */
export class OrganizationKnowledge {
  private sections?: Promise<Section[]>;
  constructor(
    private root: string,
    private catalog: () => Promise<CatalogEntry[]>,
  ) {}
  async entries() {
    return (await this.catalog().catch(() => [])).filter(entry => {
      const rel = relative(this.root, resolve(this.root, entry.path));
      return entry.path && !rel.startsWith('..') && !isAbsolute(rel);
    });
  }
  private load() {
    this.sections ??= this.entries().then(async entries => {
      const all: Section[] = [];
      for (const entry of entries) {
        const body = await readFile(resolve(this.root, entry.path), 'utf8').catch(() => '');
        for (const part of body.split(/\n(?=#{1,3} )/)) {
          const heading = /^#{1,3} (.+)/.exec(part)?.[1]?.trim() || entry.title;
          all.push({
            id: entry.id,
            title: entry.title,
            path: entry.path,
            heading,
            text: part.trim(),
            headGrams: trigrams(entry.title + ' ' + heading),
            bodyGrams: trigrams(part.slice(0, 20000)),
          });
        }
      }
      return all;
    });
    return this.sections;
  }
  /** The best-matching sections, strongest first; empty when the documents do not cover the question. */
  async search(question: string): Promise<KnowledgeSection[]> {
    const query = [...trigrams(question)];
    if (query.length < 2) return [];
    const scored = (await this.load())
      .map(section => ({ section, score: 0.6 * share(query, section.headGrams) + 0.4 * share(query, section.bodyGrams) }))
      .sort((a, b) => b.score - a.score);
    const best = scored[0]?.score || 0;
    if (best < MATCH_THRESHOLD) return [];
    const picked: KnowledgeSection[] = [];
    let chars = 0;
    for (const { section, score } of scored) {
      if (picked.length >= MAX_SECTIONS || score < Math.max(MATCH_THRESHOLD, best * 0.75)) break;
      const text = section.text.length > SECTION_CHARS ? section.text.slice(0, SECTION_CHARS) + '\n…' : section.text;
      if (chars + text.length > MAX_CHARS) continue;
      chars += text.length;
      picked.push({
        id: section.id,
        title: section.title,
        path: section.path,
        heading: section.heading,
        text,
        score: Math.round(score * 100) / 100,
      });
    }
    return picked;
  }
}

/** Prompt text for the matched sections, each labelled with its registered document so answers can cite it. */
export function knowledgeText(sections: KnowledgeSection[]) {
  return sections.map(s => `[${s.id}] ${s.title}\n§ ${s.heading}\n${s.text}`).join('\n\n---\n\n');
}

/** One line per registered document, for the reference(id) tool. */
export function catalogText(entries: CatalogEntry[]) {
  return entries.map(e => `- ${e.id}: ${e.title}${e.owner ? ` (owner: ${e.owner})` : ''}`).join('\n');
}
