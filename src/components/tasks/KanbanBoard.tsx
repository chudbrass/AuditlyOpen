import TaskCard from "./TaskCard";
import { TaskDTO, TaskStatus } from "./types";

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "OPEN", label: "Open" },
  { status: "IN_PROGRESS", label: "In Progress" },
  { status: "COMPLETED", label: "Completed" },
];

export default function KanbanBoard({ tasks }: { tasks: TaskDTO[] }) {
  return (
    <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
      {COLUMNS.map((col) => {
        const columnTasks = tasks.filter((t) => t.status === col.status);
        return (
          <div key={col.status} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <div className="mb-3 flex items-center justify-between px-1">
              <h2 className="text-sm font-semibold text-gray-700">{col.label}</h2>
              <span className="rounded-full bg-white px-2 py-0.5 text-xs text-gray-500 shadow-sm">
                {columnTasks.length}
              </span>
            </div>
            <div className="flex flex-col gap-3">
              {columnTasks.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-300 bg-white/50 py-8 text-center text-xs text-gray-400">
                  No tasks
                </div>
              ) : (
                columnTasks.map((task) => <TaskCard key={task.id} task={task} />)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
