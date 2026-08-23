using System;
using System.Collections.Generic;
using Autodesk.Revit.DB;

namespace BIM_Boom.Services;

/// <summary>
/// A cached 3D lattice covering the entire Revit project's bounding box.
/// Generated once per session (or when the project bbox grows beyond the
/// cached extent), then each voxelize action runs a cutout against it
/// rather than regenerating a fresh lattice.
/// <para>
/// Grid points sit at <c>(index + 0.5) × pitch</c> so they stay on a
/// consistent lattice regardless of which element is being cut out.
/// </para>
/// </summary>
public sealed class ProjectGridCache
{
    /// <summary>All grid point positions, in Revit feet.</summary>
    public (double X, double Y, double Z)[] Points { get; private set; } = [];

    /// <summary>Grid cell indices for each point (parallel to <see cref="Points"/>).</summary>
    public (int I, int J, int K)[] Indices { get; private set; } = [];

    /// <summary>XY cell pitch used when this grid was built.</summary>
    public double CellSizeXY { get; private set; }

    /// <summary>Z cell pitch used when this grid was built.</summary>
    public double LayerHeight { get; private set; }

    /// <summary>Cached project bounding box min.</summary>
    public (double X, double Y, double Z) BBoxMin { get; private set; }

    /// <summary>Cached project bounding box max.</summary>
    public (double X, double Y, double Z) BBoxMax { get; private set; }

    public int PointCount => Points.Length;

    /// <summary>
    /// Build (or rebuild) the whole-project lattice from the document's
    /// bounding box. Must be called on the Revit API thread.
    /// </summary>
    /// <param name="doc">Active document — read-only geometry access.</param>
    /// <param name="cellSizeXY">XY spacing in feet.</param>
    /// <param name="layerHeight">Z spacing in feet.</param>
    /// <returns>
    /// True if a new grid was built; false if the cached grid already covers
    /// the project at the requested pitch.
    /// </returns>
    public bool EnsureGrid(Document doc, double cellSizeXY, double layerHeight)
    {
        var (pMin, pMax) = ComputeProjectBBox(doc);

        // Reuse the cache if pitches match and the bbox hasn't grown.
        if (Points.Length > 0
            && Math.Abs(CellSizeXY - cellSizeXY) < 1e-9
            && Math.Abs(LayerHeight - layerHeight) < 1e-9
            && pMin.X >= BBoxMin.X && pMin.Y >= BBoxMin.Y && pMin.Z >= BBoxMin.Z
            && pMax.X <= BBoxMax.X && pMax.Y <= BBoxMax.Y && pMax.Z <= BBoxMax.Z)
        {
            return false;
        }

        BuildGrid(pMin, pMax, cellSizeXY, layerHeight);
        return true;
    }

    /// <summary>
    /// Fast bbox pre-filter: returns the indices into <see cref="Points"/>
    /// whose coordinates fall inside the given bounding box padded by
    /// <paramref name="padding"/>.
    /// </summary>
    public List<int> PreFilterByBBox(
        (double X, double Y, double Z) selMin,
        (double X, double Y, double Z) selMax,
        double padding)
    {
        double xLo = selMin.X - padding, xHi = selMax.X + padding;
        double yLo = selMin.Y - padding, yHi = selMax.Y + padding;
        double zLo = selMin.Z - padding, zHi = selMax.Z + padding;

        var result = new List<int>();
        for (int idx = 0; idx < Points.Length; idx++)
        {
            var p = Points[idx];
            if (p.X >= xLo && p.X <= xHi
                && p.Y >= yLo && p.Y <= yHi
                && p.Z >= zLo && p.Z <= zHi)
            {
                result.Add(idx);
            }
        }
        return result;
    }

    /// <summary>Force a rebuild on the next <see cref="EnsureGrid"/> call.</summary>
    public void Invalidate()
    {
        Points = [];
        Indices = [];
    }

    // ---------------------------------------------------------------

    private void BuildGrid(
        (double X, double Y, double Z) pMin,
        (double X, double Y, double Z) pMax,
        double cellXY, double cellZ)
    {
        // Pad by one cell so edge elements can still register.
        double minX = pMin.X - cellXY;
        double minY = pMin.Y - cellXY;
        double minZ = pMin.Z - cellZ;
        double maxX = pMax.X + cellXY;
        double maxY = pMax.Y + cellXY;
        double maxZ = pMax.Z + cellZ;

        int iCount = Math.Max(1, (int)Math.Ceiling((maxX - minX) / cellXY));
        int jCount = Math.Max(1, (int)Math.Ceiling((maxY - minY) / cellXY));
        int kCount = Math.Max(1, (int)Math.Ceiling((maxZ - minZ) / cellZ));

        // Use index-based coordinates so the lattice is globally consistent:
        // the origin of index (0,0,0) is always world (0.5*pitch, 0.5*pitch, 0.5*pitch).
        int iMin = (int)Math.Floor(minX / cellXY);
        int iMax = (int)Math.Ceiling(maxX / cellXY);
        int jMin = (int)Math.Floor(minY / cellXY);
        int jMax = (int)Math.Ceiling(maxY / cellXY);
        int kMin = (int)Math.Floor(minZ / cellZ);
        int kMax = (int)Math.Ceiling(maxZ / cellZ);

        long total = (long)(iMax - iMin) * (jMax - jMin) * (kMax - kMin);

        // Safety cap — 10 million points ≈ 240 MB for the two arrays.
        const long MaxPoints = 10_000_000;
        if (total > MaxPoints)
        {
            // Scale down uniformly.
            double scale = Math.Cbrt((double)MaxPoints / total);
            int newI = Math.Max(1, (int)((iMax - iMin) * scale));
            int newJ = Math.Max(1, (int)((jMax - jMin) * scale));
            int newK = Math.Max(1, (int)((kMax - kMin) * scale));
            iMax = iMin + newI;
            jMax = jMin + newJ;
            kMax = kMin + newK;
            total = (long)(iMax - iMin) * (jMax - jMin) * (kMax - kMin);
        }

        var points = new (double, double, double)[total];
        var indices = new (int, int, int)[total];
        int idx = 0;

        for (int i = iMin; i < iMax; i++)
        {
            double x = (i + 0.5) * cellXY;
            for (int j = jMin; j < jMax; j++)
            {
                double y = (j + 0.5) * cellXY;
                for (int k = kMin; k < kMax; k++)
                {
                    double z = (k + 0.5) * cellZ;
                    points[idx] = (x, y, z);
                    indices[idx] = (i, j, k);
                    idx++;
                }
            }
        }

        Points = points;
        Indices = indices;
        CellSizeXY = cellXY;
        LayerHeight = cellZ;
        BBoxMin = (iMin * cellXY, jMin * cellXY, kMin * cellZ);
        BBoxMax = (iMax * cellXY, jMax * cellXY, kMax * cellZ);
    }

    private static ((double X, double Y, double Z), (double X, double Y, double Z))
        ComputeProjectBBox(Document doc)
    {
        double minX = double.MaxValue, minY = double.MaxValue, minZ = double.MaxValue;
        double maxX = double.MinValue, maxY = double.MinValue, maxZ = double.MinValue;

        // Use a FilteredElementCollector for all 3D elements with bounding boxes.
        var collector = new FilteredElementCollector(doc)
            .WhereElementIsNotElementType()
            .WherePasses(new ElementMulticategoryFilter(Models.GameLayers.AllCategories()));

        foreach (var element in collector)
        {
            var bb = element.get_BoundingBox(null);
            if (bb == null) continue;

            if (bb.Min.X < minX) minX = bb.Min.X;
            if (bb.Min.Y < minY) minY = bb.Min.Y;
            if (bb.Min.Z < minZ) minZ = bb.Min.Z;
            if (bb.Max.X > maxX) maxX = bb.Max.X;
            if (bb.Max.Y > maxY) maxY = bb.Max.Y;
            if (bb.Max.Z > maxZ) maxZ = bb.Max.Z;
        }

        if (minX > maxX)
        {
            // No elements found — return a 1×1×1 box at the origin.
            return ((0, 0, 0), (1, 1, 1));
        }

        return ((minX, minY, minZ), (maxX, maxY, maxZ));
    }
}
