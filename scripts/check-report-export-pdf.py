"""Validate synthetic export PDFs against their independently inspectable row manifests."""
import json
import re
from pathlib import Path

import pymupdf
from pypdf import PdfReader

output = Path("artifacts/report-export")
checks = 0
for manifest in sorted(output.glob("*-records.json")):
    report = json.loads(manifest.read_text(encoding="utf-8"))
    pdf = manifest.with_suffix(".pdf")
    reader = PdfReader(pdf)
    texts = [page.extract_text() for page in reader.pages]
    assert "Export date: Nov 10, 2026 10:30 PHT" in texts[0]
    assert report["Scope"]["Description"] in texts[0]
    assert "DO_NOT_EXPORT" not in "\n".join(texts)
    checks += 3
    for section in report["Sections"]:
        title = f'{section["Title"]} - {section["Total"]} records'
        pages = [text for text in texts if title in text]
        assert pages, f"Missing section: {title}"
        joined = "\n".join(pages)
        actual_ids = re.findall(r"\b(?:Student|Application) \d+\b", joined)
        expected_ids = [row["RecordId"] for row in section["Rows"]]
        assert sorted(actual_ids) == sorted(expected_ids), f"Row count or IDs differ: {title}"
        assert len(actual_ids) == section["Total"]
        assert f'{section["Title"]}: {len(actual_ids)}' in texts[0]
        checks += 4
        compact = re.sub(r"\s+", "", joined)
        for row in section["Rows"]:
            for field in ["FullName", "Course", "Batch", "StatusOrReason"]:
                assert re.sub(r"\s+", "", row[field]) in compact, f"Missing or truncated field: {row[field]}"
                checks += 1
        for page in pages:
            # Extraction preserves explicit line breaks in wrapped headers.
            normalized = re.sub(r"\s+", " ", page)
            for heading in section["Columns"]:
                assert heading in normalized, f"Header missing on continuation page: {heading}"
                checks += 1
        if not expected_ids:
            assert "No matching records" in joined
            checks += 1
        if manifest.stem == "all-records":
            assert len(pages) > 1, f"Fixture must test continuation headers: {title}"
            checks += 1
    document = pymupdf.open(pdf)
    for index, page in enumerate(document):
        # Render every page for visual QA, including continuation and empty pages.
        page.get_pixmap(matrix=pymupdf.Matrix(1.25, 1.25)).save(output / f"{manifest.stem}-{index+1:02}.png")
        for x0, y0, x1, y1, word, *_ in page.get_text("words"):
            assert 29 <= x0 < x1 <= page.rect.width - 29, f"Text exceeds horizontal page margins: {word}"
            assert 29 <= y0 < y1 <= page.rect.height - 20, f"Text exceeds vertical page margins: {word}"
        checks += 1
    print(f"Verified {pdf.name}: {len(reader.pages)} pages; section totals and rows match exactly.")
print(f"PASS: {checks} PDF content, repeated-header and page-boundary checks.")
