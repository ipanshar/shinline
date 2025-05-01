import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { Html5Qrcode } from 'html5-qrcode';
import { useUser } from '@/components/UserContext';

const scannerId = "qr-reader";

interface Task {
  id: number;
  name: string;
  status_id: number;
  plan_date: string;
  description: string;
  user_id: number;
}

const UserTasks = () => {
  const { user } = useUser();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [qrResult, setQrResult] = useState<string | null>(null);
  const qrScanner = useRef<Html5Qrcode | null>(null);
const userId = user?.id
  useEffect(() => {
    if (!user) return;
    console.log(selectedTaskId)
    axios.post('/task/gettasks')
      .then(response => {
        const allTasks = response.data.data;
        if (Array.isArray(allTasks)) {
          const userTasks = allTasks.filter((task: Task) => task.user_id === user.id);
          setTasks(userTasks);
          console.log(userId)
        } else {
          console.error('Неверный формат данных:', allTasks);
        }
      })
      .catch(err => {
        console.error('Ошибка при получении задач:', err);
      })
      .finally(() => setLoading(false));
  }, [user]);

  const startScan = async () => {
    if (!selectedTaskId || !user?.id) return;

    if (!qrScanner.current) {
      qrScanner.current = new Html5Qrcode(scannerId);
    }

    try {
      await qrScanner.current.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: 250
        },
        (decodedText) => {
          qrScanner.current?.stop().then(() => {
            qrScanner.current?.clear();
          });
          handleQrSubmit(decodedText);
        },
        (errorMessage) => {

        }
      );
    } catch (err) {
      console.error("Ошибка при запуске сканера:", err);
    }
  };

  const handleQrSubmit = (qr: string) => {
    axios.post('/task/qrproccesing', {
      qr,
      task_id: selectedTaskId,
      user_id: userId
    }).then(res => {
      setQrResult(res.data.message  || 'QR успешно обработан!');
    }).catch(err => {
      setQrResult('Ошибка: ' + (err.response?.data?.message || err.message) + '\nqr code:' + qr);
    });
  };

  if (loading) return <p>Загрузка задач...</p>;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Мои задачи</h2>

      {tasks.map(task => (
        <div
          key={task.id}
          className="p-4 border rounded shadow cursor-pointer hover:bg-gray-100"
          onClick={() => {
            setSelectedTaskId(task.id);
            setQrResult(null);
            setTimeout(startScan, 500);
          }}
        >
          <p><strong>{task.name}</strong></p>
          <p>Описание: {task.description}</p>
          <p>Дата: {task.plan_date}</p>
        </div>
      ))}

      {selectedTaskId && (
        <div className="p-4 mt-4 border rounded shadow bg-gray-50">
          <h3 className="font-semibold mb-2">Сканирование QR для задачи #{selectedTaskId}</h3>
          <div id={scannerId} className="w-full max-w-md aspect-square border mx-auto" />
          {qrResult && (
            <p className="mt-3 text-center text-green-700 font-medium">{qrResult}</p>
          )}
        </div>
      )}
    </div>
  );
};

export default UserTasks;
