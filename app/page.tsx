"use client";

import { FormEvent, useState } from "react";

type Status = "Ready" | "Pending" | "Delayed";

type Task = {
  invoice: string;
  type: "Delivery" | "Pickup" | "Container";
  warehouse: string;
  assignee: string;
  avatar: string;
  scheduled: string;
  status: Status;
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

const stats = [
  { label: "Pending Today", value: "02", note: "Across 3 warehouses", tone: "blue", icon: "clock" },
  { label: "Complete Today", value: "04", note: "2 completed on time", tone: "green", icon: "complete" },
  { label: "Delayed", value: "01", note: "Needs your attention", tone: "red", icon: "danger" },
  { label: "Stock Request", value: "03", note: "Waiting for approval", tone: "yellow", icon: "box" },
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

function TaskTable({ tasks }: { tasks: Task[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Invoice</th><th>Type</th><th>Warehouse</th><th>Assigned to</th><th>Scheduled</th><th>Status</th></tr></thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.invoice}>
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

export default function Home() {
  const [activeNav, setActiveNav] = useState("Dashboard");
  const [tasks, setTasks] = useState(initialTasks);
  const [showAll, setShowAll] = useState(false);
  const [isTaskPanelOpen, setIsTaskPanelOpen] = useState(false);
  const [newTaskType, setNewTaskType] = useState<Task["type"]>("Pickup");
  const [isPriority, setIsPriority] = useState(true);
  const [taskSearch, setTaskSearch] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState("All warehouse");
  const [statusFilter, setStatusFilter] = useState("All status");

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
        <a className="brand" href="#overview" aria-label="Amazing Operations home">
          <span className="brand__mark-wrap"><img className="brand__mark" src="/assets/logo-mark.svg" alt="" /></span>
          <img className="brand__word" src="/assets/logo-wordmark.svg" alt="Amazing Operations" />
        </a>

        <nav className="main-nav" aria-label="Primary navigation">
          {navItems.map((item) => (
            <button
              className={`nav-button nav-button--${item.label.toLowerCase()} ${activeNav === item.label ? "nav-button--active" : ""}`}
              key={item.label}
              onClick={() => setActiveNav(item.label)}
              type="button"
            >
              <LayeredIcon kind={item.icon} />
              <span>{item.label}</span>
              {item.label === "Dashboard" ? <span className="nav-count">2</span> : null}
            </button>
          ))}
        </nav>

        <div className="user-actions">
          <button className="circle-button" type="button" aria-label="View notifications"><img src="/assets/icon-bell-exact.svg" alt="" /></button>
          <button className="profile-button" type="button" aria-label="Open profile menu">
            <img src="/assets/avatar-ramie.png" alt="Ramie Shelbie" />
            <span><strong>Ramie Shelbie</strong><small>tomashelbie@gmail.com</small></span>
            <span className="chevron"><LayeredIcon kind="dropdown" /></span>
          </button>
        </div>
      </header>

      <section className="overview" id="overview">
        <div className="overview-copy">
          <h1>{activeNav === "Tasks" ? "All Tasks" : "Operation Overview"}</h1>
          <p>{activeNav === "Tasks" ? "Plan, assign and track every pickup, delivery and container." : <>Everything moving smoothly through your warehouse<br className="desktop-break" /> network today.</>}</p>
        </div>
        <div className="overview-actions">
          <div className="date-block" aria-label="Saturday, August 19, 2026">
            <span className="date-number">19</span>
            <span>Sat,<br />August, 2026</span>
            <span className="date-chevron"><LayeredIcon kind="dropdown" /></span>
          </div>
          <button className="primary-button" type="button" onClick={() => setIsTaskPanelOpen(true)}>
            <img src="/assets/icon-add.svg" alt="" /> Add new task
          </button>
        </div>
      </section>

      {activeNav === "Tasks" ? (
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
            <TaskTable tasks={visibleTasks} />
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
    </main>
  );
}
