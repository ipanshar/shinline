import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { Html5Qrcode } from 'html5-qrcode';
import { useUser } from '@/components/UserContext';
import CustomTaskCard, { Task } from './userTaskCard';

const scannerId = "qr-reader";

const UserTasks = () => {
  const { user } = useUser();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [qrResult, setQrResult] = useState<string | null>(null);
  const qrScanner = useRef<Html5Qrcode | null>(null);
  const userId = user?.id;

  // Загрузка задач
  useEffect(() => {
    if (!user) return;

    axios.post('/task/gettasks')
      .then(response => {
        const allTasks = response.data.data;
        if (Array.isArray(allTasks)) {
          const userTasks = allTasks.filter((task: Task) => task.user_id === user.id);
          setTasks(userTasks);
        } else {
          console.error('Неверный формат данных:', allTasks);
        }
      })
      .catch(err => {
        console.error('Ошибка при получении задач:', err);
      })
      .finally(() => setLoading(false));
  }, [user]);

  // Запуск сканера после выбора задачи
  useEffect(() => {
    if (!selectedTaskId) return;

    const timeout = setTimeout(() => {
      startScan(selectedTaskId);
    }, 300); // ждём появления DOM

    return () => clearTimeout(timeout);
  }, [selectedTaskId]);

  // Запуск камеры
  const startScan = async (taskId: number) => {
    setQrResult(null);

    if (!qrScanner.current) {
      qrScanner.current = new Html5Qrcode(scannerId);
    }

    try {
      await qrScanner.current.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 250 },
        (decodedText) => {
          qrScanner.current?.stop().then(() => qrScanner.current?.clear());
          handleQrSubmit(decodedText, taskId);
        },
        () => {}
      );
    } catch (err) {
      console.error("Ошибка при запуске сканера:", err);
    }
  };

  // Обработка результата
  const handleQrSubmit = (qr: string, taskId: number) => {
    axios.post('/task/qrproccesing', {
      qr,
      task_id: taskId,
      user_id: userId
    }).then(res => {
      setQrResult(res.data.message || 'QR успешно обработан!');
    }).catch(err => {
      setQrResult('Ошибка: ' + (err.response?.data?.message || err.message) + '\nqr code:' + qr);
    });
  };

  // Закрыть сканер
  const closeScanner = () => {
    setSelectedTaskId(null);
    qrScanner.current?.stop().then(() => qrScanner.current?.clear());
  };

  if (loading) return <p>Загрузка задач...</p>;

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Мои задачи</h2>

      {tasks.map(task => (
        <CustomTaskCard
          key={task.id}
          task={{
            ...task,
            onScanClick: () => setSelectedTaskId(task.id),
          }}
        />
      ))}

      {selectedTaskId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
        >      
          <div className="bg-white rounded-lg p-6 w-full max-w-md relative shadow-lg">
            <button
              onClick={closeScanner}
              className="absolute top-3 right-4 text-gray-500 hover:text-red-600 text-2xl font-bold"
              title="Закрыть"
            >
              ×
            </button>

            <h3 className="text-lg font-semibold text-center text-blue-700 mb-4">
              Сканирование QR для задачи #{selectedTaskId}
            </h3>

            <div id={scannerId} className="w-full aspect-square border-2 border-dashed rounded-md" />

            {qrResult && (
              <p className="mt-4 text-center text-green-600 font-medium">
                ✅ {qrResult}
              </p>
            )}
          </div>
        </div>
      )}


    </div>
  );
};

export default UserTasks;
