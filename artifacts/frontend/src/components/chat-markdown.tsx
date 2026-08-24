import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";

const components: Components = {
  h1: ({ children }) => (
    <h1 className="text-xl font-semibold text-cyan-700 dark:text-cyan-300 mt-4 mb-2 first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-lg font-semibold text-sky-700 dark:text-sky-300 mt-4 mb-2 first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-base font-semibold text-teal-700 dark:text-teal-300 mt-3 mb-1.5 first:mt-0">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-sm font-semibold text-emerald-700 dark:text-emerald-300 mt-3 mb-1 first:mt-0">{children}</h4>
  ),
  p: ({ children }) => <p className="text-sm leading-relaxed text-foreground/95 my-2">{children}</p>,
  strong: ({ children }) => (
    <strong className="font-semibold text-amber-700 dark:text-amber-300">{children}</strong>
  ),
  em: ({ children }) => <em className="italic text-violet-700 dark:text-violet-300">{children}</em>,
  a: ({ href, children }) => (
    <a
      href={href}
      className="text-cyan-700 dark:text-cyan-400 underline decoration-cyan-400/40 underline-offset-2 hover:text-cyan-600 dark:hover:text-cyan-300"
      target="_blank"
      rel="noreferrer"
    >
      {children}
    </a>
  ),
  ul: ({ children }) => (
    <ul className="my-2 ml-4 list-disc space-y-1 marker:text-cyan-600 dark:marker:text-cyan-400">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 ml-4 list-decimal space-y-1 marker:text-amber-600 dark:marker:text-amber-400">{children}</ol>
  ),
  li: ({ children }) => <li className="text-sm leading-relaxed pl-1">{children}</li>,
  hr: () => <hr className="my-4 border-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />,
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-violet-400/70 bg-violet-500/10 pl-3 py-1 text-violet-800 dark:text-violet-100/90">
      {children}
    </blockquote>
  ),
  code: ({ className, children }) => {
    const isBlock = Boolean(className?.includes("language-"));
    if (!isBlock) {
      return (
        <code className="rounded bg-fuchsia-500/15 px-1.5 py-0.5 font-mono text-[12px] text-fuchsia-700 dark:text-fuchsia-300">
          {children}
        </code>
      );
    }
    return (
      <code className={`block font-mono text-[12px] leading-relaxed text-emerald-800 dark:text-emerald-200 ${className ?? ""}`}>
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-xl border border-emerald-500/20 bg-zinc-950/5 dark:bg-zinc-950/80 p-3 shadow-inner">
      {children}
    </pre>
  ),
};

export function ChatMarkdown({ content }: { content: string }) {
  return (
    <div className="chat-markdown max-w-none">
      <ReactMarkdown components={components}>{content}</ReactMarkdown>
    </div>
  );
}
