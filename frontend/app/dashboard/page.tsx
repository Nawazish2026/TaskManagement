'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { api, ApiError } from '@/lib/api';
import { TaskForm, Task } from '@/components/TaskForm';

export default function DashboardPage() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  
  // Pagination & Filtering
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  // Add debounced search state to prevent too many API calls
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Editor Modal State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  // Handle Search Debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // Reset to page 1 on new search
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  // Load Tasks
  const loadTasks = useCallback(async () => {
    if (!isAuthenticated) return;
    
    setLoadingTasks(true);
    let url = `/tasks?page=${page}&limit=10`;
    if (statusFilter) url += `&status=${statusFilter}`;
    if (debouncedSearch) url += `&search=${encodeURIComponent(debouncedSearch)}`;

    try {
      const data = await api.get(url);
      setTasks(data.tasks);
      setTotalPages(data.pagination.totalPages || 1);
    } catch (error) {
      if (error instanceof ApiError) {
        showToast(error.message, 'error');
      } else {
        showToast('Failed to load tasks', 'error');
      }
    } finally {
      setLoadingTasks(false);
    }
  }, [page, statusFilter, debouncedSearch, isAuthenticated, showToast]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const handleCreateOrUpdate = async (taskData: Partial<Task>) => {
    try {
      if (editingTask) {
        await api.patch(`/tasks/${editingTask.id}`, taskData);
        showToast('Task updated successfully', 'success');
      } else {
        await api.post('/tasks', taskData);
        showToast('Task created successfully', 'success');
      }
      setIsFormOpen(false);
      setEditingTask(null);
      loadTasks();
    } catch (error) {
      if (error instanceof ApiError) {
        showToast(error.message, 'error');
      } else {
        showToast('Failed to save task', 'error');
      }
      throw error; // Let the form know it failed
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this task?')) return;
    
    try {
      await api.delete(`/tasks/${id}`);
      showToast('Task deleted', 'success');
      // Adjust pagination if needed, or simply reload
      if (tasks.length === 1 && page > 1) {
        setPage(page - 1);
      } else {
        loadTasks();
      }
    } catch (error) {
       showToast('Failed to delete task', 'error');
    }
  };

  const handleToggle = async (id: number) => {
    try {
      // Optimistic update
      setTasks(tasks.map(t => {
        if (t.id === id) {
           const nextStatus = t.status === 'PENDING' ? 'IN_PROGRESS' : 
                              t.status === 'IN_PROGRESS' ? 'COMPLETED' : 'PENDING';
           return { ...t, status: nextStatus };
        }
        return t;
      }));
      
      const res = await api.patch(`/tasks/${id}/toggle`);
      // Update with server actual response
      setTasks(prev => prev.map(t => t.id === id ? res.task : t));
      showToast('Task status updated', 'success');
    } catch (error) {
      showToast('Failed to update status', 'error');
      loadTasks(); // Revert optimistic update
    }
  };

  if (isLoading || !isAuthenticated) return null; // Avoid flicker

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-center mb-10 gap-4 glass-card p-6">
        <div>
          <h1 className="text-3xl font-bold">My Tasks</h1>
          <p className="text-slate-400 mt-1">Hello, {user?.name}</p>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={() => { setEditingTask(null); setIsFormOpen(true); }}
            className="btn btn-primary"
          >
            + New Task
          </button>
          <button onClick={logout} className="btn bg-slate-700 hover:bg-slate-600">
            Logout
          </button>
        </div>
      </header>

      {/* Filters and Search */}
      <div className="flex flex-col md:flex-row gap-4 mb-8">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search tasks by title..."
            className="input-field w-full max-w-md"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div>
          <select 
            className="input-field min-w-[200px]"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          >
            <option value="">All Statuses</option>
            <option value="PENDING">Pending</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
          </select>
        </div>
      </div>

      {/* Task List */}
      <div className="space-y-4">
        {loadingTasks ? (
          <div className="text-center py-10 text-slate-400">Loading tasks...</div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-20 glass-card">
            <h3 className="text-xl font-medium mb-2">No tasks found</h3>
            <p className="text-slate-400">Create a new task to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tasks.map((task) => (
              <div key={task.id} className="glass-card p-5 flex flex-col transition-transform hover:-translate-y-1 duration-200">
                <div className="flex justify-between items-start mb-3">
                  <h3 className="font-semibold text-lg line-clamp-2">{task.title}</h3>
                  <button 
                    onClick={() => handleToggle(task.id)}
                    className={`badge border text-xs cursor-pointer hover:opacity-80 transition-opacity ${
                      task.status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
                      task.status === 'IN_PROGRESS' ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' :
                      'bg-amber-500/20 text-amber-300 border-amber-500/30'
                    }`}
                  >
                    <span className={`status-dot status-${task.status}`}></span>
                    {task.status.replace('_', ' ')}
                  </button>
                </div>
                
                <p className="text-slate-400 text-sm mb-4 flex-grow line-clamp-3">
                  {task.description || 'No description provided.'}
                </p>
                
                <div className="flex justify-between items-center text-xs text-slate-500 mb-4 border-t border-white/5 pt-4">
                  <span>Due: {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'None'}</span>
                  <span className={`font-medium ${
                    task.priority === 'HIGH' ? 'text-red-400' :
                    task.priority === 'MEDIUM' ? 'text-orange-300' :
                    'text-green-400'
                  }`}>
                    {task.priority} Priority
                  </span>
                </div>

                <div className="flex justify-end gap-2 mt-auto">
                  <button 
                    onClick={() => { setEditingTask(task); setIsFormOpen(true); }}
                    className="btn px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-sm"
                  >
                    Edit
                  </button>
                  <button 
                    onClick={() => handleDelete(task.id)}
                    className="btn btn-danger px-3 py-1.5 text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      {!loadingTasks && totalPages > 1 && (
        <div className="flex justify-center items-center gap-4 mt-10">
          <button 
            className="btn bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            ← Previous
          </button>
          <span className="text-slate-300">
            Page {page} of {totalPages}
          </span>
          <button 
            className="btn bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            Next →
          </button>
        </div>
      )}

      {/* Form Modal */}
      <TaskForm
        task={editingTask}
        isOpen={isFormOpen}
        onClose={() => { setIsFormOpen(false); setEditingTask(null); }}
        onSubmit={handleCreateOrUpdate}
      />
    </div>
  );
}
