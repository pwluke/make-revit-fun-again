#! python 3

import json
import os

import rhinoscriptsyntax as rs


def _point_coordinates(point):
    """Return a Rhino point or point object ID as an XYZ dictionary."""
    if all(hasattr(point, coordinate) for coordinate in ("X", "Y", "Z")):
        point_geometry = point
    else:
        point_geometry = rs.PointCoordinates(point)

    if point_geometry is None:
        raise ValueError("Could not read coordinates from point: {0}".format(point))

    return {
        "x": float(point_geometry.X),
        "y": float(point_geometry.Y),
        "z": float(point_geometry.Z),
    }


def points_to_json(points, filename):
    """Write Rhino points to a JSON file and return the output path."""
    output_path = filename
    if not os.path.isabs(output_path):
        output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), output_path)

    json_points = [_point_coordinates(point) for point in points]

    with open(output_path, "w", encoding="utf-8") as json_file:
        json.dump(json_points, json_file, indent=2)
        json_file.write("\n")

    return output_path


def main():
    """Prompt for Rhino point objects and export them beside this script."""
    points = rs.GetObjects(
        "Select points to export",
        filter=rs.filter.point,
        preselect=True,
    )

    if not points:
        print("Point export cancelled: no points were selected.")
        return

    try:
        output_path = points_to_json(points, "points.json")
    except (OSError, TypeError, ValueError) as error:
        print("Could not export points: {0}".format(error))
        return

    print("Exported {0} points to {1}".format(len(points), output_path))


if __name__ == "__main__":
    main()