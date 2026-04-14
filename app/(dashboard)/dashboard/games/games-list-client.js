"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useUser } from "../dashboard-client";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/dashboard/api-client";
import { SkeletonTableRows } from "@/components/skeleton";
import { IconGripVertical, IconTrash } from "@/components/icons";

function rowKey(g) {
  return g.id;
}

function reorderList(list, fromIndex, toIndex) {
  if (fromIndex === toIndex) return list;
  const next = [...list];
  const [removed] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, removed);
  return next;
}

export default function GamesListClient() {
  const user = useUser();
  const toast = useToast();
  const perm = new Set(user?.permissions || []);
  const canManage = perm.has("manage_games_list");

  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [draggingIndex, setDraggingIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const dragSourceIndex = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/dashboard/favorite-games");
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Failed to load games", "error");
        setGames([]);
        return;
      }
      const list = Array.isArray(data.games) ? data.games : [];
      setGames(list);
      const d = {};
      for (const g of list) {
        d[rowKey(g)] = { name: g.name, is_active: g.is_active };
      }
      setDrafts(d);
    } catch {
      toast("Failed to load games", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (canManage) load();
  }, [canManage, load]);

  const setDraft = (id, partial) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...partial },
    }));
  };

  const persistOrder = useCallback(
    async (orderedIds) => {
      setReordering(true);
      try {
        const res = await apiFetch("/api/dashboard/favorite-games", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ordered_ids: orderedIds }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast(data.error || "Could not save order", "error");
          await load();
          return;
        }
        if (Array.isArray(data.games)) {
          setGames(data.games);
          setDrafts((prev) => {
            const out = { ...prev };
            for (const g of data.games) {
              const id = rowKey(g);
              const existing = out[id];
              out[id] = {
                name: existing?.name ?? g.name,
                is_active: existing?.is_active ?? g.is_active,
              };
            }
            return out;
          });
        } else {
          await load();
        }
        toast("Order saved", "success");
      } catch {
        toast("Could not save order", "error");
        await load();
      } finally {
        setReordering(false);
      }
    },
    [toast, load]
  );

  const saveRow = async (id) => {
    const d = drafts[id];
    if (!d) return;
    setSavingId(id);
    try {
      const res = await apiFetch("/api/dashboard/favorite-games", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          name: d.name.trim(),
          is_active: d.is_active,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Save failed", "error");
        return;
      }
      toast("Saved", "success");
      await load();
    } catch {
      toast("Save failed", "error");
    } finally {
      setSavingId(null);
    }
  };

  const deleteGame = async (id) => {
    const name = drafts[id]?.name ?? games.find((g) => g.id === id)?.name ?? "this game";
    if (!window.confirm(`Delete “${name}” from the catalog? Existing leads keep their saved text.`)) return;
    setDeletingId(id);
    try {
      const res = await apiFetch(`/api/dashboard/favorite-games?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data.error || "Delete failed", "error");
        return;
      }
      toast("Game removed", "success");
      await load();
    } catch {
      toast("Delete failed", "error");
    } finally {
      setDeletingId(null);
    }
  };

  const addGame = async () => {
    const name = newName.trim();
    if (name.length < 1) {
      toast("Enter a game name.", "error");
      return;
    }
    setAdding(true);
    try {
      const res = await apiFetch("/api/dashboard/favorite-games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Could not add game", "error");
        return;
      }
      toast("Game added", "success");
      setNewName("");
      await load();
    } catch {
      toast("Could not add game", "error");
    } finally {
      setAdding(false);
    }
  };

  const handleDragStart = (e, index) => {
    if (reordering) {
      e.preventDefault();
      return;
    }
    dragSourceIndex.current = index;
    setDraggingIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
  };

  const handleDragEnd = () => {
    dragSourceIndex.current = null;
    setDraggingIndex(null);
    setDragOverIndex(null);
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
  };

  const handleRowDragLeave = (e) => {
    const related = e.relatedTarget;
    if (related instanceof Node && e.currentTarget.contains(related)) return;
    setDragOverIndex(null);
  };

  const handleDrop = (e, toIndex) => {
    e.preventDefault();
    const from = dragSourceIndex.current;
    handleDragEnd();
    if (from == null || from === toIndex || reordering) return;
    const next = reorderList(games, from, toIndex);
    setGames(next);
    void persistOrder(next.map((g) => g.id));
  };

  if (!canManage) {
    return (
      <div className="p-6 lg:p-8">
        <p className="text-sm text-ink-2">You do not have permission to manage the games list.</p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm text-accent underline">
          Back to Leads
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 border-b border-surface-3/50 bg-surface-1 px-4 py-3 sm:px-6 sm:py-4 lg:px-7">
        <h2 className="text-base font-bold tracking-tight sm:text-lg">Games list</h2>
        <p className="mt-1 max-w-2xl text-xs text-ink-4">
          Names and order appear in the public survey dropdown (active games only). Drag the grip to change order.
          Inactive games stay in the database for existing lead references but are hidden from new submissions.
          Deleting removes a row from the catalog only (lead history is unchanged).
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-7">
        <div className="card overflow-hidden">
          <div className="border-b border-surface-3 px-4 py-3 sm:px-5">
            <h3 className="text-sm font-semibold">Favorite games</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="w-12 text-center">
                    <span className="sr-only">Reorder</span>
                  </th>
                  <th>Name</th>
                  <th>Active</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <SkeletonTableRows rows={6} cols={4} />
                ) : games.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-sm text-ink-4">
                      No games yet. Add one below.
                    </td>
                  </tr>
                ) : (
                  games.map((g, index) => {
                    const id = rowKey(g);
                    const d = drafts[id] || { name: g.name, is_active: g.is_active };
                    const isDragOver = dragOverIndex === index && draggingIndex !== index;
                    return (
                      <tr
                        key={id}
                        className={`${draggingIndex === index ? "opacity-50" : ""} ${
                          isDragOver ? "bg-accent/5 ring-1 ring-inset ring-accent/30" : ""
                        }`}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDragLeave={handleRowDragLeave}
                        onDrop={(e) => handleDrop(e, index)}
                      >
                        <td className="w-12 text-center align-middle">
                          <button
                            type="button"
                            className="inline-flex cursor-grab touch-none items-center justify-center rounded-md p-1.5 text-ink-4 hover:bg-surface-3/80 hover:text-ink-2 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
                            draggable={!reordering}
                            aria-label={`Drag to reorder: ${d.name || g.name}`}
                            title="Drag to reorder"
                            disabled={reordering}
                            onDragStart={(e) => handleDragStart(e, index)}
                            onDragEnd={handleDragEnd}
                          >
                            <IconGripVertical size={18} />
                          </button>
                        </td>
                        <td>
                          <input
                            className="input max-w-xs"
                            value={d.name}
                            onChange={(e) => setDraft(id, { name: e.target.value })}
                            disabled={reordering}
                          />
                        </td>
                        <td>
                          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-2">
                            <input
                              type="checkbox"
                              checked={Boolean(d.is_active)}
                              onChange={(e) => setDraft(id, { is_active: e.target.checked })}
                              className="h-4 w-4 rounded border-surface-4 accent-accent"
                              disabled={reordering}
                            />
                            {d.is_active ? "Shown in survey" : "Hidden"}
                          </label>
                        </td>
                        <td>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              disabled={reordering || savingId === id || deletingId === id}
                              onClick={() => saveRow(id)}
                            >
                              {savingId === id ? "Saving…" : "Save"}
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm gap-1 text-danger hover:bg-danger-muted hover:text-danger"
                              disabled={reordering || savingId === id || deletingId === id}
                              title="Delete from catalog"
                              aria-label={`Delete ${d.name || g.name}`}
                              onClick={() => deleteGame(id)}
                            >
                              <IconTrash size={14} />
                              {deletingId === id ? "…" : "Delete"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="border-t border-surface-3 px-4 py-4 sm:px-5">
            <div className="text-xs font-semibold uppercase tracking-wider text-ink-4">Add game</div>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <label className="label">Display name</label>
                <input
                  className="input"
                  placeholder="e.g. Juwa"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  disabled={reordering}
                />
              </div>
              <button
                type="button"
                className="btn btn-primary sm:mb-0.5"
                disabled={adding || reordering}
                onClick={addGame}
              >
                {adding ? "Adding…" : "Add game"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
