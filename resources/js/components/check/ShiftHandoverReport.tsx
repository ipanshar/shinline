import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { 
  Printer, 
  FileText, 
  Calendar,
  Clock,
  ArrowDownLeft,
  ArrowUpRight,
  Truck,
  Users,
  RefreshCw,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Yard {
  id: number;
  name: string;
}

interface VisitorRecord {
  id: number;
  plate_number: string;
  truck_model_name?: string;
  truck_brand_name?: string;
  truck_color?: string;
  driver_name?: string;
  entry_date: string;
  exit_date?: string;
  task_name?: string;
  permit_id?: number;
  permit_one_time?: boolean;
}

interface ShiftHandoverReportProps {
  yardId?: number | null;
  yardName?: string;
  onClose?: () => void;
  isOpen?: boolean;
  // Альтернативные пропсы для совместимости с shadcn/Dialog
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const ShiftHandoverReport: React.FC<ShiftHandoverReportProps> = ({ 
  yardId: propYardId, 
  yardName: propYardName,
  onClose,
  isOpen,
  open,
  onOpenChange
}) => {
  // Используем open/onOpenChange если переданы, иначе isOpen/onClose
  const isDialogOpen = open ?? isOpen ?? true;
  const handleClose = () => {
    onOpenChange?.(false);
    onClose?.();
  };
  const [yards, setYards] = useState<Yard[]>([]);
  const [selectedYardId, setSelectedYardId] = useState<number | null>(propYardId || null);
  const [selectedYardName, setSelectedYardName] = useState<string>(propYardName || '');
  
  // Период смены
  const [shiftStart, setShiftStart] = useState(() => {
    const d = new Date();
    d.setHours(8, 0, 0, 0); // Начало смены 08:00
    return d.toISOString().slice(0, 16);
  });
  const [shiftEnd, setShiftEnd] = useState(() => {
    const d = new Date();
    d.setHours(20, 0, 0, 0); // Конец смены 20:00
    return d.toISOString().slice(0, 16);
  });

  // Данные для отчёта
  const [enteredVehicles, setEnteredVehicles] = useState<VisitorRecord[]>([]);
  const [exitedVehicles, setExitedVehicles] = useState<VisitorRecord[]>([]);
  const [onTerritoryVehicles, setOnTerritoryVehicles] = useState<VisitorRecord[]>([]);
  const [loading, setLoading] = useState(false);

  // Подписи
  const [outgoingChief, setOutgoingChief] = useState('');
  const [incomingChief, setIncomingChief] = useState('');

  const printRef = useRef<HTMLDivElement>(null);
  const token = localStorage.getItem('auth_token');

  // Загрузка дворов
  useEffect(() => {
    if (!propYardId) {
      axios.post('/yard/getyards', {}, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      })
        .then(res => {
          setYards(res.data.data || []);
          if (res.data.data?.length > 0 && !selectedYardId) {
            setSelectedYardId(res.data.data[0].id);
            setSelectedYardName(res.data.data[0].name);
          }
        })
        .catch(err => console.error('Ошибка загрузки дворов:', err));
    }
  }, [token, propYardId, selectedYardId]);

  // Загрузка данных для отчёта
  const loadReportData = async () => {
    if (!selectedYardId) return;

    setLoading(true);
    try {
      const response = await axios.post('/security/getshiftreport', {
        yard_id: selectedYardId,
        shift_start: shiftStart,
        shift_end: shiftEnd,
      }, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      if (response.data.status) {
        setEnteredVehicles(response.data.data.entered || []);
        setExitedVehicles(response.data.data.exited || []);
        setOnTerritoryVehicles(response.data.data.on_territory || []);
      }
    } catch (error) {
      console.error('Ошибка загрузки данных:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedYardId) {
      loadReportData();
    }
  }, [selectedYardId]);

  // Форматирование даты/времени
  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatTime = (dateStr?: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatShiftPeriod = () => {
    const start = new Date(shiftStart);
    const end = new Date(shiftEnd);
    return `${start.toLocaleDateString('ru-RU')} ${formatTime(shiftStart)} - ${end.toLocaleDateString('ru-RU')} ${formatTime(shiftEnd)}`;
  };

  // Печать
  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Акт приёма-передачи смены</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: 'Times New Roman', Times, serif; 
            font-size: 12pt; 
            line-height: 1.4;
            padding: 20mm;
          }
          h1 { font-size: 16pt; text-align: center; margin-bottom: 10px; }
          h2 { font-size: 14pt; margin: 15px 0 10px; border-bottom: 1px solid #000; padding-bottom: 5px; }
          h3 { font-size: 12pt; margin: 10px 0 5px; }
          .header { text-align: center; margin-bottom: 20px; }
          .info-row { margin-bottom: 5px; }
          .info-label { font-weight: bold; }
          table { 
            width: 100%; 
            border-collapse: collapse; 
            margin: 10px 0;
            font-size: 10pt;
          }
          th, td { 
            border: 1px solid #000; 
            padding: 5px 8px; 
            text-align: left;
          }
          th { 
            background-color: #f0f0f0; 
            font-weight: bold;
          }
          .mono { font-family: 'Courier New', monospace; }
          .signatures { 
            display: flex; 
            justify-content: space-between; 
            margin-top: 40px;
            page-break-inside: avoid;
          }
          .signature-block { 
            width: 45%; 
            text-align: center;
          }
          .signature-line { 
            border-bottom: 1px solid #000; 
            margin: 30px 0 5px;
            height: 1px;
          }
          .signature-label { font-size: 10pt; color: #666; }
          .stats { 
            display: flex; 
            gap: 20px; 
            margin: 10px 0;
            flex-wrap: wrap;
          }
          .stat-item { 
            padding: 5px 10px;
            background: #f5f5f5;
            border: 1px solid #ddd;
          }
          .no-data { 
            text-align: center; 
            color: #666; 
            padding: 10px;
            font-style: italic;
          }
          @media print {
            body { padding: 10mm; }
            .no-print { display: none !important; }
          }
        </style>
      </head>
      <body>
        ${printContent.innerHTML}
      </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  const content = (
    <div className="space-y-4">
      {/* Панель управления (не печатается) */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-4 no-print">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Двор */}
          {!propYardId && (
            <div>
              <Label>Двор</Label>
              <select
                value={selectedYardId || ''}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  setSelectedYardId(id);
                  setSelectedYardName(yards.find(y => y.id === id)?.name || '');
                }}
                className="w-full border rounded-lg px-3 py-2 mt-1"
              >
                {yards.map(yard => (
                  <option key={yard.id} value={yard.id}>{yard.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Начало смены */}
          <div>
            <Label>Начало смены</Label>
            <Input
              type="datetime-local"
              value={shiftStart}
              onChange={(e) => setShiftStart(e.target.value)}
              className="mt-1"
            />
          </div>

          {/* Конец смены */}
          <div>
            <Label>Конец смены</Label>
            <Input
              type="datetime-local"
              value={shiftEnd}
              onChange={(e) => setShiftEnd(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        {/* Подписанты */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Сдал смену (ФИО)</Label>
            <Input
              value={outgoingChief}
              onChange={(e) => setOutgoingChief(e.target.value)}
              placeholder="Иванов И.И."
              className="mt-1"
            />
          </div>
          <div>
            <Label>Принял смену (ФИО)</Label>
            <Input
              value={incomingChief}
              onChange={(e) => setIncomingChief(e.target.value)}
              placeholder="Петров П.П."
              className="mt-1"
            />
          </div>
        </div>

        {/* Кнопки */}
        <div className="flex gap-2">
          <Button onClick={loadReportData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Обновить данные
          </Button>
          <Button onClick={handlePrint} variant="outline">
            <Printer className="w-4 h-4 mr-2" />
            Печать
          </Button>
        </div>
      </div>

      {/* Печатная форма */}
      <div ref={printRef} className="bg-white p-6 rounded-lg border print:border-0 print:p-0">
        {/* Шапка */}
        <div className="header">
          <h1>АКТ ПРИЁМА-ПЕРЕДАЧИ СМЕНЫ</h1>
          <p className="text-gray-600">Служба охраны</p>
        </div>

        {/* Информация */}
        <div className="mt-4 space-y-1">
          <div className="info-row">
            <span className="info-label">Объект:</span> {selectedYardName || 'Не выбран'}
          </div>
          <div className="info-row">
            <span className="info-label">Период смены:</span> {formatShiftPeriod()}
          </div>
          <div className="info-row">
            <span className="info-label">Дата формирования:</span> {new Date().toLocaleString('ru-RU')}
          </div>
        </div>

        {/* Статистика */}
        <div className="stats mt-4">
          <div className="stat-item">
            <strong>Въехало:</strong> {enteredVehicles.length}
          </div>
          <div className="stat-item">
            <strong>Выехало:</strong> {exitedVehicles.length}
          </div>
          <div className="stat-item">
            <strong>На территории:</strong> {onTerritoryVehicles.length}
          </div>
        </div>

        {/* 1. Въехавшие за смену */}
        <h2 className="flex items-center gap-2 mt-6">
          <ArrowDownLeft className="w-5 h-5 text-green-600 print:hidden" />
          1. Въехавшие за смену ({enteredVehicles.length})
        </h2>
        {enteredVehicles.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th style={{ width: '5%' }}>№</th>
                <th style={{ width: '15%' }}>Гос. номер</th>
                <th style={{ width: '20%' }}>Марка/Модель</th>
                <th style={{ width: '15%' }}>Водитель</th>
                <th style={{ width: '12%' }}>Время въезда</th>
                <th style={{ width: '18%' }}>Задание</th>
                <th style={{ width: '15%' }}>Разрешение</th>
              </tr>
            </thead>
            <tbody>
              {enteredVehicles.map((v, i) => (
                <tr key={`entered-${v.id}-${i}`}>
                  <td>{i + 1}</td>
                  <td className="mono font-bold">{v.plate_number}</td>
                  <td>{[v.truck_brand_name, v.truck_model_name].filter(Boolean).join(' ') || '-'}</td>
                  <td>{v.driver_name || '-'}</td>
                  <td>{formatTime(v.entry_date)}</td>
                  <td>{v.task_name || '-'}</td>
                  <td>{v.permit_id ? (v.permit_one_time ? 'Разовый' : 'Постоянный') : 'Нет'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="no-data">Нет въездов за указанный период</p>
        )}

        {/* 2. Выехавшие за смену */}
        <h2 className="flex items-center gap-2 mt-6">
          <ArrowUpRight className="w-5 h-5 text-red-600 print:hidden" />
          2. Выехавшие за смену ({exitedVehicles.length})
        </h2>
        {exitedVehicles.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th style={{ width: '5%' }}>№</th>
                <th style={{ width: '15%' }}>Гос. номер</th>
                <th style={{ width: '25%' }}>Марка/Модель</th>
                <th style={{ width: '15%' }}>Водитель</th>
                <th style={{ width: '12%' }}>Время въезда</th>
                <th style={{ width: '12%' }}>Время выезда</th>
                <th style={{ width: '16%' }}>Задание</th>
              </tr>
            </thead>
            <tbody>
              {exitedVehicles.map((v, i) => (
                <tr key={`exited-${v.id}-${i}`}>
                  <td>{i + 1}</td>
                  <td className="mono font-bold">{v.plate_number}</td>
                  <td>{[v.truck_brand_name, v.truck_model_name].filter(Boolean).join(' ') || '-'}</td>
                  <td>{v.driver_name || '-'}</td>
                  <td>{formatTime(v.entry_date)}</td>
                  <td>{formatTime(v.exit_date)}</td>
                  <td>{v.task_name || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="no-data">Нет выездов за указанный период</p>
        )}

        {/* 3. На территории */}
        <h2 className="flex items-center gap-2 mt-6">
          <Truck className="w-5 h-5 text-blue-600 print:hidden" />
          3. Транспорт на территории на момент передачи смены ({onTerritoryVehicles.length})
        </h2>
        {onTerritoryVehicles.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th style={{ width: '5%' }}>№</th>
                <th style={{ width: '15%' }}>Гос. номер</th>
                <th style={{ width: '25%' }}>Марка/Модель</th>
                <th style={{ width: '15%' }}>Водитель</th>
                <th style={{ width: '15%' }}>Время въезда</th>
                <th style={{ width: '25%' }}>Задание</th>
              </tr>
            </thead>
            <tbody>
              {onTerritoryVehicles.map((v, i) => (
                <tr key={`territory-${v.id}-${i}`}>
                  <td>{i + 1}</td>
                  <td className="mono font-bold">{v.plate_number}</td>
                  <td>{[v.truck_brand_name, v.truck_model_name].filter(Boolean).join(' ') || '-'}</td>
                  <td>{v.driver_name || '-'}</td>
                  <td>{formatDateTime(v.entry_date)}</td>
                  <td>{v.task_name || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="no-data">Нет транспорта на территории</p>
        )}

        {/* Подписи */}
        <div className="signatures">
          <div className="signature-block">
            <p><strong>СДАЛ СМЕНУ:</strong></p>
            <p className="mt-2">{outgoingChief || '_____________________'}</p>
            <div className="signature-line"></div>
            <p className="signature-label">(подпись)</p>
          </div>
          <div className="signature-block">
            <p><strong>ПРИНЯЛ СМЕНУ:</strong></p>
            <p className="mt-2">{incomingChief || '_____________________'}</p>
            <div className="signature-line"></div>
            <p className="signature-label">(подпись)</p>
          </div>
        </div>

        <p className="mt-8 text-center text-sm text-gray-500">
          Замечания: _________________________________________________________________________
        </p>
      </div>
    </div>
  );

  // Если используется как диалог
  if (onClose || onOpenChange) {
    return (
      <Dialog open={isDialogOpen} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="max-w-6xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Акт приёма-передачи смены
            </DialogTitle>
          </DialogHeader>
          {content}
        </DialogContent>
      </Dialog>
    );
  }

  // Если используется как отдельная страница
  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <FileText className="w-6 h-6" />
            Акт приёма-передачи смены
          </h1>
        </div>
        {content}
      </div>
    </div>
  );
};

export default ShiftHandoverReport;
