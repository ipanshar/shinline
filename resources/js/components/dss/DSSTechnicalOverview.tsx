import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';

type OverviewResponse = {
  connection: {
    has_settings: boolean;
    has_active_token: boolean;
    base_url?: string | null;
    last_keepalive_at?: string | null;
    last_token_update_at?: string | null;
  };
  daemon: {
    status: string;
    heartbeat_at?: string | null;
    last_success_operation?: string | null;
    last_success_at?: string | null;
    last_error_operation?: string | null;
    last_error_at?: string | null;
    last_error_message?: string | null;
    consecutive_errors: number;
  };
  metrics: {
    period_minutes: number;
    capture_count: number;
    pending_visitors: number;
    auth_failures: number;
    last_capture_success_at?: string | null;
    last_keepalive_success_at?: string | null;
  };
  alerts: {
    settings_present: boolean;
    token_present: boolean;
    keepalive_stale: boolean;
    capture_stale: boolean;
    consecutive_errors: number;
    pending_visitors: number;
    auth_failures: number;
  };
  recent_errors: Array<{
    timestamp?: string | null;
    level: string;
    event: string;
    message?: string | null;
  }>;
};

const DSSTechnicalOverview = () => {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setError(null);
      const response = await axios.post('/dss/technical-overview', { period_minutes: 60 });
      setData(response.data.data);
    } catch (err) {
      console.error('Не удалось загрузить DSS overview', err);
      setError('Не удалось загрузить технический статус DSS');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const intervalId = window.setInterval(load, 30000);

    return () => window.clearInterval(intervalId);
  }, []);

  const statusColor = useMemo(() => {
    if (!data) return '#64748b';
    if (data.alerts.keepalive_stale || data.alerts.capture_stale || data.daemon.consecutive_errors > 0) return '#dc2626';
    if (!data.connection.has_settings || !data.connection.has_active_token) return '#d97706';
    return '#16a34a';
  }, [data]);

  const formatDate = (value?: string | null) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('ru-RU');
  };

  if (loading) {
    return <div style={styles.card}>Загрузка DSS observability…</div>;
  }

  if (error || !data) {
    return <div style={styles.card}>{error ?? 'Не удалось загрузить данные'}</div>;
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.headerRow}>
        <div>
          <h2 style={styles.title}>Технический экран DSS</h2>
          <p style={styles.subtitle}>Состояние соединения, heartbeat, capture pipeline и alerting.</p>
        </div>
        <div style={{ ...styles.badge, backgroundColor: statusColor }}>
          {data.daemon.status}
        </div>
      </div>

      <div style={styles.grid}>
        <section style={styles.card}>
          <h3 style={styles.cardTitle}>Соединение</h3>
          <InfoRow label="Настройки DSS" value={data.connection.has_settings ? 'Есть' : 'Нет'} />
          <InfoRow label="Активный token" value={data.connection.has_active_token ? 'Да' : 'Нет'} />
          <InfoRow label="Base URL" value={data.connection.base_url || '—'} />
          <InfoRow label="Последний keepalive" value={formatDate(data.connection.last_keepalive_at)} />
          <InfoRow label="Последний token refresh" value={formatDate(data.connection.last_token_update_at)} />
        </section>

        <section style={styles.card}>
          <h3 style={styles.cardTitle}>Daemon</h3>
          <InfoRow label="Heartbeat" value={formatDate(data.daemon.heartbeat_at)} />
          <InfoRow label="Последний success" value={`${data.daemon.last_success_operation || '—'} / ${formatDate(data.daemon.last_success_at)}`} />
          <InfoRow label="Последняя ошибка" value={`${data.daemon.last_error_operation || '—'} / ${formatDate(data.daemon.last_error_at)}`} />
          <InfoRow label="Ошибка" value={data.daemon.last_error_message || '—'} />
          <InfoRow label="Ошибок подряд" value={String(data.daemon.consecutive_errors)} />
        </section>

        <section style={styles.card}>
          <h3 style={styles.cardTitle}>Метрики</h3>
          <InfoRow label="Capture за период" value={String(data.metrics.capture_count)} />
          <InfoRow label="Pending visitors" value={String(data.metrics.pending_visitors)} />
          <InfoRow label="Auth fail" value={String(data.metrics.auth_failures)} />
          <InfoRow label="Последний capture" value={formatDate(data.metrics.last_capture_success_at)} />
          <InfoRow label="Последний keepalive success" value={formatDate(data.metrics.last_keepalive_success_at)} />
        </section>

        <section style={styles.card}>
          <h3 style={styles.cardTitle}>Индикаторы</h3>
          <InfoRow label="Keepalive stale" value={data.alerts.keepalive_stale ? 'Да' : 'Нет'} />
          <InfoRow label="Capture stale" value={data.alerts.capture_stale ? 'Да' : 'Нет'} />
          <InfoRow label="Token present" value={data.alerts.token_present ? 'Да' : 'Нет'} />
          <InfoRow label="Pending visitors" value={String(data.alerts.pending_visitors)} />
          <InfoRow label="Auth failures" value={String(data.alerts.auth_failures)} />
        </section>
      </div>

      <section style={styles.card}>
        <h3 style={styles.cardTitle}>Последние ошибки и предупреждения</h3>
        {data.recent_errors.length === 0 ? (
          <div style={styles.emptyState}>Ошибок не найдено</div>
        ) : (
          <div style={styles.errorList}>
            {data.recent_errors.map((item, index) => (
              <div key={`${item.timestamp}-${index}`} style={styles.errorItem}>
                <div style={styles.errorMeta}>
                  <span>{item.level}</span>
                  <span>{item.event}</span>
                  <span>{formatDate(item.timestamp)}</span>
                </div>
                <div>{item.message || '—'}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <div style={styles.infoRow}>
    <span style={styles.label}>{label}</span>
    <span style={styles.value}>{value}</span>
  </div>
);

const styles: Record<string, React.CSSProperties> = {
  wrapper: { display: 'flex', flexDirection: 'column', gap: 16 },
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 },
  title: { margin: 0, fontSize: 24, fontWeight: 700 },
  subtitle: { margin: '4px 0 0', color: '#64748b' },
  badge: { color: '#fff', padding: '8px 14px', borderRadius: 999, textTransform: 'uppercase', fontWeight: 700, fontSize: 12 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 },
  card: { background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0' },
  cardTitle: { margin: '0 0 12px', fontSize: 16, fontWeight: 700 },
  infoRow: { display: 'flex', justifyContent: 'space-between', gap: 16, padding: '6px 0', borderBottom: '1px solid #f1f5f9' },
  label: { color: '#64748b' },
  value: { fontWeight: 600, textAlign: 'right' },
  emptyState: { color: '#64748b' },
  errorList: { display: 'flex', flexDirection: 'column', gap: 10 },
  errorItem: { border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, background: '#f8fafc' },
  errorMeta: { display: 'flex', gap: 12, marginBottom: 6, fontSize: 12, textTransform: 'uppercase', color: '#475569' },
};

export default DSSTechnicalOverview;