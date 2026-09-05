"use client";

import { Dispatch, FormEvent, SetStateAction, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import DateFilter from "./components/DateFilter";
import MultiAssigneeSelect from "./components/MultiAssigneeSelect";
import AuditHistory from "./components/AuditHistory";
import "./components/assessment-updates.css";
import type { ActionResult, AuditEventDTO, DateRange, NotificationPreferencesDTO, OperationsSnapshot, StaffStatus, TaskDTO } from "@/lib/operations/types";
import { compareTeamTasks, taskUrgency } from "@/lib/operations/task-order";
import { canTeamTransition } from "@/lib/operations/types";
import { changePasswordAction, requestOwnPasswordResetAction, signInAction, signOutAction } from "./actions/auth";
import {
  archiveTaskAction,
  createAndInviteStaffAction,
  createTaskAction,
  inviteStaffAction,
  loadOperationsAction,
  markNotificationsReadAction,
  saveNotificationPreferencesAction,
  saveStaffAction,
  sendStaffPasswordResetAction,
  setStaffStateAction,
  saveWarehouseAction,
  setWarehouseArchivedAction,
  updateAssignedTaskProgressAction,
  updateProfileAction,
  updateTaskAction,
} from "./actions/operations";
import { getBrowserSupabase } from "@/lib/supabase/client";

type Status = "Pending" | "In Progress" | "Delayed" | "Complete";
type SettingsSection = "My Account" | "Role Management" | "Audit History" | "Password" | "Notification";

type Account = {
  id?: string;
  name: string;
  email: string;
  location: string;
  avatar: string;
  warehouseIds?: string[];
};

type TaskItem = {
  id: string;
  name: string;
  quantity: string;
};

type Administrator = {
  id: string;
  authUserId: string | null;
  name: string;
  email: string;
  role: "Manager" | "Team member";
  status: "Verified" | "Pending" | "Suspended" | "Archived";
  staffStatus: StaffStatus;
  avatar: string;
  warehouseIds?: string[];
  archivedAt?: string | null;
  gender?: string;
  dateOfBirth?: string;
  location?: string;
};

type AdministratorsChangeHandler = (administrators: Administrator[]) => Promise<ActionResult<OperationsSnapshot>>;

type Task = {
  id?: string;
  invoice: string;
  type: "Delivery" | "Pickup" | "Container";
  warehouse: string;
  assignee: string;
  avatar: string;
  date: string;
  scheduled: string;
  status: Status;
  description: string;
  items: TaskItem[];
  notes: string;
  priority: boolean;
  warehouseId?: string;
  assigneeIds?: string[];
  assignees?: string[];
  scheduledAt?: string;
  version?: number;
  archivedAt?: string | null;
  activityNotes?: Array<{ id: string; body: string; authorName: string; createdAt: string }>;
};

type TeamTaskStatus = Status;
type TeamView = "My Tasks" | "Warehouses Network";
type TeamScope = "My Tasks" | "All Company Tasks";

type TeamTask = {
  id?: string;
  invoice: string;
  title: string;
  summary: string;
  isoDate: string;
  date: string;
  time: string;
  location: string;
  status: TeamTaskStatus;
  priority?: "Low" | "High";
  description: string;
  items: TaskItem[];
  notes: string;
  type: Task["type"];
  assignee: string;
  warehouseId?: string;
  assigneeIds?: string[];
  assignees?: string[];
  scheduledAt?: string;
  version?: number;
  archivedAt?: string | null;
  activityNotes?: Array<{ id: string; body: string; authorName: string; createdAt: string }>;
};

type NotificationSettings = typeof defaultNotificationSettings;

type AppNotice = {
  id: string;
  title: string;
  message: string;
  time: string;
  read: boolean;
};

type WarehouseStatusSummaryItem = {
  label: Status;
  value: string;
  tone: "blue" | "purple" | "green" | "red";
  icon: "clock" | "progress" | "complete" | "danger";
};

type Warehouse = {
  id?: string;
  office: string;
  name: string;
  address: string;
  archivedAt?: string | null;
  statuses: WarehouseStatusSummaryItem[];
};

function todayInMelbourne() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function isOperationalDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day;
}

function useUrlDateRange(): [DateRange, (range: DateRange) => void] {
  const [range, setRange] = useState<DateRange>({ from: null, to: null });
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams(window.location.search);
      const from = query.get("from");
      const to = query.get("to");
      const next = { from: isOperationalDate(from) ? from : null, to: isOperationalDate(to) ? to : null };
      if (next.from && next.to && next.to < next.from) {
        const url = new URL(window.location.href);
        url.searchParams.delete("from");
        url.searchParams.delete("to");
        window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
        setRange({ from: null, to: null });
        return;
      }
      setRange(next);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const update = useCallback((next: DateRange) => {
    setRange(next);
    const url = new URL(window.location.href);
    if (next.from) url.searchParams.set("from", next.from); else url.searchParams.delete("from");
    if (next.to) url.searchParams.set("to", next.to); else url.searchParams.delete("to");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);
  return [range, update];
}

function isDateInRange(date: string, range: DateRange) {
  if (range.from && date < range.from) return false;
  if (range.to && date > range.to) return false;
  return true;
}

function dateRangeLabel(range: DateRange) {
  if (!range.from && !range.to) return "All dates";
  if (range.from && range.from === range.to) return formatLongDate(range.from);
  return `${range.from ? formatTaskDate(range.from) : "Earlier"} – ${range.to ? formatTaskDate(range.to) : "Later"}`;
}

function dateFromIso(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function formatTaskDate(isoDate: string) {
  return new Intl.DateTimeFormat("en-AU", { day: "2-digit", month: "short", year: "numeric" })
    .format(dateFromIso(isoDate))
    .replace(/ (\d{4})$/, ", $1");
}

function formatLongDate(isoDate: string) {
  return new Intl.DateTimeFormat("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    .format(dateFromIso(isoDate));
}

function formatCompactDate(isoDate: string) {
  const date = dateFromIso(isoDate);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${String(date.getDate()).padStart(2, "0")} ${months[date.getMonth()]}`;
}

function padCount(value: number) {
  return String(value).padStart(2, "0");
}

function statusClass(status: string) {
  return status.toLowerCase().replaceAll(" ", "-");
}

function managerStatusToTeam(status: Status): TeamTaskStatus {
  return status;
}

function taskToTeamTask(task: Task, existing?: TeamTask): TeamTask {
  return {
    invoice: task.invoice,
    title: task.description || existing?.title || `${task.type} task for ${task.warehouse}`,
    summary: task.items.length ? task.items.map((item) => `${item.quantity} ${item.name}`).join(" · ") : "No items listed",
    isoDate: task.date,
    date: formatCompactDate(task.date),
    time: existing?.time ?? "9:00 AM",
    location: task.warehouse,
    status: managerStatusToTeam(task.status),
    priority: task.priority ? "High" : undefined,
    description: task.description,
    items: task.items,
    notes: task.notes,
    type: task.type,
    assignee: task.assignee,
  };
}

function upsertByInvoice<T extends { invoice: string }>(items: T[], nextItem: T) {
  return items.some((item) => item.invoice === nextItem.invoice)
    ? items.map((item) => item.invoice === nextItem.invoice ? nextItem : item)
    : [...items, nextItem];
}

function useDialogFocus(
  open: boolean,
  containerRef: { readonly current: HTMLElement | null },
  onClose: () => void,
  initialFocusRef?: { readonly current: HTMLElement | null },
) {
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open || !containerRef.current) return;
    const container = containerRef.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const selector = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
    const overlay = container.parentElement;
    const backgroundSiblings = overlay?.parentElement
      ? Array.from(overlay.parentElement.children).filter((element): element is HTMLElement => element instanceof HTMLElement && element !== overlay)
      : [];
    const backgroundState = backgroundSiblings.map((element) => ({
      element,
      inert: element.inert,
      ariaHidden: element.getAttribute("aria-hidden"),
    }));
    document.body.style.overflow = "hidden";
    backgroundSiblings.forEach((element) => {
      element.inert = true;
      element.setAttribute("aria-hidden", "true");
    });

    const focusFrame = window.requestAnimationFrame(() => {
      const target = initialFocusRef?.current ?? container.querySelector<HTMLElement>(selector);
      target?.focus();
    });

    function handleKeyDown(event: KeyboardEvent) {
      // A nested confirmation owns keyboard handling while this drawer is inert.
      if (container.closest("[inert]")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(container.querySelectorAll<HTMLElement>(selector))
        .filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !container.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !container.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      backgroundState.forEach(({ element, inert, ariaHidden }) => {
        element.inert = inert;
        if (ariaHidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
      });
      document.removeEventListener("keydown", handleKeyDown, true);
      window.requestAnimationFrame(() => opener?.focus());
    };
  }, [containerRef, initialFocusRef, open]);
}

const navItems = [
  { label: "Dashboard", icon: "dashboard" },
  { label: "Tasks", icon: "tasks" },
  { label: "Warehouses", icon: "warehouse" },
];

const managerProfileSections: SettingsSection[] = ["My Account", "Role Management", "Audit History", "Password", "Notification"];
const teamProfileSections: SettingsSection[] = ["My Account", "Password", "Notification"];

const accountDefaults = {
  name: "Ramie Shelbie",
  email: "ramieshelbie@gmail.com",
  location: "616 Somerville Road, Sunshine West VIC 3020",
  avatar: "/assets/avatar-ramie.png",
};

const defaultNotificationSettings = {
  assignment: true,
  reassignment: true,
  taskChanged: true,
  noteAdded: false,
  taskDelayed: true,
  taskCompleted: true,
};

const warehouses = [
  { office: "Head Office", name: "Sunshine", address: "616 Somerville Road, Sunshine West VIC 3020" },
  { office: "Regional Office", name: "Geelong", address: "45 Corio Bay Road, Geelong VIC 3220" },
  { office: "Branch Office", name: "Ballarat", address: "89 Lydiard Street, Ballarat VIC 3350" },
];

function warehouseStatusSummary(tasks: Array<Task | TeamTask>): WarehouseStatusSummaryItem[] {
  return [
    {
      label: "Pending",
      value: padCount(tasks.filter((task) => task.status === "Pending").length),
      tone: "blue",
      icon: "clock",
    },
    {
      label: "In Progress",
      value: padCount(tasks.filter((task) => task.status === "In Progress").length),
      tone: "purple",
      icon: "progress",
    },
    {
      label: "Complete",
      value: padCount(tasks.filter((task) => task.status === "Complete").length),
      tone: "green",
      icon: "complete",
    },
    {
      label: "Delayed",
      value: padCount(tasks.filter((task) => task.status === "Delayed").length),
      tone: "red",
      icon: "danger",
    },
  ];
}

function warehousesWithLiveStats(tasks: Array<Task | TeamTask>, warehouseList: Omit<Warehouse, "statuses">[] = warehouses) {
  return warehouseList.map((warehouse) => {
    const warehouseTasks = tasks.filter((task) => ("warehouse" in task ? task.warehouse : task.location) === warehouse.name);
    return {
      ...warehouse,
      statuses: warehouseStatusSummary(warehouseTasks),
    };
  });
}

function LayeredIcon({ kind }: { kind: string }) {
  if (kind === "warehouse") {
    return <span className="layered-icon warehouse-icon" aria-hidden="true">
      <img className="layer-full" src="/assets/icon-warehouse-base.svg" alt="" />
      <img className="warehouse-ground" src="/assets/icon-warehouse-ground.svg" alt="" />
      <img className="warehouse-roof" src="/assets/icon-warehouse-roof.svg" alt="" />
      <img className="warehouse-side warehouse-side--left" src="/assets/icon-warehouse-side.svg" alt="" />
      <img className="warehouse-side warehouse-side--right" src="/assets/icon-warehouse-side.svg" alt="" />
      <img className="warehouse-door" src="/assets/icon-warehouse-door.svg" alt="" />
    </span>;
  }

  if (kind === "complete") {
    return <span className="layered-icon complete-icon" aria-hidden="true">
      <img className="layer-full" src="/assets/icon-complete-base.svg" alt="" />
      <img className="complete-oval" src="/assets/icon-complete-oval.svg" alt="" />
      <img className="complete-check" src="/assets/icon-complete-check.svg" alt="" />
    </span>;
  }

  if (kind === "dropdown") {
    return <span className="layered-icon dropdown-icon" aria-hidden="true">
      <img className="layer-full" src="/assets/icon-dropdown-base.svg" alt="" />
      <img className="dropdown-path" src="/assets/icon-dropdown-path.svg" alt="" />
    </span>;
  }

  const singleIcons: Record<string, string> = {
    dashboard: "/assets/icon-dashboard.svg",
    tasks: "/assets/icon-tasks.svg",
    clock: "/assets/icon-stat-clock.svg",
    progress: "/assets/icon-clock.svg",
    danger: "/assets/icon-stat-danger.svg",
    box: "/assets/icon-stat-box.svg",
  };

  return <img className="single-icon" src={singleIcons[kind]} alt="" />;
}

function PickupIcon() {
  return <span className="layered-icon pickup-icon" aria-hidden="true">
    <img className="pickup-1" src="/assets/icon-pickup-1.svg" alt="" />
    <img className="pickup-2" src="/assets/icon-pickup-2.svg" alt="" />
    <img className="pickup-3" src="/assets/icon-pickup-3.svg" alt="" />
    <img className="pickup-4" src="/assets/icon-pickup-4.svg" alt="" />
    <img className="pickup-5" src="/assets/icon-pickup-5.svg" alt="" />
  </span>;
}

function ContainerIcon() {
  return <span className="layered-icon container-icon" aria-hidden="true">
    <img className="layer-full" src="/assets/icon-container-base.svg" alt="" />
    <img className="container-path" src="/assets/icon-container-path.svg" alt="" />
    <span className="container-square" />
  </span>;
}

function WarehouseCardIcon() {
  return <span className="warehouse-card-icon" aria-hidden="true">
    <img className="layer-full" src="/assets/icon-warehouse-card-base.svg" alt="" />
    <img className="warehouse-card-outline" src="/assets/icon-warehouse-card-outline.svg" alt="" />
    <img className="warehouse-card-door" src="/assets/icon-warehouse-card-door.svg" alt="" />
    <img className="warehouse-card-detail" src="/assets/icon-warehouse-card-detail.svg" alt="" />
  </span>;
}

function WarehouseStatusSummary({ statuses }: { statuses: WarehouseStatusSummaryItem[] }) {
  return (
    <div className="warehouse-statuses" aria-label="Warehouse task status summary">
      {statuses.map((status) => (
        <div className={`warehouse-status warehouse-status--${status.tone}`} key={status.label}>
          <span className={`warehouse-status__label stat-label--${status.tone}`}>
            <LayeredIcon kind={status.icon} />
            {status.label}
          </span>
          <strong>{status.value}</strong>
        </div>
      ))}
    </div>
  );
}

function identityInitials(name: string) {
  const primaryName = name.split(",")[0]?.trim() ?? "";
  const parts = primaryName.split(/\s+/).filter(Boolean);
  if (!parts.length) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function IdentityMark({ name, size = "medium" }: { name: string; size?: "small" | "medium" | "large" }) {
  return <span className={`identity-mark identity-mark--${size}`} aria-hidden="true">{identityInitials(name)}</span>;
}

function LogoutIcon() {
  return <span className="logout-icon" aria-hidden="true">
    <img className="logout-icon__base" src="/assets/icon-logout-base.svg" alt="" />
    <img className="logout-icon__path" src="/assets/icon-logout-path.svg" alt="" />
    <img className="logout-icon__shape" src="/assets/icon-logout-shape.svg" alt="" />
  </span>;
}

function FeedbackToast({ message, onDismiss, tone = "success" }: { message: string; onDismiss: () => void; tone?: "success" | "error" }) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 3200);
    return () => window.clearTimeout(timer);
  }, [message, onDismiss]);

  return (
    <div className={`feedback-toast feedback-toast--${tone}`} role={tone === "error" ? "alert" : "status"} aria-live="polite">
      <span className="feedback-toast__check" aria-hidden="true">{tone === "error" ? "!" : "✓"}</span>
      <span>{message}</span>
      <button type="button" aria-label="Dismiss message" onClick={onDismiss}>×</button>
    </div>
  );
}

function NotificationsPopover({
  notices,
  onNoticesChange,
}: {
  notices: AppNotice[];
  onNoticesChange: Dispatch<SetStateAction<AppNotice[]>>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const unreadCount = notices.filter((notice) => !notice.read).length;

  useEffect(() => {
    if (!isOpen) return;
    function closeOnOutside(event: PointerEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setIsOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  function markAllRead() {
    onNoticesChange((current) => current.map((notice) => ({ ...notice, read: true })));
  }

  return (
    <div className="notifications-wrap" ref={wrapRef}>
      <button
        className="circle-button"
        type="button"
        ref={triggerRef}
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <img src="/assets/icon-bell-exact.svg" alt="" />
        {unreadCount ? <span className="notification-badge" aria-hidden="true">{unreadCount}</span> : null}
      </button>
      {isOpen ? (
        <section className="notifications-panel" role="dialog" aria-modal="false" aria-label="Notifications">
          <header>
            <div><h2>Notifications</h2><span>{unreadCount ? `${unreadCount} unread` : "You’re all caught up"}</span></div>
            {unreadCount ? <button type="button" onClick={markAllRead}>Mark all read</button> : null}
          </header>
          <div className="notifications-list">
            {notices.length ? notices.map((notice) => (
              <button
                className={`notification-item ${notice.read ? "" : "notification-item--unread"}`}
                type="button"
                key={notice.id}
                onClick={() => onNoticesChange((current) => current.map((item) => item.id === notice.id ? { ...item, read: true } : item))}
              >
                <span className="notification-item__dot" aria-hidden="true" />
                <span><strong>{notice.title}</strong><small>{notice.message}</small><em>{notice.time}</em></span>
              </button>
            )) : <p className="notifications-empty">No notifications yet.</p>}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function WarehouseDetailsModal({
  warehouse,
  tasks,
  onClose,
}: {
  warehouse: Warehouse;
  tasks: Array<Task | TeamTask>;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLElement>(null);
  useDialogFocus(true, modalRef, onClose, closeRef);

  return (
    <div className="warehouse-modal-backdrop" onMouseDown={onClose}>
      <section ref={modalRef} className="warehouse-modal" role="dialog" aria-modal="true" aria-labelledby="warehouse-modal-title" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <span className="warehouse-card__icon"><WarehouseCardIcon /></span>
          <button ref={closeRef} type="button" aria-label="Close warehouse details" onClick={onClose}>×</button>
        </header>
        <span className="warehouse-office">{warehouse.office}</span>
        <h2 id="warehouse-modal-title">{warehouse.name}</h2>
        <p className="warehouse-address"><img src="/assets/icon-location.svg" alt="" />{warehouse.address}</p>
        <WarehouseStatusSummary statuses={warehouse.statuses} />
        <div className="warehouse-modal__tasks">
          <h3>Tasks at this warehouse</h3>
          {tasks.length ? (
            <ul>{tasks.map((task) => <li key={task.invoice}><strong>{task.invoice}</strong><span>{"title" in task ? task.title : task.description}</span></li>)}</ul>
          ) : <p>No tasks are currently assigned to this warehouse.</p>}
        </div>
      </section>
    </div>
  );
}

function StatusChangeConfirmation({
  invoice,
  fromStatus,
  toStatus,
  onCancel,
  onConfirm,
}: {
  invoice: string;
  fromStatus: TeamTaskStatus;
  toStatus: TeamTaskStatus;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useDialogFocus(true, dialogRef, onCancel, cancelRef);

  const title = toStatus === "Complete"
    ? "Complete this task?"
    : toStatus === "Delayed"
      ? "Mark this task as delayed?"
      : toStatus === "In Progress"
        ? "Start this task?"
        : "Move this task to pending?";
  const detail = toStatus === "Complete"
    ? "This marks the work as finished and notifies the manager."
    : toStatus === "Delayed"
      ? "This flags the task for attention and notifies the manager."
      : "The manager will see this status update immediately.";

  return (
    <div className="status-confirm-backdrop" onMouseDown={onCancel}>
      <section
        ref={dialogRef}
        className="status-confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="status-confirm-title"
        aria-describedby="status-confirm-description"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span className={`status-confirm-dialog__icon status-confirm-dialog__icon--${statusClass(toStatus)}`} aria-hidden="true">
          <LayeredIcon kind={toStatus === "Complete" ? "complete" : toStatus === "Delayed" ? "danger" : toStatus === "In Progress" ? "progress" : "clock"} />
        </span>
        <div className="status-confirm-dialog__copy">
          <span className="status-confirm-dialog__eyebrow">{invoice}</span>
          <h2 id="status-confirm-title">{title}</h2>
          <p id="status-confirm-description">Change status from <strong>{fromStatus}</strong> to <strong>{toStatus}</strong>. {detail}</p>
        </div>
        <div className="status-confirm-dialog__actions">
          <button ref={cancelRef} type="button" onClick={onCancel}>Cancel</button>
          <button type="button" onClick={onConfirm}>Yes, change status</button>
        </div>
      </section>
    </div>
  );
}

function TaskType({ type }: { type: Task["type"] }) {
  return (
    <span className={`task-type task-type--${type.toLowerCase()}`}>
      <span className="task-type__icon">
        {type === "Delivery" ? <img src="/assets/icon-delivery.svg" alt="" /> : type === "Pickup" ? <PickupIcon /> : <ContainerIcon />}
      </span>
      {type}
    </span>
  );
}

function TaskTable({ tasks, onSelect }: { tasks: Task[]; onSelect?: (task: Task) => void }) {
  return (
    <div className="table-wrap" role="region" aria-label="Operations tasks table" tabIndex={0}>
      <p className="table-scroll-hint">Scroll horizontally to see every task field.</p>
      <table>
        <thead><tr><th>Invoice</th><th>Type</th><th>Warehouse</th><th>Assigned to</th><th>Scheduled</th><th>Status</th></tr></thead>
        <tbody>
          {tasks.map((task) => (
            <tr
              className={onSelect ? "task-row--interactive" : undefined}
              key={task.invoice}
              tabIndex={onSelect ? 0 : undefined}
              onClick={(event) => {
                event.currentTarget.blur();
                onSelect?.(task);
              }}
              onKeyDown={(event) => {
                if (onSelect && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault();
                  onSelect(task);
                }
              }}
            >
              <td>{task.invoice}</td>
              <td><TaskType type={task.type} /></td>
              <td>{task.warehouse}</td>
              <td><span className="assignee"><IdentityMark name={task.assignee} size="small" />{task.assignee}</span></td>
              <td>{task.scheduled}</td>
              <td><span className={`status status--${statusClass(task.status)}`}>{task.status}</span></td>
            </tr>
          ))}
          {tasks.length === 0 ? <tr><td className="empty-tasks" colSpan={6}>No tasks match these filters.</td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}

function OrderDetailsDrawer({
  order,
  isEditing,
  onEditingChange,
  onSave,
  onDelete,
  archiveActionLabel = "Archive task",
  statusLabels,
  readOnlyDetails = false,
  canAddNote = false,
  onAddNote,
  onStatusChange,
  warehouseOptions = [],
  staffOptions = [],
  onClose,
}: {
  order: Task;
  isEditing: boolean;
  onEditingChange: (editing: boolean) => void;
  onSave: (order: Task) => void;
  onDelete?: (order: Task) => void;
  archiveActionLabel?: string;
  statusLabels?: Partial<Record<Status, string>>;
  readOnlyDetails?: boolean;
  canAddNote?: boolean;
  onAddNote?: (note: string) => void;
  onStatusChange?: (status: Status) => void;
  warehouseOptions?: Warehouse[];
  staffOptions?: Administrator[];
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(order);
  const [orderError, setOrderError] = useState("");
  const [newNote, setNewNote] = useState("");
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  useDialogFocus(true, panelRef, onClose, closeRef);

  function cancelEditing() {
    setDraft(order);
    setOrderError("");
    onEditingChange(false);
  }

  function saveChanges() {
    const scheduleDate = draft.date;
    if (!isOperationalDate(scheduleDate)) {
      setOrderError("Choose a valid schedule date.");
      return;
    }
    const cleanItems = draft.items.filter((item) => item.name.trim() || item.quantity.trim());
    const timeSuffix = draft.scheduled.includes("·") ? ` · ${draft.scheduled.split("·").slice(1).join("·").trim()}` : "";
    const updated = {
      ...draft,
      date: scheduleDate,
      scheduled: `${formatTaskDate(scheduleDate)}${timeSuffix}`,
      items: cleanItems,
    };
    setOrderError("");
    onSave(updated);
    onEditingChange(false);
  }

  function deleteTask() {
    if (!onDelete || !window.confirm(`${archiveActionLabel} ${order.invoice}?`)) return;
    onDelete(order);
  }

  return (
    <div className="order-panel-backdrop" onMouseDown={onClose}>
      <aside
        ref={panelRef}
        className="order-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-details-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="order-panel__content">
          <div className="order-panel__header">
            <div className="order-panel__title-row">
              <h2 id="order-details-title">Order Details</h2>
              {!isEditing && !readOnlyDetails ? (
                <button className="order-edit-button" type="button" onClick={() => { setDraft(order); onEditingChange(true); }}>
                  <img src="/assets/icon-edit.svg" alt="" /> Edit
                </button>
              ) : <span className="order-editing-label">{readOnlyDetails ? canAddNote ? "Assigned task" : "Read-only company task" : "Editing"}</span>}
            </div>
            <button ref={closeRef} className="order-panel__close" type="button" aria-label="Close order details" onClick={onClose}>
              <img src="/assets/icon-close.svg" alt="" />
            </button>
          </div>

          <div className={`order-details ${isEditing ? "order-details--editing" : ""}`}>
            <div className="order-detail-row"><span>Invoice No.</span><strong>{order.invoice}</strong></div>
            <div className="order-detail-row">
              <span>Schedule date</span>
              {isEditing ? <DateFilter mode="single" value={{ from: draft.date, to: draft.date }} onChange={(range) => { if (range.from) { setOrderError(""); setDraft({ ...draft, date: range.from }); } }} /> : <strong>{order.scheduled}</strong>}
            </div>
            <label className="order-detail-row">
              <span>Type</span>
              {isEditing ? (
                <select value={draft.type} aria-label="Task type" onChange={(event) => setDraft({ ...draft, type: event.target.value as Task["type"] })}>
                  <option>Delivery</option><option>Pickup</option><option>Container</option>
                </select>
              ) : <strong>{order.type}</strong>}
            </label>
            <label className="order-detail-row">
              <span>Warehouse</span>
              {isEditing ? <select value={draft.warehouseId} aria-label="Warehouse" onChange={(event) => { const selected = warehouseOptions.find((warehouse) => warehouse.id === event.target.value); setDraft({ ...draft, warehouseId: event.target.value, warehouse: selected?.name ?? draft.warehouse, assigneeIds: [], assignees: [], assignee: "" }); }}>{warehouseOptions.filter((warehouse) => !warehouse.archivedAt).map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select> : <strong>{order.warehouse}</strong>}
            </label>
            <label className="order-detail-row">
              <span>Assigned to</span>
              {isEditing ? <select multiple value={draft.assigneeIds ?? []} aria-label="Assigned to" onChange={(event) => { const ids = Array.from(event.currentTarget.selectedOptions).map((option) => option.value); const selected = staffOptions.filter((staff) => ids.includes(staff.id)); setDraft({ ...draft, assigneeIds: ids, assignees: selected.map((staff) => staff.name), assignee: selected.map((staff) => staff.name).join(", "), avatar: selected[0]?.avatar ?? draft.avatar }); }}>{staffOptions.filter((staff) => staff.role === "Team member" && staff.status === "Verified" && staff.warehouseIds?.includes(draft.warehouseId ?? "")).map((staff) => <option key={staff.id} value={staff.id}>{staff.name}</option>)}</select> : <strong>{order.assignee}</strong>}
            </label>
            <label className="order-detail-row">
              <span>Status</span>
              {isEditing ? (
                <select value={draft.status} aria-label="Status" onChange={(event) => setDraft({ ...draft, status: event.target.value as Status })}>
                  {(["Pending", "In Progress", "Complete", "Delayed"] as Status[]).map((status) => <option value={status} key={status}>{statusLabels?.[status] ?? status}</option>)}
                </select>
              ) : onStatusChange ? <select aria-label="Update task status" value={order.status} onChange={(event) => onStatusChange(event.target.value as Status)}>{(["Pending", "In Progress", "Complete", "Delayed"] as Status[]).filter((status) => canTeamTransition(statusToDto(order.status), statusToDto(status))).map((status) => <option key={status}>{status}</option>)}</select> : <strong><span className={`status status--${statusClass(order.status)}`}>{statusLabels?.[order.status] ?? order.status}</span></strong>}
            </label>

            <div className="order-description">
              <div className="order-section-title"><span>Description</span></div>
              {isEditing ? (
                <textarea aria-label="Description" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
              ) : (
                <p>{order.description}</p>
              )}
            </div>

            <div className="order-items">
              <div className="order-items__heading"><h3>Items &amp; Quantity</h3>{isEditing ? <button type="button" onClick={() => setDraft({ ...draft, items: [...draft.items, { id: `${draft.invoice}-${Date.now()}`, name: "", quantity: "" }] })}>+ Add item</button> : null}</div>
              <div className="order-items__table" role="table" aria-label="Items and quantities">
                <div className="order-items__row order-items__row--header" role="row"><span role="columnheader">Name</span><span role="columnheader">Quantity</span></div>
                {(isEditing ? draft.items : order.items).map((item, index) => (
                  <div className="order-items__row" role="row" key={item.id}>
                    <span role="cell">{isEditing ? <input value={item.name} aria-label={`Item ${index + 1} name`} onChange={(event) => setDraft({ ...draft, items: draft.items.map((current) => current.id === item.id ? { ...current, name: event.target.value } : current) })} /> : item.name}</span>
                    <span role="cell">{isEditing ? <span className="order-quantity-edit"><input value={item.quantity} aria-label={`Item ${index + 1} quantity`} onChange={(event) => setDraft({ ...draft, items: draft.items.map((current) => current.id === item.id ? { ...current, quantity: event.target.value } : current) })} /><button type="button" aria-label={`Remove ${item.name || `item ${index + 1}`}`} onClick={() => setDraft({ ...draft, items: draft.items.filter((current) => current.id !== item.id) })}>×</button></span> : item.quantity}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="order-description order-activity">
              <div className="order-section-title"><span>Activity</span></div>
              {order.activityNotes?.length ? <ol className="order-activity__feed">{order.activityNotes.map((note) => <li key={note.id}><p>{note.body}</p><small>{note.authorName} · {new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Melbourne", dateStyle: "medium", timeStyle: "short" }).format(new Date(note.createdAt))}</small></li>)}</ol> : <p>No activity notes yet.</p>}
              {isEditing ? <textarea aria-label="Add activity note" placeholder="Add a new activity note (optional)" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /> : null}
              {!isEditing && canAddNote && onAddNote ? <div className="order-activity__composer"><textarea aria-label="Add activity note" placeholder="Add a progress note" value={newNote} onChange={(event) => setNewNote(event.target.value)} /><button type="button" disabled={!newNote.trim()} onClick={() => { onAddNote(newNote.trim()); setNewNote(""); }}>Add note</button></div> : null}
            </div>
          </div>
        </div>

        {orderError ? <p className="settings-message settings-message--error order-panel__error" role="alert">{orderError}</p> : null}
        {isEditing ? (
          <div className="order-panel__actions">
            {onDelete ? <button className="order-delete-button" type="button" onClick={deleteTask}>{archiveActionLabel}</button> : null}
            <button type="button" onClick={cancelEditing}>Cancel</button>
            <button type="button" onClick={saveChanges}>Save change</button>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function LoginScreen({ onSignIn, initialError = "" }: { onSignIn: (email: string, password: string, rememberDevice: boolean) => Promise<string | null>; initialError?: string }) {
  const [showPassword, setShowPassword] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(false);
  const [loginError, setLoginError] = useState(initialError);
  const [pending, setPending] = useState(false);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    const error = await onSignIn(
      String(data.get("email") || "").trim().toLowerCase(),
      String(data.get("password") || ""),
      rememberDevice,
    );
    setPending(false);
    setLoginError(error ?? "");
  }

  return (
    <main className="login-shell">
      <section className="login-hero" aria-label="Amazing Operations onboarding">
        <img
          className="login-hero__photo"
          src="/assets/login-warehouse-team-v2.png"
          alt="Warehouse team members reviewing operations on a tablet"
        />
        <div className="login-hero__story">
          <div className="login-brand" aria-label="Amazing Operations">
            <span className="login-brand__mark"><img src="/assets/login-logo-mark-white.svg" alt="" /></span>
            <img className="login-brand__word" src="/assets/login-logo-wordmark-white.svg" alt="Amazing Operations" />
          </div>
          <div className="login-hero__copy">
            <div>
              <p>One connected operation</p>
              <h2>Every warehouse.<br />One clear plan.</h2>
            </div>
            <p>Keep pickups, deliveries, container arrivals and stock transfers organised across Sunshine, Hoppers Crossing and Melton.</p>
          </div>
        </div>
      </section>

      <section className="login-panel" aria-labelledby="login-title">
        <form className="login-card" onSubmit={signIn}>
          <div className="login-content">
            <div className="login-header">
              <div className="login-title-group">
                <p className="login-eyebrow">Welcome back</p>
                <h1 id="login-title">Sign in to Operations</h1>
              </div>
              <div className="login-header__rule" aria-hidden="true"><span /></div>
              <p>Use your work email and password to continue.</p>
            </div>

            <div className="login-fields">
              <label className="login-field">
                <span>Work E-mail</span>
                <input name="email" type="email" placeholder="*********" autoComplete="email" required />
              </label>
              <label className="login-field">
                <span>Password</span>
                <span className="password-field">
                  <input name="password" type={showPassword ? "text" : "password"} placeholder="*********" autoComplete="current-password" required />
                  <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}>
                    <img src="/assets/icon-login-eye.svg" alt="" />
                  </button>
                </span>
              </label>

              <label className="remember-device">
                <input type="checkbox" checked={rememberDevice} onChange={(event) => setRememberDevice(event.target.checked)} />
                <span>Remember this device</span>
              </label>
              <Link className="forgot-password-link" href="/auth/forgot-password">Forgot password?</Link>
              {loginError ? <p className="login-error" role="alert">{loginError}</p> : null}
            </div>
          </div>

          <button className="login-submit" type="submit" disabled={pending}>
            <span>{pending ? "Signing in…" : "Sign in"}</span>
            <img src="/assets/icon-arrow-right.svg" alt="" />
          </button>
        </form>
      </section>
    </main>
  );
}

function SettingsPage({
  activeSection,
  onSectionChange,
  onSignOut,
  account,
  onAccountChange,
  administrators,
  onAdministratorsChange,
  onFeedback,
  canManageRoles,
  warehouses,
  onSnapshot,
  onOpenAuditRecord,
}: {
  activeSection: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  onSignOut: () => void;
  account: Account;
  onAccountChange: Dispatch<SetStateAction<Account>>;
  notifications: NotificationSettings;
  onNotificationsChange: Dispatch<SetStateAction<NotificationSettings>>;
  administrators: Administrator[];
  onAdministratorsChange: AdministratorsChangeHandler;
  onFeedback: (message: string, tone?: "success" | "error") => void;
  canManageRoles: boolean;
  warehouses: Warehouse[];
  auditEvents: AuditEventDTO[];
  onSnapshot?: (snapshot: OperationsSnapshot) => void;
  onOpenAuditRecord?: (event: AuditEventDTO) => void;
}) {
  const [accountDraft, setAccountDraft] = useState(account);
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
  const [administratorDraft, setAdministratorDraft] = useState(administrators);
  const [roleStatusFilter, setRoleStatusFilter] = useState("All status");
  const [isAdministrationModalOpen, setIsAdministrationModalOpen] = useState(false);
  const [editingAdministrator, setEditingAdministrator] = useState<Administrator | null>(null);
  const [administratorMenuId, setAdministratorMenuId] = useState<string | null>(null);
  const [administratorMenuPosition, setAdministratorMenuPosition] = useState({ top: 0, left: 0 });
  const [administratorError, setAdministratorError] = useState("");
  const [isAdministratorSubmitting, setIsAdministratorSubmitting] = useState(false);
  const [isRoleChangesSaving, setIsRoleChangesSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordPending, setPasswordPending] = useState(false);
  const [recoveryPending, setRecoveryPending] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const administrationModalRef = useRef<HTMLElement>(null);
  const administrationFirstInputRef = useRef<HTMLInputElement>(null);
  const administratorTriggerRefs = useRef(new Map<string, HTMLButtonElement>());

  useDialogFocus(isAdministrationModalOpen, administrationModalRef, closeAdministratorModal, administrationFirstInputRef);

  useEffect(() => {
    if (administratorMenuId === null) return;
    function closeAdministratorMenu(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest(".administrator-actions-wrap")) setAdministratorMenuId(null);
    }
    function closeAdministratorMenuOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        const openId = administratorMenuId;
        setAdministratorMenuId(null);
        if (openId !== null) window.requestAnimationFrame(() => administratorTriggerRefs.current.get(openId)?.focus());
      }
    }
    function closeAdministratorMenuOnViewportChange() {
      setAdministratorMenuId(null);
    }
    document.addEventListener("pointerdown", closeAdministratorMenu);
    document.addEventListener("keydown", closeAdministratorMenuOnEscape);
    window.addEventListener("resize", closeAdministratorMenuOnViewportChange);
    window.addEventListener("scroll", closeAdministratorMenuOnViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", closeAdministratorMenu);
      document.removeEventListener("keydown", closeAdministratorMenuOnEscape);
      window.removeEventListener("resize", closeAdministratorMenuOnViewportChange);
      window.removeEventListener("scroll", closeAdministratorMenuOnViewportChange, true);
    };
  }, [administratorMenuId]);

  const visibleAdministrators = administratorDraft.filter((administrator) => (
    roleStatusFilter === "All status" || administrator.status === roleStatusFilter
  ));

  async function addAdministrator(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const role = String(data.get("role") || "Manager") as Administrator["role"];
    const email = editingAdministrator?.authUserId
      ? editingAdministrator.email.trim().toLowerCase()
      : String(data.get("email") || "").trim().toLowerCase();
    const name = String(data.get("name") || "").trim();
    const location = String(data.get("location") || "").trim();
    const warehouseIds = [...new Set(data.getAll("warehouseIds").map(String))];
    const duplicate = administratorDraft.some((administrator) => administrator.email.toLowerCase() === email && administrator.id !== editingAdministrator?.id);
    if (duplicate) {
      setAdministratorError("A team member with this email already exists.");
      return;
    }
    if (name.length < 2) {
      setAdministratorError("Enter the staff member's full name.");
      return;
    }
    if (role === "Team member" && warehouseIds.length === 0) {
      setAdministratorError("Choose at least one warehouse for a team member.");
      return;
    }
    const nextAdministrator: Administrator = {
      id: editingAdministrator?.id ?? "",
      authUserId: editingAdministrator?.authUserId ?? null,
      name,
      email,
      role,
      status: editingAdministrator?.status ?? "Pending",
      staffStatus: editingAdministrator?.staffStatus ?? "uninvited",
      avatar: editingAdministrator?.avatar ?? "/assets/avatar-james.png",
      gender: String(data.get("gender") || "Prefer not to say"),
      dateOfBirth: String(data.get("dateOfBirth") || ""),
      location,
      warehouseIds,
    };

    if (editingAdministrator) {
      setAdministratorDraft((current) => current.map((administrator) => administrator.id === editingAdministrator.id ? nextAdministrator : administrator));
      setIsAdministrationModalOpen(false);
      setEditingAdministrator(null);
      setAdministratorError("");
      onFeedback("Team member updated. Save role changes to confirm.");
      return;
    }

    if (!onSnapshot) {
      setAdministratorError("Member invitations are not available in this view.");
      return;
    }

    setIsAdministratorSubmitting(true);
    setAdministratorError("");
    let result: Awaited<ReturnType<typeof createAndInviteStaffAction>>;
    try {
      result = await createAndInviteStaffAction({
        fullName: nextAdministrator.name,
        email: nextAdministrator.email,
        role: nextAdministrator.role === "Manager" ? "manager" : "warehouse_team",
        location: nextAdministrator.location,
        warehouseIds: nextAdministrator.role === "Manager" ? [] : nextAdministrator.warehouseIds ?? [],
        gender: nextAdministrator.gender ?? "Prefer not to say",
        dateOfBirth: nextAdministrator.dateOfBirth ?? "",
      });
    } catch {
      setIsAdministratorSubmitting(false);
      setAdministratorError("The invitation could not be completed. Check your connection and try again.");
      return;
    }
    setIsAdministratorSubmitting(false);

    if (result.data) {
      onSnapshot(result.data);
      setAdministratorDraft(staffFromSnapshot(result.data));
    }
    if (!result.ok) {
      if (result.profileCreated) {
        closeAdministratorModal();
        onFeedback(result.error, "error");
      } else {
        setAdministratorError(result.error);
      }
      return;
    }

    closeAdministratorModal();
    onFeedback(`Invitation sent to ${nextAdministrator.email}.`);
  }

  function openAdministratorModal(administrator: Administrator | null = null) {
    setEditingAdministrator(administrator);
    setAdministratorError("");
    setAdministratorMenuId(null);
    setIsAdministrationModalOpen(true);
  }

  function closeAdministratorModal() {
    setIsAdministrationModalOpen(false);
    setEditingAdministrator(null);
    setAdministratorError("");
  }

  async function runStaffAction(action: "invite" | "reset" | "suspend" | "reactivate" | "archive" | "restore", administrator: Administrator) {
    setAdministratorMenuId(null);
    const result = action === "invite" ? await inviteStaffAction(administrator.id)
      : action === "reset" ? await sendStaffPasswordResetAction(administrator.id)
        : await setStaffStateAction({ staffId: administrator.id, action });
    if (!result.ok) { onFeedback(result.error, "error"); return; }
    onSnapshot?.(result.data);
    setAdministratorDraft(staffFromSnapshot(result.data));
    onFeedback(action === "invite" ? `Access email sent to ${administrator.email}.` : action === "reset" ? `Password reset sent to ${administrator.email}.` : `${administrator.name} updated.`);
  }

  async function saveAdministratorChanges() {
    setIsRoleChangesSaving(true);
    let result: Awaited<ReturnType<AdministratorsChangeHandler>>;
    try {
      result = await onAdministratorsChange(administratorDraft);
    } catch {
      result = { ok: false, error: "Role management changes could not be saved. Check your connection and try again." };
    }
    setIsRoleChangesSaving(false);
    if (!result.ok) {
      onFeedback(result.error, "error");
      return;
    }
    onSnapshot?.(result.data);
    setAdministratorDraft(staffFromSnapshot(result.data));
    onFeedback("Role management changes saved.");
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (passwords.next.length < 10) {
      setPasswordMessage("Use at least 10 characters for the new password.");
      return;
    }
    if (passwords.next !== passwords.confirm) {
      setPasswordMessage("The new passwords do not match.");
      return;
    }
    if (passwordPending) return;
    setPasswordPending(true);
    setPasswordMessage("");
    let result: ActionResult;
    try { result = await changePasswordAction({ email: account.email, currentPassword: passwords.current, newPassword: passwords.next }); }
    catch { result = { ok: false, error: "Could not update your password. Please try again." }; }
    finally { setPasswordPending(false); }
    if (!result.ok) { setPasswordMessage(result.error); return; }
    setPasswords({ current: "", next: "", confirm: "" });
    setPasswordMessage("Password updated and ready for your next sign-in.");
    onFeedback("Password updated.");
  }

  return (
    <>
      <section className="settings-card" aria-label={`${activeSection} settings`}>
        <aside className="settings-sidebar" aria-label="Settings navigation">
          {(canManageRoles ? managerProfileSections : teamProfileSections).map((section) => (
            <button
              className={`settings-sidebar__item ${activeSection === section ? "settings-sidebar__item--active" : ""}`}
              type="button"
              key={section}
              aria-current={activeSection === section ? "page" : undefined}
              onClick={() => onSectionChange(section)}
            >
              {section}
            </button>
          ))}
          <button className="settings-sidebar__item settings-sidebar__logout" type="button" onClick={onSignOut}>
            <LogoutIcon />
            Log Out
          </button>
        </aside>

        <div className="settings-content">
          {activeSection === "My Account" ? (
            <form className="settings-view" onSubmit={(event) => { event.preventDefault(); onAccountChange((current) => ({ ...current, name: accountDraft.name, email: accountDraft.email, location: accountDraft.location })); onFeedback("Account details saved."); }}>
              <div className="settings-form-layout">
                <div className="settings-intro">
                  <h2>Account Setting</h2>
                  <p>View and update your account details,<br />profile, and more.</p>
                </div>
                <div className="settings-fields">
                  <label className="settings-field"><span>Full Name<em>*</em></span><input required value={accountDraft.name} onChange={(event) => setAccountDraft({ ...accountDraft, name: event.target.value })} /></label>
                  <label className="settings-field"><span>E-mail Address</span><input readOnly type="email" value={accountDraft.email} aria-describedby="account-email-help" /><small id="account-email-help">Ask another manager to change a login email.</small></label>
                  <label className="settings-field"><span>Location<em>*</em></span><input required value={accountDraft.location} onChange={(event) => setAccountDraft({ ...accountDraft, location: event.target.value })} /></label>
                </div>
              </div>
              <div className="settings-actions">
                <button type="button" onClick={() => setAccountDraft(account)}>Cancel</button>
                <button type="submit">Save change</button>
              </div>
            </form>
          ) : null}

          {canManageRoles && activeSection === "Role Management" ? (
            <div className="settings-view settings-view--roles">
              <div className="role-management-header">
                <div className="settings-intro">
                  <h2>Role Management</h2>
                  <p>Manage your roles and permissions effortlessly.</p>
                </div>
                <div className="role-management-controls">
                  <label>
                    <span className="sr-only">Filter administration status</span>
                    <select value={roleStatusFilter} onChange={(event) => setRoleStatusFilter(event.target.value)}>
                      <option>All status</option><option>Verified</option><option>Pending</option><option>Suspended</option><option>Archived</option>
                    </select>
                  </label>
                  <button className="settings-add-button" type="button" onClick={() => openAdministratorModal()}><img src="/assets/icon-add.svg" alt="" /> Add new</button>
                </div>
              </div>

              <div className="administrators-table-wrap" role="region" aria-label="Administration roles table" tabIndex={0}>
                <p className="table-scroll-hint">Scroll horizontally to see every team field.</p>
                <div className="administrators-table" role="table" aria-label="Administration roles">
                  <div className="administrators-row administrators-row--head" role="row">
                    <span role="columnheader">Administration Name</span><span role="columnheader">E-mail</span><span role="columnheader">Role</span><span role="columnheader">Status</span><span aria-hidden="true" />
                  </div>
                  {visibleAdministrators.map((administrator) => (
                    <div className="administrators-row" role="row" key={administrator.id}>
                      <span className="administrator-name" role="cell"><IdentityMark name={administrator.name} size="small" />{administrator.name}</span>
                      <span role="cell">{administrator.email}</span>
                      <span role="cell">{administrator.role}</span>
                      <span className={`administrator-status administrator-status--${administrator.status.toLowerCase()}`} role="cell"><img src={administrator.status === "Verified" ? "/assets/icon-admin-verified.png" : "/assets/icon-admin-pending.png"} alt="" />{administrator.status}</span>
                      <span className="administrator-actions-wrap">
                        <button
                          className="administrator-more"
                          type="button"
                          ref={(element) => {
                            if (element) administratorTriggerRefs.current.set(administrator.id, element);
                            else administratorTriggerRefs.current.delete(administrator.id);
                          }}
                          aria-label={`More actions for ${administrator.name}`}
                          aria-haspopup="true"
                          aria-expanded={administratorMenuId === administrator.id}
                          onClick={(event) => {
                            if (administratorMenuId === administrator.id) {
                              setAdministratorMenuId(null);
                              return;
                            }
                            const rect = event.currentTarget.getBoundingClientRect();
                            const menuWidth = 220;
                            const menuHeight = 320;
                            setAdministratorMenuPosition({
                              top: Math.max(16, Math.min(rect.bottom + 8, window.innerHeight - menuHeight - 16)),
                              left: Math.max(16, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 16)),
                            });
                            setAdministratorMenuId(administrator.id);
                          }}
                        ><img src="/assets/icon-admin-more.png" alt="" /></button>
                        {administratorMenuId === administrator.id ? (
                          <span className="administrator-actions" role="group" aria-label={`Actions for ${administrator.name}`} style={administratorMenuPosition}>
                            <button type="button" onClick={() => openAdministratorModal(administrator)}>Edit details and role</button>
                            <button type="button" onClick={() => openAdministratorModal(administrator)}>Manage warehouse access</button>
                            {administrator.staffStatus === "uninvited" || administrator.staffStatus === "invited" ? <button type="button" onClick={() => void runStaffAction("invite", administrator)}>{administrator.staffStatus === "uninvited" ? "Send invitation" : "Resend access email"}</button> : null}
                            {administrator.authUserId && (["invited", "active", "suspended"] as StaffStatus[]).includes(administrator.staffStatus) ? <button type="button" onClick={() => void runStaffAction("reset", administrator)}>Send password-reset email</button> : null}
                            {administrator.status === "Verified" ? <button type="button" onClick={() => void runStaffAction("suspend", administrator)}>Suspend</button> : null}
                            {administrator.status === "Suspended" ? <button type="button" onClick={() => void runStaffAction("reactivate", administrator)}>Reactivate</button> : null}
                            {administrator.status === "Archived" ? <button type="button" onClick={() => void runStaffAction("restore", administrator)}>Restore</button> : <button className="administrator-actions__danger" type="button" onClick={() => {
                              if (!window.confirm(`Archive ${administrator.name}? Their unfinished assigned work must be resolved or reassigned first.`)) return;
                              void runStaffAction("archive", administrator);
                            }}>Archive member</button>}
                          </span>
                        ) : null}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="settings-actions">
                <button type="button" disabled={isRoleChangesSaving} onClick={() => { setAdministratorDraft(administrators); setRoleStatusFilter("All status"); onFeedback("Unsaved role changes discarded."); }}>Cancel</button>
                <button type="button" disabled={isRoleChangesSaving} onClick={() => void saveAdministratorChanges()}>{isRoleChangesSaving ? "Saving…" : "Save change"}</button>
              </div>
            </div>
          ) : null}

          {canManageRoles && activeSection === "Audit History" ? <AuditHistory staff={administrators.map(({id,name}) => ({id,name}))} warehouses={warehouses.map(({id,name}) => ({id: id ?? "",name}))} onOpenRecord={(event) => {
            const values = event.afterData ?? event.beforeData ?? {};
            const memberId = event.entityType === "staff_profiles" ? event.entityId : String(values.staff_id ?? event.entityId ?? "");
            const member = event.entityType.startsWith("staff_") ? administratorDraft.find((candidate) => candidate.id === memberId) : undefined;
            if (member) {
              onSectionChange("Role Management");
              setRoleStatusFilter(member.status === "Archived" ? "Archived" : "All status");
              openAdministratorModal(member);
            } else onOpenAuditRecord?.(event);
          }} /> : null}

          {activeSection === "Password" ? (
            <form className="settings-view" onSubmit={submitPassword}>
              <div className="settings-form-layout">
                <div className="settings-intro">
                  <h2>Password</h2>
                  <p>Use a unique password with at least 10 characters.</p>
                </div>
                <div className="settings-fields">
                  <label className="settings-field"><span>Current Password<em>*</em></span><input required type="password" autoComplete="current-password" placeholder="Current password" value={passwords.current} onChange={(event) => setPasswords({ ...passwords, current: event.target.value })} /></label>
                  <label className="settings-field"><span>New Password<em>*</em></span><input required type="password" autoComplete="new-password" minLength={10} placeholder="New password" value={passwords.next} onChange={(event) => setPasswords({ ...passwords, next: event.target.value })} /></label>
                  <label className="settings-field"><span>Confirm Password<em>*</em></span><input required type="password" autoComplete="new-password" minLength={10} placeholder="Confirm new password" value={passwords.confirm} onChange={(event) => setPasswords({ ...passwords, confirm: event.target.value })} /></label>
                </div>
              </div>
              <div className="password-recovery">
                <button type="button" className="secondary-button" disabled={recoveryPending} onClick={async () => {
                  setRecoveryPending(true); setRecoveryMessage("");
                  try { const result = await requestOwnPasswordResetAction(); setRecoveryMessage(result.ok ? "Reset email sent to your account. Follow the secure link to choose a new password." : result.error); }
                  catch { setRecoveryMessage("Could not send the reset email. Please try again."); }
                  finally { setRecoveryPending(false); }
                }}>{recoveryPending ? "Sending reset email…" : "Forgot current password?"}</button>
                <p>Send a secure reset link to {account.email}.</p>
                {recoveryMessage ? <p role="status">{recoveryMessage}</p> : null}
              </div>
              {passwordMessage ? <p className={`settings-message ${passwordMessage.includes("updated") ? "settings-message--success" : "settings-message--error"}`} role="status">{passwordMessage}</p> : null}
              <div className="settings-actions">
                <button type="button" onClick={() => { setPasswords({ current: "", next: "", confirm: "" }); setPasswordMessage(""); }}>Cancel</button>
                <button type="submit" disabled={passwordPending}>{passwordPending ? "Saving…" : "Save change"}</button>
              </div>
            </form>
          ) : null}

          {activeSection === "Notification" ? (
            <div className="settings-view">
              <div className="notification-layout">
                <div className="settings-intro">
                  <h2>In-app notifications</h2>
                  <p>Updates appear in the notification bell. Operational email is paused.</p>
                  <p>Invitations and password recovery still use secure account emails.</p>
                </div>
                <div className="notification-list">
                  {[
                    ...(!canManageRoles ? [{ title: "Assignments and access to tasks", description: "Work assigned to you, reassigned, or removed from your queue." }] : []),
                    { title: "Schedules and warehouse changes", description: canManageRoles ? "Important changes across company tasks." : "Schedule, warehouse or item changes on your assigned work." },
                    { title: "Progress and activity", description: "New notes, delays, completion and reopened tasks." },
                    { title: "Due today and overdue", description: canManageRoles ? "Overdue unfinished work across the company." : "Your incomplete tasks due today or overdue." },
                    { title: "Priority and archives", description: "Priority changes and tasks archived or restored." },
                    ...(canManageRoles ? [{ title: "Staff access", description: "Invitations, roles, warehouse access and account-status changes." }] : []),
                  ].map((option) => <div className="notification-option" key={option.title}><span><strong>{option.title}</strong><small>{option.description}</small></span><span className="notification-channel">In app</span></div>)}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {isAdministrationModalOpen ? (
        <div className="administration-modal-backdrop" onMouseDown={closeAdministratorModal}>
          <section ref={administrationModalRef} className="administration-modal" role="dialog" aria-modal="true" aria-labelledby="add-administration-title" onMouseDown={(event) => event.stopPropagation()}>
            <header className="administration-modal__header">
              <button type="button" aria-label="Go back" onClick={closeAdministratorModal}><img src="/assets/icon-admin-back.png" alt="" /></button>
              <h2 id="add-administration-title">{editingAdministrator ? "Edit Team Member" : "Add Team Member"}</h2>
              <button type="button" aria-label="Close" onClick={closeAdministratorModal}><img src="/assets/icon-admin-close.png" alt="" /></button>
            </header>
            <div className="administration-avatar"><IdentityMark name={editingAdministrator?.name ?? "New team member"} size="large" /></div>
            <form className="administration-form" onSubmit={addAdministrator} aria-busy={isAdministratorSubmitting}>
              <h3>Staff Information</h3>
              <div className="administration-fields">
                <label><span>Staff Name</span><input ref={administrationFirstInputRef} name="name" defaultValue={editingAdministrator?.name} placeholder="Rumin Rafi" required /></label>
                <label><span>Role</span><select name="role" defaultValue={editingAdministrator?.role ?? "Manager"}><option>Manager</option><option>Team member</option></select></label>
                <label>
                  <span>E-mail Address</span>
                  <input
                    name="email"
                    type="email"
                    defaultValue={editingAdministrator?.email}
                    placeholder="youremail@gmail.com"
                    required
                    disabled={Boolean(editingAdministrator?.authUserId)}
                    aria-describedby={editingAdministrator?.authUserId ? "linked-email-help" : undefined}
                  />
                  {editingAdministrator?.authUserId ? <small className="administration-field-help" id="linked-email-help">Login email is locked after the account is linked.</small> : null}
                </label>
                <label><span>Gender</span><select name="gender" defaultValue={editingAdministrator?.gender ?? "Prefer not to say"}><option>Male</option><option>Female</option><option>Prefer not to say</option></select></label>
                <label><span>Date of Birth</span><input name="dateOfBirth" type="date" defaultValue={editingAdministrator?.dateOfBirth} /></label>
                <label><span>Location</span><select name="location" defaultValue={editingAdministrator?.location ?? "Melbourne, Australia"}><option>Melbourne, Australia</option><option>Sunshine, Australia</option><option>Geelong, Australia</option></select></label>
                <fieldset className="administration-warehouses"><legend>Warehouse access</legend>{warehouses.filter((warehouse) => !warehouse.archivedAt).map((warehouse) => <label key={warehouse.id}><input type="checkbox" name="warehouseIds" value={warehouse.id} defaultChecked={editingAdministrator?.warehouseIds?.includes(warehouse.id ?? "")} /><span>{warehouse.name}</span></label>)}</fieldset>
              </div>
              {administratorError ? <p className="settings-message settings-message--error" role="alert">{administratorError}</p> : null}
              <div className="administration-form__actions">
                <button type="button" onClick={closeAdministratorModal} disabled={isAdministratorSubmitting}>Cancel</button>
                <button type="submit" disabled={isAdministratorSubmitting}>{isAdministratorSubmitting ? "Sending invitation…" : editingAdministrator ? "Save changes" : "Add member"}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}

function Dashboard({
  onSignOut,
  tasks,
  onTasksChange,
  onTeamTasksChange,
  account,
  onAccountChange,
  notifications,
  onNotificationsChange,
  administrators,
  onAdministratorsChange,
  notices,
  onNoticesChange,
  warehouses,
  auditEvents,
  onRestoreTask,
  onSaveWarehouse,
  onSetWarehouseArchived,
  onSnapshot,
}: {
  onSignOut: () => void;
  tasks: Task[];
  onTasksChange: Dispatch<SetStateAction<Task[]>>;
  onTeamTasksChange: Dispatch<SetStateAction<TeamTask[]>>;
  account: Account;
  onAccountChange: Dispatch<SetStateAction<Account>>;
  notifications: NotificationSettings;
  onNotificationsChange: Dispatch<SetStateAction<NotificationSettings>>;
  administrators: Administrator[];
  onAdministratorsChange: AdministratorsChangeHandler;
  notices: AppNotice[];
  onNoticesChange: Dispatch<SetStateAction<AppNotice[]>>;
  warehouses: Warehouse[];
  auditEvents: AuditEventDTO[];
  onRestoreTask: (taskId: string) => void;
  onSaveWarehouse: (warehouse: { id?: string; officeType: string; name: string; address: string }) => Promise<string | null>;
  onSetWarehouseArchived: (warehouseId: string, restore: boolean) => Promise<string | null>;
  onSnapshot: (snapshot: OperationsSnapshot) => void;
}) {
  const [activeNav, setActiveNav] = useState("Dashboard");
  const [activeSettings, setActiveSettings] = useState<SettingsSection | null>(null);
  const [isTaskPanelOpen, setIsTaskPanelOpen] = useState(false);
  const [newTaskType, setNewTaskType] = useState<Task["type"]>("Pickup");
  const [isPriority, setIsPriority] = useState(false);
  const [newTaskDate, setNewTaskDate] = useState(todayInMelbourne());
  const [overviewWarehouse, setOverviewWarehouse] = useState("All warehouse");
  const [taskSearch, setTaskSearch] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState("All warehouse");
  const [statusFilter, setStatusFilter] = useState("All status");
  const [newTaskWarehouseId, setNewTaskWarehouseId] = useState(warehouses.find((warehouse) => !warehouse.archivedAt)?.id ?? "");
  const [newTaskAssigneeIds, setNewTaskAssigneeIds] = useState<string[]>([]);
  const [warehouseListFilter, setWarehouseListFilter] = useState<"Active" | "Archived">("Active");
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null | undefined>(undefined);
  const [warehouseError, setWarehouseError] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Task | null>(null);
  const [isOrderEditing, setIsOrderEditing] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [dateRange, setDateRange] = useUrlDateRange();
  const [selectedWarehouse, setSelectedWarehouse] = useState<Warehouse | null>(null);
  const [feedback, setFeedback] = useState("");
  const [feedbackTone, setFeedbackTone] = useState<"success" | "error">("success");
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const profileTriggerRef = useRef<HTMLButtonElement>(null);
  const taskPanelRef = useRef<HTMLElement>(null);
  const taskFirstInputRef = useRef<HTMLInputElement>(null);

  useDialogFocus(isTaskPanelOpen, taskPanelRef, () => setIsTaskPanelOpen(false), taskFirstInputRef);

  useEffect(() => {
    if (!isProfileMenuOpen) return;

    function closeOnOutsideClick(event: PointerEvent) {
      if (!profileMenuRef.current?.contains(event.target as Node)) setIsProfileMenuOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsProfileMenuOpen(false);
        window.requestAnimationFrame(() => profileTriggerRef.current?.focus());
      }
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isProfileMenuOpen]);

  const activeDate = dateRange.from && dateRange.from === dateRange.to ? dateRange.from : null;
  const hasDateFilter = Boolean(dateRange.from || dateRange.to);
  const activeTasks = tasks.filter((task) => !task.archivedAt);
  const dateFilteredTasks = activeTasks.filter((task) => isDateInRange(task.date, dateRange));
  const scopedDashboardTasks = dateFilteredTasks.filter((task) => overviewWarehouse === "All warehouse" || task.warehouse === overviewWarehouse);
  const visibleTasks = scopedDashboardTasks.slice(0, 7);
  const filteredTasks = tasks.filter((task) => {
    const search = taskSearch.trim().toLowerCase();
    const matchesSearch = !search || [task.invoice, task.type, task.warehouse, task.assignee, task.description, task.notes, ...task.items.map((item) => item.name)].some((value) => value.toLowerCase().includes(search));
    const matchesWarehouse = warehouseFilter === "All warehouse" || task.warehouse === warehouseFilter;
    const matchesStatus = statusFilter === "All status" ? !task.archivedAt : statusFilter === "Archived" ? Boolean(task.archivedAt) : !task.archivedAt && task.status === statusFilter;
    const matchesDate = isDateInRange(task.date, dateRange);
    return matchesSearch && matchesWarehouse && matchesStatus && matchesDate;
  });

  const dashboardStats = [
    { label: "Pending", value: padCount(scopedDashboardTasks.filter((task) => task.status === "Pending").length), note: hasDateFilter ? dateRangeLabel(dateRange) : "Across all scheduled dates", tone: "blue", icon: "clock" },
    { label: "In Progress", value: padCount(scopedDashboardTasks.filter((task) => task.status === "In Progress").length), note: "Active operations", tone: "purple", icon: "progress" },
    { label: "Complete", value: padCount(scopedDashboardTasks.filter((task) => task.status === "Complete").length), note: hasDateFilter ? "Completed in selected range" : "Completed operations", tone: "green", icon: "complete" },
    { label: "Delayed", value: padCount(scopedDashboardTasks.filter((task) => task.status === "Delayed").length), note: scopedDashboardTasks.some((task) => task.status === "Delayed") ? "Needs your attention" : "No delays in this view", tone: "red", icon: "danger" },
  ];
  const liveWarehouses = warehousesWithLiveStats(dateFilteredTasks, warehouses.filter((warehouse) => !warehouse.archivedAt));
  const displayedWarehouses = warehouseListFilter === "Active"
    ? liveWarehouses
    : warehousesWithLiveStats(tasks.filter((task) => isDateInRange(task.date, dateRange)), warehouses.filter((warehouse) => warehouse.archivedAt));

  function openFilteredTasks(status = "All status", warehouse = overviewWarehouse) {
    setStatusFilter(status); setWarehouseFilter(warehouse); setTaskSearch("");
    setActiveSettings(null); setActiveNav("Tasks");
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function openAuditRecord(event: AuditEventDTO) {
    const values = event.afterData ?? event.beforeData ?? {};
    const taskId = event.entityType === "tasks" ? event.entityId : String(values.task_id ?? "");
    const task = tasks.find((candidate) => candidate.id === taskId);
    if (task) { setSelectedOrder(task); setIsOrderEditing(false); return; }
    const warehouse = warehouses.find((candidate) => candidate.id === event.entityId);
    if (event.entityType === "warehouses" && warehouse) { setSelectedWarehouse(warehouse); return; }
    const staffId = event.entityType === "staff_profiles" ? event.entityId : String(values.staff_id ?? "");
    if (administrators.some((member) => member.id === staffId)) {
      setActiveSettings("Role Management");
      setFeedback("Related team member is available in Role Management."); return;
    }
    setFeedbackTone("error"); setFeedback("This record is no longer available. Its history is preserved here.");
  }

  function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const invoice = String(data.get("invoice") || `INV-${tasks.length + 10458}`).trim().toUpperCase();
    if (tasks.some((task) => task.invoice.toUpperCase() === invoice)) {
      setFeedbackTone("error");
      setFeedback(`${invoice} already exists. Use a unique invoice number.`);
      return;
    }
    const date = String(data.get("scheduled") || todayInMelbourne());
    const quantity = String(data.get("quantity") || "1").trim();
    if (!/^\d+(?:\s+\w+)?$/i.test(quantity)) {
      setFeedbackTone("error");
      setFeedback("Enter a valid quantity, such as 24 or 24 boxes.");
      return;
    }
    const warehouseId = String(data.get("warehouseId") || "");
    const warehouse = warehouses.find((item) => item.id === warehouseId);
    const assigneeIds = data.getAll("assigneeIds").map(String);
    const selectedAssignees = administrators.filter((member) => assigneeIds.includes(member.id));
    if (!warehouse || !assigneeIds.length) {
      setFeedbackTone("error");
      setFeedback("Choose one warehouse and at least one eligible assignee.");
      return;
    }
    const assignee = selectedAssignees.map((member) => member.name).join(", ");
    const itemName = String(data.get("item") || "General order item").trim();
    const createdTask: Task = {
      invoice,
      type: newTaskType,
      warehouse: warehouse.name,
      warehouseId,
      assignee,
      assignees: selectedAssignees.map((member) => member.name),
      assigneeIds,
      avatar: selectedAssignees[0]?.avatar ?? "/assets/avatar-james.png",
      date,
      scheduled: formatTaskDate(date),
      status: "Pending",
      description: String(data.get("description") || "New operations task").trim(),
      items: [{ id: `${invoice}-1`, name: itemName, quantity }],
      notes: String(data.get("notes") || "").trim(),
      priority: isPriority,
    };
    onTasksChange((current) => [
      ...current,
      createdTask,
    ]);
    onTeamTasksChange((current) => upsertByInvoice(current, taskToTeamTask(createdTask)));
    onNoticesChange((current) => [{ id: crypto.randomUUID(), title: "Task created", message: `${invoice} was assigned to ${assignee}.`, time: "Just now", read: false }, ...current]);
    setFeedbackTone("success");
    setFeedback(`${invoice} created successfully.`);
    setNewTaskAssigneeIds([]);
    setIsTaskPanelOpen(false);
    setActiveNav("Tasks");
  }

  function saveOrder(updated: Task) {
    onTasksChange((current) => current.map((task) => task.invoice === updated.invoice ? updated : task));
    onTeamTasksChange((current) => {
      const existing = current.find((task) => task.invoice === updated.invoice);
      return upsertByInvoice(current, taskToTeamTask(updated, existing));
    });
    setSelectedOrder(updated);
    onNoticesChange((current) => [{ id: crypto.randomUUID(), title: "Task updated", message: `${updated.invoice} details were saved.`, time: "Just now", read: false }, ...current]);
    setFeedbackTone("success");
    setFeedback(`${updated.invoice} changes saved.`);
  }

  function deleteOrder(order: Task) {
    onTasksChange((current) => current.filter((task) => task.invoice !== order.invoice));
    onTeamTasksChange((current) => current.filter((task) => task.invoice !== order.invoice));
    setSelectedOrder(null);
    setIsOrderEditing(false);
    setFeedbackTone("success");
    setFeedback(`${order.invoice} deleted.`);
    onNoticesChange((current) => [{ id: crypto.randomUUID(), title: "Task archived", message: `${order.invoice} was archived.`, time: "Just now", read: false }, ...current]);
  }

  async function submitWarehouse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const error = await onSaveWarehouse({ id: editingWarehouse?.id, officeType: String(data.get("officeType") ?? "Warehouse"), name: String(data.get("name") ?? ""), address: String(data.get("address") ?? "") });
    if (error) { setWarehouseError(error); return; }
    setEditingWarehouse(undefined);
    setWarehouseError("");
    setFeedbackTone("success");
    setFeedback(editingWarehouse ? "Warehouse updated." : "Warehouse added.");
  }

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        {/* A full document navigation intentionally reloads data and resets role routing. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="brand" href="/" aria-label="Amazing Operations home">
          <span className="brand__mark-wrap"><img className="brand__mark" src="/assets/logo-mark.svg" alt="" /></span>
          <img className="brand__word" src="/assets/logo-wordmark.svg" alt="Amazing Operations" />
        </a>

        <nav className="main-nav" aria-label="Primary navigation">
          {navItems.map((item) => (
            <button
              className={`nav-button nav-button--${item.label.toLowerCase()} ${!activeSettings && activeNav === item.label ? "nav-button--active" : ""}`}
              key={item.label}
              onClick={() => { setActiveSettings(null); setActiveNav(item.label); }}
              type="button"
              aria-current={!activeSettings && activeNav === item.label ? "page" : undefined}
            >
              <LayeredIcon kind={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="user-actions">
          <NotificationsPopover notices={notices} onNoticesChange={onNoticesChange} />
          <div className="profile-menu-wrap" ref={profileMenuRef}>
            <button
              className="profile-button"
              type="button"
              ref={profileTriggerRef}
              aria-label={isProfileMenuOpen ? "Close profile menu" : "Open profile menu"}
              aria-haspopup="true"
              aria-expanded={isProfileMenuOpen}
              onClick={() => setIsProfileMenuOpen((open) => !open)}
            >
              <IdentityMark name={account.name} />
              <span className="profile-button__copy"><strong>{account.name}</strong><small>{account.email}</small></span>
              <span className="chevron"><LayeredIcon kind="dropdown" /></span>
            </button>

            {isProfileMenuOpen ? (
              <div className="profile-menu" aria-label="Profile settings">
                {managerProfileSections.map((label) => (
                  <button
                    className={`profile-menu__item ${activeSettings === label ? "profile-menu__item--active" : ""}`}
                    type="button"
                    key={label}
                    aria-current={activeSettings === label ? "page" : undefined}
                    onClick={() => { setActiveSettings(label); setIsProfileMenuOpen(false); }}
                  >
                    {label}
                  </button>
                ))}
                <button className="profile-menu__item profile-menu__item--logout" type="button" onClick={() => { setIsProfileMenuOpen(false); onSignOut(); }}>
                  <LogoutIcon />
                  Log Out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <section className="overview" id="overview">
        <div className="overview-copy">
          <h1>{activeSettings ? "Settings" : activeNav === "Tasks" ? "All Tasks" : activeNav === "Warehouses" ? "Warehouses" : "Operation Overview"}</h1>
          <p>{activeSettings ? <>The settings and administrative features play a crucial<br className="desktop-break" /> role.</> : activeNav === "Tasks" ? "Plan, assign and track every pickup, delivery and container." : activeNav === "Warehouses" ? <>Your active Amazing Tiles warehouse<br className="desktop-break" /> locations.</> : hasDateFilter ? `Showing operations for ${dateRangeLabel(dateRange)}.` : <>Everything moving smoothly through your warehouse<br className="desktop-break" /> network.</>}</p>
        </div>
        {!activeSettings ? <div className="overview-actions">
          {activeNav === "Dashboard" ? <select className="overview-warehouse-filter" aria-label="Dashboard warehouse" value={overviewWarehouse} onChange={(event) => setOverviewWarehouse(event.target.value)}><option value="All warehouse">All warehouses</option>{warehouses.filter((warehouse) => !warehouse.archivedAt).map((warehouse) => <option key={warehouse.id} value={warehouse.name}>{warehouse.name}</option>)}</select> : null}
          <DateFilter value={dateRange} onChange={setDateRange} />
          {activeNav !== "Warehouses" ? <button className="primary-button" type="button" onClick={() => { setNewTaskAssigneeIds([]); setNewTaskDate(activeDate ?? dateRange.from ?? todayInMelbourne()); setIsPriority(false); setIsTaskPanelOpen(true); }}>
            <img src="/assets/icon-add.svg" alt="" /> Add new task
          </button> : null}
        </div> : null}
      </section>

      {activeSettings ? (
        <SettingsPage
          activeSection={activeSettings}
          onSectionChange={setActiveSettings}
          onSignOut={onSignOut}
          account={account}
          onAccountChange={onAccountChange}
          notifications={notifications}
          onNotificationsChange={onNotificationsChange}
          administrators={administrators}
          onAdministratorsChange={onAdministratorsChange}
          onFeedback={(message, tone = "success") => { setFeedbackTone(tone); setFeedback(message); }}
          canManageRoles
          warehouses={warehouses}
          auditEvents={auditEvents}
          onSnapshot={onSnapshot}
          onOpenAuditRecord={openAuditRecord}
        />
      ) : activeNav === "Warehouses" ? (
        <>
        <div className="warehouse-management-controls">
          <label><span className="sr-only">Warehouse archive filter</span><select value={warehouseListFilter} onChange={(event) => setWarehouseListFilter(event.target.value as "Active" | "Archived")}><option>Active</option><option>Archived</option></select></label>
          <button className="primary-button" type="button" onClick={() => { setEditingWarehouse(null); setWarehouseError(""); }}><img src="/assets/icon-add.svg" alt="" /> Add warehouse</button>
        </div>
        <section className="warehouse-grid" aria-label={`${warehouseListFilter} warehouse locations`}>
          {displayedWarehouses.map((warehouse) => (
            <article
              className="warehouse-card warehouse-card--interactive"
              key={warehouse.name}
              role="button"
              tabIndex={0}
              aria-label={`Open ${warehouse.name} warehouse details`}
              onClick={() => setSelectedWarehouse(warehouse)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedWarehouse(warehouse);
                }
              }}
            >
              <div className="warehouse-card__header">
                <span className="warehouse-card__icon"><WarehouseCardIcon /></span>
                <span className="warehouse-card__actions">
                  {!warehouse.archivedAt ? <button type="button" onClick={(event) => { event.stopPropagation(); setEditingWarehouse(warehouse); setWarehouseError(""); }}>Edit</button> : null}
                  <button type="button" onClick={(event) => { event.stopPropagation(); if (!warehouse.id) return; if (!warehouse.archivedAt && !window.confirm(`Archive ${warehouse.name}? Open work must be resolved first.`)) return; void onSetWarehouseArchived(warehouse.id, Boolean(warehouse.archivedAt)).then((error) => { if (error) { setFeedbackTone("error"); setFeedback(error); } }); }}>{warehouse.archivedAt ? "Restore" : "Archive"}</button>
                </span>
              </div>
              <div className="warehouse-card__body">
                <span className="warehouse-office">{warehouse.office}</span>
                <h2>{warehouse.name}</h2>
                <p className="warehouse-address"><img src="/assets/icon-location.svg" alt="" />{warehouse.address}</p>
                <WarehouseStatusSummary statuses={warehouse.statuses} />
              </div>
            </article>
          ))}
        </section>
        </>
      ) : activeNav === "Tasks" ? (
        <section className="task-board task-board--all" aria-label="All tasks">
          <div className="task-filters">
            <label className="task-search">
              <img src="/assets/icon-search.svg" alt="" />
              <input value={taskSearch} onChange={(event) => setTaskSearch(event.target.value)} placeholder="Search invoice, description or team member..." aria-label="Search tasks" />
            </label>
            <select value={warehouseFilter} onChange={(event) => setWarehouseFilter(event.target.value)} aria-label="Filter by warehouse">
              <option>All warehouse</option>{Array.from(new Set(tasks.map((task) => task.warehouse))).map((warehouse) => <option key={warehouse}>{warehouse}</option>)}
            </select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status">
              <option>All status</option><option>Pending</option><option>In Progress</option><option>Complete</option><option>Delayed</option><option>Archived</option>
            </select>
          </div>

          <TaskTable tasks={filteredTasks} onSelect={(task) => { setSelectedOrder(task); setIsOrderEditing(false); }} />
        </section>
      ) : (
        <>
          <section className="stats-grid" aria-label="Filtered operations summary">
            {dashboardStats.map((stat) => (
              <button type="button" className="stat-card stat-card--interactive" key={stat.label} aria-label={`View ${stat.value} ${stat.label.toLowerCase()} tasks`} onClick={() => openFilteredTasks(stat.label)}>
                <div className={`stat-label stat-label--${stat.tone}`}><LayeredIcon kind={stat.icon} /> {stat.label}</div>
                <strong>{stat.value}</strong>
                <span className={`stat-note stat-note--${stat.tone}`}>{stat.note}</span>
              </button>
            ))}
          </section>

          <section className="warehouse-breakdown" aria-labelledby="warehouse-breakdown-title">
            <div className="task-board__header"><div><h2 id="warehouse-breakdown-title">By warehouse</h2><span>{dateRangeLabel(dateRange)} · Task status at each location</span></div></div>
            <div className="warehouse-breakdown__head" aria-hidden="true"><span>Warehouse</span>{["Pending", "In Progress", "Complete", "Delayed"].map((status) => <span key={status}>{status}</span>)}</div>
            {liveWarehouses.filter((warehouse) => overviewWarehouse === "All warehouse" || warehouse.name === overviewWarehouse).map((warehouse) => <div className="warehouse-breakdown__row" key={warehouse.id}>
              <button type="button" className="warehouse-breakdown__name" onClick={() => openFilteredTasks("All status", warehouse.name)}>{warehouse.name}</button>
              {warehouse.statuses.map((status) => <button type="button" className={`warehouse-breakdown__count stat-note--${status.tone}`} key={status.label} aria-label={`View ${warehouse.name}: ${status.value} ${status.label} tasks`} onClick={() => openFilteredTasks(status.label, warehouse.name)}><span className="warehouse-breakdown__mobile-label">{status.label}</span><strong>{status.value}</strong></button>)}
            </div>)}
            {!liveWarehouses.length ? <p>No active warehouses yet.</p> : null}
          </section>

          <section className="task-board" aria-labelledby="task-board-title">
            <div className="task-board__header">
              <div><span>{hasDateFilter ? dateRangeLabel(dateRange) : "Live Operations"}</span><h2 id="task-board-title">{hasDateFilter ? "Selected Range Tasks" : "Task Board"}</h2></div>
              <button className="secondary-button" type="button" onClick={() => openFilteredTasks()}>
                View All Tasks <img src="/assets/icon-arrow-right.svg" alt="" />
              </button>
            </div>
            <TaskTable tasks={visibleTasks} onSelect={(task) => { setSelectedOrder(task); setIsOrderEditing(false); }} />
          </section>
        </>
      )}

      {isTaskPanelOpen ? (
        <div className="task-panel-backdrop" onMouseDown={() => setIsTaskPanelOpen(false)}>
          <aside
            ref={taskPanelRef}
            className="task-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-task-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="task-panel__header">
              <div>
                <span>Operations</span>
                <h2 id="create-task-title">Create new task</h2>
              </div>
              <button className="task-panel__close" type="button" onClick={() => setIsTaskPanelOpen(false)} aria-label="Close create task panel">
                <span aria-hidden="true">×</span>
              </button>
            </div>

            <form className="task-form" onSubmit={createTask}>
              <div className="task-type-picker" aria-label="Task type">
                {(["Pickup", "Delivery", "Container"] as Task["type"][]).map((type) => (
                  <button
                    className={`task-type-option ${newTaskType === type ? "task-type-option--active" : ""}`}
                    type="button"
                    key={type}
                    onClick={() => setNewTaskType(type)}
                    aria-pressed={newTaskType === type}
                  >
                    {type === "Delivery" ? <img src="/assets/icon-delivery.svg" alt="" /> : type === "Pickup" ? <PickupIcon /> : <ContainerIcon />}
                    {type}
                  </button>
                ))}
              </div>

              <label className="form-field">
                <span>Invoice number</span>
                <input ref={taskFirstInputRef} name="invoice" placeholder="e.g. INV- 10458" required />
              </label>

              <div className="form-field">
                <span>Schedule date</span>
                <DateFilter mode="single" name="scheduled" value={{ from: newTaskDate, to: newTaskDate }} onChange={(range) => { if (range.from) setNewTaskDate(range.from); }} />
              </div>

              <label className="form-field">
                <span>Description</span>
                <textarea name="description" placeholder="Short summary of the order or operational work" rows={3} />
              </label>

              <div className="task-form__row">
                <label className="form-field">
                  <span>Item</span>
                  <input name="item" placeholder="e.g. Calacatta Cloud tiles" />
                </label>
                <label className="form-field form-field--quantity">
                  <span>Quantity</span>
                  <input name="quantity" inputMode="numeric" placeholder="24" />
                </label>
              </div>

              <div className="task-form__row">
                <label className="form-field">
                  <span>Warehouse</span>
                  <select name="warehouseId" value={newTaskWarehouseId} onChange={(event) => { setNewTaskWarehouseId(event.target.value); setNewTaskAssigneeIds([]); }} required>
                    <option value="" disabled>Select warehouse</option>
                    {warehouses.filter((warehouse) => !warehouse.archivedAt).map((warehouse) => <option value={warehouse.id} key={warehouse.id}>{warehouse.name}</option>)}
                  </select>
                </label>
                <div className="form-field">
                  <span>Assigned to (select one or more)</span>
                  <MultiAssigneeSelect
                    options={administrators.filter((member) => member.role === "Team member" && member.status === "Verified" && member.warehouseIds?.includes(newTaskWarehouseId)).map((member) => ({ id: member.id, name: member.name }))}
                    selectedIds={newTaskAssigneeIds}
                    onChange={setNewTaskAssigneeIds}
                  />
                </div>
              </div>

              <label className="form-field">
                <span>Notes</span>
                <textarea name="notes" placeholder="Access details, customer instructions or internal notes" rows={3} />
              </label>

              <div className="priority-row">
                <div><strong>Priority task</strong><span>Mark this task as high priority</span></div>
                <button
                  className={`priority-switch ${isPriority ? "priority-switch--active" : ""}`}
                  type="button"
                  role="switch"
                  aria-checked={isPriority}
                  aria-label="High priority"
                  onClick={() => setIsPriority((value) => !value)}
                ><span /></button>
              </div>

              <div className="task-form__actions">
                <button className="cancel-button" type="button" onClick={() => setIsTaskPanelOpen(false)}>Cancel</button>
                <button className="create-button" type="submit">Create Task</button>
              </div>
            </form>
          </aside>
        </div>
      ) : null}

      {editingWarehouse !== undefined ? <div className="administration-modal-backdrop" onMouseDown={() => setEditingWarehouse(undefined)}><section className="administration-modal warehouse-editor" role="dialog" aria-modal="true" aria-labelledby="warehouse-editor-title" onMouseDown={(event) => event.stopPropagation()}><header className="administration-modal__header"><span /><h2 id="warehouse-editor-title">{editingWarehouse ? "Edit Warehouse" : "Add Warehouse"}</h2><button type="button" aria-label="Close" onClick={() => setEditingWarehouse(undefined)}><img src="/assets/icon-admin-close.png" alt="" /></button></header><form className="administration-form" onSubmit={submitWarehouse}><div className="administration-fields"><label><span>Office type</span><input name="officeType" defaultValue={editingWarehouse?.office ?? "Branch Office"} required /></label><label><span>Warehouse name</span><input name="name" defaultValue={editingWarehouse?.name ?? ""} required /></label><label className="warehouse-editor__address"><span>Address</span><input name="address" defaultValue={editingWarehouse?.address ?? ""} required /></label></div>{warehouseError ? <p className="settings-message settings-message--error" role="alert">{warehouseError}</p> : null}<div className="administration-form__actions"><button type="button" onClick={() => setEditingWarehouse(undefined)}>Cancel</button><button type="submit">Save warehouse</button></div></form></section></div> : null}

      {selectedOrder ? (
        <OrderDetailsDrawer
          order={selectedOrder}
          isEditing={isOrderEditing}
          onEditingChange={setIsOrderEditing}
          onSave={saveOrder}
          onDelete={selectedOrder.archivedAt && selectedOrder.id ? () => { onRestoreTask(selectedOrder.id!); setSelectedOrder(null); } : deleteOrder}
          archiveActionLabel={selectedOrder.archivedAt ? "Restore task" : "Archive task"}
          warehouseOptions={warehouses}
          staffOptions={administrators}
          onClose={() => { setSelectedOrder(null); setIsOrderEditing(false); }}
        />
      ) : null}

      {selectedWarehouse ? (
        <WarehouseDetailsModal
          warehouse={selectedWarehouse}
          tasks={tasks.filter((task) => task.warehouse === selectedWarehouse.name && isDateInRange(task.date, dateRange))}
          onClose={() => setSelectedWarehouse(null)}
        />
      ) : null}

      {feedback ? <FeedbackToast message={feedback} tone={feedbackTone} onDismiss={() => setFeedback("")} /> : null}
    </main>
  );
}

function WarehouseTeamDashboard({
  onSignOut,
  tasks,
  onTasksChange,
  account,
  onAccountChange,
  notifications,
  onNotificationsChange,
  administrators,
  onAdministratorsChange,
  notices,
  onNoticesChange,
  warehouses,
  auditEvents,
}: {
  onSignOut: () => void;
  tasks: TeamTask[];
  onTasksChange: Dispatch<SetStateAction<TeamTask[]>>;
  account: Account;
  onAccountChange: Dispatch<SetStateAction<Account>>;
  notifications: NotificationSettings;
  onNotificationsChange: Dispatch<SetStateAction<NotificationSettings>>;
  administrators: Administrator[];
  onAdministratorsChange: AdministratorsChangeHandler;
  notices: AppNotice[];
  onNoticesChange: Dispatch<SetStateAction<AppNotice[]>>;
  warehouses: Warehouse[];
  auditEvents: AuditEventDTO[];
}) {
  const [activeView, setActiveView] = useState<TeamView>("My Tasks");
  const [activeSettings, setActiveSettings] = useState<SettingsSection | null>(null);
  const [scope, setScope] = useState<TeamScope>("My Tasks");
  const [teamStatusFilter, setTeamStatusFilter] = useState("All status");
  const [teamSearch, setTeamSearch] = useState("");
  const [openStatusInvoice, setOpenStatusInvoice] = useState<string | null>(null);
  const [pendingStatusChange, setPendingStatusChange] = useState<{ invoice: string; fromStatus: TeamTaskStatus; toStatus: TeamTaskStatus } | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Task | null>(null);
  const [isOrderEditing, setIsOrderEditing] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [dateRange, setDateRange] = useUrlDateRange();
  const [selectedWarehouse, setSelectedWarehouse] = useState<Warehouse | null>(null);
  const [feedback, setFeedback] = useState("");
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const profileTriggerRef = useRef<HTMLButtonElement>(null);
  const statusTriggerRefs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    function closeTransientUi(event: PointerEvent) {
      if (!profileMenuRef.current?.contains(event.target as Node)) setIsProfileMenuOpen(false);
      const target = event.target;
      if (!(target instanceof Element) || !target.closest(".team-status-wrap")) setOpenStatusInvoice(null);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (openStatusInvoice) {
        const openInvoice = openStatusInvoice;
        setOpenStatusInvoice(null);
        window.requestAnimationFrame(() => statusTriggerRefs.current.get(openInvoice)?.focus());
        return;
      }
      if (isProfileMenuOpen) {
        setIsProfileMenuOpen(false);
        window.requestAnimationFrame(() => profileTriggerRef.current?.focus());
      }
    }

    document.addEventListener("pointerdown", closeTransientUi);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeTransientUi);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isProfileMenuOpen, openStatusInvoice]);

  const companyTasks = tasks.filter((task) => !task.archivedAt);
  const assignedTasks = companyTasks.filter((task) => task.assigneeIds?.includes(account.id ?? ""));
  const scopeTasks = scope === "My Tasks" ? assignedTasks : companyTasks;
  const rangeTasks = scopeTasks.filter((task) => isDateInRange(task.isoDate, dateRange));
  const today = todayInMelbourne();
  const visibleTasks = rangeTasks.filter((task) => (teamStatusFilter === "All status" || task.status === teamStatusFilter)
    && (!teamSearch.trim() || [task.invoice, task.description, task.location, task.assignee, task.summary].some((value) => value.toLowerCase().includes(teamSearch.trim().toLowerCase()))))
    .sort((left, right) => compareTeamTasks(left, right, today));
  const currentSelectedTask = tasks.find((task) => task.id === selectedOrder?.id);
  const currentSelectedOrder = selectedOrder && currentSelectedTask ? { ...selectedOrder, status: currentSelectedTask.status, activityNotes: currentSelectedTask.activityNotes, assigneeIds: currentSelectedTask.assigneeIds, version: currentSelectedTask.version } : selectedOrder;
  const warehouseScopeTasks = scope === "My Tasks" ? assignedTasks : companyTasks;
  const dateFilteredWarehouseTasks = warehouseScopeTasks.filter((task) => isDateInRange(task.isoDate, dateRange));
  const liveWarehouses = warehousesWithLiveStats(dateFilteredWarehouseTasks, warehouses.filter((warehouse) => !warehouse.archivedAt));
  const visibleWarehouses = scope === "My Tasks" ? liveWarehouses.filter((warehouse) => account.warehouseIds?.includes(warehouse.id ?? "")) : liveWarehouses;
  const teamStats = [
    { label: "Pending", value: padCount(rangeTasks.filter((task) => task.status === "Pending").length), note: dateRange.from || dateRange.to ? dateRangeLabel(dateRange) : `${scope === "My Tasks" ? "My tasks" : "All company tasks"}`, tone: "blue", icon: "clock" },
    { label: "In Progress", value: padCount(rangeTasks.filter((task) => task.status === "In Progress").length), note: "Active operations", tone: "purple", icon: "progress" },
    { label: "Complete", value: padCount(rangeTasks.filter((task) => task.status === "Complete").length), note: "Completed operations", tone: "green", icon: "complete" },
    { label: "Delayed", value: padCount(rangeTasks.filter((task) => task.status === "Delayed").length), note: rangeTasks.some((task) => task.status === "Delayed") ? "Needs your attention" : "No delays in this view", tone: "red", icon: "danger" },
  ];

  function openOrder(task: TeamTask) {
    setSelectedOrder({
      id: task.id,
      invoice: task.invoice,
      type: task.type,
      warehouse: task.location,
      assignee: task.assignee,
      avatar: account.avatar,
      date: task.isoDate,
      scheduled: `${formatTaskDate(task.isoDate)} · ${task.time}`,
      status: task.status,
      description: task.description,
      items: task.items,
      notes: task.notes,
      priority: task.priority === "High",
      warehouseId: task.warehouseId,
      assigneeIds: task.assigneeIds,
      assignees: task.assignees,
      scheduledAt: task.scheduledAt,
      version: task.version,
      archivedAt: task.archivedAt,
      activityNotes: task.activityNotes,
    });
    setIsOrderEditing(false);
  }

  function updateTaskStatus(invoice: string, status: TeamTaskStatus) {
    onTasksChange((current) => current.map((task) => task.invoice === invoice ? { ...task, status } : task));
    setOpenStatusInvoice(null);
    onNoticesChange((current) => [{ id: crypto.randomUUID(), title: "Task status updated", message: `${invoice} is now ${status}.`, time: "Just now", read: false }, ...current]);
    setFeedback(`${invoice} moved to ${status}.`);
  }

  function requestTaskStatusChange(task: TeamTask, status: TeamTaskStatus) {
    setOpenStatusInvoice(null);
    if (task.status === status) return;
    setPendingStatusChange({ invoice: task.invoice, fromStatus: task.status, toStatus: status });
  }

  return (
    <main className="dashboard-shell team-dashboard">
      <header className="topbar team-topbar">
        {/* Full document navigation restores this account's default homepage. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="brand" href="/" aria-label="Amazing Operations home">
          <span className="brand__mark-wrap"><img className="brand__mark" src="/assets/logo-mark.svg" alt="" /></span>
          <img className="brand__word" src="/assets/logo-wordmark.svg" alt="Amazing Operations" />
        </a>

        <nav className="main-nav team-nav" aria-label="Warehouse Team navigation">
          {([
            { label: "My Tasks" as TeamView, icon: "tasks" },
            { label: "Warehouses Network" as TeamView, icon: "warehouse" },
          ]).map((item) => (
            <button
              className={`nav-button team-nav__button ${!activeSettings && activeView === item.label ? "nav-button--active" : ""}`}
              key={item.label}
              type="button"
              aria-current={!activeSettings && activeView === item.label ? "page" : undefined}
              onClick={() => { setActiveSettings(null); setActiveView(item.label); }}
            >
              <LayeredIcon kind={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="user-actions">
          <NotificationsPopover notices={notices} onNoticesChange={onNoticesChange} />
          <div className="profile-menu-wrap" ref={profileMenuRef}>
            <button
              className="profile-button"
              type="button"
              ref={profileTriggerRef}
              aria-label={isProfileMenuOpen ? "Close profile menu" : "Open profile menu"}
              aria-haspopup="true"
              aria-expanded={isProfileMenuOpen}
              onClick={() => setIsProfileMenuOpen((open) => !open)}
            >
              <IdentityMark name={account.name} />
              <span className="profile-button__copy"><strong>{account.name}</strong><small>{account.email}</small></span>
              <span className="chevron"><LayeredIcon kind="dropdown" /></span>
            </button>
            {isProfileMenuOpen ? (
              <div className="profile-menu team-profile-menu" aria-label="Warehouse Team profile">
                {teamProfileSections.map((label) => (
                  <button
                    className={`profile-menu__item ${activeSettings === label ? "profile-menu__item--active" : ""}`}
                    type="button"
                    key={label}
                    aria-current={activeSettings === label ? "page" : undefined}
                    onClick={() => { setActiveSettings(label); setIsProfileMenuOpen(false); }}
                  >
                    {label}
                  </button>
                ))}
                <button className="profile-menu__item profile-menu__item--logout" type="button" onClick={() => { setIsProfileMenuOpen(false); onSignOut(); }}>
                  <LogoutIcon />
                  Log Out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <section className="overview team-overview" id="team-overview">
        <div className="overview-copy">
          <h1>{activeSettings ? "Settings" : activeView === "Warehouses Network" ? (scope === "My Tasks" ? "My Warehouses" : "All Warehouses") : scope}</h1>
          <p>{activeSettings ? "Manage your account, password and notification preferences." : activeView === "Warehouses Network" ? "View the company warehouse network and task totals." : "Assigned work is editable; other company tasks remain read-only."}</p>
        </div>
        {!activeSettings ? <DateFilter value={dateRange} onChange={setDateRange} /> : null}
      </section>

      {activeSettings ? (
        <SettingsPage
          activeSection={activeSettings}
          onSectionChange={setActiveSettings}
          onSignOut={onSignOut}
          account={account}
          onAccountChange={onAccountChange}
          notifications={notifications}
          onNotificationsChange={onNotificationsChange}
          administrators={administrators}
          onAdministratorsChange={onAdministratorsChange}
          onFeedback={setFeedback}
          canManageRoles={false}
          warehouses={warehouses}
          auditEvents={auditEvents}
        />
      ) : (
        <>
          {activeView === "My Tasks" ? (
            <section className="stats-grid team-stats" aria-label="Filtered task summary">
              {teamStats.map((stat) => (
                <button className="stat-card stat-card--interactive" type="button" key={stat.label} aria-pressed={teamStatusFilter === stat.label} aria-label={`Filter ${stat.label} tasks, ${stat.value}`} onClick={() => { setTeamStatusFilter((current) => current === stat.label ? "All status" : stat.label); setOpenStatusInvoice(null); }}>
                  <div className={`stat-label stat-label--${stat.tone}`}><LayeredIcon kind={stat.icon} /> {stat.label}</div>
                  <strong>{stat.value}</strong>
                </button>
              ))}
            </section>
          ) : null}

          <section className="team-scope-row" aria-label="Warehouse task scope">
            <div className="team-segmented">
              {(["My Tasks", "All Company Tasks"] as TeamScope[]).map((option) => (
                <button
                  className={scope === option ? "team-segmented__button team-segmented__button--active" : "team-segmented__button"}
                  type="button"
                  key={option}
                  aria-pressed={scope === option}
                  onClick={() => setScope(option)}
                >
                  {activeView === "Warehouses Network" ? option === "My Tasks" ? "My warehouses" : "All warehouses" : option === "My Tasks" ? "Assigned to me" : option}
                </button>
              ))}
            </div>
            {activeView === "My Tasks" ? <div className="team-list-filters">
              <input type="search" aria-label="Search team tasks" placeholder="Search invoice or task" value={teamSearch} onChange={(event) => setTeamSearch(event.target.value)} />
              <select aria-label="Team task status" value={teamStatusFilter} onChange={(event) => setTeamStatusFilter(event.target.value)}><option>All status</option><option>Pending</option><option>In Progress</option><option>Complete</option><option>Delayed</option></select>
            </div> : null}
          </section>

          {activeView === "Warehouses Network" ? (
            <section className="warehouse-grid team-warehouse-grid" aria-label="Warehouse network">
              {visibleWarehouses.map((warehouse) => (
                <article
                  className="warehouse-card team-warehouse-card warehouse-card--interactive"
                  key={warehouse.name}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open ${warehouse.name} warehouse details`}
                  onClick={() => setSelectedWarehouse(warehouse)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedWarehouse(warehouse);
                    }
                  }}
                >
                  <div className="warehouse-card__header">
                    <span className="warehouse-card__icon"><WarehouseCardIcon /></span>
                  </div>
                  <div className="warehouse-card__body">
                    <span className="warehouse-office">{warehouse.office}</span>
                    <h2>{warehouse.name}</h2>
                    <p className="warehouse-address"><img src="/assets/icon-location.svg" alt="" />{warehouse.address}</p>
                    <WarehouseStatusSummary statuses={warehouse.statuses} />
                  </div>
                </article>
              ))}
            </section>
          ) : (
            <section className="team-task-list" aria-labelledby="team-task-list-title">
              <div className="team-task-list__heading">
                <span aria-hidden="true" />
                <h2 id="team-task-list-title">{teamStatusFilter === "All status" ? "Work queue" : `${teamStatusFilter} tasks`}</h2>
                <small aria-live="polite">{visibleTasks.length} {visibleTasks.length === 1 ? "Task" : "Tasks"}</small>
                <span aria-hidden="true" />
              </div>

              <div className="team-task-list__items">
                {visibleTasks.map((task, taskIndex) => (
                  <article className={`team-task-card ${openStatusInvoice === task.invoice ? "team-task-card--status-open" : ""}`} key={task.invoice}>
                    <button className="team-task-card__open" type="button" onClick={() => openOrder(task)} aria-label={`Open ${task.invoice} order details`}>
                      <span className="team-task-card__icon"><img src="/assets/icon-tasks.svg" alt="" /></span>
                      <span className="team-task-card__copy">
                        <span className="team-task-card__invoice">{task.invoice} · {task.type}</span>
                        <strong>{task.title}</strong>
                        <span className="team-task-card__summary">{task.summary}</span>
                        <span className="team-task-card__meta">
                          <span><img src="/assets/icon-calendar.svg" alt="" />{task.date}</span>
                          <span><img src="/assets/icon-clock.svg" alt="" />{task.time}</span>
                          <span><img src="/assets/icon-location.svg" alt="" />{task.location}</span>
                          {task.status !== "Complete" && taskUrgency(task, today) !== "Upcoming" ? <span className="team-priority">{taskUrgency(task, today)}</span> : null}
                        </span>
                      </span>
                    </button>

                    {task.assigneeIds?.includes(account.id ?? "") ? <div className="team-status-wrap">
                      <button
                        className={`team-status-button team-status-button--${task.status.toLowerCase().replace(" ", "-")}`}
                        type="button"
                        ref={(element) => {
                          if (element) statusTriggerRefs.current.set(task.invoice, element);
                          else statusTriggerRefs.current.delete(task.invoice);
                        }}
                        aria-haspopup="true"
                        aria-expanded={openStatusInvoice === task.invoice}
                        onClick={() => setOpenStatusInvoice((open) => open === task.invoice ? null : task.invoice)}
                      >
                        {task.status}
                        <span><LayeredIcon kind="dropdown" /></span>
                      </button>
                      {openStatusInvoice === task.invoice ? (
                        <div className={`team-status-menu ${taskIndex === visibleTasks.length - 1 ? "team-status-menu--up" : ""}`} role="group" aria-label={`Update ${task.invoice} status`}>
                          {(["Pending", "In Progress", "Complete", "Delayed"] as TeamTaskStatus[]).filter((status) => canTeamTransition(task.status.toLowerCase().replace(" ", "_") as Parameters<typeof canTeamTransition>[0], status.toLowerCase().replace(" ", "_") as Parameters<typeof canTeamTransition>[1])).map((status) => (
                            <button
                              className={task.status === status ? "team-status-menu__item team-status-menu__item--active" : "team-status-menu__item"}
                              type="button"
                              aria-pressed={task.status === status}
                              key={status}
                              onClick={() => requestTaskStatusChange(task, status)}
                            >
                              {status}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div> : <span className={`team-status-button team-status-button--${task.status.toLowerCase().replace(" ", "-")} team-status-button--readonly`} aria-label={`${task.status}, read only`}>{task.status}</span>}
                  </article>
                ))}
                {!visibleTasks.length ? <div className="team-empty-state"><strong>No matching tasks</strong><p>Try another status, search or date range.</p><button type="button" onClick={() => { setDateRange({ from: null, to: null }); setTeamStatusFilter("All status"); setTeamSearch(""); }}>Clear filters</button></div> : null}
              </div>
            </section>
          )}
        </>
      )}

      {selectedOrder ? (
        <OrderDetailsDrawer
          order={currentSelectedOrder ?? selectedOrder}
          isEditing={isOrderEditing}
          onEditingChange={setIsOrderEditing}
          onSave={() => undefined}
          readOnlyDetails
          canAddNote={Boolean(currentSelectedTask && !currentSelectedTask.archivedAt && currentSelectedTask.assigneeIds?.includes(account.id ?? ""))}
          onStatusChange={currentSelectedTask && !currentSelectedTask.archivedAt && currentSelectedTask.assigneeIds?.includes(account.id ?? "") ? (status) => requestTaskStatusChange(currentSelectedTask, status) : undefined}
          onAddNote={(note) => onTasksChange((current) => current.map((task) => task.id === selectedOrder.id ? { ...task, notes: note } : task))}
          onClose={() => { setSelectedOrder(null); setIsOrderEditing(false); }}
        />
      ) : null}

      {selectedWarehouse ? (
        <WarehouseDetailsModal
          warehouse={selectedWarehouse}
          tasks={scopeTasks.filter((task) => task.location === selectedWarehouse.name && isDateInRange(task.isoDate, dateRange))}
          onClose={() => setSelectedWarehouse(null)}
        />
      ) : null}

      {pendingStatusChange ? (
        <StatusChangeConfirmation
          invoice={pendingStatusChange.invoice}
          fromStatus={pendingStatusChange.fromStatus}
          toStatus={pendingStatusChange.toStatus}
          onCancel={() => setPendingStatusChange(null)}
          onConfirm={() => {
            updateTaskStatus(pendingStatusChange.invoice, pendingStatusChange.toStatus);
            setPendingStatusChange(null);
          }}
        />
      ) : null}

      {feedback ? <FeedbackToast message={feedback} onDismiss={() => setFeedback("")} /> : null}
    </main>
  );
}

function melbourneTaskDate(isoTimestamp: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(isoTimestamp));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function melbourneTaskTime(isoTimestamp: string) {
  return new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Melbourne", hour: "numeric", minute: "2-digit" }).format(new Date(isoTimestamp));
}

function localScheduleToUtc(date: string, time = "09:00") {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  let instant = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const values = Object.fromEntries(formatter.formatToParts(instant).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const displayedAsUtc = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute));
  instant = new Date(instant.getTime() + (Date.UTC(year, month - 1, day, hour, minute) - displayedAsUtc));
  return instant.toISOString();
}

function statusFromDto(status: TaskDTO["status"]): Status {
  return status === "in_progress" ? "In Progress" : status === "complete" ? "Complete" : status === "delayed" ? "Delayed" : "Pending";
}

function statusToDto(status: Status): TaskDTO["status"] {
  return status === "In Progress" ? "in_progress" : status === "Complete" ? "complete" : status === "Delayed" ? "delayed" : "pending";
}

function taskFromDto(task: TaskDTO): Task {
  const date = melbourneTaskDate(task.scheduledAt);
  const names = task.assignees.map((assignee) => assignee.fullName);
  return {
    id: task.id,
    invoice: task.invoice,
    type: task.type === "pickup" ? "Pickup" : task.type === "container" ? "Container" : "Delivery",
    warehouse: task.warehouseName,
    warehouseId: task.warehouseId,
    assignee: names.join(", ") || "Unassigned",
    assignees: names,
    assigneeIds: task.assignees.map((assignee) => assignee.id),
    avatar: "",
    date,
    scheduled: `${formatTaskDate(date)} · ${melbourneTaskTime(task.scheduledAt)}`,
    scheduledAt: task.scheduledAt,
    status: statusFromDto(task.status),
    description: task.description,
    items: task.items.map((item) => ({ id: item.id, name: item.name, quantity: item.quantity })),
    notes: "",
    activityNotes: task.notes,
    priority: task.priority,
    version: task.version,
    archivedAt: task.archivedAt,
  };
}

function teamTaskFromDto(task: TaskDTO): TeamTask {
  const managerTask = taskFromDto(task);
  return {
    invoice: managerTask.invoice,
    title: managerTask.description || `${managerTask.type} task for ${managerTask.warehouse}`,
    summary: managerTask.items.map((item) => `${item.quantity} ${item.name}`).join(" · ") || "No items listed",
    isoDate: managerTask.date,
    date: formatCompactDate(managerTask.date),
    time: melbourneTaskTime(task.scheduledAt),
    location: managerTask.warehouse,
    status: managerTask.status,
    priority: managerTask.priority ? "High" : undefined,
    description: managerTask.description,
    items: managerTask.items,
    notes: "",
    type: managerTask.type,
    assignee: managerTask.assignee,
    id: task.id,
    warehouseId: task.warehouseId,
    assigneeIds: managerTask.assigneeIds,
    assignees: managerTask.assignees,
    scheduledAt: task.scheduledAt,
    version: task.version,
    archivedAt: task.archivedAt,
    activityNotes: task.notes,
  } as TeamTask;
}

function accountFromSnapshot(snapshot: OperationsSnapshot): Account {
  return { id: snapshot.account.id, name: snapshot.account.fullName, email: snapshot.account.email, location: snapshot.account.location, avatar: "", warehouseIds: snapshot.account.warehouseIds };
}

function staffFromSnapshot(snapshot: OperationsSnapshot): Administrator[] {
  return snapshot.staff.map((staff) => ({
    id: staff.id,
    authUserId: staff.authUserId,
    name: staff.fullName,
    email: staff.email,
    role: staff.role === "manager" ? "Manager" : "Team member",
    status: staff.status === "active" ? "Verified" : staff.status === "suspended" ? "Suspended" : staff.status === "archived" ? "Archived" : "Pending",
    staffStatus: staff.status,
    avatar: "",
    gender: staff.gender,
    dateOfBirth: staff.dateOfBirth ?? "",
    location: staff.location,
    warehouseIds: staff.warehouseIds,
    archivedAt: staff.archivedAt,
  }));
}

function notificationSettingsFromSnapshot(snapshot: OperationsSnapshot): NotificationSettings {
  return {
    assignment: snapshot.notificationPreferences.assignment.email,
    reassignment: snapshot.notificationPreferences.reassignment.email,
    taskChanged: snapshot.notificationPreferences.task_changed.email,
    noteAdded: snapshot.notificationPreferences.note_added.email,
    taskDelayed: snapshot.notificationPreferences.task_delayed.email,
    taskCompleted: snapshot.notificationPreferences.task_completed.email,
  };
}

function noticesFromSnapshot(snapshot: OperationsSnapshot): AppNotice[] {
  const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  return snapshot.notices.map((notice) => {
    const minutes = Math.round((new Date(notice.createdAt).getTime() - Date.now()) / 60000);
    return { id: notice.id, title: notice.title, message: notice.message, time: Math.abs(minutes) < 60 ? relative.format(minutes, "minute") : relative.format(Math.round(minutes / 60), "hour"), read: Boolean(notice.readAt) };
  });
}

export default function Home() {
  const [snapshot, setSnapshot] = useState<OperationsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [backendMessage, setBackendMessage] = useState("");
  const [account, setAccountState] = useState<Account>(accountDefaults);
  const [managerTasks, setManagerTasksState] = useState<Task[]>([]);
  const [teamTasks, setTeamTasksState] = useState<TeamTask[]>([]);
  const [administrators, setAdministratorsState] = useState<Administrator[]>([]);
  const [notifications, setNotificationsState] = useState<NotificationSettings>(defaultNotificationSettings);
  const [notices, setNoticesState] = useState<AppNotice[]>([]);

  const applySnapshot = useCallback((next: OperationsSnapshot) => {
    setSnapshot(next);
    setAccountState(accountFromSnapshot(next));
    setManagerTasksState(next.tasks.map(taskFromDto));
    setTeamTasksState(next.tasks.map(teamTaskFromDto));
    setAdministratorsState(staffFromSnapshot(next));
    setNotificationsState(notificationSettingsFromSnapshot(next));
    setNoticesState(noticesFromSnapshot(next));
  }, []);

  const reload = useCallback(async () => {
    const result = await loadOperationsAction();
    setLoading(false);
    if (result.ok) { applySnapshot(result.data); setAuthError(""); }
    else if (result.code !== "AUTH_REQUIRED") setAuthError(result.error);
  }, [applySnapshot]);

  useEffect(() => {
    const timer = window.setTimeout(() => void reload(), 0);
    return () => window.clearTimeout(timer);
  }, [reload]);

  const realtimeAccountId = snapshot?.account.id;
  useEffect(() => {
    if (!realtimeAccountId) return;
    const refreshWhenVisible = () => { if (document.visibilityState === "visible") void reload(); };
    const timer = window.setInterval(refreshWhenVisible, 60000);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", refreshWhenVisible); };
  }, [reload, realtimeAccountId]);

  useEffect(() => {
    const accountId = realtimeAccountId;
    if (!accountId) return;
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    let timer = 0;
    const refreshSoon = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void reload(), 180);
    };
    const topics = ["tasks", "task_assignees", "task_notes", "warehouses", "notifications"];
    const channels = topics.map((topic) => supabase
      .channel(`operations:${topic}`, { config: { private: true } })
      .on("broadcast", { event: "*" }, refreshSoon)
      .on("postgres_changes", { event: "*", schema: "public", table: topic }, refreshSoon)
      .subscribe());
    return () => { window.clearTimeout(timer); channels.forEach((channel) => void supabase.removeChannel(channel)); };
  }, [reload, realtimeAccountId]);

  function handleResult(result: Awaited<ReturnType<typeof loadOperationsAction>>, fallback: () => void) {
    if (result.ok) { applySnapshot(result.data); setBackendMessage(""); }
    else { fallback(); setBackendMessage(result.error); }
  }

  const onTasksChange: Dispatch<SetStateAction<Task[]>> = (updater) => {
    const previous = managerTasks;
    const next = typeof updater === "function" ? updater(previous) : updater;
    setManagerTasksState(next);
    const added = next.find((task) => !previous.some((current) => current.id ? current.id === task.id : current.invoice === task.invoice));
    const removed = previous.find((task) => !next.some((current) => current.id ? current.id === task.id : current.invoice === task.invoice));
    const changed = next.find((task) => task.id && JSON.stringify(task) !== JSON.stringify(previous.find((current) => current.id === task.id)));
    void (async () => {
      let result;
      if (added) {
        const warehouseId = added.warehouseId ?? snapshot?.warehouses.find((warehouse) => warehouse.name === added.warehouse)?.id;
        const assigneeIds = added.assigneeIds?.length ? added.assigneeIds : snapshot?.staff.filter((staff) => added.assignee.split(", ").includes(staff.fullName)).map((staff) => staff.id) ?? [];
        result = await createTaskAction({ invoice: added.invoice, type: added.type.toLowerCase(), warehouseId, scheduledAt: added.scheduledAt ?? localScheduleToUtc(added.date), status: statusToDto(added.status), description: added.description, priority: added.priority, assigneeIds, items: added.items, note: added.notes });
      } else if (removed?.id) {
        result = await archiveTaskAction(removed.id);
      } else if (changed?.id) {
        const old = previous.find((task) => task.id === changed.id);
        const note = changed.notes !== old?.notes ? changed.notes || undefined : undefined;
        result = await updateTaskAction({ id: changed.id, version: changed.version, type: changed.type.toLowerCase(), warehouseId: changed.warehouseId ?? snapshot?.warehouses.find((warehouse) => warehouse.name === changed.warehouse)?.id, scheduledAt: changed.scheduledAt && changed.date === melbourneTaskDate(changed.scheduledAt) ? changed.scheduledAt : localScheduleToUtc(changed.date), status: statusToDto(changed.status), description: changed.description, priority: changed.priority, assigneeIds: changed.assigneeIds, items: changed.items, note });
      }
      if (result) handleResult(result, () => setManagerTasksState(previous));
    })();
  };

  const onTeamTasksChange: Dispatch<SetStateAction<TeamTask[]>> = (updater) => {
    const previous = teamTasks;
    const next = typeof updater === "function" ? updater(previous) : updater;
    setTeamTasksState(next);
    const changed = next.find((task) => {
      const old = previous.find((current) => current.id === task.id);
      return task.id && (task.status !== old?.status || task.notes !== old?.notes);
    });
    if (!changed?.id || !changed.version) return;
    const old = previous.find((task) => task.id === changed.id);
    const note = changed.notes !== old?.notes ? changed.notes || undefined : undefined;
    void updateAssignedTaskProgressAction({ taskId: changed.id, status: statusToDto(changed.status), version: changed.version, note }).then((result) => handleResult(result, () => setTeamTasksState(previous)));
  };

  const onAccountChange: Dispatch<SetStateAction<Account>> = (updater) => {
    const previous = account;
    const next = typeof updater === "function" ? updater(previous) : updater;
    setAccountState(next);
    void updateProfileAction({ fullName: next.name, location: next.location }).then((result) => handleResult(result, () => setAccountState(previous)));
  };

  const onAdministratorsChange: AdministratorsChangeHandler = async (next) => {
    const previous = administrators;
    let finalSnapshot = snapshot;
    if (!finalSnapshot) return { ok: false, error: "Operations data is not ready yet.", code: "DATA_NOT_READY" };
    for (const member of next) {
      const old = previous.find((item) => item.id === member.id);
      if (old && JSON.stringify(old) === JSON.stringify(member)) continue;

      const payload = {
        fullName: member.name,
        email: member.email,
        role: member.role === "Manager" ? "manager" as const : "warehouse_team" as const,
        location: member.location ?? "Melbourne, Australia",
        warehouseIds: member.role === "Manager" ? [] : member.warehouseIds ?? [],
        gender: member.gender === "Male" || member.gender === "Female" ? member.gender : "Prefer not to say" as const,
        dateOfBirth: member.dateOfBirth ?? "",
      };

      if (!old) {
        const result = await createAndInviteStaffAction(payload);
        if (result.data) {
          finalSnapshot = result.data;
          applySnapshot(result.data);
        }
        if (!result.ok) return { ok: false, error: result.error, code: result.code };
        continue;
      }

      const result = await saveStaffAction({ id: member.id, ...payload });
      if (!result.ok) return result;
      finalSnapshot = result.data;
      applySnapshot(result.data);
    }

    for (const member of previous.filter((item) => !next.some((candidate) => candidate.id === item.id))) {
      const result = await setStaffStateAction({ staffId: member.id, action: "archive" });
      if (!result.ok) return result;
      finalSnapshot = result.data;
      applySnapshot(result.data);
    }

    setBackendMessage("");
    return { ok: true, data: finalSnapshot };
  };

  const onNotificationsChange: Dispatch<SetStateAction<NotificationSettings>> = (updater) => {
    const previous = notifications;
    const next = typeof updater === "function" ? updater(previous) : updater;
    setNotificationsState(next);
    const preferences: NotificationPreferencesDTO = {
      assignment: { inApp: true, email: next.assignment }, reassignment: { inApp: true, email: next.reassignment },
      task_changed: { inApp: true, email: next.taskChanged }, note_added: { inApp: true, email: next.noteAdded },
      task_delayed: { inApp: true, email: next.taskDelayed }, task_completed: { inApp: true, email: next.taskCompleted },
    };
    void saveNotificationPreferencesAction(preferences).then((result) => handleResult(result, () => setNotificationsState(previous)));
  };

  const onNoticesChange: Dispatch<SetStateAction<AppNotice[]>> = (updater) => {
    const next = typeof updater === "function" ? updater(notices) : updater;
    const ids = next.filter((notice) => notice.read && notices.some((old) => old.id === notice.id && !old.read)).map((notice) => notice.id);
    setNoticesState(next);
    if (ids.length) void markNotificationsReadAction(ids).then((result) => { if (result.ok) applySnapshot(result.data); });
  };

  async function signIn(email: string, password: string, rememberDevice: boolean) {
    const result = await signInAction({ email, password, rememberDevice });
    if (!result.ok) return result.error;
    await reload();
    return null;
  }

  async function signOut() {
    await signOutAction();
    setSnapshot(null);
    setAuthError("");
  }

  if (loading) return <main className="app-loading" aria-live="polite"><img src="/assets/logo-wordmark.svg" alt="Amazing Operations" /><span>Loading operations…</span></main>;
  if (!snapshot) return <LoginScreen onSignIn={signIn} initialError={authError} />;

  const warehouseData: Warehouse[] = snapshot.warehouses.map((warehouse) => ({ id: warehouse.id, office: warehouse.officeType, name: warehouse.name, address: warehouse.address, archivedAt: warehouse.archivedAt, statuses: warehouseStatusSummary(managerTasks.filter((task) => task.warehouseId === warehouse.id)) }));
  const sharedProps = { onSignOut: signOut, account, onAccountChange, notifications, onNotificationsChange, administrators, onAdministratorsChange, notices, onNoticesChange, warehouses: warehouseData, auditEvents: snapshot.auditEvents };

  const onRestoreTask = (taskId: string) => {
    void archiveTaskAction(taskId, true).then((result) => handleResult(result, () => undefined));
  };

  const onSaveWarehouse = async (warehouse: { id?: string; officeType: string; name: string; address: string }) => {
    const result = await saveWarehouseAction(warehouse);
    if (!result.ok) return result.error;
    applySnapshot(result.data);
    return null;
  };

  const onSetWarehouseArchived = async (warehouseId: string, restore: boolean) => {
    const result = await setWarehouseArchivedAction(warehouseId, restore);
    if (!result.ok) return result.error;
    applySnapshot(result.data);
    return null;
  };

  return <>
    {snapshot.account.role === "manager"
      ? <Dashboard {...sharedProps} tasks={managerTasks} onTasksChange={onTasksChange} onTeamTasksChange={() => undefined} onRestoreTask={onRestoreTask} onSaveWarehouse={onSaveWarehouse} onSetWarehouseArchived={onSetWarehouseArchived} onSnapshot={applySnapshot} />
      : <WarehouseTeamDashboard {...sharedProps} tasks={teamTasks} onTasksChange={onTeamTasksChange} />}
    {backendMessage ? <FeedbackToast tone="error" message={backendMessage} onDismiss={() => setBackendMessage("")} /> : null}
  </>;
}
