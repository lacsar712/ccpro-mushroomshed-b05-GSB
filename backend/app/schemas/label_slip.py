from marshmallow import Schema, ValidationError, fields, validate, validates


class LabelSlipCreateSchema(Schema):
    harvest_id = fields.Int(required=True, data_key="harvestId")
    copies = fields.Int(
        load_default=1,
        validate=validate.Range(min=1, max=4, error="copies 只接受 1 至 4"),
    )
    dye = fields.Str(
        load_default="light",
        validate=validate.OneOf(["dark", "light"], error="dye 只接受 dark 或 light"),
    )


class LabelSlipVoidSchema(Schema):
    reason = fields.Str(required=True, validate=validate.Length(max=128))

    @validates("reason")
    def _reason_not_blank(self, value, **kwargs):
        if not value.strip():
            raise ValidationError("reason 不能空白")


class LabelSlipOutSchema(Schema):
    id = fields.Int(dump_only=True)
    harvest_id = fields.Int(data_key="harvestId")
    copies = fields.Int()
    dye = fields.Str()
    printed_at = fields.DateTime(data_key="printedAt")
    voided_at = fields.DateTime(data_key="voidedAt")
    void_reason = fields.Str(data_key="voidReason")
    flush_no = fields.Int(data_key="flushNo")
    room_code = fields.Str(data_key="roomCode")
