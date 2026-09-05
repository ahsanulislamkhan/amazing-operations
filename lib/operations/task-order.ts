type QueueTask = { invoice: string; status: string; isoDate: string; priority?: string; scheduledAt?: string };

export function taskUrgency(task: QueueTask, today: string): "Complete" | "Overdue" | "Due today" | "High priority" | "Upcoming" {
  if (task.status === "Complete") return "Complete";
  if (task.isoDate < today) return "Overdue";
  if (task.isoDate === today) return "Due today";
  if (task.priority === "High") return "High priority";
  return "Upcoming";
}

export function compareTeamTasks(left: QueueTask, right: QueueTask, today: string) {
  const ranks = { Overdue: 0, "Due today": 1, "High priority": 2, Upcoming: 3, Complete: 4 };
  return ranks[taskUrgency(left, today)] - ranks[taskUrgency(right, today)]
    || (left.scheduledAt ?? left.isoDate).localeCompare(right.scheduledAt ?? right.isoDate)
    || left.invoice.localeCompare(right.invoice);
}
