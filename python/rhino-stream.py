#! python3
"""
InstantDB Admin HTTP API - Rhino Selection Streamer
A Rhino Python 3 script that meshes the current selection and pushes it to
InstantDB over the Admin HTTP API, for a react-three-fiber app to render.
"""

import base64
import struct
import time
import uuid

import Rhino
import Eto.Forms as forms
import Eto.Drawing as drawing
import System
import System.Net
import System.IO
import System.Text
import json
from System.Net import WebRequest
from System.IO import StreamReader
from System.Text import Encoding

SYNC_INTERVAL = 0.35  # min seconds between auto-sync pushes while idle-polling

# ============================================================================
# InstantDB Admin HTTP API Client
# ============================================================================

class InstantDBClient:
    """Client for InstantDB Admin HTTP API"""

    BASE_URL = "https://api.instantdb.com"

    def __init__(self, app_id, admin_token):
        self.app_id = app_id
        self.admin_token = admin_token

    def _make_request(self, method, endpoint, data=None, params=None):
        """Make HTTP request to InstantDB API"""
        url = self.BASE_URL + endpoint

        if params:
            query_parts = []
            for key, value in params.items():
                query_parts.append("{}={}".format(key, System.Uri.EscapeDataString(str(value))))
            url += "?" + "&".join(query_parts)

        try:
            request = WebRequest.Create(url)
            request.Method = method
            request.ContentType = "application/json"
            request.Headers.Add("Authorization", "Bearer " + self.admin_token)
            request.Headers.Add("App-Id", self.app_id)
            request.Timeout = 30000  # 30 seconds

            if data and method in ["POST", "PUT"]:
                json_data = json.dumps(data)
                byte_array = Encoding.UTF8.GetBytes(json_data)
                request.ContentLength = len(byte_array)
                stream = request.GetRequestStream()
                stream.Write(byte_array, 0, len(byte_array))
                stream.Close()

            response = request.GetResponse()
            reader = StreamReader(response.GetResponseStream())
            result = reader.ReadToEnd()
            reader.Close()
            response.Close()

            return json.loads(result) if result else {}

        except System.Net.WebException as e:
            if e.Response:
                reader = StreamReader(e.Response.GetResponseStream())
                error_text = reader.ReadToEnd()
                reader.Close()
                raise Exception("API Error: " + error_text)
            raise Exception("Network Error: " + str(e.Message))

    # ========================================================================
    # Query & Transaction Methods
    # ========================================================================

    def query(self, query_obj, rule_params=None):
        """Execute a query against the database"""
        data = {"query": query_obj}
        if rule_params:
            data["$$ruleParams"] = rule_params
        return self._make_request("POST", "/admin/query", data)

    def transact(self, steps):
        """Execute a transaction with steps"""
        data = {"steps": steps}
        return self._make_request("POST", "/admin/transact", data)

    # ========================================================================
    # Mesh streaming helpers
    # ========================================================================

    def get_meshes(self):
        """Get all streamed mesh rows"""
        result = self.query({"meshes": {}})
        return result.get("meshes", [])

    def push_meshes(self, ops):
        """Apply a batch of ("update", row_id, payload) / ("delete", row_id, None) ops"""
        steps = []
        for kind, row_id, payload in ops:
            if kind == "update":
                steps.append(["update", "meshes", row_id, payload])
            else:
                steps.append(["delete", "meshes", row_id])
        for i in range(0, len(steps), 100):
            self.transact(steps[i:i + 100])

    def delete_mesh(self, row_id):
        """Delete a single mesh row"""
        return self.transact([["delete", "meshes", row_id]])

    def clear_meshes(self):
        """Delete every streamed mesh row"""
        rows = self.get_meshes()
        steps = [["delete", "meshes", row["id"]] for row in rows]
        for i in range(0, len(steps), 100):
            self.transact(steps[i:i + 100])

    # ========================================================================
    # User Management Methods
    # ========================================================================

    def get_user(self, email=None, user_id=None, refresh_token=None):
        """Retrieve a user by email, id, or refresh_token"""
        params = {}
        if email:
            params["email"] = email
        elif user_id:
            params["id"] = user_id
        elif refresh_token:
            params["refresh_token"] = refresh_token
        return self._make_request("GET", "/admin/users", params=params)

    def delete_user(self, email=None, user_id=None, refresh_token=None):
        """Delete a user by email, id, or refresh_token"""
        params = {}
        if email:
            params["email"] = email
        elif user_id:
            params["id"] = user_id
        elif refresh_token:
            params["refresh_token"] = refresh_token
        return self._make_request("DELETE", "/admin/users", params=params)

    def sign_out_user(self, email=None, user_id=None, refresh_token=None):
        """Sign out a user"""
        data = {}
        if email:
            data["email"] = email
        elif user_id:
            data["id"] = user_id
        elif refresh_token:
            data["refresh_token"] = refresh_token
        return self._make_request("POST", "/admin/sign_out", data)

    def create_refresh_token(self, email=None, user_id=None):
        """Create a refresh token for custom auth"""
        data = {}
        if email:
            data["email"] = email
        elif user_id:
            data["id"] = user_id
        return self._make_request("POST", "/admin/refresh_tokens", data)

    # ========================================================================
    # Magic Code Methods
    # ========================================================================

    def create_magic_code(self, email):
        """Create a magic code (use your own email provider)"""
        return self._make_request("POST", "/admin/magic_code", {"email": email})

    def send_magic_code(self, email):
        """Send a magic code using Instant's email provider"""
        return self._make_request("POST", "/admin/send_magic_code", {"email": email})

    def verify_magic_code(self, email, code):
        """Verify a magic code"""
        return self._make_request("POST", "/admin/verify_magic_code", {"email": email, "code": code})

    # ========================================================================
    # Presence Methods
    # ========================================================================

    def get_room_presence(self, room_type, room_id):
        """Get presence data for a room"""
        params = {"room-type": room_type, "room-id": room_id}
        return self._make_request("GET", "/admin/rooms/presence", params=params)

    # ========================================================================
    # Storage Methods
    # ========================================================================

    def upload_file(self, path, content, content_type="application/octet-stream"):
        """Upload a file to storage"""
        url = self.BASE_URL + "/admin/storage/upload"

        request = WebRequest.Create(url)
        request.Method = "PUT"
        request.ContentType = content_type
        request.Headers.Add("Authorization", "Bearer " + self.admin_token)
        request.Headers.Add("App-Id", self.app_id)
        request.Headers.Add("Path", path)

        if isinstance(content, str):
            byte_array = Encoding.UTF8.GetBytes(content)
        else:
            byte_array = content

        request.ContentLength = len(byte_array)
        stream = request.GetRequestStream()
        stream.Write(byte_array, 0, len(byte_array))
        stream.Close()

        response = request.GetResponse()
        reader = StreamReader(response.GetResponseStream())
        result = reader.ReadToEnd()
        reader.Close()
        response.Close()

        return json.loads(result) if result else {}

    def delete_file(self, filename):
        """Delete a file from storage"""
        params = {"filename": filename}
        return self._make_request("DELETE", "/admin/storage/files", params=params)

    def delete_files(self, filenames):
        """Delete multiple files from storage"""
        return self._make_request("POST", "/admin/storage/files/delete", {"filenames": filenames})

    def list_files(self):
        """List all files in storage"""
        return self.query({"$files": {}})


# ============================================================================
# Geometry -> mesh buffers
# ============================================================================

def _to_three(x, y, z):
    # Rhino is Z-up / right-handed; three.js (r3f) is Y-up. This rotates
    # -90 degrees about X so meshes land right-side-up on the frontend.
    return x, z, -y


def _pack_floats(values):
    if not values:
        return ""
    return base64.b64encode(struct.pack("<%df" % len(values), *values)).decode("ascii")


def _pack_uints(values):
    if not values:
        return ""
    return base64.b64encode(struct.pack("<%dI" % len(values), *values)).decode("ascii")


def _object_color_hex(rhino_object, doc):
    color = rhino_object.Attributes.ObjectColor
    if rhino_object.Attributes.ColorSource != Rhino.DocObjects.ObjectColorSource.ColorFromObject:
        color = doc.Layers[rhino_object.Attributes.LayerIndex].Color
    return "#%02x%02x%02x" % (color.R, color.G, color.B)


def mesh_data_for(rhino_object):
    """Flat vertex/normal/index buffers for one Rhino object, or None if it
    can't be meshed (curves, points, text, annotations, ...)."""
    meshes = rhino_object.GetMeshes(Rhino.Geometry.MeshType.Render)
    if not meshes:
        return None

    combined = Rhino.Geometry.Mesh()
    for m in meshes:
        combined.Append(m)
    if combined.Vertices.Count == 0:
        return None

    combined.Faces.ConvertQuadsToTriangles()
    combined.Normals.ComputeNormals()

    verts = []
    norms = []
    vertex_count = combined.Vertices.Count
    normal_count = combined.Normals.Count
    for i in range(vertex_count):
        v = combined.Vertices[i]
        vx, vy, vz = _to_three(v.X, v.Y, v.Z)
        verts.extend((vx, vy, vz))
        if i < normal_count:
            n = combined.Normals[i]
            nx, ny, nz = _to_three(n.X, n.Y, n.Z)
        else:
            nx, ny, nz = 0.0, 1.0, 0.0
        norms.extend((nx, ny, nz))

    faces = []
    for i in range(combined.Faces.Count):
        f = combined.Faces[i]
        faces.extend((f.A, f.B, f.C))

    return {
        "vertexCount": vertex_count,
        "faceCount": combined.Faces.Count,
        "verticesB64": _pack_floats(verts),
        "normalsB64": _pack_floats(norms),
        "facesB64": _pack_uints(faces),
    }


# ============================================================================
# Login Dialog
# ============================================================================

class LoginDialog(forms.Dialog):
    """Dialog for entering App ID and Admin Token"""

    def __init__(self):
        # Initialize the base Eto Dialog class first
        super(LoginDialog, self).__init__()

        self.Title = "InstantDB Login"
        self.ClientSize = drawing.Size(450, 220)
        self.Padding = drawing.Padding(20)
        self.Resizable = False

        self.app_id = ""
        self.admin_token = ""
        self.dialog_result = False  # Custom result property

        # Create layout
        layout = forms.DynamicLayout()
        layout.Spacing = drawing.Size(10, 10)
        layout.DefaultSpacing = drawing.Size(5, 5)

        # Title
        title_label = forms.Label()
        title_label.Text = "Rhino -> InstantDB Stream"
        title_label.Font = drawing.Font(drawing.SystemFont.Bold, 16)
        layout.AddRow(title_label)
        layout.AddRow(None)  # Spacer

        # App ID
        app_id_label = forms.Label()
        app_id_label.Text = "App ID:"
        layout.AddRow(app_id_label)
        self.app_id_input = forms.TextBox()
        self.app_id_input.PlaceholderText = "Enter your InstantDB App ID"
        layout.AddRow(self.app_id_input)

        # Admin Token
        token_label = forms.Label()
        token_label.Text = "Admin Token:"
        layout.AddRow(token_label)
        self.token_input = forms.PasswordBox()
        layout.AddRow(self.token_input)

        layout.AddRow(None)  # Spacer

        # Buttons
        connect_button = forms.Button()
        connect_button.Text = "Connect"
        connect_button.Click += self.on_connect

        cancel_button = forms.Button()
        cancel_button.Text = "Cancel"
        cancel_button.Click += self.on_cancel

        button_layout = forms.DynamicLayout()
        button_layout.AddRow(None, cancel_button, connect_button)
        layout.AddRow(button_layout)

        self.Content = layout
        self.DefaultButton = connect_button
        self.AbortButton = cancel_button

    def on_connect(self, sender, e):
        self.app_id = self.app_id_input.Text.strip()
        self.admin_token = self.token_input.Text.strip()

        if not self.app_id or not self.admin_token:
            forms.MessageBox.Show(self, "Please enter both App ID and Admin Token", "Validation Error")
            return

        self.dialog_result = True
        self.Close()

    def on_cancel(self, sender, e):
        self.dialog_result = False
        self.Close()


# ============================================================================
# Main Streamer Window
# ============================================================================

class StreamApp(forms.Form):
    """Streams the current Rhino selection to InstantDB as meshes"""

    def __init__(self):
        # Deliberately takes no extra arguments - passing args through a
        # .NET-subclassed constructor breaks Eto's handler construction
        # (see initialize()).
        super(StreamApp, self).__init__()

    def initialize(self, client):
        """Finish setting up the form. Call this right after construction
        instead of passing arguments to __init__ - Eto's Form subclassing
        resolves its native handler before __init__ runs, so extra
        constructor args cause "expected IHandler, got instance" errors."""
        self.client = client
        self.streamed = {}       # rhino guid (str) -> {"row_id", "name", "signature"}
        self.auto_sync = False
        self.dirty = True
        self.last_sync = 0.0

        self.Title = "Rhino Mesh Stream"
        self.ClientSize = drawing.Size(480, 520)
        self.Padding = drawing.Padding(20)
        self.MinimumSize = drawing.Size(380, 400)

        self._setup_ui()
        self._set_status("Idle", drawing.Colors.Gray)

    def _setup_ui(self):
        """Setup the user interface"""
        main_layout = forms.DynamicLayout()
        main_layout.Spacing = drawing.Size(10, 10)

        # Header
        header_layout = forms.DynamicLayout()
        header_layout.Spacing = drawing.Size(10, 0)

        title = forms.Label()
        title.Text = "RHINO STREAM"
        title.Font = drawing.Font(drawing.SystemFont.Bold, 24)

        self.status_label = forms.Label()

        header_layout.AddRow(title, None, self.status_label)
        main_layout.AddRow(header_layout)
        main_layout.AddRow(None)  # Spacer

        info_label = forms.Label()
        info_label.Text = "Select objects in Rhino, then push them or turn on auto-sync."
        main_layout.AddRow(info_label)
        main_layout.AddRow(None)  # Spacer

        # Action buttons
        push_btn = forms.Button()
        push_btn.Text = "PUSH SELECTION NOW"
        push_btn.Click += self.on_push_now

        self.auto_sync_btn = forms.Button()
        self.auto_sync_btn.Text = "START AUTO-SYNC"
        self.auto_sync_btn.Click += self.on_toggle_auto_sync

        clear_btn = forms.Button()
        clear_btn.Text = "CLEAR ALL"
        clear_btn.Click += self.on_clear_all

        action_layout = forms.DynamicLayout()
        action_layout.Spacing = drawing.Size(10, 0)
        action_layout.AddRow(push_btn, self.auto_sync_btn, clear_btn, None)
        main_layout.AddRow(action_layout)
        main_layout.AddRow(None)  # Spacer

        # Streamed objects list
        self.list_panel = forms.Scrollable()
        self.list_panel.Border = forms.BorderType.Line
        self.list_panel.BackgroundColor = drawing.Colors.White
        self.list_layout = forms.DynamicLayout()
        self.list_layout.Padding = drawing.Padding(5)
        self.list_layout.Spacing = drawing.Size(0, 2)
        self.list_panel.Content = self.list_layout

        list_table = forms.TableLayout()
        list_row = forms.TableRow()
        list_row.Cells.Add(forms.TableCell(self.list_panel, True))
        list_row.ScaleHeight = True
        list_table.Rows.Add(list_row)
        main_layout.AddRow(list_table)

        self.Content = main_layout
        self.Closing += self.on_closing
        self._refresh_list_ui()

    # ========================================================================
    # Sync
    # ========================================================================

    def _sync_now(self):
        doc = Rhino.RhinoDoc.ActiveDoc
        if doc is None:
            return

        selected = list(doc.Objects.GetSelectedObjects(False, False))
        selected_guids = set(str(o.Id) for o in selected)

        ops = []

        # Drop rows for anything that's no longer selected.
        for guid_str in list(self.streamed.keys()):
            if guid_str not in selected_guids:
                entry = self.streamed.pop(guid_str)
                ops.append(("delete", entry["row_id"], None))

        # Push (or refresh) whatever's currently selected.
        for obj in selected:
            guid_str = str(obj.Id)
            data = mesh_data_for(obj)
            if data is None:
                continue

            signature = (data["verticesB64"], data["facesB64"])
            existing = self.streamed.get(guid_str)
            if existing and existing["signature"] == signature:
                continue

            payload = dict(data)
            payload["guid"] = guid_str
            payload["name"] = obj.Name or ""
            payload["layer"] = doc.Layers[obj.Attributes.LayerIndex].FullPath
            payload["color"] = _object_color_hex(obj, doc)
            payload["visible"] = True
            payload["updatedAt"] = time.time() * 1000

            row_id = existing["row_id"] if existing else str(uuid.uuid4())
            self.streamed[guid_str] = {
                "row_id": row_id,
                "name": payload["name"] or guid_str[:8],
                "signature": signature,
            }
            ops.append(("update", row_id, payload))

        if ops:
            try:
                self.client.push_meshes(ops)
            except Exception as exc:
                self._set_status("Error: " + str(exc), drawing.Color.FromArgb(200, 0, 0))
                print("InstantDB push failed: " + str(exc))
                return

        self.dirty = False
        self.last_sync = time.time()
        self._refresh_list_ui()

        count = len(self.streamed)
        if self.auto_sync:
            self._set_status("Auto-sync ON ({0})".format(count), drawing.Color.FromArgb(0, 150, 0))
        else:
            self._set_status("Pushed {0} object(s)".format(count), drawing.Color.FromArgb(0, 150, 0))

    def _refresh_list_ui(self):
        self.list_layout.Clear()

        if not self.streamed:
            empty_label = forms.Label()
            empty_label.Text = "NOTHING STREAMED YET"
            empty_label.TextColor = drawing.Colors.Gray
            empty_label.TextAlignment = forms.TextAlignment.Center
            self.list_layout.AddRow(empty_label)
        else:
            for entry in self.streamed.values():
                label = forms.Label()
                label.Text = entry["name"]
                self.list_layout.AddRow(label)

        self.list_layout.AddRow(None)  # Fill remaining space

    def _set_status(self, text, color):
        self.status_label.Text = text
        self.status_label.TextColor = color

    # ========================================================================
    # Auto-sync event wiring
    # ========================================================================

    def _mark_dirty(self, sender, e):
        self.dirty = True

    def _on_delete(self, sender, e):
        guid_str = str(e.ObjectId)
        entry = self.streamed.pop(guid_str, None)
        if entry is not None:
            try:
                self.client.delete_mesh(entry["row_id"])
            except Exception as exc:
                print("InstantDB delete failed: " + str(exc))
            self._refresh_list_ui()
        self.dirty = True

    def _on_idle(self, sender, e):
        if not self.auto_sync or not self.dirty:
            return
        if time.time() - self.last_sync < SYNC_INTERVAL:
            return
        self._sync_now()

    def _start_auto_sync(self):
        Rhino.RhinoDoc.SelectObjects += self._mark_dirty
        Rhino.RhinoDoc.DeselectObjects += self._mark_dirty
        Rhino.RhinoDoc.DeselectAllObjects += self._mark_dirty
        Rhino.RhinoDoc.ReplaceRhinoObject += self._mark_dirty
        Rhino.RhinoDoc.AddRhinoObject += self._mark_dirty
        Rhino.RhinoDoc.DeleteRhinoObject += self._on_delete
        Rhino.RhinoApp.Idle += self._on_idle

        self.auto_sync = True
        self.dirty = True
        self.auto_sync_btn.Text = "STOP AUTO-SYNC"
        self._set_status("Auto-sync ON", drawing.Color.FromArgb(0, 150, 0))

    def _stop_auto_sync(self):
        try:
            Rhino.RhinoDoc.SelectObjects -= self._mark_dirty
            Rhino.RhinoDoc.DeselectObjects -= self._mark_dirty
            Rhino.RhinoDoc.DeselectAllObjects -= self._mark_dirty
            Rhino.RhinoDoc.ReplaceRhinoObject -= self._mark_dirty
            Rhino.RhinoDoc.AddRhinoObject -= self._mark_dirty
            Rhino.RhinoDoc.DeleteRhinoObject -= self._on_delete
            Rhino.RhinoApp.Idle -= self._on_idle
        except Exception:
            pass

        self.auto_sync = False
        self.auto_sync_btn.Text = "START AUTO-SYNC"
        self._set_status("Idle", drawing.Colors.Gray)

    # ========================================================================
    # Event handlers
    # ========================================================================

    def on_push_now(self, sender, e):
        try:
            self._sync_now()
        except Exception as exc:
            forms.MessageBox.Show(self, "Error pushing selection: " + str(exc), "Error")

    def on_toggle_auto_sync(self, sender, e):
        if self.auto_sync:
            self._stop_auto_sync()
        else:
            self._start_auto_sync()

    def on_clear_all(self, sender, e):
        try:
            self.client.clear_meshes()
            self.streamed.clear()
            self._refresh_list_ui()
            self._set_status("Cleared", drawing.Colors.Gray)
        except Exception as exc:
            forms.MessageBox.Show(self, "Error clearing: " + str(exc), "Error")

    def on_closing(self, sender, e):
        """Handle window closing"""
        if self.auto_sync:
            self._stop_auto_sync()


# ============================================================================
# Main Entry Point
# ============================================================================

def main():
    """Main entry point for the script"""

    # Show login dialog
    login = LoginDialog()
    login.ShowModal(Rhino.UI.RhinoEtoApp.MainWindow)

    if not login.dialog_result:
        print("Login cancelled")
        return

    # Create client and test connection
    try:
        client = InstantDBClient(login.app_id, login.admin_token)

        # Test the connection with a simple query
        client.get_meshes()

        print("Connected to InstantDB successfully!")

    except Exception as e:
        forms.MessageBox.Show(
            None,
            "Failed to connect to InstantDB:\n\n" + str(e),
            "Connection Error",
            forms.MessageBoxButtons.OK,
            forms.MessageBoxType.Error
        )
        return

    # Show main application window
    app = StreamApp()
    app.initialize(client)
    app.Show()


# Run the script
if __name__ == "__main__":
    main()
