import type { UserOption } from "@/lib/api/types";

export function ParticipantChips({
  participants,
  externalAttendees,
  users,
}: {
  participants: number[];
  externalAttendees: string[];
  users: UserOption[];
}) {
  if (participants.length === 0 && externalAttendees.length === 0) {
    return <span className="text-xs text-ink-400">None recorded</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {participants.map((id) => (
        <span
          key={`user-${id}`}
          className="border border-ink-200 bg-ink-50 px-2 py-0.5 text-[11px] text-ink-600"
        >
          {users.find((user) => user.id === id)?.name ?? `User #${id}`}
        </span>
      ))}
      {externalAttendees.map((name, index) => (
        <span
          key={`external-${index}-${name}`}
          className="border border-ink-200 bg-white px-2 py-0.5 text-[11px] text-ink-600"
        >
          <span className="mr-1 text-ink-400">External</span>
          {name}
        </span>
      ))}
    </div>
  );
}
