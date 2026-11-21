import { prisma } from "@/lib/db";
import InviteMemberForm from "@/components/team/InviteMemberForm";
import TeamMemberRow from "@/components/team/TeamMemberRow";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const members = await prisma.teamMember.findMany({
    orderBy: [{ createdAt: "asc" }],
    include: {
      _count: {
        select: { tasks: { where: { status: { not: "COMPLETED" } } } },
      },
    },
  });

  return (
    <div className="px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Team</h1>
          <p className="mt-1 text-sm text-gray-500">
            Team members and roles are assignment metadata only. They do not grant access or enforce permissions;
            all users currently share the same password gate.
          </p>
        </div>
        <InviteMemberForm />
      </div>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        {members.length === 0 ? (
          <div className="flex flex-col items-center py-16">
            <div className="text-lg font-semibold">No team members yet</div>
            <p className="mt-1 text-sm text-gray-500">Invite your first team member to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="min-w-[760px] w-full text-left">
            <thead>
              <tr className="text-xs font-medium uppercase tracking-wide text-gray-400">
                <th className="pb-2 pr-4 font-medium">Member</th>
                <th className="pb-2 pr-4 font-medium">Role</th>
                <th className="pb-2 pr-4 font-medium">Open tasks</th>
                <th className="pb-2 pr-4 font-medium">Joined</th>
                <th className="pb-2 pr-4 font-medium">Change role</th>
                <th className="pb-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <TeamMemberRow
                  key={member.id}
                  member={{
                    id: member.id,
                    name: member.name,
                    email: member.email,
                    role: member.role,
                    createdAt: member.createdAt.toISOString(),
                    openTaskCount: member._count.tasks,
                  }}
                />
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
