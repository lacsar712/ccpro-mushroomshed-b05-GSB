from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from marshmallow import ValidationError

from app.database import SessionLocal
from app.models.flush_harvest import FlushHarvest
from app.models.label_slip import LabelSlip
from app.models.room import Room
from app.schemas.label_slip import (
    LabelSlipCreateSchema,
    LabelSlipOutSchema,
    LabelSlipVoidSchema,
)
from app.utils import validation_error_response

bp = Blueprint("label_slips", __name__, url_prefix="/api/label-slips")

MIN_SLIP_WEIGHT_KG = 0.3

create_schema = LabelSlipCreateSchema()
void_schema = LabelSlipVoidSchema()
out_schema = LabelSlipOutSchema()


def _dump(slip: LabelSlip, flush_no: int, room_code: str) -> dict:
    data = out_schema.dump(slip)
    data["flushNo"] = flush_no
    data["roomCode"] = room_code
    return data


def _joined_query(db):
    # flushNo / roomCode 一律沿 harvest 的 room 主键关联取出
    return (
        db.query(LabelSlip, FlushHarvest.flush_no, Room.room_code)
        .join(FlushHarvest, LabelSlip.harvest_id == FlushHarvest.id)
        .join(Room, FlushHarvest.room_id == Room.id)
    )


@bp.get("")
@jwt_required()
def list_label_slips():
    db = SessionLocal()
    try:
        room_id = request.args.get("roomId", type=int)
        q = _joined_query(db)
        if room_id is not None:
            q = q.filter(FlushHarvest.room_id == room_id)
        rows = q.order_by(LabelSlip.printed_at.desc(), LabelSlip.id.desc()).all()
        return jsonify([_dump(slip, flush_no, room_code) for slip, flush_no, room_code in rows])
    finally:
        db.close()


@bp.post("")
@jwt_required()
def create_label_slip():
    db = SessionLocal()
    try:
        try:
            data = create_schema.load(request.get_json(silent=True) or {})
        except ValidationError as err:
            return validation_error_response(err)

        harvest = db.query(FlushHarvest).filter(FlushHarvest.id == data["harvest_id"]).first()
        if not harvest:
            return jsonify({"detail": "采收记录不存在", "harvestId": data["harvest_id"]}), 404

        if harvest.weight_kg < MIN_SLIP_WEIGHT_KG:
            return (
                jsonify(
                    {
                        "detail": f"潮次重量低于 {MIN_SLIP_WEIGHT_KG} kg，禁止开贴标单",
                        "harvestId": harvest.id,
                    }
                ),
                409,
            )

        room = db.query(Room).filter(Room.id == harvest.room_id).first()
        if not room or room.status != "fruiting":
            return (
                jsonify(
                    {
                        "detail": "所属出菇室非 fruiting 状态，禁止开贴标单",
                        "harvestId": harvest.id,
                    }
                ),
                409,
            )

        open_slip = (
            db.query(LabelSlip)
            .filter(LabelSlip.harvest_id == harvest.id, LabelSlip.voided_at.is_(None))
            .first()
        )
        if open_slip:
            return (
                jsonify({"detail": "该采收已存在未作废贴标单", "slipId": open_slip.id}),
                409,
            )

        slip = LabelSlip(
            harvest_id=harvest.id,
            copies=data["copies"],
            dye=data["dye"],
            printed_at=datetime.now(timezone.utc),
        )
        db.add(slip)
        db.commit()
        db.refresh(slip)
        return jsonify(_dump(slip, harvest.flush_no, room.room_code)), 201
    finally:
        db.close()


@bp.post("/<int:slip_id>/void")
@jwt_required()
def void_label_slip(slip_id: int):
    db = SessionLocal()
    try:
        try:
            data = void_schema.load(request.get_json(silent=True) or {})
        except ValidationError as err:
            return validation_error_response(err)

        row = _joined_query(db).filter(LabelSlip.id == slip_id).first()
        if not row:
            return jsonify({"detail": "贴标单不存在", "slipId": slip_id}), 404
        slip, flush_no, room_code = row
        if slip.voided_at is not None:
            return jsonify({"detail": "贴标单已作废", "slipId": slip.id}), 409

        slip.voided_at = datetime.now(timezone.utc)
        slip.void_reason = data["reason"].strip()
        db.commit()
        db.refresh(slip)
        return jsonify(_dump(slip, flush_no, room_code))
    finally:
        db.close()
