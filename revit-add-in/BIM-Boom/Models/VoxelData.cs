namespace BIM_Boom.Models;

/// <summary>
/// Represents a single colored voxel in 3D space.
/// Coordinates are in Revit internal units (feet).
/// </summary>
public record VoxelData(
    double X,
    double Y,
    double Z,
    byte R,
    byte G,
    byte B,
    byte A,
    double Size);
