#!/usr/bin/env python3
"""
Utility to fetch the latest colleges.db and related artifacts from GitHub Releases.

Usage:
    python scripts/download_cache.py --tag latest-cache --dest data/
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys
from typing import Iterable, Optional

import urllib.request

API_ROOT = "https://api.github.com/repos/Gabeleo24/olin/releases/tags"


def fetch_release(tag: str, token: Optional[str]) -> dict:
    url = f"{API_ROOT}/{tag}"
    req = urllib.request.Request(url)
    if token:
        req.add_header("Authorization", f"token {token}")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def download_asset(asset: dict, dest_dir: pathlib.Path, token: Optional[str]) -> None:
    dest_dir.mkdir(parents=True, exist_ok=True)
    filename = asset["name"]
    dest_path = dest_dir / filename
    url = asset["browser_download_url"]
    req = urllib.request.Request(url)
    if token:
        req.add_header("Authorization", f"token {token}")
    print(f"Downloading {filename}...")
    with urllib.request.urlopen(req, timeout=60) as resp, dest_path.open("wb") as fh:
        fh.write(resp.read())


def select_assets(release: dict, names: Iterable[str]) -> list[dict]:
    wanted = set(names)
    assets = []
    for asset in release.get("assets", []):
        if asset["name"] in wanted:
            assets.append(asset)
    missing = wanted - {asset["name"] for asset in assets}
    if missing:
        raise SystemExit(f"Missing assets in release: {', '.join(missing)}")
    return assets


def main() -> None:
    parser = argparse.ArgumentParser(description="Download cache artifacts from GitHub Releases.")
    parser.add_argument("--tag", default="latest-cache", help="Release tag to download (default: latest-cache).")
    parser.add_argument("--dest", default="data", help="Destination directory (default: data).")
    parser.add_argument(
        "--files",
        nargs="+",
        default=[
            "colleges.db",
            "location_states.json",
            "location_states.csv",
            "location_cities.json",
            "location_cities.csv",
            "teleport_fallback.json",
            "schools.html",
        ],
        help="Specific files to download from the release assets.",
    )
    args = parser.parse_args()

    token = os.environ.get("GITHUB_TOKEN")
    release = fetch_release(args.tag, token)
    assets = select_assets(release, args.files)

    dest_dir = pathlib.Path(args.dest)
    for asset in assets:
        download_asset(asset, dest_dir, token)

    print(f"Done. Assets stored under {dest_dir.resolve()}")


if __name__ == "__main__":
    main()

