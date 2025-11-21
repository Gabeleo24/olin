from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import List, Optional


@dataclass
class ClubRecord:
    """Normalized representation of a student organization."""

    school_name: str
    unit_id: Optional[int] = None
    school_city: Optional[str] = None
    school_state: Optional[str] = None

    club_name: str = ""
    summary: Optional[str] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    tags: List[str] = field(default_factory=list)
    membership_size: Optional[int] = None
    meeting_cadence: Optional[str] = None
    is_virtual: Optional[bool] = None

    contact_email: Optional[str] = None
    contact_url: Optional[str] = None

    source_name: Optional[str] = None
    source_type: Optional[str] = None

    ingested_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def to_row(self) -> dict:
        payload = asdict(self)
        payload["tags"] = ",".join(self.tags) if self.tags else None
        payload["ingested_at"] = self.ingested_at.isoformat()
        return payload


