export type TaskStatus = "OPEN" | "IN_PROGRESS" | "COMPLETED";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export interface TaskSite {
  id: string;
  name: string;
}

export interface TaskAssignee {
  id: string;
  name: string;
  email: string;
}

export interface TaskDTO {
  id: string;
  siteId: string | null;
  site: TaskSite | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  assignee: TaskAssignee | null;
  findingCode: string | null;
  pageUrl: string | null;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TeamMemberOption {
  id: string;
  name: string;
  email: string;
}

export interface SiteOption {
  id: string;
  name: string;
}
