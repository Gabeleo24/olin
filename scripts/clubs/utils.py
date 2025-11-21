from __future__ import annotations

from typing import Any, Iterable, Mapping, Sequence


def dot_lookup(payload: Any, path: str, default: Any = None) -> Any:
    """
    Retrieve a value from a nested dict/list structure using dot notation.
    Supports numeric indices for lists, e.g., "categories.0.name".
    """
    if payload is None or path is None:
        return default

    current: Any = payload
    for segment in path.split("."):
        if isinstance(current, Mapping):
            current = current.get(segment, default)
        elif isinstance(current, Sequence) and not isinstance(current, (str, bytes)):
            try:
                index = int(segment)
            except ValueError:
                return default
            if 0 <= index < len(current):
                current = current[index]
            else:
                return default
        else:
            return default
        if current is None:
            return default
    return current


def ensure_list(value: Any) -> list:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, (tuple, set)):
        return list(value)
    return [value]


