"""Build the bundled Manhattan road catalog from NYC CSCL JSON.

Usage: python3 tools/import_streets.py /path/to/centerlines.json
Source query and scope are documented in README.md. Existing road IDs survive
refreshes; new names receive the next unused ID. Commit the output to freeze IDs.
"""
import json
import re
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
target = root / 'dist' / 'streets.json'
rows = json.loads(Path(sys.argv[1]).read_text())
assert len(rows) < 50000, 'Query limit reached; paginate before importing'
previous = json.loads(target.read_text())['roads'] if target.exists() else []
ids = {r['name']: r['id'] for r in previous}
next_id = max(ids.values(), default=0) + 1
groups = {}
for row in rows:
    name = ' '.join(row['full_street_name'].split())
    if name in {'CONNECTOR', 'UNNAMED ST'}:
        continue  # Generic labels can refer to separate, unrelated roads.
    geometry = row['the_geom']
    assert geometry['type'] == 'MultiLineString'
    lines = groups.setdefault(name, [])
    for line in geometry['coordinates']:
        if len(line) >= 2:
            lines.append([[round(lat, 6), round(lng, 6)] for lng, lat in line])

def natural(name):
    return [(0, int(s)) if s.isdigit() else (1, s) for s in re.split(r'(\d+)', name)]

roads = []
for name in sorted(groups, key=natural):
    if name not in ids:
        ids[name] = next_id
        next_id += 1
    roads.append({'id': ids[name], 'name': name, 'lines': groups[name]})
data = {
    'source': 'NYC Open Data Street Centerline (CSCL), inkn-q76z',
    'sourceUrl': 'https://data.cityofnewyork.us/d/inkn-q76z',
    'retrieved': '2026-10-19',
    'scope': 'Manhattan; boroughcode=1; rw_type=1 (streets)',
    'roads': roads,
}
target.write_text(json.dumps(data, separators=(',', ':')) + '\n')
print(f'{len(roads)} named roads, {sum(len(r["lines"]) for r in roads)} segments, {target.stat().st_size:,} bytes')
