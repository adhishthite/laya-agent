import Markdown from "react-markdown";

interface ProseProps {
  children: string;
}

/**
 * The System 2 explanation arrives as markdown. Rendering it raw showed literal
 * asterisks, so it is parsed here with an explicit element map. No typography
 * plugin, so the panel keeps the same type scale as the rest of the bench.
 */
export function Prose({ children }: ProseProps) {
  return (
    <div className="max-w-[68ch] text-[15px] leading-relaxed text-ink-soft">
      <Markdown
        components={{
          p: ({ children }) => <p className="mt-3 first:mt-0">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => <ul className="mt-3 space-y-1.5 first:mt-0">{children}</ul>,
          ol: ({ children }) => <ol className="mt-3 space-y-1.5 first:mt-0">{children}</ol>,
          li: ({ children }) => (
            <li className="relative pl-4 before:absolute before:left-0 before:text-ink-faint before:content-['\2022']">
              {children}
            </li>
          ),
          h1: ({ children }) => (
            <h4 className="mt-5 font-display text-[15px] font-semibold text-ink first:mt-0">
              {children}
            </h4>
          ),
          h2: ({ children }) => (
            <h4 className="mt-5 font-display text-[15px] font-semibold text-ink first:mt-0">
              {children}
            </h4>
          ),
          h3: ({ children }) => (
            <h4 className="mt-5 font-display text-[15px] font-semibold text-ink first:mt-0">
              {children}
            </h4>
          ),
          code: ({ children }) => (
            <code className="rounded bg-sunken px-1 py-0.5 font-mono text-[13px] text-ink">
              {children}
            </code>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink"
            >
              {children}
            </a>
          ),
        }}
      >
        {children}
      </Markdown>
    </div>
  );
}
