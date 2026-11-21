"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { TeamMemberOption } from "./types";

export default function AssigneeFilterPills({ members }: { members: TeamMemberOption[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeAssignee = searchParams.get("assignee");

  function hrefFor(id: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (id) {
      params.set("assignee", id);
    } else {
      params.delete("assignee");
    }
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  const pillClass = (active: boolean) =>
    `rounded-full px-3 py-1 text-xs font-medium transition-colors ${
      active ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
    }`;

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <Link href={hrefFor(null)} className={pillClass(!activeAssignee)}>
        All
      </Link>
      {members.map((member) => (
        <Link key={member.id} href={hrefFor(member.id)} className={pillClass(activeAssignee === member.id)}>
          {member.name}
        </Link>
      ))}
    </div>
  );
}
