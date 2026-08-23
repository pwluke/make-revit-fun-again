using System;
using System.Collections.Generic;
using BIM_Boom.Models;

namespace BIM_Boom.Services;

/// <summary>
/// Voxelization algorithm (Stage C) — reproduces the logic from voxelize-definition-logic.md:
/// 1. Bounding box → base face (closest normal to +Z)
/// 2. Grid resolution: edge_length / cell_size
/// 3. 3D lattice stacked along +Z
/// 4. Distance test: nearest point on mesh surface
/// 5. Threshold dispatch: keep points within threshold, assign nearest triangle color
/// 
/// All coordinates in Revit internal units (feet).
/// </summary>
public static class VoxelizationService
{
    public record VoxelParams(
        double CellSize = 1.0,
        double DistanceThreshold = 0.5,
        int MaxVoxels = 30000);

    /// <summary>
    /// Voxelizes the merged mesh using a regular 3D grid and distance-based shell extraction.
    /// </summary>
    public static List<VoxelData> Voxelize(MergedMesh mesh, VoxelParams parameters)
    {
        if (mesh.Vertices.Count < 3)
            return [];

        var cellSize = parameters.CellSize;
        var threshold = parameters.DistanceThreshold;

        // Stage 1: Bounding box (already computed in mesh)
        var (minX, minY, minZ) = mesh.BBoxMin;
        var (maxX, maxY, maxZ) = mesh.BBoxMax;

        // Add half-cell padding so edge voxels can still register
        minX -= cellSize;
        minY -= cellSize;
        minZ -= cellSize;
        maxX += cellSize;
        maxY += cellSize;
        maxZ += cellSize;

        // Stage 2: Grid resolution
        int uCount = Math.Max(1, (int)Math.Ceiling((maxX - minX) / cellSize));
        int vCount = Math.Max(1, (int)Math.Ceiling((maxY - minY) / cellSize));
        int wCount = Math.Max(1, (int)Math.Ceiling((maxZ - minZ) / cellSize));

        // Cap total candidate points
        long totalCandidates = (long)uCount * vCount * wCount;
        if (totalCandidates > parameters.MaxVoxels * 10L)
        {
            // Scale down to avoid excessive computation
            double scale = Math.Cbrt((double)(parameters.MaxVoxels * 10L) / totalCandidates);
            uCount = Math.Max(1, (int)(uCount * scale));
            vCount = Math.Max(1, (int)(vCount * scale));
            wCount = Math.Max(1, (int)(wCount * scale));
        }

        // Build a spatial lookup for mesh surface points (sample triangle centroids + vertices)
        var surfacePoints = BuildSurfacePoints(mesh);

        // Stage 3 + 4 + 5: Iterate lattice, distance test, threshold dispatch
        var voxels = new List<VoxelData>();

        for (int i = 0; i < uCount && voxels.Count < parameters.MaxVoxels; i++)
        {
            double x = minX + (i + 0.5) * cellSize;
            for (int j = 0; j < vCount && voxels.Count < parameters.MaxVoxels; j++)
            {
                double y = minY + (j + 0.5) * cellSize;
                for (int k = 0; k < wCount && voxels.Count < parameters.MaxVoxels; k++)
                {
                    double z = minZ + (k + 0.5) * cellSize;

                    // Find nearest surface point and its triangle index
                    var (dist, triIndex) = FindNearestDistance(x, y, z, surfacePoints);

                    if (dist <= threshold)
                    {
                        var color = triIndex >= 0 && triIndex < mesh.TriangleColors.Count
                            ? mesh.TriangleColors[triIndex]
                            : (R: (byte)160, G: (byte)160, B: (byte)160, A: (byte)255);

                        voxels.Add(new VoxelData(x, y, z, color.R, color.G, color.B, color.A, cellSize));
                    }
                }
            }
        }

        return voxels;
    }

    /// <summary>
    /// Checks if the smallest bounding box dimension is less than 2x cell size
    /// (thin members may not register voxels).
    /// </summary>
    public static bool HasThinMemberWarning(MergedMesh mesh, double cellSize)
    {
        var dx = mesh.BBoxMax.X - mesh.BBoxMin.X;
        var dy = mesh.BBoxMax.Y - mesh.BBoxMin.Y;
        var dz = mesh.BBoxMax.Z - mesh.BBoxMin.Z;
        var minDim = Math.Min(dx, Math.Min(dy, dz));
        return minDim < 2.0 * cellSize;
    }

    private record struct SurfacePoint(double X, double Y, double Z, int TriangleIndex);

    private static List<SurfacePoint> BuildSurfacePoints(MergedMesh mesh)
    {
        var points = new List<SurfacePoint>();
        int triCount = mesh.Vertices.Count / 3;

        for (int t = 0; t < triCount; t++)
        {
            var v0 = mesh.Vertices[t * 3];
            var v1 = mesh.Vertices[t * 3 + 1];
            var v2 = mesh.Vertices[t * 3 + 2];

            // Add vertices
            points.Add(new SurfacePoint(v0.X, v0.Y, v0.Z, t));
            points.Add(new SurfacePoint(v1.X, v1.Y, v1.Z, t));
            points.Add(new SurfacePoint(v2.X, v2.Y, v2.Z, t));

            // Add centroid for better coverage
            points.Add(new SurfacePoint(
                (v0.X + v1.X + v2.X) / 3.0,
                (v0.Y + v1.Y + v2.Y) / 3.0,
                (v0.Z + v1.Z + v2.Z) / 3.0,
                t));
        }

        return points;
    }

    private static (double Distance, int TriangleIndex) FindNearestDistance(
        double x, double y, double z, List<SurfacePoint> surfacePoints)
    {
        double minDist = double.MaxValue;
        int nearestTri = -1;

        // Brute force nearest neighbor (for large meshes, a KD-tree would be better)
        foreach (var sp in surfacePoints)
        {
            double dx = x - sp.X;
            double dy = y - sp.Y;
            double dz = z - sp.Z;
            double dist = Math.Sqrt(dx * dx + dy * dy + dz * dz);

            if (dist < minDist)
            {
                minDist = dist;
                nearestTri = sp.TriangleIndex;
            }
        }

        return (minDist, nearestTri);
    }
}
