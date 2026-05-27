import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Markdown({ children }: { children: string | null | undefined }) {
  if (!children) return <div className="text-sm text-slate-500 italic">No content yet.</div>;
  return (
    <div className="prose-md text-sm text-slate-200">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
