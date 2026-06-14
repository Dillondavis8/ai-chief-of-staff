type SourceBadgesProps = {
  ids: string[];
};

export function SourceBadges({ ids }: SourceBadgesProps) {
  if (ids.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Source messages">
      {ids.map((id) => (
        <a key={id} className="source-badge" href={`#message-${id}`}>
          #{id}
        </a>
      ))}
    </div>
  );
}
