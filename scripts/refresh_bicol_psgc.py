import json
import pathlib
import ssl
import time
import urllib.request

ctx = ssl.create_default_context()
root = pathlib.Path(r"c:\Users\comig\source\repos\ABEC System\wwwroot\data\psgc")
cities_dir = root / "cities"
barangays_dir = root / "barangays"
cities_dir.mkdir(parents=True, exist_ok=True)
barangays_dir.mkdir(parents=True, exist_ok=True)
base = "https://psgc.gitlab.io/api"


def fetch(url: str):
    req = urllib.request.Request(
        url,
        headers={"Accept": "application/json", "User-Agent": "ABEC-System/1.0"},
    )
    with urllib.request.urlopen(req, context=ctx, timeout=60) as resp:
        raw = resp.read()
    data = json.loads(raw.decode("utf-8"))
    return data


def write_json(path: pathlib.Path, data) -> None:
    path.write_text(
        json.dumps(data, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
        newline="\n",
    )


def main() -> None:
    all_provinces = fetch(f"{base}/provinces.json")
    write_json(root / "provinces.json", all_provinces)
    print("provinces", len(all_provinces))

    provinces = fetch(f"{base}/regions/050000000/provinces.json")

    total_cities = 0
    total_brgy = 0
    ntilde = 0

    for p in provinces:
        code = p["code"]
        cities = fetch(f"{base}/provinces/{code}/cities-municipalities.json")
        write_json(cities_dir / f"{code}.json", cities)
        total_cities += len(cities)
        print(p["name"], "cities", len(cities))

        for c in cities:
            cc = c["code"]
            try:
                brgys = fetch(f"{base}/cities-municipalities/{cc}/barangays.json")
                write_json(barangays_dir / f"{cc}.json", brgys)
                total_brgy += len(brgys)
                for b in brgys:
                    if "ñ" in b["name"].lower() or "Ñ" in b["name"]:
                        ntilde += 1
            except Exception as e:
                print("FAIL", c["name"], cc, e)
            time.sleep(0.03)

    print("TOTAL cities", total_cities, "barangays", total_brgy, "names_with_n", ntilde)

    albay_cities = json.loads((cities_dir / "050500000.json").read_text(encoding="utf-8"))
    leg = next(c for c in albay_cities if "Legazpi" in c["name"])
    br = json.loads((barangays_dir / f"{leg['code']}.json").read_text(encoding="utf-8"))
    cands = [b["name"] for b in br if "Cabag" in b["name"] or "Bañ" in b["name"]]
    print("legazpi samples", cands)
    raw = (barangays_dir / f"{leg['code']}.json").read_bytes()
    idx = raw.find(b"Cabag")
    print("bytes", raw[idx : idx + 20])


if __name__ == "__main__":
    main()
