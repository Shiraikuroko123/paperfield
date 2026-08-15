from __future__ import annotations

import re
import urllib.parse
from typing import Any


class SchemaValidationError(ValueError):
    pass


def _type_matches(value: Any, expected: str) -> bool:
    if expected == "object":
        return isinstance(value, dict)
    if expected == "array":
        return isinstance(value, list)
    if expected == "string":
        return isinstance(value, str)
    if expected == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if expected == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if expected == "boolean":
        return isinstance(value, bool)
    if expected == "null":
        return value is None
    return False


def _resolve_ref(root: dict[str, Any], reference: str) -> dict[str, Any]:
    if not reference.startswith("#/"):
        raise SchemaValidationError(f"Unsupported schema reference: {reference}")
    current: Any = root
    for raw_part in reference[2:].split("/"):
        part = raw_part.replace("~1", "/").replace("~0", "~")
        if not isinstance(current, dict) or part not in current:
            raise SchemaValidationError(f"Unknown schema reference: {reference}")
        current = current[part]
    if not isinstance(current, dict):
        raise SchemaValidationError(f"Schema reference is not an object: {reference}")
    return current


def _matches(value: Any, schema: dict[str, Any], root: dict[str, Any]) -> bool:
    try:
        _validate(value, schema, root, "$")
        return True
    except SchemaValidationError:
        return False


def _validate(value: Any, schema: dict[str, Any], root: dict[str, Any], path: str) -> None:
    if "$ref" in schema:
        _validate(value, _resolve_ref(root, schema["$ref"]), root, path)

    expected = schema.get("type")
    if expected:
        expected_types = [expected] if isinstance(expected, str) else list(expected)
        if not any(_type_matches(value, item) for item in expected_types):
            raise SchemaValidationError(f"{path}: expected {' or '.join(expected_types)}")

    if "enum" in schema and value not in schema["enum"]:
        raise SchemaValidationError(f"{path}: value is not in the allowed enum")

    for subschema in schema.get("allOf", []):
        _validate(value, subschema, root, path)
    alternatives = schema.get("anyOf")
    if alternatives and not any(_matches(value, item, root) for item in alternatives):
        raise SchemaValidationError(f"{path}: no anyOf branch matched")
    condition = schema.get("if")
    if condition and _matches(value, condition, root) and schema.get("then"):
        _validate(value, schema["then"], root, path)

    if isinstance(value, dict):
        required = schema.get("required", [])
        missing = [key for key in required if key not in value]
        if missing:
            raise SchemaValidationError(f"{path}: missing required properties {', '.join(missing)}")
        properties = schema.get("properties", {})
        if schema.get("additionalProperties") is False:
            extras = [key for key in value if key not in properties]
            if extras:
                raise SchemaValidationError(f"{path}: unexpected properties {', '.join(extras)}")
        for key, item in value.items():
            if key in properties:
                _validate(item, properties[key], root, f"{path}.{key}")

    if isinstance(value, list):
        if len(value) < int(schema.get("minItems", 0)):
            raise SchemaValidationError(f"{path}: too few items")
        if "maxItems" in schema and len(value) > int(schema["maxItems"]):
            raise SchemaValidationError(f"{path}: too many items")
        item_schema = schema.get("items")
        if isinstance(item_schema, dict):
            for index, item in enumerate(value):
                _validate(item, item_schema, root, f"{path}[{index}]")

    if isinstance(value, str):
        if len(value) < int(schema.get("minLength", 0)):
            raise SchemaValidationError(f"{path}: string is too short")
        if "maxLength" in schema and len(value) > int(schema["maxLength"]):
            raise SchemaValidationError(f"{path}: string is too long")
        pattern = schema.get("pattern")
        if pattern and not re.search(pattern, value):
            raise SchemaValidationError(f"{path}: string does not match the required pattern")
        if schema.get("format") == "uri":
            parsed = urllib.parse.urlparse(value)
            if not parsed.scheme or not parsed.netloc:
                raise SchemaValidationError(f"{path}: invalid URI")

    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if "minimum" in schema and value < schema["minimum"]:
            raise SchemaValidationError(f"{path}: value is below minimum")
        if "maximum" in schema and value > schema["maximum"]:
            raise SchemaValidationError(f"{path}: value is above maximum")


def validate_json_schema(value: Any, schema: dict[str, Any]) -> None:
    if not isinstance(schema, dict):
        raise SchemaValidationError("Schema root must be an object")
    _validate(value, schema, schema, "$")
