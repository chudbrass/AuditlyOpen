import { prisma } from "@/lib/db";
import KanbanBoard from "@/components/tasks/KanbanBoard";
import StatChips from "@/components/tasks/StatChips";
import AssigneeFilterPills from "@/components/tasks/AssigneeFilterPills";
import NewTaskForm from "@/components/tasks/NewTaskForm";
import { TaskDTO } from "@/components/tasks/types";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ assignee?: string; cursor?: string }>;
}

export default async function TasksPage({ searchParams }: PageProps) {
  const { assignee, cursor } = await searchParams;

  const [taskRows, members, sites] = await Promise.all([
    prisma.task.findMany({
      where: assignee ? { assigneeId: assignee } : undefined,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 101,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        site: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.teamMember.findMany({ orderBy: { name: "asc" } }),
    prisma.site.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const tasks = taskRows.slice(0, 100);
  const nextCursor = taskRows.length > 100 ? tasks.at(-1)?.id : null;

  const taskDTOs: TaskDTO[] = tasks.map((t) => ({
    id: t.id,
    siteId: t.siteId,
    site: t.site ? { id: t.site.id, name: t.site.name } : null,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    assigneeId: t.assigneeId,
    assignee: t.assignee
      ? { id: t.assignee.id, name: t.assignee.name, email: t.assignee.email }
      : null,
    findingCode: t.findingCode,
    pageUrl: t.pageUrl,
    dueAt: t.dueAt ? t.dueAt.toISOString() : null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }));

  return (
    <div className="px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tasks</h1>
          <p className="mt-1 text-sm text-gray-500">
            Track remediation work across your sites, one card at a time.
          </p>
        </div>
        <NewTaskForm members={members} sites={sites} />
      </div>

      <StatChips tasks={taskDTOs} />

      <AssigneeFilterPills members={members} />

      <KanbanBoard tasks={taskDTOs} />
      {nextCursor && (
        <a href={`/tasks?${new URLSearchParams({ ...(assignee ? { assignee } : {}), cursor: nextCursor }).toString()}`} className="mt-4 inline-flex text-sm font-medium text-blue-600 hover:underline">
          Older tasks →
        </a>
      )}
    </div>
  );
}
