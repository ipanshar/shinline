from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .dump_parser import DumpPerson, DumpReferenceImage, parse_sigur_dump


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract only required Face ID reference data from Sigur SQL dump into local store.",
    )
    parser.add_argument("--dump", required=True, help="Path to Sigur SQL dump")
    parser.add_argument("--output-dir", required=True, help="Directory for extracted reference images")
    parser.add_argument("--manifest", required=True, help="Path to JSON manifest with extracted references")
    parser.add_argument("--dry-run", action="store_true", help="Parse and summarize dump without writing files")
    return parser.parse_args()


def reference_file_name(reference: DumpReferenceImage) -> str:
    safe_source = re.sub(r"[^a-zA-Z0-9_-]+", "_", reference.source).strip("_")
    return f"{safe_source}_emp_{reference.employee_id}_img_{reference.image_id}{reference.extension}"


def build_reference_payload(reference: DumpReferenceImage, relative_path: str | None = None) -> dict[str, Any]:
    group_key = str(reference.profile.get("groupKey") or reference.employee_id)
    business_key = f"faceid:{group_key}"
    mime_type = mimetypes.guess_type(reference_file_name(reference))[0] or "application/octet-stream"

    payload: dict[str, Any] = {
        "imageId": reference.image_id,
        "employeeId": reference.employee_id,
        "businessKey": business_key,
        "externalRef": str(reference.employee_id),
        "groupKey": group_key,
        "name": reference.name,
        "source": reference.source,
        "sourceSystem": "sigur",
        "imageHash": hashlib.sha1(reference.image_bytes).hexdigest(),
        "mimeType": mime_type,
        "fileSize": len(reference.image_bytes),
        "profile": {
            key: str(value)
            for key, value in reference.profile.items()
            if value is not None
        },
    }

    if relative_path is not None:
        payload["relativePath"] = relative_path

    return payload


def build_person_payload(person: DumpPerson) -> dict[str, Any]:
    group_key = str(person.identity_key)
    business_key = f"faceid:{group_key}"

    profile = {
        "sourceLabel": "Sigur personal",
        "role": person.pos,
        "department": "",
        "iin": person.iin,
        "status": person.status,
        "groupKey": group_key,
        "employeeType": person.employee_type,
        "personType": person.type,
    }

    return {
        "employeeId": person.id,
        "businessKey": business_key,
        "externalRef": str(person.id),
        "groupKey": group_key,
        "name": person.name,
        "sourceSystem": "sigur",
        "profile": {
            key: str(value)
            for key, value in profile.items()
            if value is not None
        },
    }


def main() -> int:
    args = parse_args()
    dump_path = Path(args.dump).expanduser().resolve()
    output_dir = Path(args.output_dir).expanduser().resolve()
    manifest_path = Path(args.manifest).expanduser().resolve()

    result = parse_sigur_dump(dump_path)

    if args.dry_run:
        summary = {
            "dumpPath": dump_path.as_posix(),
            "peopleCount": len(result.people),
            "referenceCount": len(result.references),
            "stats": result.stats,
        }
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return 0

    imported_dir = output_dir / "sigur_dump"
    if imported_dir.exists():
        shutil.rmtree(imported_dir)
    imported_dir.mkdir(parents=True, exist_ok=True)

    references: list[dict[str, Any]] = []
    for reference in result.references:
        relative_path = Path("sigur_dump") / reference_file_name(reference)
        target_path = output_dir / relative_path
        target_path.parent.mkdir(parents=True, exist_ok=True)
        target_path.write_bytes(reference.image_bytes)

        references.append(build_reference_payload(reference, relative_path.as_posix()))

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "dumpPath": dump_path.as_posix(),
        "peopleCount": len(result.people),
        "referenceCount": len(references),
        "stats": result.stats,
        "people": [build_person_payload(person) for person in sorted(result.people.values(), key=lambda item: item.id)],
        "references": references,
    }

    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(
        json.dumps(
            {
                "dumpPath": dump_path.as_posix(),
                "outputDir": output_dir.as_posix(),
                "manifestPath": manifest_path.as_posix(),
                "peopleCount": len(result.people),
                "referenceCount": len(references),
                "stats": result.stats,
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())