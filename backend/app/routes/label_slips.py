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

create_schema = LabelSlipCreateSchema()
void_schema = LabelSlipVoidSchema()
out_schema = LabelSlipOutSchema()


def _dump_slip(db, slip: LabelSlip) -> dict:
    # flushNo / roomCode 必须沿 harvest 上的 room 主键取出，不能拿编号去撞第一间
    row = (
        db.query(LabelSlip, FlushHarvest.flush_no, Room.room_code)
        .join(FlushHarvest, LabelSlip.harvest_id == FlushHarvest.id)
        .join(Room, FlushHarvest.room_id == Room.id)
        .filter(LabelSlip.id == slip.id)
        .first()
    )
    data = out_schema.dump(row[0])
    data["flushNo"] = row[1]
    data["roomCode"] = row[2]
    return data


@bp.get("")
@jwt_required()
def list_label_slips():
    db = SessionLocal()
    try:
        room_id = request.args.get("roomId", type=int)
        q = (
            db.query(LabelSlip, FlushHarvest.flush_no, Room.room_code)
            .join(FlushHarvest, LabelSlip.harvest_id == FlushHarvest.id)
            .join(Room, FlushHarvest.room_id == Room.id)
        )
        if room_id is not None:
            q = q.filter(FlushHarvest.room_id == room_id)
        rows = q.order_by(LabelSlip.printed_at.desc()).all()
        result = []
        for slip, flush_no, room_code in rows:
            data = out_schema.dump(slip)
            data["flushNo"] = flush_no
            data["roomCode"] = room_code
            result.append(data)
        return jsonify(result)
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

        harvest = (
            db.query(FlushHarvest).filter(FlushHarvest.id == data["harvest_id"]).first()
        )
        if not harvest:
            return jsonify({"detail": "采收记录不存在", "harvestId": data["harvest_id"]}), 404

        if harvest.weight_kg < 0.3:
            return (
                jsonify(
                    {
                        "detail": "weightKg 低于 0.3 的潮次不允许开贴标单",
                        "harvestId": harvest.id,
                    }
                ),
                409,
            )

        # room 沿 harvest.room_id 主键取
        room = db.query(Room).filter(Room.id == harvest.room_id).first()
        if not room or room.status != "fruiting":
            return (
                jsonify(
                    {
                        "detail": "所属出菇室当前不是 fruiting，不能开贴标单",
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
                jsonify(
                    {
                        "detail": "该潮次已有未 void 的贴标单",
                        "slipId": open_slip.id,
                    }
                ),
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
        return jsonify(_dump_slip(db, slip)), 201
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

        slip = db.query(LabelSlip).filter(LabelSlip.id == slip_id).first()
        if not slip:
            return jsonify({"detail": "贴标单不存在"}), 404
        if slip.voided_at is not None:
            return jsonify({"detail": "贴标单已 void", "slipId": slip.id}), 409

        slip.voided_at = datetime.now(timezone.utc)
        slip.void_reason = data["reason"].strip()
        db.commit()
        db.refresh(slip)
        return jsonify(_dump_slip(db, slip))
    finally:
        db.close()
