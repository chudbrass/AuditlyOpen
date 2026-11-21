import { TaskDTO } from "./types";

export default function StatChips({ tasks }: { tasks: TaskDTO[] }) {
  const completed = tasks.filter((t) => t.status === "COMPLETED").length;
  const inProgress = tasks.filter((t) => t.status === "IN_PROGRESS").length;
  const open = tasks.filter((t) => t.status === "OPEN").length;
  const overdue = tasks.filter(
    (t) => t.dueAt !== null && new Date(t.dueAt) < new Date() && t.status !== "COMPLETED"
  ).length;

  const chips = [
    { label: "Completed", value: completed, className: "bg-green-50 text-green-700" },
    { label: "In progress", value: inProgress, className: "bg-blue-50 text-blue-700" },
    { label: "Open", value: open, className: "bg-gray-100 text-gray-700" },
    { label: "Overdue", value: overdue, className: "bg-red-50 text-red-700" },
  ];

  return (
    <div className="mt-4 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:flex lg:flex-wrap">
      {chips.map((chip) => (
        <div
          key={chip.label}
          className={`flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 shadow-sm`}
        >
          <span className={`rounded-full px-2 py-0.5 text-sm font-bold ${chip.className}`}>
            {chip.value}
          </span>
          <span className="text-xs text-gray-500">{chip.label}</span>
        </div>
      ))}
    </div>
  );
}
