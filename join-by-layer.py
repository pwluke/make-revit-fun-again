#! python 3

# Make a Rhino script using rhinoscriptsyntax to join visible meshes by layer.
import rhinoscriptsyntax as rs

def join_by_layer():
    # Get all layers in the document
    layers = rs.LayerNames()
    
    if not layers:
        print("No layers found in the document.")
        return
    
    for layer in layers:
        # Get all objects on the current layer, then exclude hidden objects and
        # non-mesh geometry (such as block instances).
        objects = rs.ObjectsByLayer(layer)

        if not objects:
            print(f"No objects found on layer '{layer}'.")
            continue

        visible_meshes = [
            object_id
            for object_id in objects
            if rs.IsMesh(object_id) and not rs.IsObjectHidden(object_id)
        ]

        if visible_meshes:
            # Join only visible mesh objects on this layer.
            layer_color = rs.LayerColor(layer)
            joined_object = rs.JoinMeshes(visible_meshes, True)
            if joined_object:
                rs.ObjectLayer(joined_object, layer)
                rs.ObjectColor(joined_object, layer_color)
                rs.ObjectColorSource(joined_object, 1)  # 1 = color by object
                print(
                    f"Joined {len(visible_meshes)} visible mesh object(s) "
                    f"on layer '{layer}'."
                )
            else:
                print(f"Failed to join visible meshes on layer '{layer}'.")
        else:
            print(f"No visible mesh objects found on layer '{layer}'.")


join_by_layer()
            