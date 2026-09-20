from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class LabelSlip(Base):
    __tablename__ = "label_slips"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    harvest_id: Mapped[int] = mapped_column(
        ForeignKey("flush_harvests.id"), nullable=False, index=True
    )
    copies: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    dye: Mapped[str] = mapped_column(String(8), nullable=False, default="light")
    printed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    voided_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    void_reason: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)

    harvest: Mapped["FlushHarvest"] = relationship(
        "FlushHarvest", back_populates="label_slips"
    )
