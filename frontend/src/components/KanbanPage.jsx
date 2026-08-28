import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import {
  listKanbanProjects,
  createKanbanProject,
  updateKanbanProject,
  deleteKanbanProject,
  listKanbanTasks,
  createKanbanTask,
  updateKanbanTask,
  deleteKanbanTask,
  reorderKanbanColumn,
} from "../services/api";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates, arrayMove } from "@dnd-kit/sortable";
import { getErrorMessage } from "../utils/errors";
import { fontHeading, text, accent, space, cream } from "./homeTheme";
import { labelStyle, GhostLink, OutlineButton } from "./homeWidgets";
import KanbanColumn from "./kanban/KanbanColumn";
import { KanbanCardUI } from "./kanban/KanbanCard";
import TaskModal from "./kanban/TaskModal";
import BraindumpPanel from "./kanban/BraindumpPanel";
import ProjectTabs from "./kanban/ProjectTabs";
import ProjectModal from "./kanban/ProjectModal";
import ConfirmDialog from "./kanban/ConfirmDialog";

const COLUMNS = [
  { id: "todo", label: "To do" },
  { id: "in_progress", label: "In progress" },
  { id: "done", label: "Done" },
];

export default function KanbanPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [projects, setProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState(null);

  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [error, setError] = useState("");

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  const approachingTasks = useMemo(() => {
    const TWO_HOURS = 2 * 60 * 60 * 1000;
    return tasks.filter(t => {
      if (t.status === "done" || !t.due_date) return false;
      const [year, month, day] = t.due_date.split("-").map(Number);
      let hour = 23, min = 59, sec = 59;
      if (t.due_time) {
        const parts = t.due_time.split(":");
        hour = Number(parts[0]);
        min = Number(parts[1]);
        if (parts.length > 2) sec = Number(parts[2]);
        else sec = 0;
      }
      const due = new Date(year, month - 1, day, hour, min, sec, 999);
      const diff = due.getTime() - now;
      return diff > 0 && diff <= TWO_HOURS;
    });
  }, [tasks, now]);

  const [showBraindump, setShowBraindump] = useState(false);
  const [modalTask, setModalTask] = useState(null); // null = closed, {} = new, {...} = edit
  const [modalStatus, setModalStatus] = useState("todo");

  const [projectModal, setProjectModal] = useState(null); // null = closed, {} = new, {...} = rename
  const [deletingProject, setDeletingProject] = useState(null);

  const [activeTask, setActiveTask] = useState(null);
  const [activeWidth, setActiveWidth] = useState(null);
  // Offset of the cursor within the card at the moment dragging starts
  const [grabOffset, setGrabOffset] = useState({ x: 0, y: 0 });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragStart(event) {
    const { active, activatorEvent } = event;
    if (active.data.current?.type === "Task") {
      setActiveTask(active.data.current.task);
      const cardRect =
        active.rect.current?.initial ||
        (typeof document !== "undefined" &&
          document.querySelector(`[data-task-id="${active.id}"]`)?.getBoundingClientRect()) ||
        null;
      if (cardRect) {
        setActiveWidth(cardRect.width);
        // Capture where inside the card the user clicked so the overlay
        // stays anchored to that exact point instead of jumping to top-left.
        const pointerX = activatorEvent?.clientX ?? (cardRect.left + cardRect.width / 2);
        const pointerY = activatorEvent?.clientY ?? (cardRect.top + cardRect.height / 2);
        setGrabOffset({
          x: pointerX - cardRect.left,
          y: pointerY - cardRect.top,
        });
      }
    }
  }

  function handleDragOver(event) {
    const { active, over } = event;
    if (!over) return;
    
    const activeId = active.id;
    const overId = over.id;

    if (activeId === overId) return;

    const isActiveTask = active.data.current?.type === "Task";
    const isOverTask = over.data.current?.type === "Task";
    const isOverColumn = over.data.current?.type === "Column";

    if (!isActiveTask) return;

    setTasks((tasks) => {
      const activeIndex = tasks.findIndex((t) => t.id === activeId);
      const overIndex = tasks.findIndex((t) => t.id === overId);

      if (activeIndex === -1) return tasks;

      if (isOverColumn && tasks[activeIndex].status !== overId) {
        const newTasks = [...tasks];
        newTasks[activeIndex] = { ...newTasks[activeIndex], status: overId };
        return newTasks;
      }

      if (isOverTask && overIndex !== -1 && tasks[activeIndex].status !== tasks[overIndex].status) {
        const newTasks = [...tasks];
        newTasks[activeIndex] = { ...newTasks[activeIndex], status: tasks[overIndex].status };
        // We'll insert it at the correct index for smooth layout animation before DragEnd
        return arrayMove(newTasks, activeIndex, overIndex);
      }

      return tasks;
    });
  }

  function handleDragEnd(event) {
    setActiveTask(null);
    setActiveWidth(null);
    setGrabOffset({ x: 0, y: 0 });
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    if (activeId !== overId) {
      setTasks((tasks) => {
        const activeIndex = tasks.findIndex((t) => t.id === activeId);
        const overIndex = tasks.findIndex((t) => t.id === overId);
        
        let newTasks = tasks;
        if (activeIndex !== -1 && overIndex !== -1 && tasks[activeIndex].status === tasks[overIndex].status) {
           newTasks = arrayMove(tasks, activeIndex, overIndex);
        }
        
        // Find ordered IDs for the column we dropped into
        const droppedStatus = newTasks.find(t => t.id === activeId)?.status;
        if (droppedStatus) {
           const orderedIds = newTasks.filter(t => t.status === droppedStatus).map(t => t.id);
           handleReorder(droppedStatus, orderedIds);
        }

        return newTasks;
      });
    } else {
      // Even if activeId === overId, the status might have changed during DragOver.
      // So we should re-save the column it ended up in.
      const status = tasks.find(t => t.id === activeId)?.status;
      if (status) {
        const orderedIds = tasks.filter(t => t.status === status).map(t => t.id);
        handleReorder(status, orderedIds);
      }
    }
  }

  function selectProject(id) {
    setSelectedProjectId(id);
    const next = new URLSearchParams(searchParams);
    if (id) next.set("project", String(id));
    else next.delete("project");
    setSearchParams(next, { replace: true });
  }

  // Load projects once, then resolve the selected project from ?project=<id>
  // in the URL (falling back to the first project) so a refresh lands back
  // on the same board.
  useEffect(() => {
    let cancelled = false;
    listKanbanProjects()
      .then((data) => {
        if (cancelled) return;
        setProjects(data.projects);
        const fromUrl = Number(searchParams.get("project"));
        const match = data.projects.find((p) => p.id === fromUrl);
        const initialId = match ? match.id : (data.projects[0]?.id ?? null);
        setSelectedProjectId(initialId);
        if (initialId && initialId !== fromUrl) {
          const next = new URLSearchParams(searchParams);
          next.set("project", String(initialId));
          setSearchParams(next, { replace: true });
        }
      })
      .catch((err) => setError(getErrorMessage(err, "Couldn't load projects. Is the backend running?")))
      .finally(() => {
        if (!cancelled) setProjectsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Intentionally run once — selectProject() handles subsequent URL syncs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadTasks(projectId) {
    if (!projectId) {
      setTasks([]);
      return;
    }
    setTasksLoading(true);
    setError("");
    return listKanbanTasks(projectId)
      .then((data) => setTasks(data.tasks))
      .catch((err) => setError(getErrorMessage(err, "Couldn't load tasks.")))
      .finally(() => setTasksLoading(false));
  }

  useEffect(() => {
    loadTasks(selectedProjectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId]);

  const columns = useMemo(() => {
    const byStatus = { todo: [], in_progress: [], done: [] };
    for (const t of tasks) {
      if (byStatus[t.status]) byStatus[t.status].push(t);
    }
    for (const key of Object.keys(byStatus)) {
      byStatus[key].sort((a, b) => a.position - b.position);
    }
    return byStatus;
  }, [tasks]);

  async function handleReorder(status, orderedIds) {
    setTasks((prev) => {
      const byId = new Map(prev.map((t) => [t.id, t]));
      orderedIds.forEach((id, position) => {
        const t = byId.get(id);
        if (t) {
          t.status = status;
          t.position = position;
        }
      });
      return [...prev];
    });
    try {
      await reorderKanbanColumn(selectedProjectId, status, orderedIds);
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't save that move."));
      loadTasks(selectedProjectId);
    }
  }

  async function handleCreate(payload) {
    const created = await createKanbanTask(selectedProjectId, payload);
    setTasks((prev) => [...prev, created]);
    return created;
  }

  async function handleUpdate(id, payload) {
    const updated = await updateKanbanTask(selectedProjectId, id, payload);
    setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    return updated;
  }

  async function handleDelete(id) {
    try {
      await deleteKanbanTask(selectedProjectId, id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't delete that card."));
    }
  }

  function openNewCard(status) {
    setModalStatus(status);
    setModalTask({});
  }

  async function handleSaveProject(payload) {
    if (projectModal?.id) {
      const updated = await updateKanbanProject(projectModal.id, payload);
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    } else {
      const created = await createKanbanProject(payload);
      setProjects((prev) => [...prev, created]);
      selectProject(created.id);
    }
    setProjectModal(null);
  }

  async function handleDeleteProject() {
    const project = deletingProject;
    await deleteKanbanProject(project.id);
    const remaining = projects.filter((p) => p.id !== project.id);
    setProjects(remaining);
    if (project.id === selectedProjectId) {
      selectProject(remaining[0]?.id ?? null);
    }
    setDeletingProject(null);
  }

  if (projectsLoading) {
    return (
      <div className="w-full flex items-center justify-center" style={{ padding: `${space[8] * 2.5}px 0`, color: cream(0.4) }}>
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  return (
    <div style={{ animation: "home-rise 1s cubic-bezier(.2,.7,.2,1) .08s both" }}>
      <div
        className="flex items-baseline justify-between flex-wrap"
        style={{
          gap: space[6],
          marginTop: space[8] * 1.5,
          paddingBottom: space[5] ?? 23,
          borderBottom: `1px solid ${accent[400]}73`,
        }}
      >
        <div>
          <div style={labelStyle}>Task board · {selectedProject?.name || "—"}</div>
          <div style={{ fontFamily: fontHeading, fontSize: "clamp(28px,3.2vw,42px)", color: text.bright, marginTop: space[2] }}>
            Kanban
          </div>
        </div>
        {selectedProjectId && (
          <div className="flex items-center" style={{ gap: space[5] ?? 23 }}>
            <GhostLink onClick={() => setProjectModal({})} muted>
              New project
            </GhostLink>
            <GhostLink onClick={() => setShowBraindump((v) => !v)}>Brain dump</GhostLink>
            <OutlineButton onClick={() => openNewCard("todo")}>New card</OutlineButton>
          </div>
        )}
      </div>

      <div style={{ marginTop: space[6] }}>
        <ProjectTabs
          projects={projects}
          selectedId={selectedProjectId}
          onSelect={selectProject}
          onNew={() => setProjectModal({})}
          onEdit={(project) => setProjectModal(project)}
          onDelete={(project) => setDeletingProject(project)}
        />
      </div>

      {error && <p style={{ fontSize: 12, marginTop: space[4], color: "rgba(224,140,140,0.9)" }}>{error}</p>}

      {approachingTasks.length > 0 && (
        <div
          style={{
            marginTop: space[4],
            padding: space[4],
            background: "rgba(224,140,140,0.1)",
            border: "1px solid rgba(224,140,140,0.3)",
            borderRadius: 6,
            color: "rgba(224,140,140,0.95)",
            fontSize: 14,
          }}
        >
          <strong style={{ fontWeight: 600 }}>Reminder:</strong> You have {approachingTasks.length} task{approachingTasks.length > 1 ? "s" : ""} due in less than 2 hours: {approachingTasks.map(t => t.title).join(", ")}.
        </div>
      )}

      {!selectedProjectId ? (
        <p style={{ marginTop: space[8], fontSize: 15, color: cream(0.5) }}>Create a project to start its board.</p>
      ) : tasksLoading ? (
        <div className="w-full flex items-center justify-center" style={{ padding: `${space[8] * 1.5}px 0`, color: cream(0.4) }}>
          <Loader2 size={18} className="animate-spin" />
        </div>
      ) : (
        <>
          {showBraindump && (
            <div style={{ marginTop: space[6] }}>
              <BraindumpPanel
                projectId={selectedProjectId}
                onAccept={(suggestion) => handleCreate({ ...suggestion, status: "todo", source: "ai" })}
              />
            </div>
          )}

          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div className="grid grid-cols-1 md:grid-cols-3" style={{ marginTop: space[8] * 1.1 }}>
              {COLUMNS.map((col, i) => (
                <KanbanColumn
                  key={col.id}
                  status={col.id}
                  label={col.label}
                  tasks={columns[col.id]}
                  first={i === 0}
                  last={i === COLUMNS.length - 1}
                  onAddCard={() => openNewCard(col.id)}
                  onEdit={(task) => {
                    setModalStatus(task.status);
                    setModalTask(task);
                  }}
                  onDelete={handleDelete}
                />
              ))}
            </div>
            
            <DragOverlay dropAnimation={null}>
              {activeTask ? (
                // translateX/Y shift the overlay so the grab point stays
                // under the cursor rather than the card jumping to top-left.
                <div style={{
                  width: activeWidth ? `${activeWidth}px` : "100%",
                  pointerEvents: "none",
                  transform: `translate(${-grabOffset.x}px, ${-grabOffset.y}px)`,
                  transformOrigin: "top left",
                }}>
                  <KanbanCardUI task={activeTask} isOverlay />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </>
      )}

      {modalTask !== null && (
        <TaskModal
          task={modalTask}
          defaultStatus={modalStatus}
          onClose={() => setModalTask(null)}
          onSave={async (payload) => {
            if (modalTask.id) {
              await handleUpdate(modalTask.id, payload);
            } else {
              await handleCreate(payload);
            }
            setModalTask(null);
          }}
        />
      )}

      {projectModal !== null && (
        <ProjectModal project={projectModal} onClose={() => setProjectModal(null)} onSave={handleSaveProject} />
      )}

      {deletingProject && (
        <ConfirmDialog
          title={`Delete "${deletingProject.name}"?`}
          message="This deletes the project and every task on its board. This can't be undone."
          confirmLabel="Delete project"
          onCancel={() => setDeletingProject(null)}
          onConfirm={handleDeleteProject}
        />
      )}
    </div>
  );
}
