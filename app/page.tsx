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
  { label: "Dashboard", icon: "/assets/icon-dashboard.svg" },
  { label: "Tasks", icon: "/assets/icon-tasks.svg" },
  { label: "Warehouses", icon: "/assets/icon-box.svg" },
];

const stats = [
  { label: "Pending Today", value: "02", note: "Across 3 warehouses", tone: "blue", icon: "/assets/icon-clock.svg" },
  { label: "Complete Today", value: "04", note: "2 completed on time", tone: "green", icon: "/assets/icon-dashboard.svg" },
  { label: "Delayed", value: "01", note: "Needs your attention", tone: "red", icon: "/assets/icon-danger.svg" },
  { label: "Stock Request", value: "03", note: "Waiting for approval", tone: "yellow", icon: "/assets/icon-box.svg" },
];

function TaskType({ type }: { type: Task["type"] }) {
  const icon = type === "Delivery" ? "/assets/icon-delivery.svg" : "/assets/icon-box.svg";
  return (
    <span className={`task-type task-type--${type.toLowerCase()}`}>
      <span className="task-type__icon"><img src={icon} alt="" /></span>
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
          <img className="brand__mark" src="/assets/logo-mark.svg" alt="" />
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
              <img src={item.icon} alt="" />
              <span>{item.label}</span>
              {item.label === "Dashboard" ? <span className="nav-count">2</span> : null}
            </button>
          ))}
        </nav>

        <div className="user-actions">
          <button className="circle-button sun-button" type="button" aria-label="Toggle appearance">☼</button>
          <button className="circle-button" type="button" aria-label="View notifications"><img src="/assets/icon-bell.svg" alt="" /></button>
          <button className="profile-button" type="button" aria-label="Open profile menu">
            <img src="/assets/avatar-ramie.png" alt="Ramie Shelbie" />
            <span><strong>Ramie Shelbie</strong><small>tomashelbie@gmail.com</small></span>
            <span className="chevron">⌄</span>
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
            <span className="chevron">⌄</span>
          </div>
          <button className="primary-button" type="button" onClick={addTask}>
            <img src="/assets/icon-add.svg" alt="" /> Add new task
          </button>
        </div>
      </section>

      <section className="stats-grid" aria-label="Today’s operations summary">
        {stats.map((stat) => (
          <article className="stat-card" key={stat.label}>
            <div className={`stat-label stat-label--${stat.tone}`}><img src={stat.icon} alt="" /> {stat.label}</div>
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
