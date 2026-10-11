#!/usr/bin/env python3
"""snapshot-zip.py <out_dir>

Zip every git-tracked file of this repository into
    <out_dir>/bcapital-portfolio-intelligence-<shortsha>.zip
under a single top-level folder (bcapital-portfolio-intelligence-<shortsha>/).

Excluded (listed in SNAPSHOT-EXCLUDED.txt inside the zip):
  * any path containing a node_modules / .next / dist directory segment
  * any .env* file except *.example
  * files larger than 25 MB
  * tracked paths that no longer exist on disk (deleted, not yet committed)

The archive is verified with zipfile.testzip() and a JSON summary is printed:
    {"file", "bytes", "files", "excluded", "sha"}
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import zipfile
from pathlib import Path

MAX_BYTES = 25 * 1024 * 1024
EXCLUDED_DIRS = {"node_modules", ".next", "dist"}
PROJECT = "bcapital-portfolio-intelligence"


def git(*args: str, cwd: Path) -> str:
    return subprocess.check_output(["git", *args], cwd=cwd).decode("utf-8", "replace")


def exclusion_reason(rel: str, abs_path: Path) -> str | None:
    parts = rel.split("/")
    for seg in parts[:-1]:
        if seg in EXCLUDED_DIRS:
            return f"directory {seg}"
    name = parts[-1]
    if name.startswith(".env") and not name.endswith(".example"):
        return "env file"
    if not abs_path.is_file():
        return "missing on disk"
    size = abs_path.stat().st_size
    if size > MAX_BYTES:
        return f"{size} bytes > 25 MB"
    return None


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__, file=sys.stderr)
        return 2
    out_dir = Path(argv[1]).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    repo = Path(git("rev-parse", "--show-toplevel", cwd=Path.cwd()).strip())
    sha = git("rev-parse", "--short", "HEAD", cwd=repo).strip()
    folder = f"{PROJECT}-{sha}"
    out_file = out_dir / f"{folder}.zip"

    tracked = [p for p in git("ls-files", "-z", cwd=repo).split("\0") if p]
    included: list[str] = []
    excluded: list[tuple[str, str]] = []
    for rel in tracked:
        reason = exclusion_reason(rel, repo / rel)
        (excluded.append((rel, reason)) if reason else included.append(rel))

    with zipfile.ZipFile(out_file, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for rel in included:
            zf.write(repo / rel, arcname=f"{folder}/{rel}")
        manifest = [f"# snapshot {folder} — {len(excluded)} tracked path(s) excluded", ""]
        manifest += [f"{rel}\t{reason}" for rel, reason in excluded]
        zf.writestr(f"{folder}/SNAPSHOT-EXCLUDED.txt", "\n".join(manifest) + "\n")

    with zipfile.ZipFile(out_file) as zf:
        bad = zf.testzip()
        if bad is not None:
            print(json.dumps({"error": f"corrupt member {bad}", "file": str(out_file)}), file=sys.stderr)
            return 1

    print(json.dumps({
        "file": str(out_file),
        "bytes": out_file.stat().st_size,
        "files": len(included),
        "excluded": len(excluded),
        "sha": sha,
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
