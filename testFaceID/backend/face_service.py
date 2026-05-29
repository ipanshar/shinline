from __future__ import annotations

import io
import json
import re
import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from PIL import Image

from .dump_parser import DumpReferenceImage, detect_image_extension, parse_sigur_dump
from .model_downloader import ensure_models

COSINE_MATCH_THRESHOLD = 0.45
INDEX_SCHEMA_VERSION = 6
SEARCH_CANDIDATE_LIMIT = 10


@dataclass(slots=True)
class ReferenceFace:
    image_id: int
    employee_id: int
    name: str
    image_path: Path
    embedding: np.ndarray
    source: str
    profile: dict[str, str]
    image_hash: str
    reference_url: str | None = None


class FaceSearchService:
    def __init__(
        self,
        project_dir: Path,
        dump_path: Path,
        reference_dir: Path | None = None,
        cache_dir: Path | None = None,
        reference_manifest_path: Path | None = None,
    ) -> None:
        self.project_dir = project_dir
        self.dump_path = dump_path
        self.backend_dir = project_dir / "backend"
        self.cache_dir = cache_dir or (self.backend_dir / "cache")
        self.models_dir = self.backend_dir / "models"
        self.reference_dir = reference_dir or (self.backend_dir / "reference_images")
        self.reference_manifest_path = reference_manifest_path or (self.cache_dir / "reference-manifest.json")
        self.cache_file = self.cache_dir / "reference_vectors.json"
        self.custom_profiles_path = project_dir / "custom_profiles.json"

        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.reference_dir.mkdir(parents=True, exist_ok=True)

        model_paths = ensure_models(self.models_dir)
        self.detector = cv2.FaceDetectorYN.create(
            str(model_paths["face_detection_yunet_2023mar.onnx"]),
            "",
            (320, 320),
            score_threshold=0.7,
            nms_threshold=0.3,
            top_k=5000,
        )
        self.recognizer = cv2.FaceRecognizerSF.create(
            str(model_paths["face_recognition_sface_2021dec.onnx"]),
            "",
        )

        self.reference_faces: list[ReferenceFace] = []
        self.embedding_matrix = np.empty((0, 0), dtype=np.float32)
        self.skipped_references: list[dict[str, Any]] = []
        self.pre_index_skipped_references: list[dict[str, Any]] = []
        self.dump_stats: dict[str, Any] = {}
        self.reference_source_count = 0
        self.load_or_build_index()

    def load_or_build_index(self) -> None:
        cache_signature = self.build_cache_signature()
        if self.cache_file.exists():
            cache_data = json.loads(self.cache_file.read_text(encoding="utf-8"))
            if cache_data.get("cache_signature") == cache_signature:
                self.reference_faces = [
                    ReferenceFace(
                        image_id=entry["image_id"],
                        employee_id=entry["employee_id"],
                        name=entry["name"],
                        image_path=self.restore_cached_image_path(str(entry["image_path"])),
                        embedding=np.array(entry["embedding"], dtype=np.float32),
                        source=entry.get("source", "sigur-personalimg"),
                        profile=entry.get("profile", {}),
                        image_hash=entry.get("image_hash", ""),
                        reference_url=entry.get("reference_url"),
                    )
                    for entry in cache_data.get("entries", [])
                ]
                self.skipped_references = cache_data.get("skipped", [])
                self.dump_stats = cache_data.get("dump_stats", {})
                self.reference_source_count = int(
                    cache_data.get(
                        "reference_source_count",
                        len(self.reference_faces) + len(self.skipped_references),
                    )
                )
                self.refresh_embedding_matrix()
                return

        self.rebuild_index()

    def rebuild_index(self) -> None:
        if self.reference_manifest_path.exists():
            self.reference_dir.mkdir(parents=True, exist_ok=True)
        else:
            self.clear_reference_dir()

        references = self.extract_reference_images()
        indexed_faces: list[ReferenceFace] = []
        skipped: list[dict[str, Any]] = list(self.pre_index_skipped_references)

        for reference in references:
            try:
                image = self.load_image(reference["image_path"])
                embedding = self.extract_embedding(image)
            except ValueError as error:
                skipped.append(self.skip_payload(reference, str(error)))
                continue

            if embedding is None:
                skipped.append(self.skip_payload(reference, "Face not detected on reference image"))
                continue

            indexed_faces.append(
                ReferenceFace(
                    image_id=reference["image_id"],
                    employee_id=reference["employee_id"],
                    name=reference["name"],
                    image_path=reference["image_path"],
                    embedding=embedding,
                    source=reference["source"],
                    profile=reference.get("profile", {}),
                    image_hash=reference["image_hash"],
                    reference_url=reference.get("reference_url"),
                )
            )

        payload = {
            "cache_signature": self.build_cache_signature(),
            "reference_source_count": self.reference_source_count,
            "dump_stats": self.dump_stats,
            "entries": [
                {
                    "image_id": face.image_id,
                    "employee_id": face.employee_id,
                    "name": face.name,
                    "image_path": self.cache_image_path(face.image_path),
                    "embedding": face.embedding.tolist(),
                    "source": face.source,
                    "profile": face.profile,
                    "image_hash": face.image_hash,
                    "reference_url": face.reference_url,
                }
                for face in indexed_faces
            ],
            "skipped": skipped,
        }

        self.cache_file.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        self.reference_faces = indexed_faces
        self.skipped_references = skipped
        self.refresh_embedding_matrix()

    def extract_reference_images(self) -> list[dict[str, Any]]:
        self.pre_index_skipped_references = []
        references: list[dict[str, Any]] = []

        manifest_references = self.extract_manifest_reference_images()
        if manifest_references:
            self.dump_stats = {
                "source": "local_manifest",
                "manifestPath": self.reference_manifest_path.as_posix(),
                "referenceImagesFromManifest": len(manifest_references),
            }
            references.extend(manifest_references)
        elif self.dump_path.exists():
            dump_result = parse_sigur_dump(self.dump_path)
            self.dump_stats = dump_result.stats
            for reference in dump_result.references:
                persisted = self.persist_dump_reference(reference)
                if persisted is not None:
                    references.append(persisted)
        else:
            self.dump_stats = {"error": f"Dump not found: {self.dump_path.as_posix()}"}

        references.extend(self.extract_custom_reference_images())
        self.reference_source_count = len(references) + len(self.pre_index_skipped_references)
        return references

    def extract_manifest_reference_images(self) -> list[dict[str, Any]]:
        if not self.reference_manifest_path.exists():
            return []

        payload = json.loads(self.reference_manifest_path.read_text(encoding="utf-8"))
        raw_references = payload.get("references", [])
        if not isinstance(raw_references, list):
            raise ValueError("reference-manifest.json must contain a list in the references field")

        references: list[dict[str, Any]] = []
        for raw_reference in raw_references:
            if not isinstance(raw_reference, dict):
                continue

            image_path = self.resolve_manifest_image_path(raw_reference)
            image_id = self.parse_manifest_int(raw_reference.get("imageId"))
            employee_id = self.parse_manifest_int(raw_reference.get("employeeId"))
            name = str(raw_reference.get("name") or "Unknown employee")
            source = str(raw_reference.get("source") or raw_reference.get("sourceSystem") or "local-manifest")
            profile = {
                str(key): str(value)
                for key, value in dict(raw_reference.get("profile", {})).items()
                if value is not None
            }

            if image_path is None:
                self.pre_index_skipped_references.append(
                    {
                        "image_id": image_id,
                        "employee_id": employee_id,
                        "name": name,
                        "source": source,
                        "reason": "Reference image from manifest is missing on disk",
                    }
                )
                continue

            references.append(
                {
                    "image_id": image_id,
                    "employee_id": employee_id,
                    "name": name,
                    "image_path": image_path,
                    "source": source,
                    "profile": profile,
                    "image_hash": str(raw_reference.get("imageHash", "")),
                    "reference_url": str(raw_reference.get("referenceImageUrl") or ""),
                }
            )

        return references

    def persist_dump_reference(self, reference: DumpReferenceImage) -> dict[str, Any] | None:
        image_path = self.reference_dir / self.reference_file_name(reference)
        try:
            self.persist_reference_image(image_path, reference.image_bytes)
        except ValueError as error:
            self.pre_index_skipped_references.append(
                {
                    "image_id": reference.image_id,
                    "employee_id": reference.employee_id,
                    "name": reference.name,
                    "source": reference.source,
                    "reason": str(error),
                }
            )
            return None

        return {
            "image_id": reference.image_id,
            "employee_id": reference.employee_id,
            "name": reference.name,
            "image_path": image_path,
            "source": reference.source,
            "profile": reference.profile,
            "image_hash": hashlib.sha1(reference.image_bytes).hexdigest(),
            "reference_url": f"/reference-images/{image_path.name}",
        }

    def extract_custom_reference_images(self) -> list[dict[str, Any]]:
        references: list[dict[str, Any]] = []
        for raw_profile in self.read_custom_profiles_config():
            source_path = self.project_dir / str(raw_profile["imagePath"])
            image_id = int(raw_profile["imageId"])
            employee_id = int(raw_profile["employeeId"])
            source = str(raw_profile.get("source", "custom-demo"))
            profile = {
                str(key): str(value)
                for key, value in dict(raw_profile.get("profile", {})).items()
                if value is not None
            }

            try:
                image_bytes = source_path.read_bytes()
            except OSError as error:
                self.pre_index_skipped_references.append(
                    {
                        "image_id": image_id,
                        "employee_id": employee_id,
                        "name": str(raw_profile["name"]),
                        "source": source,
                        "reason": f"Cannot read custom image: {error}",
                    }
                )
                continue

            extension = detect_image_extension(image_bytes) or source_path.suffix.lower() or ".jpg"
            target_name = str(
                raw_profile.get(
                    "referenceFileName",
                    f"custom_emp_{employee_id}_img_{image_id}{extension}",
                )
            )
            if not Path(target_name).suffix:
                target_name = f"{target_name}{extension}"

            target_path = self.reference_dir / Path(target_name).name
            try:
                self.persist_reference_image(target_path, image_bytes)
            except ValueError as error:
                self.pre_index_skipped_references.append(
                    {
                        "image_id": image_id,
                        "employee_id": employee_id,
                        "name": str(raw_profile["name"]),
                        "source": source,
                        "reason": str(error),
                    }
                )
                continue

            references.append(
                {
                    "image_id": image_id,
                    "employee_id": employee_id,
                    "name": str(raw_profile["name"]),
                    "image_path": target_path,
                    "source": source,
                    "profile": profile,
                    "image_hash": hashlib.sha1(image_bytes).hexdigest(),
                    "reference_url": f"/reference-images/{target_path.name}",
                }
            )

        return references

    def read_custom_profiles_config(self) -> list[dict[str, Any]]:
        if not self.custom_profiles_path.exists():
            return []

        payload = json.loads(self.custom_profiles_path.read_text(encoding="utf-8"))
        if not isinstance(payload, list):
            raise ValueError("custom_profiles.json must contain a list of profiles.")

        return [dict(entry) for entry in payload]

    def build_cache_signature(self) -> dict[str, Any]:
        custom_profiles = self.read_custom_profiles_config()
        custom_images_signature = {
            str(profile["imagePath"]): (self.project_dir / str(profile["imagePath"])).stat().st_mtime
            for profile in custom_profiles
            if (self.project_dir / str(profile["imagePath"])).exists()
        }
        dump_stat = self.dump_path.stat() if self.dump_path.exists() else None
        manifest_stat = self.reference_manifest_path.stat() if self.reference_manifest_path.exists() else None

        return {
            "schemaVersion": INDEX_SCHEMA_VERSION,
            "dumpMtime": dump_stat.st_mtime if dump_stat else None,
            "dumpSize": dump_stat.st_size if dump_stat else None,
            "referenceManifestMtime": manifest_stat.st_mtime if manifest_stat else None,
            "referenceManifestSize": manifest_stat.st_size if manifest_stat else None,
            "customProfilesMtime": self.custom_profiles_path.stat().st_mtime
            if self.custom_profiles_path.exists()
            else None,
            "customImagesMtime": custom_images_signature,
        }

    def clear_reference_dir(self) -> None:
        self.reference_dir.mkdir(parents=True, exist_ok=True)
        for path in self.reference_dir.iterdir():
            if path.is_file():
                path.unlink()

    def refresh_embedding_matrix(self) -> None:
        if not self.reference_faces:
            self.embedding_matrix = np.empty((0, 0), dtype=np.float32)
            return

        self.embedding_matrix = np.vstack([face.embedding for face in self.reference_faces]).astype(
            np.float32,
            copy=False,
        )

    def persist_reference_image(self, image_path: Path, image_bytes: bytes) -> None:
        image_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            with Image.open(io.BytesIO(image_bytes)) as image:
                image.verify()
        except Exception as error:
            raise ValueError(f"Invalid reference image: {error}") from error

        image_path.write_bytes(image_bytes)

    def load_image(self, image_path: Path) -> np.ndarray:
        image_data = np.frombuffer(image_path.read_bytes(), dtype=np.uint8)
        image = cv2.imdecode(image_data, cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError(f"Cannot decode image: {image_path}")
        return image

    def extract_embedding(self, image: np.ndarray) -> np.ndarray | None:
        for candidate_image in self.iter_detection_candidates(image):
            face = self.detect_largest_face(candidate_image)
            if face is None:
                continue

            aligned = self.recognizer.alignCrop(candidate_image, face)
            embedding = self.recognizer.feature(aligned).flatten().astype(np.float32)
            norm = np.linalg.norm(embedding)
            if norm == 0:
                continue
            return embedding / norm

        return None

    def detect_largest_face(self, image: np.ndarray) -> np.ndarray | None:
        self.detector.setInputSize((image.shape[1], image.shape[0]))
        _, faces = self.detector.detect(image)
        if faces is None or len(faces) == 0:
            return None

        return max(faces, key=lambda item: item[2] * item[3])

    def iter_detection_candidates(self, image: np.ndarray) -> list[np.ndarray]:
        candidates: list[np.ndarray] = [image]
        padded = self.pad_image(image, 0.18)
        candidates.append(padded)

        for max_size in (960, 768, 640, 512, 384):
            resized = self.resize_image_for_detection(image, max_size)
            if resized is not None:
                candidates.append(resized)

            padded_resized = self.resize_image_for_detection(padded, max_size)
            if padded_resized is not None:
                candidates.append(padded_resized)

        unique_candidates: list[np.ndarray] = []
        seen_shapes: set[tuple[int, int]] = set()
        for candidate in candidates:
            shape = (candidate.shape[1], candidate.shape[0])
            if shape in seen_shapes:
                continue
            seen_shapes.add(shape)
            unique_candidates.append(candidate)

        return unique_candidates

    def resize_image_for_detection(self, image: np.ndarray, max_size: int) -> np.ndarray | None:
        height, width = image.shape[:2]
        current_max = max(height, width)
        if current_max <= max_size:
            return None

        scale = max_size / current_max
        new_size = (max(1, int(width * scale)), max(1, int(height * scale)))
        return cv2.resize(image, new_size, interpolation=cv2.INTER_AREA)

    def pad_image(self, image: np.ndarray, padding_ratio: float) -> np.ndarray:
        height, width = image.shape[:2]
        pad_x = max(12, int(width * padding_ratio))
        pad_y = max(12, int(height * padding_ratio))
        return cv2.copyMakeBorder(
            image,
            pad_y,
            pad_y,
            pad_x,
            pad_x,
            borderType=cv2.BORDER_CONSTANT,
            value=(240, 240, 240),
        )

    def search(self, image_bytes: bytes, person_kinds: list[str] | None = None) -> dict[str, Any]:
        if not self.reference_faces or self.embedding_matrix.size == 0:
            raise ValueError("Reference index is empty. Rebuild the index first.")

        image = cv2.imdecode(np.frombuffer(image_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError("Uploaded file is not a valid image.")

        query_embedding = self.extract_embedding(image)
        if query_embedding is None:
            raise ValueError("Face not detected on the uploaded image.")

        similarities = self.embedding_matrix @ query_embedding
        grouped_candidates: dict[str, dict[str, Any]] = {}
        normalized_person_kinds = {
            str(value).strip()
            for value in (person_kinds or [])
            if str(value).strip()
        }
        for index, similarity_value in enumerate(similarities):
            face = self.reference_faces[index]
            if normalized_person_kinds:
                face_person_kind = str(face.profile.get("personKind") or "").strip()
                if face_person_kind not in normalized_person_kinds:
                    continue

            similarity = float(similarity_value)
            group_key = self.reference_group_key(face)
            existing = grouped_candidates.get(group_key)
            if existing is None or similarity > float(existing["similarity"]):
                grouped_candidates[group_key] = self.serialize_face(face, similarity)

        candidates_by_person = sorted(
            grouped_candidates.values(),
            key=lambda item: float(item["similarity"]),
            reverse=True,
        )

        candidates: list[dict[str, Any]] = []
        used_image_hashes: set[str] = set()
        for candidate in candidates_by_person:
            image_hash = str(candidate.get("imageHash", ""))
            if image_hash and image_hash in used_image_hashes:
                continue

            if image_hash:
                used_image_hashes.add(image_hash)
            candidates.append(candidate)

        if not candidates:
            return {
                "matched": False,
                "threshold": COSINE_MATCH_THRESHOLD,
                "bestMatch": None,
                "candidates": [],
            }

        best_match = candidates[0]
        return {
            "matched": best_match["similarity"] >= COSINE_MATCH_THRESHOLD,
            "threshold": COSINE_MATCH_THRESHOLD,
            "bestMatch": best_match,
            "candidates": candidates[:SEARCH_CANDIDATE_LIMIT],
        }

    def status(self) -> dict[str, Any]:
        return {
            "dumpPath": self.dump_path.as_posix(),
            "referenceManifestPath": self.reference_manifest_path.as_posix(),
            "referenceSourceCount": self.reference_source_count,
            "indexedCount": len(self.reference_faces),
            "skippedCount": len(self.skipped_references),
            "skipSummary": self.summarize_skips(),
            "dumpStats": self.dump_stats,
            "skipped": self.skipped_references,
            "people": [self.serialize_face(face) for face in self.unique_reference_faces()],
        }

    def serialize_face(self, face: ReferenceFace, similarity: float | None = None) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "referenceKey": f"{face.source}:{face.employee_id}:{face.image_id}",
            "imageId": face.image_id,
            "employeeId": face.employee_id,
            "groupKey": self.reference_group_key(face),
            "name": face.name,
            "referenceImageUrl": face.reference_url or f"/reference-images/{face.image_path.name}",
            "source": face.source,
            "profile": face.profile,
            "imageHash": face.image_hash,
        }
        if similarity is not None:
            payload["similarity"] = similarity
        return payload

    def reference_file_name(self, reference: DumpReferenceImage) -> str:
        safe_source = re.sub(r"[^a-zA-Z0-9_-]+", "_", reference.source).strip("_")
        return f"{safe_source}_emp_{reference.employee_id}_img_{reference.image_id}{reference.extension}"

    def skip_payload(self, reference: dict[str, Any], reason: str) -> dict[str, Any]:
        return {
            "image_id": reference["image_id"],
            "employee_id": reference["employee_id"],
            "name": reference["name"],
            "source": reference["source"],
            "reason": reason,
        }

    def summarize_skips(self) -> dict[str, int]:
        summary: dict[str, int] = {}
        for skipped in self.skipped_references:
            reason = str(skipped.get("reason", "Unknown"))
            summary[reason] = summary.get(reason, 0) + 1
        return summary

    def unique_reference_faces(self) -> list[ReferenceFace]:
        grouped: dict[str, ReferenceFace] = {}
        for face in self.reference_faces:
            group_key = self.reference_group_key(face)
            grouped.setdefault(group_key, face)
        return list(grouped.values())

    def reference_group_key(self, face: ReferenceFace) -> str:
        return str(face.profile.get("groupKey") or face.employee_id)

    def parse_manifest_int(self, value: Any) -> int:
        try:
            return int(value)
        except (TypeError, ValueError):
            return 0

    def resolve_manifest_image_path(self, reference: dict[str, Any]) -> Path | None:
        absolute_path = str(reference.get("absolutePath") or "").strip()
        if absolute_path:
            candidate = Path(absolute_path)
            if candidate.is_file():
                return candidate

        relative_path = str(reference.get("relativePath") or "").strip()
        if not relative_path:
            return None

        candidate = self.reference_dir / relative_path
        return candidate if candidate.is_file() else None

    def cache_image_path(self, image_path: Path) -> str:
        try:
            return image_path.relative_to(self.project_dir).as_posix()
        except ValueError:
            return image_path.as_posix()

    def restore_cached_image_path(self, cached_path: str) -> Path:
        path = Path(cached_path)
        if path.is_absolute():
            return path
        return self.project_dir / path
