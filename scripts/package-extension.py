"""Build a Chrome or Firefox archive from an explicit runtime file list."""
import argparse
import json
from pathlib import Path
import shutil
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
manifest = json.loads((root / "manifest.json").read_text())
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("browser", choices=["chrome", "firefox"])
browser = parser.parse_args().browser
if browser == "firefox":
    manifest["background"] = {"scripts": ["background.js"], "type": "module"}
    manifest["browser_specific_settings"] = {
        "gecko": {
            "id": "huntdeck@czar16",
            "strict_min_version": "142.0",
            "data_collection_permissions": {"required": ["none"]},
        }
    }
output = root / "dist" / browser
if output.exists():
    shutil.rmtree(output)
output.mkdir(parents=True)
(output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
for name in ["background.js", "popup.html", "popup.css", "popup.js", "lib", "icons", "fonts"]:
    source = root / name
    if source.is_dir():
        shutil.copytree(source, output / name)
    else:
        shutil.copy2(source, output / name)
archive = output.parent / f"huntdeck-{manifest['version']}-{browser}.zip"
with ZipFile(archive, "w", ZIP_DEFLATED) as package:
    for path in sorted(output.rglob("*")):
        if path.is_file():
            package.write(path, path.relative_to(output))
print(f"{browser.capitalize()} upload: {archive}")
print(f"Temporary testing: {output / 'manifest.json'}")
