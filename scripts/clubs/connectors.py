from __future__ import annotations

import csv
import logging
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

import requests

from .models import ClubRecord
from .utils import dot_lookup, ensure_list

logger = logging.getLogger(__name__)


class ClubConnector:
    """
    Base connector that normalizes raw club sources into ClubRecord instances.
    """

    def __init__(self, school_meta: Dict[str, Any], source_config: Dict[str, Any]):
        self.school_meta = school_meta
        self.source = source_config

    def fetch(self) -> List[ClubRecord]:
        raise NotImplementedError

    def _build_record(self, payload: Dict[str, Any]) -> Optional[ClubRecord]:
        field_map = self.source.get("field_map", {})
        record_kwargs: Dict[str, Any] = {}

        for target_field, source_path in field_map.items():
            if isinstance(source_path, list):
                value = [dot_lookup(payload, path) for path in source_path]
            else:
                value = dot_lookup(payload, source_path)
            record_kwargs[target_field] = value

        club_name = (record_kwargs.get("club_name") or "").strip()
        if not club_name:
            return None

        tags_value = record_kwargs.get("tags")
        if isinstance(tags_value, str):
            delimiter = self.source.get("tags_separator", ",")
            tags = [tag.strip() for tag in tags_value.split(delimiter) if tag.strip()]
        else:
            tags = ensure_list(tags_value)

        record = ClubRecord(
            school_name=self.school_meta["school_name"],
            unit_id=self.school_meta.get("unit_id"),
            school_city=self.school_meta.get("city"),
            school_state=self.school_meta.get("state"),
            club_name=club_name,
            summary=record_kwargs.get("summary"),
            category=record_kwargs.get("category"),
            subcategory=record_kwargs.get("subcategory"),
            tags=tags,
            membership_size=_coerce_int(record_kwargs.get("membership_size")),
            meeting_cadence=record_kwargs.get("meeting_cadence"),
            is_virtual=_coerce_bool(record_kwargs.get("is_virtual")),
            contact_email=record_kwargs.get("contact_email"),
            contact_url=record_kwargs.get("contact_url"),
            source_name=self.source.get("name"),
            source_type=self.source.get("type"),
        )

        return record


class JSONAPIConnector(ClubConnector):
    """
    Generic JSON API connector with optional pagination support.
    """

    def __init__(self, school_meta: Dict[str, Any], source_config: Dict[str, Any]):
        super().__init__(school_meta, source_config)
        self.session = requests.Session()

    def fetch(self) -> List[ClubRecord]:
        items: List[ClubRecord] = []
        for payload in self._iterate_payloads():
            record = self._build_record(payload)
            if record:
                items.append(record)
        return items

    def _iterate_payloads(self) -> Iterable[Dict[str, Any]]:
        pagination = self.source.get("pagination")
        params = dict(self.source.get("params", {}))
        headers = self.source.get("headers", {})
        data_path = self.source.get("data_path")
        timeout = self.source.get("timeout", 15)

        if not pagination:
            response = self.session.get(self.source["url"], headers=headers, params=params, timeout=timeout)
            response.raise_for_status()
            yield from self._extract_items(response.json(), data_path)
            return

        mode = pagination.get("mode")
        if mode == "offset":
            size_param = pagination.get("size_param", "limit")
            offset_param = pagination.get("offset_param", "offset")
            page_size = pagination.get("page_size", 100)
            offset = pagination.get("start", 0)

            while True:
                params[size_param] = page_size
                params[offset_param] = offset
                response = self.session.get(self.source["url"], headers=headers, params=params, timeout=timeout)
                response.raise_for_status()
                payload = response.json()
                batch = list(self._extract_items(payload, data_path))
                if not batch:
                    break
                for item in batch:
                    yield item
                offset += page_size

        elif mode == "page":
            page_param = pagination.get("page_param", "page")
            size_param = pagination.get("size_param", "per_page")
            page_size = pagination.get("page_size", 100)
            page = pagination.get("start", 1)
            stop_condition = pagination.get("stop_after_pages")

            while True:
                params[page_param] = page
                params[size_param] = page_size
                response = self.session.get(self.source["url"], headers=headers, params=params, timeout=timeout)
                response.raise_for_status()
                payload = response.json()
                batch = list(self._extract_items(payload, data_path))
                if not batch:
                    break
                for item in batch:
                    yield item
                page += 1
                if stop_condition and page > stop_condition:
                    break
        else:
            raise ValueError(f"Unsupported pagination mode: {mode}")

    def _extract_items(self, payload: Any, data_path: Optional[str]) -> Iterable[Dict[str, Any]]:
        if data_path:
            payload = dot_lookup(payload, data_path)
        if isinstance(payload, list):
            yield from payload
        elif isinstance(payload, dict):
            yield payload
        else:
            logger.warning("Unexpected payload type for %s: %s", self.source.get("name"), type(payload))


class CSVConnector(ClubConnector):
    def fetch(self) -> List[ClubRecord]:
        path = Path(self.source["path"])
        if not path.exists():
            raise FileNotFoundError(f"CSV file not found: {path}")

        delimiter = self.source.get("delimiter", ",")
        items: List[ClubRecord] = []

        with path.open("r", encoding="utf-8") as handle:
            reader = csv.DictReader(handle, delimiter=delimiter)
            for row in reader:
                record = self._build_record(row)
                if record:
                    items.append(record)

        return items


class StaticConnector(ClubConnector):
    def fetch(self) -> List[ClubRecord]:
        items: List[ClubRecord] = []
        for payload in self.source.get("records", []):
            record = self._build_record(payload)
            if record:
                items.append(record)
        return items


def build_connector(school_meta: Dict[str, Any], source_config: Dict[str, Any]) -> ClubConnector:
    connectors = {
        "json_api": JSONAPIConnector,
        "csv_file": CSVConnector,
        "static": StaticConnector,
    }
    source_type = source_config.get("type")
    if source_type not in connectors:
        raise ValueError(f"Unsupported club source type: {source_type}")
    return connectors[source_type](school_meta, source_config)


def _coerce_int(value: Any) -> Optional[int]:
    if value in (None, ""):
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _coerce_bool(value: Any) -> Optional[bool]:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"true", "yes", "1"}:
            return True
        if lowered in {"false", "no", "0"}:
            return False
    if isinstance(value, (int, float)):
        return bool(value)
    return None


