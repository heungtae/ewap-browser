#!/usr/bin/python3
"""Non-interactive Secret Service adapter. Requests and secret results use pipes only."""
import json
import re
import sys
import gi

gi.require_version("Secret", "1")
from gi.repository import Gio, GLib, Secret


class NoPromptService(Secret.Service):
    __gtype_name__ = "ContextPilotNoPromptService"

    def do_prompt_sync(self, prompt, cancellable, return_type):
        return None


def run(request):
    operation = request.get("operation")
    expected = {"operation", "profile"}
    if operation in ("read", "write"):
        expected.add("identity")
    if operation == "write":
        expected.add("value")
    if set(request) != expected or operation not in ("probe", "read", "write"):
        raise ValueError("invalid request")
    for key in ("profile", "identity"):
        if key in request and not re.fullmatch(r"[a-f0-9]{64}", request[key]):
            raise ValueError("invalid scope")
    if operation == "write" and (not isinstance(request["value"], str) or "\0" in request["value"] or len(request["value"].encode()) > 65536):
        raise ValueError("invalid value")
    bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
    owned = bus.call_sync("org.freedesktop.DBus", "/org/freedesktop/DBus", "org.freedesktop.DBus", "NameHasOwner",
                          GLib.Variant("(s)", ("org.freedesktop.secrets",)), GLib.VariantType("(b)"), Gio.DBusCallFlags.NONE, 2000, None)
    if not owned.unpack()[0]:
        raise ValueError("service unavailable")
    service = Secret.Service.open_sync(NoPromptService.__gtype__, "org.freedesktop.secrets", Secret.ServiceFlags.OPEN_SESSION, None)
    collection = Secret.Collection.for_alias_sync(service, "default", Secret.CollectionFlags.NONE, None)
    temporary = Secret.Collection.for_alias_sync(service, "session", Secret.CollectionFlags.NONE, None)
    if collection is None or temporary is None or collection.get_locked() or temporary.get_object_path() == collection.get_object_path():
        raise ValueError("persistent collection unavailable")
    if operation == "probe":
        return {"ok": True}
    schema = Secret.Schema.new("ai.contextpilot.AgentSecret.v1", Secret.SchemaFlags.NONE, {
        "application": Secret.SchemaAttributeType.STRING, "profile": Secret.SchemaAttributeType.STRING, "identity": Secret.SchemaAttributeType.STRING})
    attributes = {"application": "ai.contextpilot.agent", "profile": request["profile"], "identity": request["identity"]}
    items = [item for item in service.search_sync(schema, attributes, Secret.SearchFlags.ALL, None)
             if item.get_object_path().startswith(collection.get_object_path() + "/")]
    if len(items) > 1 or any(item.get_locked() for item in items):
        raise ValueError("ambiguous or locked item")
    if operation == "write":
        value = Secret.Value.new(request["value"], -1, "text/plain")
        Secret.Item.create_sync(collection, schema, attributes, "ContextPilot provider credential", value, Secret.ItemCreateFlags.REPLACE, None)
        return {"ok": True}
    if not items:
        return {"ok": True, "value": None}
    items[0].load_secret_sync(None)
    value = items[0].get_secret()
    if value is None or value.get_text() is None:
        raise ValueError("secret unavailable")
    return {"ok": True, "value": value.get_text()}


try:
    raw = sys.stdin.buffer.read(131073)
    if len(raw) > 131072:
        raise ValueError("request limit")
    response = run(json.loads(raw))
except Exception:
    response = {"ok": False, "code": "OS_SECRET_UNAVAILABLE"}
sys.stdout.write(json.dumps(response))
