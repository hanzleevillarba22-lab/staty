import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  FolderKanban,
  Loader2,
  Plus,
  Search,
  StickyNote,
  Trash2,
} from 'lucide-react';
import { projectsApi } from '../lib/api.ts';
import type { NavRoute, ResearchProject } from '../types/index.ts';

interface ProjectsViewProps {
  onProjectsChanged: () => void;
  onNavigate: (route: NavRoute) => void;
}

export const ProjectsView: React.FC<ProjectsViewProps> = ({
  onProjectsChanged,
  onNavigate,
}) => {
  const [projects, setProjects] = useState<ResearchProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'updated' | 'title'>('updated');
  const [error, setError] = useState<string | null>(null);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [researchQuestion, setResearchQuestion] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Selected project workspace detail
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof projectsApi.getDetail>> | null>(
    null,
  );
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await projectsApi.list(search, sort);
      setProjects(res.projects);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load projects.');
    } finally {
      setLoading(false);
    }
  }, [search, sort]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    const handler = () => {
      loadProjects();
    };
    window.addEventListener('statlytics:workspace-updated', handler);
    return () => window.removeEventListener('statlytics:workspace-updated', handler);
  }, [loadProjects]);

  const openProject = async (id: number) => {
    setSelectedId(id);
    try {
      const d = await projectsApi.getDetail(id);
      setDetail(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to open project.');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 2) {
      setError('Project title must be at least 2 characters.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await projectsApi.create({
        title: title.trim(),
        description: description.trim(),
        researchQuestion: researchQuestion.trim(),
      });
      setTitle('');
      setDescription('');
      setResearchQuestion('');
      setShowCreate(false);
      await loadProjects();
      onProjectsChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    await projectsApi.remove(id);
    if (selectedId === id) {
      setSelectedId(null);
      setDetail(null);
    }
    await loadProjects();
    onProjectsChanged();
  };

  const handleRenameSubmit = async (e: React.FormEvent, projId: number) => {
    e.preventDefault();
    if (renameDraft.trim().length < 2) return;
    await projectsApi.update(projId, { title: renameDraft.trim() });
    setRenamingId(null);
    await loadProjects();
    if (selectedId === projId) openProject(projId);
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId || !noteContent.trim()) return;
    await projectsApi.addNote(selectedId, {
      title: noteTitle.trim() || 'Research Note',
      content: noteContent.trim(),
    });
    setNoteTitle('');
    setNoteContent('');
    openProject(selectedId);
  };

  if (selectedId && detail) {
    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={() => {
            setSelectedId(null);
            setDetail(null);
          }}
          className="min-h-[44px] inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-[#173B75] dark:hover:text-white cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to All Projects</span>
        </button>

        <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl font-bold text-[#173B75] dark:text-white">
                {detail.project.title}
              </h1>
              {detail.project.research_question && (
                <p className="mt-2 text-sm text-[#2563EB] dark:text-blue-400 font-medium">
                  Research Question: {detail.project.research_question}
                </p>
              )}
              {detail.project.description && (
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  {detail.project.description}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onNavigate('data-analysis')}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-[#2563EB] text-white text-xs font-semibold cursor-pointer"
              >
                Upload / Create Dataset
              </button>
              <button
                type="button"
                onClick={() => onNavigate('statistical-tests')}
                className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Run Statistical Test
              </button>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
            <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white mb-3">
              Linked Datasets ({detail.datasets.length})
            </h2>
            {detail.datasets.length === 0 ? (
              <p className="text-xs text-slate-500">No datasets linked to this project yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {detail.datasets.map((d) => (
                  <li key={d.id} className="py-2 flex items-center justify-between">
                    <span className="truncate font-medium">{d.name}</span>
                    <span className="font-mono text-xs text-slate-500">{d.row_count} rows</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
            <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white mb-3">
              Linked Analyses ({detail.analyses.length})
            </h2>
            {detail.analyses.length === 0 ? (
              <p className="text-xs text-slate-500">No analyses saved in this project yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {detail.analyses.map((a) => (
                  <li key={a.id} className="py-2 flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{a.title}</span>
                    <span className="text-xs text-slate-500 shrink-0">{a.procedure_name}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
            <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white mb-3">
              Linked Reports ({detail.reports.length})
            </h2>
            {detail.reports.length === 0 ? (
              <p className="text-xs text-slate-500">No reports generated for this project yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {detail.reports.map((r) => (
                  <li key={r.id} className="py-2 flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{r.title}</span>
                    <span className="text-xs uppercase font-mono text-slate-500">{r.format}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Research Notes */}
        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6">
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
            <StickyNote className="w-4 h-4 text-[#2563EB]" />
            <span>Research Notes</span>
          </h2>

          <form onSubmit={handleAddNote} className="space-y-3 mb-6">
            <input
              type="text"
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              placeholder="Note title (optional)"
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
            <textarea
              rows={3}
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder="Record methodology observations, inclusion criteria, or interpretation notes..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
            <button
              type="submit"
              className="min-h-[44px] px-5 py-2 rounded-xl bg-[#173B75] text-white text-xs font-semibold cursor-pointer"
            >
              Add Research Note
            </button>
          </form>

          {detail.notes.length === 0 ? (
            <p className="text-xs text-slate-500">No notes yet.</p>
          ) : (
            <div className="space-y-3">
              {detail.notes.map((n) => (
                <div
                  key={n.id}
                  className="rounded-xl bg-[#F8FAFC] dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-4 flex items-start justify-between gap-4"
                >
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{n.title}</h3>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                      {n.content}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await projectsApi.deleteNote(selectedId, n.id);
                      openProject(selectedId);
                    }}
                    className="p-2 text-slate-400 hover:text-red-600 cursor-pointer"
                    aria-label="Delete note"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#173B75] dark:text-white">
            Research Projects
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Organize datasets, statistical analyses, reports, and notes inside structured workspaces.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="min-h-[44px] px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer whitespace-nowrap self-start"
        >
          <Plus className="w-4 h-4" />
          <span>New Research Project</span>
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4"
        >
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
            Create Research Project
          </h2>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Project Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Effect of Inquiry-Based STEM Labs on Physics Scores"
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Primary Research Question
            </label>
            <input
              type="text"
              value={researchQuestion}
              onChange={(e) => setResearchQuestion(e.target.value)}
              placeholder="e.g., Does teaching method significantly affect post-test scores?"
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Description
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short summary of study population, design, and variables..."
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-[#2563EB] text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>Create Project</span>
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Search & Sort Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects by title or research question..."
            className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value === 'title' ? 'title' : 'updated')}
          className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
          aria-label="Sort projects"
        >
          <option value="updated">Sort: Recently Updated</option>
          <option value="title">Sort: Title (A–Z)</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-8">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Loading projects...</span>
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-10 text-center">
          <FolderKanban className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
            No research projects yet
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Create your first research project to group related datasets, analyses, reports, and study notes together.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {projects.map((proj) => (
            <div
              key={proj.id}
              className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between gap-4"
            >
              <div>
                <button
                  type="button"
                  onClick={() => openProject(proj.id)}
                  className="text-left font-display text-lg font-bold text-[#173B75] dark:text-white hover:text-[#2563EB] cursor-pointer"
                >
                  {proj.title}
                </button>
                {proj.research_question && (
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                    {proj.research_question}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-mono tabular-nums">{proj.dataset_count ?? 0} datasets</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">{proj.analysis_count ?? 0} analyses</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">{proj.report_count ?? 0} reports</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => openProject(proj.id)}
                  className="min-h-[40px] px-4 py-1.5 rounded-xl bg-[#2563EB] text-white text-xs font-semibold cursor-pointer"
                >
                  Open Workspace
                </button>
                <div className="flex items-center gap-2">
                  {renamingId === proj.id ? (
                    <form
                      onSubmit={(e) => handleRenameSubmit(e, proj.id)}
                      className="flex items-center gap-1.5"
                    >
                      <input
                        type="text"
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        aria-label="New project title"
                        className="min-h-[38px] px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                      />
                      <button
                        type="submit"
                        className="min-h-[38px] px-3 py-1 rounded-xl bg-[#2563EB] text-white text-xs font-semibold cursor-pointer"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setRenamingId(null)}
                        className="min-h-[38px] px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs cursor-pointer"
                      >
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setRenamingId(proj.id);
                        setRenameDraft(proj.title);
                      }}
                      className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer"
                    >
                      Rename
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(proj.id)}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
