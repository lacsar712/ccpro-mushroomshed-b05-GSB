from marshmallow import Schema, fields, validate


def _not_blank(value: str) -> None:
    if not value or not value.strip():
        raise validate.ValidationError("reason 不能空白")


class LabelSlipCreateSchema(Schema):
    harvest_id = fields.Int(required=True, data_key="harvestId")
    copies = fields.Int(
        required=True,
        validate=validate.Range(min=1, max=4, error="copies 只接受 1 至 4"),
    )
    dye = fields.Str(
        load_default="light",
        validate=validate.OneOf(["dark", "light"], error="dye 只接受 dark 与 light"),
    )


class LabelSlipVoidSchema(Schema):
    reason = fields.Str(
        required=True,
        validate=validate.And(validate.Length(min=1, max=500), _not_blank),
    )


class LabelSlipOutSchema(Schema):
    id = fields.Int(dump_only=True)
    harvest_id = fields.Int(data_key="harvestId")
    copies = fields.Int()
    dye = fields.Str()
    printed_at = fields.DateTime(data_key="printedAt")
    voided_at = fields.DateTime(data_key="voidedAt", allow_none=True)
    void_reason = fields.Str(data_key="voidReason", allow_none=True)
    flush_no = fields.Int(data_key="flushNo")
    room_code = fields.Str(data_key="roomCode")
