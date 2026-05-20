import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react'

interface PersonProfile {
  sourceLabel?: string
  role?: string
  department?: string
  city?: string
  phone?: string
  email?: string
  note?: string
}

interface PersonInfo {
  referenceKey: string
  imageId: number
  employeeId: number
  name: string
  referenceImageUrl: string
  source: string
  imageHash?: string
  profile: PersonProfile
}

interface DumpStats {
  personalRows?: number
  personalParsed?: number
  personalimgRows?: number
  personalimgValidImages?: number
  photoRows?: number
  photoRowsWithBinary?: number
  photoValidImages?: number
  photoEmptyImages?: number
  photoInvalidImages?: number
  photoMissingPerson?: number
  referenceImagesFromDump?: number
  error?: string
}

interface StatusResponse {
  dumpPath: string
  referenceSourceCount: number
  indexedCount: number
  skippedCount: number
  skipSummary: Record<string, number>
  dumpStats: DumpStats
  skipped: Array<{ name?: string; reason: string }>
  people: PersonInfo[]
}

interface Candidate extends PersonInfo {
  similarity: number
}

interface SearchResponse {
  matched: boolean
  threshold: number
  bestMatch: Candidate | null
  candidates: Candidate[]
}

interface SearchErrorResponse {
  error?: string
}

const CATALOG_PAGE_SIZE = 80

const api = {
  async getStatus(): Promise<StatusResponse> {
    const response = await fetch('/api/status')
    if (!response.ok) {
      throw new Error('Не удалось получить статус индекса')
    }
    return response.json()
  },
  async rebuild(): Promise<StatusResponse> {
    const response = await fetch('/api/rebuild', { method: 'POST' })
    if (!response.ok) {
      throw new Error('Переиндексация не удалась')
    }
    return response.json()
  },
  async search(file: File): Promise<SearchResponse> {
    const formData = new FormData()
    formData.append('file', file)

    const response = await fetch('/api/search', {
      method: 'POST',
      body: formData,
    })

    const payload = (await response.json().catch(() => null)) as
      | SearchResponse
      | SearchErrorResponse
      | null

    if (payload && 'error' in payload && payload.error) {
      throw new Error(payload.error)
    }

    if (!response.ok) {
      throw new Error('Поиск не удался')
    }

    return payload as SearchResponse
  },
}

function formatNumber(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) {
    return '0'
  }

  return new Intl.NumberFormat('ru-RU').format(value)
}

function formatSimilarity(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function profileText(person: PersonInfo): string {
  return [
    person.name,
    person.employeeId,
    person.imageId,
    person.source,
    person.profile.sourceLabel,
    person.profile.role,
    person.profile.department,
    person.profile.city,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function renderProfile(profile: PersonProfile | undefined) {
  if (!profile) {
    return null
  }

  return (
    <dl className="profile-facts">
      {profile.role ? (
        <div>
          <dt>Должность</dt>
          <dd>{profile.role}</dd>
        </div>
      ) : null}
      {profile.department ? (
        <div>
          <dt>Отдел</dt>
          <dd>{profile.department}</dd>
        </div>
      ) : null}
      {profile.city ? (
        <div>
          <dt>Город</dt>
          <dd>{profile.city}</dd>
        </div>
      ) : null}
      {profile.phone ? (
        <div>
          <dt>Телефон</dt>
          <dd>{profile.phone}</dd>
        </div>
      ) : null}
      {profile.email ? (
        <div>
          <dt>Email</dt>
          <dd>{profile.email}</dd>
        </div>
      ) : null}
      {profile.note ? (
        <div>
          <dt>Заметка</dt>
          <dd>{profile.note}</dd>
        </div>
      ) : null}
    </dl>
  )
}

function sourceLabel(person: PersonInfo): string {
  return person.profile.sourceLabel || person.source
}

export default function App() {
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [result, setResult] = useState<SearchResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [rebuilding, setRebuilding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [catalogQuery, setCatalogQuery] = useState('')
  const [visibleLimit, setVisibleLimit] = useState(CATALOG_PAGE_SIZE)
  const [candidateCursor, setCandidateCursor] = useState(0)

  useEffect(() => {
    void loadStatus()
  }, [])

  useEffect(() => {
    setVisibleLimit(CATALOG_PAGE_SIZE)
  }, [catalogQuery, status?.indexedCount])

  const uploadPreview = useMemo(() => {
    if (!selectedFile) {
      return null
    }
    return URL.createObjectURL(selectedFile)
  }, [selectedFile])

  useEffect(() => {
    return () => {
      if (uploadPreview) {
        URL.revokeObjectURL(uploadPreview)
      }
    }
  }, [uploadPreview])

  const filteredPeople = useMemo(() => {
    const people = status?.people ?? []
    const query = catalogQuery.trim().toLowerCase()
    if (!query) {
      return people
    }

    return people.filter((person) => profileText(person).includes(query))
  }, [catalogQuery, status?.people])

  const visiblePeople = filteredPeople.slice(0, visibleLimit)
  const sourceCount = new Set((status?.people ?? []).map((person) => person.source)).size
  const activeCandidate = result?.candidates[candidateCursor] ?? result?.bestMatch ?? null
  const activeCandidateMatched = Boolean(
    activeCandidate && result && activeCandidate.similarity >= result.threshold,
  )

  async function loadStatus() {
    try {
      setError(null)
      const nextStatus = await api.getStatus()
      setStatus(nextStatus)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Не удалось загрузить статус')
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null
    setSelectedFile(nextFile)
    setResult(null)
    setError(null)
    setCandidateCursor(0)
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedFile) {
      setError('Сначала выбери фотографию')
      return
    }

    try {
      setLoading(true)
      setError(null)
      const searchResult = await api.search(selectedFile)
      setResult(searchResult)
      setCandidateCursor(0)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Поиск не удался')
      setResult(null)
      setCandidateCursor(0)
    } finally {
      setLoading(false)
    }
  }

  async function onRebuild() {
    try {
      setRebuilding(true)
      setError(null)
      const nextStatus = await api.rebuild()
      setStatus(nextStatus)
      setResult(null)
      setCandidateCursor(0)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Переиндексация не удалась')
    } finally {
      setRebuilding(false)
    }
  }

  return (
    <main className="page-shell">
      <header className="topbar">
        <div>
          <h1>Проверка лица</h1>
        </div>
        <button className="secondary-button" disabled={rebuilding} onClick={onRebuild} type="button">
          {rebuilding ? 'Индекс перестраивается...' : 'Переиндексировать дамп'}
        </button>
      </header>

      {error ? <p className="error-banner">{error}</p> : null}

      <section className="stats-grid">
        <article className="stat-card">
          <span>Проиндексировано</span>
          <strong>{formatNumber(status?.indexedCount)}</strong>
        </article>
        <article className="stat-card">
          <span>Источников фото</span>
          <strong>{formatNumber(status?.referenceSourceCount)}</strong>
        </article>
        <article className="stat-card">
          <span>Фото в таблице photo</span>
          <strong>{formatNumber(status?.dumpStats.photoValidImages)}</strong>
        </article>
        <article className="stat-card">
          <span>Пропущено</span>
          <strong>{formatNumber(status?.skippedCount)}</strong>
        </article>
        <article className="stat-card">
          <span>Порог совпадения</span>
          <strong>{result ? formatSimilarity(result.threshold) : '45.0%'}</strong>
        </article>
        <article className="stat-card">
          <span>Источников в индексе</span>
          <strong>{formatNumber(sourceCount)}</strong>
        </article>
      </section>

      <section className="workspace-grid">
        <article className="panel upload-panel">
          <div className="panel-head">
            <p className="eyebrow">Вход</p>
            <h2>Фотография для поиска</h2>
          </div>
          <form className="upload-form" onSubmit={onSubmit}>
            <label className="file-dropzone">
              <input accept="image/*" onChange={onFileChange} type="file" />
              <span>{selectedFile ? selectedFile.name : 'Выбрать фото'}</span>
            </label>
            <button className="primary-button" disabled={!selectedFile || loading} type="submit">
              {loading ? 'Ищем лицо...' : 'Найти человека'}
            </button>
          </form>
          <div className="image-box">
            {uploadPreview ? (
              <img alt="Загруженная фотография" src={uploadPreview} />
            ) : (
              <span>Превью появится после выбора файла</span>
            )}
          </div>
        </article>

        <article className="panel result-panel">
          <div className="panel-head">
            <p className="eyebrow">Результат</p>
            <h2>
              {activeCandidate
                ? activeCandidateMatched
                  ? 'Возможное совпадение'
                  : 'Уверенного совпадения нет'
                : 'Ожидаем поиск'}
            </h2>
          </div>
          {activeCandidate ? (
            <div className="match-layout">
              <img
                alt={activeCandidate.name}
                className="match-photo"
                src={activeCandidate.referenceImageUrl}
              />
              <div className="match-meta">
                <span className={activeCandidateMatched ? 'match-pill match-ok' : 'match-pill match-warn'}>
                  {activeCandidateMatched ? 'Выше порога' : 'Ниже порога'}
                </span>
                <p className="candidate-position">
                  Вариант {candidateCursor + 1} из {result?.candidates.length ?? 1}
                </p>
                {!activeCandidateMatched ? (
                  <p className="no-match-note">
                    Это не подтверждённое совпадение, а ближайший кандидат для ручной проверки.
                  </p>
                ) : null}
                <h3>{activeCandidate.name}</h3>
                <p>EMP_ID: {activeCandidate.employeeId}</p>
                <p>Similarity: {formatSimilarity(activeCandidate.similarity)}</p>
                <span className="source-badge">{sourceLabel(activeCandidate)}</span>
                <div className="decision-row">
                  <button
                    className="secondary-button"
                    disabled={candidateCursor === 0}
                    onClick={() => setCandidateCursor((current) => Math.max(0, current - 1))}
                    type="button"
                  >
                    Назад
                  </button>
                  <button
                    className="reject-button"
                    disabled={!result || candidateCursor >= result.candidates.length - 1}
                    onClick={() =>
                      setCandidateCursor((current) =>
                        Math.min((result?.candidates.length ?? 1) - 1, current + 1),
                      )
                    }
                    type="button"
                  >
                    Это не он
                  </button>
                </div>
                {renderProfile(activeCandidate.profile)}
              </div>
            </div>
          ) : (
            <div className="empty-state">Здесь появится найденный человек и эталонное фото из индекса</div>
          )}
        </article>
      </section>

      <section className="panel candidates-panel">
        <div className="panel-head inline-head">
          <div>
            <p className="eyebrow">Кандидаты</p>
            <h2>Top-10 ближайших лиц</h2>
          </div>
          {result ? <span className="muted-text">Порог: {formatSimilarity(result.threshold)}</span> : null}
        </div>
        {result?.candidates.length ? (
          <div className="candidate-list">
            {result.candidates.map((candidate, index) => (
              <button
                className={index === candidateCursor ? 'candidate-card candidate-card-active' : 'candidate-card'}
                key={candidate.referenceKey}
                onClick={() => setCandidateCursor(index)}
                type="button"
              >
                <span className="candidate-rank">{index + 1}</span>
                <img alt={candidate.name} src={candidate.referenceImageUrl} />
                <span className="candidate-copy">
                  <strong>{candidate.name}</strong>
                  <span>EMP_ID: {candidate.employeeId}</span>
                  <span>{sourceLabel(candidate)}</span>
                </span>
                <b>{formatSimilarity(candidate.similarity)}</b>
              </button>
            ))}
          </div>
        ) : (
          <p className="empty-copy">После поиска здесь появятся ближайшие лица из индекса.</p>
        )}
      </section>

      <section className="panel reference-panel">
        <div className="panel-head inline-head">
          <div>
            <p className="eyebrow">Каталог</p>
            <h2>Проиндексированные лица</h2>
          </div>
          <input
            className="search-input"
            onChange={(event) => setCatalogQuery(event.target.value)}
            placeholder="Имя, EMP_ID, source, отдел"
            type="search"
            value={catalogQuery}
          />
        </div>

        <div className="catalog-meta">
          <span>
            Показано {formatNumber(visiblePeople.length)} из {formatNumber(filteredPeople.length)}
          </span>
          <span>Всего в индексе: {formatNumber(status?.people.length)}</span>
        </div>

        <div className="reference-grid">
          {visiblePeople.map((person) => (
            <article className="reference-card" key={person.referenceKey}>
              <img alt={person.name} src={person.referenceImageUrl} />
              <div>
                <span className="source-badge compact-badge">{sourceLabel(person)}</span>
                <h3>{person.name}</h3>
                <p>EMP_ID: {person.employeeId}</p>
                {person.profile.role ? <p>{person.profile.role}</p> : null}
                {person.profile.department ? <p>{person.profile.department}</p> : null}
              </div>
            </article>
          ))}
        </div>

        {filteredPeople.length > visibleLimit ? (
          <button
            className="secondary-button load-more-button"
            onClick={() => setVisibleLimit((current) => current + CATALOG_PAGE_SIZE)}
            type="button"
          >
            Показать ещё
          </button>
        ) : null}

        {status && status.indexedCount === 0 ? (
          <p className="empty-copy">Индекс пуст. Нажми «Переиндексировать дамп».</p>
        ) : null}
      </section>

      <section className="panel diagnostics-panel">
        <div className="panel-head">
          <p className="eyebrow">Диагностика</p>
          <h2>Что найдено в дампе</h2>
        </div>
        <div className="diagnostic-grid">
          <span>personal: {formatNumber(status?.dumpStats.personalParsed)} строк</span>
          <span>personalimg: {formatNumber(status?.dumpStats.personalimgValidImages)} фото</span>
          <span>photo: {formatNumber(status?.dumpStats.photoRows)} строк</span>
          <span>photo с binary: {formatNumber(status?.dumpStats.photoRowsWithBinary)}</span>
          <span>битые photo: {formatNumber(status?.dumpStats.photoInvalidImages)}</span>
          <span>пустые photo: {formatNumber(status?.dumpStats.photoEmptyImages)}</span>
        </div>
        {status?.skipSummary && Object.keys(status.skipSummary).length > 0 ? (
          <div className="skip-list">
            {Object.entries(status.skipSummary).map(([reason, count]) => (
              <p key={reason}>
                <span>{reason}</span>
                <strong>{formatNumber(count)}</strong>
              </p>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  )
}
