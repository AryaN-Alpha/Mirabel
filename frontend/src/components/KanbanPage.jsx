import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2, NotebookPen, Plus } from "lucide-react";
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
import { getErrorMessage } from "../utils/errors";
import KanbanColumn from "./kanban/KanbanColumn";
import TaskModal from "./kanban/TaskModal";
import BraindumpPanel from "./kanban/BraindumpPanel";
import ProjectTabs from "./kanban/ProjectTabs";
import ProjectModal from "./kanban/ProjectModal";
import ConfirmDialog from "./kanban/ConfirmDialog";

export const cardStyle = {
  background: "linear-gradient(165deg, rgba(46,30,26,0.9), rgba(30,19,17,0.94))",
  border: "1px solid rgba(243,233,226,0.1)",
};

export const inputStyle = {
  background: "rgba(243,233,226,0.05)",
  border: "1px solid rgba(243,233,226,0.14)",
  color: "#f3e9e2",
};

const COLUMNS = [
  { id: "todo", label: "To Do" },
  { id: "in_progress", label: "In Progress" },
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

  const [showBraindump, setShowBraindump] = useState(false);
  const [modalTask, setModalTask] = useState(null); // null = closed, {} = new, {...} = edit
  const [modalStatus, setModalStatus] = useState("todo");

  const [projectModal, setProjectModal] = useState(null); // null = closed, {} = new, {...} = rename
  const [deletingProject, setDeletingProject] = useState(null);

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
      <div className="w-full flex items-center justify-center py-24" style={{ color: "rgba(243,233,226,0.5)" }}>
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.08em] mb-1" style={{ color: "rgba(243,233,226,0.4)" }}>
            Task Board
          </p>
          <p className="text-[15px]" style={{ color: "#f7ece4" }}>
            Kanban
          </p>
        </div>
        {selectedProjectId && (
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setShowBraindump((v) => !v)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-full text-[13px] border-none cursor-pointer"
              style={{ background: "rgba(243,233,226,0.1)", color: "#f3e9e2" }}
            >
              <NotebookPen size={14} strokeWidth={1.8} />
              Brain dump
            </button>
            <button
              onClick={() => openNewCard("todo")}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-full text-[13px] border-none cursor-pointer"
              style={{
                background: "linear-gradient(150deg, rgba(255,224,199,0.92), rgba(224,168,168,0.85))",
                color: "#2c1c16",
              }}
            >
              <Plus size={14} strokeWidth={1.8} />
              New card
            </button>
          </div>
        )}
      </div>

      <ProjectTabs
        projects={projects}
        selectedId={selectedProjectId}
        onSelect={selectProject}
        onNew={() => setProjectModal({})}
        onEdit={(project) => setProjectModal(project)}
        onDelete={(project) => setDeletingProject(project)}
      />

      {error && (
        <p className="text-[12px] px-1" style={{ color: "rgba(224,140,140,0.9)" }}>
          {error}
        </p>
      )}

      {!selectedProjectId ? (
        <div className="rounded-3xl p-8 flex flex-col items-center gap-2 text-center" style={cardStyle}>
          <p className="text-[13px]" style={{ color: "rgba(243,233,226,0.5)" }}>
            Create a project to start its board.
          </p>
        </div>
      ) : tasksLoading ? (
        <div className="flex items-center justify-center py-16" style={{ color: "rgba(243,233,226,0.5)" }}>
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : (
        <>
          {showBraindump && (
            <BraindumpPanel
              projectId={selectedProjectId}
              onAccept={(suggestion) => handleCreate({ ...suggestion, status: "todo", source: "ai" })}
            />
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {COLUMNS.map((col) => (
              <KanbanColumn
                key={col.id}
                status={col.id}
                label={col.label}
                tasks={columns[col.id]}
                onReorder={(orderedIds) => handleReorder(col.id, orderedIds)}
                onAddCard={() => openNewCard(col.id)}
                onEdit={(task) => {
                  setModalStatus(task.status);
                  setModalTask(task);
                }}
                onDelete={handleDelete}
              />
            ))}
          </div>
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
