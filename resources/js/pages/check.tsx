import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { Head, Link } from "@inertiajs/react";
import AppLayout from "@/layouts/app-layout";
import { type BreadcrumbItem } from "@/types";
import DssCheckpointDesk, { DssCheckpointStatusPills, type CheckpointOption, type DssCheckpointDeskStatus } from "@/components/check/DssCheckpointDesk";
import GuardOperationsRail from "@/components/check/GuardOperationsRail";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRightLeft, ArrowUp, ClipboardList, History, MapPin, Users } from "lucide-react";

const SCROLL_TOP_VISIBILITY_OFFSET = 320;

const breadcrumbs: BreadcrumbItem[] = [
  {
    title: "Охрана територии",
    href: "/check",
  },
];

type YardOption = {
  id: number;
  name: string;
};

const getAuthHeaders = () => {
  const token = localStorage.getItem('auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function Check() {
  const [yards, setYards] = useState<YardOption[]>([]);
  const [checkpoints, setCheckpoints] = useState<CheckpointOption[]>([]);
  const [selectedYardId, setSelectedYardId] = useState<number | null>(null);
  const [selectedCheckpointKey, setSelectedCheckpointKey] = useState<string>('all');
  const [deskStatus, setDeskStatus] = useState<DssCheckpointDeskStatus | null>(null);
  const [showScrollToDesk, setShowScrollToDesk] = useState(false);
  const checkpointDeskRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadYards = async () => {
      try {
        const response = await axios.post('/yard/getyards', {}, {
          headers: getAuthHeaders(),
        });

        if (!mounted) {
          return;
        }

        const items: YardOption[] = response.data?.data ?? [];
        setYards(items);

        if (items.length > 0) {
          setSelectedYardId((current) => current ?? items[0].id);
        }
      } catch (error) {
        console.error('Ошибка загрузки дворов для рабочего места охраны:', error);
      }
    };

    const loadCheckpoints = async () => {
      try {
        const response = await axios.post('/entrance-permit/getallcheckpoints', {}, {
          headers: getAuthHeaders(),
        });

        if (!mounted) {
          return;
        }

        setCheckpoints(response.data?.data ?? []);
      } catch (error) {
        console.error('Ошибка загрузки списка КПП для рабочего места охраны:', error);
      }
    };

    void loadYards();
    void loadCheckpoints();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const syncScrollButtonVisibility = () => {
      setShowScrollToDesk(window.scrollY > SCROLL_TOP_VISIBILITY_OFFSET);
    };

    syncScrollButtonVisibility();
    window.addEventListener('scroll', syncScrollButtonVisibility, { passive: true });

    return () => {
      window.removeEventListener('scroll', syncScrollButtonVisibility);
    };
  }, []);

  const handleScrollToDesk = () => {
    checkpointDeskRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      <Head title="Охрана территории" />
      <div className="flex h-full flex-1 flex-col gap-1 p-4 sm:px-6 sm:pt-4 sm:pb-1">
        <Card className="gap-0 overflow-hidden border-slate-200/80 py-0 shadow-sm">
          <CardContent className="flex flex-col gap-2 px-3 py-3 sm:px-4 sm:py-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex min-w-[220px] items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm">
                <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                <select
                  value={selectedYardId ?? ''}
                  onChange={(event) => setSelectedYardId(Number(event.target.value) || null)}
                  className="w-full bg-transparent outline-none"
                >
                  <option value="">Выберите двор</option>
                  {yards.map((yard) => (
                    <option key={yard.id} value={yard.id}>
                      {yard.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex min-w-[220px] items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm">
                <ArrowRightLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
                <select
                  value={selectedCheckpointKey}
                  onChange={(event) => setSelectedCheckpointKey(event.target.value)}
                  className="w-full bg-transparent outline-none"
                >
                  <option value="all">Все КПП</option>
                  {checkpoints.map((checkpoint) => (
                    <option key={checkpoint.id} value={String(checkpoint.id)}>
                      {checkpoint.yard_name ? `${checkpoint.name} - ${checkpoint.yard_name}` : checkpoint.name}
                    </option>
                  ))}
                </select>
              </div>
              <Button variant="outline" className="h-9" asChild>
                <Link href="/guests" prefetch>
                  <Users className="h-4 w-4" />
                  Гости
                </Link>
              </Button>
              <Button variant="outline" className="h-9" asChild>
                <Link href="/tasks" prefetch>
                  <ClipboardList className="h-4 w-4" />
                  Задания
                </Link>
              </Button>
              <Button variant="outline" className="h-9" asChild>
                <Link href="/history" prefetch>
                  <History className="h-4 w-4" />
                  История
                </Link>
              </Button>
            </div>
            <DssCheckpointStatusPills status={deskStatus} />
          </CardContent>
        </Card>

        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1.8fr)_420px]">
          <div ref={checkpointDeskRef} className="space-y-4">
            <DssCheckpointDesk checkpoints={checkpoints} selectedCheckpointKey={selectedCheckpointKey} selectedYardId={selectedYardId} onStatusChange={setDeskStatus} />
          </div>

          <GuardOperationsRail selectedYardId={selectedYardId} />
        </div>

        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label="Вернуться к блокам въезда и выезда"
          onClick={handleScrollToDesk}
          className={`fixed right-4 bottom-4 z-40 h-11 w-11 rounded-full border-slate-200/80 bg-background/95 shadow-lg backdrop-blur transition-all duration-200 hover:-translate-y-0.5 sm:right-6 sm:bottom-6 ${showScrollToDesk ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'}`}
        >
          <ArrowUp className="h-5 w-5" />
        </Button>
      </div>
    </AppLayout>
  );
}
