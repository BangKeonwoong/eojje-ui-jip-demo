#!/usr/bin/env python3
"""Dependency-free regression checks for the static prototype."""

from __future__ import annotations

import base64
import hashlib
from html.parser import HTMLParser
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parent


class DocumentInfo(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.lang = ""
        self.title = ""
        self._in_title = False
        self.metas: list[dict[str, str]] = []
        self.scripts: list[dict[str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key.lower(): value or "" for key, value in attrs}
        if tag == "html":
            self.lang = values.get("lang", "")
        elif tag == "title":
            self._in_title = True
        elif tag == "meta":
            self.metas.append(values)
        elif tag == "script":
            self.scripts.append(values)

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title += data


def meta_content(info: DocumentInfo, *, name: str = "", http_equiv: str = "") -> str:
    for meta in info.metas:
        if name and meta.get("name", "").lower() == name.lower():
            return meta.get("content", "")
        if http_equiv and meta.get("http-equiv", "").lower() == http_equiv.lower():
            return meta.get("content", "")
    return ""


def check_document(filename: str) -> None:
    path = ROOT / filename
    source = path.read_text(encoding="utf-8")
    info = DocumentInfo()
    info.feed(source)

    assert info.lang == "ko", f"{filename}: html lang must be ko"
    assert info.title.strip(), f"{filename}: title is required"
    assert meta_content(info, name="description"), f"{filename}: description is required"
    assert not re.search(r'\ssrc="\{\{', source), f"{filename}: dynamic image src causes pre-render 404s"
    assert 'src="accessibility.js"' in source, f"{filename}: accessibility helpers are missing"

    csp = meta_content(info, http_equiv="Content-Security-Policy")
    assert "object-src 'none'" in csp, f"{filename}: CSP object-src missing"
    assert "base-uri 'none'" in csp, f"{filename}: CSP base-uri missing"
    assert "'unsafe-inline'" not in csp.split("style-src", 1)[0], f"{filename}: script CSP allows unsafe-inline"

    script_blocks = re.findall(r"<script([^>]*)>([\s\S]*?)</script>", source, re.IGNORECASE)
    for attributes, body in script_blocks:
        if re.search(r"\bsrc\s*=", attributes, re.IGNORECASE):
            continue
        script_type = re.search(r'\btype\s*=\s*"([^"]+)"', attributes, re.IGNORECASE)
        if script_type and script_type.group(1).lower() != "text/javascript":
            continue
        digest = base64.b64encode(hashlib.sha256(body.encode("utf-8")).digest()).decode("ascii")
        assert f"'sha256-{digest}'" in csp, f"{filename}: CSP hash is stale"


def main() -> None:
    check_document("index.html")
    check_document("admin.html")

    admin_source = (ROOT / "admin.html").read_text(encoding="utf-8")
    assert 'name="robots" content="noindex, nofollow, noarchive"' in admin_source
    assert not re.search(r"010-(?!0000)\d{4}-\d{4}", admin_source), "admin seed phones must be visibly synthetic"

    headers = (ROOT / "_headers").read_text(encoding="utf-8")
    assert "frame-ancestors 'none'" in headers
    assert "X-Content-Type-Options: nosniff" in headers
    assert "Permissions-Policy:" in headers

    index_source = (ROOT / "index.html").read_text(encoding="utf-8")
    assert "sessionStorage.setItem('yjh-session'" in index_source
    assert "localStorage.setItem('yjh-proto', JSON.stringify({version:2" in index_source

    print("PASS: static markup, CSP hashes, privacy storage, and deployment headers")


if __name__ == "__main__":
    main()
