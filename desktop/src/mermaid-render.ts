// Offline Mermaid SVG renderer loaded on demand when a chat reply or artifact contains a Mermaid diagram.
// Runs with securityLevel='strict' and htmlLabels=false so untrusted model diagrams never execute JS or inject HTML.
import mermaid from 'mermaid';

let counter = 0;
let queue: Promise<unknown> = Promise.resolve();
let configuredTheme: 'dark' | 'default' | null = null;

function sanitizeSvg(svg: string) {
  return svg
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript\s*:/gi, '');
}

/** Renders a Mermaid diagram to a clean SVG string, or returns null when the diagram is incomplete or invalid. */
export function renderMermaidSvg(source: string, dark: boolean): Promise<string | null> {
  const trimmed = source.trim();
  if (!trimmed || trimmed.length > 50_000) return Promise.resolve(null);
  const run = async (): Promise<string | null> => {
    const theme = dark ? 'dark' : 'default';
    if (configuredTheme !== theme) {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme,
        htmlLabels: false,
        suppressErrorRendering: true,
        flowchart: { htmlLabels: false, useMaxWidth: true },
        sequence: { useMaxWidth: true },
      });
      configuredTheme = theme;
    }
    try {
      const valid = await mermaid.parse(trimmed, { suppressErrors: true });
      if (!valid) return null;
      const id = `step-mmd-${++counter}`;
      const rendered = await mermaid.render(id, trimmed);
      // Remove any orphaned temp container Mermaid creates on document.body.
      document.getElementById(`d${id}`)?.remove();
      return rendered?.svg ? sanitizeSvg(rendered.svg) : null;
    } catch {
      return null;
    }
  };
  const next = queue.then(run, run);
  queue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}
