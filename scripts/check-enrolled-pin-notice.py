"""Inspect and render the synthetic notice made by --security-pin-workflow-only."""
import json
from pathlib import Path

from pypdf import PdfReader
import pymupdf

folder = Path("artifacts/enrolled-pin-notice-fixture")
expected = json.loads((folder / "expected.json").read_text(encoding="utf-8-sig"))
reader = PdfReader(folder / "activation-notice.pdf")
text = "\n".join(page.extract_text() for page in reader.pages)
assert len(reader.pages) == 1, "Activation Notice must remain one page"
assert expected["Pin"] in text, "Notice must contain the current saved PIN"
assert expected["PreviousPin"] not in text, "Notice must omit the previous PIN"
assert expected["GeneratedDate"] in text and expected["OldDate"] not in text, "Notice must show the replacement generation date"
assert "Select Activate Account" not in text and "permanent password when prompted" not in text, "Notice must use the current sign-in workflow"
with pymupdf.open(folder / "activation-notice.pdf") as document:
    document[0].get_pixmap(matrix=pymupdf.Matrix(1.5, 1.5)).save(folder / "activation-notice.png")
print("PASS 5 real Activation Notice PDF checks; rendered preview saved.")
