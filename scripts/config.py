import os
from functools import lru_cache
from pathlib import Path
from typing import Dict, Optional

# Absolute path to the project root so scripts can locate the shared .env file.
PROJECT_ROOT = Path(__file__).resolve().parent.parent


@lru_cache(maxsize=1)
def _read_env_file() -> Dict[str, str]:
    """
    Best-effort loader for the repository-level .env file.
    Values are cached so we only touch the filesystem once per process.
    """
    env_path = PROJECT_ROOT / ".env"
    values: Dict[str, str] = {}

    if not env_path.exists():
        return values

    for raw_line in env_path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        cleaned_value = value.strip().strip('"').strip("'")
        values[key.strip()] = cleaned_value

    return values


def get_env_var(name: str, default: Optional[str] = None, *, required: bool = False) -> Optional[str]:
    """
    Retrieve an environment variable, falling back to the shared .env file.
    """
    value = os.getenv(name)
    if value is not None:
        return value

    env_values = _read_env_file()
    if name in env_values:
        # Hydrate os.environ so downstream imports see the same value.
        value = env_values[name]
        os.environ.setdefault(name, value)
        return value

    if required:
        raise RuntimeError(
            f"Missing required environment variable '{name}'. "
            "Set it in your shell or add it to the project .env file."
        )

    return default


