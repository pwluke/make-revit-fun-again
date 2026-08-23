using System.Collections.Generic;

namespace BIM_Boom.Models;

/// <summary>
/// A merged triangle mesh with per-triangle color, produced by IFC parsing.
/// All coordinates are in the IFC file's native units (typically meters),
/// converted to Revit internal units (feet) during parsing.
/// </summary>
public class MergedMesh
{
    /// <summary>Triangle vertices: every 3 consecutive XYZ tuples form one triangle.</summary>
    public List<(double X, double Y, double Z)> Vertices { get; set; } = [];

    /// <summary>Per-triangle RGBA color (one entry per triangle, i.e. Vertices.Count / 3 entries).</summary>
    public List<(byte R, byte G, byte B, byte A)> TriangleColors { get; set; } = [];

    /// <summary>Axis-aligned bounding box min corner.</summary>
    public (double X, double Y, double Z) BBoxMin { get; set; }

    /// <summary>Axis-aligned bounding box max corner.</summary>
    public (double X, double Y, double Z) BBoxMax { get; set; }
}
