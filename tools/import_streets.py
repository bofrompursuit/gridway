"""Compatibility wrapper for the Node.js five-borough importer.

Usage: python3 tools/import_streets.py SOURCE_DIRECTORY [OUTPUT_JSON] [YYYY-MM-DD]
See README.md for the official source queries and input directory format.
"""
import subprocess
import sys
from pathlib import Path

subprocess.run(['node', str(Path(__file__).with_suffix('.mjs')), *sys.argv[1:]], check=True)
