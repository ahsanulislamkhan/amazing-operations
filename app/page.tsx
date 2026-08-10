"use client";

import { useState } from "react";

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

export default function Home() {
  const [activeNav, setActiveNav] = useState("Dashboard");
  const [tasks, setTasks] = useState(initialTasks);
  const [showAll, setShowAll] = useState(false);

  const visibleTasks = showAll ? tasks : tasks.slice(0, 7);

  function addTask() {
    const next = tasks.length + 10458;
    setTasks((current) => [
      ...current,
      { invoice: `INV-${next}`, type: "Pickup", warehouse: "Truganina", assignee: "Ramie Shelbie", avatar: "/assets/avatar-ramie.png", scheduled: "01 Aug, 2026", status: "Pending" },
    ]);
    setShowAll(true);
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
              className={`nav-button ${activeNav === item.label ? "nav-button--active" : ""}`}
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
          <h1>Operation Overview</h1>
          <p>Everything moving smoothly through your warehouse<br className="desktop-break" /> network today.</p>
        </div>
        <div className="overview-actions">
          <div className="date-block" aria-label="Saturday, August 19, 2026">
            <span className="date-number">19</span>
            <span>Sat,<br />August, 2026</span>
            <span className="date-chevron"><LayeredIcon kind="dropdown" /></span>
          </div>
          <button className="primary-button" type="button" onClick={addTask}>
            <img src="/assets/icon-add.svg" alt="" /> Add new task
          </button>
        </div>
      </section>

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
          <button className="secondary-button" type="button" onClick={() => setShowAll((value) => !value)}>
            {showAll ? "Show Today" : "View All Task"} <img src="/assets/icon-arrow-right.svg" alt="" />
          </button>
        </div>

        <div className="table-wrap">
          <table>
            <thead><tr><th>Invoice</th><th>Type</th><th>Warehouse</th><th>Assigned to</th><th>Scheduled</th><th>Status</th></tr></thead>
            <tbody>
              {visibleTasks.map((task) => (
                <tr key={task.invoice}>
                  <td>{task.invoice}</td>
                  <td><TaskType type={task.type} /></td>
                  <td>{task.warehouse}</td>
                  <td><span className="assignee"><img src={task.avatar} alt="" />{task.assignee}</span></td>
                  <td>{task.scheduled}</td>
                  <td><span className={`status status--${task.status.toLowerCase()}`}>{task.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
