"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type Status = "Ready" | "Pending" | "Delayed";
type AccessType = "Manager" | "Warehouse Team";
type SettingsSection = "My Account" | "Role Management" | "Password" | "Notification";

type Administrator = {
  id: number;
  name: string;
  email: string;
  role: "Manager" | "Team member";
  status: "Verified" | "Pending";
  avatar: string;
};

type Task = {
  invoice: string;
  type: "Delivery" | "Pickup" | "Container";
  warehouse: string;
  assignee: string;
  avatar: string;
  scheduled: string;
  status: Status;
};

type TeamTaskStatus = "Complete" | "In Progress" | "Delayed" | "Scheduled";
type TeamView = "My Task" | "Warehouses Network";
type TeamScope = "My warehouse" | "All warehouses";

type TeamTask = {
  invoice: string;
  title: string;
  summary: string;
  date: string;
  time: string;
  location: string;
  status: TeamTaskStatus;
  priority?: "Low";
};

const initialTasks: Task[] = [
  { invoice: "INV-10458", type: "Delivery", warehouse: "Hoppers Crossing", assignee: "Ehsanul Islam", avatar: "/assets/avatar-ehsanul.png", scheduled: "25 Jul, 2026", status: "Ready" },
  { invoice: "INV-10459", type: "Pickup", warehouse: "Sunshine", assignee: "Ryan Kim", avatar: "/assets/avatar-ryan.png", scheduled: "26 Jul, 2026", status: "Pending" },
  { invoice: "INV-10460", type: "Container", warehouse: "Melton", assignee: "Sam D’Souza", avatar: "/assets/avatar-sam.png", scheduled: "27 Jul, 2026", status: "Delayed" },
  { invoice: "INV-10461", type: "Delivery", warehouse: "Geelong", assignee: "Alice Johnson", avatar: "/assets/avatar-alice.png", scheduled: "28 Jul, 2026", status: "Ready" },
  { invoice: "INV-10462", type: "Pickup", warehouse: "Ballarat", assignee: "David Lee", avatar: "/assets/avatar-david.png", scheduled: "29 Jul, 2026", status: "Pending" },
  { invoice: "INV-10463", type: "Container", warehouse: "Bendigo", assignee: "Laura Chen", avatar: "/assets/avatar-laura.png", scheduled: "30 Jul, 2026", status: "Delayed" },
  { invoice: "INV-10464", type: "Delivery", warehouse: "Werribee", assignee: "Mark Thompson", avatar: "/assets/avatar-mark.png", scheduled: "31 Jul, 2026", status: "Ready" },
  { invoice: "INV-10465", type: "Delivery", warehouse: "St Albans", assignee: "Emma Watson", avatar: "/assets/avatar-emma.png", scheduled: "01 Aug, 2026", status: "Ready" },
  { invoice: "INV-10466", type: "Pickup", warehouse: "Craigieburn", assignee: "James Smith", avatar: "/assets/avatar-james.png", scheduled: "02 Aug, 2026", status: "Pending" },
  { invoice: "INV-10467", type: "Container", warehouse: "Truganina", assignee: "Sophia Patel", avatar: "/assets/avatar-sophia.png", scheduled: "03 Aug, 2026", status: "Delayed" },
];

const navItems = [
  { label: "Dashboard", icon: "dashboard" },
  { label: "Tasks", icon: "tasks" },
  { label: "Warehouses", icon: "warehouse" },
];

const profileSections: SettingsSection[] = ["My Account", "Role Management", "Password", "Notification"];

const initialAdministrators: Administrator[] = [
  { id: 1, name: "Rumin Rjazier", email: "ruminraizer@gmail.com", role: "Manager", status: "Verified", avatar: "/assets/avatar-ehsanul.png" },
  { id: 2, name: "Alexandra Pritchard", email: "alex.pritchard@example.com", role: "Team member", status: "Pending", avatar: "/assets/avatar-alice.png" },
  { id: 3, name: "Jason Lee", email: "jason.lee@email.com", role: "Manager", status: "Verified", avatar: "/assets/avatar-david.png" },
  { id: 4, name: "Maria Gonzalez", email: "maria.gonzalez@company.com", role: "Team member", status: "Verified", avatar: "/assets/avatar-laura.png" },
  { id: 5, name: "Nina Patel", email: "nina.patel@service.com", role: "Team member", status: "Verified", avatar: "/assets/avatar-sophia.png" },
  { id: 6, name: "Samuel Kim", email: "sam.kim@business.org", role: "Team member", status: "Verified", avatar: "/assets/avatar-ramie.png" },
  { id: 7, name: "Liam O’Connor", email: "liam.oconnor@gmail.com", role: "Team member", status: "Pending", avatar: "/assets/avatar-emma.png" },
  { id: 8, name: "Olivia Smith", email: "olivia.smith@startup.com", role: "Team member", status: "Pending", avatar: "/assets/avatar-mark.png" },
];

const accountDefaults = {
  name: "Ramie Shelbie",
  email: "ramieshelbie@gmail.com",
  location: "616 Somerville Road, Sunshine West VIC 3020",
};

const defaultNotificationSettings = {
  confirmation: true,
  edited: false,
  invoice: true,
  cancelled: true,
  refund: true,
  paymentError: false,
};

const notificationOptions = [
  { key: "confirmation", title: "Transaction Confirmation", description: "Sent automatically to the customer after they place their order." },
  { key: "edited", title: "Transaction Edited", description: "Sent to the customer after their order is edited (if you select this option)." },
  { key: "invoice", title: "Transaction Invoice", description: "Sent to the customer when the order has an outstanding balance." },
  { key: "cancelled", title: "Transaction Cancelled", description: "Sent automatically to the customer if their order is cancelled (if you select this option)." },
  { key: "refund", title: "Transaction Refund", description: "Sent automatically to the customer if their order is refunded (if you select this option)." },
  { key: "paymentError", title: "Payment Error", description: "Sent automatically to the customer if their payment can’t be processed during checkout." },
] as const;

const stats = [
  { label: "Pending Today", value: "02", note: "Across 3 warehouses", tone: "blue", icon: "clock" },
  { label: "Complete Today", value: "04", note: "2 completed on time", tone: "green", icon: "complete" },
  { label: "Delayed", value: "01", note: "Needs your attention", tone: "red", icon: "danger" },
];

const warehouses = [
  { office: "Head Office", name: "Sunshine", address: "616 Somerville Road, Sunshine West VIC 3020", statOne: "03", labelOne: "Active tasks", statTwo: "02", labelTwo: "Ready now", accessStatus: null },
  { office: "Regional Office", name: "Geelong", address: "45 Corio Bay Road, Geelong VIC 3220", statOne: "04", labelOne: "In progress", statTwo: "05", labelTwo: "Awaiting approval", accessStatus: "Pending" },
  { office: "Branch Office", name: "Ballarat", address: "89 Lydiard Street, Ballarat VIC 3350", statOne: "05", labelOne: "Completed tasks", statTwo: "01", labelTwo: "Not started", accessStatus: "Rejected" },
];

const initialTeamTasks: TeamTask[] = [
  {
    invoice: "INV-10482",
    title: "Calacatta Cloud tiles for Hawthorn Renovations",
    summary: "24 boxes tiles · 5 bags adhesive",
    date: "25 Jul",
    time: "9:00 AM",
    location: "Sunshine",
    status: "Complete",
  },
  {
    invoice: "INV-10483",
    title: "Crown Molding Installation for Downtown Office",
    summary: "50 ft molding · 10 tubes adhesive",
    date: "26 Jul",
    time: "10:30 AM",
    location: "Central",
    status: "In Progress",
  },
  {
    invoice: "INV-10484",
    title: "Exterior Painting for Riverside Apartments",
    summary: "30 gallons paint · 5 brushes",
    date: "27 Jul",
    time: "1:00 PM",
    location: "Riverside",
    status: "Delayed",
  },
  {
    invoice: "INV-10485",
    title: "Landscape Design for Maple Park",
    summary: "15 shrubs · 20 bags soil",
    date: "28 Jul",
    time: "11:00 AM",
    location: "Maple",
    status: "Scheduled",
    priority: "Low",
  },
];

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

function LogoutIcon() {
  return <span className="logout-icon" aria-hidden="true">
    <img className="logout-icon__base" src="/assets/icon-logout-base.svg" alt="" />
    <img className="logout-icon__path" src="/assets/icon-logout-path.svg" alt="" />
    <img className="logout-icon__shape" src="/assets/icon-logout-shape.svg" alt="" />
  </span>;
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
    <div className="table-wrap">
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
              <td><span className="assignee"><img src={task.avatar} alt="" />{task.assignee}</span></td>
              <td>{task.scheduled}</td>
              <td><span className={`status status--${task.status.toLowerCase()}`}>{task.status}</span></td>
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
  onClose,
}: {
  order: Task;
  isEditing: boolean;
  onEditingChange: (editing: boolean) => void;
  onClose: () => void;
}) {
  return (
    <div className="order-panel-backdrop" onMouseDown={onClose}>
      <aside
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
              <button className={`order-edit-button ${isEditing ? "order-edit-button--active" : ""}`} type="button" onClick={() => onEditingChange(!isEditing)}>
                <img src="/assets/icon-edit.svg" alt="" />
                {isEditing ? "Done" : "Edit"}
              </button>
            </div>
            <button className="order-panel__close" type="button" aria-label="Close order details" onClick={onClose}>
              <img src="/assets/icon-close.svg" alt="" />
            </button>
          </div>

          <div className={`order-details ${isEditing ? "order-details--editing" : ""}`}>
            {[
              ["Invoice No.", order.invoice],
              ["Schedule date", order.invoice === "INV-10458" || order.invoice === "INV-10482" ? "23 June 2026, 10:00 PM" : order.scheduled],
              ["Type", order.type],
              ["Warehouse", order.invoice === "INV-10458" || order.invoice === "INV-10482" ? "Sunshine" : order.warehouse],
              ["Assigned to", order.invoice === "INV-10458" || order.invoice === "INV-10482" ? "Dipu Khan" : order.assignee],
            ].map(([label, value]) => (
              <label className="order-detail-row" key={label}>
                <span>{label}</span>
                {isEditing ? <input defaultValue={value} aria-label={label} /> : <strong>{value}</strong>}
              </label>
            ))}

            <div className="order-description">
              <div className="order-section-title"><span>Descriptions</span><span className="order-section-chevron"><LayeredIcon kind="dropdown" /></span></div>
              {isEditing ? (
                <textarea aria-label="Descriptions" defaultValue="Here's a quick rundown of your order and operations: everything's running smoothly in your warehouse today! You can easily plan, assign, and keep tabs on every pickup, delivery, and container." />
              ) : (
                <p>Here&apos;s a quick rundown of your order and operations: everything&apos;s running smoothly in your warehouse today! You can easily plan, assign, and keep tabs on every pickup, delivery, and container.</p>
              )}
            </div>

            <div className="order-items">
              <h3>Items &amp; Quantity</h3>
              <div className="order-items__table" role="table" aria-label="Items and quantities">
                <div className="order-items__row order-items__row--header" role="row"><span role="columnheader">Name</span><span role="columnheader">Quantity</span></div>
                {[["Gray Tiles", "07"], ["Blue Tiles", "08"], ["Green Tiles", "12"], ["Yellow Tiles", "10"]].map(([name, quantity]) => (
                  <div className="order-items__row" role="row" key={name}>
                    <span role="cell">{isEditing ? <input defaultValue={name} aria-label={`${name} name`} /> : name}</span>
                    <span role="cell">{isEditing ? <input defaultValue={quantity} aria-label={`${name} quantity`} /> : quantity}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {isEditing ? (
          <div className="order-panel__actions">
            <button type="button" onClick={() => onEditingChange(false)}>Cancel</button>
            <button type="button" onClick={() => onEditingChange(false)}>Save change</button>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function LoginScreen({ onSignIn }: { onSignIn: (accessType: AccessType) => void }) {
  const [accessType, setAccessType] = useState<AccessType>("Manager");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(false);

  function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSignIn(accessType);
  }

  return (
    <main className="login-shell">
      <section className="login-hero" aria-label="Amazing Operations onboarding">
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
        <div className="login-feature" aria-label="Warehouse operations preview">
          <img className="login-feature__photo" src="/assets/login-team-photo.png" alt="Team members reviewing a stone tile in the showroom" />
          <div className="login-feature__tag login-feature__tag--overview">
            <span className="login-feature__overview-icon" aria-hidden="true">
              <img src="/assets/icon-login-overview-main.svg" alt="" />
              <img src="/assets/icon-login-overview-detail.svg" alt="" />
            </span>
            <span>Work Overview</span>
          </div>
          <div className="login-feature__tag login-feature__tag--task">
            <img src="/assets/icon-login-document.svg" alt="" />
            <span>Assign Task</span>
          </div>
        </div>
        <div className="login-carousel-dots" aria-hidden="true"><span /><span /><span /></div>
      </section>

      <section className="login-panel" aria-labelledby="login-title">
        <form className="login-card" onSubmit={signIn}>
          <div className="login-content">
            <div className="login-header">
              <div className="login-title-group">
                <p className="login-eyebrow">Welcome back</p>
                <h1 id="login-title">Sign in to Operations</h1>
              </div>
              <p>Choose your access type to continue.</p>
            </div>

            <div className="access-options" aria-label="Choose access type">
              {(["Manager", "Warehouse Team"] as AccessType[]).map((type) => {
                const selected = accessType === type;
                return (
                  <button
                    className={`access-option ${selected ? "access-option--selected" : ""}`}
                    key={type}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setAccessType(type)}
                  >
                    <span className="access-option__details">
                      <span className="access-option__icon">
                        <img src={type === "Manager" ? "/assets/icon-login-manager.svg" : "/assets/icon-login-team.svg"} alt="" />
                      </span>
                      <span className="access-option__copy">
                        <strong>{type}</strong>
                        <small>{type === "Manager" ? "All warehouses" : "Assigned task"}</small>
                      </span>
                    </span>
                    <span className="access-option__radio" aria-hidden="true"><span /></span>
                  </button>
                );
              })}
            </div>

            <div className="login-fields">
              <label className="login-field">
                <span>Full Name</span>
                <input name="fullName" type="text" placeholder="*********" autoComplete="name" required />
              </label>
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
            </div>
          </div>

          <button className="login-submit" type="submit">
            <span>Sign in as {accessType}</span>
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
}: {
  activeSection: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  onSignOut: () => void;
}) {
  const [account, setAccount] = useState(accountDefaults);
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
  const [notifications, setNotifications] = useState(defaultNotificationSettings);
  const [administrators, setAdministrators] = useState(initialAdministrators);
  const [roleStatusFilter, setRoleStatusFilter] = useState("All status");
  const [isAdministrationModalOpen, setIsAdministrationModalOpen] = useState(false);

  useEffect(() => {
    if (!isAdministrationModalOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsAdministrationModalOpen(false);
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [isAdministrationModalOpen]);

  const visibleAdministrators = administrators.filter((administrator) => (
    roleStatusFilter === "All status" || administrator.status === roleStatusFilter
  ));

  function addAdministrator(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const role = String(data.get("role") || "Manager") as Administrator["role"];
    setAdministrators((current) => [
      ...current,
      {
        id: Date.now(),
        name: String(data.get("name") || "New team member"),
        email: String(data.get("email") || "youremail@gmail.com"),
        role,
        status: "Pending",
        avatar: "/assets/avatar-james.png",
      },
    ]);
    setIsAdministrationModalOpen(false);
  }

  return (
    <>
      <section className="settings-card" aria-label={`${activeSection} settings`}>
        <aside className="settings-sidebar" aria-label="Settings navigation">
          {profileSections.map((section) => (
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
            <form className="settings-view" onSubmit={(event) => event.preventDefault()}>
              <div className="settings-form-layout">
                <div className="settings-intro">
                  <h2>Account Setting</h2>
                  <p>View and update your account details,<br />profile, and more.</p>
                </div>
                <div className="settings-fields">
                  <label className="settings-field"><span>Full Name<em>*</em></span><input value={account.name} onChange={(event) => setAccount({ ...account, name: event.target.value })} /></label>
                  <label className="settings-field"><span>E-mail Address<em>*</em></span><input type="email" value={account.email} onChange={(event) => setAccount({ ...account, email: event.target.value })} /></label>
                  <label className="settings-field"><span>Location<em>*</em></span><input value={account.location} onChange={(event) => setAccount({ ...account, location: event.target.value })} /></label>
                </div>
              </div>
              <div className="settings-actions">
                <button type="button" onClick={() => setAccount(accountDefaults)}>Cancel</button>
                <button type="submit">Save change</button>
              </div>
            </form>
          ) : null}

          {activeSection === "Role Management" ? (
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
                      <option>All status</option><option>Verified</option><option>Pending</option>
                    </select>
                  </label>
                  <button className="settings-add-button" type="button" onClick={() => setIsAdministrationModalOpen(true)}><img src="/assets/icon-add.svg" alt="" /> Add new</button>
                </div>
              </div>

              <div className="administrators-table-wrap">
                <div className="administrators-table" role="table" aria-label="Administration roles">
                  <div className="administrators-row administrators-row--head" role="row">
                    <span role="columnheader">Administration Name</span><span role="columnheader">E-mail</span><span role="columnheader">Role</span><span role="columnheader">Status</span><span aria-hidden="true" />
                  </div>
                  {visibleAdministrators.map((administrator) => (
                    <div className="administrators-row" role="row" key={administrator.id}>
                      <span className="administrator-name" role="cell"><img src={administrator.avatar} alt="" />{administrator.name}</span>
                      <span role="cell">{administrator.email}</span>
                      <span role="cell">{administrator.role}</span>
                      <span className={`administrator-status administrator-status--${administrator.status.toLowerCase()}`} role="cell"><img src={administrator.status === "Verified" ? "/assets/icon-admin-verified.png" : "/assets/icon-admin-pending.png"} alt="" />{administrator.status}</span>
                      <button className="administrator-more" type="button" aria-label={`More actions for ${administrator.name}`}><img src="/assets/icon-admin-more.png" alt="" /></button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="settings-actions">
                <button type="button" onClick={() => setRoleStatusFilter("All status")}>Cancel</button>
                <button type="button">Save change</button>
              </div>
            </div>
          ) : null}

          {activeSection === "Password" ? (
            <form className="settings-view" onSubmit={(event) => { event.preventDefault(); setPasswords({ current: "", next: "", confirm: "" }); }}>
              <div className="settings-form-layout">
                <div className="settings-intro">
                  <h2>Password</h2>
                  <p>Switch up your password or check it out!<br />Change it if want.</p>
                </div>
                <div className="settings-fields">
                  <label className="settings-field"><span>Current Password<em>*</em></span><input required type="password" placeholder="*********" value={passwords.current} onChange={(event) => setPasswords({ ...passwords, current: event.target.value })} /></label>
                  <label className="settings-field"><span>New Password<em>*</em></span><input required type="password" placeholder="*********" value={passwords.next} onChange={(event) => setPasswords({ ...passwords, next: event.target.value })} /></label>
                  <label className="settings-field"><span>Confirm Password<em>*</em></span><input required type="password" placeholder="*********" value={passwords.confirm} onChange={(event) => setPasswords({ ...passwords, confirm: event.target.value })} /></label>
                </div>
              </div>
              <div className="settings-actions">
                <button type="button" onClick={() => setPasswords({ current: "", next: "", confirm: "" })}>Cancel</button>
                <button type="submit">Save change</button>
              </div>
            </form>
          ) : null}

          {activeSection === "Notification" ? (
            <div className="settings-view">
              <div className="notification-layout">
                <div className="settings-intro">
                  <h2>Push Notification</h2>
                  <p>Get alerts for new orders, order processing<br />updates, and when orders are completed or<br />canceled.</p>
                </div>
                <div className="notification-list">
                  {notificationOptions.map((option) => {
                    const enabled = notifications[option.key];
                    return (
                      <div className="notification-option" key={option.key}>
                        <span><strong>{option.title}</strong><small>{option.description}</small></span>
                        <button
                          className={`settings-toggle ${enabled ? "settings-toggle--on" : ""}`}
                          type="button"
                          role="switch"
                          aria-checked={enabled}
                          aria-label={option.title}
                          onClick={() => setNotifications({ ...notifications, [option.key]: !enabled })}
                        ><i /></button>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="settings-actions">
                <button type="button" onClick={() => setNotifications({ ...defaultNotificationSettings })}>Cancel</button>
                <button type="button">Save change</button>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {isAdministrationModalOpen ? (
        <div className="administration-modal-backdrop" onMouseDown={() => setIsAdministrationModalOpen(false)}>
          <section className="administration-modal" role="dialog" aria-modal="true" aria-labelledby="add-administration-title" onMouseDown={(event) => event.stopPropagation()}>
            <header className="administration-modal__header">
              <button type="button" aria-label="Go back" onClick={() => setIsAdministrationModalOpen(false)}><img src="/assets/icon-admin-back.png" alt="" /></button>
              <h2 id="add-administration-title">Add Administration</h2>
              <button type="button" aria-label="Close" onClick={() => setIsAdministrationModalOpen(false)}><img src="/assets/icon-admin-close.png" alt="" /></button>
            </header>
            <div className="administration-avatar"><img src="/assets/admin-reference-avatar.jpeg" alt="New administrator" /><span><img src="/assets/icon-admin-avatar-edit.svg" alt="" /></span></div>
            <form className="administration-form" onSubmit={addAdministrator}>
              <h3>Stuff Information</h3>
              <div className="administration-fields">
                <label><span>Stuff Name</span><input name="name" placeholder="Rumin Rafi" required /></label>
                <label><span>Role</span><select name="role" defaultValue="Manager"><option>Manager</option><option>Team member</option></select></label>
                <label><span>E-mail Address</span><input name="email" type="email" placeholder="youremail@gmail.com" required /></label>
                <label><span>Gender</span><select name="gender" defaultValue="Male"><option>Male</option><option>Female</option><option>Prefer not to say</option></select></label>
                <label><span>Date of Birth</span><input name="dateOfBirth" placeholder="12/06/2004" /></label>
                <label><span>Location</span><select name="location" defaultValue="Melbourne, Australia"><option>Melbourne, Australia</option><option>Sunshine, Australia</option><option>Geelong, Australia</option></select></label>
              </div>
              <div className="administration-form__actions">
                <button type="button" onClick={() => setIsAdministrationModalOpen(false)}>Cancel</button>
                <button type="submit">Save</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}

function Dashboard({ onSignOut }: { onSignOut: () => void }) {
  const [activeNav, setActiveNav] = useState("Dashboard");
  const [activeSettings, setActiveSettings] = useState<SettingsSection | null>(null);
  const [tasks, setTasks] = useState(initialTasks);
  const [showAll, setShowAll] = useState(false);
  const [isTaskPanelOpen, setIsTaskPanelOpen] = useState(false);
  const [newTaskType, setNewTaskType] = useState<Task["type"]>("Pickup");
  const [isPriority, setIsPriority] = useState(true);
  const [taskSearch, setTaskSearch] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState("All warehouse");
  const [statusFilter, setStatusFilter] = useState("All status");
  const [selectedOrder, setSelectedOrder] = useState<Task | null>(null);
  const [isOrderEditing, setIsOrderEditing] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isProfileMenuOpen) return;

    function closeOnOutsideClick(event: PointerEvent) {
      if (!profileMenuRef.current?.contains(event.target as Node)) setIsProfileMenuOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsProfileMenuOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isProfileMenuOpen]);

  const visibleTasks = showAll ? tasks : tasks.slice(0, 7);
  const filteredTasks = tasks.filter((task) => {
    const search = taskSearch.trim().toLowerCase();
    const matchesSearch = !search || [task.invoice, task.type, task.warehouse, task.assignee].some((value) => value.toLowerCase().includes(search));
    const matchesWarehouse = warehouseFilter === "All warehouse" || task.warehouse === warehouseFilter;
    const matchesStatus = statusFilter === "All status" || task.status === statusFilter;
    return matchesSearch && matchesWarehouse && matchesStatus;
  });

  function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const invoice = String(data.get("invoice") || `INV-${tasks.length + 10458}`);
    const scheduled = String(data.get("scheduled") || "26 Jul, 2026").replace(/(\d{2}) (\w{3}) (\d{4})/, "$1 $2, $3");
    const assignee = String(data.get("assignee") || "Dipu Rai");
    setTasks((current) => [
      ...current,
      {
        invoice,
        type: newTaskType,
        warehouse: String(data.get("warehouse") || "Sunshine"),
        assignee,
        avatar: assignee === "Ramie Shelbie" ? "/assets/avatar-ramie.png" : "/assets/avatar-david.png",
        scheduled,
        status: isPriority ? "Pending" : "Ready",
      },
    ]);
    setShowAll(true);
    setIsTaskPanelOpen(false);
  }

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <a className="brand" href="#overview" aria-label="Amazing Operations home" onClick={() => { setActiveSettings(null); setActiveNav("Dashboard"); }}>
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
            >
              <LayeredIcon kind={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="user-actions">
          <button className="circle-button" type="button" aria-label="View notifications"><img src="/assets/icon-bell-exact.svg" alt="" /></button>
          <div className="profile-menu-wrap" ref={profileMenuRef}>
            <button
              className="profile-button"
              type="button"
              aria-label={isProfileMenuOpen ? "Close profile menu" : "Open profile menu"}
              aria-haspopup="menu"
              aria-expanded={isProfileMenuOpen}
              onClick={() => setIsProfileMenuOpen((open) => !open)}
            >
              <img src="/assets/avatar-ramie.png" alt="Ramie Shelbie" />
              <span><strong>Ramie Shelbie</strong><small>tomashelbie@gmail.com</small></span>
              <span className="chevron"><LayeredIcon kind="dropdown" /></span>
            </button>

            {isProfileMenuOpen ? (
              <div className="profile-menu" role="menu" aria-label="Profile settings">
                {profileSections.map((label) => (
                  <button
                    className={`profile-menu__item ${activeSettings === label ? "profile-menu__item--active" : ""}`}
                    type="button"
                    role="menuitem"
                    key={label}
                    aria-current={activeSettings === label ? "page" : undefined}
                    onClick={() => { setActiveSettings(label); setIsProfileMenuOpen(false); }}
                  >
                    {label}
                  </button>
                ))}
                <button className="profile-menu__item profile-menu__item--logout" type="button" role="menuitem" onClick={() => { setIsProfileMenuOpen(false); onSignOut(); }}>
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
          <p>{activeSettings ? <>The settings and administrative features play a crucial<br className="desktop-break" /> role.</> : activeNav === "Tasks" ? "Plan, assign and track every pickup, delivery and container." : activeNav === "Warehouses" ? <>Your three active Amazing Tiles warehouse<br className="desktop-break" /> locations.</> : <>Everything moving smoothly through your warehouse<br className="desktop-break" /> network today.</>}</p>
        </div>
        <div className="overview-actions">
          <div className="date-block" aria-label="Saturday, August 19, 2026">
            <span className="date-number">19</span>
            <span>Sat,<br />August, 2026</span>
            <span className="date-chevron"><LayeredIcon kind="dropdown" /></span>
          </div>
          {!activeSettings && activeNav !== "Warehouses" ? <button className="primary-button" type="button" onClick={() => setIsTaskPanelOpen(true)}>
            <img src="/assets/icon-add.svg" alt="" /> Add new task
          </button> : null}
        </div>
      </section>

      {activeSettings ? (
        <SettingsPage activeSection={activeSettings} onSectionChange={setActiveSettings} onSignOut={onSignOut} />
      ) : activeNav === "Warehouses" ? (
        <section className="warehouse-grid" aria-label="Warehouse locations">
          {warehouses.map((warehouse) => (
            <article className="warehouse-card" key={warehouse.name}>
              <div className="warehouse-card__header">
                <span className="warehouse-card__icon"><WarehouseCardIcon /></span>
              </div>
              <div className="warehouse-card__body">
                <span className="warehouse-office">{warehouse.office}</span>
                <h2>{warehouse.name}</h2>
                <p className="warehouse-address"><img src="/assets/icon-location.svg" alt="" />{warehouse.address}</p>
                <div className="warehouse-stats">
                  <div><strong>{warehouse.statOne}</strong><span>{warehouse.labelOne}</span></div>
                  <div><strong>{warehouse.statTwo}</strong><span>{warehouse.labelTwo}</span></div>
                </div>
              </div>
            </article>
          ))}
        </section>
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
              <option>All status</option><option>Ready</option><option>Pending</option><option>Delayed</option>
            </select>
          </div>

          <TaskTable tasks={filteredTasks} />
        </section>
      ) : (
        <>
          <section className="stats-grid" aria-label="Today’s operations summary">
            {stats.map((stat) => (
              <article className="stat-card" key={stat.label}>
                <div className={`stat-label stat-label--${stat.tone}`}><LayeredIcon kind={stat.icon} /> {stat.label}</div>
                <strong>{stat.value}</strong>
                <span className={`stat-note stat-note--${stat.tone}`}>{stat.note}</span>
              </article>
            ))}
          </section>

          <section className="task-board" aria-labelledby="task-board-title">
            <div className="task-board__header">
              <div><span>Live Operations</span><h2 id="task-board-title">Today’s Task Board</h2></div>
              <button className="secondary-button" type="button" onClick={() => { setShowAll(true); setActiveNav("Tasks"); }}>
                View All Task <img src="/assets/icon-arrow-right.svg" alt="" />
              </button>
            </div>
            <TaskTable tasks={visibleTasks} onSelect={(task) => { setSelectedOrder(task); setIsOrderEditing(false); }} />
          </section>
        </>
      )}

      {isTaskPanelOpen ? (
        <div className="task-panel-backdrop" onMouseDown={() => setIsTaskPanelOpen(false)}>
          <aside
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
                <input name="invoice" placeholder="e.g. INV- 10458" required />
              </label>

              <label className="form-field">
                <span>Schedule date</span>
                <span className="input-with-icon">
                  <input name="scheduled" defaultValue="26 Jul 2026" required />
                  <img src="/assets/icon-calendar.svg" alt="" />
                </span>
              </label>

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
                  <select name="warehouse" defaultValue="Sunshine">
                    <option>Sunshine</option><option>Hoppers Crossing</option><option>Melton</option><option>Geelong</option>
                  </select>
                </label>
                <label className="form-field">
                  <span>Assigned to</span>
                  <select name="assignee" defaultValue="Dipu Rai">
                    <option>Dipu Rai</option><option>Ramie Shelbie</option><option>Ryan Kim</option><option>Ehsanul Islam</option>
                  </select>
                </label>
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

      {selectedOrder ? (
        <OrderDetailsDrawer
          order={selectedOrder}
          isEditing={isOrderEditing}
          onEditingChange={setIsOrderEditing}
          onClose={() => { setSelectedOrder(null); setIsOrderEditing(false); }}
        />
      ) : null}
    </main>
  );
}

function WarehouseTeamDashboard({ onSignOut }: { onSignOut: () => void }) {
  const [activeView, setActiveView] = useState<TeamView>("My Task");
  const [scope, setScope] = useState<TeamScope>("My warehouse");
  const [tasks, setTasks] = useState(initialTeamTasks);
  const [openStatusInvoice, setOpenStatusInvoice] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Task | null>(null);
  const [isOrderEditing, setIsOrderEditing] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function closeTransientUi(event: PointerEvent) {
      if (!profileMenuRef.current?.contains(event.target as Node)) setIsProfileMenuOpen(false);
      const target = event.target;
      if (!(target instanceof Element) || !target.closest(".team-status-wrap")) setOpenStatusInvoice(null);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setIsProfileMenuOpen(false);
      setOpenStatusInvoice(null);
      setSelectedOrder(null);
      setIsOrderEditing(false);
    }

    document.addEventListener("pointerdown", closeTransientUi);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeTransientUi);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const visibleTasks = scope === "My warehouse" ? tasks.slice(0, 2) : tasks;

  function openOrder(task: TeamTask) {
    setSelectedOrder({
      invoice: task.invoice,
      type: "Delivery",
      warehouse: task.location,
      assignee: "Dipu Khan",
      avatar: "/assets/avatar-ramie.png",
      scheduled: `${task.date}, 2026 · ${task.time}`,
      status: task.status === "Delayed" ? "Delayed" : task.status === "In Progress" ? "Pending" : "Ready",
    });
    setIsOrderEditing(false);
  }

  function updateTaskStatus(invoice: string, status: TeamTaskStatus) {
    setTasks((current) => current.map((task) => task.invoice === invoice ? { ...task, status } : task));
    setOpenStatusInvoice(null);
  }

  return (
    <main className="dashboard-shell team-dashboard">
      <header className="topbar team-topbar">
        <a className="brand" href="#team-overview" aria-label="Amazing Operations home" onClick={() => { setActiveView("My Task"); setScope("My warehouse"); }}>
          <span className="brand__mark-wrap"><img className="brand__mark" src="/assets/logo-mark.svg" alt="" /></span>
          <img className="brand__word" src="/assets/logo-wordmark.svg" alt="Amazing Operations" />
        </a>

        <nav className="main-nav team-nav" aria-label="Warehouse Team navigation">
          {([
            { label: "My Task" as TeamView, icon: "tasks" },
            { label: "Warehouses Network" as TeamView, icon: "warehouse" },
          ]).map((item) => (
            <button
              className={`nav-button team-nav__button ${activeView === item.label ? "nav-button--active" : ""}`}
              key={item.label}
              type="button"
              aria-current={activeView === item.label ? "page" : undefined}
              onClick={() => setActiveView(item.label)}
            >
              <LayeredIcon kind={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="user-actions">
          <button className="circle-button" type="button" aria-label="View notifications"><img src="/assets/icon-bell-exact.svg" alt="" /></button>
          <div className="profile-menu-wrap" ref={profileMenuRef}>
            <button
              className="profile-button"
              type="button"
              aria-label={isProfileMenuOpen ? "Close profile menu" : "Open profile menu"}
              aria-haspopup="menu"
              aria-expanded={isProfileMenuOpen}
              onClick={() => setIsProfileMenuOpen((open) => !open)}
            >
              <img src="/assets/avatar-ramie.png" alt="Ramie Shelbie" />
              <span><strong>Ramie Shelbie</strong><small>tomashelbie@gmail.com</small></span>
              <span className="chevron"><LayeredIcon kind="dropdown" /></span>
            </button>
            {isProfileMenuOpen ? (
              <div className="profile-menu team-profile-menu" role="menu" aria-label="Warehouse Team profile">
                <button className="profile-menu__item profile-menu__item--logout" type="button" role="menuitem" onClick={onSignOut}>
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
          <h1>{activeView === "Warehouses Network" ? "My Warehouses" : scope === "All warehouses" ? "My Tasks" : "Task Overview"}</h1>
          <p>Your Sunshine tasks are pinned first. Update them as work progresses.</p>
        </div>
        <div className="date-block" aria-label="Saturday, August 19, 2026">
          <span className="date-number">19</span>
          <span>Sat,<br />August, 2026</span>
          <span className="date-chevron"><LayeredIcon kind="dropdown" /></span>
        </div>
      </section>

      {activeView === "My Task" && scope === "My warehouse" ? (
        <section className="stats-grid team-stats" aria-label="Today’s task summary">
          {stats.map((stat) => (
            <article className="stat-card" key={stat.label}>
              <div className={`stat-label stat-label--${stat.tone}`}><LayeredIcon kind={stat.icon} /> {stat.label === "Pending Today" ? "Pending Task" : stat.label}</div>
              <strong>{stat.value}</strong>
              <span className={`stat-note stat-note--${stat.tone}`}>{stat.note}</span>
            </article>
          ))}
        </section>
      ) : null}

      <section className="team-scope-row" aria-label="Warehouse task scope">
        <div className="team-segmented">
          {(["My warehouse", "All warehouses"] as TeamScope[]).map((option) => (
            <button
              className={scope === option ? "team-segmented__button team-segmented__button--active" : "team-segmented__button"}
              type="button"
              key={option}
              aria-pressed={scope === option}
              onClick={() => setScope(option)}
            >
              {option}
            </button>
          ))}
        </div>
        <div className="team-online"><span aria-hidden="true" />Sunshine · Abdur Rahman · Online</div>
      </section>

      {activeView === "Warehouses Network" ? (
        <section className="warehouse-grid team-warehouse-grid" aria-label="Warehouse network">
          {warehouses.map((warehouse) => (
            <article className="warehouse-card team-warehouse-card" key={warehouse.name}>
              <div className="warehouse-card__header">
                <span className="warehouse-card__icon"><WarehouseCardIcon /></span>
                {warehouse.accessStatus ? <span className={`warehouse-access warehouse-access--${warehouse.accessStatus.toLowerCase()}`}>{warehouse.accessStatus}</span> : null}
              </div>
              <div className="warehouse-card__body">
                <span className="warehouse-office">{warehouse.office}</span>
                <h2>{warehouse.name}</h2>
                <p className="warehouse-address"><img src="/assets/icon-location.svg" alt="" />{warehouse.address}</p>
                <div className="warehouse-stats">
                  <div><strong>{warehouse.statOne}</strong><span>{warehouse.labelOne}</span></div>
                  <div><strong>{warehouse.statTwo}</strong><span>{warehouse.labelTwo}</span></div>
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="team-task-list" aria-labelledby="team-task-list-title">
          <div className="team-task-list__heading">
            <span aria-hidden="true" />
            <h2 id="team-task-list-title">Today</h2>
            <small>{visibleTasks.length} Task</small>
            <span aria-hidden="true" />
          </div>

          <div className="team-task-list__items">
            {visibleTasks.map((task) => (
              <article className="team-task-card" key={task.invoice}>
                <button className="team-task-card__open" type="button" onClick={() => openOrder(task)} aria-label={`Open ${task.invoice} order details`}>
                  <span className="team-task-card__icon"><img src="/assets/icon-tasks.svg" alt="" /></span>
                  <span className="team-task-card__copy">
                    <span className="team-task-card__invoice">{task.invoice}</span>
                    <strong>{task.title}</strong>
                    <span className="team-task-card__summary">{task.summary}</span>
                    <span className="team-task-card__meta">
                      <span><img src="/assets/icon-calendar.svg" alt="" />{task.date}</span>
                      <span><img src="/assets/icon-clock.svg" alt="" />{task.time}</span>
                      <span><img src="/assets/icon-location.svg" alt="" />{task.location}</span>
                      {task.priority ? <span className="team-priority">{task.priority} priority</span> : null}
                    </span>
                  </span>
                </button>

                <div className="team-status-wrap">
                  <button
                    className={`team-status-button team-status-button--${task.status.toLowerCase().replace(" ", "-")}`}
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={openStatusInvoice === task.invoice}
                    onClick={() => setOpenStatusInvoice((open) => open === task.invoice ? null : task.invoice)}
                  >
                    {task.status}
                    <span><LayeredIcon kind="dropdown" /></span>
                  </button>
                  {openStatusInvoice === task.invoice ? (
                    <div className="team-status-menu" role="menu" aria-label={`Update ${task.invoice} status`}>
                      {(["Complete", "In Progress", "Delayed"] as TeamTaskStatus[]).map((status) => (
                        <button
                          className={task.status === status ? "team-status-menu__item team-status-menu__item--active" : "team-status-menu__item"}
                          type="button"
                          role="menuitem"
                          key={status}
                          onClick={() => updateTaskStatus(task.invoice, status)}
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {selectedOrder ? (
        <OrderDetailsDrawer
          order={selectedOrder}
          isEditing={isOrderEditing}
          onEditingChange={setIsOrderEditing}
          onClose={() => { setSelectedOrder(null); setIsOrderEditing(false); }}
        />
      ) : null}
    </main>
  );
}

export default function Home() {
  const [activeAccess, setActiveAccess] = useState<AccessType | null>(null);

  if (activeAccess === "Manager") return <Dashboard onSignOut={() => setActiveAccess(null)} />;
  if (activeAccess === "Warehouse Team") return <WarehouseTeamDashboard onSignOut={() => setActiveAccess(null)} />;
  return <LoginScreen onSignIn={setActiveAccess} />;
}
