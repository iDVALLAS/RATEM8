import Orb from "@/components/Orb";

/**
 * EmptyState — what a data surface shows when there is nothing to show
 * (v24): the small orb mark, one plain sentence, and an optional action.
 */
export default function EmptyState({ title, body, action, className = "" }: { title: string; body?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={`empty-state ${className}`.trim()} role="status">
      <Orb size="mark" px={28} state="idle" />
      <div>
        <p className="empty-state__title">{title}</p>
        {body ? <p className="empty-state__body">{body}</p> : null}
        {action ? <div className="empty-state__action">{action}</div> : null}
      </div>
    </div>
  );
}
