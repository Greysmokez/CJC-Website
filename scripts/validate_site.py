#!/usr/bin/env python3
from __future__ import annotations

import re
import subprocess
import sys
import tempfile
from html.parser import HTMLParser
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
H1_PATTERN = re.compile(r"<h1\b", re.IGNORECASE)


class InlineScriptExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.inline_scripts: list[str] = []
        self._in_inline_script = False
        self._current_script: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "script":
            return
        attr_map = {name.lower(): value for name, value in attrs}
        if "src" in attr_map:
            self._in_inline_script = False
            self._current_script = []
            return
        self._in_inline_script = True
        self._current_script = []

    def handle_data(self, data: str) -> None:
        if self._in_inline_script:
            self._current_script.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() != "script" or not self._in_inline_script:
            return
        self.inline_scripts.append("".join(self._current_script))
        self._in_inline_script = False
        self._current_script = []


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


def validate_index_script_syntax() -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    text = (ROOT / "index.html").read_text(encoding="utf-8")
    extractor = InlineScriptExtractor()
    extractor.feed(text)
    scripts = extractor.inline_scripts
    for index, script in enumerate(scripts, start=1):
        with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8") as handle:
            handle.write(script)
            temp_path = Path(handle.name)
        try:
            result = subprocess.run(
                ["node", "--check", str(temp_path)],
                capture_output=True,
                text=True,
                check=False,
            )
        except FileNotFoundError:
            temp_path.unlink(missing_ok=True)
            warnings.append("Skipped index.html inline JavaScript syntax check because no local 'node' executable was found.")
            return errors, warnings
        temp_path.unlink(missing_ok=True)
        if result.returncode != 0:
            errors.append(
                f"index.html inline script #{index} failed syntax check:\n"
                f"{(result.stderr or result.stdout).strip()}"
            )
    return errors, warnings


def main() -> int:
    errors = []
    warnings = []
    errors.extend(validate_asset_paths())
    errors.extend(validate_h1_counts())
    script_errors, script_warnings = validate_index_script_syntax()
    errors.extend(script_errors)
    warnings.extend(script_warnings)
    if errors:
        print("Validation failed:")
        for error in errors:
            print(f"- {error}")
        return 1
    for warning in warnings:
        print(f"Warning: {warning}")
    print("Validation passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
