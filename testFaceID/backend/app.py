from __future__ import annotations

import logging
import os
from pathlib import Path
from threading import Lock, Thread
from typing import Any

from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .face_service import COSINE_MATCH_THRESHOLD, FaceSearchService

LOGGER = logging.getLogger(__name__)
PROJECT_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = PROJECT_DIR.parent


def resolve_dump_path() -> Path:
    override = os.getenv("FACEID_DUMP_PATH", "").strip()
    if not override:
        return PROJECT_DIR / "sigur_20260506.sql"

    dump_path = Path(override).expanduser()
    if not dump_path.is_absolute():
        dump_path = (PROJECT_DIR / dump_path).resolve()

    return dump_path


def resolve_directory_path(env_name: str, default_relative_path: str) -> Path:
    override = os.getenv(env_name, "").strip()
    if not override:
        return (PROJECT_DIR / default_relative_path).resolve()

    path = Path(override).expanduser()
    if not path.is_absolute():
        path = (PROJECT_DIR / path).resolve()

    return path


def resolve_file_path(env_name: str, default_relative_path: str) -> Path:
    override = os.getenv(env_name, "").strip()
    if not override:
        return (PROJECT_DIR / default_relative_path).resolve()

    path = Path(override).expanduser()
    if not path.is_absolute():
        path = (PROJECT_DIR / path).resolve()

    return path


DUMP_PATH = resolve_dump_path()
REFERENCE_DIR = resolve_directory_path("FACEID_REFERENCE_DIR", "../storage/app/private/faceid/references")
REFERENCE_MANIFEST_PATH = resolve_file_path(
    "FACEID_REFERENCE_MANIFEST_PATH",
    "../storage/app/private/faceid/reference-manifest.json",
)
CACHE_DIR = resolve_directory_path("FACEID_CACHE_DIR", "backend/cache")
REFERENCE_DIR.mkdir(parents=True, exist_ok=True)
CACHE_DIR.mkdir(parents=True, exist_ok=True)


class FaceServiceController:
    def __init__(
        self,
        project_dir: Path,
        dump_path: Path,
        reference_dir: Path,
        cache_dir: Path,
        reference_manifest_path: Path,
    ) -> None:
        self.project_dir = project_dir
        self.dump_path = dump_path
        self.reference_dir = reference_dir
        self.cache_dir = cache_dir
        self.reference_manifest_path = reference_manifest_path
        self._lock = Lock()
        self._service: FaceSearchService | None = None
        self._loading = False
        self._error: str | None = None

    def ensure_started(self) -> None:
        self._start_background_load(force_rebuild=False)

    def request_rebuild(self) -> None:
        self._start_background_load(force_rebuild=True)

    def current_service(self) -> FaceSearchService | None:
        with self._lock:
            return self._service

    def status_payload(self) -> dict[str, Any]:
        service = self.current_service()
        with self._lock:
            loading = self._loading
            error = self._error

        if service is None:
            return {
                "dumpPath": self.dump_path.as_posix(),
                "referenceManifestPath": self.reference_manifest_path.as_posix(),
                "referenceSourceCount": 0,
                "indexedCount": 0,
                "skippedCount": 0,
                "skipSummary": {},
                "dumpStats": {},
                "skipped": [],
                "people": [],
                "loading": loading,
                "ready": False,
                "error": error,
            }

        payload = service.status()
        payload["loading"] = loading
        payload["ready"] = True
        payload["error"] = error
        return payload

    def _start_background_load(self, force_rebuild: bool) -> None:
        with self._lock:
            if self._loading:
                return

            self._loading = True
            self._error = None

        thread = Thread(
            target=self._load_service,
            args=(force_rebuild,),
            daemon=True,
            name="faceid-index-loader",
        )
        thread.start()

    def _load_service(self, force_rebuild: bool) -> None:
        try:
            current = self.current_service()
            if force_rebuild and current is not None:
                current.rebuild_index()
                service = current
            else:
                service = FaceSearchService(
                    self.project_dir,
                    self.dump_path,
                    reference_dir=self.reference_dir,
                    cache_dir=self.cache_dir,
                    reference_manifest_path=self.reference_manifest_path,
                )
        except Exception as error:  # pragma: no cover - runtime bootstrap protection
            LOGGER.exception("Failed to prepare Face ID service")
            with self._lock:
                self._loading = False
                self._error = str(error)
            return

        with self._lock:
            self._service = service
            self._loading = False
            self._error = None


controller = FaceServiceController(
    PROJECT_DIR,
    DUMP_PATH,
    REFERENCE_DIR,
    CACHE_DIR,
    REFERENCE_MANIFEST_PATH,
)

app = FastAPI(title="Face ID Prototype", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount(
    "/reference-images",
    StaticFiles(directory=REFERENCE_DIR),
    name="reference-images",
)


@app.on_event("startup")
def startup_event() -> None:
    controller.ensure_started()


@app.get("/api/status")
def get_status() -> dict[str, object]:
    controller.ensure_started()
    return controller.status_payload()


@app.post("/api/rebuild")
def rebuild_index() -> dict[str, object]:
    controller.request_rebuild()
    return controller.status_payload()


@app.post("/api/search")
async def search_face(file: UploadFile = File(...)) -> dict[str, object]:
    service = controller.current_service()
    if service is None:
        controller.ensure_started()
        return {
            "matched": False,
            "threshold": COSINE_MATCH_THRESHOLD,
            "bestMatch": None,
            "candidates": [],
            "error": "Индекс еще строится. Дождись завершения загрузки и попробуй снова.",
            "loading": True,
        }

    if file.content_type and not file.content_type.startswith("image/"):
        return {"error": "Загрузи файл изображения JPG, PNG или WEBP."}

    image_bytes = await file.read()
    if not image_bytes:
        return {"error": "Файл пустой. Выбери фотографию и попробуй снова."}

    try:
        return service.search(image_bytes)
    except ValueError as error:
        return {
            "matched": False,
            "threshold": COSINE_MATCH_THRESHOLD,
            "bestMatch": None,
            "candidates": [],
            "error": str(error),
        }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.app:app", host="127.0.0.1", port=8008, reload=True, app_dir=str(PROJECT_DIR))
