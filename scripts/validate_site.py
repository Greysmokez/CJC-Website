#!/usr/bin/env python3
from __future__ import annotations

import re
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

HTML_FILES = [
    ROOT / "index.html",
    ROOT / "chapter1.html",
    ROOT / "crucifixion.html",
    ROOT / "decree2cross.html",
    ROOT / "in-due-time.html",
    ROOT / "art-thou-he.html",
    ROOT / "isaiah61-cjc-math.html",
    ROOT / "brittle-coalition.html",
    ROOT / "jubilee-calendar-story-of-the-end.html",
    ROOT / "terms-of-use" / "index.html",
]

ARTICLE_FILES = [
    ROOT / "chapter1.html",
    ROOT / "crucifixion.html",
    ROOT / "decree2cross.html",
    ROOT / "in-due-time.html",
    ROOT / "art-thou-he.html",
    ROOT / "isaiah61-cjc-math.html",
    ROOT / "brittle-coalition.html",
    ROOT / "jubilee-calendar-story-of-the-end.html",
]

ASSET_PATTERN = re.compile(
    r"""<(?:script[^>]*\ssrc|link[^>]*\shref)=["']([^"']+)["']""",
    re.IGNORECASE,
)
INLINE_SCRIPT_PATTERN = re.compile(
    r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>",
    re.IGNORECASE | re.DOTALL,
)
H1_PATTERN = re.compile(r"<h1\b", re.IGNORECASE)


def is_local_asset(path: str) -> bool:
    return not re.match(r"^(?:[a-z]+:|//|#)", path, re.IGNORECASE)


def validate_asset_paths() -> list[str]:
    errors: list[str] = []
    for html_file in HTML_FILES:
        text = html_file.read_text(encoding="utf-8")
        for asset_path in ASSET_PATTERN.findall(text):
            if not is_local_asset(asset_path):
                continue
            target = (html_file.parent / asset_path).resolve()
            try:
                target.relative_to(ROOT)
            except ValueError:
                errors.append(f"{html_file.relative_to(ROOT)} references out-of-repo path: {asset_path}")
                continue
            if not target.exists():
                errors.append(f"{html_file.relative_to(ROOT)} missing asset: {asset_path}")
    return errors


def validate_h1_counts() -> list[str]:
    errors: list[str] = []
    for html_file in ARTICLE_FILES:
        text = html_file.read_text(encoding="utf-8")
        count = len(H1_PATTERN.findall(text))
        if count != 1:
            errors.append(f"{html_file.relative_to(ROOT)} has {count} <h1> elements")
    return errors


def validate_index_script_syntax() -> list[str]:
    errors: list[str] = []
    text = (ROOT / "index.html").read_text(encoding="utf-8")
    scripts = INLINE_SCRIPT_PATTERN.findall(text)
    for index, script in enumerate(scripts, start=1):
        with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8") as handle:
            handle.write(script)
            temp_path = Path(handle.name)
        result = subprocess.run(
            ["node", "--check", str(temp_path)],
            capture_output=True,
            text=True,
            check=False,
        )
        temp_path.unlink(missing_ok=True)
        if result.returncode != 0:
            errors.append(
                f"index.html inline script #{index} failed syntax check:\n"
                f"{(result.stderr or result.stdout).strip()}"
            )
    return errors


def main() -> int:
    errors = []
    errors.extend(validate_asset_paths())
    errors.extend(validate_h1_counts())
    errors.extend(validate_index_script_syntax())
    if errors:
        print("Validation failed:")
        for error in errors:
            print(f"- {error}")
        return 1
    print("Validation passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
