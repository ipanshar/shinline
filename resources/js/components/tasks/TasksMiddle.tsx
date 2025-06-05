import React, { useEffect, useState } from 'react';
import axios from 'axios';
import TaskTable from './TaskTable';
import { Task } from './types';
import AddTaskModal from './AddTaskModal';

const TasksMiddle: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [isModalOpen, setIsModalOpen] = useState(false);

  const userStr = sessionStorage.getItem('user');
  let isSupplier = false;

  if (userStr) {
    try {
      const user = JSON.parse(userStr);
      isSupplier = Array.isArray(user.roles) && user.roles.includes('Снабженец');
    } catch (err) {
      console.error('Ошибка парсинга user из sessionStorage:', err);
    }
  }

  const fetchTasks = (pageNum: number) => {
    setLoading(true);
    setError(null);
    axios.post('/task/gettasks', { page: pageNum })
      .then(response => {
        if (response.data.status) {
          setTasks(response.data.data.tasks || response.data.data);
          setTotalPages(response.data.data.totalPages || 1);
        } else {
          setError('Ошибка при загрузке задач');
          setTasks([]);
        }
      })
      .catch(err => {
        setError(err.message || 'Ошибка запроса');
        setTasks([]);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchTasks(page);
  }, [page]);

  const goPrev = () => setPage((p) => Math.max(1, p - 1));
  const goNext = () => setPage((p) => Math.min(totalPages, p + 1));

  return (
    <div className='p-5'>
      {isSupplier && (
        <div className="mb-4">
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Добавить
          </button>
        </div>
      )}

      {loading && <div>Загрузка задач...</div>}
      {error && <div className="text-red-600">Ошибка: {error}</div>}
      {!loading && !error && tasks.length === 0 && <div>Задачи не найдены</div>}

      {!loading && !error && tasks.length > 0 && <TaskTable tasks={tasks} />}

      <div className="mt-4 flex items-center justify-center space-x-4">
        <button
          onClick={goPrev}
          disabled={page === 1 || loading}
          className={`px-4 py-2 rounded border ${
            page === 1 || loading
              ? 'bg-gray-200 cursor-not-allowed'
              : 'bg-white hover:bg-gray-100'
          }`}
        >
          Назад
        </button>

        <span className="text-gray-700">
          Страница {page} из {totalPages}
        </span>

        <button
          onClick={goNext}
          disabled={page === totalPages || loading}
          className={`px-4 py-2 rounded border ${
            page === totalPages || loading
              ? 'bg-gray-200 cursor-not-allowed'
              : 'bg-white hover:bg-gray-100'
          }`}
        >
          Вперед
        </button>
      </div>

      <AddTaskModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
};

export default TasksMiddle;
